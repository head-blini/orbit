# Orbit: 윈도우 -> 맥 옮기기. 코드(모든 브랜치)와 .orbit 상태를 GitHub에 올린다.
# 실행: powershell -ExecutionPolicy Bypass -File .orbit\to-mac.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Run([string]$exe, [string[]]$a) {
  & $exe @a
  if ($LASTEXITCODE -ne 0) { throw "실패: $exe $($a -join ' ')" }
}

$url = git config --get remote.origin.url
if (-not $url) { throw "GitHub 원격(origin)이 없습니다. 먼저: git remote add origin https://github.com/<계정>/orbit.git" }
if (git status --porcelain --untracked-files=no) { throw "커밋 안 된 변경이 있습니다. 커밋한 뒤 다시 실행하세요." }

Run git @('push', '-u', 'origin', '--all')

# .orbit은 .gitignore 대상이라 브랜치에 섞지 않고, 별도 브랜치 orbit-state 하나에만 올린다(작업 트리·브랜치는 그대로).
$idx = Join-Path $env:TEMP 'orbit-state-index'
if (Test-Path $idx) { Remove-Item $idx }
$env:GIT_INDEX_FILE = $idx
try {
  Run git @('add', '-f', '.orbit')
  $tree = git write-tree
  if ($LASTEXITCODE -ne 0) { throw 'write-tree 실패' }
  $commit = git commit-tree $tree -m "orbit state $(Get-Date -Format s)"
  if ($LASTEXITCODE -ne 0) { throw 'commit-tree 실패' }
} finally {
  Remove-Item Env:GIT_INDEX_FILE
  if (Test-Path $idx) { Remove-Item $idx }
}
Run git @('push', '-f', 'origin', "$($commit):refs/heads/orbit-state")

Write-Host ''
Write-Host '끝. 맥 터미널에 아래 한 줄을 붙여 넣으세요:'
Write-Host "git clone $url ~/Projects/orbit && cd ~/Projects/orbit && git checkout origin/orbit-state -- .orbit && git reset -q -- .orbit && bash .orbit/setup-mac.sh"
