# PLAN_CHECK — 20261114-roadmap-panel (0차 PLAN 검사)

검사 방법: PLAN·BRIEF·DECISIONS·DESIGN을 읽고 src/·src-tauri/src/·SPEC.md·gate.mjs·시안·tokens.json을 직접 열어 대조했다. 테스트·빌드는 실행하지 않았다("실행 확인 필요" 표시). 셸 grep은 gate가 파이프·리다이렉션을 막아 Grep 도구로 대신했다.

## 1. 목표 덮기 — 통과
성공 기준 1~13 모두 PLAN "성공 기준 대응" 표에 태스크가 있다. 기준 1의 여섯 테스트 종류는 R1 (a)(b)(c)(g)(h)(i)(j)로 덮인다. 기준 8은 D1+F1+V2. 빠진 기준 없음. DECISIONS D1~D9(BRIEF보다 우선)와도 충돌 없음(D4 상단 바, D5 cwd만, D6 SPEC ⑤ 개명, D7 노드 `▶`만).

## 2. 검증 가능성 — 통과
모든 태스크에 명령+기대 결과가 있다(D1 git status, R1 `cargo test roadmap::` 실패→통과, S1 `cargo test sessions::`, L1 hunk 범위 + Select-String, R2 grep + capability diff, F1 build + grep, V1 절차 1~9, V2 "같다"). 실행 확인 필요: cargo test, npm build, gate.test, tauri dev, 정션 테스트(Windows `mklink /J`).

## 3. 경로 실재 — 통과
- `lib.rs` 17~33행 `AppState`/`Status`, 57~75행 `get_status`, 83~97행 `list_screens`/`open_screens_dir`, 182행 `generate_handler!`: 있음. `Status`에서 지울 세 필드와 `get_status` 62~74행 코드 확인. `projects_error`·`settings_error`를 남기면 `state.projects_dir`·`settings_path`·`screens_dir` 필드는 계속 읽혀 `dead_code` 경고가 안 생긴다(PLAN 주장 맞음).
- `sessions.rs` `snapshot` 67행, `stalled` 72행, `Session.cwd` 53행, `Store::get` 사용(lib.rs 49행): 있음.
- `screens.rs::inside` 24행: 있음(`canonicalize(p).parent()==dir_canon`). `screens.rs` 104행 링크 건너뛰기 선례는 검사하지 않았다(사소).
- `App.tsx` 76행 단일 `setInterval`, 43행 `now` state, 111·170행 `curAgent`, 152~198 상세 패널, `App.css` 128~132행 `dt/dd/.path/.note/.actions`: 있음. `tsconfig` `noUnusedLocals: true`라 쓰지 않게 된 import는 build가 잡는다.
- 시안 `layout_v4.html` 94~97·189~193·254~256행, `tokens.json` `roadmap`·`topbar`: 있음.
- 새로 만드는 것은 `roadmap.rs`뿐이고 "(새)"로 표시돼 있다.

## 4. 빠진 연결 — 통과 (권고 2건)
- 호출부: `stalled()`는 세 송출 경로(`get_sessions` lib.rs 80행, 훅 emit 131행 `snapshot`, `poll_round` 49행 `snapshot`)를 모두 지난다 → S1 한 곳으로 충분. 확인함.
- 노드 이름 규칙 vs `kind` 사용처: Store 안의 `kind` 사용(`sessions.rs` 132·190·215·219·234행: 채우기·병합·SubagentStart 짝짓기)은 모두 원본 Store 위에서 돌고, 변환은 복제본에서만 일어난다. 되돌려 Store에 쓰는 경로 없음. 프론트 `nodeKey`(types.ts 15행)는 `tool_use_id ?? agent_id`라 `kind`와 무관. 프론트에서 `kind`를 읽는 곳은 Graph.tsx 39행과 App.tsx 170행(F1이 지움)뿐. 기존 테스트(sessions.rs 737·785·813·817·874행)는 `Store` 직접 조회라 영향 없고, `snapshot`은 694~707행에서 `.stalled`만 본다. → 깨지는 곳 없음.
- 경로 검사 신뢰 경계: 명령이 id만 받고 cwd는 Store에서 꺼낸다. UNC·verbatim(`\\?\C:`은 `VerbatimDisk`라 `Prefix::Disk` 아님)·장치·드라이브 상대·루트 상대·상대 경로를 어떤 FS 호출보다 먼저 거른다. 링크·정션·폴더·범위 밖은 3~5단계, 열린 핸들 재확인, take(MAX+1). 남는 위험(TOCTOU, 하드 링크, 매핑 드라이브, 임의 로컬 폴더)은 위험 R2~R5에 명시되고 수용 근거가 맞다.
- 설정: capability·CSP·asset scope·Cargo·package.json 변경 없음. 기존 명령이 `core:default`만으로 불린다는 주장과 일치한다(새 플러그인 호출 없음). R2·V1에 diff 검증이 있다.
- 새 의존성 없음: 줄 단위 파서, 새 크레이트·npm 없음. 확인함.
- DESIGN 상태·문구 대응: 2.1 상태 8개, 2.2 상단 바 문구·aria-label·비활성 규칙·10초 비우기, 2.3 세션 오류 문구, 2.4, 4절 접근성(progressbar 값, sr 접두사) 모두 F1 항목에 들어 있다.
- 권고 A (F1): 미선택(`selected===null`)일 때 `[selected, now]` effect가 `invoke`를 부르지 않아야 한다는 한 줄이 없다. 상태 표는 있으나 effect 조건이 암시적이다. F1에 "selected가 null이면 invoke하지 않고 null로 둔다"를 적으면 안전하다.
- 권고 B (F1): `.detail h3:first-of-type { margin-top: 0 }`(App.css 126행)는 요약 줄 뒤 첫 `h3`에도 걸린다. DESIGN은 "첫 묶음 위 0, 요약 줄 아래 12px(summary-gap)"이라 요약 줄 margin-bottom이 간격을 맡으므로 의도와 맞는지 V2 대조에서 보면 된다(차단 아님).

