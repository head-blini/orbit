# PLAN_CHECK — 20261114-graph-ui

대상: PLAN.md (BRIEF 기준 1~15, DECISIONS 1~9, DESIGN.md). 계획은 고치지 않고 판정만 했다. `grep`/`claude plugin validate`는 이 계획에 해당하는 실행 명령이 없어 따로 돌리지 않았다. 나머지 검증 명령은 읽어서 판단했고 전부 "실행 확인 필요"다.

## 항목별 판정

1. 목표 덮기 — 일부 실패(차단 B1). 15개 기준 모두 대응표에 태스크가 있다. 다만 기준 1의 "상태 판단 … 로직마다 테스트"가 "멈춤(추정)"에서 비어 있다.
2. 검증 가능성 — 통과(권고 R1 참고). 태스크마다 명령과 기대 결과가 있다. 화면 쪽(F1~F3)은 빌드·grep·브라우저 확인이다.
3. 경로 실재 — 통과. `src-tauri/src/lib.rs`, `sessions.rs`, `tauri.conf.json`, `Cargo.toml`, `capabilities/default.json`, `src/App.tsx`, `App.css`가 있다. `screens.rs`, `types.ts`, `Graph.tsx`, `Screen.tsx`, `Graph.css`, `src/assets/fonts/*`는 새로 만드는 것으로 표시돼 있다. `design/reference/layout_v4.html`·`design/tokens.json`도 있고 미커밋이다(T4).
4. 빠진 연결 — 통과. 확인한 것은 다음과 같다.
   - `Session`·`Event`를 쓰는 곳은 `sessions.rs`와 `lib.rs:189`(`events.len()`) 둘뿐이고, `lib.rs:189`는 `pub` 필드 유지로 문제없다.
   - `generate_handler!`(`lib.rs:158`) 등록과 `AppState`·`Status` 필드 추가는 T7이 맡는다.
   - 프론트의 `invoke`/`listen` 호출부(`App.tsx:54,71,72,79`)는 F1이 새로 쓴다.
   - `hook-event`는 `src/`에 이미 없다. F1 grep이 다시 막는다.
   - capability는 안 바꾸고 `opener:default`는 Rust 쪽에서만 쓴다.
   - `index.html`에는 인라인 스크립트나 스타일이 없어 CSP와 충돌하지 않는다.
5. 웨이브 충돌 — 통과. W1(T1 `sessions.rs` / T2 `screens.rs`+`lib.rs` / T3 / T4 / T5), W2(T6 / F1), W3(T7 / F2 / F3)에서 같은 파일을 겹쳐 건드리지 않는다. `sessions.rs`는 T1(W1)→T6(W2), `lib.rs`는 T2(W1)→T7(W3)로 순서가 맞다. 의존도 맞다(T6→T1, F1→T3, F2·F3→F1, T7→T1·T2·T6, T8→전부).
6. 범위 — 통과. 그래프 라이브러리·vitest·npm 의존성 모두 안 넣었다. N1·N2·N3·N6·N11·W7·A5는 BRIEF 12가 요청한 것이다. SPEC 수정은 39~78행으로 한정돼 있다.
7. 프로젝트 규칙 — 통과(권고 R2 참고).
   - 새 의존성 절이 T7(Cargo feature `protocol-asset` → `http-range`, `Cargo.lock` 확인)과 T3(글꼴 파일, 패키지 추가 없음)에 맞는다.
   - asset scope는 `$APPDATA/screens/*` 한 줄이고 T7 검증에 `Select-String`이 있다.
   - 경로 정규화 후 범위 검사(T2 (d)(e), 심볼릭 링크 제외)와 `dangerouslySetInnerHTML` 금지(F1~F3 grep, T6 (l), QA 7)가 들어 있다.
   - capability 무변경은 `git diff --exit-code`와 QA 8로 확인한다. CSP는 최소 구성이고 R5가 dev 대안을 정해 뒀다.
   - SPEC 수정(T5)은 W1이라 qa·security 전에 커밋된다.
   - `src-tauri/src/lib.rs`의 `projects_dir`·`settings_path`는 이미 있는 구조를 쓴다.

## 차단 (실패)

