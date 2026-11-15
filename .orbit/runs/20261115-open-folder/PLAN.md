# PLAN — 20261115-open-folder (폴더 열기)

## 변경 이력

- 2026-11-15, PLAN_CHECK(FAIL) 반영:
  - B1: T2에 `src/App.tsx` 추가. 세션 클릭마다 `pickSeq`를 올려 Chat에 넘기고, `useEffect` 의존성을 `[session?.id, pickSeq]`로 바꿈. 위험 7 교체, QA 7 추가.
  - B2: **(a) 확정.** `chat_open_folder`에서만 `\\?\X:\`를 `X:\`로 벗기는 `strip_verbatim_disk`(chat.rs) + 단위 테스트. `\\?\UNC\...`는 벗기지 않고 거부. 위험 4 교체.
  - B3: T2(2) rg 패턴 수정(`\|` → `|`). T1에 `node --test harness/hooks/gate.test.mjs`, `git diff main -- package.json` 확인 추가. QA 4에 cwd 확인(기준 12) 추가.
  - R1(위험 8 문장), R2·R3(`picking` 상태로 다이얼로그 중 버튼·보내기 끔), R4(정규화 근거 한 줄) 반영. R5는 범위 밖으로 둠.

## 목표

Claude Code 세션 로그가 없는 폴더에서도 터미널 없이 Orbit 채팅으로 첫 대화를 시작한다(BRIEF 성공 기준 1~14). 폴더 경로는 Rust 안에서만 고르고 보관한다. 웹뷰는 폴더 경로를 cwd로 보내지 않는다.

## 설계 요지

1. **폴더 선택은 Rust 안에서 한다.** 새 커맨드 `chat_open_folder`를 `#[tauri::command(async)]`로 만든다. 기존 커맨드와 같은 형식이다. 이 커맨드는 async 런타임 스레드에서 돌고 메인 스레드에서는 돌지 않으므로, 그 안에서 `app.dialog().file().blocking_pick_folder()`를 불러도 교착되지 않는다. 결과는 이렇다.
   - 취소: `Ok(None)`을 돌려준다.
   - 선택: 경로를 검증한 뒤 `Chat`에 보관하고, 화면 표시용 폴더 이름만 `Ok(Some(name))`으로 돌려준다.
   - 검증 실패: `Err(이유)`를 돌려준다.
   - capability 변경은 없다(0개).
