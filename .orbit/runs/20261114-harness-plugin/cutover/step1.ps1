# Cutover step 1 (prepare): enable the orbit plugin, keep the old gate hook.
# Run from a plain PowerShell window with ALL Claude sessions closed.
# This does NOT commit. After checking in a new Claude session, run step1-commit.ps1.
$root = (git -C $PSScriptRoot rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0 -or -not $root) { Write-Host 'STOP: not inside the git repository.'; exit 1 }
Set-Location $root

$dirty = git status --short --untracked-files=no
if ($dirty) { Write-Host 'STOP: tracked files have uncommitted changes:'; $dirty; exit 1 }

$src = Join-Path $PSScriptRoot 'settings.step1.json'
if (-not (Test-Path $src)) { Write-Host "STOP: missing $src"; exit 1 }
if (-not (Test-Path '.claude\hooks\gate.mjs')) { Write-Host 'STOP: old gate (.claude\hooks\gate.mjs) not found. Step 1 may already be past.'; exit 1 }
if (-not (Test-Path 'harness\hooks\gate.mjs')) { Write-Host 'STOP: harness\hooks\gate.mjs not found. Is the plugin merged into this branch?'; exit 1 }

Copy-Item $src '.claude\settings.json' -Force
git add -- .claude/settings.json
if ($LASTEXITCODE -ne 0) { Write-Host 'STOP: git add failed. Run abort.ps1.'; exit 1 }

Write-Host ''
Write-Host 'Staged (expect exactly one line: M  .claude/settings.json):'
git status --short --untracked-files=no
Write-Host ''
Write-Host 'NEXT: open a NEW Claude session in this folder (desktop Code tab or "claude").'
Write-Host '      Approve folder trust if asked. Ask it to list agent types starting with "orbit:".'
Write-Host '      Do nothing else there. Close it.'
Write-Host '      If orbit: agents are listed  -> run step1-commit.ps1'
Write-Host '      If none are listed           -> run abort.ps1'
