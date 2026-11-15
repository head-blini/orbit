# RESEARCH — 20261115-terminal (확인일 2026-11-15)

profile.json은 바꾸지 않았다(스택 변화 없음: 새 의존성 `@xterm/xterm`·`portable-pty`는 기존 신호를 바꾸지 않음).

## 1. xterm.js · React 19 · Vite

찾은 것
- `@xterm/xterm` 최신 6.0.0 (npm 2025-12-22경) — https://registry.npmjs.org/@xterm/xterm/latest
- `@xterm/addon-fit` 최신 0.11.0, peerDependencies 없음(설명상 xterm 4+) — https://registry.npmjs.org/@xterm/addon-fit/latest
- 6.0.0 호환 깨짐: canvas 렌더러 제거(DOM·WebGL만), 스크롤바·뷰포트 재작업, Alt→Ctrl+Arrow 매핑 제거, `windowsMode`·`fastScrollModifier` 옵션 제거 — https://github.com/xtermjs/xterm.js/releases
- 공식 React 래퍼 없음. 일반 패턴: `useEffect`에서 `new Terminal()` + `loadAddon(new FitAddon())` + `open(div)` + `fit()`, 크기 변화는 `ResizeObserver`로 `fit()` 후 `term.cols/rows`를 Rust로 전달, 정리 시 `term.dispose()`. CSS는 `import "@xterm/xterm/css/xterm.css"`. (패턴은 xterm 문서 일반 사용법, 이번에 별도 링크로 재확인하지 않음 — 미확인 표시)
- CSP 주의: 현재 `tauri.conf.json` 운영 CSP는 `style-src 'self'`(unsafe-inline 없음). xterm은 인라인 스타일을 써서 `style-src 'self'`에서 CSP 오류가 난다는 이슈가 있음(5.1.0 기준, 해결 여부 미확인) — https://www.goodfirstissue.org/xtermjs/xterm.js/issues/4445 . dev CSP는 이미 `'unsafe-inline'`이라 dev에서는 안 드러나고 **빌드(운영) 앱에서만** 깨질 수 있다.

## 2. portable-pty · ConPTY

찾은 것
- 최신 0.9.0 (2025-02-11), 저장소 wezterm — https://crates.io/api/v1/crates/portable-pty
- API: `native_pty_system().openpty(PtySize{rows,cols,pixel_width,pixel_height})` → `pair.slave.spawn_command(CommandBuilder)` → `Child`; `pair.master.try_clone_reader()`(`Box<dyn Read+Send>`), `take_writer()`(한 번만; drop하면 slave에 EOF), `master.resize(PtySize)` — https://docs.rs/portable-pty/0.9.0/portable_pty/ , https://docs.rs/portable-pty/0.9.0/portable_pty/trait.MasterPty.html
- `Child`: `try_wait()`(비차단), `wait()`(차단), `process_id()`, supertrait `ChildKiller`(`kill`, `clone_killer`) — https://docs.rs/portable-pty/0.9.0/portable_pty/trait.Child.html (kill 시그니처·Windows 동작은 문서 페이지에 없어 미확인)
- Windows 실행 파일 찾기(소스 `cmdbuilder.rs`): `search_path`가 PATH 각 폴더에서 이름 그대로 → `PATHEXT` 확장자(없으면 `.EXE`만) 순으로 찾고, **못 찾으면 에러 없이 이름 그대로 반환**. `.cmd`/`.bat` 특수 처리·`cmd.exe /c` 래핑 없음. 즉 `claude.cmd`(npm 전역 설치)는 PATHEXT에 있어야만 잡히고, 잡혀도 CreateProcess가 .cmd를 직접 실행하는 것은 보장되지 않는다. — https://docs.rs/crate/portable-pty/0.9.0/source/src/cmdbuilder.rs
- `CommandBuilder::new`는 현재 프로세스 환경을 복사(Windows는 레지스트리 시스템·사용자 변수 병합). `cwd` 미지정이거나 폴더가 아니면 USERPROFILE로 대체 — 같은 소스. 즉 **존재하지 않는 cwd가 조용히 홈으로 바뀌므로 Rust가 `check_cwd`로 먼저 막아야 한다**.
- 이 PC: 네이티브 설치 `C:\Users\lclk1\.local\bin\claude.exe` 존재, `%APPDATA%\npm\claude*` 없음(Glob 확인). npm 설치는 deprecated, 네이티브 설치기는 `~\.local\bin`에 둔다 — https://code.claude.com/docs/en/setup (검색 요약으로 확인, 페이지 본문 직접 열람은 안 함)
- 읽기 스레드 종료: Windows ConPTY에서 자식이 죽어도 reader가 EOF를 못 받고 master를 drop해야 끝난다는 점은 일반적으로 알려져 있으나 **이번 조사에서 출처로 확인하지 못했다**(미확인). 설계는 `child.wait()` 스레드 + exit 시 master/writer drop으로 하고 실측한다.

