T4 완료. 바꾼 파일: C:\Users\lclk1\Projects\orbit\src-tauri\src\lib.rs (이 파일만). 커밋: a6f2af2 (orbit/20261114-session-log-watch).

구현: AppState에 store/projects_dir 추가. 로그 폴더는 CLAUDE_CONFIG_DIR/projects, 없으면 ~/.claude/projects. ORBIT_CLAUDE_PROJECTS는 #[cfg(debug_assertions)] 블록 안 한 곳(137행)에서만 덮어씀. 서버 콜백은 hook-event 대신 ingest_hook 후 잠금을 놓고 session-update emit. 감시 스레드는 1초 루프이고 바뀐 세션은 한 번에 emit. get_status에 projects_dir/projects_error 추가, get_sessions 명령 등록. 출력문 없음.

검증 (bash, src-tauri):
- 테스트 먼저: `cargo test tests::` → poll_round 미정의로 컴파일 실패 확인.
- 구현 후:
```
cargo build -> Finished `dev` profile (exit 0)
cargo test -> test result: ok. 52 passed; 0 failed (lib), 나머지 0건
npm run build -> built in 128ms, exit 0
grep ORBIT_CLAUDE_PROJECTS lib.rs -> 137행 1건 (cfg(debug_assertions) 블록 안)
grep hook-event lib.rs App.tsx -> 결과 없음
grep println!|eprintln!|dbg! lib.rs -> 결과 없음
```
통합 테스트 `tests::reread_after_truncate_does_not_duplicate`(Watcher+Store): 2건 → 첫 줄만 남기게 다시 씀 → 2건 → 새 id 덧붙임 → 3건. 통과.

계획과 달라진 점: 감시 회차 로직을 테스트와 스레드가 공유하도록 `poll_round(&mut Watcher, &Mutex<Store>) -> Vec<Session>` 함수 하나로 뺐음(테스트가 같은 경로를 타도록). 인터페이스 충돌 없음.

못 한 것: 앱 실행 확인(QA 1~3단계)은 하지 않았음. QA가 해야 한다. `Select-String` 대신 bash grep으로 점검했다. 컴파일 경고 18건은 기존/미사용 항목 경고이며 손대지 않았다.
