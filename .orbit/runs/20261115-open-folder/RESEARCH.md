# RESEARCH: 폴더 열기 (tauri-plugin-dialog)

확인 날짜: 2026-11-15

## 질문
1. tauri 버전에 맞는 tauri-plugin-dialog 크레이트와 @tauri-apps/plugin-dialog 버전
2. 폴더 고르기에 필요한 최소 capability 권한
3. Rust 쪽 선택과 프론트 선택의 차이, Rust 쪽은 capability 없이 가능한가
4. 반환 경로 형식
5. 코드베이스의 채팅 시작 경로, capability, CSP

## 찾은 것

### 버전
- 프로젝트: tauri 2.12.5 (src-tauri/Cargo.lock:3502), `@tauri-apps/api` 2.12.4 (package-lock.json:635). Cargo.toml은 `tauri = "2"`, package.json은 `@tauri-apps/api ^2`.
- `tauri-plugin-dialog` 최신 안정 2.8.4. tauri 요구 `^2.12` 이므로 2.12.5와 호환. 출처: https://crates.io/api/v1/crates/tauri-plugin-dialog , https://crates.io/api/v1/crates/tauri-plugin-dialog/2.8.4/dependencies
- `@tauri-apps/plugin-dialog` 최신 2.8.4, 의존 `@tauri-apps/api ^2.12.0` (설치된 2.12.4 충족). 출처: https://registry.npmjs.org/@tauri-apps/plugin-dialog/latest
- 플러그인 요구 Rust 1.90 이상. 이 프로젝트는 edition 2024. 설치된 rustc 버전은 미확인. 출처: https://v2.tauri.app/plugin/dialog/
- 설치 수동 절차: `cargo add tauri-plugin-dialog`, 빌더에 `.plugin(tauri_plugin_dialog::init())`, JS 쪽은 npm 패키지. 같은 출처.

### 권한
- 플러그인 기본 권한 세트에 `allow-message`, `allow-save`, `allow-open`이 들어 있다(그래서 `dialog:default`는 필요 이상으로 넓다). 개별 식별자는 `dialog:allow-open`. 출처: https://v2.tauri.app/plugin/dialog/
- 프론트 JS `open({directory: true})`는 `dialog:allow-open`만 있으면 된다(문서의 JS 예시와 권한 표 기준. 폴더 전용 별도 권한은 문서에 없음).
- 플러그인을 `.plugin(init())`으로 등록하면 플러그인 커맨드(`plugin:dialog|open`)가 생기므로 capability에 넣지 않으면 프론트에서는 호출이 거부된다. 이것이 Tauri 2 권한 모델(일반 원칙; 이 문서 페이지에서 직접 확인하지는 않음).

