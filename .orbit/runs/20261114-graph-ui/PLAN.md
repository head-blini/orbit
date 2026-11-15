# PLAN: 마일스톤 ④ 화면 (세션 상태 · 가로 에이전트 그래프 · 게임기 액정)

## 변경 이력

- 1차(PLAN_CHECK FAIL 반영): B1 "멈춤(추정)" 판정을 Rust 순수 함수로 옮기고 `cargo test`로 검증, QA에 `?`·칩·노드 상태 표를 실제 데이터로 보는 단계 추가. B2 릴리스 실행을 디버그 빌드 실행으로 바꿔 실제 `~/.claude` 접근을 없앰(대체 경로와 공개 문구는 위험 R13·"사용자에게 알릴 것"). 권고 R1(T4 검증 문구) 반영. 상세는 맨 끝 "PLAN_CHECK 1차 반영".

RUN: 20261114-graph-ui / TRACK: full / 브랜치 `orbit/20261114-graph-ui`
근거: BRIEF.md(성공 기준 1~15), DECISIONS.md 1~9(BRIEF보다 우선), DESIGN.md + `design/reference/layout_v4.html` + `design/tokens.json`(승인됨, 바꾸지 않음), RESEARCH.md, CLAUDE.md 코드 규칙·보안 체크리스트, ③ REVIEW의 N1·N2·N3·N6·N11·W7, ② SECURITY A5(프론트 `Map`).

## 목표

Orbit 창 하나에서 확정 배치(layout_v4)대로 다음을 읽을 수 있게 한다.
- 세션 목록: 폴더 이름, 상태 기호(작업 중 · 대기 · 완료 · 에러 · 멈춤(추정)), 마지막 활동 시각.
- 고른 세션의 가로 1단계 그래프: Lead에서 서브에이전트로 이어진다.
- 상세·하네스 패널: 세션 정보, 노드 정보, "설정" 묶음.
- 비활성 채팅 틀.
- 사용자 그림을 띄우는 게임기 액정.

데이터는 Rust 메모리 세션 모델에서 온다. 훅과 메인 로그를 합친다. 타임라인과 도구 호출 목록은 화면에서 지운다. 글꼴은 Galmuri11을 번들한다. CSP를 켠다. asset 프로토콜은 `screens/` 하나로 한정한다.

## 설계 요지

- **그래프 라이브러리 없음.** 노드는 Lead 1개와 서브에이전트 한 열뿐이다. 그래서 시안과 같은 방식으로 그린다. 노드는 절대 위치 `<li>`(168×60, 간격 10, 단계 간격 80)로 두고, 간선은 SVG `path`(`M168 y0 H208 V y1 H248`, `stroke-dasharray 4 4`, `shape-rendering crispEdges`)로 그린다. 위치 계산은 `Graph.tsx` 안의 루프 하나로 끝낸다. 6개 이상이면 칩(높이 24)으로 줄이고, 선택한 노드만 큰 상자로 둔다.
- **상태와 노드 합치기는 Rust에서 한다.** 로직을 `cargo test`로 검증하기 위해서다. 프론트에는 테스트 러너가 없고 새로 넣지 않는다. "멈춤(추정)" 판정도 Rust 순수 함수 `sessions::snapshot(s, now)`(시각을 인자로 받으므로 테스트가 10분을 기다리지 않는다)가 하고, 세션이 Rust 밖으로 나갈 때마다(`get_sessions`, `session-update` 두 경로) 적용한다. 조용한 세션은 이벤트가 다시 오지 않으므로 프론트는 30초마다 `get_sessions`를 다시 불러 판정을 갱신한다. 프론트에 남는 로직은 배치 좌표와 시각 형식뿐이다.
- **세션 상태**(`Session.state`, 기본값 `working`). 로그 줄은 상태를 바꾸지 않는다. 훅만 바꾼다.

  | 훅 | 상태 |
  |---|---|
  | UserPromptSubmit · PreToolUse · PostToolUse · PostToolUseFailure | working (대기 해제) |
  | PermissionRequest · Notification `permission_prompt` | waiting |
  | Stop · SessionEnd · Notification `idle_prompt` | done |
  | StopFailure | error |
  | SubagentStart/Stop · 그 밖의 Notification · 모르는 이벤트 | 그대로 |

  재시작한 뒤의 세션(로그만 있음)은 `working`이다. 상태가 `working`이고 마지막 활동이 10분(`STALL_MS`) 넘게 지났으면 `snapshot`이 `stalled: true`를 붙이고 프론트는 "멈춤(추정)"으로 보인다(DECISIONS 7, BRIEF 열린 질문 2의 수용 위험).
- **서브에이전트 노드**(`Session.agents: Vec<Agent>`, 최대 `MAX_AGENTS = 200`). 노드 키는 `tool_use_id`(Agent 호출) 또는 `agent_id`이고, 적어도 하나는 반드시 있다. 1단계만 그린다. `agent_id`가 붙은 훅(서브에이전트 안에서 발동)의 Agent 호출과 로그 `isSidechain:true` 줄은 노드를 만들지 않는다. Agent 도구 이름은 `"Agent"` 또는 `"Task"`로 받는다(옛 이름, 미확인).
  - 훅 PreToolUse(Agent): `tool_use_id`로 노드를 만들거나 찾는다. 비어 있는 칸만 채운다(`kind` ← `tool_input.subagent_type`, `description` ← `tool_input.description`, `started_ms` ← now). 상태는 unknown이면 running으로 바꾼다.
  - SubagentStart: `agent_id`로 노드를 찾으면 running으로 바꾼다(끝난 노드도 resume이면 다시 running). 없을 때 `agent_type`이 비어 있지 않으면 짝을 찾는다. 짝은 `agent_id`가 없고 running이며 `kind`가 같거나 없는 노드 중 가장 먼저 만든 것이다. 찾으면 그 노드에 `agent_id`를 붙인다(추정 짝짓기, BRIEF 열린 질문 5). 못 찾으면 새 노드(running)를 만든다. `agent_type`이 비어 있으면 무시한다.
  - SubagentStop: `agent_id` 노드가 running·waiting이면 done으로 바꾸고, `duration_ms`가 없으면 now−started로 채운다. 노드가 없을 때 `agent_type`이 비어 있지 않으면 done 노드를 만들고, 비어 있으면 무시한다(내부 에이전트, BRIEF 4).
  - PostToolUse(Agent): `tool_use_id` 노드를 찾거나 만든다. `tool_response`가 객체일 때만 다음을 한다.
    - `agentId`: 같은 `agent_id`를 가진 다른 노드가 있으면 이 노드에 합친다. 다른 노드의 빈칸 정보와 더 이른 `started_ms`를 가져오고 그 노드는 지운다. 그다음 `agent_id`를 붙인다.
    - `totalTokens` → `tokens`, `totalDurationMs` → `duration_ms`.
    - `status=="async_launched"`이면 running을 유지하고, 그 밖이면 done으로 바꾼다.
  - PostToolUseFailure(Agent): failed. 실패(`✕`)는 이 경우와 로그 `is_error`일 때만 쓴다(DECISIONS 6).
  - PermissionRequest · Notification `permission_prompt`에 `agent_id`가 있으면 그 노드가 running일 때 waiting으로 바꾼다. 같은 `agent_id`의 Pre/PostToolUse가 오면 waiting을 running으로 되돌린다.
  - 로그 `tool_use`(Agent·Task, `id` 있음): 노드가 없으면 unknown으로 만든다. `started_ms`는 줄 `timestamp`다. 이미 있으면 빈칸만 채운다.
  - 로그 `tool_result`(그 id): `is_error==true`면 failed다. 아니면 unknown일 때만 done으로 바꾼다. 훅이 running으로 둔 노드는 건드리지 않는다. 백그라운드 `async_launched` 결과가 노드를 끝내지 않게 하려는 것이다. `duration_ms`가 없고 시작·끝 시각이 둘 다 있으면 차이로 채운다.
- **N1·N2·W7·events**
  - N1: `last_ms`는 훅 도착 시각과 로그의 파싱된 `timestamp`로만 올린다. `timestamp` 없는 줄은 `last_ms`를 바꾸지 않는다(이벤트 `at_ms`는 지금처럼 읽은 시각으로 채운다).
  - N2: 같은 키가 다시 오면 기존 항목의 `tool`이 빈 문자열일 때 새 값으로 채운다.
  - W7: `phase`·`source`·`state`를 `#[serde(rename_all = "lowercase")]` enum으로 바꾼다. JSON 값은 같다.
  - 타임라인을 지우므로 `Session.events`는 `#[serde(skip)]`로 내부 중복 제거 전용이 된다. IPC로 보내는 양도 준다.
- **액정**: `screens.rs::list(dir)`가 다음 조건을 모두 만족하는 파일만 돌려준다.
  - `dir` 바로 아래에 있다.
  - `file_type().is_file()`이다(심볼릭 링크와 폴더는 제외).
  - 확장자가 png·jpg·jpeg·gif·webp 중 하나다(대소문자 무시, svg 제외).
  - `canonicalize(파일)`의 부모가 `canonicalize(dir)`와 같다.

  돌려주는 경로는 canonical 경로가 아니라 `dir.join(파일 이름)`이다. Windows canonical 경로의 `\\?\` 접두사가 asset URL과 scope 매칭을 깨지 않게 하려는 것이다. 폴더는 앱이 만들지 않는다. "폴더 열기"를 누를 때만 `create_dir_all` 뒤에 연다. 폴더 열기는 Rust 명령에서 `tauri_plugin_opener::OpenerExt::open_path`로 한다. 프론트가 경로를 넘기지 않으므로 capability를 늘리지 않는다. 프론트는 `convertFileSrc(path)`를 `<img>`에 넣는다. 시작할 때 무작위로 하나를 고르고, 5분마다 또는 누를 때 목록을 다시 읽고 `(idx+1)%n`으로 넘어간다.
- **설정 파일**
  - `tauri.conf.json`의 `app.security`를 다음처럼 둔다.
    - `assetProtocol: { "enable": true, "scope": ["$APPDATA/screens/*"] }`
    - `csp`: `default-src 'self' ipc: http://ipc.localhost; img-src 'self' asset: http://asset.localhost; font-src 'self'; style-src 'self'`
    - `devCsp`: 위 값에서 `script-src`와 `style-src`에 `'unsafe-inline'`을, `connect-src`에 `ws://localhost:1420`을 더한다(Vite dev의 인라인 preamble·style 주입·HMR용).
  - capability `default.json`은 바꾸지 않는다.
- **프론트 파일**: `src/types.ts`(공유 타입·헬퍼), `App.tsx`(상단 바·세션·상세·채팅·게임기 틀), `Graph.tsx`+`Graph.css`, `Screen.tsx`. App.css는 시안 CSS를 옮긴다. 패널마다 `grid-column`·`grid-row`를 명시하고, `grid-template-areas`는 쓰지 않는다. 세션 맵은 `Map<string, Session>`이다(A5). `listen`이 완료된 뒤에 `get_sessions`를 부르고(N3), 실패하면 화면에 표시한다(N6). 선택한 것은 `aria-current="true"`로 표시한다(N11). 로그·페이로드에서 온 문자열은 JSX 텍스트로만 넣는다.

### 인터페이스 (태스크 간 계약 — 이 이름과 형태를 그대로 쓴다)

Rust `sessions.rs`:
```rust
pub const MAX_EVENTS: usize = 500;           // 그대로
pub const MAX_AGENTS: usize = 200;
#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)] #[serde(rename_all = "lowercase")]
pub enum Source { Hook, Log, Both }
#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)] #[serde(rename_all = "lowercase")]
pub enum Phase { Call, Result }
#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)] #[serde(rename_all = "lowercase")]
pub enum State { Working, Waiting, Done, Error }
#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)] #[serde(rename_all = "lowercase")]
pub enum NodeState { Running, Waiting, Done, Failed, Unknown }
#[derive(Clone, serde::Serialize)]
pub struct Agent {
    pub tool_use_id: Option<String>,
    pub agent_id: Option<String>,
    pub kind: Option<String>,          // agent_type / subagent_type
    pub description: Option<String>,
    pub state: NodeState,
    pub started_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    pub tokens: Option<u64>,
}
// Event: phase: Phase, source: Source (나머지 그대로)
// Session: 기존 필드 + pub state: State, pub agents: Vec<Agent>, pub stalled: bool; events는 #[serde(skip)]
//   stalled는 저장소 안에서는 항상 false이고 snapshot만 채운다
pub const STALL_MS: u64 = 600_000;
/// 내보내기용 복제본. state == Working && now.saturating_sub(last_ms) > STALL_MS 이면 stalled = true, 아니면 false.
pub fn snapshot(s: &Session, now: u64) -> Session;
// Store의 공개 함수 시그니처는 그대로(ingest_hook, ingest_log, get, all), parse_ms, now_ms 그대로
```

Rust `screens.rs`:
```rust
pub const EXTS: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];
/// dir 바로 아래 그림 파일(dir.join(이름)), 이름순. dir이 없거나 못 읽으면 빈 목록.
pub fn list(dir: &Path) -> Vec<PathBuf>;
```

Tauri 명령·이벤트:

| 이름 | 형태 |
|---|---|
| `get_status` (필드 추가) | 기존 필드 + `screens_dir: string`(못 정하면 `""`) |
| `get_sessions`, 이벤트 `session-update` | 그대로. 단 `Session` JSON = `{id, cwd, started_ms, last_ms, source, ver, state, agents, stalled}`(`events` 없음). 두 경로 모두 `snapshot(s, now_ms())`를 거친 값을 보낸다 |
| `list_screens` (새) | `() -> string[]` 절대 경로, 없거나 실패하면 `[]` |
| `open_screens_dir` (새) | `() -> Result<(), string>`. 폴더를 만들고 탐색기로 연다 |
| `install_hooks` / `uninstall_hooks` | 그대로 |

