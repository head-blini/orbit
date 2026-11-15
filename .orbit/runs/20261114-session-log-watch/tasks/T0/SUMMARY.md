T0 완료.

바꾼 파일:
- C:\Users\lclk1\Projects\orbit\src-tauri\src\lib.rs: `mod sessions;` `mod watch;` 추가
- C:\Users\lclk1\Projects\orbit\src-tauri\src\sessions.rs: 신규, `//! ` 한 줄
- C:\Users\lclk1\Projects\orbit\src-tauri\src\watch.rs: 신규, `//! ` 한 줄

커밋: 2d13d9d (브랜치 orbit/20261114-session-log-watch)

검증 (src-tauri/ 에서 실행):
```
cargo build -> Finished `dev` profile ... (종료 0)
cargo test  -> test result: ok. 31 passed; 0 failed (나머지 두 묶음은 0 passed)
```

계획과 달라진 점: 없음. 앱(`npm run tauri dev`)은 띄우지 않았다. git이 새 파일 두 개에 LF→CRLF 변환 경고를 냈지만 커밋에는 영향이 없다.
