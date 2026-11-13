// node --test .claude/hooks/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide, shipFailures } from './gate.mjs';

function project(track, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orbit-gate-'));
  const run = join(root, '.orbit/runs/r1');
  mkdirSync(run, { recursive: true });
  writeFileSync(join(root, '.orbit/current'), 'r1\n');
  writeFileSync(join(run, 'STATE.json'), JSON.stringify({ track }));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(run, name), body);
  return root;
}
const PASS = 'ok\nVERDICT: PASS\n';
const EVIDENCE = '```\n$ npm test\n3 passed\n```\nVERDICT: PASS\n';
const bash = (command, agent_id) => ({ tool_name: 'Bash', tool_input: { command }, agent_id, agent_type: agent_id && 'engineer' });
const write = (root, file, agent_id, agent_type = agent_id && 'engineer') => ({ tool_name: 'Write', cwd: root, tool_input: { file_path: file }, agent_id, agent_type });

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
  assert.equal(decide(write(root, '.orbit/runs/r1/STATE.json'), root), null);
  assert.match(decide(write(root, 'src/App.tsx'), root), /Lead/);
  assert.match(decide(write(root, '.orbit/../src/App.tsx'), root), /Lead/);
  assert.equal(decide(write(root, 'src/App.tsx', 'agent-1'), root), null);
  assert.match(decide(write(root, 'src/App.tsx', 'agent-2', 'qa'), root), /읽기 전용/);
  assert.equal(decide(write(root, '.orbit/runs/r1/VERIFY.md', 'agent-2', 'qa'), root), null);
  assert.equal(decide(bash('node .claude/hooks/gate.mjs check ship'), root), null);
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
  assert.equal(decide(write(root, '.claude/agents/qa.md', 'agent-1'), root), null);
  assert.match(decide(write(root, '.orbit/wt/t1/.claude/hooks/gate.mjs', 'agent-1'), root), /수정할 수 없음/);
  assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: 'x' } }, root), null);
});