**B1. "멈춤(추정)"·칩·노드 그리기를 데이터로 확인하는 검증이 없다** (BRIEF 기준 1, 4, 5 / DECISIONS 7).
- PLAN "설계 요지"는 `shownState`(`working && now-last_ms > 600000`)를 프론트에 두고, 프론트에는 테스트 러너를 안 넣는다. 그러면 "상태 판단" 중 `?` 판정에 자동 테스트가 없다.
- F1의 브라우저 확인은 invoke가 없어 오류 상태만 본다. 세션이 있을 때의 모습은 확인하지 않는다.
- QA 6은 `!`, 기호 없음, `✕`만 확인한다. `?`(10분 경과)와 칩(6개 이상: 세션 6개, 노드 6개 이상)은 어느 QA 단계에도 없다.
- 수정안(셋 중 하나 이상):
  - (a) `shownState` 판정을 Rust로 옮겨 `cargo test`로 검증한다.
  - (b) QA에 단계를 더한다. curl로 훅을 보내 세션 6개와 서브에이전트 6개를 만들어 칩과 선택 노드 큰 상자를 확인하고, 10분 뒤 `?`가 나오는지 기록한다. `STALL_MS`를 임시로 줄이면 안 되므로 10분을 기다린다.
  - (c) 순수 함수는 `types.ts`에 두고 기존 `node --test`로 검증한다. 단 이는 새 러너 구성에 가까우니 (a)나 (b)를 권한다.
- 또 DESIGN 6절의 노드 상태 표(실행 중 반전 + 막대, 대기 `!`, 알 수 없음 `—`)를 데이터로 한 번 보는 단계가 QA 4·6에 있는지 명시한다.

**B2. T8 (5)와 QA 8의 릴리스 실행이 실제 `~/.claude`를 읽는다** (BRIEF 기준 "검증은 실제 `~/.claude`를 쓰지 않는다", PLAN 공통 규칙 "실제 `~/.claude`는 열지 않는다").
- `lib.rs:123·136`에서 `ORBIT_CLAUDE_*` 덮어쓰기는 `cfg(debug_assertions)` 안이라 릴리스에서 무시된다. PLAN도 이를 알고 있다.
- 그런데 PLAN은 릴리스 실행에 같은 `ORBIT_CLAUDE_*`만 지정한다. `projects_dir`은 릴리스에서도 `CLAUDE_CONFIG_DIR`을 따르므로(`lib.rs:128-129`) 이것을 지정하지 않으면 실제 `~/.claude/projects`를 감시한다. `settings_path`는 릴리스에서 항상 실제 `~/.claude/settings.json`이고 `get_status`가 `is_installed`로 읽는다.
- 수정안: T8 (5)에 `CLAUDE_CONFIG_DIR=$d`를 더한다. 읽기 전용이라도 실제 settings.json을 읽는다는 점을 SUMMARY·VERIFY에 적는다. 훅 설치·제거 버튼은 누르지 않는다는 문구는 그대로 둔다. 스크린샷에 실제 경로가 보이면 공유하지 않는다.

## 권고 (실패 아님)

- R1. T4 검증 문구가 맞지 않는다. `design/` 안 파일 전부가 미추적이라 `git status --short design/`는 `?? design/` 한 줄을 낸다("`??` 두 줄만"이 아니다). `git status --short -uall design/` 또는 "`?? design/` 한 줄"로 고친다.
- R2. DECISIONS 5(새 의존성은 PLAN 승인 때 사용자에게 보인다)에 따라 Lead가 "새 의존성" 표(`protocol-asset` feature, Galmuri 글꼴 파일)를 승인 요청에 그대로 보여야 한다. 계획에는 문제가 없다.
- R3. R2(위험)의 대안 B를 쓰면 BRIEF 14의 문구("conf scope 한 곳")가 바뀐다. 계획이 이미 "Lead가 사용자에게 알린다"고 적고 있어 그대로 둔다.
- R4. T8은 `src-tauri/tauri.conf.json`·`lib.rs`·`Screen.tsx`를 "필요할 때만" 고친다. 이 세 파일을 W3과 같은 파일이므로 W4 단독 실행이라 충돌은 없다.

