T2 완료. 바꾼 파일: C:\Users\lclk1\Projects\orbit\src-tauri\src\sessions.rs (이 파일만). 커밋: efc1f2b (브랜치 orbit/20261114-session-log-watch)

검증:
- 구현 전(스텁 + 테스트 a~k) `cargo test sessions::` → 10 failed (실패 확인)
- 구현 후:
```
cargo test sessions::
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 41 filtered out
```
- 점검: `unwrap\(|expect\(|println!|eprintln!|dbg!|[a-z_]\[` grep 결과가 전부 201행 `#[cfg(test)]` 이후(테스트 모듈)에만 있음. 비테스트 코드에는 unwrap/expect/출력문/`[ ]` 인덱싱 없음. 실행은 bash grep으로 했고 PowerShell Select-String은 쓰지 않았음.

PLAN_CHECK 권고 반영:
- A2: parse_ms는 1970 이전과 월·일·시·분·초 범위 밖을 None으로 처리. 테스트 (k)에 1969-12-31, 일 32, 시 24, 분 60, 소수부 비었음, 끝에 붙은 문자 등을 추가.
- A3: 훅 PreToolUse에 tool_use_id가 없거나 문자열이 아니면 항목 없이 세션 upsert만. 테스트 (h)에 추가. now_ms는 SystemTime 오류 시 unwrap_or(0).
- A4: `as` 캐스트 산술 없음(u64::try_from 사용). 날짜 계산은 i64 사용.

계획과 달라진 점 / 구현 선택:
- 일(day)은 1~31만 검사하고 월별 일수는 검사하지 않음(PLAN_CHECK 권고 수준).
- 객체인 로그 줄은 항목이 0개여도 세션 upsert를 하고 ver를 올림. 객체가 아닌 줄은 None.
- 같은 키가 다시 들어오면 항목은 만들지 않고 source만 합치며, 세션 ver는 올림.
- 로그 tool_result에 id가 없고 uuid도 없으면 항목을 만들지 않음. id가 없고 uuid만 있으면 `uuid:<uuid>:<블록 순번>` 키를 씀.

못 한 것: 전체 `cargo test`는 돌리지 않았음(sessions::만). 앱도 띄우지 않았음.