## 5. 웨이브 충돌 — 통과
W1: D1 `design/**`, R1 `roadmap.rs`+`lib.rs`(mod 한 줄), S1 `sessions.rs`, L1 `SPEC.md` → 겹침 없음. W2: R2 `lib.rs`(R1 뒤), F1 `types.ts·App.tsx·App.css` → 겹침 없음. 의존 순서 맞음. gate 확인: librarian은 `.md` 쓰기 허용(gate.mjs 360행), designer만 `design/` 쓰기 → D1은 이미 바뀐 파일을 git으로 커밋만 하므로 문제 없음.

## 6. 범위 — 통과
BRIEF "범위 밖"(⑥, DB, HARNESS.md, 하네스 카드, 파일 감시, 편집 기능) 항목 없음. `Session.source`를 남기는 것은 최소 변경이라 타당. 요청하지 않은 옵션·추상화 없음.

## 7. 프로젝트 규칙 — 통과
- `127.0.0.1`·토큰·Origin·본문 크기: 훅 서버 미변경.
- settings.json 백업·원자적 쓰기: `hooks.rs` 미변경.
- 로그·페이로드 문자열: JSX 텍스트만, `dangerouslySetInnerHTML` grep(F1·V1 6단계), 경로 정규화 후 범위 검사.
- capability·CSP 최소: 변경 없음.
- unwrap 등 금지 grep 규칙이 R1·S1에 있다.
- SPEC.md 변경(L1)은 W1에서 run 브랜치에 커밋되어 QA·Security COMMIT 전에 들어간다. gate의 출고 대조(CHANGELOG·docs만 후속 허용, gate.mjs 153행)와 맞는다.

## 8. 시각 대조 — 통과 (권고 1건)
V1 8단계는 시안과 같은 두 크기(1400×900, 960×640)로 찍고 시안도 같은 크기로 연다. 960×640 한 줄 여부(Galmuri11 미확인)를 8단계에서 실제 앱으로 본다 — DECISIONS 9번과 일치.
- 권고 C (V1 8단계/V2): 시안의 노드는 architect·plan-checker·engineer·reviewer이고 QA 데이터는 architect·plan-checker·engineer×2·general-purpose라 노드가 다르다. 로드맵 데이터와 크기는 같다고 계획돼 있으나, 완전 대조를 원하면 8단계에서 노드를 시안 4개로 맞추거나 "노드 구성이 다름"을 V2에 미리 알려 차이 목록에서 제외하게 한다.
- 권고 D (V2 되돌림): V2 차이로 F1을 고치면 V1의 VERIFY COMMIT·SECURITY COMMIT이 낡아 gate 출고 대조(src/ 변경)에서 막힌다. "V1 3·8단계와 V2를 다시 한다"에 "VERIFY.md·SECURITY.md의 COMMIT 줄 갱신(Security 재호출)"을 더하면 좋다.

## 차단 항목
없음.

## 권고 항목 요약
A(F1 미선택 시 invoke 안 함 명시), B(h3:first-of-type 간격 V2에서 확인), C(시안과 노드 구성 일치 또는 사전 고지), D(F1 재수정 시 COMMIT·SECURITY 재기록).

VERDICT: PASS
