# PLAN — 20261115-terminal (채팅 → 앱 내장 터미널)

## 변경 이력

- 2회차(PLAN_CHECK 1회차 FAIL 반영): **B1** — 해결 (가) 채택: `Terminal.tsx` 마운트 시·언마운트 cleanup에서 `term_stop`, 마운트 stop이 끝날 때까지 시작 버튼 비활성(설계 요지 4·인터페이스 `term_stop`·T1b). Channel `send` 실패는 무시하고 읽기 스레드는 EOF까지 계속 비운다(설계 요지 1·T1a). (나)는 출력이 없으면 발동하지 않고 재로드 뒤 send 실패 여부도 미확인이라 단독으로는 부족해 넣지 않음. 검증 M15(dev 새로고침 → 다시 시작 가능, 이전 claude 0). **DECISIONS 8** — `TERM=xterm-256color` Rust 상수를 T1a에 넣음(설계 요지 3·R4·M13), `picked` 삭제 승인 표기(설계 요지 5), `CLAUDECODE`는 QA `env -u`로만(R6). **W2** — 기본 PTY 크기 80x24, "실행 중 거부" 확인·설정을 한 lock 안에서(설계 요지 3·T1a 테스트). **W4** — T1c 사전 조건(claude 로그인·`~/.local/bin/claude` 존재). **W1** — T1b는 `<Chat>`을 지우지 않고 `<div hidden>`으로 감싸기만, `<Chat>`·`pickSeq`·`.chat` 제거는 T3로(T1b·T3·R1). W3·W5·W6은 위험 절 R12~R14에 기록만.

기준: BRIEF.md(승인), DESIGN.md(승인), DECISIONS.md 1~8. **주 플랫폼 macOS**(DECISIONS 5·6: build부터 맥). Windows(ConPTY)는 지원을 유지하되 분기는 실행 파일 이름·트리 종료 두 곳뿐이다.

## 목표

Orbit 아래 넓은 칸에서 진짜 `claude` CLI를 띄워(폴더 열기 / 새로 시작 / 이어 가기) 쓰고, 그 세션을 기존 로그 감시·훅이 그래프로 보여 준다. 웹뷰는 실행 파일·인자·경로·환경을 정하지 못한다. 태스크 1 실측(TUI·한글 IME·CSP)이 PASS일 때만 사이드카를 지운다.

## 설계 요지

