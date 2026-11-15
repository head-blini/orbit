# PLAN: 마일스톤 ③ 세션 로그 감시

RUN: 20261114-session-log-watch / TRACK: full / 근거: BRIEF.md, DECISIONS.md(1~8, BRIEF보다 우선), RESEARCH.md, CLAUDE.md 코드 규칙·보안 체크리스트, ② PLAN·`docs/solutions/hook-server.md`

## 새 의존성

없음. 새 크레이트·npm 패키지·feature 추가 없음(DECISIONS 8). `Cargo.toml`, `package.json` 변경 없음.

## 목표

앱이 켜지면 로그 폴더(`CLAUDE_CONFIG_DIR`이 있으면 `<그 폴더>/projects`, 없으면 `~/.claude/projects`, 디버그 빌드에서는 `ORBIT_CLAUDE_PROJECTS`로 덮어씀)의 `<slug>/<uuid>.jsonl`을 1초마다 폴링해 처음부터 끝까지, 이후 새로 붙은 완결된 줄만 읽는다. 로그 줄과 ②의 훅 이벤트를 Rust 안의 메모리 세션 모델 하나에 넣고 `(세션, tool_use_id, 단계)`로 중복을 걸러, 화면에 세션 목록과 고른 세션의 도구 호출 타임라인(출처: 훅/로그/둘 다)을 보인다. 로그는 읽기만 하고, 형식이 바뀌거나 깨져도 감시가 죽지 않는다.

## 설계 요지

- **모듈 둘 추가, Tauri 무관(단독 `cargo test`)**: `watch.rs` = 파일 선별 + 오프셋 이어 읽기 + 줄 → `serde_json::Value`(해석 없음). `sessions.rs` = 세션 모델 + 줄/훅 해석 + 중복 제거 + 타임스탬프 파싱. `lib.rs`가 둘을 `Arc<Mutex<Store>>`로 묶는다. 감시 스레드는 `lib.rs` setup에서 `std::thread::spawn` 루프 하나(1초 `sleep`). notify·SQLite·오프셋 저장 파일 없음(DECISIONS 1·2).
- **파일 선별**: `root/<dir>/<name>`, 깊이 정확히 2. `<dir>`은 `file_type().is_dir()`, `<name>`은 `file_type().is_file()`(심볼릭 링크는 둘 다 아니라 건너뜀). `<name>`이 `.jsonl`로 끝나고 stem이 UUID 모양(36자, 8-4-4-4-12, 16진수와 `-`)일 때만 세션 로그, 세션 ID = stem. 이 규칙만으로 `.orphaned-…jsonl`(stem이 UUID 아님), `.jsonl.superseded-…`(확장자 다름), `*.meta.json`·`*.prefix.json`, `<uuid>/tool-results/`·`<uuid>/subagents/`·`mcp-tasks/`(깊이 3 이상)가 빠진다(DECISIONS 3: 서브에이전트 제외).
- **이어 읽기**(`Tail { offset: u64, skipping: bool }`를 경로별 `HashMap`에): 매 회차 `fs::metadata` 길이 < offset이면 offset=0·skipping=false(잘림), 같으면 건너뜀. `File::open`(기본 공유 모드 그대로, `share_mode` 호출 금지) → `seek(offset)` → 최대 `MAX_LINE + 1` 바이트씩 읽어 `\n`으로 자른다: 완결 줄은 `serde_json::from_slice::<Value>` 성공 시에만 콜백, 실패는 버리고 offset 전진. `\n` 없는 꼬리가 `MAX_LINE` 이하면 offset을 그 앞에 두고 다음 회차로. 꼬리가 `MAX_LINE`을 넘으면 skipping=true로 그만큼 offset 전진, skipping 중에는 다음 `\n`까지 버린 뒤 해제. 한 번에 쥐는 버퍼는 최대 16 MiB+1. 회차가 끝나면 파일을 닫는다(핸들을 쥐지 않음). 열기·읽기 실패(공유 위반 등)는 조용히 다음 회차 재시도, NotFound와 목록에서 사라진 파일은 맵에서 지운다. 쓰기·삭제·이름 변경 코드 없음. `println!`/`eprintln!`/`dbg!` 없음.
- **해석은 `sessions.rs`만**: 줄은 객체일 때만, 필드는 전부 `.get()/.as_str()/.as_array()`로 꺼낸다(`unwrap`·`[]` 인덱싱·`expect` 금지, release `panic = "abort"`). 최상위 `type`으로 분기하지 않는다 — 어떤 줄이든 `message.content`가 배열이면 그 안의 `tool_use`/`tool_result` 블록만 본다(모르는 type·type이 숫자/객체인 줄도 같은 경로로 안전하게 처리, 블록이 없으면 항목 0개).
- **중복 키**(세션별 `HashSet<String>`, 이벤트를 상한으로 밀어내도 키는 남겨 재읽기 때 되살아나지 않게 한다):
  - 호출: 훅 `PreToolUse`의 `tool_use_id` ↔ 로그 `tool_use.id` → `call:<id>`
  - 결과: 훅 `PostToolUse`·`PostToolUseFailure`의 `tool_use_id` ↔ 로그 `tool_result.tool_use_id` → `result:<id>`
  - 로그 블록에 id가 없으면 줄 `uuid`로 `uuid:<uuid>:<블록 순번>`. id도 uuid도 없으면 항목을 만들지 않는다.
  - 키가 이미 있으면 새 항목을 만들지 않고, 그 키의 기존 항목(남아 있으면)의 `source`를 합친다(`hook`+`log` → `both`). 첫 항목의 시각을 유지한다.
  - 훅의 다른 이벤트(UserPromptSubmit·Stop 등)는 세션 upsert(마지막 활동·출처·cwd)만 하고 타임라인 항목은 없다(DECISIONS 7).