프론트 `src/types.ts`(F1이 만든다):
```ts
export type Source = "hook" | "log" | "both";
export type SessionState = "working" | "waiting" | "done" | "error";
export type NodeState = "running" | "waiting" | "done" | "failed" | "unknown";
export type Agent = { tool_use_id: string | null; agent_id: string | null; kind: string | null; description: string | null;
  state: NodeState; started_ms: number | null; duration_ms: number | null; tokens: number | null };
export type Session = { id: string; cwd: string | null; started_ms: number | null; last_ms: number; source: Source;
  ver: number; state: SessionState; agents: Agent[]; stalled: boolean };
export const shownState = (s: Session) => (s.stalled ? "stalled" : s.state); // 판정은 Rust snapshot이 한다
export const nodeKey = (a: Agent) => a.tool_use_id ?? a.agent_id ?? "";
export const fmtTime = (ms: number | null, now: number) => string; // null·0 → "—", 오늘 HH:MM, 아니면 MM/DD HH:MM
export const folderName = (s: Session) => string;                  // cwd 마지막 조각(/, \ 기준), 없으면 id 앞 8자
```
컴포넌트 props:
- `Graph({ session, selected, onSelect }: { session: Session | null; selected: string | null; onSelect: (key: string) => void })`: Lead 키는 `"lead"`다(`now`는 판정이 Rust로 옮겨져 받지 않는다).
- `Screen()`: props 없음.

## 새 의존성

| 항목 | 종류 | 왜 필요한가 | 안 쓰는 대안 |
|---|---|---|---|
| `tauri` Cargo feature `protocol-asset` | Cargo feature. 크레이트 `http-range`가 따라 들어온다(FEAT 문서 기준, 실제 추가 크레이트는 T7에서 `Cargo.lock` diff로 확인해 VERIFY에 적는다) | `assetProtocol.enable` + `convertFileSrc`로 앱 데이터 `screens/`의 그림을 `<img>`에 넣는다(BRIEF 8) | (1) Rust 명령이 파일을 base64 data URL로 넘기는 방식: feature는 필요 없지만 큰 GIF를 IPC로 통째로 보내고, CSP에 `data:`를 열어야 한다. (2) 커스텀 URI 스킴 핸들러: 직접 쓰는 코드가 더 많고 경로 검사를 다시 구현해야 한다 |
| 글꼴 파일 `src/assets/fonts/Galmuri11.woff2` (Galmuri v2.40.3, SIL OFL 1.1) + `OFL.txt` | 저장소에 넣는 파일(런타임 패키지 아님) | 확정 디자인 d37: 제목·메뉴는 픽셀 글꼴. 네트워크 없이 보여야 한다(BRIEF 9, 기준 15) | npm `galmuri`를 dependency로 두는 것은 쓰지 않는다. 모든 변형 글꼴이 딸려 오고 package.json이 바뀐다. 입수할 때만 임시 폴더에서 `npm.cmd pack`하고 package.json·lock은 바꾸지 않는다. CDN은 CSP·오프라인 조건에 어긋난다. 시스템 monospace 대체는 기준 15를 만족하지 못한다 |

새 npm 패키지·새 크레이트 직접 의존성은 없다.
- 그래프 라이브러리(React Flow 등)는 쓰지 않는다. 1단계에 노드가 수십 개 이하라 CSS 절대 위치와 SVG `path`로 충분하다. 라이브러리의 기본 스타일을 4명암 디자인에 맞춰 덮는 비용이 더 크다.
- 프론트 테스트 러너(vitest)도 넣지 않는다. 검증할 로직은 Rust에 둔다.
- 폴더 열기는 이미 설치된 `tauri-plugin-opener`의 Rust API를 쓴다.

## 태스크

공통 규칙:
- Rust 명령은 `C:\Users\lclk1\Projects\orbit\src-tauri`에서 실행한다. npm은 `npm.cmd`로 실행한다.
- 각 태스크는 자기 파일만 고친다. 같은 웨이브의 다른 태스크 때문에 빌드가 잠시 깨지면 남의 파일은 고치지 말고 다시 실행한다. 계속 깨지면 Lead에게 보고한다.
- 테스트 임시 폴더는 기존 패턴을 쓴다(`std::env::temp_dir()` + pid + `AtomicU32`, 끝나면 삭제).
- 커밋은 태스크마다 자기 파일만 `git add <경로>`하고 `git commit -F C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-graph-ui\tasks\<id>\COMMIT_MSG.txt`로 한다. `index.lock` 충돌이 나면 잠시 뒤 다시 시도한다.
- `unwrap(`·`expect(`·`println!`·`eprintln!`·`dbg!`는 `#[cfg(test)]` 밖에서 쓰지 않는다. 문자열 "관문"·"타임라인"은 `src/` 어디에도 쓰지 않는다(주석 포함).
- 실제 `~/.claude`는 열지 않는다.

