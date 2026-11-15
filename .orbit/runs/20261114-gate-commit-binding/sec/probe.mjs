// security probe (read-only on the project): compares main's gate with the applied gate on temp repos in the scratchpad (argv[2]).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJ = 'C:\\Users\\lclk1\\Projects\\orbit';
const SCR = process.argv[2];
const NEWG = join(PROJ, 'harness', 'hooks', 'gate' + '.mjs');
rmSync(join(SCR, 'p'), { recursive: true, force: true });
mkdirSync(join(SCR, 'p', 'old'), { recursive: true });
const OLDG = join(SCR, 'p', 'old', 'gate' + '.mjs');
writeFileSync(OLDG, execFileSync('git', ['show', 'main:harness/hooks/gate' + '.mjs'], { cwd: PROJ }));
const oldG = await import(pathToFileURL(OLDG).href);
const newG = await import(pathToFileURL(NEWG).href);

const G = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const git = (cwd, ...a) => execFileSync('git', [...G, ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (cwd, ...a) => { try { return { ok: true, out: git(cwd, ...a) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message).trim().split('\n')[0] }; } };

function repo(name) {
  const root = join(SCR, 'p', name);
  mkdirSync(root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, '.gitignore'), '.orbit/\n');
  writeFileSync(join(root, 'a.txt'), 'a\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'init');
  git(root, 'switch', '-qc', 'orbit/new');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'evil.ts'), 'evil\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'unvetted');
  git(root, 'switch', '-q', 'main');
  git(root, 'switch', '-qc', 'orbit/A');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'ok.ts'), 'ok\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'reviewed');
  const bound = git(root, 'rev-parse', 'HEAD');
  const run = (id, files) => {
    const d = join(root, '.orbit', 'runs', id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'STATE.json'), JSON.stringify({ track: 'full', approvals: [{ gate: 'deploy', result: 'approved' }] }));
    for (const [f, t] of Object.entries(files)) writeFileSync(join(d, f), t);
  };
  const pass = () => `COMMIT: ${bound}\n\n\`\`\`\nok\n\`\`\`\nVERDICT: PASS\n`;
  run('A', { 'PLAN_CHECK.md': 'VERDICT: PASS\n', 'REVIEW.md': 'VERDICT: PASS\n', 'VERIFY.md': pass(), 'SECURITY.md': pass() });
  run('new', {});
  const w = join(SCR, 'p', name + '-w');
  git(root, 'worktree', 'add', '-q', w, 'main');
  return { root, w, bound, cur: (id) => writeFileSync(join(root, '.orbit', 'current'), id + '\n') };
}

const R = repo('r');
const pay = (role, cmd, cwd) => ({ tool_name: 'Bash', tool_input: { command: cmd }, cwd, ...(role === 'lead' ? {} : { agent_type: 'orbit:' + role, agent_id: 'x' }) });
const v = (g, role, cmd, cwd, root) => { try { const r = g.decide(pay(role, cmd, cwd), root); return r ? 'BLOCK' : 'ALLOW'; } catch (e) { return 'ERR ' + e.message; } };

