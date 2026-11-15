# PLAN: 마일스톤 ② 훅 수신 서버 + 훅 설치 도우미

## 변경 이력

- v2 (PLAN_CHECK FAIL 대응, 이 항목들만 바뀜)
  - B1: T5 검증의 "기본 실행(`~\.claude\settings.json` 표시 확인)"을 지움. 앱은 항상 `ORBIT_CLAUDE_SETTINGS`를 임시 사본으로 지정한 같은 명령줄에서 띄우고, 화면 경로가 사본이 아니면 즉시 종료. 기본 경로 표시는 기준 10(사용자 확인)으로 넘김. QA 머리말에 같은 규칙 명시.
  - R1 반영: T5 검증에 `ORBIT_CLAUDE_SETTINGS`가 lib.rs의 `#[cfg(debug_assertions)]` 블록 안 한 곳뿐인지 확인 추가.
  - R2 반영: T5 검증에 사본 대상으로 curl POST 1건 → 타임라인에 한 줄 생기는지(listen 가정 조기 확인) 추가.
  - R3 반영: 위험 R10(tiny_http 단일 스레드의 느린 클라이언트) 추가.

RUN: 20261114-hook-server / TRACK: full / 근거: BRIEF.md, DECISIONS.md(결정 1~9), RESEARCH.md, CLAUDE.md 코드 규칙·보안 체크리스트

## 목표

Orbit 앱이 켜지면 `127.0.0.1:<저장된 포트>`에서 `POST /events`를 받고(토큰·Host·Origin·크기 검사, 빈 본문 응답), 통과한 페이로드를 그대로 프론트에 emit한다. 화면의 "설치"/"제거" 버튼이 전역 `~/.claude/settings.json`에 http 훅 12개를 백업 후 병합·제거한다. Orbit이 꺼져 있으면 http 훅은 연결 거부(비차단 오류)로 끝나 Claude Code는 그대로 돈다.

## 설계 요지