- **세션 upsert**: 로그는 파일 stem, 훅은 `session_id`(문자열 아니면 무시). `cwd`는 처음 본 문자열(표시 전용). `started_ms` = 로그 줄 중 처음으로 파싱되는 `timestamp`(훅만 있는 세션은 null). `last_ms` = 본 시각 중 최댓값. 결과 항목의 도구 이름은 훅이면 `tool_name`, 로그면 같은 세션의 같은 id 호출 항목에서 가져오고 없으면 `""`.
- **시각**: `at_ms`(epoch ms, u64). 로그는 `timestamp`를 `YYYY-MM-DDTHH:MM:SS[.소수]Z`만 파싱(`str::get` 슬라이스 + days-from-civil, 새 의존성 없음), 실패하면 읽은 시각. 훅은 도착 시각(`SystemTime`).
- **세션당 이벤트 상한 `MAX_EVENTS = 500`**: 넘으면 가장 먼저 들어온 항목부터 뺀다(DECISIONS 4: 전부 읽기 + 상한).
- **emit 모델 (기존 `hook-event` 대체)**: 서버 콜백은 이제 `store.ingest_hook` → 바뀐 세션 스냅숏을 `session-update`로 emit한다. **`hook-event` emit과 프론트 `listen("hook-event")`는 지운다**(같은 PreToolUse가 원본 목록과 합친 타임라인에 두 번 보이면 기준 8이 깨지므로). 기존 타임라인 칸은 "선택한 세션의 합친 타임라인"으로 바뀌고, 훅으로 온 도구 호출은 출처 "훅"으로 계속 보인다. 도구 외 훅 이벤트는 타임라인에서 사라지고 세션 목록의 마지막 활동 시각으로만 반영된다(DECISIONS 7의 결과, 위험 R6). 감시 스레드는 한 회차에 바뀐 세션들을 **한 번에** emit(시작 시 과거 기록도 첫 회차 한 번).
- **로그 폴더·디버그 덮어쓰기**: `CLAUDE_CONFIG_DIR`이 비어 있지 않으면 `PathBuf::from(그 값).join("projects")`(릴리스 포함, DECISIONS 5), 아니면 `app.path().home_dir()?/.claude/projects`. `#[cfg(debug_assertions)]` 블록 안에서만 `ORBIT_CLAUDE_PROJECTS`(projects 폴더 자체를 가리킴)로 덮어쓴다(②의 `ORBIT_CLAUDE_SETTINGS`와 같은 방식). 폴더가 없으면 오류가 아니라 세션 0개(매 회차 다시 봄). 경로를 못 정하면(`home_dir` 실패) 감시 스레드를 띄우지 않고 사유를 화면에 표시.
- **capability·CSP·tauri.conf 변경 없음**: 새 명령 `get_sessions`는 `get_status`와 같은 앱 명령이고, `listen`은 ②에서 `core:default`로 동작이 확인됐다. 로그는 Rust만 읽으므로 fs 플러그인 권한을 열지 않는다.
- **프론트**: 4칸 레이아웃 그대로. "세션" 칸 = 로그 폴더 한 줄 + 세션 목록(버튼, 마지막 활동 내림차순). "타임라인" 칸 = 고른 세션의 항목을 `at_ms` 오름차순(같으면 받은 순서). 문자열은 JSX 텍스트로만(`dangerouslySetInnerHTML` 금지), `cwd`는 표시만.

