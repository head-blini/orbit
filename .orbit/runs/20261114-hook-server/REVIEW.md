# REVIEW — 20261114-hook-server

대상: `git diff main...orbit/20261114-hook-server` (01a1a20..976cecd, 커밋 7개)
패널: reviewer-correctness, reviewer-tests, reviewer-maintainability, reviewer-rules, reviewer-accessibility, reviewer-idiom
계획 준수(spec, reviewer-correctness): **PASS**
리뷰어가 직접 실행: `cargo test` 24 passed / `npm run build` 통과 / `node --test harness/hooks/gate.test.mjs` 71 pass (correctness, tests)

## 차단

없음.

## 수정 권고

| # | 위치 | 문제 | 지적 | 처리 |
|---|---|---|---|---|
| A1 | `src-tauri/src/hooks.rs:113-134`, `src/App.tsx:97-98` | 결과가 같은 재설치도 매번 새 백업을 만든다(첫 백업 뒤의 백업에는 토큰이 평문). 버튼에 처리 중 비활성화가 없다. 제안: 직렬화 결과가 기존 바이트와 같으면 쓰지도 백업하지도 않는다, 요청 중 버튼 disabled. | correctness(중간), accessibility 4(낮음) | engineer 수정 |
| A2 | `src/App.tsx:100` (setResult :64-73) | 결과 문구가 직전과 같으면 live region이 다시 읽히지 않는다. 호출 직전에 "처리 중…"을 넣는다. | accessibility(중간) | engineer 수정 (A1과 함께) |
| A3 | `src-tauri/src/config.rs:34-37` | rename 실패 시 `hook-server.json.tmp`가 남는다. hooks.rs:106-109는 지운다. | maintainability(높음), idiom(중간) | engineer 수정 |
| A4 | `src-tauri/src/lib.rs:28,44,51` | 명령 3개가 동기라 메인(UI) 스레드에서 파일 I/O. 파일이 잠기면 창이 멈춘다. `#[tauri::command(async)]`. | idiom(높음) | engineer 수정 |
| A5 | `src-tauri/src/hooks.rs:158`(FIXTURE), `:194-201` | 픽스처에 Orbit이 아닌 http 훅과 Orbit·사용자 핸들러가 섞인 그룹이 없고, 테스트 헬퍼가 구현의 `is_orbit`를 그대로 쓴다. `is_orbit`를 넓히거나 `:64` retain 조건을 바꿔도 테스트가 통과 → 사용자 훅이 지워져도 못 잡는다. | tests(중간) | engineer 수정 |
| A6 | `src-tauri/src/hooks.rs:89-94` | 백업 이름이 unix ms뿐이고 `fs::copy`가 덮어쓴다. 같은 ms에 두 번 쓰면 원본 백업이 사라진다. 백업 개수·내용 테스트 없음. | correctness(중간), tests(중간) — 리뷰어는 "참고"로 냈으나 원본 손실 경로라 Lead가 수정 대상으로 올림 | engineer 수정 |

## 참고 (이번에 고치지 않음)

- `hooks.rs:67-69` 사용자가 원래 둔 빈 이벤트 배열(`"Stop": []`)이 설치 → 제거 뒤 사라진다. 의미는 같다. (correctness)
- `hooks.rs:146-151`, `lib.rs:35` `is_installed`는 Orbit 핸들러 유무만 본다. 포트·토큰이 현재 설정과 맞는지는 보지 않아, `hook-server.json`이 새로 만들어지면 "설치됨"인데 이벤트가 오지 않는다. (correctness) → 후속 후보
- `server.rs:38-44` 413 테스트가 Content-Length 경로만 덮고 4 MiB 값 자체를 고정하지 않는다. chunked 경로 미검증. (tests)
- `server.rs` 토큰 없는 큰 Content-Length → 401 순서를 고정하는 테스트 없음. (tests)
- `server.rs:161-166` 잘못된 Host 테스트가 `evil.example` 하나뿐. (tests)
- `server.rs` 경로·메서드 판정(404/405)이 토큰 검사보다 앞. PLAN에서 승인된 순서, 드러나는 정보 없음. (rules, 낮음)
- `server.rs:42` `let _ = read_to_end(...)` 읽기 오류와 JSON 오류가 구분되지 않는다(둘 다 400). (idiom, 낮음)
- `server.rs:3-9` `use`가 const 앞뒤로 나뉨. (maintainability, idiom)
- `server.rs:62` `"not an IP listener"`만 영어. (maintainability, 낮음)
- `hooks.rs:146-151`, `:64` 의도 주석 한 줄. (maintainability)
- `lib.rs:76` `#[allow(unused_mut)]` 이유 주석. `lib.rs:24-26,46` 헬퍼 한 줄 절약뿐. (maintainability)
- `config.rs:5` 안 쓰는 `Clone`, `App.tsx:107` `hint=""`. (maintainability)
- `App.tsx:106` 타임라인 스크롤 영역에 포커스 가능한 요소 없음(WKWebView). `App.tsx:94-95` 로딩 중 빈 "훅 상태:". (accessibility, 낮음~중간)
- CSP `null`은 PLAN 위험 R6에서 별도 run. capability 변경 없음. (rules)