- **Rust 모듈 3개 + 배선.** `server.rs`(tiny_http, 동기 스레드 1개), `hooks.rs`(settings 파일 설치·제거, 순수 파일 함수), `config.rs`(포트·토큰 파일). `lib.rs`가 setup에서 셋을 묶고 Tauri 명령 3개를 등록한다. 각 모듈은 Tauri에 의존하지 않아 `cargo test`로 단독 검증된다.
- **서버 판정 순서**(본문을 읽기 전에 인증): ① `Host`가 `127.0.0.1:<port>` 또는 `localhost:<port>`가 아니면 403 → ② `Origin` 헤더가 있으면 403 → ③ 경로가 `/events`가 아니면 404, 메서드가 POST가 아니면 405 → ④ `X-Orbit-Token`이 없거나 상수 시간 비교로 다르면 401 → ⑤ `Content-Length` > 4 MiB면 413, 읽을 때도 `take(MAX+1)`로 초과 시 413(chunked 대비) → ⑥ JSON 파싱 실패 400 → ⑦ **204(빈 본문) 응답 후** `on_event(Value)` 호출. 모든 응답은 `tiny_http::Response::empty(code)`(본문 없음). 요청 헤더·토큰은 어디에도 출력하지 않는다.
- **설치 형태**(결정 1·3·4): 12개 이벤트 각각에 matcher 없는 그룹 하나 `{"hooks":[{"type":"http","url":"http://127.0.0.1:<port>/events","headers":{"X-Orbit-Token":"<token>"},"timeout":2}]}`를 추가. `onFailure` 없음. **Orbit 항목 식별 = `type=="http"` 이고 `headers`에 `X-Orbit-Token` 키가 있는 핸들러**(포트가 바뀌어도 찾힘). 설치는 "기존 Orbit 핸들러 제거 → 12개 추가"라 여러 번 눌러도 중복이 없고 포트·토큰이 갱신된다. 제거는 Orbit 핸들러만 빼고, 그 때문에 빈 그룹/빈 이벤트 배열/빈 `hooks` 객체가 되면 그것도 지운다(원본 JSON 복원).
- **파일 안전**: 파일이 있으면 같은 폴더에 `settings.json.orbit-backup-<unix_ms>`로 `fs::copy`(바이트 동일) → `settings.json.orbit-tmp`에 쓰고 `fs::rename`(원자적 교체). 파일 없음 → 부모 폴더 만들고 새로 생성(백업 없음). JSON 깨짐·루트가 객체 아님·`hooks`가 객체 아님·이벤트 값이 배열 아님 → `Err`, 파일·백업·임시 파일 모두 손대지 않음. 바뀔 것이 없는 제거는 쓰지 않는다. 키 순서 보존을 위해 `serde_json`에 `preserve_order` feature를 켠다.
- **토큰·포트 저장**(결정 6·7): `app_data_dir/hook-server.json` = `{"port":u16,"token":"<64 hex>"}`. 없으면 `getrandom` 32바이트 → 소문자 hex 토큰, `TcpListener::bind("127.0.0.1:0")`로 빈 포트를 얻어 저장(임시 파일 → rename). 있으면 재사용. 깨져 있으면 덮어쓰지 않고 `Err`(화면에 사유). 저장된 포트가 막혀 있으면 서버 시작 실패 사유를 화면에 표시.
- **설치 대상 경로 / QA용 임시 사본**: 기본 `app.path().home_dir()/.claude/settings.json`(Tauri 내장, 새 의존성 없음). **디버그 빌드(`#[cfg(debug_assertions)]`)에서만** 환경변수 `ORBIT_CLAUDE_SETTINGS`가 있으면 그 경로를 대상으로 쓴다. 릴리스 빌드에는 이 분기가 컴파일되지 않는다. 화면에 대상 경로가 그대로 보이므로 QA는 사본을 가리키는지 눈으로 확인한다.
- **프론트**: 기존 4칸 레이아웃 유지. 상단바 상태 줄 = 서버 상태, "상세" 칸 = 설치 영역(경로·설치 여부·버튼·마지막 결과·안내 2줄), "타임라인" 칸 = 최근 200개 이벤트(메모리만). 문자열은 JSX 텍스트로만 렌더(`dangerouslySetInnerHTML` 금지), 페이로드 필드는 `typeof === "string"`일 때만 표시.
- **Tauri capability·CSP 변경 없음**: 앱이 `invoke_handler`로 등록한 명령은 `build.rs`에 app manifest가 없으면 capability 없이 허용되고, `listen`은 `core:default`(→ `core:event:default`)에 포함된다고 본다(**미확인**: 공식 문서로 직접 확인하지 못함. T4/QA에서 invoke·listen이 실제로 동작하는지로 확인. 막히면 `capabilities/default.json`에 해당 권한 한 줄만 추가하는 후속 수정). CSP(`null`)는 이번 범위에서 바꾸지 않는다(위험 R6).

### 인터페이스 (태스크 간 계약 — 이 이름·형태를 그대로 쓴다)

Rust 내부:
```rust
// server.rs
pub const MAX_BODY: u64 = 4 * 1024 * 1024;
pub fn start(port: u16, token: String, on_event: impl Fn(serde_json::Value) + Send + 'static) -> Result<std::net::SocketAddr, String>; // port 0 = 테스트용 임의 포트
// hooks.rs
pub const EVENTS: [&str; 12] = ["SessionStart","UserPromptSubmit","PreToolUse","PostToolUse","SubagentStop","Stop","Notification","SubagentStart","PostToolUseFailure","PermissionRequest","SessionEnd","StopFailure"];
pub fn install(path: &Path, port: u16, token: &str) -> Result<Option<PathBuf>, String>; // Some(백업 경로) | None(새 파일)
pub fn uninstall(path: &Path) -> Result<Option<PathBuf>, String>;                    // Some(백업 경로) | None(지울 것 없음/파일 없음)
pub fn is_installed(path: &Path) -> Result<bool, String>;                             // 파일 없음 = Ok(false)
// config.rs
pub struct Config { pub port: u16, pub token: String } // Serialize, Deserialize
pub fn load_or_create(dir: &Path) -> Result<Config, String>;
```