## 실행 확인 필요 (읽기만 함)

`cargo test`, `npm.cmd run build`, `node --test harness/hooks/gate.test.mjs`, `cargo build`(feature 불일치 오류 예상), T3의 `npm.cmd pack`, 모든 PowerShell `Select-String`, T8 (1)~(6), CSP 동작, asset URL 형식. 미확인 가정(R1~R11)은 PLAN이 확인 태스크를 이미 배정해 뒀다.

(1차 판정: FAIL. 아래 2차에서 갱신)

---

# 2차 (PLAN의 "PLAN_CHECK 1차 반영" 뒤)

실행한 명령은 없다(계획의 검증 명령 중 `grep`/`claude plugin validate`에 해당하는 것이 없음). `lib.rs` 90~160행은 직접 열어 확인했다. 나머지는 읽어서 판단했고 "실행 확인 필요"다.

## B1 해소 — 통과
- 멈춤 판정은 `sessions::snapshot(s, now)`(Rust 순수 함수, 시각을 인자로 받음)로 옮겨졌고 T1 (f)가 `cargo test`로 검증한다. 경계(=`STALL_MS` false, +1 true), working 외 상태, 시계 역행, `last_ms==0`, 원본 불변, JSON `stalled`가 모두 들어 있다.
- 세션이 Rust 밖으로 나가는 곳은 `get_sessions`, 훅 콜백(`lib.rs:108`의 `st.get(&id).cloned()`), `poll_round` 세 곳이고 T7이 셋 다 `snapshot`으로 바꾼다. T7 검증(`Select-String 'snapshot\('` 비테스트 3곳)과 `poll_round` stalled 테스트(2000-03-01 로그 → `stalled==true`)가 있다.
- QA 7a가 `?`(옛 timestamp 로그, 10분 대기·`STALL_MS` 변경 없음), 세션 칩(6개), 노드 칩(6개), DESIGN 6절 노드 상태(실행 중·끝남·대기·실패·알 수 없음)를 실제 데이터로 보게 한다. 대응표 1·5·7에 연결됐다.
- 인터페이스 반영: `Session.stalled`(T1, F1 `types.ts`), `Graph` props에서 `now` 제거(F2 설명과 일치), `shownState`는 `stalled`만 읽음(F1). `events`가 `#[serde(skip)]`이라 `lib.rs:189`의 `events.len()`은 그대로 동작한다.
- 웨이브: T1(`sessions.rs`, W1) → T6(`sessions.rs`, W2) → T7(`lib.rs`·conf, W3, 의존 T1·T2·T6) → T8(W4). F1(W2)이 만든 `types.ts`를 F2·F3(W3)가 읽는다. 같은 웨이브의 파일 충돌 없음.

## B2 해소 — 통과
- `lib.rs:123-126`(`ORBIT_CLAUDE_SETTINGS`)과 `lib.rs:136-139`(`ORBIT_CLAUDE_PROJECTS`)는 `cfg(debug_assertions)` 안이라 디버그 exe에서 살아 있다. `lib.rs:128-129`는 `CLAUDE_CONFIG_DIR`을 빌드 종류와 무관하게 따른다. T8과 QA 2는 세 변수를 모두 `$d`로 지정한다. 따라서 `tauri build -- --debug --no-bundle` 산출물을 이 환경변수로 실행하면 실제 `~/.claude`를 읽지 않는다. 화면 경로가 `$d`가 아니면 즉시 끄는 확인도 있다.
- `src-tauri/src` 안의 `.claude` 경로는 `lib.rs:121,133` 두 곳뿐이고 둘 다 위에서 덮인다.
- "사용자에게 알릴 것"은 1번(기본: 읽기·쓰기 없음), 2번(R13 예외: 릴리스 실행 시 실제 `settings.json` 읽기, 경로 화면 노출, [설치]·[제거] 금지, 로그 감시는 `CLAUDE_CONFIG_DIR`로 우회), 4번(인증 파일 복사는 읽기, 복사본 삭제)으로 실제 접근 경로를 축소 없이 적었다. 릴리스 실행은 멈춘 뒤 별도 승인으로만 가능하다.
- 남는 미확인: 디버그 빌드가 prod `csp`를 쓰는지(R13). T8 (5)가 응답 CSP 헤더로 확인하고, 틀리면 멈추게 되어 있다. 실행 확인 필요.