2. **검증은 한 길로 한다.** `spawn_with` 맨 앞에 있던 검증 세 가지(빈 값, `roadmap::local_abs`, `is_dir`)를 `pub fn check_cwd(&str) -> Result<(), String>`로 빼낸다. `spawn_with`와 폴더 선택이 이 함수를 같이 쓴다.
   - 오류 문구는 그대로 둔다. 그래서 기존 테스트 `spawn_rejects_bad_cwd...`는 손대지 않는다.
   - 경로가 UTF-8이 아니면 거부한다.
   - `canonicalize`는 쓰지 않는다. Windows에서 `\\?\` 접두를 붙여 `local_abs`가 거부하기 때문이다. 고른 경로는 OS 폴더 선택 창이 준 실재 폴더이므로(웹뷰 문자열이 아님) 절대경로 모양 검사 + `is_dir`로 충분하다.
   - `check_cwd`는 UNC 경로와 `\\?\` 경로를 지금처럼 거부한다(BRIEF 열린 질문 4). 이 동작은 단위 테스트로 고정한다.
   - 다이얼로그가 `\\?\C:\...`를 줄 가능성에 대비해, `chat_open_folder`에서만 `check_cwd` 앞에 `strip_verbatim_disk`로 `\\?\X:\` → `X:\`를 벗긴다. `\\?\UNC\...`는 그대로 두어 `check_cwd`가 거부한다. `check_cwd`·`spawn_with`는 이 함수를 쓰지 않는다.
3. **cwd 출처를 하나 더 둔다(`Chat.picked`).**
   - `chat_send`는 `session == ""`이면 `Chat.picked`를 cwd로 쓰고, 아니면 지금처럼 store에서 cwd를 찾는다.
   - 프론트는 폴더 이름(`folder`)만 상태로 들고 있다. `folder`가 있으면 `session: ""`를 보내고, 없으면 세션 id를 보낸다. 인자에 경로는 없다.
   - 왼쪽 세션을 누르면(같은 세션을 다시 눌러도) `folder`를 비운다. 마지막 선택이 이긴다. 같은 세션 재클릭은 `session?.id`가 안 바뀌므로 App이 클릭마다 올리는 `pickSeq`를 같이 감시한다.
   - 폴더 선택 창이 떠 있는 동안(`picking`)에는 버튼과 보내기를 끈다(이중 다이얼로그, 옛 폴더로 사이드카 시작 방지).
   - 폴더를 골랐을 때 Rust는 `Chat::stop()`을 먼저 부른 뒤 보관한다. 대화가 살아 있으면 cwd가 무시되는 조용한 오동작을 구조로 막기 위해서다.
   - 실행 중에는 버튼을 비활성으로 둔다.

### 인터페이스 변경

| 위치 | 변경 |
|---|---|
| Rust 커맨드(신규) | `chat_open_folder(app: AppHandle, state: State<AppState>) -> Result<Option<String>, String>`. 인자 없음. |
| Rust 커맨드(의미 확장) | `chat_send(session, text)`. 시그니처는 그대로다. `session == ""`이면 고른 폴더를 쓴다. 고른 폴더가 없으면 예전처럼 `None`이 되어 "세션 폴더를 알 수 없습니다" 오류가 난다. |
| `chat::Chat` | 필드 `picked: Mutex<Option<String>>`를 추가한다(`Default` 유지). 메서드 `set_picked(String)`, `picked() -> Option<String>`를 추가한다. |
| `chat` 모듈 | 자유 함수 `pub fn check_cwd(cwd: &str) -> Result<(), String>`, `pub fn strip_verbatim_disk(s: &str) -> &str`를 추가한다. |
| `Chat` 컴포넌트 props | `{ session }` → `{ session, pickSeq: number }`. 호출부는 `src/App.tsx:225` 한 곳. |
| 의존성 | `tauri-plugin-dialog = "2"`(2.8.x로 해석됨) 하나만 추가한다. npm 패키지는 없다. |
| capability / CSP | 바꾸지 않는다. |

## 태스크

| id | 할 일 | 파일 | 검증 방법 | 웨이브 | 의존 |
|---|---|---|---|---|---|
| T1 | **Rust: 검증 함수, 고른 폴더 보관, 커맨드** (자세한 내용은 표 아래) | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`(자동 갱신), `src-tauri/src/chat.rs`, `src-tauri/src/lib.rs` | (1) `rustc --version`이 1.90 이상이다. (2) 먼저 실패하는 테스트: `check_cwd`를 만들기 전에 테스트를 넣고 `cargo test check_cwd`가 컴파일 실패하는 것을 본다. (3) `src-tauri/`에서 `cargo test`가 0으로 끝나고 `check_cwd_*`, `strip_verbatim_disk_*` 테스트와 기존 `spawn_rejects_bad_cwd_without_starting_a_process`가 통과한다. (4) `cargo build`가 0으로 끝난다. (5) `git diff main -- src-tauri/capabilities/`가 비어 있다. (6) `git diff main -- src-tauri/Cargo.toml`에서 추가된 줄이 dialog 한 줄뿐이고, `git diff main -- package.json`이 비어 있다. (7) 루트에서 `node --test harness/hooks/gate.test.mjs`가 0으로 끝난다. | 1 | 없음 |
| T2 | **프론트: 버튼과 상태** (자세한 내용은 표 아래) | `src/Chat.tsx`, `src/App.tsx` | (1) 루트에서 `npm run build`가 0으로 끝난다. (2) `rg -n "chat_open_folder|chat_send" src/Chat.tsx`가 2건 이상을 보이고, `chat_open_folder`는 인자 없이 호출되며 `chat_send` 인자는 `{ session: ..., text: ... }`뿐이다(경로 없음). (3) `rg -n "style=\{\{.*color|#[0-9a-fA-F]{3,6}" src/Chat.tsx src/App.tsx` 결과에 새 색이 없다(`git diff main`과 비교). (4) `rg -n "pickSeq" src/App.tsx src/Chat.tsx`로 App의 클릭 핸들러·`<Chat ... pickSeq=...>`와 Chat의 `useEffect` 의존성 배열에 들어간 것을 확인한다. | 1 | T1의 인터페이스(위 표). 파일은 겹치지 않으므로 병렬로 돌린다. 실제 동작은 T1과 합친 뒤 QA가 본다. |
| T3 | ROADMAP.md "미뤄 둔 작업" 맨 아래에 `- [ ] 폴더 열기: 처음 쓰는 폴더에서 채팅 시작` 한 줄을 추가한다. `[x]` 처리는 머지 커밋에서 한다(이 태스크가 아님). | `ROADMAP.md` | `git diff main -- ROADMAP.md`에 추가된 줄이 정확히 1줄이다. | 1 | 없음 |