| id | 할 일 | 파일 경로 | 검증 방법 | 웨이브 | 의존 |
|---|---|---|---|---|---|
| T1 | **세션 상태 + N1·N2·W7 + events 숨김** (역할: engineer). `Source`·`Phase`·`State` enum을 인터페이스대로 바꾸고, `merge`와 기존 테스트의 문자열 비교를 enum으로 고친다. `Session`에 `state: State`(기본 `Working`)와 `agents: Vec<Agent>`(이번 태스크에서는 타입과 빈 벡터만, `Agent`·`NodeState`·`MAX_AGENTS`는 인터페이스대로 선언)를 더한다. `events`에 `#[serde(skip)]`를 붙인다. `stalled: bool`(기본 false)과 `STALL_MS`, `snapshot(s, now)`를 인터페이스대로 더한다(`saturating_sub`로 시계가 거꾸로여도 panic 없음). `ingest_hook`에서 설계 요지의 상태 표대로 상태를 바꾼다(`notification_type`은 문자열일 때만 본다). N1: `ingest_log`의 `touch`에 넘기는 시각을 `ts.unwrap_or(0)`으로 바꾸고(`last_ms`는 max이므로 timestamp 없는 줄은 올리지 못한다), 이벤트 `at_ms`는 지금처럼 `ts.unwrap_or(read_ms)`로 둔다. N2: `add_event`의 중복 분기에서 `e.tool`이 비어 있으면 `ev.tool`로 채운다. **테스트를 먼저 쓴다**: (a) 상태 표의 각 행을 훅 하나씩 넣어 확인한다. 순서 UserPromptSubmit→working, PermissionRequest→waiting, PreToolUse→working, Notification `permission_prompt`→waiting, PostToolUse→working, Stop→done, StopFailure→error, UserPromptSubmit→working, Notification `idle_prompt`→done, SessionEnd→done. SubagentStart와 Notification `auth_success`는 그대로 둔다. `notification_type`이 숫자여도 panic하지 않는다. (b) 로그만 있는 세션은 `Working`이고, 로그 줄은 `Done`을 바꾸지 않는다(훅 Stop → 로그 줄 → 여전히 done). (c) N1: ts 줄(2000-03-01) 뒤에 ts 없는 줄을 읽은 시각 9e12로 넣어도 `last_ms`가 951868800000 그대로다. ts 없는 줄만 있는 세션은 `last_ms == 0`이다. (d) N2: 로그 `tool_result`(t1)를 먼저, 훅 PostToolUse(t1, `Read`)를 나중에 넣으면 그 항목의 `tool == "Read"`다. (e) `serde_json::to_value(세션)`의 `source=="both"`, `state=="working"`, `agents==[]`, `stalled==false`이고 `events` 키가 없다. (f) 멈춤 판정 `snapshot`(시각을 인자로 넣는다): `last_ms=L`인 working 세션에 now=`L+STALL_MS` → `stalled==false`(경계는 초과만), now=`L+STALL_MS+1` → `true`. 같은 간격에서 waiting·done·error 세션은 `false`. now < `last_ms`이면 `false`(panic 없음). ts 없는 로그 줄만 있는 세션(`last_ms==0`, working)은 now=9e12에서 `true`. `snapshot`이 원본 `Store` 안의 세션을 바꾸지 않는다(`get(id).stalled==false`). `serde_json::to_value(snapshot(..))["stalled"]==true` | `src-tauri/src/sessions.rs` | 구현 전 `cargo test sessions::` 실패 → 구현 후 전부 통과. `cargo test` 전체 0 종료(lib.rs 기존 테스트는 `events.len()`을 그대로 쓴다). `Select-String -Path src\sessions.rs -Pattern 'unwrap\(','expect\(','println!','eprintln!','dbg!'` 결과가 전부 `#[cfg(test)]` 안에 있다(`unwrap_or*`는 허용) | 1 | — |
| T2 | **그림 목록** (engineer). `src-tauri/src/screens.rs`를 새로 만든다. `EXTS`, `list(dir)`는 설계 요지대로 구현한다. 범위 검사는 `fn inside(dir_canon: &Path, p: &Path) -> bool`로 둔다(`canonicalize(p)`의 `parent()`가 `dir_canon`과 같은지 본다). `lib.rs`에는 `mod screens;` 한 줄만 더하고, 사용하기 전까지 생기는 dead_code 경고는 허용한다. **테스트를 먼저 쓴다**: (a) 폴더가 없으면 `[]`, 빈 폴더도 `[]`. (b) `a.png`, `b.GIF`, `c.jpeg`, `d.webp`, `e.jpg` → 5개, 이름순, 각 경로 == `dir.join(이름)`. (c) `x.svg`, `y.txt`, 확장자 없는 `z`, `.png`로 끝나는 하위 폴더 `sub.png\`, 하위 폴더 안의 `sub\in.png` → 제외. (d) 부모 폴더에 `out.png`를 만들고 `inside(canon(dir), &dir.join("..").join("out.png")) == false`, `inside(canon(dir), &dir.join("a.png")) == true`. (e) `std::os::windows::fs::symlink_file`(non-Windows는 `unix::fs::symlink`)로 폴더 밖 png를 가리키는 `link.png`를 만든다. 만들 수 있으면 목록에서 빠지는지 확인하고, 권한이 없어 실패하면 그 단언은 건너뛴다(주석으로 사유) | `src-tauri/src/screens.rs`, `src-tauri/src/lib.rs`(mod 한 줄) | 구현 전 `cargo test screens::` 실패 → 구현 후 통과. `cargo build` 0 종료 | 1 | — |
| T3 | **Galmuri11 글꼴 번들** (engineer). 스크래치 폴더에서 `npm.cmd pack galmuri@2.40.3` → `tar -xf`로 푼다. 프로젝트 안에서 install하지 않는다. `dist/` 아래에서 Galmuri11 woff2(파일 이름은 미확인이니 실제로 확인한다)를 `src/assets/fonts/Galmuri11.woff2`로 복사한다. 라이선스 원문(패키지의 `ofl.md`/`OFL.txt`, 없으면 https://raw.githubusercontent.com/quiple/galmuri/<커밋>/ofl.md)을 `src/assets/fonts/OFL.txt`로 두고, 맨 위의 저작권 줄 `Copyright © 2019–2025 Lee Minseo (quiple@quiple.dev)`를 원문과 대조한다. `src/assets/fonts/SOURCE.md`에는 저장소 URL, 버전 2.40.3, 커밋(`git ls-remote https://github.com/quiple/galmuri refs/tags/v2.40.3` 결과, 없으면 패키지 `gitHead`), 원본 파일 이름, npm integrity, 라이선스 OFL-1.1, 사용처(제목·메뉴 픽셀 글꼴)를 적는다. dist에 Galmuri11 woff2가 없으면 GitHub 릴리스 zip에서 같은 방식으로 받는다 | `src/assets/fonts/Galmuri11.woff2`, `src/assets/fonts/OFL.txt`, `src/assets/fonts/SOURCE.md` | `Get-Item src\assets\fonts\*` 3개가 있다. `git diff --stat package.json package-lock.json` → 변경 없음. `Select-String src\assets\fonts\OFL.txt -Pattern 'SIL OPEN FONT LICENSE','Copyright'` → 둘 다 있다. `Select-String src\assets\fonts\SOURCE.md -Pattern '2\.40\.3','[0-9a-f]{40}'` → 둘 다 있다. 한글 글리프가 들어 있는지는 F1 뒤 T7에서 화면으로 확인한다 | 1 | — |
| T4 | **Designer 산출물 커밋** (engineer). 아직 커밋되지 않은 `design/reference/layout_v4.html`, `design/tokens.json`을 내용 변경 없이 커밋한다(`git add design/`) | `design/**` | 커밋 전 `git status --short -uall design/`가 `?? design/reference/layout_v4.html`, `?? design/tokens.json` 두 줄만 보인다(`-uall` 없이 보면 `?? design/` 한 줄이다). 커밋 후 `git status --short design/` → 빈 출력. `git show --stat HEAD` → design 파일 2개만 있다 | 1 | — |
| T5 | **SPEC.md 문구 맞춤** (역할: **librarian**. 코드 아닌 문서지만 COMMIT 뒤에 바뀌면 관문이 막으므로 qa·security보다 먼저 커밋한다). "화면" 절과 "1단계 완료 기준"만 고친다. 45행: Lead → 서브에이전트 가로 노드-간선, 1단계만, 손자·Dynamic Workflow 노드는 다음으로. "React Flow 추천"은 지운다. 46행: "노드 색" → 색 없이 기호로 구분하는 노드 상태(실행 중 / 끝남 / 실패(확인될 때만) / 대기). "성공"을 "끝남"으로 바꾼다(DECISIONS 6). 토큰·소요 시간은 얻을 수 있을 때만. 48~49행 "3. 타임라인": 도구 호출 목록은 화면에 두지 않는다는 문장으로 바꾸고, 오른쪽 아래 게임기 화면(사용자 그림, `screens/`)을 적는다. "빨간색"은 지운다. 58행: "그래프 · 타임라인" → "그래프". 74행: "세션·도구 호출·서브에이전트가 그래프로" → "세션과 서브에이전트가 그래프로". 77행: "채팅 · 그래프 · 타임라인" → "채팅 · 그래프". 147행(작업 방식 요청의 마일스톤 목록)을 포함해 다른 절은 건드리지 않는다 | `SPEC.md` | `git diff --stat` → SPEC.md 한 파일. `git diff -U0 SPEC.md`의 모든 hunk가 39~78행 범위 안에 있다. `Select-String SPEC.md -Pattern '타임라인','React Flow','노드 색','빨간'` → 147행 "④ 그래프/타임라인 UI" 한 줄만 남는다 | 1 | — |
| T6 | **서브에이전트 노드 합치기** (engineer). 설계 요지의 "서브에이전트 노드" 규칙을 `sessions.rs`에 구현한다. `ingest_hook`의 이벤트 분기에서 처리하고, `ingest_log`의 블록 루프에서는 줄 `isSidechain==true`이면 건너뛴다. 필드는 `.get()/.as_str()/.as_u64()/.as_object()`로만 꺼낸다. 시각은 훅이면 now, 로그면 파싱된 ts(없으면 started·duration은 비운다). 넘치면 가장 오래된 노드부터 뺀다. **테스트를 먼저 쓴다**: (a) Pre(Agent, t1, subagent_type `engineer`, description `d`) → 노드 1개 running, kind engineer. SubagentStart(a1, `engineer`) → 여전히 1개, agent_id a1. SubagentStop(a1) → done. PostToolUse(Agent, t1, `{status:"completed",agentId:"a1",totalTokens:5,totalDurationMs:7}`) → 1개 done, tokens 5, duration 7. (b) SubagentStop(`agent_type:""`, 모르는 agent_id) → 노드 0. (c) SubagentStart(a2, `Explore`)를 먼저 넣으면 노드 X. 그다음 Pre(t2, `Plan`)이 오면 kind가 달라 짝짓지 않으므로 노드 Y. Post(t2, agentId a2)가 오면 X가 Y에 합쳐져 노드 1개(tool_use_id t2, agent_id a2)가 되고, started_ms는 둘 중 이른 값이다. (d) PostToolUseFailure(Agent, t3) → failed. (e) Post(Agent, t4, status `async_launched`) → running 유지. (f) 로그: Agent tool_use(t5, `input.subagent_type` `qa`, ts 00:00:00)만 있으면 unknown. tool_result(t5, ts 00:00:02)가 오면 done, duration 2000. 다른 id(t6)의 결과가 `is_error:true`면 failed. `input`에 subagent_type이 없으면 kind None, description 있음. 이름이 `Task`여도 노드가 생긴다. (g) Pre(t7) running 뒤 로그 tool_use(t7), 로그 tool_result(t7)가 와도 1개 running이고, 그 뒤 훅 Post(t7)가 오면 done. (h) `agent_id`가 붙은 Pre(Agent)(손자) → 노드 0. `isSidechain:true` 줄의 Agent tool_use → 노드 0. (i) PermissionRequest(agent_id a1) → a1 노드 waiting. PreToolUse(agent_id a1, tool `Read`) → running. (j) 이상한 모양에서 panic하지 않는다: `tool_input`이 문자열, `tool_response`가 숫자, `agent_type`이 숫자, `agentId`가 객체 → 노드 0개이거나 정상 처리. (k) `MAX_AGENTS+1`개 Pre(Agent) → 길이가 `MAX_AGENTS`이고 첫 노드가 빠졌다. (l) `<b>x</b>` agent_type이 그대로 kind에 저장된다(이스케이프나 변형 없음, 표시는 프론트에서 텍스트로) | `src-tauri/src/sessions.rs` | 구현 전 `cargo test sessions::` 새 테스트 실패 → 구현 후 `cargo test` 전체 0 종료. 위 Select-String 규칙 동일. **실행해서 확인할 항목**(로그의 Agent 이름과 `subagent_type`, Agent 실패 훅)은 QA 4·5단계에서 확인한다 | 2 | T1 |
| F1 | **화면 틀** (engineer). 다음 파일을 만들거나 바꾼다. `src/types.ts`는 인터페이스대로. `App.tsx`는 새로 쓰고, `ToolEvent`·`events`·`Panel(gridArea)`·`SOURCE_LABEL` 목록 이어 붙이기·타임라인 패널·`aria-pressed`를 지운다. `App.css`는 시안 `<style>`을 옮겨 기존 다크 변수와 `grid-template-areas`·`.events`를 없앤다. 그래프 노드 규칙은 F2 몫이라 넣지 않는다. 첫 줄에 `@font-face { font-family: "Galmuri11"; src: url("./assets/fonts/Galmuri11.woff2") format("woff2"); font-display: block; }`를 둔다. `.lcd img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; display:block }`도 넣는다. `Graph.tsx`·`Screen.tsx`는 스텁으로 둔다(Graph는 빈 상태 문구, Screen은 빈 `div.lcd`). F2·F3가 이 둘을 덮어쓴다. App 동작: `listen("session-update")`가 끝난 뒤 `get_sessions`를 부르고(N3), 실패하면 세션 칸에 "✕ 로그 폴더를 읽지 못했습니다 — 설정 참고"를 보인다(N6, `projects_error`일 때도 같은 문구). 맵은 `Map` 상태로 두고 ver가 작은 스냅숏은 버린다(같은 ver는 교체한다. 멈춤 판정만 바뀐 스냅숏이 들어와야 한다). 30초마다 `now`를 갱신하고 `get_sessions`를 다시 불러 맵을 갱신한다(이 주기 재요청이 실패하면 기존 화면을 유지한다). 상태 기호는 `shownState(s)`로 정한다. 상단 바: "ORBIT"과 서버 상태 `role=status`(DESIGN 4절 문구). 세션 칸: `last_ms` 내림차순 `<button aria-current>`. `▶` 커서, 폴더 이름(px), 상태 기호(작업 중 = 작은 진행 막대, 대기 = 깜빡이는 `!`, 에러 = `✕`, 멈춤 = `?`, 완료 = 없음)와 `.sr` 상태 이름, 둘째 줄에 `fmtTime`을 둔다. 로딩·빈·에러 문구는 DESIGN대로, 6개 이상이면 칩. 그래프 칸: `<Graph …/>`. 상세 칸의 세 묶음은 DESIGN 4절대로다. "세션"은 폴더/상태/id(고정폭)/출처(훅·로그·훅 + 로그)/마지막. "노드"는 선택했을 때만 보이고 종류(`kind ?? description ?? "—"`, Lead는 "Lead")/상태/시작/시간/토큰이며, 없는 값은 "—"다. "설정"은 훅 상태, [설치] [제거](기존 `run` 동작과 백업 문구 유지), 결과 줄(`role=status`), 평문 토큰 안내, allowedHttpHookUrls 안내, 대상·로그·액정 경로, [폴더 열기](`invoke("open_screens_dir")`, 실패하면 결과 줄에 "✕ 오류: 사유")다. 채팅 칸: 빈 문구 "대화 기능은 ⑥에서 연결됩니다.", `disabled` 입력(placeholder "Claude Code에게 무엇을 시킬까?", aria-label에 "⑥에서 연결"), `▼`, "⑥에서 연결" 칩. 게임기 칸: `<div className="console"><Screen/></div>`. 세션을 바꾸면 선택한 노드를 지운다. Status 타입에 `screens_dir`를 더한다 | `src/types.ts`, `src/App.tsx`, `src/App.css`, `src/Graph.tsx`(스텁), `src/Screen.tsx`(스텁) | `npm.cmd run build` 0 종료. `Select-String -Path src\*.tsx,src\*.ts,src\*.css -Pattern 'dangerouslySetInnerHTML','관문','타임라인','hook-event','grid-template-areas','gridArea','aria-pressed','#[0-9a-fA-F]{3,8}\b'` → 색상은 `App.css`의 4명암 `:root` 변수 4줄만 나오고 나머지 패턴은 결과 없음. `npm.cmd run dev`를 띄워 브라우저 http://localhost:1420에서 배치(6칸, 채팅과 게임기 높이가 같음)를 확인한다. invoke가 없어 오류 상태로 보이는 것은 정상이다 | 2 | T3 |
| F2 | **가로 그래프** (engineer). `Graph.tsx`를 실제 구현으로 바꾸고 `Graph.css`를 만든다(시안의 `.canvas/.edges/.edge/.flow/.nodes/.node/.is-run/.is-fail/.is-wait/.pbar/.side-note`와 칩 규칙). 그리는 규칙은 다음과 같다. 세션이 없으면 "세션을 고르면 에이전트 흐름이 보입니다". Lead 노드는 `shownState`를 따른다(working = 실행 중 + 막대, waiting = 대기 `!`, error = 실패 `✕`, done = 끝남, stalled = 기본 상자 + `?` + "멈춤(추정)"). 서브에이전트가 없으면 Lead 오른쪽에 "서브에이전트 없음". 서브에이전트는 `agents` 순서대로 x=248에 세로로 쌓고, 6개 이상이면 선택하지 않은 노드는 높이 24 칩(이름 + 기호 한 줄)이다. 노드 상태 표시: running = `.is-run` + `.pbar`, failed = `.is-fail` + `✕` + "실패", waiting = `.is-wait` + 깜빡이는 `!` + "대기", done = "끝남", unknown = `—` + "알 수 없음". 셋째 줄은 `시간 · 토큰`이다. 시간은 `duration_ms`를 "N분 N초"/"N초"로, 토큰은 `tokens`를 1000 이상이면 "Nk 토큰"으로 쓰고, 없으면 "—"다. 간선은 `M168 {leadMid} H208 V{childMid} H248`이고 running 노드로 가는 것에만 `.flow`를 붙인다. canvas 크기는 계산값이며 넘치면 패널 안에서 스크롤한다. 노드는 `<ol aria-label="에이전트">` 안의 `<button aria-current>`이고, 누르면 `onSelect(nodeKey)`(Lead는 `"lead"`)를 부른다. 키는 `nodeKey`다. SVG는 `aria-hidden`, 기호도 `aria-hidden`이며 상태 문구는 보이는 텍스트다. 위치 값(`left/top`)만 React `style` prop으로 넣는다(CSSOM이라 CSP `style-src 'self'`에 걸리지 않는다, T7에서 확인). `prefers-reduced-motion`에서 애니메이션을 멈춘다 | `src/Graph.tsx`, `src/Graph.css` | `npm.cmd run build` 0 종료. `Select-String -Path src\Graph.* -Pattern 'dangerouslySetInnerHTML','관문','타임라인','#[0-9a-fA-F]{3,8}\b'` → 결과 없음(색은 App.css 변수 `var(--c-*)`만 쓴다) | 3 | F1 |
| F3 | **액정** (engineer). `Screen.tsx`를 실제 구현으로 바꾼다. 처음 mount할 때 `invoke<string[]>("list_screens")`를 부르고, 비어 있지 않으면 무작위 index를 고른다. 5분 `setInterval`과 클릭 때 목록을 다시 받고 `(idx+1) % n`으로 넘어간다(이름순 목록에서 현재 경로 다음). 정리 함수에서 interval을 해제한다. 렌더: `<button type="button" className="lcd" aria-label="다음 그림" disabled={!path} onClick>`. 그림이 있으면 `<img src={convertFileSrc(path)} alt="" />`이고, 없으면 글자 없는 빈 액정이다. `img` `onError`는 그 그림을 숨겨 빈 액정으로 둔다. invoke가 실패하면 빈 목록으로 본다 | `src/Screen.tsx` | `npm.cmd run build` 0 종료. `Select-String src\Screen.tsx -Pattern 'dangerouslySetInnerHTML','list_screens','convertFileSrc'` → 앞의 것은 없고 뒤의 둘은 있다 | 3 | F1 |
| T7 | **배선 + asset·CSP 설정** (engineer). `lib.rs`: `AppState.screens_dir: Result<PathBuf, String>` = `app_data_dir()?.join("screens")`. `Status.screens_dir` 채움. 새 명령 `#[tauri::command(async)] fn list_screens(state) -> Vec<String>`(`screens::list` → `display().to_string()`), `#[tauri::command(async)] fn open_screens_dir(app: tauri::AppHandle, state) -> Result<(), String>`(`create_dir_all` → `app.opener().open_path(경로 문자열, None::<&str>)`, 오류는 문자열로)를 만들고 `generate_handler!`에 등록한다. 세션이 Rust 밖으로 나가는 세 곳(`get_sessions`의 `all()`, 훅 콜백의 `st.get(&id).cloned()`, `poll_round`의 `st.get(id).cloned()`)을 `sessions::snapshot(s, sessions::now_ms())`로 바꾼다. **테스트를 먼저 쓴다**: 기존 `poll_round` 테스트 패턴(임시 폴더 + `Watcher`)으로 `timestamp`가 2000-03-01인 로그 줄 하나를 넣으면 `poll_round`가 돌려준 세션의 `stalled == true`다. 출력문은 넣지 않는다. `Cargo.toml`: `tauri = { version = "2", features = ["protocol-asset"] }`. `tauri.conf.json`: 설계 요지의 `assetProtocol`·`csp`·`devCsp`. `capabilities/default.json`은 손대지 않는다. **실행해서 확인한다**(결과를 `tasks/T7/SUMMARY.md`에 출력과 함께 적는다): (1) feature를 넣기 전에 conf만 바꾼 상태로 `cargo build`를 돌려 결과를 기록한다(feature 불일치 오류가 날 것으로 예상하지만 미확인). feature를 넣은 뒤 0 종료. `git diff Cargo.lock`에서 새로 들어온 크레이트 이름 기록 | `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` | 구현 후 `cargo build`·`cargo test` 0 종료. `git diff --exit-code src-tauri/capabilities` → 0. `Select-String src-tauri\tauri.conf.json -Pattern 'screens'` → scope 한 줄. `Select-String src-tauri\src\lib.rs -Pattern 'list_screens','open_screens_dir'` → 정의와 `generate_handler!` 등록. 새 `poll_round` stalled 테스트가 구현 전 실패 → 구현 후 통과. `Select-String src-tauri\src\lib.rs -Pattern 'snapshot\('` → 비테스트 코드에 3곳 | 3 | T1, T2, T6 |
| T8 | **통합 실행 확인과 미확인 항목 해소** (engineer). 앱을 임시 사본 환경에서 띄운다: `$d="$env:TEMP\orbit-qa4"; mkdir "$d\projects" -Force; Set-Content "$d\settings.json" '{}'; $env:ORBIT_CLAUDE_SETTINGS="$d\settings.json"; $env:ORBIT_CLAUDE_PROJECTS="$d\projects"; $env:CLAUDE_CONFIG_DIR=$d; npm.cmd run tauri dev`. 화면의 대상·로그 경로가 `$d`가 아니면 즉시 끈다. 시험용 그림은 PowerShell `System.Drawing`으로 16×16 PNG와 GIF를 만든다. `%APPDATA%\dev.orbit.app\screens`가 없을 때 "폴더 열기"를 누른 뒤 거기에 넣는다. 아래 (1)~(6)을 차례로 확인하고, 틀리면 위험 절의 대안을 이 태스크에서 적용하고 다시 확인한다. (1) **`$APPDATA`와 `app_data_dir` 일치**: 설정 묶음의 액정 경로가 `…\AppData\Roaming\dev.orbit.app\screens`이고 그림이 보인다. devtools 콘솔에 "asset protocol not configured to allow the path"가 없다. (2) **asset URL 형식**: devtools에서 `img.src`가 `http://asset.localhost/`로 시작하는지 기록한다. (3) **폴더 열기**: 폴더가 없을 때 누르면 폴더가 생기고 탐색기에 그 폴더가 열린다. 부모 폴더가 열리면서 항목을 선택하는 동작이 아니어야 한다. "not allowed"·scope 오류가 없다(Rust `open_path`가 scope 검사를 받지 않음). (4) **CSP(dev)**: devtools 콘솔에 CSP 위반이 없고, 픽셀 글꼴(Computed 패널 rendered font = Galmuri11)과 한글 글리프가 보인다. 액정에 그림이 나오고 노드 위치가 맞다. (5) **CSP(빌드)** — 릴리스 실행은 하지 않는다. 확인하려는 것은 "dev 서버가 아닌 번들 산출물 + prod `csp`" 조합이고, 이것은 디버그 빌드로도 된다: `npm.cmd run tauri build -- --debug --no-bundle` 0 종료 뒤 `src-tauri\target\debug\orbit.exe`를 위와 같은 환경변수(`ORBIT_CLAUDE_*`, `CLAUDE_CONFIG_DIR=$d`)로 실행한다. 디버그 빌드라 `cfg(debug_assertions)` 덮어쓰기가 살아 있어 실제 `~/.claude`를 읽지 않고, devtools도 열린다(릴리스 exe는 기본적으로 devtools가 없어 CSP 위반을 볼 수 없다). 먼저 설정 묶음의 대상·로그 경로가 `$d` 아래인지 보고, 아니면 즉시 끈다. 그다음 devtools Network에서 `index.html` 응답의 `Content-Security-Policy` 헤더(또는 Tauri가 넣은 CSP)에 `ws://localhost:1420`과 `'unsafe-inline'`이 **없는지** 확인해 prod `csp`가 걸렸음을 기록하고, 콘솔 CSP 위반 없음·글꼴·액정·노드 위치를 본다. 헤더에 devCsp 값이 보이면(= `--debug` 빌드가 devCsp를 쓴다, R13) 릴리스 exe를 **실행하지 말고** 멈춰 Lead에게 보고한다(대체 절차는 R13). (6) 액정 클릭 → 다른 그림, 폴더를 비우고 재시작 → 빈 액정, 같은 폴더의 `a.svg` → 목록에 없다. 끝나면 넣은 그림, `$d`, 환경변수를 지운다 | 필요할 때만: `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src/Screen.tsx` | 위 (1)~(6)의 관찰 결과와 명령 출력을 `tasks/T8/SUMMARY.md`에 적는다. 파일을 바꿨으면 `cargo test`, `npm.cmd run build` 0 종료 뒤 커밋한다. 바꾼 것이 없으면 커밋하지 않는다 | 4 | T7, F2, F3 |