### 인터페이스 (태스크 간 계약 — 이 이름·형태를 그대로 쓴다)

Rust 내부:
```rust
// watch.rs
pub const MAX_LINE: usize = 16 * 1024 * 1024;
pub struct Watcher { /* root: PathBuf, files: HashMap<PathBuf, Tail> */ }
impl Watcher {
    pub fn new(root: PathBuf) -> Self;
    /// 한 회차. 완결되고 JSON으로 파싱되는 줄마다 (세션 ID = 파일 stem, 줄 값)을 넘긴다. 실패는 삼킨다.
    pub fn poll(&mut self, on_line: impl FnMut(&str, serde_json::Value));
}

// sessions.rs
pub const MAX_EVENTS: usize = 500;
#[derive(Clone, serde::Serialize)]
pub struct Event {
    #[serde(skip)] pub key: String,
    pub tool_use_id: Option<String>,
    pub phase: &'static str,   // "call" | "result"
    pub tool: String,
    pub at_ms: u64,
    pub source: &'static str,  // "hook" | "log" | "both"
}
#[derive(Clone, serde::Serialize)]
pub struct Session {
    pub id: String,
    pub cwd: Option<String>,
    pub started_ms: Option<u64>,
    pub last_ms: u64,
    pub source: &'static str,  // "hook" | "log" | "both"
    pub ver: u64,              // Store 전체 단조 증가 카운터, 세션이 바뀔 때마다 갱신
    pub events: Vec<Event>,    // 들어온 순서, 최대 MAX_EVENTS
}
#[derive(Default)] pub struct Store { /* sessions: HashMap<String, Session>, seen: HashMap<String, HashSet<String>>, ver: u64 */ }
impl Store {
    pub fn ingest_hook(&mut self, v: &serde_json::Value, now_ms: u64) -> Option<String>;            // 바뀐 세션 ID
    pub fn ingest_log(&mut self, session: &str, v: &serde_json::Value, read_ms: u64) -> Option<String>;
    pub fn get(&self, id: &str) -> Option<&Session>;
    pub fn all(&self) -> Vec<Session>;
}
pub fn parse_ms(ts: &str) -> Option<u64>;
pub fn now_ms() -> u64;
```

Tauri 명령·이벤트(프론트 ↔ Rust):
| 이름 | 형태 |
|---|---|
| `get_status` (기존, 필드 2개 추가) | 기존 필드 + `projects_dir: string`(못 정하면 `""`), `projects_error: string \| null` |
| `get_sessions` (새 명령) | `Session[]` (위 구조체 JSON, `key` 제외) |
| 이벤트 `session-update` (새) | `Session[]` — 그 회차/그 훅 이벤트로 바뀐 세션 전체 스냅숏. 프론트는 `id`로 교체하되 들고 있는 것보다 `ver`가 작으면 버린다 |
| 이벤트 `hook-event` | **삭제** |

