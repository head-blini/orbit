# REVIEW — 20261114-session-log-watch (1차)

대상: `git diff main...orbit/20261114-session-log-watch` (2d13d9d..a6f2af2, 파일 5개: lib.rs, sessions.rs, watch.rs, App.tsx, App.css)
패널: reviewer-correctness, -tests, -maintainability, -rules, -idiom, -performance, -accessibility
Spec 판정(reviewer-correctness): **PASS** — PLAN의 5개 파일만, 인터페이스·테스트 (a)~(k)·`hook-event` 삭제·`ORBIT_CLAUDE_PROJECTS` 1곳·잠금 밖 emit 모두 계획대로. `cargo test` 52 passed(correctness·tests 둘 다 실행).
reviewer-rules: 지적 없음(하네스·Cargo.toml·package.json·capability·CSP 미변경, DECISIONS 1~8 준수, 로그 문자열은 JSX 텍스트로만, 출력문 없음).

## 차단

없음.

## 수정 권고

- W1. `src-tauri/src/watch.rs:87-106` — 읽은 덩어리(16 MiB+1)가 줄 중간에서 끝나면 그 회차를 끝내, 큰 파일을 1초에 약 16 MiB씩만 읽는다. 100 MiB 로그는 시작 시 약 7초, 300 MB는 19초 이상에 걸쳐 나뉘어 들어오고 "첫 회차 한 번 emit"이 깨진다(PLAN R3의 "수 초"를 넘음). 데이터 손실은 없음. 방향: 버퍼가 꽉 찼고 offset이 전진했으면 루프를 계속 돈다. (correctness, performance — confidence 중간, 코드로 확인)
- W2. `src-tauri/src/watch.rs:28` — 매 폴링 `files.retain(.. found.iter().any ..)`가 파일 수에 대해 O(F²). F=5,000이면 코어 하나의 약 60%(계산값), R5가 수용한 선형 stat 비용 밖. 방향: `found`를 HashSet으로. (performance — 중간)
- W3. `src-tauri/src/sessions.rs:127` — `tool_result`마다 `events.iter().find(|e| e.key == format!("call:{id}"))`: 원소마다 String 할당 + 앞에서부터 탐색, store 잠금 안. 방향: 키를 밖에서 한 번 만들고 `rfind`, 또는 `e.phase == "call" && e.tool_use_id.as_deref() == Some(id)`. (performance, maintainability, idiom — 중간~높음)
- W4. `src-tauri/src/sessions.rs:93` — `if phase == "call" { "call" } else { "result" }`는 `phase` 그대로. `format!("{phase}:{id}")`로. (maintainability, idiom — 높음)
- W5. `src-tauri/src/watch.rs:199-223` 테스트 (d)(e) — 상한 초과 줄을 `'x'`로만 채워 어차피 JSON 파싱에 실패하므로 줄 길이 상한과 `skipping`이 실제로 검증되지 않는다(상한을 빼도 통과). 방향: 상한을 넘는 **유효한 JSON** 줄과, 잘린 꼬리가 유효한 JSON이 되는 줄(숫자만)로 0건을 단언. (tests — 중간)
- W6. `src/App.tsx:147-156` — 선택한 세션의 `events`가 빈 배열이면 빈 `<ul>`만 렌더되고 hint가 없다. "기록 없음" 문구 필요. (accessibility — 높음)
- W7. `src-tauri/src/sessions.rs:12,15,24` — `phase`·`source`가 `&'static str`. serde `rename_all = "lowercase"` enum으로 바꾸면 컴파일러가 값 종류를 확인(JSON 동일). (idiom — 중간) → Lead: 이번에는 하지 않음(가장 작은 변경, 값이 세 곳에서만 만들어짐). 참고로 내림.
- W8. `src/App.tsx:15-16` — 타입 이름 `Event`가 DOM 전역 `Event`를 가린다. `ToolEvent` 등으로. (maintainability, idiom — 중간)

## 참고

