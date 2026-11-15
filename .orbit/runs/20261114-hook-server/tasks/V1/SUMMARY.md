V1 SUMMARY

Changed files:
- C:\Users\lclk1\Projects\orbit\src-tauri\src\hooks.rs: `EVENTS` is now `[&str; 11]` without SessionStart. Added test `legacy_session_start_entry_is_removed`.
- C:\Users\lclk1\Projects\orbit\SPEC.md line 27: event list now has 11 events, with a clause saying SessionStart is excluded (http hook unsupported in Claude Code 2.1.317, measured) and session start info comes from ③ the session log.

Commit: ebcd1da on orbit/20261114-hook-server (message passed with `-F`, committed only my two files).

Verification:
Before the fix, the new test failed:
```
---- hooks::tests::legacy_session_start_entry_is_removed stdout ----
panicked at src\hooks.rs:306:9: assertion failed: !EVENTS.contains(&"SessionStart")
test result: FAILED. 11 passed; 1 failed
```
After the fix, `cargo test` (all of it):
```
test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
`npm run build`: `✓ built in 135ms`.

Legacy cleanup: the new test seeds a settings file with an old SessionStart Orbit entry (identified by the X-Orbit-Token header). Reinstall removes the SessionStart key. Uninstall on that file leaves `{}`. Entries are identified by header, not event name, so this passed with no change to `is_orbit`.

Differences from plan: none.
- No count or SessionStart text exists in src/ (App.tsx) or lib.rs, so no screen change was needed.
- The existing tests loop over `EVENTS`, so none depended on a hard-coded count.
- I did not touch server.rs. `cargo test` compiled and passed without trouble.
- Not checked: running the real app, and the real settings.json (not read, per instructions).