### T1 자세한 내용 (Rust)

- **`Cargo.toml`**: `[dependencies]`에 `tauri-plugin-dialog = "2"`를 넣는다(`cargo add tauri-plugin-dialog`). 다른 의존성은 넣지 않는다.
- **`chat.rs`: `check_cwd`**
  - `pub fn check_cwd(cwd: &str) -> Result<(), String>`를 만든다.
  - 순서는 다음과 같다.
    1. 비었으면 `"세션 폴더를 알 수 없습니다"`
    2. `!roadmap::local_abs`이면 `"로컬 절대 경로가 아닙니다"`
    3. `!is_dir`이면 `"폴더가 없습니다"`
  - `spawn_with`는 `let cwd = cwd.ok_or("세션 폴더를 알 수 없습니다")?; check_cwd(cwd)?;`로 바꾼다. 동작은 같다.
- **`chat.rs`: `Chat`**
  - 필드 `picked: Mutex<Option<String>>`를 추가한다.
  - `pub fn set_picked(&self, p: String)`와 `pub fn picked(&self) -> Option<String>`를 추가한다. 락은 기존처럼 `unwrap_or_else(|e| e.into_inner())`로 잡는다.
- **`chat.rs`: 테스트 `check_cwd_rejects_bad_and_accepts_dir`**
  - 거부해야 하는 경우:
    - `""`
    - `"rel/dir"`
    - 없는 경로
    - 파일: `std::env::temp_dir()` 아래에 만든 임시 파일
    - (Windows만) `\\server\share\p`
    - (Windows만) `\\?\C:\Windows`
    - (Windows만) `\\?\UNC\server\share\p`
  - 통과해야 하는 경우:
    - `std::env::temp_dir()`
  - 임시 파일은 테스트 끝에 지운다.
- **`chat.rs`: `strip_verbatim_disk`**
  - `pub fn strip_verbatim_disk(s: &str) -> &str`: `s.strip_prefix(r"\\?\")`가 있고 나머지의 두 번째 바이트가 `:`이고 첫 바이트가 ASCII 알파벳이면 나머지를, 아니면 `s`를 그대로 돌려준다. 문자열만 다루며 파일 시스템을 건드리지 않는다.
  - 먼저 실패하는 테스트 `strip_verbatim_disk_only_strips_drive_paths`(플랫폼 무관):
    - `\\?\C:\x` → `C:\x`
    - `\\?\UNC\server\share\p` → 그대로
    - `C:\x` → 그대로
    - `\\?\` → 그대로
  - 기존/신규 `check_cwd`의 `\\?\C:\Windows` 거부 테스트는 그대로 둔다(`check_cwd`는 벗기지 않는다).
- **`lib.rs`**
  - `.plugin(tauri_plugin_dialog::init())`를 opener 옆에 넣는다.
  - `generate_handler!`에 `chat_open_folder`를 추가한다.
  - `chat_send`: `let cwd = if session.is_empty() { state.chat.picked() } else { lock(&state.store).get(&session).and_then(|s| s.cwd.clone()) };`
  - 새 커맨드 `#[tauri::command(async)] fn chat_open_folder(app, state)`. 로직은 이렇다.
    1. `use tauri_plugin_dialog::DialogExt;`
    2. `blocking_pick_folder()`가 `None`이면 `Ok(None)`.
    3. 아니면 `FilePath`를 `PathBuf`로 바꾼다(`into_path()`. 메서드 이름은 컴파일로 확인한다). 실패하면 `Err`.
    4. `to_str()`가 `None`이면 `Err("폴더 경로를 읽을 수 없습니다")`.
    5. `let s = chat::strip_verbatim_disk(s); chat::check_cwd(s)?` (이후 단계는 벗긴 `s`를 쓴다)
    6. `state.chat.stop()`
    7. `state.chat.set_picked(s.to_string())`
    8. `Ok(Some(name))`. `name`은 `Path::file_name()`이고, 드라이브 루트처럼 이름이 없으면 경로 문자열 그대로다.
  - 로그에는 아무것도 찍지 않는다.