## 3. Tauri 2 스트리밍 · 커맨드

찾은 것
- 공식 권장: 스트리밍·순서 보장·고처리량은 **Channel**, event는 "낮은 지연·고처리량용이 아님", 페이로드는 JSON 문자열, 비동기 리스너에서 순서 뒤바뀔 수 있음. Rust `#[tauri::command] fn f(on_event: Channel<T>)` + `on_event.send(..)`, JS `new Channel<T>()`; `onmessage` 설정 후 `invoke("f", { onEvent })` — https://v2.tauri.app/develop/calling-frontend/
- 따라서 PTY 출력은 Channel. 바이트는 JSON 배열(숫자)로 직렬화되면 비효율 — 문자열(lossy UTF-8) 또는 `tauri::ipc::Response`/`InvokeResponseBody::Raw`를 쓰는 방법이 있으나 이번엔 공식 문서로 확인하지 않음(미확인). UTF-8 문자 경계가 청크 사이에서 잘리지 않게 Rust에서 모아 보내야 한다.
- 입력·리사이즈는 일반 커맨드 2개(`term_write(data)`, `term_resize(cols,rows)`)면 됨. 입력은 PTY에 바이트로만 쓰이고 실행 파일·인자는 건드리지 못한다.

## 4. 한글 IME · Claude TUI 렌더링

