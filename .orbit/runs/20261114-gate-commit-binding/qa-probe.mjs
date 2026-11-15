// QA probe: 실제 git 임시 저장소에서 적용된 훅을 직접 실행한다. 실제 저장소·.orbit/current는 건드리지 않는다.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = join('C:/Users/lclk1/Projects/orbit/harness/hooks', 'gate' + '.mjs');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const hook = (root, command, agent_type, tool = 'Bash') => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name: tool, cwd: root, tool_input: { command }, agent_id: agent_type && 'a1', agent_type }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, ORBIT_GATE: undefined } });
  return { code: r.status, err: r.stderr.trim().split('\n')[0], ms: Date.now() - t0 };
};
const ship = (root) => { const r = spawnSync(process.execPath, [HOOK, 'check', 'ship'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } }); return { code: r.status, out: r.stdout.trim() }; };
const PASS = '```\n$ npm test\n3 passed\n```\nVERDICT: PASS\n';
function repo(id = 'A', track = 'full') {
  const root = mkdtempSync(join(tmpdir(), 'qa-probe-'));
  mkdirSync(join(root, '.orbit/runs', id), { recursive: true });
  writeFileSync(join(root, '.orbit/current'), id + '\n');
  writeFileSync(join(root, '.orbit/runs', id, 'STATE.json'), JSON.stringify({ track }));
  git(root, 'init', '-q', '-b', 'main'); git(root, 'commit', '-q', '--allow-empty', '-m', 'base');
  git(root, 'switch', '-q', '-c', `orbit/${id}`); git(root, 'commit', '-q', '--allow-empty', '-m', 'work');
  return root;
}
const bind = (root, id = 'A', files = ['VERIFY', 'SECURITY'], sha = git(root, 'rev-parse', 'HEAD')) => {
  const d = join(root, '.orbit/runs', id);
  for (const g of ['PLAN_CHECK', 'REVIEW']) writeFileSync(join(d, g + '.md'), PASS);
  for (const g of ['VERIFY', 'SECURITY']) writeFileSync(join(d, g + '.md'), (files.includes(g) ? `COMMIT: ${sha}\n` : '') + PASS);
  return sha;
};
const rows = [];
const rec = (name, got, want) => { const ok = want === 'ALLOW' ? got.code === 0 : got.code === 2; rows.push(ok); console.log(`${ok ? 'OK  ' : 'BAD '}${name} -> exit ${got.code} (want ${want}) ${got.err ?? ''}`); };

// 기준 4·5·6
let r = repo(); const sha = bind(r); git(r, 'switch', '-q', 'main');
rec('4 main merge orbit/A (bound)', hook(r, 'git merge --no-ff orbit/A', 'orbit:librarian'), 'ALLOW');
let s = ship(r); console.log('4 check ship', s.code, s.out); rows.push(s.code === 0);
git(r, 'switch', '-q', '-c', 'orbit/B', 'main'); writeFileSync(join(r, 'b.txt'), 'x'); git(r, 'add', 'b.txt'); git(r, 'commit', '-q', '-m', 'unreviewed');
git(r, 'switch', '-q', 'orbit/A');
rec('5 on orbit/A: merge orbit/B (run branch)', hook(r, 'git merge orbit/B', undefined), 'ALLOW');
git(r, 'merge', '-q', '--no-edit', 'orbit/B'); git(r, 'switch', '-q', 'main');
rec('5 main merge orbit/A after unreviewed merged', hook(r, 'git merge --no-ff orbit/A', undefined), 'BLOCK');
s = ship(r); console.log('5 check ship', s.code, s.out.split('\n').filter((l) => /commit/.test(l)).join(' | ')); rows.push(s.code === 1);
git(r, 'branch', '-D', 'orbit/A'); git(r, 'switch', '-q', '-c', 'orbit/A', 'orbit/B'); git(r, 'switch', '-q', 'main');
rec('6 recreated orbit/A from B', hook(r, 'git merge orbit/A', undefined), 'BLOCK');

