# T7 SUMMARY
Files: src-tauri/src/lib.rs, Cargo.toml, Cargo.lock, tauri.conf.json

(1) conf changed, feature absent -> `cargo build` exit 101:
    The `tauri` dependency features on the `Cargo.toml` file does not match the allowlist defined under `tauri.conf.json`.
    Please run `tauri dev` or `tauri build` or add the `protocol-asset` feature.
After adding `protocol-asset`: `cargo build` exit 0 (Finished dev profile), `cargo test` exit 0 (74 passed).
New stalled test failed before implementation (assert snaps[0].stalled), passes after.
Cargo.lock new crate: http-range 0.1.6 only.
capabilities/ unchanged (git diff --exit-code = 0).
