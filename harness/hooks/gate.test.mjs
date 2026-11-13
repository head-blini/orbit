// node --test harness/hooks/gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, shipFailures } from './gate.mjs';

function project(track, files = {}, state = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orbit-gate-'));
  const run = join(root, '.orbit/runs/r1');
  mkdirSync(run, { recursive: true });
  writeFileSync(join(root, '.orbit/current'), 'r1\n');
  writeFileSync(join(run, 'STATE.json'), JSON.stringify({ track, ...state }));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(run, name), body);
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
  const open = project('quick', { 'VERIFY.md': EVIDENCE });
  assert.equal(decide(bash('git merge feat', 'agent-1'), open), null);
  assert.equal(decide(bash('git commit -m "merge notes"', 'agent-1'), blocked), null);
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
  const root = project('quick', { 'VERIFY.md': EVIDENCE });
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

test('SECURITY.md 6) 우회 재현 22사례: 21 BLOCK + 1 ALLOW(미룸 H1)', () => {
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
    ['qa Bash write hooks (미룸 H1)', sh(root, 'echo x > .claude/hooks/gate.mjs', 'orbit:qa'), 'ALLOW'],
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