`Mutex` 잠금은 `lock().unwrap_or_else(|e| e.into_inner())`(unwrap 금지 규칙). emit은 잠금을 놓은 뒤 한다.

## 태스크

모든 Rust 명령은 `C:\Users\lclk1\Projects\orbit\src-tauri`에서 실행. 각 태스크는 **자기 파일만** 고친다. 같은 웨이브의 다른 태스크 파일 때문에 컴파일이 깨지면 고치지 말고 잠시 뒤 다시 실행하고, 계속되면 Lead에게 보고한다. 테스트 임시 폴더는 기존 `config.rs`/`hooks.rs`의 `std::env::temp_dir()` + pid + `AtomicU32` 카운터 패턴, 테스트마다 별도 폴더, 끝나면 삭제. 실제 `~/.claude/projects`는 읽지 않는다.

| id | 할 일 | 파일 경로 | 검증 방법 | 웨이브 | 의존 |
|---|---|---|---|---|---|
| T0 | 뼈대: `lib.rs` 맨 위 `mod` 목록에 `mod sessions; mod watch;` 추가. 두 파일을 `//! ` 한 줄로 생성. 그 밖은 그대로 | `src-tauri/src/lib.rs`, `src-tauri/src/sessions.rs`, `src-tauri/src/watch.rs` | `cargo build` 0 종료, `cargo test` 기존 테스트 전부 통과 | 1 | — |
| T1 | 감시기. 위 "파일 선별"·"이어 읽기"와 `Watcher` 인터페이스대로 구현. **테스트 먼저**(`#[cfg(test)]`, 콜백은 `Vec<(String, Value)>`에 모음, 파일 덧붙이기는 `OpenOptions::append`): (a) `<slug>/<uuid>.jsonl`에 완결 줄 1개 → 1건, 세션 ID = stem (b) `\n` 없는 반쪽 줄 → 0건, 나머지+`\n` 덧붙임 → 1건 (c) 깨진 JSON 줄 + 정상 줄 → 정상 줄 1건만 (d) `MAX_LINE + 1`바이트 줄(+`\n`) + 정상 줄 → 정상 줄 1건만 (e) `\n` 없이 `MAX_LINE`을 넘게 자란 꼬리(poll 사이에 두 번 덧붙임) → 0건이고, 이어서 `\n` + 정상 줄 → 그 정상 줄 1건 (f) 파일을 짧게 다시 씀(`fs::write`로 줄 1개) → 그 줄이 다시 1건(처음부터 재읽기) (g) poll 뒤 파일 삭제 → 다음 poll이 panic·오류 없이 0건 (h) 같은 폴더에 `<uuid>.orphaned-1-x.jsonl`, `<uuid>.jsonl.superseded-1`, `<uuid>.meta.json`, `<uuid>/tool-results/<uuid>.jsonl`, `<uuid>/subagents/agent-a1.jsonl`, `<slug>/notauuid.jsonl`, 루트 바로 아래 `<uuid>.jsonl` → 0건(서브에이전트 제외 고정, DECISIONS 3) (i) 루트 폴더가 없음 → 0건, 나중에 만들면 다음 poll에서 읽음 (j) 두 번 연속 poll, 사이에 변화 없음 → 두 번째 0건 | `src-tauri/src/watch.rs` | 구현 전 `cargo test watch::` 실패 → 구현 후 `cargo test watch::` 전부 통과. `Select-String -Path src\watch.rs -Pattern 'unwrap\(|expect\(|println!|eprintln!|dbg!|share_mode'`의 결과가 전부 `#[cfg(test)]` 모듈 안 | 2 | T0 |
| T2 | 세션 모델. 위 "해석"·"중복 키"·"세션 upsert"·"시각"·"상한"과 `Store` 인터페이스대로 구현. **테스트 먼저**: (a) 로그 `tool_use`(id `t1`, name `Read`) 줄 → 이벤트 1건 `call`·`Read`·`log`, 세션 `source:"log"`, `cwd`·`started_ms`가 줄 값 (b) 훅 `PreToolUse`(`session_id`, `tool_use_id:"t1"`, `tool_name:"Read"`) 먼저 → 같은 `t1`의 로그 `tool_use` → 1건, `source:"both"`; 순서를 바꿔 로그 먼저 → 훅 → 1건, `both` (c) 훅 `PostToolUse`/`PostToolUseFailure` ↔ 로그 `tool_result`(`tool_use_id`) → `result` 1건 `both`; 로그 `tool_result`만 왔을 때 도구 이름은 앞선 호출 항목의 `Read` (d) 같은 줄을 두 번 ingest → 1건. id 없는 `tool_use` 블록 + 줄 `uuid` → 두 번 ingest해도 1건 (e) 한 줄에 `tool_use` 2개 → 2건 (f) panic 없음: 줄이 배열·숫자·문자열, `type`이 숫자/객체, `message`가 문자열, `content`가 객체, 블록이 문자열, `id`가 숫자, 모르는 키 → 항목 0개 또는 정상 처리 (g) `type:"zzz"`인 줄 → 항목 0 (h) 훅 `UserPromptSubmit`(session_id만) → 세션 생김·`source:"hook"`·항목 0; `session_id` 없는/숫자인 훅 → `None` (i) 501번째 항목에서 `events.len() == 500`이고 첫 항목이 빠짐, 빠진 항목의 줄을 다시 ingest해도 되살아나지 않음 (j) `ver`가 바뀔 때마다 증가 (k) `parse_ms`: `"1970-01-01T00:00:00Z"`→0, `"2000-03-01T00:00:00.000Z"`→`951868800000`, `"2000-03-01T00:00:00.5Z"`→`951868800500`, `"2000-03-01T00:00:00+09:00"`·`"x"`·`""`·`"2000-13-01T00:00:00Z"`→`None` | `src-tauri/src/sessions.rs` | 구현 전 `cargo test sessions::` 실패 → 구현 후 전부 통과. `Select-String -Path src\sessions.rs -Pattern 'unwrap\(|expect\(|println!|eprintln!|dbg!'`의 결과가 전부 `#[cfg(test)]` 안(`unwrap_or*`는 허용) | 2 | T0 |
| T3 | 화면. `Status` 타입에 `projects_dir`, `projects_error` 추가. `HookEvent`·`MAX_EVENTS`·`listen("hook-event")` 제거. `Session`/`Event` 타입은 인터페이스 표대로. mount 시 `listen("session-update")`를 먼저 걸고 `invoke("get_sessions")`, 둘 다 `id`별 맵에 병합(`ver`가 작으면 버림), unlisten 정리는 기존 패턴(cancelled 플래그) 유지. "세션" 칸: 첫 줄 "로그 폴더: `<code>{projects_dir}</code>`" 또는 "로그 폴더를 정하지 못했습니다: {projects_error}", 아래 세션 목록 `<ul>`의 `<button type="button" aria-pressed>`: `id.slice(0,8)` · `cwd ?? "—"` · 시작 `toLocaleString`(없으면 "—") · 마지막 `toLocaleString` · 출처(`hook`→"훅", `log`→"로그", `both`→"둘 다"), `last_ms` 내림차순, 없으면 hint "아직 세션이 없습니다". 클릭하면 선택. "타임라인" 칸: 선택 세션의 `events`를 `at_ms` 오름차순(stable sort)으로 `toLocaleTimeString` · `tool` · ("호출"/"결과") · 출처, 선택 없으면 hint "세션을 고르면 도구 호출이 시간순으로 표시됩니다". 필요한 최소 CSS(선택 표시, 버튼 목록) | `src/App.tsx`, `src/App.css` | `npm run build` 0 종료. `Select-String -Path src\App.tsx -Pattern 'dangerouslySetInnerHTML','hook-event'` → 결과 없음 | 2 | — (계약은 인터페이스 표) |
| T4 | 배선. `AppState`에 `store: Arc<Mutex<sessions::Store>>`, `projects_dir: Result<PathBuf, String>` 추가. setup: (1) 위 "로그 폴더" 규칙으로 `projects_dir` 계산, `ORBIT_CLAUDE_PROJECTS`는 `#[cfg(debug_assertions)]` 블록 안 한 곳만 (2) 서버 콜백을 `hook-event` emit에서 `ingest_hook(&v, now_ms())` → 바뀐 세션이 있으면 잠금을 놓고 `emit("session-update", vec![s])`로 교체 (3) `projects_dir`가 `Ok`면 스레드 하나: `Watcher::new` → 반복 { 회차마다 `BTreeSet`에 바뀐 ID 모음(`poll` 콜백 안에서 줄마다 잠금·`ingest_log(sid, &v, now_ms())`) → 비어 있지 않으면 스냅숏을 모아 잠금을 놓고 `emit("session-update", Vec<Session>)` 한 번 → `sleep(1s)` }. `get_status`에 `projects_dir`/`projects_error` 채움, 새 `#[tauri::command(async)] fn get_sessions(state) -> Vec<Session>`(`store.all()`)을 `generate_handler!`에 등록. 출력문 없음. **테스트 먼저**(lib.rs `#[cfg(test)]`, Tauri 없이 `Watcher`+`Store`만): 임시 폴더에 `tool_use` 줄 2개 → poll·ingest → 2건; 파일을 첫 줄만 남기게 다시 씀 → poll·ingest → 여전히 2건(재읽기 중복 없음); 다시 `tool_use` 새 id 덧붙임 → 3건 | `src-tauri/src/lib.rs` | 구현 전 `cargo test tests::` 실패 → 구현 후 `cargo build` 0 종료·`cargo test` 전체 통과. `Select-String -Path src\lib.rs -Pattern ORBIT_CLAUDE_PROJECTS` → 1건, `#[cfg(debug_assertions)]` 블록 안. `Select-String -Path src\lib.rs,..\src\App.tsx -Pattern hook-event` → 결과 없음. 앱 확인은 아래 QA 1~3단계(반드시 `ORBIT_CLAUDE_PROJECTS`·`ORBIT_CLAUDE_SETTINGS`를 임시 폴더로 지정한 창에서만 실행, 화면 로그 폴더가 임시 폴더가 아니면 즉시 종료·보고) | 3 | T1, T2, T3 |