### Rust 쪽 선택
- `FileDialogBuilder::blocking_pick_folder(self) -> Option<FilePath>`; 취소하면 `None`. 메인 스레드에서 호출 금지(교착). 문서 예시는 `async` `#[tauri::command]`. `set_directory(path)`로 시작 위치 지정. 출처: https://docs.rs/tauri-plugin-dialog/2.8.4/tauri_plugin_dialog/struct.FileDialogBuilder.html
- 사용: `use tauri_plugin_dialog::DialogExt; app.dialog().file().blocking_pick_folder()`. (`blocking_pick_file`은 https://v2.tauri.app/plugin/dialog/ 에 예시. DialogExt 트레이트 자체는 이번에 페이지에서 직접 열지 않아 아래 "미확인".)
- capability는 webview→커맨드 호출(IPC)에 대한 ACL이다. Rust 코드가 `AppHandle`로 직접 부르는 `app.dialog()`는 IPC를 거치지 않으므로 권한이 필요 없다. 이것은 Tauri 권한 모델에 대한 일반 지식이며 공식 페이지에서 문장으로 확인하지 못함(미확인 표시). 단 앱 자체 커맨드(`#[tauri::command]`)는 `invoke_handler`에 등록된 것이 기본으로 프론트에서 호출 가능(현재 앱도 chat_send 등이 capability 항목 없이 동작 중).

### 반환 경로
- `FilePath`는 `Path(PathBuf)`와 `Url(Url)` 두 가지 변형이다(desktop에서는 Path). `into_path()`(Result<PathBuf>) 또는 `as_path()`로 PathBuf를 얻는다. 이번에 docs.rs에서 직접 확인하지 못함(미확인, 기억 기반). Windows에서는 `C:\Users\...` 형식의 절대경로가 나온다고 예상.
- JS `open({directory:true})`는 `string | null` 반환.

## 코드베이스 메모
- 진입: `src/Chat.tsx:205` `invoke("chat_send", {session: session?.id ?? "", text})`. 프론트는 세션 id만 보내고 cwd는 보내지 않는다.
- `src-tauri/src/lib.rs:116-119` `chat_send`가 `state.store`에서 세션의 cwd를 찾아 `state.chat.send(&app, cwd, &text)` 호출. cwd 출처는 훅·로그 세션 정보.
- `src-tauri/src/chat.rs:25` `send`: 사이드카가 이미 있으면 cwd 무시하고 `send` 메시지. 없으면 `spawn_with` (73-79줄)에서 cwd 비어있음 → 에러, `roadmap::local_abs` 검사, `is_dir` 검사 후 `{"t":"start","cwd":cwd,"text":text}`를 사이드카 stdin으로 보냄. 이미 있는 검증을 그대로 재사용 가능.
- `chat_reset`(lib.rs:140)이 `Chat::stop()`을 호출해 사이드카 종료. "새 대화"가 이것.
- UI 문구 `Chat.tsx:220` emptyText는 세션 폴더 기준. 새 폴더 모드에서는 세션이 없을 때도 시작 가능해야 하고, `canSend`(Chat.tsx:175)는 `open || session !== null` 조건.
- `lib.rs` 등록: `.plugin(tauri_plugin_opener::init())` 옆에 dialog 추가, `generate_handler!`(214-227줄)에 새 커맨드 추가 필요.
- `capabilities/default.json`: `core:default`, `opener:default`만. CSP(tauri.conf.json:21)는 `default-src 'self' ipc: http://ipc.localhost`. 네이티브 다이얼로그는 OS 창이라 CSP 변경 불필요(JS 플러그인도 ipc 사용). 추가 변경 없음으로 판단.
- Cargo.toml 의존에 dialog 없음, package.json에도 없음.
- sidecar 스크립트: `sidecar/chat.mjs`. 이번엔 cwd 사용부를 열어보지 않았다(chat.rs가 `start`에 cwd를 넘기는 것만 확인).

## 확인하지 못한 것
- `DialogExt`, `FilePath`의 정확한 메서드명·변형(docs.rs에서 직접 열지 않음). 구현 시 `cargo doc`/컴파일로 확인.
- Rust에서 직접 호출하는 `app.dialog()`가 capability 없이 동작함을 명시한 공식 문장.
- 로컬 rustc가 1.90 이상인지.
- `blocking_pick_folder`가 Windows에서 UNC/`\\?\` 접두를 붙이는지. `roadmap::local_abs`가 이런 경로를 허용·거부하는지 구현 시 테스트 필요.
- sidecar/chat.mjs의 cwd 처리 상세.

## 설계에 미치는 영향
1. 프론트 문자열을 cwd로 쓰지 않으려면 선택을 Rust 커맨드 안에서 한다: 새 `#[tauri::command] async fn`(예: `chat_open_folder`)이 `app.dialog().file().blocking_pick_folder()`로 폴더를 받고, 그 PathBuf를 Rust 쪽에서 `Chat`에 넘긴다. 프론트는 "열기" 신호와 첫 메시지 텍스트만 보낸다. 이 경우 capability에 `dialog:*`를 추가하지 않아도 되므로 webview에 다이얼로그 권한을 여는 공격면이 없다(위 미확인 전제).
2. 프론트 방식을 택하면 `dialog:allow-open`만 추가하되 반환된 문자열이 프론트를 거치므로 다시 `chat_send`로 넘기면 신뢰 경계가 약해진다. 쓰려면 Rust에서 `local_abs`+`is_dir` 재검증(이미 `spawn_with`에 있음)이 필수. 권장은 1번.
3. 선택된 경로는 `chat.rs`의 `spawn_with`에서 쓰는 `&str` 검증과 같은 길로 가게 한다. `to_str()`이 None(비 UTF-8)이면 에러 처리.
4. 메시지 타이밍: 폴더 선택 → 이후 사용자가 첫 메시지를 입력 → `send`. 사이드카가 이미 있으면 cwd 무시되므로 이미 열린 대화가 있을 때는 폴더 열기를 막거나 `chat_reset` 후 하도록 해야 한다(UI 비활성: `running` 중).
5. 변경 범위: Cargo.toml(+tauri-plugin-dialog 2.8.4, 크레이트만. npm 패키지는 Rust 방식이면 불필요), lib.rs(`.plugin(...)`, 새 커맨드, 핸들러 등록), Chat.tsx(버튼과 상태), 선택된 폴더를 보관할 상태(Chat 또는 AppState). `.plugin(tauri_plugin_dialog::init())` 등록은 `blocking_pick_folder`에 필요하다(다이얼로그 플러그인 초기화).
6. 취소(`None`)는 에러가 아니라 조용히 무시.
7. 테스트: 다이얼로그 자체는 자동화 불가 → 경로 검증 단위 테스트(chat.rs 기존 `spawn_rejects_bad_cwd...`처럼)와 수동 QA(`npm run tauri dev`에서 실제 선택).