Tauri 명령(프론트 ↔ Rust). 토큰은 어떤 명령·이벤트로도 프론트에 보내지 않는다.
| 명령 | 반환(JSON) |
|---|---|
| `get_status` | `{ listen_addr: string \| null, server_error: string \| null, settings_path: string, installed: boolean \| null, settings_error: string \| null }` |
| `install_hooks` | 성공: `string \| null`(백업 경로, 새 파일이면 null) / 실패: 오류 문자열(reject) |
| `uninstall_hooks` | 성공: `string \| null`(백업 경로, 지울 것 없으면 null) / 실패: 오류 문자열(reject) |

이벤트: 이름 `"hook-event"`, payload = 받은 JSON 그대로(`serde_json::Value`, 가공·시각 추가 없음). ③·④ 팀의 입력 계약.

### 새 의존성 (사용자 승인 필요)

| 크레이트 | 버전 | 라이선스 | 이유 |
|---|---|---|---|
| `tiny_http` | `0.12` (0.12.0) | MIT OR Apache-2.0 | HTTP/1.1 파싱·chunked·본문 길이 처리를 직접 짜지 않기 위해(결정 9). 동기 API라 tokio 불필요. 연쇄: `ascii`, `chunked_transfer`, `httpdate`, `log` (lock에 새로 추가될 수 있음) |
| `getrandom` | `0.4` (0.4.3) | MIT OR Apache-2.0 | 토큰용 OS 난수. 이미 `Cargo.lock`에 0.4.3이 간접 의존으로 있어 새로 내려받는 코드 없음 |
| (feature) `serde_json` `preserve_order` | 기존 `1` | MIT OR Apache-2.0 | 사용자 settings.json의 키 순서를 바꾸지 않기 위해. `indexmap`을 쓰며 이미 lock에 있음 |

넣지 않는 것: `subtle`(상수 시간 비교는 10줄 직접 구현 + 테스트), `dirs`(Tauri `home_dir()` 사용), `tempfile`(테스트는 `std::env::temp_dir()` + 고유 이름), `chrono`(백업 이름은 unix ms).

## 태스크

모든 Rust 명령은 `C:\Users\lclk1\Projects\orbit\src-tauri`에서 실행. 각 태스크는 **자기 파일만** 고친다. 같은 웨이브의 다른 태스크 파일 때문에 컴파일이 깨지면 고치지 말고 잠시 뒤 다시 실행하고, 계속되면 Lead에게 보고한다.