웨이브 파일 겹침 확인: W1 = T0 단독(lib.rs·sessions.rs·watch.rs). W2 = watch.rs / sessions.rs / App.tsx·App.css — 서로 다름. W3 = lib.rs 단독.

변경이 닿는 곳 점검: 호출부 = `lib.rs`의 서버 콜백(`hook-event` → `session-update`)과 프론트 `listen`(T3·T4 둘 다 삭제), `get_status` 반환형(T4)과 프론트 `Status` 타입(T3), `generate_handler!`(T4). 테스트 = `watch`·`sessions`·`lib` 신규, 기존 `server`·`hooks`·`config` 테스트는 손대지 않음. 설정·capability·CSP·`tauri.conf.json`·`Cargo.toml`·`package.json` = 변경 없음(이유는 설계 요지). export = `lib.rs`의 `pub fn run()`만, 바뀌지 않음. 하네스 파일(`harness/hooks/`, `.claude/settings.json`) 미변경.

## QA 절차 (BRIEF 4~13, 임시 폴더 대상)

에이전트는 실제 `~/.claude/projects`와 실제 `~/.claude/settings.json`을 열지 않는다. 앱은 두 변수를 임시 폴더로 지정한 같은 PowerShell 창에서만 띄운다(변수 없이 띄우면 실제 로그 폴더를 읽는다).