웨이브별 파일 겹침 확인:
- W1: T1 `sessions.rs`, T2 `screens.rs`와 `lib.rs`, T3 `src/assets/fonts/*`, T4 `design/**`, T5 `SPEC.md`. 서로 겹치지 않는다.
- W2: T6 `sessions.rs`, F1 `src/types.ts`·`App.tsx`·`App.css`·`Graph.tsx`·`Screen.tsx`. 서로 겹치지 않는다.
- W3: T7 `lib.rs`·`Cargo.toml`·`Cargo.lock`·`tauri.conf.json`, F2 `Graph.tsx`·`Graph.css`, F3 `Screen.tsx`. 서로 겹치지 않는다.
- W4: T8 단독.

변경이 닿는 곳 점검:
- **호출부**
  - `get_status` 반환형(T7)과 프론트 `Status`(F1).
  - `Session` JSON에서 `events`가 빠지고 `state`·`agents`가 들어간다. 바꾸는 쪽은 T1·T6, 받는 쪽은 F1 `types.ts`다.
  - `generate_handler!`에 두 명령을 등록한다(T7).
  - 세션이 나가는 세 곳(`get_sessions`, 훅 콜백 emit, `poll_round`)이 `snapshot`을 거친다(T7). `Session.stalled`는 F1 `types.ts`가 받는다.
  - `lib.rs` `poll_round`·서버 콜백은 `ingest_*` 시그니처가 그대로라 바꾸지 않는다.
- **테스트**
  - `sessions.rs`의 기존 테스트는 enum 비교로 고친다(T1).
  - `lib.rs` 테스트는 `events.len()`(pub 필드 유지)이라 그대로 둔다.
  - `screens` 테스트는 새로 만든다.
  - `hooks`·`server`·`config`·`watch` 테스트는 손대지 않는다.
- **`hook-event`**: 이미 ③에서 지웠다(grep 결과 CHANGELOG·docs의 설명에만 남아 있다). F1 검증 grep으로 다시 막는다.
- **설정**
  - `tauri.conf.json`과 `Cargo.toml`은 T7이 바꾼다.
  - capability는 변경하지 않는다. `opener:default`는 그대로 두며, 프론트는 opener를 쓰지 않는다.
  - `package.json`·`vite.config.ts`·`index.html`은 변경하지 않는다.
- **export**: `pub fn run()`은 그대로다.
- **하네스**: `harness/hooks/`·`.claude/settings.json`·CLAUDE.md는 변경하지 않는다.
- **CHANGELOG·`docs/solutions/`**: 출고 단계에서 librarian이 맡는다(이 표 밖이고, COMMIT 뒤에도 허용되는 경로다).

## QA 절차 (qa 역할, 임시 사본 대상)

1. 자동: `cargo test`(src-tauri), `npm.cmd run build`, `node --test harness/hooks/gate.test.mjs` → 모두 0이어야 한다(기준 1~3).
2. 환경: T8과 같은 `$d`를 쓰고, `CLAUDE_CONFIG_DIR=$d`로 실제 Claude Code를 돌린다. 인증 파일을 복사했다면 끝난 뒤 지운다. 앱은 `ORBIT_CLAUDE_SETTINGS`·`ORBIT_CLAUDE_PROJECTS`·`CLAUDE_CONFIG_DIR`을 지정한 창에서 `npm.cmd run tauri dev`(또는 T8 (5)의 디버그 exe)로만 띄운다. 릴리스 exe는 실행하지 않는다. 설정의 [설치]를 누르면 `$d\settings.json`에 병합되고 백업 경로가 표시되며 "설치됨"이 된다. [제거]를 누르면 "설치 안 됨"이 되고, 미리 넣어 둔 기존 항목은 남는다(기준 9). 다시 설치한다.
3. 기준 4: 1400×900 스크린샷을 찍어 Designer에게 시각 리뷰를 맡긴다(Lead가 호출).
4. 기준 5·6, 로그 `subagent_type` 실행 확인: 서브에이전트(`Explore` 등)를 하나 부르는 세션을 돌리면서 그 세션을 고른다. 노드가 실행 중 → 끝남으로 바뀌는지, 노드를 누르면 상세에 정보가 나오는지 본다. 앱을 끄고 세션이 끝난 뒤 다시 켠다. 노드가 로그에서 다시 그려지고 없는 값은 "—"인지 본다. `Select-String $d\projects\*\*.jsonl -Pattern '"name":"Agent"','"name":"Task"'` 줄에 `subagent_type`이 있는지 기록한다(없으면 description 표시로 대체된 것을 확인).
5. Agent 실패 훅 실행 확인: 없는 `subagent_type`(예: `no-such-agent`)으로 Agent를 부르게 한다. PostToolUseFailure가 오거나 로그 `is_error:true`가 있어 노드가 `✕`가 되는지 기록한다. 안 되면 "끝남"으로 보이는 것이 수용된 위험(DECISIONS 6)인지 VERIFY에 적는다.
6. 기준 7: 권한 요청 중 → `!`, Stop → 기호 없음. StopFailure는 curl로 만든다. 토큰은 `hook-server.json`에서 변수로만 읽는다. `{"hook_event_name":"StopFailure","session_id":"qa-err","error":"server_error"}` → `✕`. 줄에 id·전체 경로가 없고, 상세에 id·출처가 있다.
7. 기준 13: curl로 `SubagentStart`(`agent_type:"<b>x</b>"`, `agent_id:"qa1"`, `session_id:"qa-err"`)를 보내면 노드 이름이 글자 그대로 보인다. `cwd:"<img src=x>"`도 같이 확인한다.
7a. 기준 1·4·5·7 표시를 실제 데이터로 확인(B1). 10분을 기다리거나 `STALL_MS`를 바꾸지 않는다. 결과는 스크린샷과 함께 VERIFY에 적는다.
   - **`?` 멈춤(추정)**: 앱이 켜진 상태에서 `$d\projects\qa-proj\qa-stall.jsonl`을 새로 만들고 `{"type":"user","sessionId":"qa-stall","cwd":"C:\\qa\\stall","timestamp":"2000-03-01T00:00:00.000Z","message":{"role":"user","content":"x"}}` 한 줄을 쓴다. 세션 줄에 `?`와 `.sr` "멈춤(추정)"이 보이고, 고르면 Lead 노드가 기본 상자 + `?` + "멈춤(추정)"이다. 이어서 같은 `session_id`로 curl `UserPromptSubmit`을 보내면 `?`가 진행 막대로 바뀐다(다음 30초 재요청 안에).
   - **세션 칩**: curl `UserPromptSubmit`을 `session_id` `qa-s1`~`qa-s6`, `cwd` `C:\qa\s1`~`s6`로 보내 세션을 6개 이상으로 만든다. 세션 목록이 칩으로 바뀌고 고른 세션이 `aria-current`로 구분되는지 본다.
   - **노드 칩 + 노드 상태 표(DESIGN 6절)**: `session_id:"qa-graph"`로 curl을 보낸다. `SubagentStart`(`agent_type` `qa-r1`~`qa-r6`, `agent_id` `r1`~`r6`) 6개 → 노드 6개, 선택하지 않은 노드는 칩. `r2`에 `SubagentStop` → 끝남(기본 상자). `r3`에 `PermissionRequest`(`agent_id:"r3"`) → `.is-wait` + 깜빡이는 `!` + "대기". `PostToolUseFailure`(`tool_name:"Agent"`, `tool_use_id:"f1"`) → `✕` + "실패". 실행 중 노드(`r1`)는 반전 + 진행 막대이고 그쪽 간선에만 흐름 표시가 있다. 알 수 없음(`—`)은 위 `qa-stall.jsonl`에 `{"type":"assistant","sessionId":"qa-stall","timestamp":"2000-03-01T00:00:01.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"u1","name":"Agent","input":{"subagent_type":"qa-u","description":"d"}}]}}`를 더해 `qa-stall` 그래프에서 본다. 칩 하나를 누르면 그 노드만 큰 상자가 되고 상세에 노드 정보가 보인다.
   - 로그 줄 모양(`type`·`message` 필드)은 ③ `sessions.rs` 파서 테스트의 줄 형식을 그대로 따른다. 다르면 그 테스트의 형식으로 바꿔 쓴다.
8. 기준 8·14: T8 (1)~(6)을 다시 확인하고(5는 디버그 빌드, 릴리스 exe는 실행하지 않는다), `git diff main -- src-tauri/capabilities`가 빈 출력인지 본다.
9. 기준 10·11·15: 화면에 타임라인·도구 목록·"관문"·중계창이 없다. 채팅 입력이 비활성이고 "⑥에서 연결"이 보인다. 네트워크를 끊고(Wi-Fi off) 재실행해도 픽셀 글꼴이 보인다.
10. 정리: 그림, `$d`, 환경변수를 지운다.

## 성공 기준 대응표

