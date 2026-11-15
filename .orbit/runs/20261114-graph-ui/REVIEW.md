# REVIEW — 20261114-graph-ui (1차, head ee458174008db04174f4cbcd11fc1f6976cf4fe8)

패널: reviewer-correctness, reviewer-tests, reviewer-maintainability, reviewer-rules, reviewer-accessibility, reviewer-idiom + designer 시각 리뷰. 리뷰어의 최종 메시지를 병합 규칙(같은 원인 합치기, 신뢰도 필터, 심각도)으로 합쳤다.

계획 준수(reviewer-correctness spec): **PASS** — 빠진 태스크·계획에 없는 변경 없음. engineer 판단 세 가지(isSidechain은 노드만 건너뜀, 로그 tool_result는 노드가 있을 때만, devCsp connect-src에 ipc 출처) 수용.
Designer 시각 리뷰: **구현이 확정 배치와 같다**(격자 6칸, 채팅·게임기 같은 높이, 가로 그래프·직각 간선, 이중 테두리, 간격 8px, 4명암, 픽셀 글꼴 구분, 타임라인·중계창·도구 목록·"관문" 없음). 못 본 상태: 멈춤 `?`, 빈 액정, 세션 6개 이상, 서브에이전트 0개, 대기 노드 `!`, 알 수 없음 노드, 비활성 버튼, 포커스 링, 960×640, reduced-motion → QA 스크린샷 뒤 2차 시각 리뷰.
reviewer-rules: 규칙별 전부 통과(하네스 무변경, HTML 삽입 없음, 경로 정규화 후 범위 검사, asset scope 하나, capability 무변경, 토큰 노출 없음, 파서 안전, 새 의존성 2건, 글꼴 출처·라이선스, SPEC 범위, 확정 디자인).
실행: `cargo test` 74 passed·종료 0(reviewer-tests, reviewer-correctness), `npm.cmd run build` 통과(reviewer-correctness).

## 차단

없음.

## 수정 권고

