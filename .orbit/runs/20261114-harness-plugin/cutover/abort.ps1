# Abort an uncommitted cutover step: restore tracked files to the last commit.
# Run with ALL Claude sessions closed. Does not delete untracked files and does not touch .orbit\.
$root = (git -C $PSScriptRoot rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0 -or -not $root) { Write-Host 'STOP: not inside the git repository.'; exit 1 }
Set-Location $root

Write-Host 'Changes that will be discarded (tracked files only):'
git status --short --untracked-files=no
git reset --hard HEAD
if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: git reset failed.'; exit 1 }
Write-Host ''
Write-Host 'Restored. Current top commit:'
git log --oneline -1
Write-Host 'Gate files present:'
Write-Host ("  .claude\hooks\gate.mjs  : " + (Test-Path '.claude\hooks\gate.mjs'))
Write-Host ("  harness\hooks\gate.mjs  : " + (Test-Path 'harness\hooks\gate.mjs'))