| BRIEF 기준 | 덮는 태스크 | 검증 |
|---|---|---|
| 1 `cargo test` + 그래프·상태·그림 목록 테스트 | T1(상태, 멈춤 판정 `snapshot`, N1·N2), T6(노드 합치기), T2(확장자 필터·범위 검사), T7(내보내기 경로의 `snapshot`) | 각 태스크 테스트(T1 (f), T7 poll_round), QA 1, QA 7a |
| 2 `npm.cmd run build` | F1, F2, F3 | 각 태스크, QA 1 |
| 3 gate.test 회귀 | (하네스 변경 없음) | QA 1 |
| 4 확정 배치·4명암·이중 테두리·픽셀 글꼴 | F1, F2, F3, T3 | F1 브라우저 확인, T8 (4), QA 3(Designer) |
| 5 실시간 노드 실행 중 → 끝남, 노드 상세 | T6, T7, F2, F1 | T6 (a)(c), QA 4, QA 7a(노드 상태 표·칩) |
| 6 재시작 후 로그에서 노드 복원, "—" | T6(로그 규칙), T1(N1), F2 | T6 (f)(g), QA 4 |
| 7 세션 줄 구성, 대기·완료·에러 기호, 상세에 id·출처 | T1, F1 | T1 (a)(f), QA 6, QA 7a(`?`·세션 칩) |
| 8 액정 표시·클릭·빈 액정·svg와 `..` 제외·폴더 열기 | T2, T7, F3, F1(버튼), T8 | T2 (b)~(e), T8 (1)~(6), QA 8 |
| 9 설치·제거·백업·기존 항목 유지 | F1(기존 동작 이동), hooks.rs 변경 없음 | QA 2 |
| 10 타임라인·도구 목록·"관문"·중계창 없음 | F1, F2, F3 | F1·F2 Select-String, QA 9 |
| 11 채팅 입력 비활성 + "⑥에서 연결" | F1 | QA 9 |
| 12 SPEC 문구, diff가 그 절들만 | T5 | T5 검증 |
| 13 텍스트로만 렌더, `dangerouslySetInnerHTML` 없음 | F1, F2, F3, T6 (l) | Select-String, QA 7 |
| 14 asset scope는 `screens/` 하나, capability 변경 없음 | T7 | T7 검증, QA 8 |
| 15 OFL·저작권·출처, 오프라인 픽셀 글꼴 | T3, F1(@font-face) | T3 검증, T8 (4), QA 9 |

## 위험·가정

- **R1 asset 프로토콜 feature(미확인)**: `protocol-asset` 없이도 빌드가 되는지는 미확인이다. 넣는 쪽으로 계획했다. 넣었는데도 그림이 안 뜨면 T8 (1)·(2)에서 원인을 나눈다.
- **R2 `$APPDATA` ≠ `app_data_dir()`(미확인)**: 다르면 그림이 거부된다. 대안 A는 scope를 실제 해석 경로에 맞추는 것이다(예: `$APPDATA/dev.orbit.app/screens/*`, T8에서 오류 메시지의 경로로 판단). 대안 B는 conf scope를 `[]`로 두고 setup에서 `app.asset_protocol_scope().allow_directory(&screens_dir, false)`를 호출하는 것이다. 이때 기준 14의 "conf scope 하나"는 "런타임 허용 한 곳"으로 읽는다. B를 쓰면 Lead가 사용자에게 알린다.
- **R3 asset URL 형식(미확인)**: Windows에서 `http://asset.localhost/`가 아니면 CSP `img-src`에 실제 출처(`asset://localhost` 등)를 더한다. T8 (2)에서 정한다.
- **R4 폴더 열기(미확인)**: Rust `open_path`가 폴더를 탐색기로 열지 않거나 scope 오류를 내면 대안을 쓴다. 대안은 `open_screens_dir` 안에서 `std::process::Command::new("explorer").arg(&dir)`(Windows, 경로는 Rust가 만든 값이며 입력에서 오지 않음)다. capability는 넓히지 않는다. 크로스플랫폼이 필요해지면 그때 OS별 분기를 더한다.
- **R5 CSP와 Vite dev(미확인)**: devCsp가 dev 화면을 빈 화면으로 만들면 다음 순서로 확인한다. (a) `connect-src`의 ws 출처, (b) Tauri가 dev HTML에 nonce를 넣어 `'unsafe-inline'`이 무시되는 경우(CSP 규칙상 nonce가 있으면 unsafe-inline 무시). 이때는 `dangerousDisableAssetCspModification: ["script-src","style-src"]`를 **devCsp가 아닌 conf 전체 설정**에 넣어야 하므로 prod에도 영향이 간다. 그래서 적용하기 전에 Lead에게 보고한다. 빌드 CSP가 글꼴·CSS를 막으면 Vite 산출물이 `'self'`인지 확인한다. 글꼴이 data: 인라인이면 `font-src`에 `data:`를 더하지 말고 woff2가 4KB를 넘는지 확인한다.
- **R6 Agent 실패 신호(미확인)**: PostToolUseFailure가 Agent에 오는지, 로그 `is_error`가 있는지는 QA 5에서 확인한다. 둘 다 없으면 실패한 서브에이전트가 "끝남"으로 보인다(DECISIONS 6에서 수용).
- **R7 로그의 Agent 이름과 `subagent_type`(미확인)**: `Agent`·`Task` 둘 다 받는다. `subagent_type`이 없으면 노드 이름은 `description`이 된다. 둘 다 없으면 "—"다. QA 4에서 기록한다.
- **R8 추정 짝짓기**: 같은 종류를 병렬로 부르면 실행 중에 짝이 바뀔 수 있다. 같은 이름 노드끼리라 화면 차이는 시작 시각 정도다. PostToolUse(Agent)의 `agentId`가 오면 바로잡힌다. 백그라운드 서브에이전트는 SubagentStop으로만 끝난다. Orbit이 꺼져 있던 동안의 백그라운드 노드는 로그 결과 시점(`async_launched`)에 "끝남"이 될 수 있다(BRIEF 열린 질문 4에서 수용).
- **R9 상태 판단 한계**: Esc 중단은 10분 뒤 "멈춤(추정)"이 된다. 10분 넘게 조용히 도는 Bash도 "멈춤"으로 보인다. 권한 거부 뒤 아무 훅이 없으면 "대기"가 남는다. 재시작하면 모든 세션이 `working`에서 다시 출발하므로 오래된 세션은 전부 `?`로 보인다(DB 없음, DECISIONS 3·7). Lead 노드의 stalled 표시(기본 상자 + `?` + "멈춤(추정)")는 DESIGN의 세션 기호를 노드에 옮긴 것이다(가정).
- **R10 동시 커밋**: 같은 웨이브의 커밋이 `index.lock`에서 부딪칠 수 있다. 다시 시도한다.
- **R11 글꼴 입수(미확인)**: `dist/` 파일 이름, 한글 글리프 포함 여부, 12px 선명도는 미확인이다. T3·T8 (4)에서 확인한다. 파일이 너무 크면(수 MB) 서브셋을 만들지 않고 그대로 두되 크기를 SUMMARY에 적는다.
- **R12 W2·W3 병렬 빌드**: 같은 crate나 같은 프론트를 동시에 빌드하면 남의 작성 중 오류로 잠시 깨질 수 있다. 다시 실행한다.
- **R13 디버그 빌드가 prod CSP를 쓰는가(미확인)**: `tauri build --debug`는 dev 서버가 아닌 번들 산출물을 쓰므로 devCsp가 아니라 `csp`가 들어갈 것으로 본다. 공식 문서로 확인하지 못했고, T8 (5)에서 응답 CSP 헤더로 실행 확인한다. 디버그 빌드에도 devCsp가 들어가면 그때만 릴리스 실행이 필요해진다. 그 경우 엔지니어는 멈추고 Lead가 사용자에게 아래 "사용자에게 알릴 것" 2번을 보이고 승인을 받은 뒤에만 실행한다. 승인 시 절차: `$env:CLAUDE_CONFIG_DIR=$d`(로그 감시를 `$d\projects`로 돌린다. `lib.rs:128-129`는 릴리스에서도 이 변수를 따른다)와 함께 `src-tauri\target\release\orbit.exe`를 실행한다. 그래도 `settings_path`는 릴리스에서 덮어쓸 수 없어(`lib.rs:118-126`, 덮어쓰기는 `cfg(debug_assertions)` 안) 실제 `%USERPROFILE%\.claude\settings.json`을 가리킨다.
  - 읽는 것: 시작할 때와 `get_status`마다 `hooks::is_installed`가 그 파일을 읽어 메모리에서만 검사한다(`read_root` + 메모리 사본 `strip`, 쓰기 없음). 파일 내용은 화면에 나오지 않고, 화면에는 그 파일의 전체 경로(사용자 이름 포함)와 "설치됨/설치 안 됨"만 나온다.
  - 쓸 수 있는 것: 설정 묶음의 [설치]·[제거] 버튼은 그 실제 파일을 백업 후 고쳐 쓴다(`hooks::install`/`uninstall`). **두 버튼은 누르지 않는다.** [폴더 열기]는 Orbit 앱 데이터 `screens/`만 만들므로 눌러도 된다.
  - 그 밖에 실제 `~/.claude` 아래를 읽거나 쓰는 코드는 없다(`src-tauri/src`에서 `.claude`는 `lib.rs:121,133` 두 곳뿐, `hook-server.json`은 Orbit 앱 데이터 폴더).
  - 스크린샷에 실제 경로가 보이면 공유·첨부하지 않거나 경로 부분을 가린다. SUMMARY·VERIFY에 "릴리스 실행에서 실제 settings.json을 읽기 전용으로 읽었다"를 적는다.
- 가정: React `style={{left, top}}`는 CSSOM 대입이라 CSP `style-src 'self'`에 막히지 않는다. 새 명령 invoke는 `core:default`로 된다(②·③에서 같은 형태가 동작했다). 둘 다 공식 문서로 다시 확인하지는 않았고 T8 (4)·(5)에서 실행으로 확인한다.

### 사용자에게 알릴 것 (Lead가 PLAN 승인 때 그대로 보인다)

1. 기본 계획에서 Orbit 앱 실행은 실제 `~/.claude`(settings.json, projects)를 읽지도 쓰지도 않는다(인증 파일 복사는 4번). 모든 앱 실행은 `npm.cmd run tauri dev` 또는 `tauri build --debug`로 만든 디버그 exe이고, 둘 다 `ORBIT_CLAUDE_SETTINGS`·`ORBIT_CLAUDE_PROJECTS`·`CLAUDE_CONFIG_DIR`로 임시 폴더 `%TEMP%\orbit-qa4`를 가리킨다. 실행 직후 화면의 경로가 임시 폴더가 아니면 즉시 끈다. 릴리스 exe는 실행하지 않는다.
2. 예외(R13, 미확인 가정이 틀린 경우에만, 실행 전 따로 승인 요청): 릴리스 exe를 실행하면 실제 `%USERPROFILE%\.claude\settings.json`을 **읽는다**(훅 설치 여부 검사, 읽기 전용, 내용은 화면에 안 나옴, 전체 경로는 화면에 나옴). [설치]·[제거]를 누르면 그 파일에 쓰게 되므로 누르지 않는다. 세션 로그 감시는 `CLAUDE_CONFIG_DIR`로 임시 폴더를 보게 해서 실제 `projects`는 읽지 않는다.
3. 액정 검증은 Orbit 자신의 앱 데이터 폴더(`%APPDATA%\dev.orbit.app\screens`)를 실제로 쓰고, 넣은 시험 그림은 끝나고 지운다(BRIEF 그대로).
4. QA 2·4·5는 `CLAUDE_CONFIG_DIR=$d`로 실제 Claude Code를 돌린다. 로그인이 필요하면 실제 `~/.claude`의 인증 파일을 `$d`로 **복사(읽기)**할 수 있다(BRIEF가 허용). 복사본은 검증 뒤 지운다. 원본은 고치지 않는다.

## PLAN_CHECK 1차 반영

- **B1 (멈춤 판정에 테스트 없음)**
  - 판정을 프론트 한 줄에서 Rust 순수 함수 `sessions::snapshot(s, now)`로 옮겼다(`STALL_MS`, `Session.stalled`). 설계 요지·인터페이스(Rust, `Session` JSON, `types.ts`의 `shownState`는 `stalled`만 읽음, `Graph` props에서 `now` 제거)를 고쳤다.
  - T1에 테스트 (f) 추가: 경계(=`STALL_MS`는 false, +1은 true), working 외 상태는 false, 시계 역행, `last_ms==0`, 원본 불변, JSON `stalled`.
  - T7에 세 내보내기 경로(`get_sessions`, 훅 콜백, `poll_round`)의 `snapshot` 적용과 `poll_round` stalled 테스트(2000년 ts 로그 → `stalled==true`)를 넣었다.
  - F1: 30초마다 `get_sessions` 재요청(조용한 세션의 판정 갱신), 같은 ver 교체.
  - QA 7a 추가: 옛 timestamp 로그 줄로 `?`를 즉시 만들고(10분 대기·`STALL_MS` 변경 없음), curl로 세션 6개(세션 칩), 서브에이전트 6개(노드 칩, 선택 노드 큰 상자), DESIGN 6절 노드 상태(실행 중·끝남·대기·실패·알 수 없음)를 실제 데이터로 확인한다. 대응표 1·5·7에 연결했다.
- **B2 (릴리스 실행이 실제 `~/.claude`를 읽음)**
  - 릴리스 실행이 필요한지 따졌다. 확인 대상은 "번들 산출물 + prod CSP"이고 이는 `tauri build --debug` 디버그 exe로도 된다. 디버그 빌드는 `ORBIT_CLAUDE_*` 덮어쓰기가 살아 있고 devtools도 있다. 그래서 T8 (5)를 디버그 exe 실행으로 바꾸고, 응답 CSP 헤더로 prod `csp`가 걸렸는지 확인하게 했다. 릴리스 exe는 실행하지 않는다.
  - T8·QA 2의 환경변수에 `CLAUDE_CONFIG_DIR=$d`를 더했다. QA 8에 "5는 디버그 빌드"를 명시했다.
  - 디버그 빌드가 devCsp를 쓰는 경우(미확인, R13)에만 릴리스 실행이 필요하다. 이때는 멈추고 사용자 승인 뒤 `CLAUDE_CONFIG_DIR=$d`로 실행한다. 남는 실제 접근(`settings.json` 읽기 전용, 경로 화면 노출, [설치]·[제거] 금지)을 R13과 "사용자에게 알릴 것" 2번에 적었다. 인증 파일 복사(읽기)도 4번에 적었다.
