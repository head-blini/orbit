// QA probe 2: 기준 9(push·publish)·10(후손 허용 범위)·N4·실패 경로. 임시 저장소만 사용.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const HOOK = join('C:/Users/lclk1/Projects/orbit/harness/hooks', 'gate' + '.mjs');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const hook = (root, p, env = {}) => { const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: root, ...p }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, ORBIT_GATE: undefined, ...env } }); return { code: r.status, err: r.stderr.trim().split('\n')[0] }; };
const sh = (root, command, agent_type, extra = {}) => hook(root, { tool_name: 'Bash', tool_input: { command }, agent_id: agent_type && 'a1', agent_type });
const PASS = '```\n$ npm test\n3 passed\n```\nVERDICT: PASS\n';
let bad = 0;
const rec = (n, g, want) => { const ok = (want === 'ALLOW') === (g.code === 0) && (want !== 'BLOCK' || g.code === 2); if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '}${n} -> exit ${g.code} (want ${want}) ${g.err ?? ''}`); };
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'qa-probe2-')); const d = join(root, '.orbit/runs/A'); mkdirSync(d, { recursive: true });
  writeFileSync(join(root, '.orbit/current'), 'A\n'); writeFileSync(join(d, 'STATE.json'), JSON.stringify({ track: 'full', approvals: [{ gate: 'deploy', result: 'approved' }] }));
  mkdirSync(join(root, 'docs/solutions'), { recursive: true });
  git(root, 'init', '-q', '-b', 'main'); git(root, 'commit', '-q', '--allow-empty', '-m', 'base'); git(root, 'switch', '-q', '-c', 'orbit/A'); git(root, 'commit', '-q', '--allow-empty', '-m', 'work');
  const sha = git(root, 'rev-parse', 'HEAD');
  for (const g of ['PLAN_CHECK', 'REVIEW']) writeFileSync(join(d, g + '.md'), PASS);
  for (const g of ['VERIFY', 'SECURITY']) writeFileSync(join(d, g + '.md'), `COMMIT: ${sha}\n` + PASS);
  return root;
}
const commitFile = (r, f, body = 'x') => { mkdirSync(join(r, f, '..'), { recursive: true }); writeFileSync(join(r, f), body); git(r, 'add', '--', f); git(r, 'commit', '-q', '-m', 'c ' + f); };
// 9
{ const r = repo(); rec('9 push @bound HEAD', sh(r, 'git push', 'orbit:engineer'), 'ALLOW'); rec('9 npm publish @bound HEAD', sh(r, 'npm publish', 'orbit:engineer'), 'ALLOW');
  commitFile(r, 'src/a.ts'); rec('9 push after src commit', sh(r, 'git push', 'orbit:engineer'), 'BLOCK'); rec('9 npm publish after src commit', sh(r, 'npm publish', 'orbit:engineer'), 'BLOCK'); }
// 10
{ const r = repo(); commitFile(r, 'CHANGELOG.md'); commitFile(r, 'docs/solutions/x.md'); git(r, 'switch', '-q', 'main');
  rec('10 merge after CHANGELOG+docs commits', sh(r, 'git merge --no-ff orbit/A', 'orbit:librarian'), 'ALLOW'); }
{ const r = repo(); commitFile(r, 'src/a.ts'); git(r, 'switch', '-q', 'main'); rec('10 merge after src/a.ts', sh(r, 'git merge --no-ff orbit/A', 'orbit:librarian'), 'BLOCK'); }
{ const r = repo(); commitFile(r, 'harness/agents/qa.md'); git(r, 'switch', '-q', 'main'); rec('10 merge after harness/agents/qa.md', sh(r, 'git merge --no-ff orbit/A', 'orbit:librarian'), 'BLOCK'); }
// 12 (main 위, 통과 상태)
{ const r = repo(); git(r, 'switch', '-q', 'main');
  for (const c of ['git cherry-pick orbit/A', 'git commit -am x', 'git checkout orbit/A -- b.txt', 'git restore --source orbit/A b.txt', 'git am x.patch', 'git revert HEAD', 'git reset --soft orbit/A', 'git reset orbit/A', 'git stash pop']) rec('12 engineer main: ' + c, sh(r, c, 'orbit:engineer'), 'BLOCK');
  for (const c of ['git add src/a.ts', 'git commit -F msg.txt']) rec('12 librarian main: ' + c, sh(r, c, 'orbit:librarian'), 'BLOCK');
  for (const c of ['git status', 'git log --oneline -5', 'git diff', 'git show HEAD', 'git rev-parse HEAD']) rec('14 engineer main: ' + c, sh(r, c, 'orbit:engineer'), 'ALLOW');
  rec('14 lead branch --show-current', sh(r, 'git branch --show-current'), 'ALLOW'); rec('14 lead switch -c orbit/next', sh(r, 'git switch -c orbit/next'), 'ALLOW'); }
// 15 run branch
{ const r = repo();
  for (const c of ['git commit -am x', 'git cherry-pick abc1234', 'git revert HEAD', 'git reset --hard HEAD~1', 'git stash pop']) rec('15 engineer run-branch: ' + c, sh(r, c, 'orbit:engineer'), 'ALLOW');
  rec('15 librarian add CHANGELOG.md', sh(r, 'git add CHANGELOG.md', 'orbit:librarian'), 'ALLOW'); }
// 22 N4 Write
{ const r = repo(); const home = process.env.USERPROFILE.replaceAll('\\', '/'); const W = (f, t = 'orbit:engineer', tool = 'Write') => hook(r, { tool_name: tool, tool_input: { file_path: f }, agent_id: 'a1', agent_type: t });
  for (const f of [home + '/.gitconfig', home + '/.config/git/config', home + '/.config/git/attributes', r + '/.git/refs/heads/main', r + '/.git/HEAD', r + '/.git/packed-refs', r + '/.git/info/attributes']) rec('22/13 engineer Write ' + f.replace(home, '~'), W(f), 'BLOCK');
  rec('22 qa Write ~/.gitconfig', W(home + '/.gitconfig', 'orbit:qa'), 'BLOCK'); rec('22 lead Edit ~/.gitconfig', hook(r, { tool_name: 'Edit', tool_input: { file_path: home + '/.gitconfig' } }), 'BLOCK');
  const xdg = mkdtempSync(join(tmpdir(), 'xdg-')); const gx = hook(r, { tool_name: 'Write', tool_input: { file_path: xdg.replaceAll('\\', '/') + '/git/config' }, agent_id: 'a1', agent_type: 'orbit:engineer' }, { XDG_CONFIG_HOME: xdg }); rec('22 XDG git/config', gx, 'BLOCK');
  rec('22 docs/gitconfig-notes.md ALLOW', W(r + '/docs/gitconfig-notes.md'), 'ALLOW'); rec('13 .gitignore ALLOW', W(r + '/.gitignore'), 'ALLOW'); rec('13 .gitattributes ALLOW', W(r + '/.gitattributes'), 'ALLOW');
  for (const c of ['git config --global core.fsmonitor x', 'git config core.hooksPath x', 'git config --file ~/.gitconfig a.b c']) rec('23 ' + c, sh(r, c, 'orbit:engineer'), 'BLOCK');
  for (const c of ['git config --get user.name', 'git config --list', 'git config -l']) rec('23 ' + c, sh(r, c, 'orbit:engineer'), 'ALLOW'); }
console.log(bad ? `PROBE2 BAD=${bad}` : 'PROBE2 ALL OK'); process.exit(bad ? 1 : 0);