- **W1** `src-tauri/src/sessions.rs:169-182` (correctness, 중간): PostToolUse(Agent)에서 같은 `agentId`를 가진 다른 노드를 합쳐 지울 때 그 노드에 자기 `tool_use_id`가 있는지 보지 않는다. 같은 종류 Agent 두 개를 병렬로 부르고 SubagentStart가 엇갈려 짝지어지면, 먼저 끝난 쪽의 Post가 아직 실행 중인 다른 노드를 지우고, 나중에 다시 생긴 노드는 kind·description·started가 비어 "—"로 보인다. 수용된 R8(시작 시각 차이) 범위를 넘는다. 방향: `tool_use_id`가 None인 노드만 합치고, 아니면 그 노드의 `agent_id`만 비운다. 재현 테스트를 먼저 쓴다.
- **W2** `src-tauri/src/sessions.rs:242-244` (correctness, 중간): 로그 `tool_result`가 노드 상태와 상관없이 빈 `duration_ms`를 채운다. 백그라운드 Agent(`async_launched`)는 실행 직후 값(예: 1초)으로 굳고 SubagentStop이 고치지 않는다. 방향: running·waiting 노드는 채우지 않는다. 테스트 추가.
- **W3** `src-tauri/src/screens.rs:16, 87-101` (tests, 중간): `list`에서 `inside` 범위 검사를 지워도 테스트 5개가 통과한다(심볼릭 링크는 앞의 `file_type().is_file()`에서 이미 빠짐). 범위 검사가 `list`에서 하는 일을 확인하는 테스트가 없다. 방향: `inside`가 실제로 걸러 내는 경우를 테스트로 만들 수 있으면 넣고, 만들 수 없으면(도달 불가) 그 사실을 주석으로 적고 방어선으로 남긴다.
- **W4** `src-tauri/src/screens.rs:97` (tests, 중간): 링크 생성이 실패하면 단언이 표시 없이 건너뛰어진다. 방향: 건너뛸 때 테스트 출력에 드러나게 한다(예: `eprintln!`은 테스트 안에서 허용).
- **W5** `src/App.tsx:20-23, 173`, `src/Graph.tsx:4, 7-8` (maintainability 높음, idiom 높음, rules 참고, designer 참고): `CHIP_AT`·`NODE_LABEL`이 두 파일에 따로 있고, 같은 Lead 상태가 그래프에서는 "실행 중·끝남·실패", 상세 패널에서는 "작업 중·완료·에러"로 보인다. 방향: `src/types.ts`에 하나씩만 두고 상세의 Lead 노드 상태도 그래프와 같은 이름을 쓴다.
- **W6** `src/Graph.css:39` (designer): `.node.chip`의 테두리가 `.is-fail`의 점선을 덮어 실패 칩이 실선이 된다 — 확정 사항 "실패 = 점선 테두리 + ✕"가 칩에서 빠진다. 방향: `.node.chip.is-fail { border-style: dashed; }`.
- **W7** `src/App.css:98-99` (accessibility, 높음): 세션 줄 hover 때 바탕이 연회색이 되고 시각(`.time`, 진회색 11px)이 그 위에 남아 DESIGN 6절이 금지한 3.2:1 조합이 된다(칩 줄도 같음). 방향: hover에서 `.time`을 ink로.
- **W8** `src/Graph.css:25-26` (accessibility, 중간 — WebView2에서 실제로 들어 보지 않음): 선택 표시 `▶`가 CSS `::before`라 접근 가능한 이름에 섞인다. DESIGN 6절은 `▶`를 장식으로 정했다. 방향: 세션 줄처럼 `aria-hidden` span으로, 또는 `content: "▶ " / ""`.
- **W9** `src-tauri/src/lib.rs:80`, `sessions.rs:65, 371` (idiom, 높음): `get_sessions`가 `all()`의 복제본을 `snapshot(&s)`으로 다시 복제한다. 직렬화하지 않는 `events`(세션당 최대 500개)까지 30초마다 두 번 복제. 방향: 이미 가진 값을 소비해 `stalled`만 채운다(다른 두 경로는 그대로).
- **W10** `src/Graph.tsx:46`, `src-tauri/src/sessions.rs:135-141` (maintainability, 높음): className 삼항이 같은 값에 다시 대응시킨다 / 대기 해제 조건이 `ends_with("ToolUse") || == "PostToolUseFailure"`로 적혀 풀어 읽어야 한다. 방향: `` `is-${b.cls}` `` / `matches!(name, "PreToolUse" | "PostToolUse" | "PostToolUseFailure")`.

## 참고 (이번에 고치지 않아도 됨)

- N1 `sessions.rs:407, 271` (tests): PostToolUseFailure의 세션 working 전환, PostToolUse·Failure로 노드 waiting→running 복귀에 테스트 없음.
- N2 `sessions.rs:167-168, 298` (tests, correctness): `tool_response`가 객체가 아니면 노드가 running/unknown으로 남는다(PLAN 문구대로). 응답 형식이 바뀌면 드러나지 않는다.
- N3 프론트 로직(`App.tsx:64` ver `>=` 병합, `Screen.tsx:16`, `types.ts` 형식 함수, `Graph.tsx` 간선 좌표)에 테스트 없음(러너 없음, 계획상). 가장 위험한 것은 `>=` → `>` 회귀로 "?" 표시가 사라지는 것.
- N4 `sessions.rs:308, 339` (maintainability, idiom): `Phase` → "call"/"result" 변환이 두 번.
- N5 `sessions.rs:37` (maintainability): `Event`의 Serialize·`Phase`의 serde 속성은 이제 쓰이지 않는다(PLAN W7 형태).
- N6 `App.tsx:192` (maintainability, designer): 인라인 `marginTop: 8`. `App.css:143` `2px dashed` 직접 표기(토큰 `border.input-disabled` 있음).
- N7 `Graph.tsx:61`, `App.tsx:168` (maintainability): 필요 없는 분기 두 곳.
- N8 `sessions.rs:111` (idiom, 낮음): `Vec::remove(0)`.
- N9 `lib.rs:84-87` (idiom): `list_screens`가 `screens_dir` 오류를 빈 목록으로 삼킨다(`get_status`의 `screens_dir: ""`가 대신 알림).
- N10 `tauri.conf.json` devCsp (rules 낮음, idiom 낮음): dev 전용 `'unsafe-inline'`(DECISIONS 8이 허용). Tauri가 dev에서도 nonce를 넣으면 무시될 수 있음 — T8 (4)에서 dev 콘솔 위반 없음 확인됨.
- N11 `Graph.tsx:27` (designer): 이름 없는 노드가 "— … —"로 보인다.
- N12 `types.ts:10`, `Graph.tsx:23, 45` (accessibility 중간) ↔ correctness는 "노드 키가 빈 문자열이 되지 않는다"고 확인(Rust가 두 id 중 하나를 항상 채움). 프론트 방어는 없음.
- N13 `App.tsx:125` (accessibility): 로그 폴더 오류 문구에 role 없음.
- N14 `App.css:107, 113`, `Graph.css:5` (accessibility, 낮음): 움직임을 앱 안에서 끌 수단 없음(OS 설정만) — 확정 디자인.
- N15 `App.css:44-45, 101` (accessibility): 최소 폭 960px로 200% 확대 시 가로 스크롤, 칩 줄 높이 약 21.5px(DESIGN 최소 24px).
- N16 커밋 b9a7f68 제목 앞 BOM(U+FEFF) (rules).
- N17 T8: MSIX 컨테이너 안에서 띄우면 그림 403(일반 설치 미확인), 탐색기 창 열림·빈 액정 재시작은 못 봄 → QA 8.
- N18 (rules, idiom) asset scope `$APPDATA/screens/*`의 `*`가 하위 폴더를 넘는지 실제 동작 미확인 → Security.

