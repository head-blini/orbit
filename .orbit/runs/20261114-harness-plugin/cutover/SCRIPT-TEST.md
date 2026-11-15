# SCRIPT-TEST (QA, 2026-11-14)

Environment: Windows PowerShell 5.1, clone of orbit at %TEMP%\orbit-cutover-test\repo (main = d6ecd80 confirmed), 8 files copied to .orbit\runs\20261114-harness-plugin\cutover\. Every script was run as `powershell -NoProfile -ExecutionPolicy Bypass -File <clone>\...\<script>`. No Claude session was started. The real repo was not touched.

## Results
| Step | Result | Evidence |
|---|---|---|
| 3a step1.ps1 | PASS | exit 0; status exactly `M  .claude/settings.json`; SHA256 of .claude\settings.json equals settings.step1.json |
| 3b abort.ps1 | PASS | exit 0; status empty; settings.json hash equals original; all 8 .orbit files remain; gate.mjs present |
| 3c step1 -> step1-commit | PASS | exit 0 both; `3d25882 chore(harness): C1 declare orbit plugin, keep old hooks`; status empty |
| 3d step2.ps1 | PASS | exit 0; status = `M .claude/settings.json`, `M CLAUDE.md`, 29 `D` lines (13 agents, 2 hooks, 14 skills files); only D/M; .claude\hooks gone; CLAUDE.md hash equals CLAUDE.step2.md |
| 3e abort.ps1 | PASS | exit 0; .claude\hooks\gate.mjs back; status empty; top commit 3d25882 |
| 3f step2 -> step2-commit | PASS | exit 0 both; `dfd0f0e chore(harness): C2 remove old harness, use orbit plugin` (31 files); status empty; `Get-ChildItem .claude -Name` = launch.json, settings.json |
| 3g | PASS | `node --test harness\hooks\gate.test.mjs`: tests 25, pass 25, fail 0, exit 0. settings.json parses; PreToolUse args = ["${CLAUDE_PROJECT_DIR}/harness/hooks/gate.mjs"]; `'agent' in s` = false |
| 3h git revert --no-edit HEAD | PASS | commit 6de0ebd; .claude\hooks\gate.mjs back; status empty |
| 4(i) dirty tracked file + step1.ps1 | PASS | "STOP: tracked files have uncommitted changes: M README.md", exit 1, settings.json unchanged |
| 4(ii) step2.ps1 without C1 | PASS | "STOP: top commit is not the step 1 commit. Top commit: Merge harness plugin (...)", exit 1 |
| 4(iii) settings.json edited after step1.ps1, then step1-commit.ps1 | PASS | "STOP: .claude/settings.json changed after step1.ps1 ...", exit 1, no new commit (HEAD d6ecd80) |
| 4(iv) src\hello.txt + step2-commit.ps1 | PASS | "STOP: src\hello.txt exists ...", exit 1, HEAD stays C1. Extra: step2-commit without step2.ps1 -> "STOP: .claude\hooks still exists", exit 1 |

## Step 5: encoding
- 5 .ps1 and 2 .json files: no BOM, pure ASCII, LF line endings (no non-ASCII lines).
- CLAUDE.step2.md: no BOM, UTF-8 with Korean text on lines 3,5,7-11,13,15,17-23,25,27-33,35,37,39-48. It is data copied by Copy-Item (bytes unchanged), never printed by a script, so cp949 console is not an issue.

## Notes (not failures)
- git prints `warning: ... LF will be replaced by CRLF` (stderr) in step1/step2/step1-commit (core.autocrlf on this machine). Harmless, exit codes 0; may look like red text in some hosts.
- Real-repo checks in this note were not run inside the repo; the real-repo status is in the final message.
- The drift check uses unstaged `git diff`, so a change that was also `git add`ed would not be caught (unlikely path).