1. **Rust `src-tauri/src/term.rs` 하나가 PTY를 맡는다.** `portable-pty` `native_pty_system().openpty(size)` → `CommandBuilder::new(<찾은 claude 절대 경로>)` + `cwd` + 상수 인자 → `spawn_command`. 출력은 읽기 스레드가 16 KiB씩 읽어 UTF-8 경계까지만 잘라(`take_utf8`, 남는 꼬리 ≤3바이트) **Tauri Channel**로 순서대로 보낸다. 대기 스레드가 `child.wait()` 뒤 자기 epoch의 Proc을 꺼내 master·writer를 drop → 읽기 스레드가 EOF로 끝나며 **마지막에** `Exit`를 보낸다(데이터 → Exit 순서가 한 스레드에서 보장). Channel `send` 오류(웹뷰 재로드 등으로 받는 쪽이 사라짐)는 무시(`let _ =`)하고 읽기는 EOF까지 계속한다 — 멈추면 PTY 버퍼가 차서 claude가 쓰기에서 막힌다. 남은 claude 정리는 프론트 마운트 때의 `term_stop`이 맡는다(설계 요지 4).
2. **실행 파일은 Rust가 찾는다(맥 GUI 앱은 셸 PATH를 못 받음).** 후보 폴더 = 앱 프로세스 PATH 중 **절대 경로만**(상대 항목 `.` 등은 cwd=신뢰 불가 폴더를 가리키므로 버림) → `~/.local/bin`(네이티브 설치기) → macOS만 `/opt/homebrew/bin`, `/usr/local/bin`. 이름은 상수 `claude`(Windows `claude.exe`, `.cmd`는 범위 밖). 첫 `is_file()`을 절대 경로로 넘긴다. 없으면 `NOT_FOUND` 한국어 한 줄.
3. **커맨드 6개, 웹뷰가 보내는 값은 id·데이터·숫자뿐.** 인자 배열은 `[]` 또는 `["--resume", <검증된 id>]`. cols·rows는 시작 커맨드 인자가 아니라 `term_resize`가 저장해 둔 크기로 PTY를 연다(시작 전 프론트가 fit → resize 먼저 호출). resize가 한 번도 없었으면 기본 **80x24**(`Term` 초기값). 실행 중 재시작은 거부(DECISIONS 2): `start`는 `Mutex<Term>` lock 하나를 잡은 채 "proc 있음 → Err" 확인과 spawn·`proc` 설정을 끝낸다(두 시작 요청 경합 방지). 자식 환경에 Rust 상수 `TERM=xterm-256color` 하나만 넣는다(DECISIONS 8 — 터미널 종류, 색 설정 아님. Finder 실행 시 TERM 부재 대비). 그 밖의 환경은 앱 프로세스 것을 그대로 물려준다. 앱 종료(`RunEvent::Exit`)·`종료` 버튼 → `stop()`: 트리 종료(Windows `taskkill /PID <pid> /T /F`, unix `/bin/kill -TERM -- -<pid>` — portable-pty가 setsid하므로 pid=pgid, 미확인·실측) → `killer.kill()` → master·writer drop. 새 Cargo 의존성은 `portable-pty` 하나(libc 직접 의존 금지 → `/bin/kill`).
4. **프론트 `src/Terminal.tsx`**: xterm 6 + addon-fit, DESIGN 상태표·토큰·a11y 그대로. 입력은 `onData`를 **promise 체인으로 직렬화**해 `term_write`(async 커맨드 동시 실행에 의한 키 순서 뒤바뀜 방지). 시작마다 새 `Channel`, 이전 Channel 메시지는 세대 번호로 버림. 오류는 DOM 텍스트 줄(`.term-err`), xterm에 프론트가 쓰는 글은 종료 상수 한 줄뿐. **재로드 복구(B1)**: 마운트 effect가 먼저 `term_stop`을 부르고(웹뷰 새로고침·HMR 뒤 Rust에 남은 claude 정리), 그 promise가 끝날 때까지 시작 버튼은 비활성(stop이 새 시작보다 늦게 도착하는 경합 방지). cleanup(언마운트)도 `term_stop`. StrictMode의 dev 이중 마운트에서도 시작 전이라 무해.
5. `Chat.picked`는 옮기지 않는다: 폴더 열기가 고른 즉시 실행하므로 "고른 폴더 기억"이 필요 없다(BRIEF 10의 "picked 이동"을 삭제로 대체 — **DECISIONS 8에서 사용자 승인**).

### 인터페이스 (스키마 변경)

| 커맨드 (JS 이름 / 인자) | Rust | 동작 |
|---|---|---|
| `term_open_folder` `{ onOut }` | `(app, state, on_out: Channel<TermOut>) -> Result<Option<String>,String>` | 실행 중이면 Err → Rust 폴더 창 → 취소 `None` → `strip_verbatim_disk`→`check_cwd` → 인자 없이 시작 → 폴더 **이름**만 반환 |
| `term_new` `{ id, onOut }` (T2) | `(state, id: String, on_out) -> Result<(),String>` | `session_cwd(store,id)` → 인자 없이 시작 |
| `term_resume` `{ id, onOut }` (T2) | 같음 | `session_cwd` → `["--resume", id]` |
| `term_write` `{ data }` | `(state, data: String) -> Result<(),String>` | PTY에 바이트 쓰기만. 없으면 Err |
| `term_resize` `{ cols, rows }` | `(state, cols: u16, rows: u16) -> Result<(),String>` | 0이면 Err, 크기 저장 + 실행 중이면 `master.resize` |
| `term_stop` `{}` | `(state)` | `stop()`, 여러 번 불러도 됨. 종료 버튼 + `Terminal` 마운트·언마운트 때 호출(B1) |

`TermOut` = `#[serde(tag="t", rename_all="lowercase")] enum { Data { d: String }, Exit }` → JS `{t:"data",d}` / `{t:"exit"}`.
`session_cwd`: `valid_id`(36자, 8-4-4-4-12, 하이픈 위치 외 ASCII hex, 대소문자 허용, 공백·기타 거부) 실패 → "세션 id 형식이 아닙니다" / store에 없음 → "세션을 찾을 수 없습니다" / cwd 없음·검증 실패 → `check_cwd` 사유.
capability 변경 없음(앱 커맨드·Channel은 `core:default`).

## 태스크 표

담당: E=orbit:engineer, Q=orbit:qa, L=orbit:librarian, U=사용자. 모델 호출은 T1c·엔지니어 확인 모두 0회(입력만 치고 Enter 안 누름).