| id | 할 일 | 파일 경로 | 검증 방법 | 웨이브 | 의존 |
|---|---|---|---|---|---|
| T0 | 뼈대: Cargo.toml에 `tiny_http = "0.12"`, `getrandom = "0.4"` 추가, `serde_json = { version = "1", features = ["preserve_order"] }`로 변경. `lib.rs` 맨 위에 `mod config; mod hooks; mod server;` 추가. 세 파일은 빈 파일(또는 `//! ` 한 줄)로 생성. `run()` 본문은 그대로 | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`(자동), `src-tauri/src/lib.rs`, `src-tauri/src/server.rs`, `src-tauri/src/hooks.rs`, `src-tauri/src/config.rs` | `cargo build` → 0 종료. `cargo tree -i tiny_http`·`cargo tree -i getrandom@0.4.3`에 `orbit`이 직접 의존으로 나옴 | 1 | — |
| T1 | 훅 수신 서버. 위 "서버 판정 순서"와 `start` 시그니처대로 구현: `tiny_http::Server::http(("127.0.0.1", port))`, 스레드 하나에서 `incoming_requests()` 처리, 헤더 비교는 대소문자 무시(`field.equiv`), `fn ct_eq(a:&[u8], b:&[u8]) -> bool`(길이 다르면 false, 같으면 XOR 누적). 응답은 전부 `Response::empty`. 출력·로그에 헤더/토큰 금지. **테스트 먼저**(`#[cfg(test)]`, std `TcpStream`으로 원시 요청을 보내 Host/Origin을 마음대로 지정, `Connection: close`, sink는 `mpsc` 채널): (a) 올바른 토큰+Host → 204, 본문 0바이트, 이벤트 1건이며 보낸 JSON과 같음 (b) `Host: localhost:<port>`도 204 (c) 토큰 없음 → 401, 0건 (d) 틀린 토큰 → 401, 0건 (e) `Origin: http://evil.example` → 403, 0건 (f) `Host: evil.example` → 403 (g) Content-Length가 MAX_BODY+1 → 413, 0건 (h) `GET /events` → 405, `POST /other` → 404 (i) 깨진 JSON → 400, 이어서 정상 요청 → 204(서버 살아 있음) (j) 모르는 필드 `{"hook_event_name":"X","zzz":[1,{"a":null}]}` → 204, 그대로 전달 (k) 반환 주소의 ip가 `127.0.0.1`(`Ipv4Addr::LOCALHOST`)이고 unspecified가 아님 (l) `ct_eq` 단위 | `src-tauri/src/server.rs` | 구현 전 `cargo test server::` 실패 확인 → 구현 후 `cargo test server::` 전부 통과 | 2 | T0 |
| T2 | 설치 도우미. 위 "설치 형태"·"파일 안전"과 `install`/`uninstall`/`is_installed`/`EVENTS` 시그니처대로 구현. JSON 출력은 `to_string_pretty` + 끝 줄바꿈. **테스트 먼저**(임시 폴더 `std::env::temp_dir()/orbit-hooks-test-<고유값>`, 테스트마다 별도 폴더, 끝나면 삭제). 픽스처: `{"model":"x","permissions":{"allow":["Read"]},"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"echo hi"}]}]}}`. (a) 설치 → `model`·`permissions`·기존 PreToolUse command 훅 보존, 12개 이벤트 각각에 Orbit 핸들러 정확히 1개(url·헤더·`timeout:2`·`onFailure` 없음), 백업 파일 바이트 == 원본 바이트 (b) 두 번 설치(두 번째는 다른 포트) → 이벤트마다 Orbit 핸들러 1개, url은 새 포트 (c) 설치 → 제거 → 파싱한 JSON이 원본과 같고 최상위 키 순서도 같음 (d) 파일 없음 → 생성, `Ok(None)`, 12개 항목 존재 (e) 깨진 JSON(`{"hooks": [`) → `Err`, 파일 바이트 그대로, 폴더에 백업·`.orbit-tmp` 파일 없음 (f) `hooks`가 배열인 파일 → `Err`, 파일 그대로 (g) `is_installed`: 설치 전 false, 후 true, 제거 후 false, 파일 없음 false (h) Orbit 항목이 없는 파일에 제거 → `Ok(None)`, 파일 그대로 | `src-tauri/src/hooks.rs` | 구현 전 `cargo test hooks::` 실패 → 구현 후 `cargo test hooks::` 전부 통과 | 2 | T0 |
| T3 | 토큰·포트 파일. `Config`/`load_or_create` 구현(위 "토큰·포트 저장"). `getrandom` 0.4의 채우기 함수 이름은 docs.rs에서 확인(0.3+는 `getrandom::fill`로 알고 있음, **미확인**). **테스트 먼저**: (a) 빈 폴더 → 생성, 토큰 64자 소문자 hex, 포트 ≠ 0 (b) 같은 폴더 다시 → 같은 값 (c) 다른 두 폴더 → 토큰 다름 (d) 깨진 파일 → `Err`, 파일 바이트 그대로 | `src-tauri/src/config.rs` | 구현 전 `cargo test config::` 실패 → 구현 후 통과 | 2 | T0 |
| T4 | 화면. `Panel`에 선택적 `children` 추가(없으면 기존 hint 표시). 시작 시 `invoke("get_status")`, 상단바 `.status` = `listen_addr`이면 "`<addr>`에서 듣는 중", 아니면 "훅 서버 시작 실패: `<server_error>`". "상세 · 하네스" 칸: 대상 경로, 설치 여부(`installed`/`settings_error`), "설치"·"제거" 버튼(`invoke("install_hooks"/"uninstall_hooks")` → 마지막 결과 줄에 "성공 · 백업: `<경로>`"/"성공 (새 파일)"/"제거할 항목 없음"/"오류: `<msg>`", 이후 `get_status` 다시), 안내 두 줄: "토큰이 settings 파일에 평문으로 저장됩니다." / "이벤트가 오지 않으면 settings의 allowedHttpHookUrls·disableAllHooks를 확인하세요." "타임라인" 칸: `listen("hook-event")`로 받은 최근 200개(최신이 위), 줄마다 받은 시각(`toLocaleTimeString`) · `hook_event_name` · `session_id` 앞 8자 · `tool_name`(문자열일 때만). `useEffect` 정리에서 unlisten(StrictMode 이중 실행 대비). 토큰은 다루지 않음. `dangerouslySetInnerHTML` 금지. 필요한 최소 CSS만 | `src/App.tsx`, `src/App.css` | `npm run build` → 0 종료. `Select-String -Path src\App.tsx -Pattern dangerouslySetInnerHTML` → 결과 없음 | 2 | — (계약은 위 인터페이스 표) |
| T5 | 배선. `lib.rs`의 `run()`에서: `.setup`에서 `app.path().app_data_dir()` → `config::load_or_create` → 성공이면 `server::start(cfg.port, cfg.token.clone(), move \|v\| { let _ = handle.emit("hook-event", v); })`. 설치 대상 경로 = `app.path().home_dir()?/.claude/settings.json`, `#[cfg(debug_assertions)]` 블록에서만 `std::env::var_os("ORBIT_CLAUDE_SETTINGS")`로 덮어씀. 상태 `struct AppState { cfg: Result<Config,String>, server: Result<SocketAddr,String>, settings_path: Result<PathBuf,String> }`를 `app.manage`. 명령 3개(`get_status`, `install_hooks`, `uninstall_hooks`)를 인터페이스 표 형태로 구현해 `generate_handler!`에 등록. 설치는 `cfg`가 `Err`면 그 사유로 실패. 기존 `tauri_plugin_opener` 유지. 토큰을 반환·출력하는 경로 없음 | `src-tauri/src/lib.rs` | `cargo build` 0 종료, `cargo test` 전체 통과. `Select-String -Path src\lib.rs -Pattern ORBIT_CLAUDE_SETTINGS` → 1건이고 그 줄이 `#[cfg(debug_assertions)]` 블록 안(R1). 앱 실행은 **반드시** QA 절차 1단계처럼 임시 사본을 만들고 같은 창에서 `$env:ORBIT_CLAUDE_SETTINGS="$d\settings.json"; npm run tauri dev`로만 한다(변수 없이 띄우지 않는다 — 시작 때 `get_status`가 대상 파일을 읽기 때문). → 상세 칸 경로가 `$d\settings.json`이 아니면 즉시 앱 종료·보고. 맞으면 상단바 "127.0.0.1:<port>에서 듣는 중" 확인, 사본에 "설치" → 사본에서 토큰을 변수로만 읽어(QA 6의 `$t`) `curl.exe -s -o NUL -w "%{http_code}" -X POST http://127.0.0.1:<port>/events -H "Host: 127.0.0.1:<port>" -H "X-Orbit-Token: $t" -d '{"hook_event_name":"T5"}'` → 204, 타임라인에 `T5` 한 줄(invoke·listen 가정 R1 조기 확인, R2). 기본 경로(`~\.claude\settings.json`) 표시는 확인하지 않는다(기준 10, 사용자 몫) | 3 | T1, T2, T3, T4 |
| T6 | 문서 정합(librarian). SPEC.md 1단계 데이터 수집 1·2에 이번 확정 결정 반영: http 훅(`type:"http"`, timeout 2초), 전역 설치만, 수신 이벤트 12개, 토큰·포트는 `app_data_dir` 파일(112행 키체인 문구는 "API 키는 ⑥에서 키체인"으로 범위 명시). 결정 내용 외 추가 서술 없음 | `SPEC.md` | `git diff --stat SPEC.md` 1파일만 변경, 위 4항목이 SPEC에 있음(`Select-String SPEC.md -Pattern 'type:"http"','app_data_dir'`) | 3 | — |

