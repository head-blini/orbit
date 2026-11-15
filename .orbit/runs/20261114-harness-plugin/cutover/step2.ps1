# Cutover step 2 (prepare): remove the old harness, keep only the orbit plugin gate (+ settings backstop).
# Run from a plain PowerShell window with ALL Claude sessions closed, after step1-commit.ps1.
# This does NOT commit. After checking in a new Claude session, run step2-commit.ps1.
$root = (git -C $PSScriptRoot rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0 -or -not $root) { Write-Host 'STOP: not inside the git repository.'; exit 1 }
Set-Location $root

$dirty = git status --short --untracked-files=no
if ($dirty) { Write-Host 'STOP: tracked files have uncommitted changes:'; $dirty; exit 1 }

$top = git log --format=%s -1
if ($top -notlike '*C1 declare orbit plugin*') { Write-Host "STOP: top commit is not the step 1 commit. Top commit: $top"; exit 1 }

$s2 = Join-Path $PSScriptRoot 'settings.step2.json'
$md = Join-Path $PSScriptRoot 'CLAUDE.step2.md'
if (-not (Test-Path $s2)) { Write-Host "STOP: missing $s2"; exit 1 }
if (-not (Test-Path $md)) { Write-Host "STOP: missing $md"; exit 1 }
if (-not (Test-Path 'harness\hooks\gate.mjs')) { Write-Host 'STOP: harness\hooks\gate.mjs not found.'; exit 1 }

Copy-Item $s2 '.claude\settings.json' -Force
Copy-Item $md 'CLAUDE.md' -Force
git rm -r -q .claude/hooks .claude/agents .claude/skills
if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: git rm failed. Run abort.ps1.'; exit 1 }
git add -- .claude/settings.json CLAUDE.md
if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: git add failed. Run abort.ps1.'; exit 1 }

$bad = @(git status --short --untracked-files=no | Where-Object { $_ -notmatch '^(M|D)  ' })
if ($bad.Count -gt 0) { Write-Host 'STOP: unexpected status lines. Run abort.ps1.'; $bad; exit 1 }

Write-Host ''
Write-Host 'Staged: settings.json and CLAUDE.md modified, old .claude/hooks, agents, skills deleted.'
Write-Host ''
Write-Host 'NEXT: open a NEW Claude session in this folder. Approve folder trust if asked.'
Write-Host '      1) Ask: create hello.txt in the src folder with the text hello'
Write-Host '         Expect: blocked with a message starting with [orbit gate]'
Write-Host '      2) Ask: run ls once'
Write-Host '         Expect: blocked; the gate path in the message ends with harness\hooks\gate.mjs'
Write-Host '         (if the path contains .claude\plugins\cache -> run abort.ps1 and report)'
Write-Host '      Close the session.'
Write-Host '      If both were blocked as expected -> run step2-commit.ps1'
Write-Host '      Otherwise                        -> run abort.ps1'