// 기준 7
for (const [label, mod] of [['no COMMIT line', (d) => writeFileSync(join(d, 'VERIFY.md'), PASS)], ['short hash', (d) => writeFileSync(join(d, 'VERIFY.md'), 'COMMIT: ' + sha.slice(0, 7) + '\n' + PASS)], ['non-hex', (d) => writeFileSync(join(d, 'VERIFY.md'), 'COMMIT: ' + 'z'.repeat(40) + '\n' + PASS)], ['VERIFY!=SECURITY', (d) => writeFileSync(join(d, 'SECURITY.md'), 'COMMIT: ' + 'a'.repeat(40) + '\n' + PASS)]]) {
  const q = repo(); bind(q); mod(join(q, '.orbit/runs/A')); git(q, 'switch', '-q', 'main');
  rec('7 ' + label, hook(q, 'git merge --no-ff orbit/A', undefined), 'BLOCK');
}
// 기준 9: push HEAD
{ const q = repo(); bind(q);
  rec('9 push at bound HEAD (engineer)', hook(q, 'git push', 'orbit:engineer'), 'ALLOW');
  git(q, 'commit', '-q', '--allow-empty', '-m', 'more');
  rec('9 push after extra commit', hook(q, 'git push', 'orbit:engineer'), 'BLOCK'); }
// 기준 21: 실제 git으로 main이 움직임 + 같은 명령을 훅에 넣으면 BLOCK
{ const q = repo(); const w = q + '-w'; git(q, 'worktree', 'add', '-q', w, 'main');
  const c1 = `git --git-dir=${join(q, '.git/worktrees')} nop`; void c1;
  const hookCmd = `git --git-dir=${w}/.git --work-tree=${w} merge orbit/A`;
  rec('21 hook: --git-dir merge (engineer on orbit/A)', hook(q, hookCmd, 'orbit:engineer'), 'BLOCK');
  const before = git(q, 'rev-parse', 'main');
  // 실제 실행: worktree 쪽 git-dir로 main에 머지
  const gd = git(w, 'rev-parse', '--absolute-git-dir');
  git(q, `--git-dir=${gd}`, `--work-tree=${w}`, 'merge', '-q', '--no-edit', 'orbit/A');
  console.log('21 real: main moved', before.slice(0, 7), '->', git(q, 'rev-parse', 'main').slice(0, 7)); rows.push(before !== git(q, 'rev-parse', 'main'));
  // rebase --onto orbit/A --root main (실제)
  const q2 = repo(); git(q2, 'switch', '-q', '-c', 'orbit/X', 'orbit/A'); writeFileSync(join(q2, 'x.txt'), '1'); git(q2, 'add', 'x.txt'); git(q2, 'commit', '-q', '-m', 'x'); git(q2, 'switch', '-q', 'orbit/A');
  rec('21 hook: rebase --onto orbit/X --root main', hook(q2, 'git rebase --onto orbit/X --root main', 'orbit:engineer'), 'BLOCK');
  const b2 = git(q2, 'rev-parse', 'main');
  git(q2, 'switch', '-q', 'orbit/A'); git(q2, 'rebase', '-q', '--onto', 'orbit/X', '--root', 'main');
  console.log('21 real: main moved', b2.slice(0, 7), '->', git(q2, 'rev-parse', 'main').slice(0, 7)); rows.push(b2 !== git(q2, 'rev-parse', 'main')); }
// 기준 25: COMMIT 없는 옛 run(orbit/20261114-harness-plugin 이름) 사본
{ const id = '20261114-harness-plugin'; const q = repo(id); bind(q, id, []); git(q, 'switch', '-q', 'main');
  rec('25 old run, no COMMIT: main merge', hook(q, `git merge --no-ff orbit/${id}`, undefined), 'BLOCK');
  s = ship(q); console.log('25 check ship', s.code, s.out.split('\n').filter((l) => /commit/.test(l)).join(' | ')); rows.push(s.code === 1); }
// 훅 시간: git 없는 명령 / 읽기 git / 출고 판정
{ const q = repo(); bind(q); const t = [];
  for (const [n, c, a] of [['non-git (npm test)', 'npm test', 'orbit:engineer'], ['git status', 'git status', 'orbit:engineer'], ['git commit on run branch', 'git commit -am x', 'orbit:engineer'], ['ship merge (main)', 'git merge --no-ff orbit/A', undefined]]) {
    if (n.startsWith('ship')) git(q, 'switch', '-q', 'main');
    const xs = Array.from({ length: 5 }, () => hook(q, c, a).ms); xs.sort((x, y) => x - y); t.push(`${n}: min ${xs[0]}ms median ${xs[2]}ms max ${xs[4]}ms`); }
  console.log('TIMING (node spawn included):\n  ' + t.join('\n  ')); }
console.log(rows.every(Boolean) ? 'PROBE ALL OK' : 'PROBE HAS BAD');
process.exit(rows.every(Boolean) ? 0 : 1);