- **권고 R1**: T4 검증을 `git status --short -uall design/` 두 줄로 고쳤다.
- 권고 R2~R4는 계획 변경이 필요 없어 그대로 두었다. 디자인·범위·새 의존성 절은 바꾸지 않았다.

## 부록 A: 그래프 모양 E + 단계 열 (DECISIONS 11~13)

근거: DECISIONS 10~14(10은 커밋 eebe961로 반영됨), Designer가 고친 `design/reference/layout_v4.html`(그래프 CSS 130~179행, 마크업 282~334행)·`design/tokens.json`·RUN_DIR `DESIGN.md` 9절. 값의 기준은 이 셋이다. `design/reference/graph_variants.html`(E·배치 2)은 참고로만 남긴다. 이 부록은 본문 설계 요지 23행("서브에이전트 한 열", x=248, 간격 10/80)과 F2의 배치·간선 규칙을 대체한다. 나머지 본문(노드 합치기, 상태 표, 인터페이스의 다른 필드)은 그대로다.

### A.1 목표

- 노드 모양을 E "작은 RPG 대화창"으로 바꾼다. 검은 반전 면을 없앤다(DECISIONS 11).
- 서브에이전트를 단계 열로 놓는다. Lead가 맨 왼쪽 열이고, 오른쪽으로 열이 이어지며, 같은 열은 세로로 쌓는다(DECISIONS 12).
- 열 규칙은 "다음 열로"다(DECISIONS 13). 노드는 168×60 그대로다. 넘치면 그래프 패널 제목 아래의 스크롤 상자(`.gscroll`) 안에서 스크롤하고, 실행 중 또는 대기 노드가 있는 가장 오른쪽 열이 보이게 자동으로 옮긴다(DESIGN 9.2).

### A.2 설계 요지

**열 번호는 Rust가 정해서 노드에 저장한다.** 이 run의 원칙(로직은 Rust + `cargo test`, 프론트 테스트 러너 없음)을 따른다. 저장하는 이유는 "이미 놓인 노드의 열은 바뀌지 않는다"를 구조로 보장하기 위해서다. 매 스냅숏마다 시각으로 다시 정렬하면, 나중에 도착한 로그 줄(더 이른 timestamp)이 앞 열을 밀어낸다.

**열 규칙의 정확한 정의**

- 열 0은 Lead다(프론트 상수). 서브에이전트는 열 1부터 시작한다.
- 노드는 `push_agent`에서 처음 만들어질 때 열 `col`을 **한 번** 받는다. 모든 노드 생성 경로(`node_by_tool`, SubagentStart 새 노드, SubagentStop 새 노드)가 이 함수를 지난다. 열을 정하는 시점은 push(그리고 `MAX_AGENTS` 축출) **전**이다.
  - 기존 노드가 없으면 `col = 1`이다.
  - 그 밖이면 `L = 기존 노드 col의 최댓값`이다. `col == L`인 기존 노드 중 **하나라도** state가 `Done` 또는 `Failed`면 `col = L + 1`이고, 아니면 `col = L`이다.
- "끝났다"는 **이 노드가 생성될 때 이미** 끝난 상태(`Done`·`Failed`)였다는 뜻이다. `Running`·`Waiting`·`Unknown`은 끝나지 않은 것으로 본다.
- **시작·종료 시각은 이벤트 처리 순서로 안다.** 훅은 실제 시각에 도착하고, 로그는 파일 순서(= 기록 시각 순서)로 읽는다. 그래서 "B가 생성될 때 A가 이미 끝남"은 "A의 종료 이벤트가 B의 시작 이벤트보다 먼저 일어남"과 같다. 숫자 시각(`started_ms`, `duration_ms`, timestamp)은 비교하지 않는다. 따라서 다음이 따라온다.
  - **종료 시각 필드는 새로 만들지 않는다.** 끝남 여부는 `state` 하나로 안다. `duration_ms`는 실패 노드나 로그 결과에 없을 수 있어 종료 판단에 쓸 수 없다.
  - **시각이 없는 노드**(로그에서 복원돼 `started_ms`가 없는 노드, SubagentStop으로 처음 생긴 노드)도 같은 규칙으로 생성 순서대로 놓인다.
  - **`Unknown` 노드**(결과가 없는 로그 호출)는 끝나지 않은 것으로 본다. 그 노드 혼자 마지막 열이면 다음 노드들은 같은 열에 쌓인다(위험 RA3).
  - **훅 시각(도착)과 로그 시각(timestamp)이 섞여도** 비교 자체를 하지 않으므로 시계 차이의 영향을 받지 않는다.
- **정렬은 하지 않는다.** `agents`는 생성 순서이고 `col`은 생성 순서에 따라 줄지 않는다. 그러므로 "시작 순, 같으면 기존 순서"가 저절로 성립한다. 같은 열 안의 세로 순서는 `agents` 순서다.
- **열 불변**: 한 번 정해진 `col`은 다음 경우에도 바뀌지 않는다. 상태 변화(끝남, resume, 대기), 빈칸 채우기, 로그 중복, 다른 노드의 생성·축출.
  - 유일한 예외는 PostToolUse `agentId` 합치기다. 남는 노드의 `col`은 `min(두 노드)`가 된다. `started_ms`를 더 이른 값으로 합치는 기존 규칙과 같은 방향이다.
- **`MAX_AGENTS` 축출**: 가장 오래된(= 가장 왼쪽) 노드부터 빠진다. 남은 노드의 `col`은 그대로다. 비게 된 앞 열은 프론트가 열 번호를 촘촘한 순위로 바꿔 메운다(아래). 그 결과 노드가 왼쪽으로 한 칸씩 옮겨 보일 수 있지만, 200개를 넘을 때만 생긴다.

**예**

1. DECISIONS 13의 예는 "Pre architect → Post architect → Pre plan-checker → Post plan-checker → Pre e1·e2·e3 → Post e1 → Pre reviewer"다. 열은 `[1, 2, 3, 3, 3, 4]`가 되고, 화면은 Lead | architect | plan-checker | engineer×3 | reviewer다.
2. 함께 시작한 3개는 "Pre t1·t2·t3(모두 실행 중)"이므로 `[1,1,1]`이다. "Post t2 → Pre t4"이면 t4 = 2다(열 1의 t2가 끝남). 이어서 "Pre t5"는 2다(열 2의 t4가 아직 실행 중).
3. 수용한 단점(DECISIONS 13): e1·e2·e3이 실행 중일 때 Post e1이 오고 Pre e4가 들어오면, e4는 병렬 작업의 일부였더라도 다음 열(4)로 밀린다.
4. 로그 복원은 파일이 "tool_use u1 → tool_result u1 → tool_use u2 → tool_use u3" 순서일 때 `[1,2,2]`다. timestamp가 없는 줄이어도 같다.
5. 시계가 섞인 경우: 훅 Pre t1(now = 9e12, 실행 중) 뒤에 로그 tool_use u2(timestamp 2000년)가 들어오면 u2 = 1이다. 앞으로 끼어들지 않는다.
6. 처음부터 끝난 노드: SubagentStop(모르는 agent_id, agent_type `x`)이 열 1에 끝남 노드를 만든다. 다음 Pre t2는 2다.

**프론트 배치 (`Graph.tsx`, 값은 갱신된 layout_v4.html 282~334행과 DESIGN 9.2)**

- 상수는 `W=168, H=60`, 열 피치 `PX=216`(간격 48), 행 피치 `PY=72`(간격 12), 버스 `BUS=24`다.
- **열 순위**: `agents`의 서로 다른 `col` 값을 오름차순으로 정렬해 1..n의 촘촘한 순위 `d`로 바꾼다. Lead는 `d=0`이다. 노드 `x = d*PX`다.
- **세로**: 열마다 노드 수가 `k`이면 열 높이는 `k*PY-12`다. canvas 높이 `CH`는 모든 열 높이의 최댓값(최소 60)이다. 열의 맨 위는 `(CH - 열 높이)/2`이고 열 안에서 `PY`씩 내려간다. 이 값은 항상 정수(36의 배수)다.
- canvas 폭은 `(n+1)*PX-48`이다. 서브에이전트가 없으면 `PX+W`로 두고, "서브에이전트 없음"을 `left=PX`에 둔다.
- **간선**(열 `d-1` → `d`): 오른쪽 끝은 `xr=(d-1)*PX+W`, 버스는 `xb=d*PX-BUS`다.
  - 두 열이 모두 노드 1개이고 가운데 y가 같으면(가운데 정렬이라 1:1이면 항상 같다) `M{xr} {y} H{d*PX}` 곧은 선 하나만 그린다.
  - 그 밖이면 경로 하나에 다음을 담는다. 앞 열 각 노드의 `M{xr} {y} H{xb}`, 버스 `M{xb} {양 열 가운데 y의 최소} V{최대}`, 다음 열 각 노드의 `M{xb} {y} H{d*PX}`. 다음 열의 running 노드로 가는 가지만 이 경로에서 빼고, `class="edge flow"`인 별도 `path`로 그린다. 기준은 layout_v4의 `M600 102 H624 M624 30 V174 M624 30 H648 M624 102 H648` / flow `M624 174 H648`과 `M816 30 H840 M816 102 H840 M816 174 H840 M840 30 V174 M840 102 H864`(받는 reviewer가 대기라 flow 없음)다.
  - 1:1 곧은 선은 받는 노드가 running이면 그 선 전체가 flow다.
- **패널 구조**(DESIGN 9.2, layout_v4 133~142·282~287행). App.tsx는 바꾸지 않는다(`<section className="panel graph">` 안에 `h2` 다음 `<Graph …/>` 그대로, App.tsx 147~149행).
  - `Graph.tsx`가 반환하는 최상위를 `<div className="gscroll" ref={boxRef} …><div className="canvas" …>…</div></div>`로 감싼다. `.gscroll`이 section의 `h2` 다음 flex 자식이 된다.
  - 빈 상태(`!session`)는 지금처럼 `<p className="empty">`만 반환한다(`.gscroll` 없음, 제목 아래에 바로 놓임).
  - CSS(`Graph.css`, A3): `.graph { display: flex; flex-direction: column; }`, `.gscroll { flex: 1; min-height: 0; overflow: auto; padding: var(--s-1); scrollbar-color: var(--c-ink) var(--c-light); }`, `.canvas { position: relative; }`(기존 `margin: var(--s-2) 0 0 var(--s-2)` 삭제). App.css의 `.graph { grid-column; grid-row }`와 속성이 겹치지 않는다. 시안의 `.gscroll.end`(rtl)는 정적 시안용 흉내라 옮기지 않는다.
  - 결과: 제목은 고정이고 그 아래만 가로·세로로 스크롤한다. `.panel`의 `overflow: auto`(App.css 68행)는 그대로 두지만, `.gscroll`이 `min-height: 0`으로 남은 높이에 맞춰지므로 패널 자체는 넘치지 않는다.
- **자동 스크롤**(DESIGN 9.2, 가장 작은 방법)
  - 대상: 실행 중(`running`) 또는 대기(`waiting`) 서브에이전트가 있는 열 중 가장 오른쪽 열(열 순위 `d` 최대)의, 그 상태인 첫 노드의 `<li>`에 `targetRef`를 단다. 그런 노드가 없으면 대상이 없고 옮기지 않는다. Lead(열 0)는 대상에서 뺀다(서브에이전트가 없으면 넘치지 않는다).
  - 트리거 키 `moveKey`: 문자열 하나 = `session.id` + `|` + 열 수 `nCols` + `|` + `agents.map((a) => a.state).join(",")` (세션 없으면 `""`). `useEffect(() => { … }, [moveKey])`로 옮긴다. 세션이 바뀔 때, 열 수가 바뀔 때(새 열), 서브에이전트 상태 중 하나라도 바뀌거나 노드가 더해질 때만 effect가 돈다. **30초 재요청처럼 아무것도 안 바뀐 갱신은 키가 같아 effect가 돌지 않으므로 사용자가 옮긴 스크롤을 되돌리지 않는다.**
  - 호출: `targetRef.current?.scrollIntoView({ inline: manual.current || selected ? "nearest" : "end", block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })`. 스크롤 컨테이너는 `.gscroll`이다(가장 가까운 스크롤 조상).
  - **사용자가 직접 옮긴 경우**: `const manual = useRef(false)`. `.gscroll`에 `onWheel`·`onPointerDown`·`onKeyDown`에서 `manual.current = true`(스크롤 막대 끌기·노드 클릭·Tab 포함). 세션 id가 바뀌면 `false`로 되돌린다(같은 effect 안에서 이전 id를 `useRef`로 비교, 또는 `[session?.id]` effect 한 줄). manual이거나 노드가 선택돼 있으면 `nearest`라 대상이 이미 보이면 움직이지 않고, 안 보이면 보일 만큼만 옮긴다.
  - hooks(`useRef`·`useEffect`)는 `if (!session) return` **앞에** 둔다(Rules of Hooks). 좌표 계산이 `session` 뒤에 있으므로 `moveKey`는 `session?.agents ?? []`로 hooks 앞에서 계산한다.
