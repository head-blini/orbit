#!/usr/bin/env node
// Orbit 관문(Gate). 한 스크립트, 두 모드:
//   훅:  PreToolUse 페이로드를 stdin으로 받아, 막아야 하면 exit 2 + stderr(사유)
//   CLI: node <이 파일의 경로> check [plan|review|verify|security|ship]
// 끄기(하네스 자체를 고칠 때만): ORBIT_GATE=off 로 Claude Code를 실행.
// 보장 범위: Claude Code가 이 훅을 실행해 exit 2를 받을 때만 막는다. node가 없거나 시간 초과,
// 2가 아닌 종료 코드면 Claude Code가 도구를 허용하므로 이 스크립트로는 막을 수 없다.
// 셸은 문자열 검사라서 완전히 가둘 수 없다: 테스트·스캐너를 돌리는 역할(FREE_SHELL)은 출고 검사만 받는다(미룸 H1).
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative, isAbsolute, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd()); // 플러그인은 캐시 등 다른 위치에서 돌 수 있다

export const GATES = { plan: 'PLAN_CHECK.md', review: 'REVIEW.md', verify: 'VERIFY.md', security: 'SECURITY.md' };
export const SHIP = {
  quick: ['verify'],
  standard: ['plan', 'review', 'verify'],
  full: ['plan', 'review', 'verify', 'security'],
};
const TRACKS = Object.keys(SHIP); // 낮은 트랙부터 높은 트랙 순(하향 판정이 이 순서에 의존)

const roleOf = (p) => (p.agent_type?.startsWith('orbit:') ? p.agent_type.slice(6) : null); // 훅의 agent_type은 범위 이름(S1-Q1)
const CODERS = ['engineer', 'debugger', 'devops']; // .orbit/ 밖의 모든 파일을 고칠 수 있는 역할
// 셸을 제한 없이 쓰는 역할. 그 밖의 역할과 모르는 에이전트는 READ_SHELL만 쓴다(H1).
const FREE_SHELL = ['engineer', 'debugger', 'librarian', 'devops', 'qa', 'security', 'reviewer-correctness', 'reviewer-tests', 'data'];
// .orbit/ 안에서 쓰기 주체가 정해진 파일(H2). 'lead'는 agent_id 없는 메인 스레드, null은 에이전트 누구도 못 씀.
const OWNERS = [
  [/^runs\/[^/]+\/PLAN_CHECK\.md$/i, 'plan-checker'], // i: NTFS는 대소문자를 구분하지 않는다
  [/^runs\/[^/]+\/VERIFY\.md$/i, 'qa'],
  [/^runs\/[^/]+\/SECURITY\.md$/i, 'security'],
  [/^runs\/[^/]+\/(REVIEW\.md|STATE\.json)$/i, 'lead'],
  [/^current$/i, 'lead'],
  [/^profile\.json$/i, 'researcher'],
  [/^team\.yaml$/i, null],
];

