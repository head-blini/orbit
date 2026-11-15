# Cutover step 1 (commit). Run after step1.ps1 and after the orbit: agents were seen in a new session.
# All Claude sessions must be closed.
$root = (git -C $PSScriptRoot rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0 -or -not $root) { Write-Host 'STOP: not inside the git repository.'; exit 1 }
Set-Location $root

$staged = @(git diff --cached --name-only)
if ($staged.Count -ne 1 -or $staged[0] -ne '.claude/settings.json') {
  Write-Host 'STOP: expected exactly .claude/settings.json to be staged. Staged now:'; $staged; exit 1
}
$drift = git diff -- .claude/settings.json
if ($drift) { Write-Host 'STOP: .claude/settings.json changed after step1.ps1 (a session rewrote it). Run abort.ps1 and report.'; exit 1 }

git commit -m "chore(harness): C1 declare orbit plugin, keep old hooks"
if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: commit failed. Run abort.ps1.'; exit 1 }
git log --oneline -1
Write-Host ''
Write-Host 'Step 1 done. Do not start work in Claude yet. NEXT: run step2.ps1'