| id | 할 일 | 파일 | 검증 방법 (명령 → 기대) | 웨이브 | 의존 | 담당 |
|---|---|---|---|---|---|---|
| T1a | **최소 터미널 Rust.** `portable-pty = "0.9"` 추가. `term.rs` 신설: 상수 `CLAUDE`·`NOT_FOUND`, `claude_dirs()`·`find_in(dirs)`(절대 경로 폴더만), `take_utf8(&mut Vec<u8>)->String`, `TermOut`, `Term{proc, epoch, size}` + `start(exe: Option<PathBuf>, cwd, args, on_out: impl FnMut(TermOut)+Send)`(cwd 검사는 이 단계에서 `crate::chat::check_cwd` 호출 — chat.rs는 수정 안 함), `write`, `resize`, `stop`(설계 요지 3, 플랫폼 분기 `#[cfg(windows)]`/`#[cfg(unix)]` 한 곳). `Term` 초기 크기 80x24, `start`는 lock 하나 안에서 실행 중 확인 → spawn → `proc` 설정(W2). `CommandBuilder`에 `env("TERM", "xterm-256color")` 상수 한 줄(DECISIONS 8). `lib.rs`: `mod term;`, `AppState.term`, `term_open_folder`·`term_write`·`term_resize`·`term_stop` 등록, Channel 넘기는 클로저는 `let _ = on_out.send(m)`(실패 무시, 설계 요지 1), `RunEvent::Exit`에 `term.stop()` 추가(`chat.stop()`은 그대로). **먼저 실패할 테스트**: take_utf8(한글 3바이트를 1·2바이트째에서 자름 → 꼬리 보존, 다음 청크에서 완성 / `\xff` → U+FFFD / 빈 입력), find_in(절대 폴더의 파일 찾음 / 상대 폴더 무시 / 없으면 None), start(exe None → `NOT_FOUND`, 빈·상대·없는 cwd → Err, 둘 다 실행 상태 없음), write 실행 없음 Err, stop 두 번, resize 0 Err, 기본 크기(`Term::default()` 크기 = cols 80·rows 24), resize(100,30) 실행 없이 → Ok·저장된 크기 100x30 | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/term.rs`(새), `src-tauri/src/lib.rs` | `cd src-tauri && cargo test` → exit 0, 위 테스트 이름 목록에 있고 ok. `cargo build` → exit 0 | 1 | — | E |
| T1b | **최소 터미널 프론트.** `npm install @xterm/xterm@^6 @xterm/addon-fit@^0.11`. `Terminal.tsx` 신설: DESIGN 2~4절(머리 줄 버튼 4개 — 이 단계에서 `새로 시작`·`이어 가기`는 항상 disabled, `폴더 열기`·`종료` 동작), 첫 시작 때 xterm 생성(DESIGN 3절 옵션·테마 hex 4개), `import "@xterm/xterm/css/xterm.css"`, 시작 순서 fit → `term_resize` → `term_open_folder({onOut})`, ResizeObserver→fit→`onResize`→`term_resize`, `onData` 직렬 체인 → `term_write`, `exit` → 상수 종료 줄·`disableStdin`·포커스 이동, F6/Shift+F6 탈출, `say()` sr 알림, 오류 DOM 줄. 재시작 시 `reset()`. **B1**: 마운트 effect에서 `term_stop` → 끝나면 시작 버튼 활성(그 전엔 비활성), cleanup에서 `term_stop`. `Terminal.css` = layout_v4.html 212~223행 블록(`.term-screen`·`.d`·`.k` 제외). `App.css`: 62행 아래에 `.terminal { grid-column: 1 / 3; grid-row: 3; }` **추가**(`.chat` 규칙은 남김, 삭제는 T3), `.btn[aria-disabled="true"]` 규칙을 Chat.css에서 복사(삭제는 T3). `App.tsx`: Chat import·`pickSeq`·`<Chat>`은 **그대로 두고** `<Chat … />`을 `<div hidden>…</div>`로 감싼 뒤(주석 "T3에서 삭제 — IME FAIL 시 사이드카 유지 선택지") 그 앞에 `<Terminal session={cur} />` 추가(W1: 멈춤 지점 FAIL 시 사이드카 복귀가 이 두 줄 되돌림으로 끝남. Chat은 마운트 때 listen만 해 숨겨도 부작용 없음) | `package.json`, `package-lock.json`, `src/Terminal.tsx`(새), `src/Terminal.css`(새), `src/App.tsx`, `src/App.css` | `npm run build` → exit 0. `git grep -n dangerouslySetInnerHTML -- src` → 0건. `git grep -n "\.write(" -- src/Terminal.tsx` → Channel data와 종료 상수 2곳뿐. `git grep -n "term_stop" -- src/Terminal.tsx` → 마운트·cleanup·종료 버튼 3곳 이상. `git grep -n "<Chat" -- src/App.tsx` → 1건(남아 있음) | 1 | — (T1a 인터페이스 표를 계약으로) | E |
| T1c | **멈춤 지점 실측(맥).** **사전 조건(W4, 먼저 확인·기록)**: `ls -l ~/.local/bin/claude` → 존재, 맥 터미널에서 `claude` 실행 시 로그인 화면이 아니라 입력 상자가 뜸(로그인 안 돼 있으면 사용자에게 로그인 요청 후 시작 — 호출 예산 낭비 방지). 아래 "맥 실측 항목" M1~M15를 수행해 `RUN_DIR/T1_CHECK.md`에 항목별 PASS/FAIL·스크린샷 경로·`ps` 출력 기록. 사용자는 M5 한글 입력(1분)과 `/theme` → "Light mode (ANSI colors only)" 1회 설정(DECISIONS 7). **멈춤**: M3(TUI 쓸 수 없게 깨짐) 또는 M5(한글 조합 실패) FAIL → Lead는 W3로 가지 않고 증상·스크린샷을 붙여 사용자에게 묻는다. M10 CSP 위반 → T1d 실행(멈춤 아님). M12·M13(Finder 실행 시 PATH·TERM) 문제 → Lead가 사용자에게 결정 요청(위험 R4) | `RUN_DIR/T1_CHECK.md`(코드 변경 없음) | 산출물에 사전 조건 결과와 M1~M15 각 판정과 증거. 모델 호출 0회 | 2 | T1a, T1b | Q + U, 판정 Lead |
| T1d | **(조건부: M10 위반 시만)** 운영 `csp`의 `style-src 'self'` → `style-src 'self' 'unsafe-inline'`. 다른 지시어·`devCsp` 불변. Security가 SECURITY.md에 근거 기록 | `src-tauri/tauri.conf.json` | `git diff main -- src-tauri/tauri.conf.json` → 그 한 토큰만. M10 다시 실행 → 콘솔 위반 0 | 3 | T1c PASS | E |
| T2 | **Rust 완성 + 사이드카 Rust 삭제.** `check_cwd`·`strip_verbatim_disk`와 그 테스트 2개를 `chat.rs`에서 `term.rs`로 그대로 옮김(오류 문구 유지, 주석 "사이드카"→"claude"). `valid_id`, `args(resume: Option<&str>) -> Vec<&str>`, `session_cwd(&Store, id)` 추가. `lib.rs`: `term_new`·`term_resume` 추가·등록, `term_open_folder`가 `term::` 함수 사용, `mod chat`·`AppState.chat`·`chat_*` 6개와 등록·`chat.stop()`·`HashMap` import 삭제. `chat.rs` 삭제. **먼저 실패할 테스트**: valid_id(정상 소문자·대문자 OK / 35·37자, `g` 문자, 하이픈 위치 틀림, 앞뒤 공백, `--resume`, `-1111…`, `../x`, `/tmp/a.jsonl`, `a.jsonl`, 빈 문자열 거부), session_cwd(없는 id Err "세션을 찾을 수 없습니다" / 형식 틀린 id Err / `ingest_log`로 tmp cwd 넣은 id Ok / 없는 폴더 cwd Err), args(None → `[]`, Some(id) → `["--resume", id]`), 옮긴 check_cwd·strip 테스트 | `src-tauri/src/term.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/chat.rs`(삭제) | `cd src-tauri && cargo test` → exit 0, `valid_id`·`session_cwd`·`args`·`check_cwd_rejects_bad_and_accepts_dir`·`strip_verbatim_disk_only_strips_drive_paths` 테스트 ok. `git grep -n -E "mod chat\|chat_\|chat::" -- src-tauri/src` → 0건. `git grep -n "fn term_" -- src-tauri/src/lib.rs` → 6개, 인자 표와 일치 | 3 | T1c PASS | E |
| T3 | **프론트 완성 + 사이드카 프론트·npm 삭제.** `Terminal.tsx`: `새로 시작`→`term_new({id, onOut})`, `이어 가기`→`term_resume({id, onOut})`, 상태 글(실행 중·종료됨은 실행 폴더, 시작 전은 고른 세션 `folderName`), aria-label(DESIGN 4절), 빈 칸 문구 2종. `App.tsx`: Chat import·`pickSeq` 상태와 `setPickSeq` onClick 부분·`<div hidden><Chat …/></div>` 삭제(W1로 T1b에서 옮겨 옴). 삭제: `src/Chat.tsx`, `src/Chat.css`, `types.ts`의 `ChatQuestion`·`ChatOut`, `App.css`의 `.chat` 규칙(62행)과 149~150행(`.tag`는 Chat 전용 — `git grep -n "\btag\b" -- src`로 확인), `npm uninstall @anthropic-ai/claude-agent-sdk`(lock의 optional 플랫폼 패키지까지 정리되는지 확인), `git rm -r sidecar` | `src/Terminal.tsx`, `src/App.tsx`, `src/types.ts`, `src/App.css`, `src/Chat.tsx`·`src/Chat.css`(삭제), `package.json`, `package-lock.json`, `sidecar/`(삭제) | `npm run build` → exit 0. 성공 기준 4·5의 grep·diff 명령(아래 매핑) → 기대대로. `git grep -n -E "pickSeq\|<Chat\|\.chat\b" -- src` → 0건. `test -d sidecar` → 없음 | 3 | T1c PASS (T2 인터페이스 표를 계약으로) | E |
| T4 | **문서.** `ROADMAP.md`: 22행 `폴더 열기` 줄 `[x]`, 9행 ⑥ 줄 아래 `- [ ] 앱 내장 터미널 (채팅·사이드카 대체, 이어 가기)` 추가(머지 커밋에서 `[x]`, Lead 몫). `SPEC.md` 53~78·153행 ⑥ 서술을 터미널로 최소 수정. `CHANGELOG.md` 항목 1개(맥 주 플랫폼, CSP 결정, 알려진 한계 포함). `docs/solutions/chat-sidecar.md` 맨 위 한 줄 "사이드카는 run 20261115-terminal에서 삭제됨". T1_CHECK의 맥 실측 교훈은 librarian 기본 절차대로 docs/solutions에 남김. 문서 갱신은 **librarian 몫**(engineer는 코드 주석만) | `ROADMAP.md`, `SPEC.md`, `CHANGELOG.md`, `docs/solutions/chat-sidecar.md` (+ 새 solutions 문서 1개 가능) | `git diff main -- ROADMAP.md` → 두 줄 변화뿐. `git grep -n "사이드카" -- SPEC.md` → 역사 서술 외 0건 | 4 | T2, T3, (T1d) | L |

Lead 몫(태스크 아님): `.orbit/decisions.md`에 "18번 사이드카 보안 후속 R1·R2·R4·R5·R6 — 사이드카 삭제로 해소" 기록, 머지 전 사용자 확인, 푸시 금지.

## 성공 기준별 검증 매핑 (QA, 맥 기준)

표 안의 `\|`는 마크다운 이스케이프다. 명령을 칠 때는 `|`로 바꾼다.
앱 실행은 Claude Code 세션 안에서 띄울 경우 중첩 실행 차단 환경변수를 빼고 띄운다: `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT npm run tauri dev`(R6). 빈 폴더는 `/tmp` 심볼릭 링크를 피해 `mkdir ~/orbit-qa-empty-$(date +%s)`.

| # | 방법 · 기대 |
|---|---|
| 1 | `npm run build` → exit 0 |
| 2 | `cd src-tauri && cargo test` → exit 0, T1a·T2의 테스트 이름 목록 첨부 |
| 3 | `node --test harness/hooks/gate.test.mjs` → exit 0 |
| 4 | `git grep -n -E "sidecar/\|chat_send\|chat_open_folder\|chat_permit\|chat_answer\|chat_interrupt\|chat_reset\|claude-agent-sdk\|Chat\.tsx\|mod chat" -- src src-tauri/src package.json package-lock.json src-tauri/tauri.conf.json` → 0줄. `ls sidecar` → 없음 |
| 5 | `git diff main -- package.json` → `@xterm/xterm`·`@xterm/addon-fit` 추가, SDK 제거만. `git diff main -- src-tauri/Cargo.toml` → `portable-pty` 한 줄만 |
| 6 | `git diff main -- src-tauri/capabilities/` → 빈 출력 |
| 7 | `git diff main -- src-tauri/tauri.conf.json` → T1d 미실행이면 빈 출력, 실행했으면 `'unsafe-inline'` 한 토큰 |
| 8 | `git grep -n -A2 "fn term_" -- src-tauri/src/lib.rs` + `term.rs`의 `CLAUDE`·`args` 코드 인용 → 인자 표와 일치(`term_new`는 DECISIONS 2로 추가된 id 하나짜리) |
| 9 | `git grep -n dangerouslySetInnerHTML -- src` → 0. `git grep -n "\.write(" -- src/Terminal.tsx` → 2곳 |
| 10 | `/theme` Light(ANSI) 상태에서 `screencapture` 전체 창 → layout_v4와 칸 위치·이중 테두리 같음, 고정폭, 4명암 외 색 없음 |
| 11 | `폴더 열기` → 폴더 창 뜸(스크린샷), 취소 → 상태 글·터미널 변화 없음 |
| 12 | 빈 폴더 고름 → 신뢰 확인 화면(Enter, 모델 호출 아님) → TUI 입력 상자·테두리 온전(스크린샷) |
| 13 | `/status` → cwd가 고른 폴더(스크린샷) |
| 14 | **본 판정 = 사용자**(T1c M5, DECISIONS 1). QA 회귀: 입력 소스 "2벌식"으로 `osascript -e 'tell application "System Events" to keystroke "dkssudgktpdy qksrkqtmqslek."'` → 입력 줄에 "안녕하세요 반갑습니다." 정확히, Backspace 키 3회 → 한 글자씩 지워짐(스크린샷). 손쉬운 사용 권한이 없어 불가하면 Lead가 사용자에게 1분 재확인 요청하고 VERIFY에 그 사실 기록. CDP는 WKWebView에 없어 쓰지 않음 |
| 15 | 호출 (가): 한글 한 문장 Enter → 응답 후 입력 줄 복귀 |
| 16 | 왼쪽 목록에 그 폴더 이름 세션 정확히 1개, 누르면 그래프에 Lead 노드(스크린샷) |
| 17 | `/exit` → 그 세션 고름 → `이어 가기` → 지난 대화 보임 → 호출 (나) → 맥락 이어 답함, 목록 항목 수 그대로 |
| 18 | 창 크기 2회 변경 → 잘림·겹침 없음, 잔상 있으면 Ctrl+L 후 결과 기록 |
| 19 | `/exit` → `── 종료됨 ──` 줄, 상태 글 `· 종료됨`, 시작 버튼 활성, 다시 시작 됨 |
| 20 | 맥: 실행 전·중·Cmd+Q 후 `ps -axo pid,ppid,pgid,comm \| grep -i claude` 출력 첨부 → 후에 이 앱이 띄운 claude와 같은 pgid 프로세스 0. 창 빨간 단추로 닫기도 1회. (Windows `tasklist`는 R8) |
| 21 | 단위 테스트(`start` exe None → `NOT_FOUND`, `find_in` 없음 → None)로 대체하고 VERIFY에 "재현 대신 단위 테스트" 명시. 가능하면 추가로 `env PATH=/usr/bin:/bin HOME=<빈 임시 폴더>` 로 dev 앱 실행해 오류 줄 확인 |
| 22 | `npm run tauri build -- --debug`로 만든 `.app`을 `open`으로 실행(Finder 환경) → 터미널 그려짐, 우클릭 Inspect 콘솔에 CSP 위반 0. CSP 적용 확인용으로 콘솔에서 `document.head.appendChild(Object.assign(document.createElement('style'),{textContent:'x{}'}))` → T1d 전이면 위반 1건이 떠야 정상(운영 CSP 적용 증거) |

### 모델 호출 예산

- QA: (가) 1회 + (나) 1회 + 재시도 1회 = **최대 3회, 추정 $0.35**. VERIFY에 횟수·금액·근거(`/cost` 출력 또는 세션 로그 usage) 첨부. 상한 도달 시 미검증으로 남기고 Lead 보고.
- T1c·Engineer·Debugger: 0회(입력만, Enter 금지. `/status`·`/theme`·`/exit`·신뢰 확인은 모델 호출 아님). 불가피해도 run 합계 4회·$0.45 초과 금지.

## 맥 실측 항목 (맥에서 이어 받는 Lead용 — T1c에서 전부, 결과는 T1_CHECK.md)

| id | 항목 | 방법 · PASS 조건 |
|---|---|---|
| M1 | 맥 빌드 | `npm ci && npm run build`, `cd src-tauri && cargo test` → 둘 다 exit 0 |
| M2 | 폴더 창 | async 커맨드 안 `blocking_pick_folder`가 맥에서 뜨고 앱이 멈추지 않음, 취소 무변화 |
| M3 | TUI 그리기 | 빈 폴더에서 claude 신뢰 화면·입력 상자·테두리 온전, `/status` cwd 일치(멈춤 조건) |
| M4 | 글꼴 | 고정폭으로 그려지는지(맥엔 Cascadia·Consolas 없어 `monospace`=Courier 대체 예상), 한글 2칸 폭·`lineHeight 1`에서 위아래 잘림 여부. 보기 나쁘면 Designer에 `font.family.mono` 보강(Menlo 등) 요청(R5) |
| M5 | **한글 IME (사용자)** | 2벌식으로 "안녕하세요 반갑습니다." → 자모 분해 없음, 스페이스·마침표에서 마지막 글자 중복 없음, Backspace 한 글자씩. xterm PR #5704(WKWebView composition 이벤트 누락) 증상 여부(멈춤 조건) |
| M6 | 붙여넣기·복사 | Cmd+V가 claude 입력에 들어가는지, 선택 후 Cmd+C. 안 되면 기록(Tauri 기본 Edit 메뉴 의존, 미확인) |
| M7 | F6 탈출 | fn+F6 / F6가 웹뷰에 도달해 버튼으로 나가는지, claude가 F6를 쓰는지(DESIGN 열린 질문 3) |
| M8 | 리사이즈 | 창 크기 변경 → 다시 그려짐, 잔상·Ctrl+L |
| M9 | 종료·트리 | 터미널 안 `!sleep 300 &`(셸 모드, 모델 호출 아님)로 자식 만들고 `ps -axo pid,ppid,pgid,comm` → `종료` 버튼 후, 다시 실행해 Cmd+Q 후, 빨간 단추 닫기 후 각각 claude·sleep 0. `/exit` 시 종료 줄 |
| M10 | 운영 CSP | 기준 22 방법. xterm `<style>` 위반 있으면 T1d |
| M11 | 출력 핫패스 | `!seq 1 200000`(모델 호출 아님) → 순서대로, 한글 섞인 출력(`!printf '가나다%.0s' {1..5000}`) 깨진 글자 없음, 앱 반응 유지 |
| M12 | Finder 실행 시 claude 찾기 | M10의 `.app`에서 폴더 열기 → claude 뜸(`~/.local/bin` 또는 Homebrew 후보로 찾음). 어느 경로인지 기록 |
| M13 | Finder 실행 시 환경 | 그 claude 안에서 `!echo "$TERM \| $PATH \| $LANG"` → TERM이 `xterm-256color`(DECISIONS 8 상수 적용 확인), PATH·LANG 값 기록. 키·그리기가 깨지면 R4로 Lead 보고 |
| M14 | 4명암 | `/theme` Light(ANSI) 설정 후 스크린샷에 다른 색 없음 |
| M15 | 재로드 복구(B1) | dev 앱에서 claude 실행 중 → 웹뷰 새로고침(우클릭 Reload 또는 Cmd+R) → `ps -axo pid,ppid,pgid,comm \| grep -i claude`에 이전 claude 0, 시작 버튼 활성, `폴더 열기`로 다시 시작됨(“이미 실행 중” 오류 없음). `Terminal.tsx`를 저장해 HMR 1회 → 같은 확인 |

Windows 회귀(맥 run에서): `rustup target add x86_64-pc-windows-msvc && cargo check --target x86_64-pc-windows-msvc`(src-tauri) 시도 — 툴체인 문제로 실패하면 "Windows 미검증"으로 VERIFY와 머지 전 사용자 질문에 적는다(R8).

## 위험 · 가정

- R1 **WKWebView 한글 IME**(최대 위험): xterm 6.0은 PR #5704 미병합 — 맥에서 자모 분해 가능. FAIL이면 멈춤. 그때 Lead가 제시할 선택지: (가) xterm 밖 DOM 입력 보조 줄(조합은 일반 textarea, Enter 시 `term_write`), (나) xterm 수정 릴리스 대기, (다) 사이드카 유지 — T1b가 `<Chat>`을 지우지 않으므로 `App.tsx`의 `<div hidden>` 감싸기와 `<Terminal>` 한 줄, `App.css`의 `.terminal` 한 줄을 되돌리면 끝(브랜치 되돌리기 불필요, W1). 미확인.
- R2 portable-pty unix가 setsid로 pid=pgid가 되는지, `kill()`의 신호(SIGHUP/SIGKILL)와 Windows 트리 동작: 미확인 → M9로 실측. pgid가 다르면 `/bin/kill` 대상을 pid로 바꾸고 트리는 master drop의 SIGHUP에 맡긴 뒤 다시 잰다.
- R3 Windows ConPTY에서 master drop 뒤 reader EOF: 미확인(설계는 대기 스레드가 drop). 맥에서는 EIO로 끝남(일반 동작, 미확인).
- R4 Finder로 띄운 앱은 `TERM`·셸 PATH·`LANG`이 없다. claude 실행 파일은 설계 요지 2로 찾지만, 자식 claude의 TERM 부재가 TUI를 망가뜨릴 수 있다. **결정됨(DECISIONS 8)**: Rust 상수 `TERM=xterm-256color` 한 줄을 T1a에 넣는다(DECISIONS 7의 유일한 예외). `LANG` 부재로 인한 문제는 여전히 미확인 — dev는 셸 환경을 물려받아 드러나지 않으므로 M10·M13에서만 보이고, 문제가 있으면 Lead가 사용자에게 묻는다.
- R5 맥 고정폭 글꼴 대체(Courier)와 한글 대체 글꼴(Apple SD Gothic Neo) 높이 — 디자인 토큰 변경은 Designer 몫.
- R6 Claude Code 안에서 띄운 dev 앱은 `CLAUDECODE` 환경변수를 물려받아 claude가 중첩 실행을 거부할 수 있다(미확인). 코드로 지우지 않고 QA 실행 명령에서 `env -u`로 뺀다(DECISIONS 8 확정, 앱 코드 불변). 사용자 일반 실행에는 해당 없음.
- R7 맥 WKWebView는 CDP·tauri-driver가 없어 QA의 클릭 자동화가 약하다: `osascript`(System Events, 손쉬운 사용 권한 필요)·`screencapture`·키보드 Tab 탐색으로 하고, 안 되는 조작은 사용자 확인으로 돌리며 VERIFY에 적는다.
- R8 cfg(windows) 코드(taskkill 분기, `claude.exe`)는 맥에서 컴파일되지 않는다. 분기를 두 곳으로 줄이고 chat.rs의 검증된 taskkill 코드를 그대로 쓴다. Windows 실측은 이번 run에서 미검증일 수 있음.
- R9 출력 버퍼 상한: Rust 쪽은 읽기 16 KiB + 꼬리 3바이트로 고정. xterm 내부 write 큐는 상한 없음(claude 출력 규모에서 수용, M11로 확인). 흐름 제어는 넣지 않음.
- R10 `--resume`이 같은 id 파일에 이어 쓰는지(목록 새 항목 없음): 문서상 `--fork-session`만 새 id를 만든다고 되어 있어 그렇게 가정, 기준 17로 확인.
- R11 `npm run tauri build -- --debug` 앱이 운영 CSP(`csp`)를 쓰고 devtools를 연다는 가정 — 미확인, 기준 22의 `<style>` 주입 확인으로 판별.
- R12 (W3) `onData` 직렬 체인·세대 번호로 이전 Channel 메시지 버림은 단위 테스트가 없다(프론트 테스트 하네스 없음). M11·기준 15 관찰로만 확인하고 VERIFY에 "관찰로만 확인" 명시.
- R13 (W5) 로그에서 온 세션 cwd는 `check_cwd`를 통과해도 임의 로컬 폴더일 수 있고, claude가 그 폴더의 `.claude/` 설정을 읽는다. 방어선은 claude 자체의 폴더 신뢰 확인. Security가 SECURITY.md에 한 줄 기록.
- R14 (W6) `/bin/kill -TERM -- -<pid>`의 맥 동작(`--` 지원, pid=pgid)은 미확인 — M9 실측에 의존(R2와 같은 대처).
- R15 (B1) 웹뷰 재로드 뒤 이전 Channel `send`가 Err를 돌려주는지 그냥 버려지는지는 미확인. 어느 쪽이든 읽기 스레드는 무시하고 계속 비우므로 결과는 같고, 남은 claude는 새 마운트의 `term_stop`이 정리한다(M15). dev에서 `Terminal.tsx` HMR은 cleanup의 `term_stop`으로 실행 중 claude를 끝낸다 — dev 전용 불편으로 수용.
- 가정: Channel·앱 커맨드에 capability 추가 불필요(RESEARCH 6절, 미확인 → 기준 6과 첫 실행에서 확인). xterm React effect 패턴은 공식 예제 링크 미확인.
- 요청받지 않아 뺀 것: 탭·다중 터미널, 흐름 제어, 스크린리더 모드, `.cmd` 지원, 색 환경변수, `picked` 상태.