const inside = (dir, p) => {
  const rel = relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const posixRel = (dir, p) => relative(dir, p).split(sep).join('/');

// 존재하는 가장 깊은 조상을 실제 경로로 바꾼다(8.3 짧은 이름, 심볼릭 링크, 대소문자). 없는 꼬리는 그대로 붙인다.
function canon(p) {
  const tail = [];
  let head = p;
  while (!existsSync(head) && dirname(head) !== head) {
    tail.unshift(basename(head));
    head = dirname(head);
  }
  try {
    head = realpathSync.native(head);
  } catch {}
  return { path: join(head, ...tail), tail };
}

// 정규화할 수 없는 모양: 드라이브가 아닌 ':'(대체 스트림), 끝의 '.'·공백, 아직 없는 이름의 '~숫자'(8.3)
const odd = (resolved, tail) =>
  resolved.replace(/^[A-Za-z]:/, '').includes(':') || resolved.split(/[\\/]/).some((s) => /[. ]$/.test(s)) || tail.some((s) => /~\d/.test(s));

// 현재 run: .orbit/current(run-id 한 줄) + .orbit/runs/<id>/STATE.json({track, approvals})
export function currentRun(root = ROOT) {
  try {
    const id = readFileSync(join(root, '.orbit/current'), 'utf8').trim();
    if (!/^[\w.-]+$/.test(id) || id.startsWith('.')) return null; // 경로 탈출 방지
    const dir = join(root, '.orbit/runs', id);
    const { track, approvals } = JSON.parse(readFileSync(join(dir, 'STATE.json'), 'utf8'));
    return SHIP[track] ? { id, dir, track, approvals } : null;
  } catch {
    return null;
  }
}

// 설정 경로(CLAUDE.md, .claude/**, .mcp.json)는 full 트랙 + config 승인이 있는 run에서만 연다(H8-2). 읽을 수 없으면 닫힘.
const configApproved = (root) => {
  const run = currentRun(root);
  return run?.track === 'full' && Array.isArray(run.approvals) && run.approvals.some((a) => a?.gate === 'config' && a?.result === 'approved');
};

// 관문 통과 = 산출물의 마지막 VERDICT 줄이 PASS. verify는 증거(코드 블록)도 있어야 한다.
export function gateFailure(runDir, gate) {
  const file = join(runDir, GATES[gate]);
  if (!existsSync(file)) return `${GATES[gate]} 없음`;
  const text = readFileSync(file, 'utf8');
  const verdicts = text.match(/^VERDICT:[ \t]*(PASS|FAIL)[ \t]*$/gm);
  if (!verdicts) return `${GATES[gate]}에 "VERDICT: PASS|FAIL" 줄 없음`;
  if (!verdicts.at(-1).includes('PASS')) return `${GATES[gate]} 판정이 FAIL`;
  if (gate === 'verify' && !/^```/m.test(text)) return 'VERIFY.md에 증거(명령 실행 결과 코드 블록) 없음';
  return null;
}

export function shipFailures(root = ROOT) {
  const run = currentRun(root);
  if (!run) return ['활성 run 없음 (.orbit/current 와 STATE.json의 track 필요)'];
  return SHIP[run.track].map((g) => gateFailure(run.dir, g)).filter(Boolean);
}

// 셸 허용 모양: 줄바꿈·'('·리다이렉션·파이프·명령 치환·명령 연결 금지(H3).
// Lead는 관문 확인, 읽기 전용 git, run 브랜치 조율만. gate CLI는 이 파일의 실제 경로만 허용한다(아무 gate.mjs나 허용하면 .orbit/에 쓴 스크립트를 실행할 수 있다).
const SELF = fileURLToPath(import.meta.url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/(\\\\|\/)+/g, '[\\\\/]');
const ARGS = String.raw`[^;&|<>\`$\r\n(]*$`;
const LEAD_SHELL = new RegExp(String.raw`^\s*(node ["']?${SELF}["']? check\b|git (status|log|diff|show|branch|worktree list|switch|merge)\b)` + ARGS);
const READ_SHELL = new RegExp(String.raw`^\s*git (status|log|diff|show)\b` + ARGS);
const PLAN_CHECKER_SHELL = [new RegExp(String.raw`^\s*grep\b` + ARGS), /^\s*claude plugin validate [^\s;&|<>`$\r\n(]+\s*$/]; // 2.8-2
const WRITE_OPT = /\s(--output|--force|-[fCBD])\b/; // git이 파일을 쓰거나 브랜치를 옮기는 옵션
const shellOk = (cmd, res) => res.some((re) => re.test(cmd)) && !(/^\s*git\b/.test(cmd) && WRITE_OPT.test(cmd));

const branchOf = (cwd) => {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'main'; // 모르면 보호 브랜치로 취급
  }
};

// 출고 = 모든 push, 브랜치 강제 이동(update-ref, branch -f, switch -C, checkout -B), gh pr merge, 별칭 정의, 그리고 main/master로 들어가는 merge. run 브랜치(orbit/<run-id>) 안의 merge는 자유.
// 한 명령 안에서 브랜치나 디렉터리를 바꾸면 지금 브랜치를 믿을 수 없으므로 보호 브랜치로 본다.
const gitSub = (name) => new RegExp(`\\bgit(\\.exe)?\\s+(-[Cc]\\s+\\S+\\s+|-\\S+\\s+)*${name}\\b`); // 옵션 뒤의 하위 명령만
const FORCE_MOVE = /\bgit(\.exe)?\s+(-\S+\s+)*(branch\b[^;&|\n]*\s(-f|--force)\b|switch\b[^;&|\n]*\s-C\b|checkout\b[^;&|\n]*\s-B\b)/;
function isShip(cmd, cwd) {
  if (gitSub('push').test(cmd) || gitSub('update-ref').test(cmd) || FORCE_MOVE.test(cmd) || /\bgh(\.exe)?\s+pr\s+merge\b/.test(cmd)) return true;
  if (/\bgit(\.exe)?\b[^\n]*\balias\./.test(cmd)) return true; // 별칭으로 push를 감추는 우회
  if (!gitSub('merge').test(cmd)) return false;
  return /\b(switch|checkout|cd|pushd|Set-Location)\b|\s-C\s/.test(cmd) || /^(main|master)$/.test(branchOf(cwd));
}

// 이 쓰기가 끝난 뒤의 파일 내용. 알 수 없으면 null.
function afterWrite(tool, input, file) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : null;
  if (tool !== 'Edit' || typeof input.old_string !== 'string' || typeof input.new_string !== 'string') return null;
  try {
    const cur = readFileSync(file, 'utf8');
    if (!cur.includes(input.old_string)) return null;
    return input.replace_all ? cur.split(input.old_string).join(input.new_string) : cur.replace(input.old_string, () => input.new_string);
  } catch {
    return null;
  }
}

// STATE.json 쓰기 검사: track 하향 금지, verify 등이 실패한 채 stage "done" 금지.
function stateFailure(next, file) {
  let st;
  try {
    st = JSON.parse(next);
  } catch {
    return 'STATE.json의 새 내용을 해석할 수 없음';
  }
  const rank = TRACKS.indexOf(st?.track);
  if (rank < 0) return 'STATE.json에 올바른 track이 없음';
  if (existsSync(file)) {
    let cur = -1;
    try {
      cur = TRACKS.indexOf(JSON.parse(readFileSync(file, 'utf8')).track);
    } catch {}
    if (cur < 0) return '현재 STATE.json을 읽을 수 없음';
    if (rank < cur) return `track 하향 차단 (${TRACKS[cur]} → ${TRACKS[rank]})`;
  }
  if (st.stage === 'done') {
    const fails = SHIP[st.track].map((g) => gateFailure(dirname(file), g)).filter(Boolean);
    if (fails.length) return `stage "done" 차단 — 관문 미통과: ${fails.join('; ')}`;
  }
  return null;
}

// 막아야 하면 사유(문자열), 아니면 null.
export function decide(p, root = ROOT) {
  const tool = p.tool_name;
  const input = p.tool_input ?? {};
  const isLead = !p.agent_id; // agent_id는 서브에이전트 안에서만 온다
  const role = roleOf(p);

  if (['Edit', 'Write', 'NotebookEdit'].includes(tool)) {
    const raw = input.file_path ?? input.notebook_path;
    if (typeof raw !== 'string') return '편집 대상 경로를 알 수 없음';
    const resolved = resolve(p.cwd ?? root, raw);
    const { path: file, tail } = canon(resolved);
    if (odd(resolved, tail)) return `경로를 정규화할 수 없어 차단: ${raw}`;
    const croot = canon(resolve(root)).path;
    const orbit = join(croot, '.orbit');
    // 경로 모양으로 본다: worktree 사본, 캐시 위치, 어느 깊이의 플러그인 폴더도 포함
    if (
      /(^|[\\/])\.claude-plugin[\\/]/i.test(file) ||
      /(^|[\\/])hooks[\\/](hooks\.json|gate\.mjs|gate\.test\.mjs)$/i.test(file) ||
      /(^|[\\/])\.claude[\\/](hooks[\\/]|settings(\.local)?\.json$)/i.test(file) ||
      inside(canon(HERE).path, file)
    )
      return '관문 훅·플러그인 매니페스트·settings.json은 에이전트가 수정할 수 없음 (사람이 Claude 밖에서 고친다)';
    const mem = join(canon(homedir()).path, '.claude', 'projects');
    if (inside(mem, file) && /^[^\\/]+[\\/]memory[\\/]/i.test(relative(mem, file))) return null; // Claude Code 자동 메모리
    if (/(^|[\\/])(\.claude([\\/]|$)|CLAUDE(\.local)?\.md$|\.mcp\.json$)/i.test(file) && !configApproved(root))
      return '설정 경로(CLAUDE.md, .claude/, .mcp.json)는 full 트랙 + config 승인이 있는 run에서만 쓸 수 있음';
    if (inside(orbit, file)) {
      const rel = posixRel(orbit, file);
      const owner = OWNERS.find(([re]) => re.test(rel));
      if (owner) {
        if (owner[1] === null || (owner[1] === 'lead' ? !isLead : role !== owner[1]))
          return `.orbit/${rel}는 ${owner[1] ?? '사람'}만 쓸 수 있음`;
        if (/^runs\/[^/]+\/STATE\.json$/i.test(rel)) {
          const next = afterWrite(tool, input, file);
          return next === null ? 'STATE.json의 새 내용을 해석할 수 없음' : stateFailure(next, file);
        }
        if (/^current$/i.test(rel)) {
          const next = afterWrite(tool, input, file);
          if (next === null || !/^[\w.-]+\s*$/.test(next) || next.startsWith('.')) return '.orbit/current는 run-id 한 줄이어야 함';
        }
      }
      return null;
    }
    if (isLead) return 'Lead는 직접 코딩하지 않음: .orbit/ 밖의 파일은 서브에이전트(engineer 등)에게 맡길 것';
    if (CODERS.includes(role)) return null;
    const rel = inside(croot, file) ? posixRel(croot, file) : null;
    if (rel !== null) {
      if (role === 'librarian' && (/\.md$/i.test(rel) || /^docs\//i.test(rel) || /^CHANGELOG[^/]*$/i.test(rel))) return null;
      if (role === 'designer' && /^design\//i.test(rel)) return null;
    }
    return `${p.agent_type ?? '이 에이전트'}는 읽기 전용 역할이거나 쓰기 범위 밖: .orbit/ 안의 산출물만 쓸 수 있음 (코드는 ${CODERS.join('/')}, 문서는 librarian, design/는 designer)`;
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '');
    if (isShip(cmd, p.cwd ?? root)) {
      const fails = shipFailures(root);
      if (fails.length) return `머지/푸시 차단 — 관문 미통과: ${fails.join('; ')}`;
    }
    if (isLead && !shellOk(cmd, [LEAD_SHELL]))
      return `Lead는 관문 확인(node ${fileURLToPath(import.meta.url)} check …)과 git status/log/diff/show/branch/switch/merge만 직접 실행. 나머지는 서브에이전트에게 맡길 것`;
    if (!isLead && !FREE_SHELL.includes(role) && !shellOk(cmd, [READ_SHELL, ...(role === 'plan-checker' ? PLAN_CHECKER_SHELL : [])]))
      return `${p.agent_type ?? '이 에이전트'}의 셸은 git status/log/diff/show만 허용(READ_SHELL${role === 'plan-checker' ? ', grep, claude plugin validate' : ''}). 리다이렉션·파이프·다른 명령은 차단`;
    return null;
  }
  return null;
}

function cli(args) {
  if (args[0] !== 'check') {
    console.error('usage: gate.mjs check [plan|review|verify|security|ship]');
    return 64;
  }
  const what = args[1] ?? 'ship';
  const run = currentRun();
  if (!run) return console.log('FAIL 활성 run 없음'), 1;
  const gates = what === 'ship' ? SHIP[run.track] : [what];
  if (!gates.every((g) => Object.hasOwn(GATES, g))) return console.error(`모르는 관문: ${what}`), 64;
  let code = 0;
  for (const g of gates) {
    const why = gateFailure(run.dir, g);
    console.log(why ? `FAIL ${g}: ${why}` : `PASS ${g}`);
    if (why) code = 1;
  }
  console.log(`run=${run.id} track=${run.track}`);
  return code;
}

// PostToolUse 경고(막지 않음): design/tokens.json의 값(문자열·숫자 leaf)에 없는 hex 색·Npx를 additionalContext로 알린다. 어떤 오류도 조용히 통과.
// 색은 소문자·3자리→6자리로 맞춰 비교(4·8자리 알파는 소문자만), 크기는 문자열 정확 일치.
const tokenValues = (n, out = new Set()) => {
  if (n && typeof n === 'object') Object.values(n).forEach((v) => tokenValues(v, out));
  else if (typeof n === 'string' || typeof n === 'number') out.add(String(n));
  return out;
};
const norm = (v) => {
  v = v.toLowerCase();
  return /^#[0-9a-f]{3}$/.test(v) ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v;
};
const STYLE_FILE = /\.(css|scss|less|tsx|jsx|vue|svelte|html)$/i;
export function designWarn(p, root = ROOT) {
  const file = p.tool_input?.file_path;
  if (!['Edit', 'Write'].includes(p.tool_name) || typeof file !== 'string' || !STYLE_FILE.test(file)) return null;
  const tokens = new Set([...tokenValues(JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8')))].map(norm)); // 잘못된 tokens.json은 예외 → 조용히 통과
  const text = readFileSync(resolve(p.cwd ?? root, file), 'utf8');
  const found = new Set((text.match(/#[0-9a-f]{3,8}\b|\b\d+(\.\d+)?px\b/gi) ?? []).map(norm));
  const extra = [...found].filter((v) => !tokens.has(v));
  return extra.length ? `design/tokens.json에 없는 값이 ${file}에 하드코딩됨: ${extra.join(', ')}. 토큰을 쓰거나 designer와 토큰 추가를 협의할 것.` : null;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'design-warn') {
    try {
      const msg = designWarn(JSON.parse(readFileSync(0, 'utf8')));
      if (msg) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
    } catch {}
    process.exit(0);
  }
  if (process.argv.length > 2) process.exit(cli(process.argv.slice(2)));
  if (process.env.ORBIT_GATE === 'off') process.exit(0);
  let reason;
  try {
    reason = decide(JSON.parse(readFileSync(0, 'utf8')));
  } catch (e) {
    reason = `관문 훅이 입력을 해석하지 못함 (${e.message})`; // 관문은 닫힌 쪽으로 실패
  }
  if (reason) {
    console.error(`[orbit gate] ${reason}`);
    process.exit(2);
  }
}