## 고치면서 새로 생긴 문제 — 없음
- 30초 재조회(F1)는 `get_sessions` 한 번을 부르는 `setInterval`이다. 이미 있는 30초 `now` 갱신(시각 형식용)에 같이 달면 된다. 실패하면 기존 화면 유지, 같은 ver 교체 규칙이라 stalled만 바뀐 스냅숏도 들어온다. 요청받지 않은 복잡도는 아니다.
- 더 작은 방법은 없다. 프론트에서 판정하는 안은 B1이 지적한 무테스트 문제로 돌아간다.

## 권고 (실패 아님)
- R5. F1에 "30초 `now` 갱신과 `get_sessions` 재요청은 같은 타이머 하나로"를 한 줄 더하면 중복 타이머를 막는다(선택).
- R6. T1의 "`last_ms==0`이면서 working → now=9e12에서 `true`"는 timestamp 없는 로그만 있는 세션이 즉시 `?`로 보인다는 뜻이다. R9(재시작 후 `?`)와 같은 수용 범위이니 VERIFY에 한 줄 적어 두면 된다.

## 실행 확인 필요 (읽기만 함)
`cargo test`(T1 (f), T7 `poll_round` stalled), `cargo build`, `npm.cmd run build`, T8 (1)~(6), QA 7a 화면 확인, 디버그 빌드 CSP 헤더, 모든 `Select-String`.

(2차 판정: PASS)

---

# 3차 (부록 A: 그래프 모양 E + 단계 열)

대상: PLAN.md 부록 A(281행~)만. 기준은 DECISIONS 10~14, DESIGN.md 9절, 개정된 `design/reference/layout_v4.html`·`design/tokens.json`. 실행한 명령은 없다(부록의 검증은 `cargo test`·`npm.cmd`·`Select-String`이라 읽어서 판단, 전부 "실행 확인 필요"). `sessions.rs`·`Graph.tsx`·`Graph.css`·`App.css`·`App.tsx`는 직접 열어 확인했다.

## 항목별 판정

1. 열 규칙 — 통과. `col==L`인 기존 노드 중 하나라도 Done·Failed면 L+1, 아니면 L이라는 정의는 사용자 규칙("마지막 열의 노드 중 하나라도 끝난 뒤에 시작하면 다음 열, 함께 시작한 것끼리만 같은 열")과 이벤트 처리 순서 기준으로 같은 결과를 낸다. DECISIONS 13 예(`[1,2,3,3,3,4]`)가 테스트 (b)에 있다. 다른 결과를 낼 수 있는 경우는 RA1(앱 시작 때 훅이 로그보다 먼저, lib.rs 127·167행 순서 확인됨), RA2(Post가 다음 Pre보다 늦게 옴), RA3(Unknown·영구 대기가 마지막 열에 남음), RA4(축출 시 왼쪽으로 한 칸), 합치기(min)로 적었고 축소가 없다. 한 번 정한 열의 불변은 테스트 (c)(상태 변화·resume·로그 중복·옛 timestamp·실패)와 (g)(시계 섞임)에 있다. 로그 복원 (f), 처음부터 끝남 (h), 합치기 (i), 축출 (j)도 있다. `Agent` 리터럴은 `push_agent` 한 곳(sessions.rs:113)뿐이라 필드 추가가 다른 코드를 깨지 않는다.
2. 변경이 닿는 곳 — **실패(B3)**. `col`의 Rust·`types.ts` 쪽(A1·A4)은 빠짐이 없다. 그래프 패널 구조가 Designer 개정과 다르다(아래).
3. RA5·RA7 — RA5는 통과: Lead는 `shownState`를 따른다는 가정이 DESIGN 9.1의 Lead 행("작업 중=실행 중, 대기=대기, 에러=실패, 완료·멈춤=끝남")과 같다. RA7·A-2는 **실패(B4)**.
4. 새 의존성·범위·검증 환경 — 통과. 새 의존성 없음(A.4), 요청 밖 옵션·추상화 없음, QA는 `$d` 디버그 실행만이고 릴리스 exe를 실행하지 않는다. 웨이브: W1(A1 `sessions.rs` / A2 `design/**`), W2(A3 `Graph.css`·`App.css` / A4 `types.ts`·`Graph.tsx`)에서 파일이 겹치지 않고 의존 순서(A3→A2, A4→A1·A2)도 맞다. 단 B3 수정 때 이 분담을 깨지 않게 한다.