// corpus: [role, where(main|A), cmd]
const C = [
  ['engineer', 'main', 'git merge orbit/A'], ['engineer', 'main', 'git merge orbit/new'], ['engineer', 'main', 'git commit -am x'],
  ['engineer', 'main', 'git cherry-pick orbit/new'], ['engineer', 'main', 'git checkout orbit/new -- a.txt'], ['engineer', 'main', 'git restore --source orbit/new a.txt'],
  ['engineer', 'main', 'git am x.patch'], ['engineer', 'main', 'git revert HEAD'], ['engineer', 'main', 'git reset --soft orbit/new'], ['engineer', 'main', 'git reset orbit/new'],
  ['engineer', 'main', 'git stash pop'], ['engineer', 'main', 'git pull . orbit/new'], ['engineer', 'main', 'git rebase orbit/new'], ['engineer', 'main', 'git update-ref refs/heads/main orbit/new'],
  ['engineer', 'main', 'git branch -f main orbit/new'], ['engineer', 'main', 'git push . orbit/new:main'], ['engineer', 'main', 'git fetch . orbit/new:main'], ['engineer', 'main', 'git read-tree -m -u orbit/new'],
  ['engineer', 'main', 'git apply x.patch'], ['engineer', 'main', 'git rm a.txt'], ['engineer', 'main', 'git symbolic-ref HEAD refs/heads/orbit/new'], ['engineer', 'main', 'git replace HEAD orbit/new'],
  ['engineer', 'main', 'git status'], ['engineer', 'main', 'git log --oneline -5'], ['engineer', 'main', 'git fetch origin'], ['engineer', 'main', 'git switch orbit/new'],
  ['lead', 'main', 'git merge orbit/A'], ['lead', 'main', 'git merge --no-ff orbit/new'], ['lead', 'main', 'git switch -c orbit/x'], ['lead', 'main', 'git branch --show-current'],
  ['librarian', 'main', 'git merge --no-ff orbit/A'], ['librarian', 'main', 'git add src/a.ts'], ['librarian', 'main', 'git commit -F msg.txt'],
  ['engineer', 'A', 'git merge orbit/new'], ['engineer', 'A', 'git commit -am x'], ['engineer', 'A', 'git push origin orbit/A'], ['engineer', 'A', 'git push . HEAD:main'],
  ['engineer', 'A', 'git --git-dir=../r-w/.git --work-tree=../r-w merge orbit/new'], ['engineer', 'A', 'git --git-dir=../r-w/.git commit -am x'], ['engineer', 'A', 'GIT_DIR=../r-w/.git git merge orbit/new'],
  ['engineer', 'A', "$env:GIT_DIR='../r-w/.git'; git merge orbit/new"], ['engineer', 'A', 'Push-Location ../r-w; git merge orbit/new'], ['engineer', 'A', 'sl ../r-w; git merge orbit/new'],
  ['engineer', 'A', 'git -C ../r-w commit -am x'], ['engineer', 'A', 'cd ../r-w; git cherry-pick orbit/new'], ['engineer', 'A', 'git rebase --onto orbit/new --root main'], ['engineer', 'A', 'git rebase --root main'],
  ['engineer', 'A', 'git rebase --onto orbit/new HEAD~1 main'], ['engineer', 'A', 'git rebase orbit/new main'], ['engineer', 'A', 'git rebase main'],
  ['engineer', 'A', 'git config --global core.fsmonitor x'], ['engineer', 'A', 'git config core.hooksPath x'], ['engineer', 'A', 'git config --get user.name'],
  ['engineer', 'A', "Start-Process git -ArgumentList 'config','--global','core.fsmonitor','x'"],
  ['engineer', 'A', "Start-Process git -WorkingDirectory ../r-w -ArgumentList 'merge','orbit/new' -Wait"],
  ['engineer', 'A', 'git symbolic-ref HEAD refs/heads/main; git commit -am x; git symbolic-ref HEAD refs/heads/orbit/A'],
  ['engineer', 'A', 'git symbolic-ref HEAD refs/heads/main; git merge --no-ff orbit/new'],
  ['engineer', 'A', 'git replace HEAD orbit/new'], ['engineer', 'A', 'echo 0000 > .git/refs/heads/main'],
  ['lead', 'A', 'git merge orbit/new'], ['lead', 'A', 'git switch -c orbit/old2 orbit/new'],
];

for (const state of ['A', 'new']) {
  R.cur(state);
  console.log(`\n--- current=${state} (${state === 'A' ? 'passed, COMMIT=orbit/A head' : 'not passed'}) — old | new | role@branch: cmd`);
  for (const [role, where, cmd] of C) {
    const cwd = where === 'main' ? R.w : R.root;
    const o = v(oldG, role, cmd, cwd, R.root), n = v(newG, role, cmd, cwd, R.root);
    const tag = o === 'BLOCK' && n === 'ALLOW' ? '  <<REGRESSION' : '';
    console.log(`${o.padEnd(5)} | ${n.padEnd(5)} | ${role}@${where}: ${cmd}${tag}`);
  }
}

// N1 chain: Lead merges unvetted into passed orbit/A, then merges orbit/A into main
R.cur('A');
console.log('\n--- N1 chain (current=A passed)');
console.log('lead@main merge orbit/A before:', v(newG, 'lead', 'git merge --no-ff orbit/A', R.w, R.root));
git(R.root, 'merge', '-q', '--no-ff', '-m', 'pull unvetted', 'orbit/new');
console.log('after merging orbit/new into orbit/A: old', v(oldG, 'lead', 'git merge --no-ff orbit/A', R.w, R.root), '/ new', v(newG, 'lead', 'git merge --no-ff orbit/A', R.w, R.root));
console.log('  reason:', newG.decide(pay('lead', 'git merge --no-ff orbit/A', R.w), R.root));
git(R.root, 'reset', '-q', '--hard', R.bound);