## 2차 (수정분 c5a10c58ab8d7a9dd68e47592ea839e0dbc99509만, reviewer-correctness)

W1~W10 모두 해소(W3은 테스트 대신 방어선 주석 — 정상 입력으로는 `inside`가 걸러 낼 경로가 없다는 판단은 대체로 맞음). `cargo test` 76 passed, 종료 0. 차단·수정 권고 없음.
- 참고 N19 `sessions.rs:191`: 엇갈린 짝에서 비워진 노드의 Post에 agentId가 없으면(PostToolUseFailure 등) 고아 id의 SubagentStop이 만든 유령 "끝남" 노드가 남는다. 1차 이전보다 나쁘지 않음, R8 범위.
- 참고 N20 `screens.rs:23`: 주석 "도달 경로 없음"은 파일 교체 경쟁(read_dir 뒤 canonicalize 전)을 뺀 말 — "정상 경로에서는"이 정확.
- 확인 안 함: `npm run build`(2차 리뷰어는 실행 안 함, engineer R1 보고는 0 종료), W8 스크린리더 청취.

## 사용자 피드백 (2026-11-14, REVIEW 뒤): "그래프가 시안이랑 다르게 좀 못생겼음" → "시안이랑 비교해보셈 … 직접 켜서 확인해보셈"

Designer 1차 시각 리뷰의 "확정 배치와 같다"는 스크린샷 4장과 소스만 본 판정이었고 사용자가 받아들이지 않았다. 시안과 같은 데이터로 실제 앱을 띄워 같은 크기 스크린샷을 나란히 대조하는 2차 시각 리뷰를 QA·SECURITY 전에 한다(결과는 아래에 덧붙인다).

## 3차 (부록 A 변경분 c5a10c5..4165fd4cc899ed779ca882809ca476e2210cc223: R2, A1~A4)

사용자 결정 DECISIONS 10~13(항상 큰 상자 / 노드 모양 E / 단계 열 / 열 규칙)에 따른 재구현. reviewer-correctness 3차 + reviewer-accessibility 2차 + QA 측정 대조(`shots/v3/NOTES.md`).