- **노드 모양 E**(`Graph.css`, 값은 layout_v4 149~179행, DESIGN 9.1, tokens.json)
  - 토큰: App.css `:root`에 layout_v4 36~40행의 7개를 같은 이름·값으로 더한다. `--r-node: 6px`, `--sh-node: inset 0 0 0 2px var(--c-paper), inset 0 0 0 3px var(--c-ink)`, `--sh-node-wait: inset 0 0 0 2px var(--c-light), inset 0 0 0 3px var(--c-ink)`, `--r-pbar: 4px`, `--r-pbar-fill: 2px`, `--pad-node: var(--s-1) 10px`, `--pad-node-run: 3px 9px`.
  - 공통 `.node`: `padding: var(--pad-node)`, `border-radius: var(--r-node)`, `box-shadow: var(--sh-node)`.
  - `.is-run`: 반전을 지운다(`background`·`color` 규칙과 `.is-run .n-meta` 삭제). `border: var(--b-panel); box-shadow: var(--sh-panel); padding: var(--pad-node-run)`.
  - `.is-wait`: `background: var(--c-light); box-shadow: var(--sh-node-wait)`.
  - `.is-fail`: `border: var(--b-box-fail); box-shadow: none`.
  - `.pbar`: `border-radius: var(--r-pbar)`, `.pbar i`: `border-radius: var(--r-pbar-fill)`.
  - Lead는 `shownState`에 따라 지금처럼 클래스를 받는다(working이면 `.is-run`). DESIGN 9.1 Lead 행과 같다(RA5).
- 시각 값(색·간격·그림자·모서리)은 Graph.css에 리터럴·hex로 쓰지 않고 `var(--*)`만 쓴다.

### A.3 인터페이스 변경

Rust `sessions.rs`:
```rust
pub struct Agent { /* 기존 필드 그대로 */ pub col: u32 }   // JSON "col". 1부터. 생성 때 한 번 정해지고, 합치기(min) 외에는 바뀌지 않는다
// push_agent 시그니처 그대로. 열 계산은 push_agent 안(push 전)에서 한다.
// PostToolUse agentId 합치기: a.col = a.col.min(o.col)
```
프론트 `src/types.ts`: `Agent`에 `col: number`를 더한다. `Graph` props, Tauri 명령·이벤트, `Session` 다른 필드는 그대로다.

### A.4 새 의존성

없다. 그래프 라이브러리, 프론트 테스트 러너, 크레이트를 더하지 않는다. 스크롤은 DOM `scrollIntoView`로 하고, 간선은 기존 SVG `path`로 그린다.

### A.5 태스크

공통 규칙은 본문 "태스크"와 같다(커밋 방식, `tasks/<id>/COMMIT_MSG.txt`, 금지 문자열, `~/.claude` 금지, `npm.cmd`).

| id | 할 일 | 파일 경로 | 검증 방법 | 웨이브 | 의존 |
|---|---|---|---|---|---|
| A1 | **열 번호** (engineer). `Agent`에 `pub col: u32`를 더한다. `push_agent`에서 push 전에 A.2 정의대로 `col`을 정한다(축출 전 기존 노드 기준). PostToolUse 합치기에 `a.col = a.col.min(o.col)` 한 줄을 넣는다. 다른 곳은 바꾸지 않는다. **테스트를 먼저 쓴다**(기존 헬퍼 `ah`·`sub`·`alog`·`rlog`·`ag` 사용, 이름 `r_col_*`). (a) 병렬: Pre t1·t2·t3 → cols `[1,1,1]`. Post t2(`status:"completed"`) → Pre t4 = 2. Pre t5 = 2. (b) DECISIONS 13 예 1의 순서 → `[1,2,3,3,3,4]`. (c) **불변**: (b) 뒤에 각 노드의 `(tool_use_id, col)`을 기록한다. 그다음 Post e2·e3, SubagentStart/Stop(같은 agent_id로 resume), PermissionRequest(agent_id) → 대기, 같은 id의 로그 `alog`/`rlog` 중복, 새 id의 로그 tool_use(2000년 timestamp), PostToolUseFailure(새 id)를 넣는다. 기록한 노드들의 col이 하나도 바뀌지 않았고, 새 노드는 기존 최댓값 이상이다. (d) 끝나지 않은 상태: 마지막 열의 유일한 노드가 Waiting(PermissionRequest)이거나 Unknown(결과 없는 `alog`)이면 다음 노드는 같은 열이다. (e) 실패도 끝남이다. PostToolUseFailure t1 → Pre t2 = 2. 로그 `rlog(is_error:true)`도 같다. (f) 로그 복원: `alog u1`(00:00:00) → `rlog u1`(00:00:02) → `alog u2` → `alog u3` → `[1,2,2]`. timestamp 키가 없는 같은 줄들로도 `[1,2,2]`다. (g) 시계 섞임: 훅 Pre t1(now = 9_000_000_000_000) → 로그 `alog u2`(`2000-03-01T00:00:00Z`) → u2 = 1, `ag[0]`은 여전히 t1. 이어서 Post t1 → `alog u3`(2000년) → u3 = 2. (h) 처음부터 끝남: SubagentStop(모르는 aid, agent_type `x`) → col 1. Pre t2 → 2. (i) 합치기: SubagentStart(a2, `Explore`) = X(col 1). Pre t9 → Post t9(완료). Pre t2(`Plan`) = Y(col 2). Post t2(`agentId:"a2"`) → 노드 t2 하나만 남고 col 1이다. (j) 축출: `MAX_AGENTS+1`개 Pre(전부 실행 중) → 길이 `MAX_AGENTS`, 전부 col 1. 하나를 Post한 뒤 Pre → 2. (k) `serde_json::to_value(&ag[0])["col"] == 1` | `src-tauri/src/sessions.rs` | 구현 전 `cargo test r_col_`이 실패(컴파일 오류 포함)한다. 구현 후 `cargo test` 전체가 0으로 종료한다(기존 `r_agent_*`·lib.rs 테스트가 바뀌지 않고 통과). 본문 T1의 `Select-String` 규칙(`unwrap(`·`expect(`·출력문은 `#[cfg(test)]` 안에만)도 같다 | 1 | — |
| A2 | **Designer 산출물 커밋** (engineer). Lead가 Designer 완료를 알린 뒤 실행한다. `design/reference/graph_variants.html`(지금 untracked), Designer가 고친 `design/reference/layout_v4.html`·`design/tokens.json`을 내용 변경 없이 `git add design/` 후 커밋한다 | `design/**` | 커밋 전 `git status --short -uall design/` 출력을 SUMMARY에 붙인다(design 밖은 없어야 한다). 커밋 후 `git status --short design/`은 빈 출력이고, `git show --stat HEAD`에는 `design/` 파일만 있다 | 1 | Designer 개정 완료 |
| A3 | **노드 모양 E + 그래프 패널 스크롤 상자 CSS** (engineer). READ: RUN_DIR `DESIGN.md` 9절, `design/tokens.json`, `design/reference/layout_v4.html` 36~40·130~179행. A.2 "패널 구조"의 CSS(`.graph` flex 세로, `.gscroll`, `.canvas` margin 삭제)와 "노드 모양 E"를 `Graph.css`에 반영한다(반전 규칙 삭제 포함, 값은 전부 `var()`). App.css는 `:root`에 토큰 7개(`--r-node`·`--sh-node`·`--sh-node-wait`·`--r-pbar`·`--r-pbar-fill`·`--pad-node`·`--pad-node-run`)만 더하고 다른 곳은 바꾸지 않는다. 클래스 이름(`.graph/.gscroll/.canvas/.node/.is-run/.is-wait/.is-fail/.pbar/.edge/.flow/.mark/.side-note`)은 A4와 계약이다 | `src/Graph.css`, `src/App.css`(`:root` 토큰 7줄만) | `npm.cmd run build`가 0으로 종료한다. `Select-String src\Graph.css -Pattern '#[0-9a-fA-F]{3,8}\b','dangerouslySetInnerHTML','border-radius: \d','margin: var\(--s-2\) 0 0'` → 결과 없음. `Select-String src\Graph.css -Pattern 'var\(--r-node\)','var\(--sh-node\)','var\(--sh-node-wait\)','var\(--r-pbar\)','var\(--r-pbar-fill\)','var\(--pad-node\)','var\(--pad-node-run\)','var\(--sh-panel\)','flex-direction: column','min-height: 0','overflow: auto','scrollbar-color'` → 각각 있음. `Select-String src\Graph.css -Pattern 'is-run \{[^}]*background: var\(--c-ink\)'` → 결과 없음. `Select-String src\App.css -Pattern '--r-node:','--sh-node:','--sh-node-wait:','--r-pbar:','--r-pbar-fill:','--pad-node:','--pad-node-run:'` → 각각 1줄. `git diff src/App.css`의 `+`/`-` 줄이 전부 `:root { … }` 블록(3~25행 근처) 안이다. 화면 대조는 QA A-2 | 2 | A2 |
| A4 | **단계 열 배치 + 간선 + 스크롤 상자 마크업 + 자동 스크롤** (engineer). READ: A.2 "패널 구조"·"프론트 배치"·"자동 스크롤", 갱신된 layout_v4.html 282~334행(좌표·간선 `d`), DESIGN 9.2. `types.ts`의 `Agent`에 `col: number`를 더한다. `Graph.tsx`: 반환을 `.gscroll` 래퍼로 감싼다(빈 상태 `<p className="empty">`는 그대로). 좌표 루프를 열 순위 기준으로 바꾼다(`X1`·`XM`·`GAP=10` 삭제, `PX/PY/BUS` 도입). 간선을 A.2 규칙대로 만들고, 자동 스크롤 effect(대상·`moveKey`·`manual`·`inline:"end"`/`"nearest"`)를 넣는다. 노드 내용(이름·상태·기호·막대·메타 "권한 요청")과 `aria-*`·`onSelect`는 그대로 둔다. App.tsx는 바꾸지 않는다. 프론트 테스트 러너는 넣지 않는다 | `src/types.ts`, `src/Graph.tsx` | `npm.cmd run build`가 0으로 종료한다. `Select-String src\Graph.tsx -Pattern 'gscroll','scrollIntoView','inline: manual','"end"','prefers-reduced-motion','\.col'` → 각각 있음. `Select-String src\Graph.tsx -Pattern 'dangerouslySetInnerHTML','X1','GAP'` → 결과 없음. `Select-String src\types.ts -Pattern 'col: number'` → 1줄. `git diff --stat`에 `src/App.tsx`가 없다. `npm.cmd run dev`에서 http://localhost:1420이 빈 상태 문구를 오류 없이 보인다(세션 없음). 좌표·간선·스크롤의 실제 값은 QA A-2~A-4 측정으로 확인한다 | 2 | A1, A2 |

웨이브별 파일 겹침:
- W1: A1 `sessions.rs`, A2 `design/**`. 겹치지 않는다.
- W2: A3 `Graph.css`·`App.css`, A4 `types.ts`·`Graph.tsx`. 겹치지 않는다. `.gscroll`의 마크업(A4)과 CSS(A3)는 클래스 이름으로만 이어진다. `App.tsx`는 어느 태스크도 건드리지 않는다(그래프 패널 마크업 147~149행이 `h2` + `<Graph/>`라 바꿀 필요 없음).

변경이 닿는 곳 점검:
- **호출부**: `Agent` 리터럴은 `push_agent` 한 곳(sessions.rs 113행)뿐이다. `lib.rs`는 `Agent`를 만들지 않는다. `Session` JSON에 `agents[].col`이 추가되고 받는 쪽은 `types.ts`다. App.tsx의 노드 상세는 `col`을 쓰지 않는다.
- **테스트**: 기존 sessions 테스트는 필드 추가로 깨지지 않는다(리터럴 없음). lib.rs `poll_round` 테스트는 그대로다.
- **설정·capability·CSP**: 바꾸지 않는다. `style={{left, top}}`는 기존과 같은 방식이고, `scrollIntoView`는 권한이 필요 없다.
- **export**: 없다. **하네스·SPEC**: 바꾸지 않는다(SPEC "1단계만"은 깊이를 뜻하며 DECISIONS 12와 맞다).

### A.6 QA 추가 단계 (본문 QA 절차에 덧붙임, DECISIONS 14에 따라 새 head로 VERIFY·SECURITY를 다시 받는다)

환경은 본문 QA 2와 같다(`$d`, 디버그 실행만). 측정은 `shots/NOTES.md`의 방법을 쓴다. 창은 WebView2 CDP, 뷰포트 1400×900·dpr 1이다. 시안은 Edge 헤드리스로 같은 크기에서 연다. `getBoundingClientRect`·computed 스타일·간선 `d`를 `shots\tools\*.mjs`로 수집한다. 토큰은 스크립트 안에서만 읽는다. 결과는 `shots/` 아래 `A-*.png`·`A-*-measure.json`과 NOTES 추가 절에 적는다.

