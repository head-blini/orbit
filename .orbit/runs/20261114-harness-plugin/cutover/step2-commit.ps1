# Cutover step 2 (commit). Run after step2.ps1 and after the gate block was seen in a new session.
# All Claude sessions must be closed.
$root = (git -C $PSScriptRoot rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0 -or -not $root) { Write-Host 'STOP: not inside the git repository.'; exit 1 }
Set-Location $root

if (Test-Path 'src\hello.txt') { Write-Host 'STOP: src\hello.txt exists, so the gate did not block the write. Delete that file, run abort.ps1 and report.'; exit 1 }
if (Test-Path '.claude\hooks') { Write-Host 'STOP: .claude\hooks still exists. Was step2.ps1 run?'; exit 1 }

$staged = @(git diff --cached --name-only)
if ($staged -notcontains '.claude/settings.json' -or $staged -notcontains 'CLAUDE.md') {
  Write-Host 'STOP: settings.json and CLAUDE.md are not both staged. Was step2.ps1 run?'; exit 1
}
$drift = git diff -- .claude/settings.json CLAUDE.md
if ($drift) { Write-Host 'STOP: settings.json or CLAUDE.md changed after step2.ps1. Run abort.ps1 and report.'; exit 1 }

git commit -m "chore(harness): C2 remove old harness, use orbit plugin"
if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: commit failed. Run abort.ps1.'; exit 1 }
git log --oneline -3
Write-Host ''
Write-Host 'Cutover done. Start a NEW Claude session to continue. Do not edit .claude\settings.json by hand.'
Write-Host 'To undo later: git revert --no-edit HEAD   (and once more for step 1 if needed)'