- reviewer-correctness: spec **PASS**, 차단 0, 수정 권고 0. `push_agent` 열 결정·합치기 `min`·resume 불변, 열 순위 압축, 세로 가운데 맞춤, 버스 간선(1:1, 1:n, n:1, n:m), 서브에이전트 0개, 자동 스크롤 effect 순서, `▶` 한 번, Lead 모양(DESIGN 9.1) 확인. `cargo test` 87 passed·종료 0, `npm.cmd run build` 종료 0.
- QA 측정(실제 앱 vs 갱신된 layout_v4.html, 1400×900, 같은 데이터): 그래프 패널·`.gscroll`·canvas 1032×204·노드 7개 좌표와 168×60·간선 `d` 5개·노드별 border·radius 6px·box-shadow·background·padding·진행 막대·노드 텍스트가 **같음**. 다른 것: 글꼴(시안은 대체 글꼴, 앱은 Galmuri11), 스크롤 위치 표현(시안은 rtl 흉내), 시각·경로 같은 실제값. 열 규칙: 함께 시작 3개는 같은 열, 하나 끝난 뒤 시작한 노드는 새 열, 기존 노드 좌표 불변. 한 열 8개는 `.gscroll` 안에서만 세로 스크롤(제목 고정, 바깥 scroll 0). 자동 스크롤: 실행 중 열이 오른쪽 끝에 맞춰짐, 사용자가 옮긴 뒤 40초 무변화 유지, 바깥 scroll 0(960×640 포함).
- **W11** (accessibility, 높음 — 코드 경로, 앱에서 재현 안 함) `src/Graph.tsx:21-27`: 그래프 안에 키보드 포커스가 있을 때도 자동 스크롤이 돌아 포커스된 노드가 스크롤 상자 밖으로 밀릴 수 있다(WCAG 2.4.7). 방향: `.gscroll`이 `document.activeElement`를 포함하면 스크롤하지 않는다.
- **W12** (accessibility 참고 → 함께 수정) `src/Graph.css:3-8`: 스크롤 중간 위치에서 포커스 링(2px + offset 2px)이 잘릴 수 있다. 방향: `.gscroll { scroll-padding: var(--s-1); }`.
- 참고 N21 (correctness, 중간, 미실행) `Graph.tsx:23-26`, `App.css:41,50-51`, `tauri.conf.json`: 창을 960×640보다 작게 줄이면 body가 넘치고, 그때 자동 스크롤이 body까지 옮겨 화면 전체가 밀릴 수 있다(최소 창 크기 설정 없음).
- 참고 N22 (correctness) `Graph.tsx:20`: MAX_AGENTS 도달 뒤 축출만 일어나면 `moveKey`가 같아 자동 스크롤이 안 돈다(영향 거의 없음).
- 참고 N23 (QA) 실행 중·대기 노드가 없는 세션은 자동 이동이 없어 스크롤 0에서 시작한다 — 1400 폭에서 마지막 열이 오른쪽에서 잘려 보인다(가로 스크롤로 볼 수 있음).
- **Designer 2차 시각 리뷰 (같은 데이터·같은 크기의 실제 앱 스크린샷 `shots/v3/`와 측정값을 기준 시안 옆에 놓고 대조): "기준 시안과 같다", 차단 없음.** 배치 6칸·채팅과 게임기 같은 높이·이중 테두리·4명암·픽셀 글꼴 구분, 노드 상태(실행 중·끝남·대기·실패·선택)가 DESIGN 9.1대로, 그래프에 검은 면 없음, 간선·버스·열 간격·세로 가운데 정렬·스크롤 막대·960×640 확인. 못 본 것: E 모양 노드의 포커스 링, 알 수 없음 노드의 `—`(잘려 있음), 실패·끝남·멈춤 Lead, reduced-motion, 37f3ecc 뒤 화면.
- **W13** (designer 수정 권고 — 이번 head에 반영 안 함, `.orbit/decisions.md` 14번으로) `src/Graph.tsx:55`: Lead 노드의 셋째 줄이 실행 중이 아닐 때 비어 있다(`meta: ""`). DESIGN 9.1대로면 대기 Lead는 "권한 요청", 끝남·멈춤·실패 Lead는 "— · —". QA·Security가 37f3ecc를 검증 중이라 고치면 재검증이 필요해 후속으로 둔다(사용자가 원하면 바로 고친다).
- 참고 N24 (designer): 실행·대기 노드가 하나도 없는 세션의 가로 시작 위치는 DESIGN 9.2에 정해져 있지 않다(지금은 맨 왼쪽).
- 못 본 것: 30초 재요청이 40초 사이 실제로 돌았는지(로그 미확인), 새 열 이동이 `nearest`인지 `end`인지, 세션 전환 뒤 `manual` 해제, 스크린리더 청취.

VERDICT: PASS
