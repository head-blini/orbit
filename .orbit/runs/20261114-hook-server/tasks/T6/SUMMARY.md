T6 done. Commit 9f681b1 on orbit/20261114-hook-server (SPEC.md only, 6+/6-).

Changed SPEC.md lines:
- 25: token plus free port chosen on first run and reused; token and port kept in app_data_dir files (not keychain).
- 27: event list is now the 12 events, including SubagentStart, PostToolUseFailure, PermissionRequest, SessionEnd and StopFailure.
- 30: install is global ~/.claude/settings.json only, no per-project install; the screen shows a one-line "token stored in plain text" notice.
- 32-33: hook is type:"http" to http://127.0.0.1:<port>/events, with timeout 2s on every entry; replaced the old stdin-POST command line.
- 112: keychain wording narrowed to "API keys go to the OS keychain in ⑥; hook token and port go in an app_data_dir file".

Not done: I did not run the PLAN verification command (Select-String for 'type:"http"' and 'app_data_dir'). I did not touch the CHANGELOG, docs/solutions or merge, as instructed. The commit message file is .orbit/runs/20261114-hook-server/T6_MSG.txt.