- **capability 확인**: 실제 앱(`npm run tauri dev`)에서 capability를 추가하지 않은 상태로 창이 뜨는지 본다(BRIEF 전제 a). 창이 안 뜨면 `capabilities/default.json`에 `dialog:allow-open` 하나만 추가하고, 그 사실과 이유를 이 PLAN의 "위험·가정" 1번에 적는다. 다른 권한이 필요하면 멈추고 Lead에게 보고한다.

### T2 자세한 내용 (프론트, `src/Chat.tsx`, `src/App.tsx`)

- **`App.tsx`**
  - `const [pickSeq, setPickSeq] = useState(0)`를 추가한다.
  - 202행 클릭 핸들러: `onClick={() => { setSelected(x.id); setNode(null); setPickSeq((n) => n + 1); }}`.
  - 225행: `<Chat session={cur} pickSeq={pickSeq} />`.
  - `cur` 객체 identity로 감시하지 않는다(session-update마다 새 객체라 매번 폴더가 지워진다).
- **상태 (`Chat.tsx`)**
  - props에 `pickSeq: number`를 추가한다.
  - `const [folder, setFolder] = useState<string | null>(null)`, `const [picking, setPicking] = useState(false)`를 추가한다.
  - `useEffect(() => setFolder(null), [session?.id, pickSeq])`. 왼쪽에서 세션을 누르면(같은 세션이어도) 폴더 선택을 버린다.
- **`pickFolder`**
  - `setPicking(true)` 후 `invoke<string | null>("chat_open_folder")`를 인자 없이 부르고, `.finally(() => setPicking(false))`.
  - 결과가 `null`이면(취소) 아무것도 하지 않는다.
  - 이름이 오면 `if (items.length > 0) reset();` 다음에 `setFolder(name)`. Rust가 이미 stop했고, `reset`이 다시 `chat_reset`을 불러도 결과는 같다.
  - `.catch(fail)`로 오류를 붙인다. 그러면 `✕ 오류:` 한 줄이 뜬다(BRIEF 열린 질문 4).
- **보내기 조건**
  - `canSend = !running && !picking && (open || session !== null || folder !== null)`
  - `submit`의 조건은 `canSend && (open || session || folder)`
  - 구분선 이름은 `folder ?? folderName(session!)`
  - `invoke("chat_send", { session: folder ? "" : session?.id ?? "", text: t })`
- **문구**: `emptyText`는 `folder`가 있으면 `` `보내면 ${folder} 폴더에서 새 대화를 시작합니다` ``이고, 없으면 기존 문구 그대로다.
- **버튼**
  - `chat-head` 안의 `새 대화` 버튼 옆에 `<button type="button" className="btn" disabled={running || picking} onClick={pickFolder}>폴더 열기</button>`를 넣는다. 이 버튼은 항상 보인다.
  - `chat-head`는 `justify-content: space-between`이라 두 버튼을 `<div style={{ display: "flex", gap: "var(--s-2)" }}>`로 묶는다. CSS 파일은 바꾸지 않고, 새 색도 넣지 않는다.

## QA로 넘기는 수동 확인 (BRIEF 7~14)

T1과 T2를 합친 뒤 `npm run tauri dev`를 실행한다.