1. 준비: `$d="$env:TEMP\orbit-qa3"; mkdir "$d\projects\slugA" -Force`. `Set-Content "$d\settings.json" '{}'`. `$u1=[guid]::NewGuid()`; `slugA\$u1.jsonl`에 정상 줄 몇 개(첫 줄 `timestamp`·`cwd`·`uuid`, `tool_use` 포함, 한 줄 안에 `ORBIT-QA-SECRET-MARKER` 문자열) 작성. `Get-FileHash` 전체 기록(기준 12).
2. `$env:ORBIT_CLAUDE_PROJECTS="$d\projects"; $env:ORBIT_CLAUDE_SETTINGS="$d\settings.json"; npm run tauri dev 2>&1 | Tee-Object "$d\..\orbit-qa3-console.txt"`. 화면 "로그 폴더"가 `$d\projects`인지 먼저 확인 — 아니면 즉시 종료(기준 4).
3. 기준 5: 5초 안에 `$u1` 앞 8자 세션이 목록에 있음.
4. 기준 6·7: `slugB\$u2.jsonl` 생성 후 첫 줄(`timestamp` 지정) → 5초 안 목록·시작 시각 확인. `tool_use`(id `toolu_qa1`, name `Read`) 줄, 같은 id `tool_result` 줄 덧붙임 → 세션 선택, `Read` 호출·결과가 순서대로 출처 "로그".
5. 기준 8: 토큰은 `app_data_dir`의 `hook-server.json`에서 변수로만 읽어(출력 금지) `curl.exe -X POST http://127.0.0.1:<port>/events -H "Host: 127.0.0.1:<port>" -H "X-Orbit-Token: $t" -d '{"hook_event_name":"PreToolUse","session_id":"<u2>","tool_use_id":"toolu_qa1","tool_name":"Read"}'` → 그 호출이 한 번만, 출처 "둘 다". 새 id `toolu_qa2`로 훅 먼저 → 로그 `tool_use` 나중 → 한 번만, "둘 다".
6. 기준 9: 같은 파일에 (a) `{oops` (b) `{"type":"zzz"}` (c) 17 MiB 이상 한 줄 (d) `\n` 없는 반쪽 줄 → (d) 완성 + 정상 `tool_use` 1줄 → 앱 살아 있고 5초 안 마지막 항목만 새로 보임.
7. 기준 10: `cwd`·`name`이 `<b>x</b>`인 줄 → 글자 그대로.
8. 기준 11: 앱 켠 채로 `Add-Content`, `Rename-Item <u2>.jsonl <u2>.orphaned-1-x.jsonl`, `Remove-Item` → 모두 오류 없음, 이름 바꾼 사본은 새 세션 아님, 앱 살아 있음.
9. 기준 12·13: 앱 종료 후 1단계에서 이후 QA가 직접 바꾸지 않은 파일의 해시가 같음. 콘솔 기록에 `ORBIT-QA-SECRET-MARKER` 없음(`Select-String`).
10. 끝나면 두 환경변수 제거, `$d` 삭제.

