// node --test harness/hooks/gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, shipFailures } from './gate.mjs';
import { homedir } from 'node:os';
import { resolve as resolvePath } from 'node:path';
import { memorySlug } from './gate.mjs';
import { basename } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';

function project(track, files = {}, state = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orbit-gate-'));
  const run = join(root, '.orbit/runs/r1');
  mkdirSync(run, { recursive: true });
  writeFileSync(join(root, '.orbit/current'), 'r1\n');
  writeFileSync(join(run, 'STATE.json'), JSON.stringify({ track, ...state }));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(run, name), body);
  return root;
}
// cb(commit-binding): 실제 git 저장소. main(빈 커밋) → orbit/r1(빈 커밋 = 검토한 커밋 sha). VERIFY·SECURITY에는 COMMIT: sha 줄을 붙인다.
const gitIn = (root, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function shipProject(branch, track, files = {}, state) {
  const root = project(track, {}, state);
  gitIn(root, 'init', '-q', '-b', 'main');
  gitIn(root, 'commit', '-q', '--allow-empty', '-m', 'base');
  gitIn(root, 'switch', '-q', '-c', 'orbit/r1');
  gitIn(root, 'commit', '-q', '--allow-empty', '-m', 'work');
  const sha = gitIn(root, 'rev-parse', 'HEAD');
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(root, '.orbit/runs/r1', name), /^(VERIFY|SECURITY)\.md$/.test(name) ? `COMMIT: ${sha}\n${body}` : body);
  if (branch !== 'orbit/r1') gitIn(root, 'switch', '-q', branch);
  return root;
}
const GATE = fileURLToPath(new URL('./gate.mjs', import.meta.url)).replaceAll('\\', '/');
const PASS = 'ok\nVERDICT: PASS\n';
const EVIDENCE = '```\n$ npm test\n3 passed\n```\nVERDICT: PASS\n';
const bash = (command, agent_id) => ({ tool_name: 'Bash', tool_input: { command }, agent_id, agent_type: agent_id && 'orbit:engineer' });
const write = (root, file, agent_id, agent_type = agent_id && 'orbit:engineer', extra = {}) => ({ tool_name: 'Write', cwd: root, tool_input: { file_path: file, ...extra }, agent_id, agent_type });

test('ship: 트랙별 필수 관문', () => {
  assert.deepEqual(shipFailures(project('quick', { 'VERIFY.md': EVIDENCE })), []);
  assert.equal(shipFailures(project('standard', { 'VERIFY.md': EVIDENCE })).length, 2);
  const full = { 'PLAN_CHECK.md': PASS, 'REVIEW.md': PASS, 'VERIFY.md': EVIDENCE };
  assert.match(shipFailures(project('full', full))[0], /SECURITY\.md 없음/);
  assert.deepEqual(shipFailures(project('full', { ...full, 'SECURITY.md': PASS })), []);
});

test('ship: 증거 없는 VERIFY, 뒤집힌 판정, run 없음은 실패', () => {
  assert.match(shipFailures(project('quick', { 'VERIFY.md': PASS }))[0], /증거/);
  assert.match(shipFailures(project('quick', { 'VERIFY.md': EVIDENCE + 'VERDICT: FAIL\n' }))[0], /FAIL/);
  assert.match(shipFailures(mkdtempSync(join(tmpdir(), 'orbit-gate-')))[0], /활성 run 없음/);
  const escaped = project('quick', { 'VERIFY.md': EVIDENCE });
  writeFileSync(join(escaped, '.orbit/current'), '../r1');
  assert.match(shipFailures(escaped)[0], /활성 run 없음/);
});

test('머지/푸시는 관문 통과 전까지 누구에게나 차단', () => {
  const blocked = project('standard');
  assert.match(decide(bash('git push origin main', 'agent-1'), blocked), /차단/);
  assert.match(decide(bash('cd x && git merge feat', 'agent-1'), blocked), /차단/);
  const open = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(decide(bash('git merge orbit/r1', 'agent-1'), open), null); // S1: orbit/<id>가 아닌 머지는 항상 차단(Q5)
  assert.notEqual(decide(bash('git commit -m "merge notes"', 'agent-1'), blocked), null); // N2-b: main(git 아님) 위의 쓰기 git은 차단. run 브랜치의 같은 명령 ALLOW는 cb N2-b 기준15
});

test('run 브랜치 안의 merge는 허용, main으로 빠져나가는 merge·push는 차단', () => {
  const root = project('standard');
  execFileSync('git', ['init', '-q', '-b', 'orbit/r1'], { cwd: root });
  const at = (command) => decide({ ...bash(command), cwd: root }, root);
  assert.equal(at('git merge --no-ff orbit/r1/t1'), null);
  assert.match(at('git push'), /차단/);
  assert.match(at('git switch main && git merge orbit/r1'), /차단/);
  assert.match(at('git -C ../other merge orbit/r1'), /차단/);
});

test('Lead는 .orbit/ 에만 쓰고, 허용된 명령만 실행', () => {
  const root = project('quick');
  assert.equal(decide(write(root, '.orbit/runs/r1/STATE.json', undefined, undefined, { content: '{"track":"quick"}' }), root), null);
  assert.match(decide(write(root, 'src/App.tsx'), root), /Lead/);
  assert.match(decide(write(root, '.orbit/../src/App.tsx'), root), /Lead/);
  assert.equal(decide(write(root, 'src/App.tsx', 'agent-1'), root), null);
  assert.match(decide(write(root, 'src/App.tsx', 'agent-2', 'orbit:qa'), root), /읽기 전용/);
  assert.equal(decide(write(root, '.orbit/runs/r1/VERIFY.md', 'agent-2', 'orbit:qa'), root), null);
  assert.equal(decide(bash(`node ${GATE} check ship`), root), null);
  assert.equal(decide(bash(`node "${GATE}" check ship`), root), null);
  assert.match(decide(bash('node .orbit/x/gate.mjs check'), root), /Lead/);
  assert.match(decide(bash('node .claude/hooks/gate.mjs check ship'), root), /Lead/);
  assert.equal(decide(bash('git status'), root), null);
  assert.match(decide(bash('npm run build'), root), /Lead/);
  assert.match(decide(bash('git status; echo x > src/a.ts'), root), /Lead/);
  assert.equal(decide(bash('npm run build', 'agent-1'), root), null);
  assert.match(decide({ tool_name: 'PowerShell', tool_input: { command: 'Set-Content a b' } }, root), /Lead/);
});

test('관문 훅과 settings는 서브에이전트도 수정 불가', () => {
  const root = project('quick');
  assert.match(decide(write(root, '.claude/hooks/gate.mjs', 'agent-1'), root), /수정할 수 없음/);
  assert.match(decide(write(root, '.claude/settings.json', 'agent-1'), root), /수정할 수 없음/);
  assert.match(decide(write(root, '.claude/settings.local.json', 'agent-1'), root), /수정할 수 없음/);
  assert.match(decide(write(root, '.claude/agents/qa.md', 'agent-1'), root), /config 승인/);
  assert.match(decide(write(root, '.orbit/wt/t1/.claude/hooks/gate.mjs', 'agent-1'), root), /수정할 수 없음/);
  assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: 'x' } }, root), null);
});

test('플러그인·관문 파일은 어느 위치에서든 서브에이전트도 수정 불가', () => {
  const root = project('quick');
  for (const f of ['harness/hooks/gate.mjs', 'x/.claude-plugin/plugin.json', '.orbit/wt/t1/harness/hooks/hooks.json', 'a/hooks/gate.test.mjs', GATE])
    assert.match(decide(write(root, f, 'agent-1'), root), /수정할 수 없음/, f);
  assert.equal(decide(write(root, 'harness/agents/qa.md', 'agent-1'), root), null);
});

test('agent_type은 범위 이름(orbit:<역할>)만 코딩 역할로 인정', () => {
  const root = project('quick');
  assert.equal(decide(write(root, 'src/a.ts', 'a', 'orbit:debugger'), root), null);
  assert.match(decide(write(root, 'src/a.ts', 'a', 'engineer'), root), /읽기 전용/);
  assert.match(decide(write(root, 'src/a.ts', 'a', 'other:engineer'), root), /읽기 전용/);
});