- **A-1 자동**: `cargo test`, `npm.cmd run build`, `node --test harness/hooks/gate.test.mjs`가 모두 0으로 종료한다.
- **A-2 시안 대조(기준 4, DECISIONS 11·12)**
  - 기준은 갱신된 `design/reference/layout_v4.html`(그래프 패널 282~334행)과 DESIGN 9.1·9.2다. graph_variants.html은 기준이 아니다.
  - layout_v4와 **같은 데이터**를 다음 curl 훅 순서로 만든다(DECISIONS 13 예 1과 같다).
    - architect: Pre+SubagentStart+SubagentStop+Post(130000ms·41000).
    - plan-checker: 위와 같고 (40000·12000).
    - engineer e1·e2·e3: Pre+SubagentStart를 셋 다 보낸다.
    - e1·e2 Post(302000·88000 / 271000·70000). e3는 Post를 보내지 않아 실행 중으로 남는다.
    - reviewer: e1·e2 Post **뒤에** Pre+SubagentStart+PermissionRequest(agent_id)를 보낸다. 열 규칙대로 engineer 다음 열에 대기로 선다.
    - 마지막으로 Lead의 `PreToolUse`(tool_name `Read`, agent_id 없음)를 보내 세션을 작업 중(Lead 실행 중)으로 되돌린다. PermissionRequest가 세션을 대기로 만들기 때문이다(sessions.rs 300행). 서브에이전트 상태는 바뀌지 않아야 한다(**미확인**, 바뀌면 "다르게 들어간 값"에 적는다).
  - 같은 크기 스크린샷을 기준 시안과 나란히 둔다. 두 화면에서 같아야 하는 값은 다음과 같다.
    - canvas 크기 1032×204.
    - 노드 `li` left/top: Lead 0/72, architect 216/72, plan-checker 432/72, engineer 648/0·72·144, reviewer 864/72.
    - 간선 `d` 5개: `M168 102 H216`, `M384 102 H432`, `M600 102 H624 M624 30 V174 M624 30 H648 M624 102 H648`, flow `M624 174 H648`, `M816 30 H840 M816 102 H840 M816 174 H840 M840 30 V174 M840 102 H864`.
    - 스크롤: 처음 열었을 때 `.gscroll`이 오른쪽 끝(reviewer 열의 오른쪽 끝이 보이는 오른쪽 끝)으로 옮겨져 있고 제목 `h2`는 그대로 보인다. `.gscroll`의 `scrollLeft`·`clientWidth`(시안 9.2: 보이는 폭 약 703px)와 `padding 4px`를 기록한다.
    - 노드 computed 값(layout_v4 CSS 기준): `border-radius` = `--r-node`(6px), `box-shadow` = `--sh-node`, 실행 중은 `border-width 3px`·`box-shadow` = `--sh-panel`·`padding` = `--pad-node-run`(3px 9px)·밝은 바탕(검은 면 없음), 끝남은 `padding` = `--pad-node`(4px 10px), 대기는 바탕 light·`box-shadow` = `--sh-node-wait`, 실패는 점선·`box-shadow none`, 진행 막대 `border-radius` = `--r-pbar`(4px)/채움 `--r-pbar-fill`(2px).
  - 실패 노드는 이 데이터에 없으므로 A-3 세션에서 PostToolUseFailure 하나로 따로 측정한다. 다른 값(선택 표시 `.mark` 대 시안 `::before` 등)은 NOTES처럼 "다르게 들어간 값"으로 적는다.
- **A-3 열 규칙 재현(DECISIONS 13)**: 새 세션 `qa-col`에 curl을 보낸다.
  - `PreToolUse`(Agent) t1·t2·t3을 보낸다. Lead 오른쪽 한 열에 3개가 세로로 서고 버스 간선이 그려진다.
  - `PostToolUse` t2(`tool_response:{status:"completed"}`) → `PreToolUse` t4를 보낸다. t4가 **오른쪽 새 열**에 혼자 선다.
  - 그 앞뒤로 t1·t2·t3의 `li` 좌표를 측정해 **같은지** 기록한다.
  - 이어서 Post t1·t3, PermissionRequest 등을 보낸 뒤 t1~t4의 좌표가 그대로인지 다시 측정한다.
  - 흐름 표시는 실행 중 노드로 들어가는 가지에만 있다.
- **A-4 넘침·자동 스크롤**
  - `qa-col`에 Pre/Post 쌍을 차례로 더해 열을 6개 이상 만든다. `.gscroll`에 가로 스크롤바가 생기고(제목 `h2`는 스크롤되지 않음), 실행 중·대기 노드가 있는 가장 오른쪽 열의 오른쪽 끝이 `.gscroll`의 보이는 오른쪽 끝에 맞춰진 것(`inline:"end"`)을 `scrollLeft`와 대상 `li`·`.gscroll`의 `getBoundingClientRect().right`로 기록한다. 바깥 조상(App.css 35행 영역, `.panel.graph`)의 `scrollLeft/scrollTop`이 0 그대로인지도 기록한다(RA6).
  - 마우스 휠이나 스크롤 막대로 직접 맨 왼쪽으로 옮긴 뒤 40초(30초 재요청 1회 이상)를 기다린다. **아무것도 안 바뀐 갱신이므로 `scrollLeft`가 그대로다.**
  - 이어서 다른 노드의 상태를 바꾸는 Post를 보낸다. 상태가 바뀌었으므로 effect가 돌지만 사용자가 직접 옮긴 뒤라 `nearest`다. 대상 노드가 보이게만 옮겨지고(대상 `li`가 `.gscroll` 안에 완전히 보임), 오른쪽 끝으로 강제로 끌려가지 않는다(대상 `li`의 right가 `.gscroll` right보다 작거나 같고, 바로 앞 측정의 `inline:"end"` 값과 다를 수 있음). 측정값을 기록한다.
  - 새 열을 만드는 Pre를 보내도 같은 `nearest` 동작이다. 다른 세션을 골랐다가 `qa-col`로 돌아오면 manual이 풀려, 선택된 노드가 없을 때 다시 `inline:"end"`로 옮긴다.
  - 한 열에 병렬 Pre를 8개 보내면 세로 스크롤이 생긴다. 노드는 168×60 그대로다.
  - 960×640에서도 같은 장면을 한 장 찍는다.
- **A-5 로그 복원**
  - `$d\projects\qa-proj\qa-colog.jsonl`에 sessions 테스트 `alog`/`rlog` 형식으로 "tool_use u1 → tool_result u1 → tool_use u2 → tool_use u3"를 쓴다.
  - 앱을 다시 켜면 그래프가 Lead | u1 | u2·u3이다(A.2 예 4).

### A.7 위험·가정

- **RA1 시작 직후 경쟁**: lib.rs는 훅 서버를 먼저 열고(127행) 로그 감시 스레드를 나중에 띄운다(167행). 앱을 켤 때 서브에이전트가 돌고 있는 세션이 있다고 하자. 첫 로그 읽기가 끝나기 전에 그 세션의 훅이 오면, 새 노드가 과거 노드보다 먼저 생성된다. 그러면 과거 노드가 새 노드의 같은 열이나 오른쪽 열에 놓인다. 창은 첫 poll 한 번(수 ms~1주기)이고, 실제로 일어나는지는 **미확인**이다. 화면이 틀어지는 것만 문제이고 데이터는 잃지 않는다. 보이면 별도 run에서 "첫 poll 뒤 서버 시작"으로 순서를 바꾼다.
- **RA2 처리 순서 = 시각 순서 가정**: 훅은 실시간이고 로그는 파일 순서라는 가정이다. Claude Code가 병렬 Agent 호출의 PostToolUse를 다음 Pre보다 늦게 보내는 경우에는 열이 실제보다 앞에 붙는다(**미확인**). 숫자 시각을 비교하지 않기로 한 대가다. 그 대신 시계 차이와 시각 없는 노드에 강하다.
- **RA2b resume 뒤의 새 노드**: 끝남 판단은 새 노드 생성 시점의 `state`만 본다. 마지막 열에서 유일하게 끝났던 노드가 SubagentStart로 resume되어 다시 `Running`이면, 그 뒤 새 노드는 실제로는 "끝난 뒤 시작"이었어도 같은 열에 들어간다. resume된 노드 자신의 열은 그대로다. 규칙을 바꾸지 않고 수용한다.
- **RA3 끝나지 않는 노드**: `Unknown`(결과 없는 로그 호출, 백그라운드)이나 영원히 대기인 노드가 마지막 열에 혼자 있으면, 이후 노드가 모두 그 열에 쌓인다. 열이 길어지면 세로 스크롤로 보인다. 규칙(DECISIONS 13)대로이므로 바꾸지 않는다.
- **RA4 축출 때 이동**: 200개를 넘으면 앞 열이 비고, 촘촘한 순위 때문에 전체가 왼쪽으로 한 칸씩 옮겨 보일 수 있다. `col` 값 자체는 불변이다.
- **RA5 Lead 테두리**: DECISIONS 11의 "실행 중·Lead"를 "Lead도 상태 클래스를 따른다"로 읽었다(시안 E에서 Lead는 실행 중이라 구분되지 않는다). Designer 개정이 다르게 정하면 A3이 그것을 따른다(**가정**).
- **RA6 `scrollIntoView`가 바깥까지 움직임**: 스크롤 컨테이너는 `.gscroll`이지만, `scrollIntoView`는 바깥의 스크롤 가능한 조상(`.panel.graph`의 `overflow: auto`, App.css 35행 영역)도 함께 움직일 수 있다. 960 폭에서 A-4로 확인한다. 바깥이 움직이면 `.gscroll`의 `scrollLeft/scrollTop`을 대상 `li`의 `offsetLeft/offsetTop`으로 직접 계산하는 방식(같은 effect 안, 몇 줄)으로 바꾼다(**미확인**).
- **RA6b 사용자 조작 감지**: "직접 스크롤했는가"는 `.gscroll`의 `wheel`·`pointerdown`·`keydown`으로 안다(`scroll` 이벤트는 코드가 옮긴 것과 구분되지 않는다). 스크롤 막대 끌기가 WebView2에서 그 요소의 `pointerdown`으로 오는지는 **미확인**이다. 안 오면 막대 끌기 뒤 상태 변화 때 `inline:"end"`로 끌려갈 수 있고, A-4에서 보이면 막대 끌기 확인을 `scroll` 이벤트 + "코드가 옮기는 중" 플래그로 바꾼다.
- **RA7 시안 데이터와 규칙**: 갱신된 layout_v4는 열 규칙대로 reviewer를 engineer 다음 열(864/72)에 둔다. A-2는 그 데이터가 나오는 훅 순서(e1·e2 Post 뒤 reviewer)로 만들고, 규칙 자체는 A-3에서 따로 검증한다. graph_variants 배치 2(reviewer가 engineer 열)는 기준에서 뺐다.
- **RA8 Designer 산출물 시점**: A2·A3·A4는 Designer 개정이 끝난 뒤에 시작한다. 기준은 갱신된 layout_v4·tokens.json·DESIGN 9절이고, A.2의 숫자는 그 값과 같다(1032×204, 간선 5개를 A.2 규칙으로 계산해 확인함).
- **RA9 Lead 상태는 자동 스크롤 트리거가 아니다**: `moveKey`는 서브에이전트 상태만 담는다. Lead의 상태(멈춤 추정 포함)만 바뀐 갱신에서는 옮기지 않는다. Lead는 열 0이라 옮길 대상이 아니기 때문이다.

### A.8 PLAN_CHECK 3차 반영

부록 A만 고쳤다. 본문과 열 규칙(A.2 "열 규칙의 정확한 정의"·예·A1)은 바꾸지 않았다.

- **B3 패널 구조**: A.2에 "패널 구조" 항목을 새로 두었다(`.graph` flex 세로, 제목 고정, `.gscroll` `flex:1; min-height:0; overflow:auto; padding:var(--s-1); scrollbar-color`, `.canvas` margin 삭제, 빈 상태 `<p className="empty">`는 래퍼 없이 그대로, App.tsx 무변경). 마크업은 A4(`Graph.tsx`), CSS는 A3(`Graph.css`)가 맡아 W2 파일 분담이 그대로다. A3·A4 검증에 `gscroll`·`flex-direction: column`·`overflow: auto`·`scrollbar-color`·margin 삭제 grep과 `App.tsx` 무변경 확인을 더했다. W2 겹침 설명에 한 줄 더했다.
- **B3 자동 스크롤**: 대상을 "실행 중 또는 대기 노드가 있는 가장 오른쪽 열"로, 기본 `inline:"end", block:"nearest"`로, 컨테이너를 `.gscroll`로 바꿨다. 트리거는 `moveKey`(세션 id·열 수·서브에이전트 상태 목록)라 새 열·상태 변화에는 돌고, 30초 재요청처럼 아무것도 안 바뀐 갱신에는 돌지 않는다. 사용자가 직접 조작했거나(`manual` ref) 노드가 선택돼 있으면 `nearest`로만 옮긴다. reduced-motion이면 `behavior:"auto"`. A.1 문구, RA6(`.gscroll` 기준 직접 계산), RA6b(조작 감지 미확인), RA9(Lead 상태는 트리거 아님)를 맞췄다.
- **B4 시안 대조 기준**: A-2의 기준을 갱신된 layout_v4.html과 DESIGN 9.1·9.2로 바꿨다. canvas 1032×204, `li` 좌표(0/72, 216/72, 432/72, 648/0·72·144, 864/72), 간선 `d` 5개, 노드 값은 `--r-node`·`--sh-node`·`--sh-node-wait`·`--pad-node(-run)`·`--r-pbar(-fill)`. 훅 순서는 architect·plan-checker 완료 → e1·e2·e3 Pre → e1·e2 Post → reviewer Pre+PermissionRequest(e3 실행 중), 끝으로 Lead를 작업 중으로 되돌리는 `PreToolUse`(Read)를 더했다. A.2 "프론트 배치" 제목과 간선 기준 예, 부록 근거 줄, RA7·RA8의 "배치 2" 문구를 고쳤다. graph_variants는 참고로만 남겼다.
- **RA-R1 토큰**: A.2 "노드 모양 E"와 A3를 리터럴 대신 `:root` 토큰 7개 + `var()`로 바꿨다. 검증 grep을 `var(--r-node)` 등과 App.css의 토큰 7줄로, "`border-radius: \d` 리터럴 없음"으로 바꿨다. App.css diff 검증 문구를 "`:root` 블록 안의 줄만"으로 맞췄다.
- **RA-R2 resume**: A.7에 RA2b(resume된 노드 뒤 새 노드는 같은 열에 들어갈 수 있음, 수용)를 더했다.
- **RA-R3 A-4 기대 결과**: 무변경 갱신 40초는 `scrollLeft` 그대로, 상태를 바꾸는 Post는 `nearest`로 대상만 보이게(오른쪽 끝으로 끌지 않음), 세션을 다시 고르면 `inline:"end"`로 바꿨다. 바깥 조상 스크롤 0 확인도 더했다.