## 차단 (실패)

**B3. 그래프 패널 구조·스크롤이 Designer 개정(DESIGN 9.2, layout_v4.html 130~142·286행)과 다르고, 이를 하는 태스크가 없다.**
- 개정: `.graph`는 flex 세로, 제목(h2)은 고정이고 그 아래에 스크롤 상자 `.gscroll`(`flex:1; min-height:0; overflow:auto; padding:4px; scrollbar-color`)을 두고 그 안에 `.canvas`를 둔다. 기존 `Graph.css:2`의 `.canvas { margin: 8px 0 0 8px }`는 이 padding으로 대체된다.
- 부록 A.2는 스크롤 상자를 `.panel.graph` 자체(App.css:68 `overflow:auto`)로 두어 제목까지 같이 스크롤되고 안쪽 여백이 없다. A3는 `.graph` 선택자에 `scrollbar-color`만 두고, App.css는 `:root`만 고친다고 못박았다. `.graph{display:flex;flex-direction:column}`(App.css:54 근처)와 `.gscroll` 마크업(`Graph.tsx` 반환 `<div className="canvas">` 바깥에 래퍼)을 맡은 태스크가 없다. 빈 상태 `<p className="empty">`도 이 구조에서 어디에 놓이는지 없다.
- 수정안: `.gscroll` 래퍼 마크업은 A4(`Graph.tsx`, App.tsx 변경 불필요)에, `.gscroll`·`.canvas` margin 제거는 A3(`Graph.css`)에, `.graph` flex 규칙은 A3 또는 A4 중 한 곳(`Graph.css`에 두면 W2 파일 분담이 유지됨)에 적는다. A.2의 "스크롤 컨테이너는 `.panel.graph`"와 RA6(`.panel.graph`의 `scrollLeft` 직접 계산)을 `.gscroll` 기준으로 고친다. 검증에 `Select-String src\Graph.tsx -Pattern 'gscroll'`과 `Graph.css`의 `.gscroll` `overflow: auto`를 더한다.
- 자동 스크롤도 개정과 다르다. 개정(9.2): 새 열이 생기거나 노드 상태가 바뀌면 "실행 중 또는 대기 노드가 있는 가장 오른쪽 열"의 오른쪽 끝이 보이게(`inline:"end", block:"nearest"`), 사용자가 직접 스크롤·선택했으면 강제로 끌지 않고, reduced-motion이면 `behavior:"auto"`. 부록은 대상이 "running인 마지막 노드(없으면 마지막 열 마지막 노드)"이고 `nearest/nearest`이며 대기 노드를 대상에서 뺐다. RA8이 개정본 우선이라고 일반 규정을 두긴 했지만 A4·A-4가 부록 값을 그대로 검증하게 되어 있다. 대상(대기 포함), `inline:"end"`, 트리거(상태 변화 포함 여부)를 개정에 맞추거나, 다르게 가려면 어디가 왜 다른지 적고 Designer 확인을 받는다.