## 성공 기준 대응표

| BRIEF 기준 | 덮는 태스크 | 검증 |
|---|---|---|
| 1 완결 줄 1건 / 반쪽 줄 0→1건 | T1 | T1 (a)(b) |
| 1 깨진 JSON·모르는 type·키·type 숫자/객체 | T1, T2 | T1 (c), T2 (f)(g) |
| 1 상한 초과 줄·자라는 꼬리 | T1 | T1 (d)(e) |
| 1 잘림 → 재읽기, 이미 본 이벤트 재등장 없음 | T1, T2, T4 | T1 (f), T2 (d), T4 lib 테스트 |
| 1 읽던 파일 삭제 | T1 | T1 (g) |
| 1 orphaned·superseded·tool-results·meta 제외, subagents 제외 고정 | T1 | T1 (h) |
| 1 훅↔로그 중복 제거(양 순서), 같은 uuid 1건 | T2 | T2 (b)(c)(d) |
| 2 `npm run build` | T3 | `npm run build` |
| 3 gate.test 회귀 없음 | (하네스 미변경) | QA: `node --test harness/hooks/gate.test.mjs` |
| 4 감시 폴더 = 임시 폴더 표시 | T4(`ORBIT_CLAUDE_PROJECTS`, `get_status`), T3 | QA 2 |
| 5 앱 시작 전 기록 복원 | T1, T2, T4(첫 회차 emit + `get_sessions`), T3 | QA 3 |
| 6 새 파일 = 새 세션, 시작 시각 = 첫 줄 timestamp | T1, T2(`started_ms`), T3 | QA 4 |
| 7 `tool_use`·`tool_result` 타임라인, 출처 로그 | T2, T3 | QA 4 |
| 8 훅+로그 한 번만, "둘 다"(양 순서) | T2, T4(서버 콜백 교체), T3(`hook-event` 제거) | T2 (b) + QA 5 |
| 9 깨진·모르는·초과·반쪽 줄 뒤에도 살아 있음 | T1, T2 | T1 (c)(d)(e), T2 (f)(g) + QA 6 |
| 10 HTML 문자열 그대로 | T3 | QA 7 |
| 11 덧붙이기·이름 변경·삭제 방해 없음 | T1(열고 닫기, 기본 공유 모드, 선별 규칙) | T1 (g)(h) + QA 8 |
| 12 로그 파일 불변 | T1(쓰기 코드 없음) | T1 검증의 Select-String + QA 9 |
| 13 콘솔에 로그 내용 없음 | T1, T2, T4(출력문 없음) | 각 태스크 Select-String + QA 9 |
| 14 실제 폴더·실제 세션(사용자) | T4(변수 없을 때 `CLAUDE_CONFIG_DIR`/`~/.claude/projects`) | 사용자 확인(에이전트 안 함) |