const desc = (file) => {
  git(R.root, 'reset', '-q', '--hard', R.bound);
  mkdirSync(join(R.root, ...file.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(join(R.root, file), 'x\n');
  git(R.root, 'add', '-f', file); git(R.root, 'commit', '-qm', 'after');
  const r = v(newG, 'librarian', 'git merge --no-ff orbit/A', R.w, R.root);
  git(R.root, 'reset', '-q', '--hard', R.bound);
  return r;
};
console.log('\n--- Q1a descendants (librarian@main merge orbit/A)');
for (const f of ['docs/solutions/x.md', 'CHANGELOG.md', 'CHANGELOG.config.mjs', 'docs/build.mjs', 'src/a.ts', 'harness/agents/qa.md', 'README.md']) console.log(desc(f).padEnd(5), f);

console.log('\n--- git replace (current=A passed)');
git(R.root, 'switch', '-q', '-c', 'evil', 'orbit/new');
writeFileSync(join(R.root, 'src', 'ok.ts'), 'ok\n'); git(R.root, 'add', '.'); git(R.root, 'commit', '-qm', 'evil twin');
const evil = git(R.root, 'rev-parse', 'HEAD');
git(R.root, 'switch', '-q', 'orbit/A');
console.log('engineer@orbit/A `git replace <bound> <evil>`:', v(newG, 'engineer', `git replace ${R.bound} ${evil}`, R.root, R.root));
git(R.root, 'replace', R.bound, evil);
console.log('rev-parse orbit/A^{commit} == bound:', git(R.root, 'rev-parse', 'orbit/A^{commit}') === R.bound);
console.log('librarian@main merge --no-ff orbit/A:', v(newG, 'librarian', 'git merge --no-ff orbit/A', R.w, R.root));
console.log('real merge ok:', tryGit(R.w, 'merge', '--no-ff', '-q', '-m', 'ship', 'orbit/A').ok);
console.log('main tree (--no-replace-objects) has src/evil.ts:', git(R.w, '--no-replace-objects', 'ls-tree', '-r', '--name-only', 'main').split('\n').includes('src/evil.ts'));
console.log('main merge parents:', git(R.w, '--no-replace-objects', 'log', '-1', '--format=%P', 'main').split(' ').map((s) => s.slice(0, 7)).join(' '), '| bound', R.bound.slice(0, 7));
git(R.w, 'reset', '-q', '--hard', 'HEAD~1');
git(R.root, 'replace', '-d', R.bound);

console.log('\n--- symbolic-ref (current=new not passed, engineer on orbit/new)');
const S = repo('s');
S.cur('new');
git(S.root, 'switch', '-q', 'orbit/new');
const cmdS = 'git symbolic-ref HEAD refs/heads/main; git commit -qm x; git symbolic-ref HEAD refs/heads/orbit/new';
console.log('old', v(oldG, 'engineer', cmdS, S.root, S.root), '/ new', v(newG, 'engineer', cmdS, S.root, S.root));
git(S.root, 'worktree', 'remove', '--force', S.w);
const before = git(S.root, 'rev-parse', 'main');
git(S.root, 'symbolic-ref', 'HEAD', 'refs/heads/main'); git(S.root, 'commit', '-qm', 'x'); git(S.root, 'symbolic-ref', 'HEAD', 'refs/heads/orbit/new');
console.log('main moved:', before !== git(S.root, 'rev-parse', 'main'), '| main has src/evil.ts:', git(S.root, 'ls-tree', '-r', '--name-only', 'main').split('\n').includes('src/evil.ts'));

console.log('\n--- git config mixed forms (GIT_CONFIG_GLOBAL=temp file)');
const gc = join(SCR, 'p', 'gc');
for (const a of [['--global', 'core.fsmonitor', 'x', '--list'], ['--global', 'core.fsmonitor', 'x', '-l'], ['--global', '--get-regexp', 'core', '--add', 'core.fsmonitor', 'x'], ['--global', '--add', 'core.fsmonitor', 'x', '--get-all'], ['set', '--global', 'core.fsmonitor', 'x']]) {
  writeFileSync(gc, '');
  const r = spawnSync('git', ['config', ...a], { env: { ...process.env, GIT_CONFIG_GLOBAL: gc }, encoding: 'utf8' });
  console.log(`exit=${r.status} wrote=${/fsmonitor/.test(readFileSync(gc, 'utf8'))} gate=${v(newG, 'engineer', 'git config ' + a.join(' '), S.root, S.root)} :: git config ${a.join(' ')}`);
}

console.log('\n--- fake git.exe in cwd');
const F = repo('f');
F.cur('new');
copyFileSync('C:\\Windows\\System32\\cmd.exe', join(F.w, 'git.exe'));
console.log('engineer@main(w) git commit -am x: old', v(oldG, 'engineer', 'git commit -am x', F.w, F.root), '/ new', v(newG, 'engineer', 'git commit -am x', F.w, F.root));
console.log('engineer@main(w) git merge orbit/new: old', v(oldG, 'engineer', 'git merge orbit/new', F.w, F.root), '/ new', v(newG, 'engineer', 'git merge orbit/new', F.w, F.root));
rmSync(join(F.w, 'git.exe'));
console.log('without fake: git commit -am x', v(newG, 'engineer', 'git commit -am x', F.w, F.root), '| merge orbit/new', v(newG, 'engineer', 'git merge orbit/new', F.w, F.root));

console.log('\n--- hook timing (spawn node hook, ms x5)');
R.cur('A');
for (const [role, cmd, cwd] of [['engineer', 'npm run build', R.root], ['engineer', 'git status', R.w], ['engineer', 'git commit -am x', R.root], ['librarian', 'git merge --no-ff orbit/A', R.w]]) {
  const ts = [];
  let code;
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    code = spawnSync(process.execPath, [NEWG], { input: JSON.stringify(pay(role, cmd, cwd)), env: { ...process.env, CLAUDE_PROJECT_DIR: R.root } }).status;
    ts.push(Date.now() - t);
  }
  console.log(`exit=${code} ms=${ts.join(',')} :: ${role}: ${cmd}`);
}
