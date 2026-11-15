# R1 SUMMARY
Before impl (stubs with todo!()): `cargo test chat::` -> 6 failed, 0 passed (parse_line, pump x3, write/stop, spawn_rejects). local_abs test first failed to compile (E0425).
After: `cargo test` -> 107 passed, 0 failed (roadmap tests included). Only dead_code warnings (allowed until R2).
grep unwrap(/expect(/println!/dbg!/TcpListener/bind(/0.0.0.0 in chat.rs: none.
Note: `gen` is a reserved keyword in this edition, so the field is named `epoch`.
