// Security probe (read-only against the project): imports decide() from the real gate and runs it
// against a temp git repo in the scratchpad. The project working tree is not modified.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'C:/Users/lclk1/Projects/orbit';
const GATE = REPO + '/harness/hooks/gate.mjs';
const BASE = process.argv[2];
const { decide, gateFailure } = await import(pathToFileURL(GATE).href);

const root = join(BASE, 'root');
const wdir = join(BASE, 'w');
for (const d of [wdir, root]) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'p@example.invalid');
git('config', 'user.name', 'probe');
writeFileSync(join(root, 'a.txt'), 'base\n');
git('add', 'a.txt');
git('commit', '-qm', 'base');
git('branch', 'orbit/old');
git('switch', '-qc', 'orbit/new');
writeFileSync(join(root, 'b.txt'), 'unvetted\n');
git('add', 'b.txt');
git('commit', '-qm', 'unvetted');
mkdirSync(join(root, '.orbit/runs/old'), { recursive: true });
mkdirSync(join(root, '.orbit/runs/new'), { recursive: true });
writeFileSync(join(root, '.orbit/runs/old/STATE.json'), JSON.stringify({ track: 'quick', approvals: [] }));
writeFileSync(join(root, '.orbit/runs/old/VERIFY.md'), '```\nok\n```\nVERDICT: PASS\n');
writeFileSync(join(root, '.orbit/runs/new/STATE.json'), JSON.stringify({ track: 'full', approvals: [] }));
const setCurrent = (id) => writeFileSync(join(root, '.orbit/current'), id + '\n');

const sh = (cmd, agent) => ({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: root, ...(agent ? { agent_type: agent, agent_id: 'x1' } : {}) });
const show = (label, p) => {
  const r = decide(p, root);
  console.log(`${r ? 'BLOCK' : 'ALLOW'}  ${label}${r ? '  | ' + r.slice(0, 80) : ''}`);
};

console.log('--- S1 (branch main)');
git('switch', '-q', 'main');
setCurrent('new');
show('lead merge orbit/new, current=new (not passed)', sh('git merge orbit/new'));
setCurrent('old');
show('lead merge orbit/new, current=old (passed quick)', sh('git merge orbit/new'));
show('lead merge orbit/old, current=old', sh('git merge orbit/old'));
console.log('--- S1 residual: Lead points the passed run branch at unvetted commits');
git('switch', '-q', 'orbit/old');
show('lead on orbit/old: git merge orbit/new', sh('git merge orbit/new'));
show('lead: git switch -c orbit/old2 orbit/new', sh('git switch -c orbit/old2 orbit/new'));
show('lead Write .orbit/current = old', { tool_name: 'Write', tool_input: { file_path: join(root, '.orbit/current'), content: 'old\n' }, cwd: root });
git('merge', '-q', '--ff-only', 'orbit/new');
git('switch', '-q', 'main');
show('lead on main: git merge orbit/old (now holds unvetted commit)', sh('git merge orbit/old'));

console.log('--- main changed without merge (engineer, branch main, current=new not passed)');
setCurrent('new');
for (const c of ['git cherry-pick orbit/new', 'git commit -am x', 'git checkout orbit/new -- b.txt', 'git restore --source orbit/new b.txt', 'git am x.patch', 'git revert HEAD'])
  show(`engineer on main: ${c}`, sh(c, 'orbit:engineer'));
show('librarian on main: git commit -F msg.txt', sh('git commit -F msg.txt', 'orbit:librarian'));
show('librarian on main: git add src/a.ts', sh('git add src/a.ts', 'orbit:librarian'));

console.log('--- other worktree / git-dir / location change (engineer on orbit/new, current=new not passed)');
git('switch', '-q', 'orbit/new');
for (const c of [
  'git --git-dir=../w/.git --work-tree=../w merge orbit/new',
  'GIT_DIR=../w/.git git merge orbit/new',
  'cd ../w; git merge orbit/new',
  'Push-Location ../w; git merge orbit/new',
  'sl ../w; git merge orbit/new',
  'git rebase --onto orbit/new --root main',
  'git rebase orbit/new main',
])
  show(`engineer on orbit/new: ${c}`, sh(c, 'orbit:engineer'));

console.log('--- semantics in temp repo');
const before = git('rev-parse', 'main');
try { git('rebase', '-q', '--onto', 'orbit/new', '--root', 'main'); } catch (e) { console.log('rebase err', String(e.stderr).slice(0, 200)); }
console.log(`rebase --onto orbit/new --root main: main moved=${git('rev-parse', 'main') !== before}, main has b.txt=${git('ls-tree', '--name-only', 'main').split('\n').includes('b.txt')}`);
git('switch', '-q', 'orbit/new');
git('branch', '-qf', 'main', before);
git('worktree', 'add', '-q', wdir, 'main');
execFileSync('git', ['--git-dir=' + join(root, '.git/worktrees/w'), '--work-tree=' + wdir, 'merge', '-q', 'orbit/new'], { cwd: root, stdio: 'ignore' });
console.log(`--git-dir merge into main worktree: main moved=${git('rev-parse', 'main') !== before}, current branch=${git('rev-parse', '--abbrev-ref', 'HEAD')}`);
git('worktree', 'remove', '--force', wdir);
git('branch', '-qf', 'main', before);

console.log('--- S7 neighbours (engineer Write)');
const home = process.env.USERPROFILE ?? process.env.HOME;
const wr = (f) => ({ tool_name: 'Write', tool_input: { file_path: f, content: 'x' }, cwd: root, agent_type: 'orbit:engineer', agent_id: 'x1' });
for (const f of [join(home, '.gitconfig'), join(home, '.config/git/config'), join(root, '.git/info/attributes'), join(root, '.git/config.worktree'), join(root, '.git/refs/heads/main'), join(root, '.git/packed-refs')])
  show(`engineer Write ${f.replace(home, '~').replace(root, '<root>')}`, wr(f));

console.log('--- regex time (hook timeout 10s; a timeout lets the tool run)');
const time = (label, cmd, agent = 'orbit:engineer') => {
  const t = Date.now();
  decide(sh(cmd, agent), root);
  console.log(`${String(Date.now() - t).padStart(7)}ms  ${label} (len ${cmd.length})`);
};
for (const n of [2000, 8000, 32000]) {
  time(`git rebase + "a " x${n}`, 'git rebase ' + 'a '.repeat(n));
  time(`git branch + " -" x${n}`, 'git branch' + ' -'.repeat(n));
  time(`git merge + " x" x${n}`, 'git merge' + ' x'.repeat(n));
  time(`vercel + " a" x${n}`, 'vercel' + ' a'.repeat(n));
  time(`git + "-x " x${n} + status`, 'git ' + '-x '.repeat(n) + 'status');
  time(`git fetch + " a:" x${n}`, 'git fetch' + ' a:'.repeat(n));
  time(`lead git log + " a" x${n}`, 'git log' + ' a'.repeat(n), undefined);
}

console.log('--- real old run gate status (read only)');
for (const g of ['plan', 'review', 'verify', 'security']) console.log(`harness-plugin ${g}: ${gateFailure(join(REPO, '.orbit/runs/20261114-harness-plugin'), g) ?? 'PASS'}`);