test('CLI는 CLAUDE_PROJECT_DIR 기준으로 run을 찾는다', () => {
  const root = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  const out = execFileSync('node', [GATE, 'check', 'ship'], { cwd: tmpdir(), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  assert.match(out, /PASS verify/);
  assert.match(out, /run=r1 track=quick/);
});

// ---- T7: 관문 보강 ----
const gitRoot = (track, files, state) => {
  const root = project(track, files, state);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  return root;
};
const sh = (root, command, agent_type) => ({ tool_name: 'Bash', cwd: root, tool_input: { command }, agent_id: agent_type && 'a1', agent_type });
const wr = (root, file, agent_type, extra) => write(root, file, agent_type && 'a1', agent_type, extra);
const CONFIG_OK = { approvals: [{ gate: 'config', result: 'approved' }] };
const G = 'gi' + 't', P = 'pu' + 'sh';

test('SECURITY.md 6) 우회 재현 22사례: 22 BLOCK (S13 이후)', () => {
  const root = gitRoot('full');
  const cases = [
    ['Lead newline', sh(root, `${G} status\nnpm run build`), 'BLOCK'],
    ['Lead diff --output', sh(root, `${G} diff --output=src/App.tsx`), 'BLOCK'],
    ['Lead branch -f main', sh(root, `${G} branch -f main orbit/r1`), 'BLOCK'],
    ['Lead switch -C main', sh(root, `${G} switch -C main orbit/r1`), 'BLOCK'],
    ['Lead PS subexpr', sh(root, `${G} status (Remove-Item src -Recurse)`), 'BLOCK'],
    ['ship baseline', sh(root, `${G} ${P}`, 'orbit:engineer'), 'BLOCK'],
    ['ship .exe', sh(root, `${G}.exe ${P} origin main`, 'orbit:engineer'), 'BLOCK'],
    ['ship alias', sh(root, `${G} config alias.p ${P} && ${G} p`, 'orbit:engineer'), 'BLOCK'],
    ['ship gh pr merge', sh(root, 'gh pr merge 1 --merge', 'orbit:engineer'), 'BLOCK'],
    ['ship update-ref main', sh(root, `${G} update-ref refs/heads/main HEAD`, 'orbit:engineer'), 'BLOCK'],
    ['qa Bash write hooks (S13)', sh(root, 'echo x > .claude/hooks/gate.mjs', 'orbit:qa'), 'BLOCK'],
    ['reviewer Bash write src', sh(root, `node -e "require('fs').writeFileSync('src/a.ts','x')"`, 'orbit:reviewer-rules'), 'BLOCK'],
    ['qa Write forged SECURITY.md', wr(root, '.orbit/runs/r1/SECURITY.md', 'orbit:qa'), 'BLOCK'],
    ['engineer Write STATE.json', wr(root, '.orbit/runs/r1/STATE.json', 'orbit:engineer'), 'BLOCK'],
    ['Lead Write .orbit/current', wr(root, '.orbit/current'), 'BLOCK'],
    ['engineer settings.json::$DATA', wr(root, '.claude/settings.json::$DATA', 'orbit:engineer'), 'BLOCK'],
    ['engineer 8.3 CLAUDE~1', wr(root, 'CLAUDE~1/hooks/gate.mjs', 'orbit:engineer'), 'BLOCK'],
    ['engineer settings.json. (trailing dot)', wr(root, '.claude/settings.json.', 'orbit:engineer'), 'BLOCK'],
    ['engineer agents/security.md', wr(root, '.claude/agents/security.md', 'orbit:engineer'), 'BLOCK'],
    ['engineer skills/orbit-gate/SKILL.md', wr(root, '.claude/skills/orbit-gate/SKILL.md', 'orbit:engineer'), 'BLOCK'],
    ['Lead Write src/.claude/projects/a/memory/x.ts', wr(root, 'src/.claude/projects/a/memory/x.ts'), 'BLOCK'],
    ['general-purpose Bash', sh(root, 'echo x > src/a.ts', 'general-purpose'), 'BLOCK'],
  ];
  assert.equal(cases.length, 22);
  for (const [name, payload, want] of cases) assert.equal(decide(payload, root) === null ? 'ALLOW' : 'BLOCK', want, name);
});

test('설정 경로(H8-2): config 승인 없으면 차단, full + 승인이면 역할 범위로', () => {
  const none = project('standard', {}, CONFIG_OK); // standard는 승인이 있어도 불가
  const full = project('full');
  const ok = project('full', {}, CONFIG_OK);
  for (const [root, f, who] of [[none, 'CLAUDE.md', 'orbit:engineer'], [full, 'CLAUDE.md', 'orbit:engineer'], [full, 'CLAUDE.md', 'orbit:librarian'],
    [full, '.claude/agents/x.md', 'orbit:engineer'], [full, '.orbit/wt/t1/CLAUDE.md', 'orbit:engineer'], [full, '.mcp.json', 'orbit:engineer'], [ok, '.claude/settings.json', 'orbit:engineer']])
    assert.notEqual(decide(wr(root, f, who), root), null, `${f} ${who}`);
  assert.equal(decide(wr(ok, 'CLAUDE.md', 'orbit:engineer'), ok), null);
  assert.equal(decide(wr(ok, 'CLAUDE.md', 'orbit:librarian'), ok), null);
});

test('READ_SHELL: 읽기 전용 리뷰어·모르는 에이전트는 git 읽기만, plan-checker는 grep·plugin validate 추가', () => {
  const root = project('quick');
  const at = (c, t) => decide(sh(root, c, t), root);
  assert.equal(at('grep -n x file', 'orbit:plan-checker'), null);
  assert.equal(at('claude plugin validate harness', 'orbit:plan-checker'), null);
  assert.notEqual(at('node --test harness/hooks/gate.test.mjs', 'orbit:plan-checker'), null);
  assert.notEqual(at('grep x > out.txt', 'orbit:plan-checker'), null);
  assert.notEqual(at('grep -n x file', 'orbit:reviewer-rules'), null);
  assert.equal(at('git diff --stat', 'orbit:reviewer-rules'), null);
  assert.equal(at('git status', 'general-purpose'), null);
  assert.notEqual(at('git diff --output=a.txt', 'orbit:reviewer-idiom'), null);
  assert.notEqual(at('ls', 'orbit:reviewer-data'), null);
  assert.equal(at('npm test', 'orbit:engineer'), null);
  assert.equal(at('npm test', 'orbit:reviewer-tests'), null);
});

test('정상 경로와 역할별 쓰기 범위', () => {
  const root = project('quick');
  const ok = (f, who) => assert.equal(decide(wr(root, f, who), root), null, `${who} ${f}`);
  const no = (f, who) => assert.notEqual(decide(wr(root, f, who), root), null, `${who} ${f}`);
  ok('src/a.ts', 'orbit:engineer');
  ok('.orbit/runs/r1/tasks/t1/SUMMARY.md', 'orbit:engineer');
  ok('.orbit/runs/r1/DEBUG.md', 'orbit:debugger');
  ok('.orbit/runs/r1/VERIFY.md', 'orbit:qa');
  ok('.orbit/runs/r1/PLAN_CHECK.md', 'orbit:plan-checker');
  ok('.orbit/runs/r1/SECURITY.md', 'orbit:security');
  ok('.orbit/runs/r1/DESIGN.md', 'orbit:designer');
  ok('design/tokens.json', 'orbit:designer');
  ok('.orbit/profile.json', 'orbit:researcher');
  ok('.orbit/runs/r1/DATA.md', 'orbit:data');
  ok('.orbit/runs/r1/RELEASE.md', 'orbit:devops');
  ok('src/b.ts', 'orbit:devops');
  ok('docs/a.txt', 'orbit:librarian');
  ok('README.md', 'orbit:librarian');
  ok('CHANGELOG', 'orbit:librarian');
  no('src/a.ts', 'orbit:designer');
  no('src/a.ts', 'orbit:librarian');
  no('src/a.ts', 'general-purpose');
  no('.orbit/team.yaml', 'orbit:researcher');
  no('.orbit/team.yaml', undefined);
  no('.orbit/profile.json', 'orbit:engineer');
  no('.orbit/runs/r1/PLAN_CHECK.md', 'orbit:architect');
  no('.orbit/runs/r1/REVIEW.md', 'orbit:qa');
  no('.orbit/current', 'orbit:engineer');
  assert.equal(decide(wr(root, '.orbit/runs/r1/REVIEW.md', undefined), root), null);
  assert.equal(decide(wr(root, '.orbit/current', undefined, { content: 'r2\n' }), root), null);
  assert.equal(decide(bash('git status'), root), null);
});

test('STATE.json: track 하향 차단, verify 실패 상태의 stage done 차단', () => {
  const root = project('standard', { 'VERIFY.md': EVIDENCE });
  const state = '.orbit/runs/r1/STATE.json';
  const put = (o) => decide(wr(root, state, undefined, { content: JSON.stringify(o) }), root);
  assert.match(put({ track: 'quick' }), /하향/);
  assert.equal(put({ track: 'standard', stage: 'build' }), null);
  assert.equal(put({ track: 'full' }), null);
  assert.match(decide(wr(root, state, undefined, { content: '{nope' }), root), /해석/);
  const edit = { tool_name: 'Edit', cwd: root, tool_input: { file_path: state, old_string: '"standard"', new_string: '"quick"' } };
  assert.match(decide(edit, root), /하향/);
  assert.match(put({ track: 'standard', stage: 'done' }), /done/); // PLAN_CHECK·REVIEW 없음
  const quick = project('quick');
  assert.match(decide(wr(quick, state, undefined, { content: '{"track":"quick","stage":"done"}' }), quick), /done/);
  const passed = project('quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(decide(wr(passed, state, undefined, { content: '{"track":"quick","stage":"done"}' }), passed), null);
});

test('STATE.json을 읽을 수 없으면 설정 경로는 닫힘', () => {
  const root = project('full', {}, CONFIG_OK);
  writeFileSync(join(root, '.orbit/runs/r1/STATE.json'), '{broken');
  assert.notEqual(decide(wr(root, 'CLAUDE.md', 'orbit:engineer'), root), null);
});

// ---- T8: 디자인 토큰 경고 (PostToolUse, 막지 않음) ----
const warn = (root, file, content, tokens) => {
  mkdirSync(join(root, 'design'), { recursive: true });
  if (tokens !== undefined) writeFileSync(join(root, 'design/tokens.json'), tokens);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, file), content);
  const payload = JSON.stringify({ tool_name: 'Write', cwd: root, tool_input: { file_path: join(root, file).replaceAll('\\', '/') } });
  const out = execFileSync('node', [GATE, 'design-warn'], { input: payload, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  return out ? JSON.parse(out).hookSpecificOutput : '';
};
const TOK = '{"color":{"bg":"#1E1E2E"},"space":{"md":"16px"}}';

test('design-warn: tokens.json 없음, tokens에 있는 값, 잘못된 tokens.json은 출력 없음', () => {
  assert.equal(warn(project('quick'), 'src/a.css', 'a{color:#ff0000}'), '');
  assert.equal(warn(project('quick'), 'src/a.css', 'a{color:#1e1e2e;padding:16px}', TOK), '');
  assert.equal(warn(project('quick'), 'src/a.css', 'a{color:#ff0000}', '{nope'), '');
});

test('design-warn: tokens 밖 색·px는 additionalContext로 경고, 다른 파일 종류는 무시', () => {
  const root = project('quick');
  const w = warn(root, 'src/a.css', 'a{color:#ff0000;margin:13px;padding:16px}', TOK);
  assert.equal(w.hookEventName, 'PostToolUse');
  assert.match(w.additionalContext, /#ff0000/);
  assert.match(w.additionalContext, /13px/);
  assert.doesNotMatch(w.additionalContext, /16px/);
  assert.equal(warn(root, 'src/a.ts', 'const c="#ff0000"', TOK), '');
});

// ---- review-fix-1 ----
import { spawnSync } from 'node:child_process';
const spawnGate = (args, { input = '', env = {}, root } = {}) =>
  spawnSync(process.execPath, [GATE, ...args], {
    input, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, ORBIT_GATE: undefined, ...(root ? { CLAUDE_PROJECT_DIR: root } : {}), ...env },
  });

test('B1: .orbit/ 산출물 소유자 판정은 대소문자를 무시한다(NTFS)', () => {
  const root = project('quick');
  for (const f of ['.orbit/runs/r1/Review.md', '.orbit/runs/r1/verify.MD', '.orbit/runs/r1/security.md', '.orbit/runs/r1/plan_check.md',
    '.orbit/runs/r1/state.json', '.orbit/Runs/r2/REVIEW.md', '.orbit/Current', '.orbit/Profile.json', '.orbit/Team.yaml'])
    assert.notEqual(decide(wr(root, f, 'orbit:engineer'), root), null, f);
  assert.equal(decide(wr(root, '.orbit/runs/r1/Review.md', undefined), root), null); // Lead는 여전히 쓴다
});

test('R2: engineer의 브랜치 강제 이동은 관문 미통과 시 차단', () => {
  const root = project('standard');
  for (const c of [`${G} branch -f main HEAD`, `${G} switch -C main`, `${G} checkout -B main`])
    assert.match(decide(sh(root, c, 'orbit:engineer'), root), /차단/, c);
});

test('R3: config 승인은 gate=config + result=approved일 때만 CLAUDE.md를 연다', () => {
  const denied = project('full', {}, { approvals: [{ gate: 'config', result: 'denied' }] });
  const other = project('full', {}, { approvals: [{ gate: 'plan', result: 'approved' }] });
  for (const root of [denied, other]) assert.match(decide(wr(root, 'CLAUDE.md', 'orbit:engineer'), root), /config 승인/);
});

test('R4: check CLI 종료 코드', () => {
  const ok = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  const bad = project('quick', { 'VERIFY.md': PASS });
  const empty = mkdtempSync(join(tmpdir(), 'orbit-gate-'));
  assert.equal(spawnGate(['check', 'ship'], { root: ok }).status, 0);
  assert.equal(spawnGate(['check', 'verify'], { root: bad }).status, 1);
  assert.equal(spawnGate(['check', 'ship'], { root: empty }).status, 1);
  for (const a of [['check', 'nope'], ['check', '__proto__'], ['check', 'constructor'], ['status']]) {
    const r = spawnGate(a, { root: ok });
    assert.equal(r.status, 64, a.join(' '));
    assert.doesNotMatch(r.stderr, /at .*gate\.mjs/, a.join(' ')); // 예외 스택 없음
  }
});

test('R5: 훅 모드 — 해석 불가 입력은 exit 2, ORBIT_GATE=off는 exit 0', () => {
  const root = project('quick');
  for (const input of ['{nope', '']) {
    const r = spawnGate([], { input, root });
    assert.equal(r.status, 2, JSON.stringify(input));
    assert.match(r.stderr, /\[orbit gate\]/);
  }
  assert.equal(spawnGate([], { input: '{nope', root, env: { ORBIT_GATE: 'off' } }).status, 0);
});

test('R6: Lead의 .orbit/current 내용은 run-id 한 줄만', () => {
  const root = project('quick');
  for (const content of ['../x', 'a b', '.hidden']) assert.match(decide(wr(root, '.orbit/current', undefined, { content }), root), /run-id/, content);
});

test('N3: design-warn — 값 정확 일치(3자리 hex 펼침·대소문자 무시), 키·설명·더 긴 값의 일부는 불일치', () => {
  const root = project('quick');
  assert.equal(warn(root, 'src/a.css', 'a{color:#fff}', '{"c":"#FFFFFF"}'), ''); // 같은 색
  assert.equal(warn(root, 'src/a.css', 'a{color:#FFFFFF}', '{"c":"#fff"}'), ''); // 같은 색
  assert.match(warn(root, 'src/a.css', 'a{color:#fff000}', '{"c":"#fff"}').additionalContext, /#fff000/);
  assert.match(warn(root, 'src/a.css', 'a{margin:16px}', '{"s":"116px"}').additionalContext, /16px/);
  assert.match(warn(root, 'src/a.css', 'a{margin:16px}', '{"16px":"x"}').additionalContext, /16px/); // 키 이름
  assert.match(warn(root, 'src/a.css', 'a{margin:16px}', '{"desc":"use 16px here"}').additionalContext, /16px/); // 설명 문구
  assert.match(warn(root, 'src/a.css', 'a{color:#ff0000cc}', '{"c":"#ff0000"}').additionalContext, /#ff0000cc/); // 알파는 펼치지 않음
  assert.equal(warn(root, 'src/a.css', 'a{margin:16px;z-index:4px}', '{"s":{"a":"16px","n":[4]},"z":"4px"}'), '');
});

test('R7: design-warn 오류 입력은 조용히 exit 0', () => {
  const root = project('quick');
  const run = (input) => spawnGate(['design-warn'], { input, root });
  for (const input of ['not json', JSON.stringify({ tool_name: 'Write', cwd: root, tool_input: { file_path: join(root, 'src/none.css') } })]) {
    const r = run(input);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

// ---- hardening K1: S1 · S3 · S4 · S8 (훅을 실제로 실행해 exit code를 본다) ----
const FULL_PASS = { 'PLAN_CHECK.md': PASS, 'REVIEW.md': PASS, 'VERIFY.md': EVIDENCE, 'SECURITY.md': PASS };
const gitProject = (branch, track, files, state) => {
  const root = project(track, files, state);
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: root });
  return root;
};
const exitOf = (root, command, agent_type) => spawnGate([], { input: JSON.stringify(sh(root, command, agent_type)), root }).status;

test('S1: 출고는 명령 안의 orbit/<id>가 현재 run과 같을 때만, 대체는 ref 없는 push에만', () => {
  const quick = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(exitOf(quick, `${G} merge orbit/other`), 2); // current=r1이 아닌 run의 브랜치
  assert.equal(exitOf(quick, `${G} merge orbit/r1 orbit/other`), 2); // 하나라도 다르면
  assert.equal(exitOf(quick, `${G} merge orbit/r1`), 0);
  assert.equal(exitOf(quick, `${G} merge feat`), 2); // F1: main에서 ref가 orbit/<id>가 아님
  const full = shipProject('orbit/r1', 'full', FULL_PASS);
  assert.equal(exitOf(full, `${G} switch main && ${G} merge feat`, 'orbit:engineer'), 2); // F1
  assert.equal(exitOf(full, `${G} ${P}`, 'orbit:engineer'), 0); // 대체: 브랜치 orbit/r1 = current
  const other = gitProject('orbit/zzz', 'full', FULL_PASS);
  assert.equal(exitOf(other, `${G} ${P}`, 'orbit:engineer'), 2); // 브랜치 id가 current와 다름
  const feat = gitProject('feature', 'full', FULL_PASS);
  assert.equal(exitOf(feat, `${G} ${P}`, 'orbit:engineer'), 2); // orbit/<id>가 아닌 브랜치
});

test('S3: Lead의 git branch는 목록·--show-current만, 브랜치 이동·복사·강제는 차단', () => {
  const root = gitProject('main', 'full', FULL_PASS);
  for (const c of ['branch -m main old', 'branch -M orbit/x main', 'branch -df x', 'switch --force-create main'])
    assert.equal(exitOf(root, `${G} ${c}`), 2, c);
  for (const c of ['branch', 'branch --show-current']) assert.equal(exitOf(root, `${G} ${c}`), 0, c);
  const std = gitProject('orbit/r1', 'standard'); // 엔지니어의 branch -m/-c도 출고로 본다
  for (const c of ['branch -m orbit/r1 main', 'branch -c main x', 'branch --move a b']) assert.equal(exitOf(std, `${G} ${c}`, 'orbit:engineer'), 2, c);
});

test('S4: 따옴표 git, GIT_CONFIG_*, main에서의 pull·rebase·reset --hard는 출고', () => {
  const root = gitProject('main', 'standard');
  for (const c of [`"${G}" ${P} origin main`, `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=${P} ${G} p`, `${G} pull`, `${G} rebase feat`, `${G} reset --hard origin/main`])
    assert.equal(exitOf(root, c, 'orbit:engineer'), 2, c);
  const run = gitProject('orbit/r1', 'standard');
  assert.equal(exitOf(run, `${G} rebase main`, 'orbit:engineer'), 0); // 대조: run 브랜치 안
  assert.equal(exitOf(run, `${G} reset --hard HEAD~1`, 'orbit:engineer'), 0);
  assert.equal(exitOf(run, `${G} -C . pull`, 'orbit:engineer'), 2); // 위치를 믿을 수 없음
});

test('S8: publish·deploy는 deploy 승인 + 관문 + run 브랜치가 모두 있어야', () => {
  const DEPLOY = { approvals: [{ gate: 'deploy', result: 'approved' }] };
  const cmds = ['npm publish', 'cargo publish', 'gh release create v1', 'vercel deploy --prod', 'npm -q publish'];
  const none = gitProject('orbit/r1', 'full');
  const noDeploy = gitProject('orbit/r1', 'full', FULL_PASS);
  const gatesFail = gitProject('orbit/r1', 'full', {}, DEPLOY);
  const ok = shipProject('orbit/r1', 'full', FULL_PASS, DEPLOY);
  const onMain = gitProject('main', 'full', FULL_PASS, DEPLOY);
  for (const role of ['orbit:engineer', 'orbit:devops'])
    for (const c of cmds) {
      for (const [name, root] of [['no gates', none], ['no deploy approval', noDeploy], ['gates fail', gatesFail], ['main branch', onMain]])
        assert.equal(exitOf(root, c, role), 2, `${role} ${c} ${name}`);
      assert.equal(exitOf(ok, c, role), 0, `${role} ${c} ok`);
    }
  assert.equal(exitOf(ok, 'npm run build', 'orbit:engineer'), 0);
});

// ---- hardening K2: S5 · S2/R11 · S13 · S7 · S10 · S11 ----
const exitW = (root, file, agent_type, extra) => spawnGate([], { input: JSON.stringify(wr(root, file, agent_type, extra)), root }).status;

test('S5: 메모리 쓰기는 Lead만, 현재 프로젝트 폴더만', () => {
  assert.equal(memorySlug('C:\\Work\\Projects\\orbit'), 'C--Work-Projects-orbit');
  assert.equal(memorySlug('a'.repeat(201)), null);
  const root = gitProject('main', 'quick');
  const mem = (slug) => join(homedir(), '.claude', 'projects', slug, 'memory', 'x.md');
  const cur = memorySlug(resolvePath(root));
  for (const who of ['orbit:qa', 'general-purpose', 'orbit:librarian']) assert.equal(exitW(root, mem(cur), who), 2, who);
  assert.equal(exitW(root, mem('other-project'), undefined), 2);
  assert.equal(exitW(root, mem(cur), undefined), 0);
});

test('S2/R11: librarian 셸은 허용 목록(check, git add/commit/switch/merge/status/log/diff)만', () => {
  const root = gitProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(exitOf(root, 'echo x >> CLAUDE.md', 'orbit:librarian'), 2);
  assert.equal(exitOf(root, 'npm test', 'orbit:librarian'), 2);
  assert.equal(exitOf(root, `${G} commit -m x`, 'orbit:librarian'), 2); // N2-b: main 위에서는 librarian도 commit 불가
  assert.equal(exitOf(root, `${G} add -- docs/a.md`, 'orbit:librarian'), 2); // N2-b: main 위에서는 librarian도 add 불가
  assert.equal(exitOf(root, `node "${GATE}" check ship`, 'orbit:librarian'), 0);
  assert.equal(exitOf(root, `${G} ${P}`, 'orbit:librarian'), 2);
  assert.equal(exitOf(root, `${G} commit -m x; echo y > a`, 'orbit:librarian'), 2);
});

test('S13: 관문·설정 파일을 가리키는 셸 쓰기와 ORBIT_GATE·disableAllHooks는 모든 역할에서 차단', () => {
  const root = gitProject('main', 'quick');
  assert.equal(exitOf(root, 'echo x >> harness/hooks/gate.mjs', 'orbit:qa'), 2);
  assert.equal(exitOf(root, 'echo {"disableAllHooks":true} > .claude/settings.local.json', 'orbit:security'), 2);
  assert.equal(exitOf(root, `node -e "process.env.ORBIT_GATE='off'"`, 'orbit:reviewer-tests'), 2);
  assert.equal(exitOf(root, 'echo x > .claude/settings.json', 'orbit:engineer'), 2);
  assert.equal(exitOf(root, 'echo x > harness/hooks/hooks.json', 'orbit:devops'), 2);
  assert.equal(exitOf(root, 'node --test harness/hooks/gate.test.mjs', 'orbit:qa'), 0); // 대조: 테스트 실행은 허용
  assert.equal(exitOf(root, 'git diff harness/hooks/gate.mjs', 'orbit:qa'), 0);
  assert.equal(exitOf(root, 'cat harness/hooks/gate.mjs', 'orbit:qa'), 0);
  assert.equal(exitOf(root, 'cat harness/hooks/gate.mjs > x', 'orbit:qa'), 2);
  assert.equal(exitOf(root, 'node --test -e x harness/hooks/gate.mjs', 'orbit:qa'), 2);
});

test('S7: ~/.claude.json, .git/hooks, .git/config는 서브에이전트도 수정 불가', () => {
  const root = gitProject('main', 'quick');
  for (const f of [join(homedir(), '.claude.json'), '.git/hooks/post-merge', '.git/config']) assert.equal(exitW(root, f, 'orbit:engineer'), 2, f);
  assert.equal(exitW(root, 'src/a.ts', 'orbit:engineer'), 0);
});

test('S10: .orbit/wt/는 engineer·debugger·devops만 쓴다', () => {
  const root = gitProject('main', 'quick');
  assert.equal(exitW(root, '.orbit/wt/t1/src/a.ts', 'orbit:reviewer-rules'), 2);
  assert.equal(exitW(root, '.orbit/wt/t1/src/a.ts', undefined), 2);
  assert.equal(exitW(root, '.orbit/wt/t1/src/a.ts', 'orbit:engineer'), 0);
});

test('S11: design-warn은 값을 20개까지만 보이고 나머지는 "외 N개"', () => {
  const root = project('quick');
  const css = 'a{' + Array.from({ length: 200 }, (_, i) => `m${i}:${i + 1}px`).join(';') + '}';
  const msg = warn(root, 'src/a.css', css, '{"c":"#fff"}').additionalContext;
  assert.equal(msg.match(/\d+px/g).length, 20);
  assert.match(msg, /외 180개/);
});

// ---- review-fix-1 (R1-R10, 참고 항목) ----
const reasonOf = (root, command, agent_type) => spawnGate([], { input: JSON.stringify(sh(root, command, agent_type)), root }).stderr;

test('R1: orbit/<id>가 아닌 ref가 섞인 merge는 출고 판정 때 차단(Q5), 연결된 merge도 각각 본다', () => {
  const quick = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(exitOf(quick, `${G} merge orbit/r1 feat`), 2);
  assert.equal(exitOf(quick, `${G} merge feat orbit/r1`), 2);
  assert.equal(exitOf(quick, `${G} merge orbit/r1 && ${G} merge feat`, 'orbit:engineer'), 2);
  assert.equal(exitOf(quick, `${G} merge --no-ff orbit/r1 -m "release notes"`, 'orbit:engineer'), 0); // 대조: 옵션·메시지는 ref가 아님
  assert.equal(exitOf(quick, `${G} merge orbit/r1`), 0);
  // BRIEF 기준 2 그대로: current=A(통과한 quick), 브랜치 orbit/B(full, security 미통과) → Lead의 merge orbit/B는 2
  assert.equal(exitOf(quick, `${G} merge orbit/B`), 2);
  const full = shipProject('main', 'full', FULL_PASS); // current=B이고 B가 모두 통과면 0 (full 트랙)
  assert.equal(exitOf(full, `${G} merge orbit/r1`), 0);
  assert.equal(exitOf(full, `${G} merge orbit/r1 feat`), 2);
});

test('정당한 흐름: Lead의 switch -c orbit/<id>, librarian의 switch main → merge --no-ff orbit/<id>', () => {
  const quick = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(exitOf(quick, `${G} switch -c orbit/r1`), 0);
  assert.equal(exitOf(quick, `${G} switch main`, 'orbit:librarian'), 0);
  assert.equal(exitOf(quick, `${G} merge --no-ff orbit/r1`, 'orbit:librarian'), 0);
});

test('R2: 떼어진 HEAD(진행 중 rebase 없음)는 main으로 본다: rebase --continue/--abort/--skip/--quit도 차단, 출고는 새로 열리지 않음', () => {
  const root = gitProject('orbit/r1', 'standard');
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: root });
  execFileSync('git', ['checkout', '-q', '--detach'], { cwd: root }); // rebase 도중이 아닌 detached HEAD(진행 중 rebase 없음)
  for (const f of ['--continue', '--abort', '--skip', '--quit']) assert.equal(exitOf(root, `${G} rebase ${f}`, 'orbit:engineer'), 2, f); // N2-c: 진짜 멈춘 rebase의 ALLOW는 cb N2-c 기준16
  assert.equal(exitOf(root, `${G} rebase main`, 'orbit:engineer'), 2);
  assert.equal(exitOf(root, `${G} rebase --continue main`, 'orbit:engineer'), 2);
  assert.equal(exitOf(root, `${G} rebase --continue && ${G} ${P}`, 'orbit:engineer'), 2);
  assert.equal(exitOf(root, `${G} rebase --continue && ${G} merge feat`, 'orbit:engineer'), 2);
  assert.equal(exitOf(root, `cd .. && ${G} rebase --continue`, 'orbit:engineer'), 2); // 위치를 믿을 수 없음
  assert.equal(exitOf(root, `${G} -C .. rebase --continue`, 'orbit:engineer'), 2);
});

test('R3·R9·R10: S13은 대소문자를 구분하지 않고, disableAllHooks·.claude-plugin을 각각 막는다', () => {
  const root = gitProject('main', 'quick');
  for (const c of ['echo x >> harness/hooks/Gate.mjs', 'echo {} > .CLAUDE/settings.local.json', 'echo x > x/.Claude-Plugin/plugin.json', 'node -e "1" --DISABLEALLHOOKS', 'set orbit_gate=off'])
    assert.equal(exitOf(root, c, 'orbit:qa'), 2, c);
  assert.equal(exitOf(root, 'node -e "1" --disableAllHooks', 'orbit:qa'), 2); // 설정 파일 경로 없이 disableAllHooks만
  assert.equal(exitOf(root, 'echo x > x/.claude-plugin/plugin.json', 'orbit:qa'), 2); // .claude-plugin만 가리킴
});

test('R4: 막힌 사유가 실제 허용 목록을 말한다', () => {
  const root = gitProject('main', 'quick');
  assert.match(reasonOf(root, 'npm test', 'orbit:librarian'), /git add\/commit\/switch\/merge\/status\/log\/diff/);
  assert.match(reasonOf(root, 'npm test'), /branch\(목록·--show-current만\)/);
});

test('R7: S3 사유까지 확인 — Lead는 branch 이동·삭제·생성 차단, engineer는 브랜치 강제 이동을 출고로 차단', () => {
  const root = gitProject('main', 'full', FULL_PASS);
  for (const c of ['branch -d x', 'branch newname']) assert.match(reasonOf(root, `${G} ${c}`), /Lead는/, c);
  const std = gitProject('orbit/r1', 'standard');
  for (const c of ['switch --force-create main', 'switch -C main', 'checkout -B main', 'branch -df x', 'branch --force x', 'branch -fm a b'])
    assert.match(reasonOf(std, `${G} ${c}`, 'orbit:engineer'), /머지\/푸시\/배포 차단/, c);
});

test('R8: 대체는 위치·브랜치가 바뀌지 않는 ref 없는 push에만', () => {
  const full = shipProject('orbit/r1', 'full', FULL_PASS);
  assert.equal(exitOf(full, `${G} ${P}`, 'orbit:engineer'), 0); // 대조
  assert.equal(exitOf(full, `cd ../other && ${G} ${P}`, 'orbit:engineer'), 2);
  assert.equal(exitOf(full, `${G} switch main && ${G} ${P}`, 'orbit:engineer'), 2);
  assert.equal(exitOf(full, `${G} branch -f main HEAD`, 'orbit:engineer'), 2); // ref 형태는 대체 대상이 아님
});

test('BRIEF 기준 5 그대로: main에서 관문 미통과 시 pull . · reset --hard · rebase는 2, reset --soft는 main에서는 N2-b로 차단', () => {
  const root = gitProject('main', 'standard');
  for (const c of [`${P} origin main`, `pull . orbit/x`, `reset --hard orbit/x`, `rebase orbit/x`]) assert.equal(exitOf(root, `${G} ${c}`, 'orbit:engineer'), 2, c);
  assert.equal(exitOf(root, `${G} reset --soft HEAD~1`, 'orbit:engineer'), 2);
});

// ---- review-fix-2 (N1-N7) ----
test('N1·N5: -m 메시지 안의 구분자·뒤따르는 ref를 놓치지 않는다, -F 파일과 따옴표 친 orbit/<id>는 허용', () => {
  const quick = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(exitOf(quick, `${G} merge -m "x ; orbit/r1" feat`, 'orbit:engineer'), 2);
  assert.equal(exitOf(quick, `${G} merge -m 'a && b' orbit/r1 feat`, 'orbit:engineer'), 2);
  assert.equal(exitOf(quick, `${G} merge orbit/r1 -m x feat`, 'orbit:engineer'), 2);
  assert.equal(exitOf(quick, `${G} merge -m "a ; b" orbit/r1`, 'orbit:engineer'), 0); // 대조
  assert.equal(exitOf(quick, `${G} merge -F msg.txt orbit/r1`, 'orbit:engineer'), 0);
  assert.equal(exitOf(quick, `${G} merge "orbit/r1"`), 0);
});

test('N6·N7: orbit/<id>를 품었지만 그 형태가 아닌 ref는 id로도 ref로도 인정하지 않는다', () => {
  const quick = shipProject('main', 'quick', { 'VERIFY.md': EVIDENCE });
  for (const c of ['merge feat-orbit/r1', 'merge origin/orbit/r1', 'pull . feat-orbit/r1', 'pull . origin/orbit/r1']) assert.equal(exitOf(quick, `${G} ${c}`, 'orbit:engineer'), 2, c);
  assert.equal(exitOf(quick, `${G} merge orbit/r1`, 'orbit:engineer'), 0); // 대조: pull은 main에서 N2-b로 막히므로 merge로 남긴다
});

test('N2: run 브랜치에서 main을 바꾸는 rebase <upstream> main · fetch . <src>:main은 출고', () => {
  const std = gitProject('orbit/r1', 'standard');
  for (const c of ['rebase orbit/r1 main', 'rebase orbit/r1 master', 'fetch . HEAD:main', 'fetch . orbit/r1:main', 'fetch . +HEAD:refs/heads/main']) assert.equal(exitOf(std, `${G} ${c}`, 'orbit:engineer'), 2, c);
  for (const c of ['rebase main', 'rebase -i main', 'fetch origin']) assert.equal(exitOf(std, `${G} ${c}`, 'orbit:engineer'), 0, c); // 대조
});

// ---- gate-commit-binding (cb): COMMIT 묶기 · main 읽기 전용 · 위치 변경 · git 설정 보호 ----
// 검토한 커밋 뒤에 run 브랜치에 커밋을 더한다(작업 트리는 원래 브랜치로 돌려놓는다). body가 null이면 파일 삭제. 새 HEAD를 돌려준다.
function advance(root, files) {
  const cur = gitIn(root, 'branch', '--show-current');
  gitIn(root, 'switch', '-q', 'orbit/r1');
  for (const [p, body] of Object.entries(files)) {
    if (body === null) rmSync(join(root, p));
    else {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), body);
    }
  }
  gitIn(root, 'add', '-A', '--', ':(exclude).orbit');
  gitIn(root, 'commit', '-q', '-m', 'adv');
  const sha = gitIn(root, 'rev-parse', 'HEAD');
  gitIn(root, 'switch', '-q', cur);
  return sha;
}
const putRun = (root, name, body) => writeFileSync(join(root, '.orbit/runs/r1', name), body);
const rebind = (root, sha) => {
  for (const n of ['VERIFY.md', 'SECURITY.md']) {
    const f = join(root, '.orbit/runs/r1', n);
    if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replace(/^COMMIT: .*$/m, `COMMIT: ${sha}`));
  }
};
const exitP = (root, command, agent_type) => spawnGate([], { input: JSON.stringify({ ...sh(root, command, agent_type), tool_name: 'PowerShell' }), root }).status; // PowerShell 도구
const MERGE = `${G} merge --no-ff orbit/r1`;
const QUICK = { 'VERIFY.md': EVIDENCE };
const STD = { 'PLAN_CHECK.md': PASS, 'REVIEW.md': PASS, 'VERIFY.md': EVIDENCE };
const ENG = 'orbit:engineer';

test('cb N1 기준4·5: 묶은 해시와 같으면 머지 ALLOW, 미검토 커밋을 머지한 뒤엔 BLOCK(두 해시 7자리)·check ship 1', () => {
  const root = shipProject('main', 'full', FULL_PASS);
  const sha = gitIn(root, 'rev-parse', 'orbit/r1');
  assert.equal(exitOf(root, MERGE), 0);
  assert.equal(spawnGate(['check', 'ship'], { root }).status, 0);
  const next = advance(root, { 'src/b.ts': 'x' }); // 미검토 커밋
  assert.equal(exitOf(root, MERGE), 2);
  const why = reasonOf(root, MERGE);
  assert.match(why, /검토한 커밋과 다름/);
  assert.ok(why.includes(sha.slice(0, 7)) && why.includes(next.slice(0, 7)), why);
  const c = spawnGate(['check', 'ship'], { root });
  assert.equal(c.status, 1);
  assert.match(c.stdout, /검토한 커밋과 다름/);
});

test('cb N1 기준6: 지우고 다른 커밋에서 다시 만든 orbit/A는 BLOCK', () => {
  const root = shipProject('main', 'full', FULL_PASS);
  assert.equal(exitOf(root, MERGE), 0); // 대조
  gitIn(root, 'switch', '-q', '-c', 'orbit/B', 'main');
  gitIn(root, 'commit', '-q', '--allow-empty', '-m', 'other');
  gitIn(root, 'switch', '-q', 'main');
  gitIn(root, 'branch', '-D', 'orbit/r1');
  gitIn(root, 'branch', 'orbit/r1', 'orbit/B');
  assert.equal(exitOf(root, MERGE), 2);
  assert.match(reasonOf(root, MERGE), /검토한 커밋과 다름/);
});

test('cb N1 기준7: COMMIT 없음·단축·비hex·산출물끼리 다름은 BLOCK, 사유에 산출물 이름', () => {
  const cases = [
    ['VERIFY.md', () => EVIDENCE, /VERIFY\.md/], // COMMIT 줄 없음
    ['VERIFY.md', (sha) => `COMMIT: ${sha.slice(0, 7)}\n${EVIDENCE}`, /VERIFY\.md/], // 7자리 단축
    ['VERIFY.md', () => `COMMIT: ${'z'.repeat(40)}\n${EVIDENCE}`, /VERIFY\.md/], // hex가 아님
    ['SECURITY.md', () => PASS, /SECURITY\.md/], // full은 SECURITY도 본다
    ['SECURITY.md', () => `COMMIT: ${'a'.repeat(40)}\n${PASS}`, /SECURITY\.md/], // VERIFY와 다름
  ];
  for (const [name, body, who] of cases) {
    const root = shipProject('main', 'full', FULL_PASS);
    assert.equal(exitOf(root, MERGE), 0, name); // 대조
    putRun(root, name, body(gitIn(root, 'rev-parse', 'orbit/r1')));
    assert.equal(exitOf(root, MERGE), 2, `${name} ${body('0123456').slice(0, 20)}`);
    assert.match(reasonOf(root, MERGE), who);
  }
});

test('cb N1 기준8: quick·standard는 VERIFY의 COMMIT만 본다', () => {
  for (const [track, files] of [['quick', QUICK], ['standard', STD]]) {
    const root = shipProject('main', track, files);
    putRun(root, 'SECURITY.md', `COMMIT: ${'a'.repeat(40)}\n${PASS}`); // 이 트랙은 보지 않는다
    assert.equal(exitOf(root, MERGE), 0, track);
    advance(root, { 'src/b.ts': 'x' });
    assert.equal(exitOf(root, MERGE), 2, track);
    assert.match(reasonOf(root, MERGE), /검토한 커밋과 다름/, track);
  }
});

test('cb N1 기준9: ref 없는 push·publish는 HEAD를 대조', () => {
  const root = shipProject('orbit/r1', 'full', FULL_PASS, { approvals: [{ gate: 'deploy', result: 'approved' }] });
  assert.equal(exitOf(root, `${G} ${P}`, ENG), 0);
  assert.equal(exitOf(root, 'npm publish', ENG), 0);
  advance(root, { 'src/b.ts': 'x' }); // 비문서 파일을 바꾸는 커밋(빈 커밋은 diff가 비어 허용된다)
  assert.equal(exitOf(root, `${G} ${P}`, ENG), 2);
  assert.equal(exitOf(root, 'npm publish', ENG), 2);
  assert.match(reasonOf(root, `${G} ${P}`, ENG), /검토한 커밋과 다름/);
});

test('cb N1 기준10: 묶은 해시 뒤 CHANGELOG*·docs/**만 바꾼 커밋은 ALLOW, src·harness/agents·이름 바꾸기·조상 아님은 BLOCK', () => {
  const docs = shipProject('main', 'full', FULL_PASS);
  advance(docs, { 'CHANGELOG.md': 'x', 'docs/solutions/x.md': 'x' });
  assert.equal(exitOf(docs, MERGE, 'orbit:librarian'), 0);
  assert.equal(spawnGate(['check', 'ship'], { root: docs }).status, 0);
  for (const f of ['src/a.ts', 'harness/agents/qa.md']) {
    const root = shipProject('main', 'full', FULL_PASS);
    advance(root, { 'CHANGELOG.md': 'x', [f]: 'x' });
    assert.equal(exitOf(root, MERGE), 2, f);
    assert.match(reasonOf(root, MERGE), /검토한 커밋과 다름/, f);
  }
  const ren = shipProject('main', 'full', FULL_PASS); // src/a.ts → docs/a.ts: 이름 바꾸기는 양쪽 경로를 본다
  rebind(ren, advance(ren, { 'src/a.ts': 'x' }));
  assert.equal(exitOf(ren, MERGE), 0);
  advance(ren, { 'docs/a.ts': 'x', 'src/a.ts': null });
  assert.equal(exitOf(ren, MERGE), 2);
  // 조상이 아님: cb N1 기준6
});

test('cb N1: 같은 이름 태그·orbit/<id>/x·orbit/<id>~1은 검토 커밋으로 인정하지 않는다', () => {
  const root = shipProject('main', 'quick', QUICK);
  assert.equal(exitOf(root, `${G} merge orbit/r1`, ENG), 0); // 대조
  assert.equal(exitOf(root, `${G} pull . orbit/r1/t1`, ENG), 2);
  for (const c of ['merge orbit/r1/x', 'merge orbit/r1~1']) assert.equal(exitOf(root, `${G} ${c}`, ENG), 2, c);
  gitIn(root, 'tag', 'orbit/r1', 'main'); // git은 같은 이름이면 태그를 고른다
  assert.equal(exitOf(root, `${G} merge orbit/r1`, ENG), 2);
});

test('cb N2-b 기준12: main 위의 쓰기 git은 통과 여부와 무관하게 BLOCK', () => {
  const cmds = ['cherry-pick orbit/r1', 'commit -am x', 'checkout orbit/r1 -- b.txt', 'restore --source orbit/r1 b.txt', 'am x.patch', 'revert HEAD',
    'reset --soft orbit/r1', 'reset orbit/r1', 'stash pop'];
  for (const [name, root] of [['미통과', shipProject('main', 'quick')], ['통과', shipProject('main', 'quick', QUICK)]]) {
    for (const c of cmds) assert.equal(exitOf(root, `${G} ${c}`, ENG), 2, `${name} ${c}`);
    for (const c of ['add src/a.ts', 'commit -F msg.txt']) assert.equal(exitOf(root, `${G} ${c}`, 'orbit:librarian'), 2, `${name} librarian ${c}`);
  }
});

test('cb N2-a 기준13: .git/ 아래·worktree .git 파일 Write는 BLOCK, .gitignore·.gitattributes는 ALLOW', () => {
  const root = gitProject('main', 'quick');
  for (const f of ['.git/refs/heads/main', '.git/packed-refs', '.git/HEAD', '.git/info/attributes', '.git/config.worktree', '.orbit/wt/t1/.git', 'x/.git/HEAD'])
    assert.equal(exitW(root, f, ENG), 2, f);
  for (const f of ['.gitignore', '.gitattributes']) assert.equal(exitW(root, f, ENG), 0, f);
});

test('cb N2-b 기준14: main의 정당한 흐름(읽기·다른 브랜치로 가기·fetch·통과한 merge) ALLOW', () => {
  const root = shipProject('main', 'full', FULL_PASS);
  for (const c of ['status', 'log --oneline -5', 'diff', 'show HEAD', 'rev-parse HEAD', 'fetch origin']) assert.equal(exitOf(root, `${G} ${c}`, ENG), 0, c); // rev-parse는 FREE_SHELL 역할만
  for (const c of ['status', 'log --oneline -5', 'diff', 'show HEAD']) assert.equal(exitOf(root, `${G} ${c}`, 'orbit:reviewer-rules'), 0, c);
  for (const c of ['branch --show-current', 'switch orbit/r1', 'switch -c orbit/next']) assert.equal(exitOf(root, `${G} ${c}`), 0, `Lead ${c}`);
  assert.equal(exitOf(root, `${G} switch main`, 'orbit:librarian'), 0);
  assert.equal(exitOf(root, MERGE, 'orbit:librarian'), 0);
});

test('cb N2-b 기준15: run 브랜치에서는 쓰기 git ALLOW(메시지 속 merge·CD 단어 포함)', () => {
  const root = shipProject('orbit/r1', 'quick');
  for (const c of ['commit -am x', 'cherry-pick abc1234', 'revert HEAD', 'reset --hard HEAD~1', 'stash pop', 'commit -m "merge notes"', 'commit -m "fix typo"'])
    assert.equal(exitOf(root, `${G} ${c}`, ENG), 0, c);
  assert.equal(exitOf(root, `${G} commit -m "add CD workflow"`, ENG), 2); // 위치 단어는 메시지 속이어도 막는다(-F를 쓴다)
  assert.equal(exitOf(root, `${G} commit -F .orbit/runs/r1/msg.txt`, ENG), 0);
  for (const c of ['add CHANGELOG.md', 'commit -F .orbit/runs/r1/msg.txt']) assert.equal(exitOf(root, `${G} ${c}`, 'orbit:librarian'), 0, c);
});

test('cb N2-c 기준16: 멈춘 rebase는 그 run 브랜치로, 그냥 떼어진 HEAD는 main으로', () => {
  const root = shipProject('orbit/r1', 'standard');
  writeFileSync(join(root, 'a.txt'), 'run\n');
  gitIn(root, 'add', 'a.txt');
  gitIn(root, 'commit', '-q', '-m', 'run');
  gitIn(root, 'switch', '-q', 'main');
  writeFileSync(join(root, 'a.txt'), 'main\n');
  gitIn(root, 'add', 'a.txt');
  gitIn(root, 'commit', '-q', '-m', 'main');
  gitIn(root, 'switch', '-q', 'orbit/r1');
  assert.throws(() => gitIn(root, 'rebase', 'main')); // 충돌로 멈춘다(HEAD 떼어짐)
  assert.equal(gitIn(root, 'branch', '--show-current'), '');
  for (const c of ['add a.txt', 'commit --amend --no-edit', 'rebase --continue']) assert.equal(exitOf(root, `${G} ${c}`, ENG), 0, c);
  const det = shipProject('orbit/r1', 'standard');
  gitIn(det, 'switch', '-q', '--detach');
  for (const c of ['add a.txt', 'commit --amend --no-edit', 'rebase --continue']) assert.equal(exitOf(det, `${G} ${c}`, ENG), 2, `detached ${c}`);
});

test('cb N3 기준17: --git-dir·GIT_DIR·$env:GIT_DIR·Push-Location·sl·-C·cd로 main을 건드리면 BLOCK', () => {
  const root = shipProject('orbit/r1', 'standard');
  const w = `../${basename(root)}-w`; // main을 체크아웃한 형제 worktree
  gitIn(root, 'worktree', 'add', '-q', join(root, w), 'main');
  const cmds = [`${G} --git-dir=${w}/.git --work-tree=${w} merge orbit/r1`, `GIT_DIR=${w}/.git ${G} merge orbit/r1`, `Push-Location ${w}; ${G} merge orbit/r1`,
    `sl ${w}; ${G} merge orbit/r1`, `GIT_DIR=${w}/.git ${G} commit -am x`, `${G} -C ${w} commit -am x`, `cd ${w}; ${G} cherry-pick orbit/r1`];
  for (const c of cmds) assert.equal(exitOf(root, c, ENG), 2, c);
  assert.equal(exitP(root, `$env:GIT_DIR='${w}/.git'; ${G} merge orbit/r1`, ENG), 2);
  assert.equal(exitP(root, `$env:GIT_DIR='${w}/.git'; ${G} commit -am x`, ENG), 2);
});

test('cb N3 기준18: rebase가 main을 옮기면 출고', () => {
  const root = shipProject('orbit/r1', 'standard');
  for (const c of ['rebase --onto orbit/r1 --root main', 'rebase --root main', 'rebase --onto orbit/r1 HEAD~1 main', 'rebase -i --onto orbit/r1 main~1 master'])
    assert.equal(exitOf(root, `${G} ${c}`, ENG), 2, c);
});

test('cb N3 기준19: upstream 자리의 main·rebase --continue·merge main은 ALLOW', () => {
  const root = shipProject('orbit/r1', 'standard');
  for (const c of ['rebase main', 'rebase -i main', 'rebase origin/main', 'rebase --onto main HEAD~2', 'merge main', 'rebase --continue'])
    assert.equal(exitOf(root, `${G} ${c}`, ENG), 0, c);
});

test('cb N3 기준20: 프로젝트 안 문자 그대로의 경로 -C·cd는 그 브랜치로, 모르는 경로는 main으로', () => {
  const root = shipProject('main', 'standard');
  gitIn(root, 'worktree', 'add', '-q', '-b', 'orbit/r1-t1', '.orbit/wt/t1');
  for (const c of [`${G} -C .orbit/wt/t1 commit -am x`, `cd .orbit/wt/t1 && ${G} commit -am x`]) assert.equal(exitOf(root, c, ENG), 0, c);
  for (const c of [`cd $d; ${G} commit -am x`, `${G} -C .. commit -am x`, `${G} commit -am x`]) assert.equal(exitOf(root, c, ENG), 2, c); // 마지막은 main 대조
});

test('cb N4 기준22: ~/.gitconfig·~/.config/git·XDG git 설정 Write는 BLOCK, docs/gitconfig-notes.md는 ALLOW', () => {
  const root = gitProject('main', 'quick');
  const xdg = mkdtempSync(join(tmpdir(), 'orbit-xdg-'));
  const at = (f, who, env) => spawnGate([], { input: JSON.stringify(wr(root, f, who)), root, env }).status;
  for (const who of [ENG, 'orbit:qa', undefined])
    for (const f of [join(homedir(), '.gitconfig'), join(homedir(), '.config/git/config'), join(homedir(), '.config/git/attributes')]) assert.equal(at(f, who), 2, `${who} ${f}`);
  for (const who of [ENG, 'orbit:qa', undefined]) assert.equal(at(join(xdg, 'git/config'), who, { XDG_CONFIG_HOME: xdg }), 2, `XDG ${who}`);
  assert.equal(at('docs/gitconfig-notes.md', ENG), 0);
});

test('cb N4 기준23: git config 쓰기는 모든 역할 BLOCK, --get·--list·-l은 ALLOW', () => {
  const root = shipProject('orbit/r1', 'quick'); // run 브랜치: ALLOW 대조가 N2-b에 걸리지 않는다
  const writes = ['config --global core.fsmonitor x', 'config core.hooksPath x', 'config --file ~/.gitconfig a.b c', 'config core.fsmonitor "x --list "']; // 마지막: 따옴표 안의 --list는 읽기가 아니다
  for (const who of [ENG, 'orbit:qa', 'orbit:security', 'orbit:librarian', 'orbit:reviewer-rules', undefined])
    for (const c of writes) assert.equal(exitOf(root, `${G} ${c}`, who), 2, `${who} ${c}`);
  for (const c of ['config --get user.name', 'config --list', 'config -l']) assert.equal(exitOf(root, `${G} ${c}`, ENG), 0, c);
});

test('cb P5: rebase feat main은 BLOCK, merge -F .orbit/… orbit/<id>는 ALLOW', () => {
  const run = shipProject('orbit/r1', 'quick', QUICK);
  assert.equal(exitOf(run, `${G} rebase feat main`, ENG), 2);
  assert.equal(exitOf(run, `${G} rebase feat`, ENG), 0); // 대조
  const main = shipProject('main', 'quick', QUICK);
  assert.equal(exitOf(main, `${G} merge -F .orbit/runs/r1/msg.txt orbit/r1`, ENG), 0);
});

test('rf1 B1: -m 값 속 명령 치환(큰따옴표·백틱)의 위치 변경·merge·cherry-pick은 BLOCK, 일반 메시지는 ALLOW', () => {
  const root = shipProject('orbit/r1', 'standard');
  const w = `../${basename(root)}-w2`;
  gitIn(root, 'worktree', 'add', '-q', join(root, w), 'main');
  const cmds = [`${G} commit --allow-empty -m "$(${G} -C ${w} merge orbit/new)"`, `${G} commit --allow-empty -m "$(cd ${w} && ${G} merge orbit/r1)"`,
    `${G} commit --allow-empty -m "$(${G} -C ${w} cherry-pick orbit/r1)"`, `${G} commit --allow-empty -m "\`${G} -C ${w} merge orbit/new\`"`,
    `${G} commit --allow-empty -m "\`cd ${w} && ${G} merge orbit/r1\`"`, `${G} commit --allow-empty -m "\`${G} -C ${w} cherry-pick orbit/r1\`"`];
  for (const c of cmds) assert.equal(exitOf(root, c, ENG), 2, c);
  assert.equal(exitOf(root, `${G} commit -m "add CD workflow"`, ENG), 2);
  assert.equal(exitOf(root, `${G} commit -m "use sl and merge"`, ENG), 2);
  assert.equal(exitOf(root, `${G} commit -F .orbit/runs/r1/msg.txt`, ENG), 0);
  assert.equal(exitOf(root, `${G} commit -m "fix typo"`, ENG), 0);
});

test('rf2 N1·N2·R5: 걷어내기 없이 원문 전체에 적용 — -m 뒤 위치 변경·main} 꼴·rebase 따옴표 구분자는 BLOCK', () => {
  const root = shipProject('orbit/r1', 'standard');
  const cmds = [`${G} commit --allow-empty -m x;cd ../w;${G} merge orbit/r1`, `${G} commit --allow-empty -m x;Set-Location ../w;${G} merge orbit/r1`,
    `${G} commit --allow-empty -m x&&cd ../w&&${G} merge orbit/r1`, `echo " -m 'a" ; cd ../w ; ${G} merge orbit/r1 ; echo "'"`,
    `${G} commit --allow-empty -m x;cd ../w;${G} cherry-pick orbit/r1`, `& {${G} rebase orbit/r1 main}`, `pwsh -Command "& {${G} rebase orbit/r1 main}"`,
    `${G} rebase orbit/r1 main>/dev/null`, `${G} rebase --exec "a; b" feat main`];
  for (const c of cmds) assert.equal(exitOf(root, c, ENG), 2, c);
});

test('rf1 B2: 따옴표 안의 rebase가 main을 옮기면 BLOCK, 값 받는 옵션은 값을 세지 않는다', () => {
  const root = shipProject('orbit/r1', 'standard');
  const cmds = [`bash -c "${G} rebase orbit/r1 main"`, `${G} commit --allow-empty -m "$(${G} rebase orbit/r1 main)"`, `${G} commit --allow-empty -m "\`${G} rebase orbit/r1 main\`"`,
    `${G} rebase -x make feat main`, `${G} rebase -s ours feat main`, `${G} rebase -X theirs feat main`, `${G} rebase --exec "a b" feat main`];
  for (const c of cmds) assert.equal(exitOf(root, c, ENG), 2, c);
  assert.equal(exitOf(root, `${G} rebase --exec "a; b" main`, ENG), 0); // upstream 자리의 main
  for (const c of [`rebase --exec "make test" main`, `rebase -x make main`]) assert.equal(exitOf(root, `${G} ${c}`, ENG), 2, c); // 옛 원문 정규식이 잡는 형태(상위 집합): 과차단 수용
});

test('rf1 R3·R4: src/docs/·src/CHANGELOG.js 커밋은 BLOCK, --git-dir 단독도 BLOCK, main의 checkout <경로>는 BLOCK', () => {
  for (const f of ['src/docs/a.ts', 'src/CHANGELOG.js']) {
    const root = shipProject('main', 'full', FULL_PASS);
    advance(root, { [f]: 'x' });
    assert.equal(exitOf(root, MERGE), 2, f);
  }
  const run = shipProject('orbit/r1', 'standard');
  const w = `../${basename(run)}-w3`;
  gitIn(run, 'worktree', 'add', '-q', join(run, w), 'main');
  assert.equal(exitOf(run, `${G} --git-dir=${w}/.git commit -am x`, ENG), 2);
  const main = shipProject('main', 'quick', QUICK);
  for (const c of ['checkout .', 'checkout src/a.ts', 'checkout orbit/r1']) assert.equal(exitOf(main, `${G} ${c}`, ENG), 2, c);
  assert.equal(exitOf(main, `${G} switch orbit/r1`, ENG), 0);
});

test('rf3 B3: orbit/<다른id> 뒤에 ~·>·}가 붙어도 id 판정에 잡혀 BLOCK, 깨끗한 orbit/<id>·ref 없는 push는 ALLOW', () => {
  const root = shipProject('orbit/r1', 'quick', QUICK);
  const cmds = [`${G} ${P} origin orbit/other~0:main`, `${G} rebase --onto orbit/other~0 orbit/r1 main`, `${G} ${P} origin orbit/other>/dev/null`,
    `& {${G} ${P} origin orbit/other}`, `${G} ${P} origin orbit/r1~1`, `${G} ${P} origin orbit/r1/t1`, `${G} ${P} origin orbit/r1>/dev/null`];
  for (const c of cmds) assert.equal(exitOf(root, c, ENG), 2, c);
  for (const c of [`${G} ${P}`, `${G} ${P} origin orbit/r1`]) assert.equal(exitOf(root, c, ENG), 0, c);
  // 문서(SKILL 과차단)용: 옵션 값을 main 뒤로 옮기면 통과, --continue에 2>&1·-c를 붙여도 통과
  for (const c of [`rebase main --exec "make test"`, `rebase main -x make`, `rebase --continue 2>&1`, `-c core.editor=true rebase --continue`]) assert.equal(exitOf(root, `${G} ${c}`, ENG), 0, c);
});

test('rf1 R2: COMMIT 불일치 사유에 다음 할 일이 붙는다', () => {
  const root = shipProject('main', 'full', FULL_PASS);
  advance(root, { 'src/b.ts': 'x' });
  assert.match(reasonOf(root, MERGE), /COMMIT 줄을 고친다/);
});

test('lf1: 따옴표 친 --output, 묶어 쓴 -fC, --discard-changes, grep -O는 제한 셸에서 BLOCK', () => {
  const root = shipProject('orbit/r1', 'standard');
  const lead = (command) => decide({ ...bash(command), cwd: root }, root);
  const reviewer = (command) => decide({ ...bash(command, 'a1'), agent_type: 'orbit:reviewer-rules', cwd: root }, root);
  const eng = (command) => decide({ ...bash(command, 'a1'), cwd: root }, root);
  const bad = ['git log -1 "--output=out.txt"', "git show -s '--output=out.txt'", 'git switch -fC main', 'git switch -Cf main', 'git switch -fc x',
    'git switch --discard-changes orbit/r1', 'git grep -Oless foo', 'git grep -nO less foo', 'git grep --open-files-in-pager=less foo'];
  for (const c of bad) assert.notEqual(lead(c), null, c);
  for (const c of ['git log -1 "--output=out.txt"', 'git grep -Oless foo']) assert.notEqual(reviewer(c), null, c);
  for (const c of ['git switch -fC main', 'git checkout -fB main']) assert.match(eng(c), /차단/, c); // 자유 셸 역할도 출고 판정에 걸린다
  const ok = ['git log -1 --format=%s', 'git diff main...HEAD --stat', 'git switch -c orbit/x', 'git merge --no-ff -m t1 orbit-wt/r1/t1', 'git log -S useEffect', 'git status -sb'];
  for (const c of ok) assert.equal(lead(c), null, c);
});

test('lf2: 읽기 전용 셸에서 git grep·ls-files 허용(main 위 포함), 그 밖의 검색·파이프는 그대로 BLOCK', () => {
  for (const branch of ['orbit/r1', 'main']) {
    const root = shipProject(branch, 'standard');
    const as = (agent_type) => (command) => decide({ ...bash(command, agent_type && 'a1'), agent_type, cwd: root }, root);
    const read = ['git grep -n useEffect -- src', 'git ls-files src', 'git ls-files --others --exclude-standard .orbit'];
    for (const who of [undefined, 'orbit:reviewer-maintainability', 'orbit:librarian', 'Explore'])
      for (const c of read) assert.equal(as(who)(c), null, branch + ' ' + who + ' ' + c);
    assert.equal(as('orbit:librarian')('git show --stat HEAD'), null, branch);
    for (const c of ['git grep -n foo | head', 'git ls-files src > out.txt', 'ls src', 'grep -rn foo src']) assert.notEqual(as('orbit:reviewer-rules')(c), null, branch + ' ' + c);
  }
});