**B4. A-2 시안 대조가 갱신된 layout_v4.html이 아니라 graph_variants.html 배치 2를 기준으로 삼는다 (RA7).**
- A-2의 "같아야 하는 값"(canvas 816×276, `li` left/top `0/108, 216/108, 432/108, 648/0·72·144·216`, 간선 5개)과 훅 순서(reviewer를 e1 끝나기 전에 보냄)는 배치 2 그림 값이다. 갱신된 layout_v4.html은 canvas 1032×204, engineer 3개(top 0/72/144, left 648), reviewer left 864/top 72(별도 열), 간선 `M168 102 H216` 등 5개이고 e3가 실행 중이다. 조건부 문장("개정 layout_v4가 reviewer를 다음 열에 두면 옮긴다")은 있으나 숫자·간선 기준이 바뀌지 않아 A-2를 그대로 따르면 기준 불일치가 나거나 reviewer를 e1 Post 뒤로 보내도 엉뚱한 값과 비교한다.
- 수정안: A-2의 기준을 `layout_v4.html`(1032×204, 위 좌표, 간선 `d`)과 DESIGN 9.1·9.2로 바꾼다. 훅 순서는 architect·plan-checker 완료 → e1·e2·e3 Pre → e1·e2 Post → reviewer Pre+PermissionRequest, e3는 실행 중으로 남긴다(layout 데이터와 같다). 노드 모양 값은 layout_v4 CSS(`--r-node`, `--sh-node`, `--sh-node-wait`, `--pad-node(-run)`)로 쓴다. A.2 "프론트 배치" 끝의 "값은 graph_variants.html 배치 2"와 RA7도 같이 고친다. graph_variants는 참고로만 남긴다.

## 권고 (실패 아님)

- RA-R1. A3가 `Graph.css`에 리터럴(`border-radius: 6px`, `padding: var(--s-1) 10px`)을 쓰라고 하고 검증도 `Select-String 'border-radius: 6px'`인데, 개정 layout_v4는 `:root` 토큰(`--r-node`, `--sh-node`, `--sh-node-wait`, `--r-pbar`, `--r-pbar-fill`, `--pad-node`, `--pad-node-run`)을 `var()`로 쓴다. Designer가 토큰을 실제로 더했으니 A3의 "새 토큰일 때만 `:root`" 조건은 충족된다. A3는 이 7개를 App.css `:root`에 옮기고 Graph.css가 `var()`를 쓰게 하며, 검증 grep도 `var(--r-node)` 등으로 바꾼다(지금 검증대로면 맞는 구현이 grep에서 실패한다). App.css 검증 `git diff src/App.css`는 `:root` 줄뿐이라는 문구를 B3 수정과 맞춘다.
- RA-R2. resume(Done 노드가 SubagentStart로 다시 Running)은 열 불변은 테스트되지만, 그 뒤 새 노드가 "끝난 뒤 시작"으로 안 세어지는 차이가 위험 절에 없다. RA2 옆에 한 줄 더한다.
- RA-R3. A-4의 "다른 노드 Post 보내도 `scrollLeft` 그대로"는 B3에서 트리거를 개정대로(상태 변화 시 이동) 바꾸면 기대 결과가 달라진다. 함께 고친다.

## 실행 확인 필요 (읽기만 함)

`cargo test r_col_`·`cargo test`, `npm.cmd run build`, A3·A4의 모든 `Select-String`, A-1~A-5 화면 측정, `scrollIntoView`가 패널 바깥 조상까지 움직이는지(RA6).

(3차 판정: FAIL)

# 4차 (부록 A 수정분)

대상: PLAN.md 부록 A의 A.2 "패널 구조"·"자동 스크롤", A3·A4, A-2·A-4, RA6·RA6b·RA9·RA2b, A.8. 직접 열어 대조: `design/reference/layout_v4.html` 130~179·282~334행, `src/App.tsx` 147~149행, `src/App.css` 54~71행, `src/Graph.tsx`, `src/Graph.css`, DESIGN.md 9.2. 실행한 명령 없음(검증은 `npm.cmd`·`cargo`·`Select-String`이라 전부 "실행 확인 필요").

## 항목별 판정