찾은 것
- xterm.js의 한글 문제는 **macOS WKWebView/Safari**에서 composition 이벤트가 안 와서 자모가 분해되는 형태다. PR #5704(2026-02, 미병합, 변경 요청 상태)가 그 대응 — https://github.com/xtermjs/xterm.js/pull/5704 . Orbit은 Windows(WebView2=Chromium)가 우선이라 같은 증상이 직접 해당한다는 근거는 찾지 못했다 — **Windows WebView2에서의 xterm 6.0 한글 조합은 실측 전까지 미확인**.
- 조합 종료 키(스페이스·마침표)에서 keydown이 compositionend보다 먼저 와 마지막 글자가 두 번 들어가는 패턴이 다른 터미널 웹 구현에서 보고됨(ghostty-web PR #120, 검색 요약) — 첫 태스크에서 확인할 항목.
- Claude Code 자체 한글 문제(원본 콘솔 한정): Windows raw-mode TUI에서 자모가 조합 안 됨 https://claudeissues.com/issue/65519-bug-windows-korean-hangul-jamo-do-not-compose-while-typing-in-cli-input-raw-mode , 입력 마지막 글자 중복 https://claudeissues.com/issue/8617-bug-korean-input-duplicates-last-character-in-claude-code-for-vs-code-2-0-2 (VS Code 내장 터미널=xterm.js 계열 사례). 같은 TUI가 xterm에서 어떻게 되는지는 실측 필요.
- 렌더링: VS Code/Cursor(xterm.js) 내장 터미널에서 Claude Code 깜빡임 보고 https://claudeissues.com/issue/18084-severe-screen-flickering-in-vs-code-cursor-integrated-terminal-on-windows , Windows ConPTY 입력창 흰 막대 https://claudeissues.com/issue/14599-bug-severe-rendering-issue-on-windows-white-input-bar-and-broken-output-conpty , 리사이즈 잔상은 `CLAUDE_CODE_NO_FLICKER=1`·`CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1`·Ctrl+L로 완화한다는 사용자 보고(공식 문서 아님, 버전 의존). 터미널 쪽 대응으로 "PTY 청크를 xterm에 순서대로 한 번만 쓴다"가 효과적이었다는 사례 https://gh.r-mj.com/jsgrrchg/NeverWrite/pull/173 .
- 결론: 문서로는 판정 불가. 검증용 최소 터미널 태스크에서 실측(한글 조합·확정·Backspace, TUI 그리기, 리사이즈).

## 5. `claude --resume`

찾은 것
- `--resume`/`-r`: 세션 ID 또는 이름으로 이어 가고, ID를 주면 현재 프로젝트 폴더·워크트리, 그다음 이 PC의 모든 프로젝트를 찾는다(v2.1.223 이전은 현재 프로젝트만). ID 자리에 `.jsonl` 절대 경로도 가능. `--fork-session`으로 새 id 생성. — https://code.claude.com/docs/en/cli-reference
- `--session-id`는 "유효한 UUID여야" 한다(같은 페이지). 세션 id는 로그 파일명(`<uuid>.jsonl`)과 같은 UUID 형식 — 코드베이스 테스트 픽스처가 `11111111-2222-3333-4444-555555555555.jsonl` 형태(src-tauri/src/lib.rs 테스트).
- 설계: id는 8-4-4-4-12 hex로 검증한 뒤 `["--resume", id]` 인자 배열로만 전달. 이름·경로 형태 입력은 받지 않는다. 이어 가는 폴더(cwd)는 세션의 cwd와 맞아야 같은 프로젝트에서 찾으므로 Rust가 `store.get(id).cwd`로 정한다.

## 6. 코드베이스: 사이드카 위치 전부

삭제 대상
- `sidecar/chat.mjs`, `sidecar/core.mjs`, `sidecar/core.test.mjs`
- `src-tauri/src/chat.rs` (전체; 단 아래 "재사용" 함수는 옮겨야 함)
- `src/Chat.tsx`, `src/Chat.css`; `src/App.tsx:6`(import)·`:226`(`<Chat session={cur} pickSeq={pickSeq} />`)·`:86`(`pickSeq` 상태, Chat 전용인지 확인)
- `src-tauri/src/lib.rs`: `mod chat;`(1행), `AppState.chat`(23행), 커맨드 `chat_send`·`chat_open_folder`·`chat_permit`·`chat_answer`·`chat_interrupt`·`chat_reset`(115~157행), `generate_handler!` 등록(238~243행), `AppState{… chat: chat::Chat::default()}`(227행), 종료 훅 `RunEvent::Exit → chat.stop()`(247~251행; 터미널 자식 정리로 대체), `use std::collections::HashMap`(11행, chat_answer 전용인지 확인)
- `package.json:13` `@anthropic-ai/claude-agent-sdk` 0.3.325 → 제거, `package-lock.json`에 SDK와 플랫폼별 optional 패키지 9개(darwin/linux/win32 …) 함께 정리
- `src/App.css:62`(`.chat` 격자 칸 — 터미널이 이어 씀), `:149` 주석(Chat.css·`.tag` 참조; `.tag`가 다른 곳에서 쓰이는지 확인)
- `design/tokens.json:93` `"chat"` 키, `design/reference/layout_v4.html`(채팅 CSS·마크업·상태 변형 다수; 참조 시안이라 Designer가 터미널로 갱신할지 판단)
- 문서: `SPEC.md`(53~78, 153행 ⑥ 사이드카 서술), `ROADMAP.md:9`(⑥ 줄), `ROADMAP.md:22`(폴더 열기 줄 → [x]로), `CHANGELOG.md:5-6`, `docs/solutions/chat-sidecar.md`

없는 것(확인함)
- `tauri.conf.json`의 `beforeDevCommand`는 `npm run dev`, `beforeBuildCommand`는 `npm run build` 뿐 — **사이드카 준비 단계는 없다**. `package.json` scripts(`dev`/`build`/`preview`/`tauri`)에도 없음. 요청문의 "dev·빌드 스크립트의 사이드카 준비 단계"는 해당 없음으로 보인다(plan-checker 재확인).
- `src-tauri/capabilities/default.json`은 `core:default`, `opener:default`만. 사이드카·dialog용 권한 항목 없음(dialog는 Rust에서만 호출). 삭제할 capability 없음. **새 터미널 커맨드는 앱 자체 커맨드라 capability 항목이 필요 없다**(Channel 사용도 `core:default` 범위; 정확한 확인은 첫 실행에서).
- `src-tauri/Cargo.toml`: `tauri-plugin-dialog`는 폴더 열기가 쓰므로 유지. 새로 `portable-pty = "0.9"` 추가. `serde_json`·`getrandom`은 다른 모듈 사용 여부를 engineer가 확인.
- `harness/`·`.gitignore`·vite·tsconfig에는 사이드카 참조 없음(grep).

재사용할 폴더 열기 코드
- `chat.rs:133` `pub fn check_cwd(cwd:&str)->Result<(),String>`(비어 있지 않음·`roadmap::local_abs`·`is_dir`), `chat.rs:147` `pub fn strip_verbatim_disk(&str)->&str`(`\\?\X:\`만 벗김, UNC 유지), 둘의 테스트(`chat.rs` 295·316행 부근). chat.rs를 지우기 전에 다른 모듈(예: `term.rs` 또는 `roadmap`)로 옮겨야 한다.
- `lib.rs:121-134` `chat_open_folder`: `app.dialog().file().blocking_pick_folder()` → `into_path` → `strip_verbatim_disk` → `check_cwd` → `state.chat.stop()` → `state.chat.set_picked(s)` → 폴더 **이름만** 반환. `Chat.picked`(Mutex<Option<String>>, `chat.rs:21·25·29`)는 터미널 상태로 옮겨 재사용.
- 프론트: `src/Chat.tsx:225` `invoke<string|null>("chat_open_folder")`(폴더 열기 버튼), `:208` 세션 cwd vs 고른 폴더 분기(`folder ? "" : session?.id`). 해당 패턴이 새 터미널 시작 로직의 기준.
- 교훈 문서: `docs/solutions/tauri-folder-dialog.md`(Rust 안에서 dialog, 경로는 웹뷰로 안 나감, capability 0개).
- 종료 처리 참고: 기존 `stop()`은 Windows에서 `taskkill /T /F`로 트리 종료 후 `child.wait()`. ConPTY 자식(claude.exe가 하위 프로세스를 띄움)에도 같은 필요가 있을 수 있음 — 이번에 portable-pty `kill`이 트리를 죽이는지 확인 못 함(미확인).

## 확인하지 못한 것
- WebView2에서 xterm 6.0 한글 조합·claude TUI 렌더링(실측 대상).
- 운영(빌드) CSP `style-src 'self'`에서 xterm 동작, xterm 6.0이 nonce/인라인 스타일을 어떻게 다루는지.
- Windows ConPTY reader EOF 시점, portable-pty `kill()`이 자식 트리를 끝내는지.
- 바이너리 청크를 Channel로 보내는 최적 방식(문자열 vs Raw).
- xterm 기본 사용법(React effect 패턴)의 최신 공식 예제 링크.
- Windows에서 `claude` 찾기: 네이티브(`~\.local\bin\claude.exe`)는 PATH로 찾으면 되나, npm 설치(`claude.cmd`)만 있는 PC는 portable-pty가 직접 못 띄울 수 있음.

## 설계에 미치는 영향
1. PTY 출력은 Tauri **Channel**, 입력·리사이즈는 인자 없는 실행 정보의 커맨드 2개. 시작 커맨드는 "폴더 열기"(고른 폴더) 또는 "세션 id"(Rust가 store에서 cwd 조회)만 받고, 실행 파일·인자는 Rust 상수·검증된 UUID로 구성. 웹뷰가 임의 명령·경로를 보내는 커맨드 없음.
2. 실행 파일은 `claude`를 PATH에서 찾되(`search_path` 한계), 못 찾으면 한국어 오류 한 줄. `.cmd`만 있는 환경은 첫 태스크에서 실패 메시지가 나오는지 확인하고, 지원하려면 `cmd.exe /c claude …` 경유가 필요하나 인자 인용 위험이 커 이번엔 범위 밖을 권장(Lead 결정).
3. 첫 태스크(검증용 최소 터미널)에서 반드시 볼 것: 한글 조합·확정·지우기, 조합 종료 키 중복, TUI 깨짐, 리사이즈, 운영 빌드에서 CSP, 창 닫을 때 claude 프로세스 정리. 실패 시 사이드카 삭제 전에 멈춤.
4. `check_cwd`·`strip_verbatim_disk`·`picked`는 `chat.rs` 삭제 전에 이동 필요(테스트 포함). 삭제 호출부 목록은 6절.
5. 사이드카 준비 스크립트·capability는 없음 — 삭제 태스크 범위가 요청문보다 작다. 대신 `package-lock.json` 정리와 문서(SPEC·ROADMAP·CHANGELOG·solutions·layout_v4·tokens) 갱신이 많다.
6. 핫패스: 읽기 스레드에서 청크를 모아(UTF-8 경계 유지) Channel로 보내고 xterm에는 순서대로 `write`. 백프레셔 없으면 메모리가 늘 수 있어 상한 필요(reviewer-performance).