웨이브 파일 겹침 확인: W1 = T0 단독. W2 = server.rs / hooks.rs / config.rs / App.tsx·App.css — 서로 다름. W3 = lib.rs / SPEC.md — 서로 다름.

## QA 절차 (BRIEF 4~9, 임시 사본 대상)

에이전트는 실제 `~/.claude/settings.json`과 이 저장소 `.claude/settings.json`을 열거나 고치지 않는다. 앱은 `ORBIT_CLAUDE_SETTINGS`를 사본으로 지정하지 않고는 띄우지 않는다(변수 없이 띄우면 시작 때 실제 파일을 읽는다). (`claude` CLI가 스스로 전역 설정을 로드하는 것은 에이전트의 파일 접근이 아니며 그 파일을 바꾸지 않는다.) 같은 PowerShell 창에서:

1. 사본 준비: `$d="$env:TEMP\orbit-qa"; mkdir $d -Force; Set-Content "$d\settings.json" '{"model":"x","hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"exit 0"}]}]}}'` (실제 설정을 복사하지 않는다). 원본 해시 기록 `Get-FileHash "$d\settings.json"`.
2. `$env:ORBIT_CLAUDE_SETTINGS="$d\settings.json"; npm run tauri dev` (디버그 빌드라 변수가 적용됨). 화면의 대상 경로가 `$d\settings.json`인지 먼저 확인 — 아니면 즉시 중단(기준 4·5).
3. 기준 4: 상단바 주소 확인, 화면 전체에 64자 hex 토큰이 없는지 확인(사본 파일의 토큰 값과 대조는 변수로만, 출력하지 않음).
4. 기준 5: "설치" → 성공·백업 경로 표시, 백업 해시 = 1단계 해시, 사본에 12개 Orbit 항목과 기존 `model`·PreToolUse 훅 존재. "제거" → Orbit 항목만 빠짐. 다시 "설치"해 둔다.
5. 기준 6: 새 창에서 `claude --settings "$d\settings.json" -p "Read the file README.md and tell me its first line"`(Read는 권한 요청이 없음). 화면에 SessionStart · UserPromptSubmit · PreToolUse · PostToolUse · Stop이 같은 session_id 앞 8자로 순서대로 나오는지 기록. `--settings`가 훅을 읽지 않으면 BRIEF 대안(임시 프로젝트 `.claude/settings.local.json`) 사용. PermissionRequest가 권한 판단을 바꾸는지 관찰(결정 3 조건).
6. 기준 7: `curl.exe -s -o NUL -w "%{http_code}" -X POST http://127.0.0.1:<port>/events -H "Host: 127.0.0.1:<port>" -d "{}"` → 401, 틀린 토큰 → 401, 올바른 토큰 + `-H "Origin: http://evil.example"` → 403. 화면 이벤트 수 변화 없음. 올바른 토큰은 `$t=(Get-Content "$d\settings.json" | ConvertFrom-Json).hooks.Stop[0].hooks[0].headers.'X-Orbit-Token'`처럼 변수로만 쓰고 출력하지 않는다.
7. 기준 8: `$t`로 `{"hook_event_name":"<b>x</b>","session_id":"<i>s</i>","tool_name":"<b>x</b>"}` POST → 화면에 `<b>x</b>`가 글자 그대로.
8. 기준 9: 앱 켠 채/끈 채 각각 `Measure-Command { claude --settings "$d\settings.json" -p "say hi" }` 기록, 꺼진 상태에서 오류 없이 완료되는지.
9. 끝나면 `Remove-Item Env:ORBIT_CLAUDE_SETTINGS`, `Remove-Item $d -Recurse`.