1. 버튼이 보이고 취소하면 화면에 변화가 없는지 본다.
2. scratchpad 아래에 새로 만든 빈 폴더를 고른다. 빈 화면 문구가 그 폴더 이름을 보이고 입력 줄이 켜지는지 본다.
3. 짧은 프롬프트를 1회 보낸다. 구분선과 `완료`가 뜨는지 본다.
4. 왼쪽 목록에 그 폴더의 세션이 정확히 1개 생기고, 누르면 Lead 노드가 보이는지 본다. 3의 프롬프트는 `이 작업 폴더의 이름만 말해`로 보내고, 응답이 고른 폴더 이름과 같은지 본다(기준 12). 다르면 그 세션의 cwd 표시(구분선 `폴더:` 이름)가 고른 폴더와 같은지로 판정한다.
5. 실행 중에는 버튼이 비활성인지 본다. 폴더 선택 창이 떠 있는 동안 버튼과 보내기가 꺼져 있는지도 본다.
6. 기존 세션을 골라 보내서 회귀가 없는지 본다.
7. 왼쪽에서 세션 A를 고른 상태로 폴더를 고른 뒤, **이미 선택된 A**를 다시 누른다. 폴더 문구가 사라지고, 보내면 구분선이 A의 폴더 이름을 보이는지 본다.
8. capability 0개로 다이얼로그가 떴는지, 고른 폴더가 `✕ 오류` 없이 받아들여졌는지 기록한다.
9. 자동 테스트 재확인: `npm run build`, `src-tauri/`에서 `cargo test`, 루트에서 `node --test harness/hooks/gate.test.mjs`가 모두 0으로 끝난다.

## 위험·가정

1. **미확인**: Rust에서 직접 부르는 `app.dialog()`가 capability 없이 동작하는지는 공식 문장으로 확인하지 못했다. 일반 원칙상 capability는 웹뷰가 IPC로 부르는 호출에만 걸리므로 0개면 될 것으로 본다. T1의 실제 앱 확인으로 판정하고, 안 되면 `dialog:allow-open` 하나만 추가한다.
2. **미확인**: `FilePath::into_path()`/`as_path()`의 메서드 이름과 반환형은 기억에 기댄 것이다. 컴파일로 확인한다.
3. **미확인**: 로컬 rustc가 1.90 이상인지 모른다. 낮으면 T1을 멈추고 보고한다. 이번 run에서 툴체인을 올리지 않는다.
4. **미확인**: Windows 폴더 선택 창이 `\\?\` 접두가 붙은 경로를 돌려주는지 모른다. 보통은 `C:\...` 형식이라고 예상하지만, 어느 쪽이든 `chat_open_folder`가 `strip_verbatim_disk`로 `\\?\X:\`를 벗긴 뒤 검증하므로 드라이브 경로는 통과한다. `\\?\UNC\...`(네트워크 폴더)는 거부되어 `✕ 오류`가 뜬다(BRIEF 열린 질문 4와 같음).
5. **미확인(Tauri 동작)**: `#[tauri::command(async)]`가 붙은 sync 함수는 메인 스레드가 아니라 async 런타임에서 돈다고 보고 있다. 기존 `open_screens_dir` 등이 같은 형식이다. 폴더 선택 창이 떠 있는 동안 런타임 워커 하나가 막히는 것은 감수한다.
6. 매핑된 네트워크 드라이브(`Z:\`)는 `Disk` 접두라 `local_abs`를 통과한다. 이것은 기존 세션 cwd와 같은 동작이고 이번 범위 밖이다.
7. 같은 세션 재클릭은 `session?.id`가 바뀌지 않으므로 App의 `pickSeq`로 감지한다(B1). `setSelected` 호출과 `<Chat>` 사용처는 각각 `App.tsx:202`, `App.tsx:225` 한 곳뿐이다(grep 확인).
8. `새 대화`(`chat_reset`) 후에도 Rust의 `picked`와 프론트 `folder`가 남아, 고른 폴더가 다음 대화의 cwd가 된다(DECISIONS 2번과 일치). 왼쪽 세션을 눌러 `folder`를 버린 뒤에는 프론트가 `session: ""`를 보내지 않으므로(대화가 열려 있으면 cwd는 무시됨) `picked`는 쓰이지 않고, 다음 선택이 덮어쓴다.
9. 폴더 선택 창에 부모 창(`set_parent`)을 지정하지 않아 앱 창에 모달로 붙지 않을 수 있다. BRIEF 범위 밖이다. 대신 `picking` 동안 버튼·보내기를 끈다.
10. 오류가 나면 `fail`이 `end` 항목을 넣어 빈 화면 문구가 사라지고 `새 대화`가 뜬다(PLAN_CHECK R5). 기존 동작이라 이번 run에서 고치지 않는다.
