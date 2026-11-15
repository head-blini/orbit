# PLAN_CHECK — 20261114-session-log-watch

검사 대상: PLAN.md. 기준: BRIEF 1~13, DECISIONS 1~8(우선), CLAUDE.md 코드 규칙·체크리스트. 직접 연 코드: `src-tauri/src/lib.rs`, `src-tauri/src/server.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src/App.tsx`. 셸은 plan-checker 관문 때문에 grep 도구만 사용(`claude plugin validate` 해당 없음). 테스트·빌드는 실행하지 않음 → 모두 "실행 확인 필요".

## 1. 목표 덮기 — 통과
- 기준 1~13 모두 대응표에 태스크·검증이 있다. 14는 사용자 확인으로 명시. 빠진 기준 없음.
- 기준 3(`node --test harness/hooks/gate.test.mjs`)은 하네스 미변경이라 태스크 없이 QA 단계에서만 실행 — 권고 A1.
- DECISIONS 1(폴링)·2(메모리)·3(서브에이전트 제외 + 테스트 T1 h)·4(500)·5(CLAUDE_CONFIG_DIR, 릴리스 포함)·6(16 MiB)·7·8 모두 반영.

## 2. 검증 가능성 — 통과
- T0~T4 각각 명령과 기대 결과가 있다(`cargo test watch::`/`sessions::`/`tests::`, `npm run build`, `Select-String`). 테스트 케이스가 구체적(T1 a~j, T2 a~k). 실행 확인 필요.
- parse_ms 기대값 검산: 2000-03-01 = 11017일 × 86400 = 951868800 s → 951868800000 ms 맞음.

## 3. 경로 실재 — 통과
- 수정 대상 `lib.rs`(mod 목록 1~3행, 서버 콜백 70~72행, `get_status` 29행, `generate_handler!` 89행), `App.tsx`(`hook-event` listen 49행)는 실재. `sessions.rs`·`watch.rs`는 새 파일로 표시됨(T0). `App.css`는 존재 확인 안 했으나 기존 `className` 사용으로 보아 있음.
- `lib.rs`에 기존 `#[cfg(test)]` 없음 → T4가 `mod tests` 신설(`cargo test tests::`와 일치).

## 4. 빠진 연결 — 통과
- `hook-event` 전체 검색(소스·md·json·mjs): 사용처는 `lib.rs:71` emit과 `App.tsx:49` listen뿐. `server.rs`의 `hook_event_name`은 페이로드 필드라 무관. 둘 다 T3/T4가 지운다. 통과.
- 서버 콜백 시그니처 `impl Fn(Value) + Send + 'static`(`server.rs:117`) — `Arc<Mutex<Store>>`와 `AppHandle` 클론 캡처 가능.
- `get_status` 반환형·프론트 `Status` 타입·`generate_handler!` 등록이 태스크에 있음. capability는 `core:default`, `opener:default`만 있고 `get_sessions`(앱 명령)·`listen`은 추가 권한 불필요라는 가정이 PLAN 가정란에 "미확인"으로 정직하게 적혀 있다(②에서 동일 형태 동작).
- Cargo.toml: `serde`·`serde_json`·`getrandom`만 있고 PLAN이 쓰는 것은 std + serde_json뿐. 새 의존성 없음 확인.

## 5. 웨이브 충돌 — 통과
- W1 T0(lib.rs·sessions.rs·watch.rs 뼈대), W2 T1(watch.rs)/T2(sessions.rs)/T3(App.tsx·App.css), W3 T4(lib.rs). 같은 웨이브 파일 겹침 없음. T4는 T1·T2·T3 이후. 순서 맞음.

## 6. 범위 — 통과
- 요청 밖 항목 없음. 서브에이전트·SQLite·notify·상태 배지 없음. `get_status` 필드 2개와 `get_sessions`는 성공 기준 4·5에 필요.

## 7. 프로젝트 규칙 — 통과
- 서버·토큰·Origin 코드는 건드리지 않음. settings.json 쓰기 없음. 로그 문자열 JSX 텍스트만, `dangerouslySetInnerHTML` 금지 + grep 검증(T3). 파서 unwrap/인덱싱 금지 + 규약 grep(T1·T2). 콘솔 출력 금지 + QA 13.
- release `panic = "abort"`(Cargo.toml:33): panic 경로를 없애는 설계(`.get()` 계열, `unwrap_or_else(into_inner)`, 슬라이스는 `str::get`, 버퍼 상한). 설계상 통과. 아래 권고 A2·A3는 남은 구멍.
- Orbit이 Claude Code를 막지 않음: 열고 닫기·기본 공유 모드·쓰기 코드 없음. 훅 서버는 응답을 먼저 보내고 콜백은 별도 스레드(`server.rs:122`).

## 차단 지적
없음.

## 권고 (실패 아님)
- A1. 기준 3(gate.test)은 QA 단계에만 있고 태스크 검증에는 없다. 하네스를 안 건드리므로 괜찮지만 QA가 반드시 실행하도록 QA 절차에 한 줄 추가 권장.
- A2. T2 `parse_ms`: 1970 이전 연도(`1969-…`)는 음수 결과가 된다. `u64`로 `as` 캐스트하면 wrap, 산술은 release에서 overflow 검사가 꺼져 있어 조용하지만 debug에서는 panic 가능. "결과가 음수면 `None`", 월 1~12·일 1~31·시 0~23·분·초 0~59(또는 60) 범위 검사를 케이스 (k)에 추가(`1969-12-31T23:59:59Z`→`None`, `2000-01-32T…`→`None`).
- A3. T2: 훅 `PreToolUse`에 `tool_use_id`가 없을 때(문자열 아님 포함)의 동작이 적혀 있지 않다. "항목을 만들지 않고 세션 upsert만"으로 명시하고 테스트 (h)에 한 줄 추가 권장. 정수 `at_ms`는 `u64` 변환/`as_secs` 시 `SystemTime` 오류(`duration_since` Err)를 `unwrap_or(0)`으로 처리한다는 점도 같이 명시.
- A4. T1/T2 규약 grep은 `[ ]` 인덱싱과 `as` 캐스트 산술을 잡지 못한다. 리뷰어가 `buf[`·`s[..]` 패턴을 따로 보도록 REVIEW 지침에 한 줄 권장.
- A5. T4 테스트는 `Watcher`+`Store`만 검증하고 스레드 루프·emit 배선 자체는 QA(앱 실행)에만 의존한다. 허용 가능하나 QA 3~4단계를 건너뛰지 말 것.
- A6. 같은 훅 이벤트와 로그가 서로 다른 `ver` 스냅숏으로 emit 순서가 뒤바뀔 수 있는 점은 `ver` 비교로 처리됨. 프론트 `get_sessions` 응답과 `session-update` 병합 시 `ver`가 같으면 교체(≥)인지 버림(>)인지 T3에 한 줄로 못박기 권장("작으면 버림"이라 같으면 교체 — 현 문안 그대로 OK, 구현 시 `<` 사용 확인).

VERDICT: PASS