## 위험·가정

- R1 **미확인**: 훅 `session_id`·`tool_use_id`가 로그 파일 stem·`tool_use.id`와 같은 문자열이라는 가정(RESEARCH). 다르면 같은 호출이 두 번 보인다. 기준 14에서 사용자가 확인.
- R2 **미확인**: 로그 `timestamp`가 `…Z` 형식이라는 가정(실측 표본 기준). 다른 형식이면 읽은 시각으로 대체되어 과거 기록이 "지금"으로 찍힌다. 파싱 실패율이 보이면 형식 추가.
- R3 시작 시 전체 읽기 비용과 첫 `session-update` 크기(세션 수 × 최대 500건) 미측정. 큰 로그에서 첫 표시가 수 초 늦을 수 있다. 문제가 되면 BRIEF 질문 4의 C안으로.
- R4 `MAX_LINE` 16 MiB를 넘는 줄 안의 도구 호출은 로그 쪽에서 빠진다(훅으로는 보임). 줄 길이 분포 미측정.
- R5 같은 이름·더 큰 크기로 교체된 파일은 감지하지 못한다(BRIEF 범위 밖). 파일 수가 수천 개면 1초 폴링의 stat 비용 증가(미측정).
- R6 `hook-event` 삭제로 도구 외 훅 이벤트(UserPromptSubmit·Stop·Notification 등)가 타임라인에서 사라진다(DECISIONS 7의 결과). ②의 이벤트 이름 계약을 쓰던 곳은 저장소 안에 App.tsx뿐(grep 확인). PostToolUseFailure는 "결과"로만 보이고 실패 표시는 없다.
- R7 메모리만이라 훅으로만 받은 이벤트는 재시작하면 사라진다(DECISIONS 2 수용). 세션별 중복 키 집합은 상한 없이 커진다(도구 호출 수 비례, 작음으로 추정).
- R8 감시 스레드가 시작 시 오래 잠금을 쥐지 않도록 줄마다 잠그지만, 그 사이 훅 이벤트 emit이 약간 늦을 수 있다. 서버는 응답(204)을 먼저 보내므로 Claude Code는 막히지 않는다.
- R9 W2 병렬 태스크가 같은 crate를 컴파일해 서로의 작성 중 오류로 `cargo test`가 일시적으로 깨질 수 있다(남의 파일은 고치지 않고 재실행).
- R10 `CLAUDE_CONFIG_DIR`과 ②의 훅 설치 대상 불일치는 이번에 고치지 않는다(`.orbit/decisions.md` 13번).
- 가정: `core:default`로 새 이벤트 `listen`, capability 없이 새 앱 명령 invoke가 된다(②에서 같은 형태가 동작, 공식 문서 직접 확인은 안 함 — 미확인). 막히면 `capabilities/default.json`에 그 권한만 추가하는 후속 수정.