## 규칙 체크리스트 (reviewer-rules)

127.0.0.1 바인딩 / 토큰 검증·상수 시간·비노출 / Origin·Host / 본문 크기 제한 / 백업 후 병합·원자적 쓰기 / HTML·경로·명령 미사용 / 모르는 필드 내성 / Orbit 꺼져도 비차단(timeout 2, onFailure 없음, 204 뒤 emit) / 승인된 의존성만 / 확정 결정·SPEC.md 일치 / 하네스 파일 무변경 — 전부 **지킴**. capability·CSP는 변경 없음(해당 없음).

## "백업 77개" (T5 SUMMARY)

- reviewer-correctness 판정: 앱이 스스로 설치를 반복하는 경로는 없다. 설치 호출은 `App.tsx:97` 클릭 한 곳, `get_status`·`is_installed`는 쓰지 않는다, 백업은 `write_atomic`에서만 생긴다 → 77개 = 실제 쓰기 77번.
- 사용자 정보(부모 세션 전달, 원문 "몇번 누르긴했음"): T5 때 떠 있던 창에서 사용자가 설치 버튼을 직접 눌렀다.
- **미해결**: "몇 번"과 77개가 맞지 않는다. Enter 키 반복 추정은 재현되지 않았다. A1(같은 내용이면 쓰지 않음 + 버튼 비활성화)로 증상은 막히지만 원인은 QA가 임시 사본에서 "클릭 1번 → 백업 개수"를 세어 확인한다.

## 2차 리뷰 — 리뷰 뒤 붙은 커밋 (reviewer-correctness, `git diff 976cecd..1395da7`)

대상: 4c2a2a4(A1~A6), ebcd1da(SessionStart 제거, DECISIONS 10번), 1395da7(tiny_http → std TcpListener 파서, S2 수정). 리뷰어가 직접 실행: `cargo test` 31 passed. 계획 준수 PASS. 차단 0건.

- A1~A6: 전부 반영 확인(코드 판독). A6의 `-{n}` 분기는 테스트가 같은 ms를 강제하지 못해 실행되지 않는다 — 로직은 맞고 UI의 busy가 겹치는 쓰기를 막는다.
- SessionStart 정리: strip이 헤더로 식별하므로 옛 SessionStart 항목도 install·uninstall에서 지워진다.
- 새 파서: 분할 헤더, 헤더+본문 한 조각, 4 MiB 본문(루프백 2초 내), 판정 순서 403 → 403 → 404 → 405 → 401 문제 없음(판독). 계획에 없던 411(Transfer-Encoding)·400(Content-Length 파싱 실패)이 413 앞에 생겼다.

수정 권고
- B1 `server.rs:76-78` Transfer-Encoding이 있으면 411. Claude Code가 chunked로 보내면 이벤트가 하나도 오지 않는다. 기준 6은 tiny_http 때 측정한 결과였다 → **1395da7 위에서 QA가 실제 세션 이벤트 도착을 다시 확인**(VERIFY.md 재검증으로 처리). confidence 중간.

참고
- `server.rs:56-60` `Expect: 100-continue`에 100 Continue를 보내지 않는다. curl류는 약 1초 기다린 뒤 본문을 보내 남은 1초 안에 못 끝내면 400. Node 클라이언트는 기본으로 Expect를 안 보낸다.
- `server.rs:125` `incoming().flatten()`은 accept가 계속 실패하면 CPU를 돌린다(패닉 없음).
- `server.rs:122` on_event가 패닉하면 디스패처가 죽고 이벤트가 조용히 버려진다(현재 on_event에 패닉 경로 없음, 낮음).
- PLAN.md:15,19,20,36,37에 옛 내용(12개, tiny_http 단일 스레드, EVENTS [&str;12], None = "새 파일")이 남아 있다. `is_installed`(hooks.rs:156)는 옛 12개 설치본에 재설치를 알려 주지 않는다. → 실제 상태는 DECISIONS.md 10·11번과 DEBUG.md가 기준. PLAN은 승인된 문서라 고쳐 쓰지 않고 여기에 차이를 기록한다.

VERDICT: PASS