- N1. `sessions.rs:107-109` — `timestamp` 없는 줄이 `last_ms`를 읽은 시각(=앱 시작)으로 끌어올려 오래된 세션이 "지금" 활동한 것처럼 보일 수 있다(PLAN "실패하면 읽은 시각"의 결과, R2). 실제 로그에 그런 줄이 있는지 미확인. (correctness — 낮음) → 사용자 확인 14번에서 볼 것.
- N2. `sessions.rs:46-47` — 키가 이미 있으면 tool 이름을 갱신하지 않아, 로그 `tool_result`가 먼저 온 항목은 뒤에 훅 PostToolUse가 와도 tool이 `""`로 남는다. (correctness — 중간)
- N3. `App.tsx:71-72` — `listen` 등록 완료를 기다리지 않고 `get_sessions`를 부른다. 그 사이의 update를 놓치면 다음 변경까지 한 단계 뒤처진다. (correctness — 낮음, 재현 없음)
- N4. `sessions.rs:43-44` — 상한 초과 뒤 `Vec::remove(0)`(이벤트마다 500개 memmove). VecDeque가 관용. (idiom, performance — 낮음~중간)
- N5. `App.tsx:149` — `key={i}` 인덱스 키. 지금은 상태 없는 `li`라 드러나는 해 없음. (idiom — 중간)
- N6. `App.tsx:72` — `get_sessions` 실패를 `.catch(() => {})`로 버린다. (idiom — 낮음)
- N7. `lib.rs:41-45` — 줄마다 잠금을 잡았다 놓는 이유(R8)가 코드에 없다. 한 줄 주석. (maintainability — 중간)
- N8. `lib.rs:8` use 순서(rustfmt), `lib.rs:182` 테스트의 `std::sync::Mutex` 전체 경로. (maintainability — 높음)
- N9. 테스트: 중복 키가 세션별이라는 단언 없음(`sessions.rs:352-361`), lib.rs 통합 테스트의 임시 폴더가 단언 실패 시 남음, 서버 콜백 배선은 자동 테스트 없음(QA 5단계). (tests — 중간)
- N10. 성능(R3·R7·R8 수용 범위): 첫 회차 emit과 `get_sessions`가 전체 스냅숏을 두 번 보냄, 훅 이벤트마다 세션 전체(≤500건) clone·emit, `seen` 무제한, 프론트 메모이제이션 없음. Claude Code는 막히지 않음(204 응답 먼저, 콜백은 별도 스레드). 수치는 전부 계산값, 측정 없음. (performance — 낮음~중간)
- N11. 접근성: 버튼 이름에 날짜 레이블 없음, `aria-pressed`보다 `aria-current`가 맞음, 타임라인 갱신 알림 없음, 선택 안 된 버튼 테두리 대비 약 1.3:1. (accessibility — 중간) → 마일스톤 ④ 디자인에서.

## 처리

차단이 없어 PASS. 수정 권고 W1~W6·W8은 engineer에게 한 번 보내 고친다(review 루프 1). W7과 참고 항목은 `.orbit/decisions.md` 후속(④에서 볼 것)으로 적는다.

## 2차 (수정 커밋 83cc9fa, reviewer-correctness)

W1~W6·W8 모두 고쳐짐 확인. `cargo test` 54 passed(리뷰어 실행). 차단 없음. W1 루프: 버퍼 len ≤ 16 MiB+1, `\n` 없는 꼬리·빈 읽기·잘림·삭제·skipping에서 무한 루프·panic 경로 없음.

참고(새 발견):
- N12. `watch.rs:101-102,110,122` — `consume`의 bool 반환값이 쓰이지 않고 doc 주석이 낡았다. 경고·오동작 없음. (높음)
- N13. `watch.rs:298-299,327-329` — 테스트 바이트 문자열에 `\n` 이스케이프 대신 실제 줄바꿈. 동작 같음. (높음)
- N14. `watch.rs:87,91` — `read_to_end`가 용량을 두 배씩 늘려 버퍼 용량이 약 32 MiB까지 갈 수 있다(추정, 측정 없음). `Vec::with_capacity(MAX_LINE+1)`로 막힘. (낮음)
- N15. `watch.rs:113` — `line.len() <= MAX_LINE` 검사는 도달할 수 없는 조건. 해 없음. (중간)
- N16. 테스트 l의 "잘린 앞부분이 유효한 JSON" 주장은 판별력이 약하다(16M자리 숫자는 serde_json이 어차피 거부할 것으로 추정). skipping 플래그 무시 버그는 잡는다. 상한 검사를 지운 상태에서 l이 실패하는지는 아무도 돌려 보지 않았다. (낮음)

VERDICT: PASS
