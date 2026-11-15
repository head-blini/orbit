S1 done.

Changed file: C:\Users\lclk1\Projects\orbit\src-tauri\src\sessions.rs only.
Commit: 20e101c on orbit/20261114-roadmap-panel (message file: RUN_DIR\tasks\S1\COMMIT_MSG.txt).

Change: added `pub fn short_kind(k:&str)->Option<String>` (the part after the last `:`, `None` if empty). `stalled()` now applies it to `agents[].kind` and its doc comment is updated. The Store keeps the original kind. Two new tests: `short_kind_strips_prefix` and `snapshot_shortens_kind_but_store_keeps_original`. The second covers the PreToolUse(`orbit:qa`) snapshot, the absence of `orbit:` in the JSON, the original Store kind, and a SubagentStart pairing that still gives one agent.

Verification:
Before implementation, `cargo test sessions::` failed to compile (the tests reference the missing function):
```
error[E0425]: cannot find function `short_kind` in this scope
error: could not compile `orbit` (lib test) due to 6 previous errors
```
After implementation, `cargo test` (full):
```
test result: ok. 89 passed; 0 failed; 0 ignored ...
EXIT=0
```
Select-String for 'unwrap\(','expect\(','println!','eprintln!','dbg!' in src\sessions.rs: the first match is at line 468, and `#[cfg(test)]` is at line 450. Zero matches fall before line 460, so all of them are inside `mod tests`.

Differences from plan: none. R1's files did not break compilation. I did not run the app or the frontend. I did not run the new tests alone after implementation, only inside the full run.