## 성공 기준 대응표

| BRIEF 기준 | 덮는 태스크 | 검증 |
|---|---|---|
| 1 cargo test (서버 항목) | T1 | T1 테스트 (a)~(j), `cargo test` |
| 1 cargo test (127.0.0.1 바인딩) | T1 | T1 테스트 (k) |
| 1 cargo test (설치 도우미) | T2 (+T3 토큰·포트) | T2 테스트 (a)~(h), T3 테스트 |
| 2 npm run build | T4 | `npm run build` |
| 3 gate.test 회귀 없음 | (하네스 파일 미변경) | QA: `node --test harness/hooks/gate.test.mjs` |
| 4 서버 상태 표시·토큰 비노출 | T3, T5, T4 | QA 3 |
| 5 화면 설치·제거(사본) | T2, T5(`ORBIT_CLAUDE_SETTINGS`), T4 | QA 2·4 |
| 6 실제 세션 이벤트 도착 | T1, T2(훅 형태), T5(emit), T4(목록) | QA 5 |
| 7 무토큰·틀린 토큰·Origin 거부 | T1 | T1 (c)(d)(e) + QA 6 |
| 8 HTML 문자열 그대로 | T4 | QA 7 |
| 9 Orbit 꺼짐 시 지연·오류 없음 | T2(`timeout:2`, onFailure 없음) | QA 8 |
| 10 사용자 실제 설치 | T5(디버그 변수 없을 때 `~/.claude/settings.json`), T2 | 사용자 확인(에이전트 안 함) |