1. B3 패널 구조 — 해소(통과). A.2의 CSS(`.graph` flex 세로, `.gscroll` `flex:1; min-height:0; overflow:auto; padding:var(--s-1); scrollbar-color`, `.canvas` margin 삭제, `.gscroll.end` 미이식)가 layout_v4 133~142행과 같다. 마크업(`.gscroll > .canvas`)은 282~287행과 같고, `.gscroll.end`(rtl)는 정적 시안용이라 옮기지 않는다는 설명이 맞다. App.tsx는 147~149행이 `h2` + `<Graph/>`라 바꿀 필요 없다. `App.css:54`의 `.graph`는 grid 위치만 있어 Graph.css의 flex와 속성이 겹치지 않는다. 빈 상태 `<p className="empty">`는 12행 그대로다.
2. B3 자동 스크롤 — 해소(통과). 대상(실행 중 또는 대기 중 가장 오른쪽 열), `inline:"end"`/`block:"nearest"`, 사용자 조작·선택 시 `nearest`, reduced-motion `auto`가 DESIGN 9.2 144행과 같다. 트리거 `moveKey`(세션 id·열 수·서브에이전트 상태 목록)는 무변경 재요청에서 effect가 안 돈다. hooks를 `if (!session)` 앞에 둔다는 점도 현재 12행 구조에 맞는 지적이다.
3. B4 A-2 — 해소(통과). 기준이 갱신된 layout_v4다. 직접 계산으로 확인: n=4 열이면 폭 5*216-48=1032, 높이 3*72-12=204, 열 맨 위 72·0, 간선 d 5개(`M168 102 H216`, `M384 102 H432`, d=3의 xr=600/xb=624, d=4의 xr=816/xb=840)가 layout_v4 289~293행과 글자 그대로 같다. 훅 순서(e1·e2 Post 뒤 reviewer Pre+PermissionRequest, e3 실행 중)는 DECISIONS 13 규칙으로 열 [1,2,3,3,3,4]가 되어 reviewer=864/72이고, 끝의 Lead `PreToolUse(Read)`는 미확인으로 표시돼 있다. 사용자 열 규칙과 맞다.
4. 웨이브 — 통과. W1: A1 `sessions.rs` / A2 `design/**`. W2: A3 `Graph.css`·`App.css`(`:root`) / A4 `types.ts`·`Graph.tsx`. 겹침 없음, 클래스 이름 계약 명시, 의존 A3→A2, A4→A1·A2 맞다.
5. 검증 가능성 — 통과. A3·A4의 `Select-String`이 계획 문구와 모순이 없다(예: `inline: manual`은 `inline: manual.current || selected ? …` 형태와 일치, 현재 Graph.css에는 `border-radius: 0`·`margin: var(--s-2) 0 0 …`가 있어 A3가 지우게 돼 있다). `git diff --stat`에 App.tsx 없음 확인도 있다.
6. 위험 RA6·RA6b·RA9·RA2b — 통과, 축소 없음. RA6b는 막대 끌기의 `pointerdown` 도달 여부를 "미확인"으로 두고 실패 시 대체안(scroll 이벤트 + 플래그)과 A-4 확인을 적었다. RA9, RA2b(resume 뒤 새 노드는 같은 열)도 그대로 적혀 있다.
7. 범위·프로젝트 규칙 — 통과. 새 의존성·capability·CSP 변경 없음(`scrollIntoView`는 권한 불필요). 시각 값은 `var(--*)`만.
8. 새로 생긴 문제 — 없음. 3차에서 통과한 열 규칙·`col` 추가 범위(A1)는 수정분이 닿지 않았다.

## 차단 (실패)

없음.

## 권고 (실패 아님)

- RA-R4. 복잡도: `manual`의 `onPointerDown`은 노드 클릭 때도 켜지는데, 노드 클릭은 `onSelect`로 `selected`를 채워 이미 `nearest`가 된다. 휠·스크롤 막대·키보드만 감지하면 충분할지 A4 구현 때 engineer가 판단해 `onPointerDown`을 스크롤 막대용으로만 두거나, RA6b 확인 결과에 따라 줄인다. 반드시 고칠 필요는 없다.
- RA-R5. A.2 340행의 `manual` 되돌림("같은 effect 안에서 이전 id를 `useRef`로 비교, 또는 `[session?.id]` effect 한 줄")은 택일이 열려 있다. 한 줄 effect 쪽이 단순하다. effect 순서(`manual` 초기화가 이동 effect보다 먼저 선언)만 A4가 지키면 된다.

## 실행 확인 필요 (읽기만 함)

`cargo test r_col_`·`cargo test`, `npm.cmd run build`, A3·A4의 모든 `Select-String`, A-2~A-4 화면 측정(1032×204·`li` 좌표·간선 `d`·`.gscroll` scrollLeft), RA6(바깥 조상 스크롤)·RA6b(스크롤 막대 pointerdown).

VERDICT: PASS
