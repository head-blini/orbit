T0 완료.

바꾼 파일:
- C:\Users\lclk1\Projects\orbit\src-tauri\Cargo.toml
- C:\Users\lclk1\Projects\orbit\src-tauri\Cargo.lock
- C:\Users\lclk1\Projects\orbit\src-tauri\src\lib.rs
- C:\Users\lclk1\Projects\orbit\src-tauri\src\server.rs (신규)
- C:\Users\lclk1\Projects\orbit\src-tauri\src\hooks.rs (신규)
- C:\Users\lclk1\Projects\orbit\src-tauri\src\config.rs (신규)

변경 내용: tiny_http 0.12 와 getrandom 0.4 를 추가했고 serde_json 에 preserve_order 를 켰다. lib.rs 맨 위에 `mod config; mod hooks; mod server;` 를 넣었고 세 모듈은 `//!` 한 줄짜리 빈 파일이다.

커밋: 01a1a20 (브랜치 orbit/20261114-hook-server)

검증 (`src-tauri/` 에서 실행):
```
cargo build  -> Finished `dev` profile ... in 37.54s, EXIT=0
  warning: unused dependency `tiny_http` (cargo::unused_dependencies, 의존성만 추가해서 나오는 경고)
cargo tree -i tiny_http
  tiny_http v0.12.0
  └── orbit v0.1.0 (C:\Users\lclk1\Projects\orbit\src-tauri)
cargo tree -i getrandom@0.4.3
  getrandom v0.4.3
  ├── orbit v0.1.0 (C:\Users\lclk1\Projects\orbit\src-tauri)
  └── uuid v1.29.2 ...
```
orbit 이 두 크레이트에 직접 의존하는 것으로 나온다.

계획과 달라진 점: 없다. unused dependency 경고는 T1 이 tiny_http 를 쓰면 사라진다. git 이 CRLF 변환 경고를 냈지만 커밋은 정상이다. 이 저장소의 `.claude/` 와 실제 `~/.claude/settings.json` 은 건드리지 않았다.
