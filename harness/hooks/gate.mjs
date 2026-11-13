#!/usr/bin/env node
// Orbit 관문(Gate). 한 스크립트, 두 모드:
//   훅:  PreToolUse 페이로드를 stdin으로 받아, 막아야 하면 exit 2 + stderr(사유)
//   CLI: node <이 파일의 경로> check [plan|review|verify|security|ship]
// 끄기(하네스 자체를 고칠 때만): ORBIT_GATE=off 로 Claude Code를 실행.
// 보장 범위: Claude Code가 이 훅을 실행해 exit 2를 받을 때만 막는다. node가 없거나 시간 초과,
// 2가 아닌 종료 코드면 Claude Code가 도구를 허용하므로 이 스크립트로는 막을 수 없다.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd()); // 플러그인은 캐시 등 다른 위치에서 돌 수 있다

export const GATES = { plan: 'PLAN_CHECK.md', review: 'REVIEW.md', verify: 'VERIFY.md', security: 'SECURITY.md' };
export const SHIP = {
  quick: ['verify'],
  standard: ['plan', 'review', 'verify'],
  full: ['plan', 'review', 'verify', 'security'],
};

const CODERS = ['orbit:engineer', 'orbit:debugger', 'orbit:librarian']; // 훅의 agent_type은 범위 이름(S1-Q1) // .orbit/ 밖을 고칠 수 있는 역할

const inside = (dir, p) => {
  const rel = relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

// 현재 run: .orbit/current(run-id 한 줄) + .orbit/runs/<id>/STATE.json({track})
export function currentRun(root = ROOT) {
  try {
    const id = readFileSync(join(root, '.orbit/current'), 'utf8').trim();
    if (!/^[\w.-]+$/.test(id) || id.startsWith('.')) return null; // 경로 탈출 방지
    const dir = join(root, '.orbit/runs', id);
    const track = JSON.parse(readFileSync(join(dir, 'STATE.json'), 'utf8')).track;
    return SHIP[track] ? { id, dir, track } : null;
  } catch {
    return null;
  }
}

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

// Lead(메인 세션)가 직접 실행해도 되는 명령: 관문 확인, 읽기 전용 git, run 브랜치 조율.
// gate CLI는 이 파일의 실제 경로만 허용한다(아무 gate.mjs나 허용하면 .orbit/에 쓴 스크립트를 실행할 수 있다).
const SELF = fileURLToPath(import.meta.url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/(\\\\|\/)+/g, '[\\\\/]');
const LEAD_SHELL = new RegExp(`^\\s*(node ["']?${SELF}["']? check\\b|git (status|log|diff|show|branch|worktree list|switch|merge)\\b)[^;&|<>\`$]*$`);

const branchOf = (cwd) => {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'main'; // 모르면 보호 브랜치로 취급
  }
};

// 출고 = 모든 push, 그리고 main/master로 들어가는 merge. run 브랜치(orbit/<run-id>) 안의 merge는 자유.
// 한 명령 안에서 브랜치나 디렉터리를 바꾸면 지금 브랜치를 믿을 수 없으므로 보호 브랜치로 본다.
const gitSub = (name) => new RegExp(`\\bgit\\s+(-[Cc]\\s+\\S+\\s+|-\\S+\\s+)*${name}\\b`); // 옵션 뒤의 하위 명령만
function isShip(cmd, cwd) {
  if (gitSub('push').test(cmd)) return true;
  if (!gitSub('merge').test(cmd)) return false;
  return /\b(switch|checkout|cd|pushd|Set-Location)\b|\s-C\s/.test(cmd) || /^(main|master)$/.test(branchOf(cwd));
}

// 막아야 하면 사유(문자열), 아니면 null.
export function decide(p, root = ROOT) {
  const tool = p.tool_name;
  const input = p.tool_input ?? {};
  const isLead = !p.agent_id; // agent_id는 서브에이전트 안에서만 온다

  if (['Edit', 'Write', 'NotebookEdit'].includes(tool)) {
    const raw = input.file_path ?? input.notebook_path;
    if (typeof raw !== 'string') return '편집 대상 경로를 알 수 없음';
    const file = resolve(p.cwd ?? root, raw);
    // worktree 사본도 막도록 루트가 아니라 경로 모양으로 본다
    // 경로 모양으로 본다: worktree 사본, 캐시 위치, 어느 깊이의 플러그인 폴더도 포함
    if (
      /(^|[\\/])\.claude-plugin[\\/]/i.test(file) ||
      /(^|[\\/])hooks[\\/](hooks\.json|gate\.mjs|gate\.test\.mjs)$/i.test(file) ||
      /(^|[\\/])\.claude[\\/](hooks[\\/]|settings(\.local)?\.json$)/i.test(file) ||
      inside(HERE, file)
    )
      return '관문 훅·플러그인 매니페스트·settings.json은 에이전트가 수정할 수 없음 (사람이 ORBIT_GATE=off로 작업)';
    if (inside(join(root, '.orbit'), file)) return null;
    if (/[\\/]\.claude[\\/]projects[\\/][^\\/]+[\\/]memory[\\/]/i.test(file)) return null; // Claude Code 자동 메모리
    if (isLead) return 'Lead는 직접 코딩하지 않음: .orbit/ 밖의 파일은 서브에이전트(engineer 등)에게 맡길 것';
    if (!CODERS.includes(p.agent_type))
      return `${p.agent_type ?? '이 에이전트'}는 읽기 전용 역할: .orbit/ 안의 산출물만 쓸 수 있음 (코드는 ${CODERS.join('/')}만)`;
    return null;
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '');
    if (isShip(cmd, p.cwd ?? root)) {
      const fails = shipFailures(root);
      if (fails.length) return `머지/푸시 차단 — 관문 미통과: ${fails.join('; ')}`;
    }
    if (isLead && !LEAD_SHELL.test(cmd))
      return `Lead는 관문 확인(node ${fileURLToPath(import.meta.url)} check …)과 git status/log/diff/show/branch/switch/merge만 직접 실행. 나머지는 서브에이전트에게 맡길 것`;
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
  if (!gates.every((g) => GATES[g])) return console.error(`모르는 관문: ${what}`), 64;
  let code = 0;
  for (const g of gates) {
    const why = gateFailure(run.dir, g);
    console.log(why ? `FAIL ${g}: ${why}` : `PASS ${g}`);
    if (why) code = 1;
  }
  console.log(`run=${run.id} track=${run.track}`);
  return code;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
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