## 위험·가정

- R1 **미확인**: `core:default`가 `listen`을 허용하고 앱 명령은 capability 없이 invoke된다는 가정. T5/QA에서 실패하면 `capabilities/default.json`에 필요한 권한만 추가(후속 태스크).
- R2 **미확인**: `getrandom` 0.4의 함수 이름(`fill`), `tiny_http` 0.12의 `server_addr()` 반환형(`ListenAddr` → `to_ip()`로 알고 있음). T1·T3 engineer가 docs.rs로 확인.
- R3 **미확인**: `claude -p`에서 SessionStart 등 훅이 모두 실행되는지, `--settings`가 훅을 병합하는지, http 훅 도입 버전. QA 5에서 실측.
- R4 본문 상한 4 MiB는 추정. 더 큰 PostToolUse 페이로드는 413으로 버려지지만 Claude Code에는 비차단 오류일 뿐이다.
- R5 Claude Code가 같은 순간 settings.json을 쓰면 읽기-수정-쓰기 사이에 그 변경을 덮을 수 있다(백업은 남음). 잠금은 넣지 않는다.
- R6 CSP가 `null`인 채로 남는다. 이번 변경은 HTML 삽입을 하지 않아 XSS 표면을 늘리지 않지만, 보안 체크리스트 "CSP 최소" 항목은 별도 run으로 다루길 제안한다.
- R7 제거 시 "원래부터 비어 있던 `hooks: {}`"도 Orbit 제거로 비워졌다고 보고 지운다(구분 불가). 의미상 동일한 설정이다.
- R8 UTF-8 BOM이 있는 settings.json은 깨진 JSON으로 판정되어 오류만 보이고 손대지 않는다.
- R9 W2 병렬 태스크가 같은 crate를 컴파일하므로 한 모듈의 작성 중 오류가 다른 태스크의 `cargo test`를 일시적으로 깨뜨릴 수 있다(태스크 규칙: 남의 파일은 고치지 않고 재실행).
- R10 `tiny_http`를 스레드 하나로 처리하므로, 본문을 천천히 보내는 로컬 클라이언트 하나가 그동안 이후 이벤트 수신을 막을 수 있다. Claude Code 쪽은 `timeout:2`로 풀려 막히지 않고 이벤트 일부만 잃는다. 허용 한계로 두고 이번에는 고치지 않는다.
- 가정: 토큰은 settings 파일에 평문(결정 2), 키체인 아님(결정 7, SPEC 112행과 다름 — T6에서 SPEC 갱신).
