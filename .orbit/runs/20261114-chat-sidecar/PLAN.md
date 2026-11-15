# PLAN: 마일스톤 ⑥ 채팅 입력 + Agent SDK 사이드카 + UI 권한 승인

## 변경 이력

- 0차(초안): 첫 작성.

RUN: 20261114-chat-sidecar / TRACK: full / 브랜치 `orbit/20261114-chat-sidecar`
근거: BRIEF.md(성공 기준 1~19), DECISIONS.md D1~D11(BRIEF보다 우선), DESIGN.md(승인, D11) + `design/reference/layout_v4.html`(채팅 CSS 207~304행, 상단 바 92·340~351행) + `design/tokens.json` `chat.*`(둘 다 작업 트리에서 수정됨, 아직 커밋 안 됨), RESEARCH.md, CLAUDE.md "코드 규칙"·"보안·검증 체크리스트".

## 목표

- 왼쪽에서 세션을 고르고 채팅에 지시를 쓰면, 그 세션의 cwd에서 터미널과 같은 설정으로 Claude Code(SDK 동봉 `claude.exe`)가 새 세션으로 돈다. 답은 `text_delta`마다 늘어나고, 끝에 "완료 · 추정 비용 $…" 줄이 붙는다. 같은 대화에서 다시 보내면 같은 세션으로 이어 간다.
- 권한 요청과 AskUserQuestion은 채팅 안 카드로 답한다(`허용`/`거부`/`이 세션 동안 (…)`, `▶ label`). `중단`은 `interrupt()`이고 대기 카드는 거부로 닫힌다.
- 앱을 닫으면 대기 카드는 거부되고 사이드카(`node.exe`)와 그 아래 `claude.exe`가 끝난다.
- 그래프·세션 목록은 기존 훅 + 로그 감시 경로 그대로다(새 수집 경로 없음). 채팅은 메모리만.
- 상단 바: `액정 폴더` → `게임보이 화면`, 훅이 설치돼 있으면 `제거` 버튼 없이 상태만(D10).
- SPEC.md 화면 6번·실행 엔진 절과 ROADMAP.md ⑥을 맞춘다(librarian).

## 설계 요지

- **프로세스 구조**: 프론트 →(Tauri 명령)→ Rust `chat.rs` →(stdin JSON 줄)→ `node sidecar/chat.mjs` →(SDK `query()`)→ `claude.exe`. 역방향은 stdout JSON 줄 → Rust → Tauri 이벤트 `chat` → 프론트. 사이드카는 포트를 열지 않는다.
- **대화 1개 = 사이드카 프로세스 1개.** 첫 보내기에 Rust가 띄우고 `start`를 쓴다. 앞 답이 끝난 뒤 보내기는 같은 프로세스에 `send`(같은 query의 AsyncIterable에 user 메시지 추가 → 같은 세션). `새 대화`·앱 종료·사이드카 오류는 프로세스를 끝낸다. 그래서 "이 세션 동안" 규칙(사이드카 메모리)은 대화와 함께 저절로 사라진다.
- **사이드카 실행**: Rust `std::process::Command::new("node")`, 인자 하나 = 스크립트 절대 경로 `concat!(env!("CARGO_MANIFEST_DIR"), "/../sidecar/chat.mjs")`(코드 주석 `shortcut: dev 빌드 경로 고정, 설치 파일을 만들 때 resources로 옮긴다`). stdin·stdout은 pipe, stderr는 inherit(dev 콘솔에 진단 줄만), `env`는 손대지 않는다(상속). `cfg(windows)`에서 `CommandExt::creation_flags(0x0800_0000 /*CREATE_NO_WINDOW*/)`. std만 쓰므로 cargo 의존성·Tauri 플러그인 없음.
- **node 없음·버전 미달**: spawn이 `ErrorKind::NotFound`면 Rust가 `Err("Node.js 18.14 이상이 필요합니다 — node를 찾지 못했습니다")`. 버전은 사이드카가 SDK를 **동적 import 하기 전에** `process.versions.node`로 보고 `{"t":"error","message":"Node.js 18.14 이상이 필요합니다 — 지금 v…"}`를 쓰고 끝낸다.
- **query 옵션(고정)**: `prompt`=AsyncIterable(큐), `cwd`, `includePartialMessages:true`, `permissionMode:"default"`, `systemPrompt:{type:"preset",preset:"claude_code"}`, `env:{...process.env}`, `canUseTool`, `stderr:(d)=>process.stderr.write(redact(d))`. `settingSources`·`plugins`·`model`·`resume`·`pathToClaudeCodeExecutable`·`maxBudgetUsd`는 주지 않는다.
- **cwd 신뢰 경계**: `chat_send`는 세션 id만 받는다. cwd는 Rust `Store`에서 꺼내고(`get_roadmap`과 같은 방식), `roadmap.rs`의 드라이브 절대 경로 검사(UNC·장치·상대 거부)를 `pub fn local_abs(&str) -> bool`로 떼어 함께 쓴 뒤 `is_dir()`를 본다. 프론트는 경로를 넘기지 않는다.
- **권한(사이드카 `core.mjs`)**:
  - 허용 = `{behavior:"allow", updatedInput: input}`, 거부 = `{behavior:"deny", message}`. `updatedPermissions`는 절대 넣지 않는다(`suggestions` 무시 → `settings.local.json` 안 생김).
  - "이 세션 동안" 규칙: `Set`에 키 `Bash` → `"Bash\n" + command`(정확히 같은 문자열, command가 문자열이 아니면 규칙 없음), 그 밖 → 도구 이름. 맞으면 카드 없이 allow. `AskUserQuestion`은 규칙을 만들지도 맞추지도 않는다.
  - `signal` abort → deny + `closed`. `interrupt`·`close` → 대기 중 전부 deny + 각각 `closed`.
  - AskUserQuestion 답 = `{behavior:"allow", updatedInput:{questions: input.questions, answers}}`, `answers`는 `{[질문 글]: 문자열}`(다중선택은 `", "`로 합침, 직접 답은 그 글). 화면으로는 `preview`를 빼고 보낸다.
- **스트림 변환**: `stream_event` 중 `content_block_delta`/`text_delta`이고 `parent_tool_use_id`가 null인 것만 `delta`. 완성 `assistant` 메시지의 텍스트는 다시 보내지 않는다(중복 방지). `system/init` → `session`. `result` → 성공(`subtype==="success" && !is_error`)이면 `done{cost: total_cost_usd ?? null}`, 아니면 `error{message}`. 중단 플래그가 켜져 있으면 그 사이 `delta`는 버리고 다음 `result`는 `stopped`로 바꾼다. 모르는 타입은 버린다.
- **비밀값 가리기**: 사이드카 `redact(s)`는 `sk-ant-[\w-]+`, `Bearer\s+\S+`, 그리고 `[A-Za-z0-9_\-.]{40,}` 연속(경로·uuid는 구분자가 있어 안 걸림)을 `[가림]`으로 바꾼다. 적용 대상: `error.message`, SDK stderr, 사이드카 자신의 stderr 진단 줄. 모델 답(`delta`)에는 적용하지 않는다. 사이드카 stderr 진단은 `orbit-sidecar: session <id>`와 오류 종류만 쓰고 env·옵션·입력은 쓰지 않는다. `.credentials.json`·`ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`을 읽는 코드는 없다(`env`는 통째로 넘김).
- **수명**: Rust `stop()` = `{"t":"close"}` 쓰기 → stdin 닫기 → 최대 3초 `try_wait` → 안 끝나면 `cfg(windows)` `taskkill /PID <pid> /T /F`(트리 종료로 `claude.exe`까지), 그 밖 `child.kill()`. 사이드카는 `close` 또는 stdin EOF(Rust가 죽은 경우)에 대기 전부 deny → `q.close()` → `process.exit(0)`. 앱 종료는 `lib.rs`를 `.build(ctx)` + `.run(|app, ev| if let RunEvent::Exit = ev { chat.stop() })`로 바꿔 건다.
- **Rust stdout 읽기**: 스레드 하나가 `pump(BufRead, emit)`로 줄을 읽는다. 줄 상한 1 MiB(넘는 줄은 버림), JSON 객체이고 `t`가 문자열인 줄만 `app.emit("chat", value)`(값은 그대로 통과). EOF면 그 프로세스가 아직 현재 대화(세대 번호 일치)일 때만 `{"t":"exit"}`을 emit하고 상태를 비운다(`새 대화`로 끈 프로세스의 exit는 버림).
- **프론트**: 새 `src/Chat.tsx` + `src/Chat.css`(시안 207~303행 그대로). 상태 표·문구·접근성은 DESIGN 1~4절 그대로. 모든 문자열은 JSX 텍스트(`white-space: pre-wrap`), 마크다운 해석 없음. `App.tsx`는 채팅 칸 자리에 `<Chat session={cur} />`만 둔다.
- **Capability·CSP 변경 없음.** 근거: (1) 프론트는 앱 명령(`generate_handler!`)과 `listen`만 쓴다. 기존 명령 7개와 `session-update` 이벤트가 `core:default`만으로 이미 동작한다(capability 파일에 앱 명령 권한 항목이 없다). (2) 사이드카는 Rust가 std로 띄우므로 `shell:*`가 필요 없다(Tauri capability는 웹뷰→명령 IPC 권한이다. 이 점은 공식 문서로 확인 못함 — "미확인", R2·F2 실행으로 확인). (3) 웹뷰의 새 네트워크 연결이 없어 `connect-src`가 그대로다. 인라인 `style={{}}`는 CSSOM이라 `style-src 'self'`에 걸리지 않는다(⑤ 막대와 같음).
- **상단 바(D10)**: 버튼 글자 `게임보이 화면`, aria-label "게임보이 화면 폴더 열기"(시안 350행). `installed === true`면 버튼 없음, 그 밖은 `설치`(⑤ 규칙 그대로 비활성 조건). Rust `uninstall_hooks` 명령은 남긴다.

## 프로토콜 (고정 — S1·S2·R1·R2·F1이 그대로 맞춘다)

한 줄 = JSON 객체 하나 + `\n`(UTF-8). 키 `t`가 종류. 모르는 `t`·모르는 필드는 받는 쪽이 무시한다. 깨진 줄은 버리고 계속 읽는다.

### Rust → 사이드카 (stdin)

| t | 필드 | 뜻 |
|---|---|---|
| `start` | `cwd: string`, `text: string` | 첫 메시지. query를 연다. 두 번째 `start`는 무시 |
| `send` | `text: string` | 같은 대화 후속 메시지(큐에 user 메시지 추가) |
| `permit` | `id: string`, `decision: "allow"\|"deny"\|"session"` | 권한 카드 답. 모르는 id·값은 무시 |
| `answer` | `id: string`, `answers: {[question: string]: string}` | 질문 카드 답(문자열이 아닌 값은 버림) |
| `interrupt` | — | 대기 전부 deny + `closed`, 중단 플래그 켬, `q.interrupt()` |
| `close` | — | 대기 전부 deny, `q.close()`, 종료. stdin EOF도 같음 |

user 메시지 모양: `{type:"user", message:{role:"user", content:text}, parent_tool_use_id:null}`.

### 사이드카 → Rust (stdout) = Rust → 프론트 이벤트 `chat`의 payload

| t | 필드 | 뜻 |
|---|---|---|
| `session` | `id: string` | init의 `session_id`(프론트는 무시해도 됨) |
| `delta` | `text: string` | 메인 세션 text_delta 조각 |
| `permit` | `id: string`, `tool: string`, `target: string` | 권한 카드. `target` 규칙: Bash=`command`, Edit·Write·Read=`file_path`, NotebookEdit=`notebook_path`(없으면 `file_path`), WebFetch=`url`, 그 밖이나 값이 문자열이 아니면 `JSON.stringify(input)` 300자 + "…" |
| `ask` | `id: string`, `questions: [{question, header, multiSelect: boolean, options:[{label, description}]}]` | 질문 카드(`preview` 없음, 모든 글은 `String()`) |
| `closed` | `id: string` | 그 카드가 중단·abort로 닫힘 → "→ 거부됨 (중단)"/"→ 답하지 않음 (중단)" |
| `done` | `cost: number \| null` | 완료. 프론트 "완료 · 추정 비용 $x.xxxx"(null이면 "완료") |
| `stopped` | — | 중단 뒤 결과 → "중단됨" |
| `error` | `message: string` | 실패(가린 뒤). 사이드카가 query 예외로 죽을 때도 이것을 먼저 쓴다 |
| `exit` | — | **Rust가 만든다**: 현재 대화의 사이드카가 끝남. 실행 중이었으면 프론트가 "✕ 오류: 사이드카가 끝났습니다"를 붙이고 대화를 닫는다(다음 보내기는 새 대화) |

id는 사이드카가 만든 `p1`, `p2`…(요청마다 증가).

### Tauri 명령 (R2가 등록, F1이 부름)

| 이름 | 형태 | 동작 |
|---|---|---|
| `chat_send` | `(session: string, text: string) -> Result<(), string>` | 사이드카 없음 → Store에서 cwd 꺼내 검사 → spawn → `start`. 있음 → `send`(session 무시, 폴더 고정) |
| `chat_permit` | `(id: string, decision: string) -> Result<(), string>` | decision이 allow·deny·session이 아니면 Err |
| `chat_answer` | `(id: string, answers: Record<string,string>) -> Result<(), string>` | `HashMap<String,String>` |
| `chat_interrupt` | `() -> Result<(), string>` | `interrupt` 쓰기 |
| `chat_reset` | `() -> ()` | `stop()` (`새 대화`) |

프론트 `src/types.ts`(추가):
```ts
export type ChatQuestion = { question: string; header: string; multiSelect: boolean; options: { label: string; description: string }[] };
export type ChatOut =
  | { t: "session"; id: string } | { t: "delta"; text: string }
  | { t: "permit"; id: string; tool: string; target: string }
  | { t: "ask"; id: string; questions: ChatQuestion[] } | { t: "closed"; id: string }
  | { t: "done"; cost: number | null } | { t: "stopped" } | { t: "error"; message: string } | { t: "exit" };
```

Rust `src-tauri/src/chat.rs`(새, 공개 면):
```rust
pub const MAX_LINE: usize = 1024 * 1024;
#[derive(Default)] pub struct Chat { /* Mutex<Option<Proc{child, stdin, gen}>>, AtomicU64 gen */ }
impl Chat {
    pub fn send(&self, app: &tauri::AppHandle, cwd: Option<String>, text: &str) -> Result<(), String>;
    pub fn write(&self, msg: &serde_json::Value) -> Result<(), String>; // 사이드카 없으면 Err("대화가 없습니다")
    pub fn stop(&self);
}
pub fn parse_line(b: &[u8]) -> Option<serde_json::Value>;           // 객체 + t 문자열만
pub fn pump<R: std::io::BufRead>(r: R, emit: impl FnMut(serde_json::Value)); // MAX_LINE 초과 줄 버림
```
`roadmap.rs`: `pub fn local_abs(cwd: &str) -> bool`(기존 `for_cwd` 안의 검사를 옮김, `for_cwd`는 이것을 부름).

사이드카 `sidecar/core.mjs`(새, 순수 함수 — 테스트 대상):
```js
export function parseLine(line)            // 객체 아니면·깨지면 null
export function redact(s)
export function target(tool, input)
export function fromSdk(msg, st)           // st = {interrupting:boolean}; 프로토콜 객체 배열 반환
export function createPermits(emit)        // {canUseTool, permit(id, decision), answer(id, answers), denyAll(reason)}
```

## 새 의존성

| 무엇 | 어디 | 근거 |
|---|---|---|
| `@anthropic-ai/claude-agent-sdk` 정확한 버전(RESEARCH 기준 0.3.325, N1에서 `npm view`로 다시 확인해 `--save-exact`) | 루트 `package.json` `dependencies` | D5 |
| peer `zod ^4`, `@anthropic-ai/sdk >=0.93.0`, `@modelcontextprotocol/sdk ^1.29.0` | **package.json에 넣지 않는 것이 기본.** npm 7+가 필수 peer를 자동 설치해 `package-lock.json`에만 남는다. N1이 `npm ls`에 missing/invalid peer가 있거나 SDK import가 실패할 때만 그 peer를 package.json에 추가한다(peer가 실제로 필요한지는 미확인) | D5 "peer뿐" |
| `@anthropic-ai/claude-agent-sdk-win32-x64`(`claude.exe`) | SDK의 optionalDependencies로 lock에만 | D5 동봉본 |

Cargo 의존성·feature, Tauri 플러그인, capability, CSP·asset scope, 프론트 테스트 러너: **추가 없음**. 사이드카 테스트는 `node --test`(내장).

## 태스크

공통 규칙:
- Rust 명령은 `C:\Users\lclk1\Projects\orbit\src-tauri`에서, npm은 `npm.cmd`로 실행한다.
- 각 태스크는 표에 적힌 자기 파일만 고친다.
- `#[cfg(test)]` 밖에서 `unwrap(`·`expect(`·`println!`·`eprintln!`·`dbg!` 금지(`unwrap_or*` 허용, `lib.rs` 기존 `.expect("error while running tauri application")` 한 줄은 예외).
- 실제 `~/.claude`는 열지 않는다(V1의 `[호출]` 단계만 예외, 아래 검증 분담).
- 커밋은 태스크마다 자기 파일만 `git add <경로>` + `git commit -F C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-chat-sidecar\tasks\<id>\COMMIT_MSG.txt`.
- "테스트 먼저" 태스크는 구현 전 실패 출력과 구현 후 통과 출력을 `tasks/<id>/SUMMARY.md`에 붙인다.

| id | 할 일 | 파일 경로 | 검증 방법 | 웨이브 | 의존 |
|---|---|---|---|---|---|
| D1 | **Designer 산출물 커밋** (engineer). 작업 트리의 `layout_v4.html`·`tokens.json`을 내용 그대로 커밋 | `design/reference/layout_v4.html`, `design/tokens.json` | 커밋 전 `git status --short design/` → ` M` 두 줄. 커밋 후 빈 출력. `git show --stat HEAD` → 두 파일만 | 1 | — |
| N1 | **SDK 설치** (engineer). `npm.cmd view @anthropic-ai/claude-agent-sdk version engines peerDependencies peerDependenciesMeta optionalDependencies` 출력을 SUMMARY에 붙인다. `npm.cmd install --save-exact @anthropic-ai/claude-agent-sdk@<그 버전>`. 이어 `npm.cmd ls zod @anthropic-ai/sdk @modelcontextprotocol/sdk @anthropic-ai/claude-agent-sdk-win32-x64` 와 `node -e "import('@anthropic-ai/claude-agent-sdk').then(m=>console.log(typeof m.query))"`. 둘 다 문제없으면 peer는 package.json에 넣지 않는다. missing/invalid peer 또는 import 실패일 때만 그 peer를 `--save-exact`로 추가하고 사유를 SUMMARY에 적는다. 라이선스 필드("SEE LICENSE IN README.md")의 README 해당 줄도 SUMMARY에 옮긴다 | `package.json`, `package-lock.json` | import 명령 → `function`. `Test-Path node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe` → True. `git diff main -- package.json` → dependencies에 SDK 한 줄(+사유가 적힌 peer만). `npm.cmd run build` 0 종료 | 1 | — |
| S1 | **사이드카 순수 로직** (engineer). 인터페이스의 `core.mjs` 다섯 함수를 설계 요지·프로토콜대로 만든다(SDK import 없음). **테스트를 먼저 쓴다**(`node:test`+`node:assert`, 가짜 메시지열): <br>(a) text_delta 이어 붙이기: message_start → content_block_start → text_delta "Hel","lo" → 완성 assistant("Hello") → content_block_stop → result 순서를 `fromSdk`에 넣으면 `delta` 텍스트 합이 정확히 "Hello"이고 assistant가 delta를 더 만들지 않는다. `parent_tool_use_id`가 null이 아닌 delta는 버린다. `input_json_delta`는 버린다.<br>(b) init → `{t:"session",id}`. result success → `{t:"done",cost:0.0123}`, `total_cost_usd` 없음 → `cost:null`. `is_error`/error subtype → `{t:"error"}`. `st.interrupting=true`면 delta 버림 + result → `{t:"stopped"}` + 플래그 꺼짐.<br>(c) 권한: `canUseTool("Bash",{command:"echo hi > a.txt"},{signal, suggestions:[{type:"addRules",destination:"localSettings",…}]})` → emit `{t:"permit",id:"p1",tool:"Bash",target:"echo hi > a.txt"}`. `permit("p1","allow")` → 결과가 `{behavior:"allow",updatedInput:<같은 input>}`이고 `updatedPermissions` 키가 없다. deny → `{behavior:"deny",message:<비지 않은 문자열>}`.<br>(d) 이 세션 동안: `session` 뒤 같은 command → emit 없이 allow. 다른 command(`echo bye > b.txt`) → 다시 permit. Edit `session` 뒤 다른 `file_path`의 Edit → emit 없이 allow, Write → permit. 새 `createPermits()` 인스턴스(= 새 대화)에서는 같은 command도 permit.<br>(e) AskUserQuestion: preview가 든 입력 → emit된 `ask`에 preview 없음, 하나 고르기 `answer("p1",{"과일?":"배"})` → `{behavior:"allow",updatedInput:{questions:<원본>,answers:{"과일?":"배"}}}`. 다중 `"사과, 배"`도 그대로. 숫자 값 답은 버린다. AskUserQuestion에 `session`을 주어도 규칙이 생기지 않는다.<br>(f) signal abort → deny + `{t:"closed",id}`. `denyAll` → 대기 두 개 모두 deny + closed 두 개. 이미 답한 id에 `permit` → 무시(예외 없음).<br>(g) 모르는 타입(`{type:"zzz"}`, `{}`, `null`, 숫자) → `[]`. `parseLine("{bad")`, `parseLine("[]")`, `parseLine("")` → null, 예외 없음.<br>(h) `target`: Bash/Edit/Write/Read/NotebookEdit/WebFetch 각각, 그 밖 → JSON 300자 + "…", command가 숫자 → JSON.<br>(i) `redact`: `"x sk-ant-oat01-AbC_d-1 y"` → `sk-ant` 없음, `"Bearer abc.def"` 가림, 45자 영숫자 가림, `C:\Users\a\proj`·uuid는 그대로 | `sidecar/core.mjs`(새), `sidecar/core.test.mjs`(새) | 구현 전 `node --test sidecar/core.test.mjs` 실패 → 구현 후 0 종료. `Select-String sidecar\*.mjs -Pattern 'credentials','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','updatedPermissions:'` → 결과 없음 | 1 | — |
| R1 | **Rust 사이드카 모듈** (engineer). `chat.rs`를 인터페이스·설계 요지대로 만든다(spawn, 세대 번호, stdout 스레드 `pump`→`emit("chat")`, EOF시 `exit`, `stop()`의 close→3초→`taskkill /T /F`). `roadmap.rs`에서 검사를 `local_abs`로 뗀다(동작 불변). `lib.rs`에는 `mod chat;` 한 줄만(dead_code 경고 허용, R2에서 사라짐). `send`는 cwd가 `None`/빈 문자열이면 `Err("세션 폴더를 알 수 없습니다")`, `!local_abs`면 `Err("로컬 절대 경로가 아닙니다")`, `!is_dir()`면 `Err("폴더가 없습니다")`, spawn NotFound면 node 문구, 그 밖 io 오류는 `kind()` 문구만(경로 없음). `start` JSON은 `serde_json::json!`으로 만든다(문자열 이어 붙이기 금지). **테스트를 먼저 쓴다**: `parse_line`(정상 객체, `t` 없음, `t` 숫자, 배열, 깨진 JSON, 빈 줄, CRLF 끝) / `pump`(`Cursor`에 정상 2줄 + 깨진 줄 + `MAX_LINE+1`바이트 줄 + 정상 1줄 → emit 3개, 순서 유지, 패닉 없음; 잘못된 UTF-8 줄 버림) / `local_abs`(roadmap 기존 for_cwd 테스트 모양 그대로 true/false) / `Chat::default().write(..)` → Err, `stop()` 두 번 → 패닉 없음 / `send(…, None, …)`·UNC cwd → Err이고 프로세스를 띄우지 않음(앱 핸들이 필요하면 send를 `spawn_with(cwd, on_line)` 내부 함수로 나눠 그 함수를 테스트) | `src-tauri/src/chat.rs`(새), `src-tauri/src/roadmap.rs`(검사 함수 분리), `src-tauri/src/lib.rs`(`mod` 한 줄) | 구현 전 `cargo test chat::` 실패 → 구현 후 `cargo test` 전체 0 종료(roadmap 기존 테스트 포함). `Select-String src\chat.rs -Pattern 'unwrap\(','expect\(','println!','eprintln!','dbg!'` → `mod tests` 안만. `Select-String src\chat.rs -Pattern 'TcpListener','bind\(','0\.0\.0\.0'` → 없음 | 1 | — |
| F1 | **채팅 패널** (engineer). `types.ts`에 `ChatQuestion`·`ChatOut` 추가. `Chat.tsx`(`export default function Chat({ session }: { session: Session \| null })`): `listen<ChatOut>("chat")` 하나, 명령은 프로토콜 표 이름 그대로. DESIGN 1절 흐름 1~10, 2절 상태 표, 2.1~2.7, 4절 접근성을 그대로 구현한다. 요점: 대화 상태는 메모리(`useState`)만, 첫 보내기 때 폴더 이름을 `folderName(session)`으로 고정, 실행 중·카드 대기 중 입력 줄 모양, `중단` → `chat_interrupt` 후 `aria-disabled`, `새 대화` → `chat_reset` 후 비움(실행 중 비활성), 질문 1개일 때 입력 줄 Enter → `chat_answer(id,{[question]: 글})`, 하나 고르기는 누르면 바로 `chat_answer`, 다중·여러 질문은 토글 → `보내기`(`", "`로 합침), 권한 버튼 → `chat_permit(id,"allow"\|"deny"\|"session")` 후 결과 한 줄로 접기, `closed` → "(중단)" 결과 줄, 명령 Err·`error` → "✕ 오류: …", 실행 중 받은 `exit` → "✕ 오류: 사이드카가 끝났습니다" + 대화 닫힘, 모르는 `t` 무시, `role="status"` 알림 문구(DESIGN 4절). `▶` 커서·hover는 시안 CSS로. 모든 문자열은 JSX 텍스트로만. `Chat.css`: 시안 207~303행을 옮긴다(`.tag`·`.btn`·`.empty`·`.sr`·`.blink`·`.px`는 App.css에 이미 있으니 다시 쓰지 않음). 색은 4명암 변수만 | `src/types.ts`, `src/Chat.tsx`(새), `src/Chat.css`(새) | `npx.cmd tsc --noEmit` 0 종료(App.tsx가 아직 Chat을 안 불러도 됨). `Select-String -Path src\*.tsx,src\*.ts -Pattern 'dangerouslySetInnerHTML','innerHTML','marked','markdown'` → 없음. `Select-String src\Chat.css -Pattern '#[0-9a-fA-F]{3,8}\b'` → 없음. 코드 리뷰 포인트: `preview`를 읽는 줄이 없다, invoke 인자에 경로·cwd가 없다 | 1 | — (프로토콜만) |
| S2 | **사이드카 IO** (engineer). `chat.mjs`: (1) Node 18.14 미만이면 `error` 줄을 쓰고 `exit(1)`. (2) `readline`으로 stdin 줄 → `parseLine` → 프로토콜 처리, EOF → close 경로. (3) `start`에서 `await import("@anthropic-ai/claude-agent-sdk")` → 설계 요지의 옵션으로 `query()`. prompt는 큐 기반 async generator(첫 메시지 + `send`가 넣는 메시지). (4) `for await (m of q)` → `fromSdk` → stdout 한 줄씩(`JSON.stringify` + `\n`). `system/init`이면 stderr에 `orbit-sidecar: session <id>`. (5) query 예외 → `error{message: redact(String(e?.message ?? e))}` → 종료. (6) `interrupt`: `denyAll` → 플래그 → `await q.interrupt()`. `close`: `denyAll` → `q.close()` → `exit(0)`. SDK 옵션 이름(`includePartialMessages`·`canUseTool`·`stderr`·`systemPrompt`·`close()`·`interrupt()`)은 설치된 `node_modules/@anthropic-ai/claude-agent-sdk/*.d.ts`에서 확인하고 다르면 SUMMARY에 적는다. 실제 모델 호출 금지 | `sidecar/chat.mjs`(새) | `node --test sidecar/core.test.mjs` 0. 호출 없는 연기 검사(SUMMARY에 출력): ① `'{bad'`와 `'{"t":"zzz"}'`만 넣고 stdin을 닫으면 → stdout 빈 출력, 0 종료(예외 없음). ② `$env:PATH`에서 node를 지운 것은 R2·V1이 본다. ③ `node sidecar/chat.mjs`에 `{"t":"close"}`만 → 1초 안 종료. `Select-String sidecar\chat.mjs -Pattern 'settingSources','plugins','bypassPermissions','acceptEdits','allowDangerously','credentials','ANTHROPIC_','listen\(','createServer'` → 없음. `Select-String sidecar\chat.mjs -Pattern 'permissionMode: *"default"'` → 1줄 | 2 | N1, S1 |
| R2 | **명령 배선 + 종료 처리** (engineer). `AppState`에 `chat: chat::Chat`. 명령 5개를 프로토콜 표대로 추가·등록. `chat_send`는 `get_roadmap`처럼 락 안에서 cwd만 복제한 뒤 락을 풀고 `state.chat.send(&app, cwd, &text)`. `chat_permit`은 decision 검사 후 `json!({"t":"permit","id":id,"decision":decision})`. `run()`을 `.build(tauri::generate_context!()).expect(…)` + `.run(\|app, ev\| if let tauri::RunEvent::Exit = ev { app.state::<AppState>().chat.stop() })`로 바꾼다(정확한 API 이름은 `cargo build`로 확인). 기존 명령·`uninstall_hooks`는 그대로. glue라 새 테스트 없음 | `src-tauri/src/lib.rs` | `cargo build`·`cargo test` 0 종료, 경고 없음. `Select-String src\lib.rs -Pattern 'fn chat_(send\|permit\|answer\|interrupt\|reset)\('` → 5줄, `generate_handler` 목록에 5개. `chat_send` 시그니처에 `cwd`·`path` 인자 없음. `git diff --exit-code main -- src-tauri/capabilities src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock` → 0 | 2 | R1 |
| F2 | **App 연결 + 상단 바** (engineer). `App.tsx`: 채팅 `<section>`을 `<Chat session={cur} />`로 바꾼다. 상단 바: `액정 폴더` → `게임보이 화면`, aria-label "게임보이 화면 폴더 열기", `installed === true`면 버튼 없음(제거 버튼 JSX 삭제), 그 밖 `설치`. `run`은 `install_hooks`만 남기고 "제거할 항목 없음" 분기를 지운다. `App.css`: 148~163행 옛 채팅 규칙(`.chat` flex·`.chat-body`·`.input-row`·`.input-row input`)을 지우고(`.chat` 격자 위치 62행·`.tag`는 남김) 79행 주석을 시안 92행 문구로 | `src/App.tsx`, `src/App.css` | `npm.cmd run build` 0 종료. `Select-String src\App.tsx -Pattern '액정 폴더','uninstall_hooks','⑥에서 연결','>제거<'` → 없음. `Select-String src\*.tsx -Pattern '게임보이 화면'` → App.tsx 버튼. `Select-String -Path src\*.tsx -Pattern dangerouslySetInnerHTML` → 없음. `npm.cmd run dev` → http://localhost:1420에서 상단 바 한 줄, 채팅 "세션을 고르면 그 폴더에서 대화를 시작합니다", 입력 꺼짐(invoke 오류는 정상), 끝나면 1420 포트 프로세스 종료 | 2 | F1 |
| L1 | **문서** (역할: **librarian**). SPEC.md: 화면 6번(56~62행)과 실행 엔진 절(64~72행)에 "⑥에서 된 것"(입력 → 스트리밍 → 권한 카드·AskUserQuestion → 중단, 같은 대화 이어 보내기, 사이드카 = 이 PC의 node + Rust std::process + stdin/stdout, permissionMode default 고정, 이 세션 동안 = 사이드카 메모리, 비용 = 추정 `total_cost_usd`, 인증 = 기존 CLI 로그인 그대로)와 "뒤로 미룬 것"(모델 선택, 세션 이어가기 resume, 실행 중 추가 지시, 트랙 선택, 예산 상한, 자동 승인 토글, 내장 하네스 plugins 로드, SDK 직접 이벤트 수집, 채팅 기록 보존, 설치 파일·사이드카 번들링, API 키·키체인)를 맞춰 적는다. 다른 절은 건드리지 않는다. ROADMAP.md 9행 ⑥ `- [ ]` → `- [x]`. W2에 커밋한다(V1·security가 COMMIT 줄을 쓴 뒤 바뀌면 출고 대조가 막힘). V1이 실패해 범위가 바뀌면 다시 고친다 | `SPEC.md`, `ROADMAP.md` | `git diff -U0 main -- SPEC.md`의 hunk가 56~72행 안에만. `git diff main -- ROADMAP.md` → 9행 한 줄만 | 2 | — |
| V1 | **QA 실행 검증** (qa). 아래 "검증 분담"과 "QA 절차". 결과·출력·스크린샷 경로·보낸 프롬프트·누른 버튼을 VERIFY.md에 적고 `COMMIT:` 줄을 쓴다 | (산출물만) `VERIFY.md`, 스크린샷 | 아래 절차 | 3 | D1, N1, S1, S2, R1, R2, F1, F2, L1 |
| V2 | **시각 대조** (designer, Lead가 호출). V1이 찍은 5·8·10 상태(1400×900, 960×640)와 같은 크기의 `layout_v4.html` 첫 화면·변형을 나란히 본다. 시안에 없는 요소(중단 버튼, 완료·비용 줄, 오류 줄, 폴더 줄)는 "새로 정한 것" 목록으로 사용자 승인 질문에 올린다(이미 DESIGN 6절 승인분은 표시만) | (산출물만) Designer 리뷰 문서 | 결과 "같다". 차이가 있으면 F1·F2로 되돌리고 V1 8단계·V2 반복 | 3(V1 뒤) | V1 |

웨이브별 파일 겹침:
- W1: D1 `design/**`, N1 `package.json`·`package-lock.json`, S1 `sidecar/core*.mjs`, R1 `chat.rs`·`roadmap.rs`·`lib.rs`(mod 한 줄), F1 `types.ts`·`Chat.tsx`·`Chat.css`. 겹침 없음.
- W2: S2 `sidecar/chat.mjs`, R2 `lib.rs`, F2 `App.tsx`·`App.css`, L1 `SPEC.md`·`ROADMAP.md`. 겹침 없음. R2는 R1이 `lib.rs`를 커밋한 뒤 시작.
- W3: V1 → V2. 코드는 고치지 않는다. 수정은 해당 태스크 engineer에게 되돌린다.
- security 리뷰·REVIEW는 Lead의 관문 단계(이 표 밖). CHANGELOG·`docs/solutions/`는 출고 단계 librarian.

변경이 닿는 곳 점검:
- **호출부**: `roadmap::for_cwd`는 `local_abs`를 부르게 바뀌고 동작 불변(R1, 기존 테스트로 확인). `run()`의 `.run(ctx)` → `.build().run(cb)`(R2). `get_sessions`·`session-update`·`get_roadmap`·`Graph.tsx`·`Screen.tsx`·`sessions.rs`·`watch.rs`·`server.rs`·`hooks.rs`는 바꾸지 않는다(D6: 새 수집 경로 없음).
- **테스트**: 새 테스트는 `sidecar/core.test.mjs`(S1), `chat::`(R1). 기존 `roadmap::` 테스트는 R1 뒤에도 그대로 통과해야 한다. `gate.test.mjs`는 손대지 않는다.
- **설정**: `capabilities/default.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock` 불변(R2·V1 diff). `package.json`·`package-lock.json`만 N1이 바꾼다. `tsconfig.json`은 `include: ["src"]`라 `sidecar/`를 타입 검사하지 않는다(바꾸지 않음). Vite는 `src/`에서 import하지 않는 SDK를 번들하지 않는다.
- **CSS·토큰**: `Chat.css`(F1) 새로, App.css 옛 채팅 규칙 삭제(F2). `tokens.json`은 D1이 커밋.
- **export**: `pub fn run()` 그대로. `mod chat` crate 내부.
- **하네스·HARNESS.md·CLAUDE.md**: 바꾸지 않는다. 새 테스트 명령 `node --test sidecar/core.test.mjs`를 CLAUDE.md "스택과 명령"에 넣는 것은 사용자 몫(관문이 막음).

## 검증 분담 (D8)

| 누가 | 무엇 | 환경 |
|---|---|---|
| engineer (각 태스크) | 단위 테스트·grep·빌드, 호출 없는 연기 검사 | 실제 `~/.claude` 열지 않음. 모델 호출 0회 |
| QA, 호출 없음 | 기준 1~4, 13, 14의 grep·기록 검사, 16, 17의 Orbit 꺼짐 회귀 준비, 3·19 diff | **임시 사본**: `ORBIT_CLAUDE_SETTINGS=<임시>\settings.json`, `ORBIT_CLAUDE_PROJECTS=<임시>\projects`(debug 빌드 전용 덮어쓰기) |
| QA, `[호출]` | 기준 5~12, 15, 17. **임시 폴더 `<임시>\proj`에서만, 짧은 프롬프트 합계 약 10회**(아래 순서로 11회 계획, 재시도 포함 최대 13회에서 멈추고 Lead에 보고). 카드에서 `허용`/`이 세션 동안`은 **성공 기준에 적힌 명령(`echo hi > a.txt`, `echo bye > b.txt`)과 AskUserQuestion에만** 누른다. 그 밖의 카드는 모두 `거부` | **사용자 로그인이 필요하다**: SDK `claude.exe`는 실제 `~/.claude`의 로그인·`settings.json`을 읽고 `~/.claude/projects`에 로그를 쓴다(임시 사본으로 대체 불가 — 자격증명을 복사하지 않으므로). `ORBIT_CLAUDE_PROJECTS`는 풀고 실제 projects를 보게 한다(읽기 전용). 전후 `Get-FileHash $HOME\.claude\settings.json` 비교. 에이전트 셸(MSIX 컨테이너)에서 로그인이 안 보이면(미확인) `[호출]` 칸을 "사용자 확인 대기"로 두고 체크리스트를 넘긴다 |
| 사용자 | 기준 14의 실제 로그아웃 상태 확인, 오르빗 저장소 같은 실제 프로젝트에서 한 번 써 보기, 비용 줄과 실제 사용량 대조. 실제 `~/.claude/settings.json`에 Orbit 훅이 이미 있으면 기준 7의 "훅 제거 상태" 경우도 | 실제 환경 |

수용한 위험(D8): QA 호출은 사용자 계정·권한으로 돈다.

## QA 절차 (V1)

준비(호출 없음):
```powershell
$d = "$env:TEMP\orbit-qa6"; $p = "$d\proj"
mkdir "$d\projects","$p" -Force
Set-Content "$p\README.md" "첫 줄입니다"
Set-Content "$p\CLAUDE.md" "모든 답의 마지막 줄은 ``끝.``이다"
Set-Content "$d\settings.json" '{"hooks":{}}'
$env:ORBIT_CLAUDE_SETTINGS = "$d\settings.json"; $env:ORBIT_CLAUDE_PROJECTS = "$d\projects"
$h0 = (Get-FileHash $HOME\.claude\settings.json).Hash
```
- `$d\projects\qa\<uuid>.jsonl`에 `cwd`가 `$p`인 `type:"user"` 한 줄(시드 세션, 고를 대상).

1. 자동 검사: `cargo test`, `npm.cmd run build`, `node --test harness/hooks/gate.test.mjs`, `node --test sidecar/core.test.mjs` → 모두 0(기준 1·2).
2. diff(기준 3·19): `git diff main -- package.json`(SDK + 사유 있는 peer만), `git diff --exit-code main -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities src-tauri/tauri.conf.json` → 0, `git diff -U0 main -- SPEC.md` hunk 범위.
3. `npm.cmd run tauri dev 2>&1 | Tee-Object $d\dev.log`. 세션 미선택 → 입력 꺼짐 + "세션을 고르면 그 폴더에서 대화를 시작합니다"(기준 4). 상단 바 `게임보이 화면`, 훅 미설치면 `설치`만 → 누르면 `$d\settings.json`에 병합 → 버튼이 사라지고 "훅 설치됨"만(D10).
4. 기준 13(호출 없음): 앱을 끄고, 한 창에서 `npm.cmd run dev`, 다른 창에서 PATH에서 `node.exe`가 있는 폴더를 뺀 뒤 `src-tauri\target\debug\orbit.exe` 직접 실행. 시드 세션을 골라 보냄 → "✕ 오류: Node.js 18.14 이상이 필요합니다 — node를 찾지 못했습니다", 세션 목록·그래프·로드맵 정상.
5. 기준 14(grep): `Select-String -Path src-tauri\src\*.rs,sidecar\*.mjs,src\*.ts* -Pattern '\.credentials','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN'` → 없음. 절차 끝에 `Select-String $d\dev.log,"$env:APPDATA\dev.orbit.app\*" -Pattern 'sk-ant','Bearer '` → 없음(파일 내용만 검사, 일치 줄을 화면에 내지 않도록 `-Quiet`).
6. `[호출]` 준비: 앱을 끄고 `Remove-Item Env:ORBIT_CLAUDE_PROJECTS`. 시드 세션을 실제 projects에 새 폴더로 둔다(`$HOME\.claude\projects\orbit-qa6-seed\<uuid>.jsonl`, 끝나면 삭제). 훅 상태: `Select-String $HOME\.claude\settings.json -Pattern 'X-Orbit-Token' -Quiet`(값은 출력하지 않음). False면 "훅 설치" 경우는 `$env:ORBIT_CLAUDE_SETTINGS="$p\.claude\settings.json"` 후 `설치`(프로젝트 설정에 훅 → SDK 세션이 project source로 읽음, 미확인)로 만들고, "제거" 경우는 그 파일을 지워서 만든다. True면 두 경우 모두 "설치"이므로 "제거" 경우는 사용자 몫. `tasklist /fi "imagename eq node.exe"`·`claude.exe` 목록 저장.
7. `[호출]` 순서(계획 11회):
   1. "README.md 첫 줄을 그대로 보여 줘" → 기준 5(내 말 즉시, 여러 번에 늘어남 — 스트리밍 중 스크린샷 2장, 완료 줄, 입력 다시 열림)·6(마지막 줄 `끝.`)·7(훅 설치 경우: 세션 목록 정확히 +1, 그래프 Lead 노드 1개, `dev.log`의 `orbit-sidecar: session <id>`와 `$HOME\.claude\projects\…\<id>.jsonl` 파일명 일치). 5 상태 스크린샷.
   2. `새 대화` → "`echo hi > a.txt`를 Bash로 실행해 줘" → 카드(`Bash`, 명령 글자 그대로, 세 버튼) 스크린샷(8 상태) → `거부` → `a.txt` 없음, 답이 거부 언급(기준 8).
   3. 같은 대화에서 같은 요청 → `허용` → `a.txt` 생김(기준 8). `a.txt` 삭제.
   4. `새 대화` → 같은 요청 → `이 세션 동안 (이 명령만)`.
   5. 같은 대화 같은 요청 → 카드 없이 실행.
   6. "`echo bye > b.txt`를 Bash로 실행해 줘" → 카드가 다시 뜸 → `거부`(기준 9). `a.txt` 삭제.
   7. `새 대화` → `echo hi` 요청 → 카드가 다시 뜸(기준 9) → **카드를 둔 채 창 닫기**(기준 12): 그 전에 사이드카 PID(`Get-CimInstance Win32_Process -Filter "Name='node.exe'"`의 CommandLine에 `sidecar\chat.mjs`)와 자식 `claude.exe` PID(ParentProcessId)를 적어 둔다. 10초 뒤 두 PID 없음, `a.txt` 없음. 기준 9 끝: `Test-Path $p\.claude\settings.local.json` → False, 해시 = `$h0`.
   8. 앱 다시 실행, 훅 "제거" 경우로 바꾼 뒤(6단계) "AskUserQuestion으로 사과/배 중 하나를 고르게 물어봐" → `▶ 사과` `▶ 배` 스크린샷(10 상태) → `배` → 답이 배를 말함(기준 10). 기준 7의 훅 제거 경우: 세션 목록 +1, Lead 노드 1개(로그 감시 주기 뒤).
   9. "1부터 300까지 한 줄씩 천천히 세어 줘" → 실행 중 `netstat -ano`에서 사이드카·claude.exe PID의 LISTEN 없음, 훅 서버는 `127.0.0.1:<port>`만(기준 16) → `중단` → 5초 동안 글자 안 늘어남, "중단됨", 입력 열림(기준 11).
   10. 이어서 "다음 글자를 그대로 출력해: `<img src=x onerror=alert(1)>`" → 글자 그대로, 대화상자 없음(기준 11 후속·15). `Select-String -Path src\*.tsx -Pattern dangerouslySetInnerHTML` → 없음.
   11. Orbit을 끄고 터미널 `$p`에서 `claude -p "hi"` → ④·⑤와 같이 지연 없이 응답(기준 17).
8. 960×640·1400×900 스크린샷(5·8·10 상태)을 V2에 넘긴다(기준 18).
9. 정리: 앱·vite 종료(1420 포트 소유 프로세스), `$HOME\.claude\projects\orbit-qa6-seed`와 이번 run이 만든 `$p` 세션 로그 폴더 삭제, `$d`·환경변수 삭제, 해시 = `$h0` 최종 확인.

## 성공 기준 대응

| 기준 | 덮는 태스크 | 검증 |
|---|---|---|
| 1 cargo test·build·gate | R1, R2, F1, F2 | 각 태스크 검증, V1-1 |
| 2 사이드카 node --test 6종 | S1 (a)(c)(d)(e)(g) | S1 테스트, V1-1 |
| 3 의존성·Cargo·capability·CSP diff | N1, R2 | N1·R2 diff, V1-2 |
| 4 미선택 시 비활성 + 문구 | F1, F2 | F2 dev 확인, V1-3 |
| 5 스트리밍·완료 줄·입력 재개 | S1(b), S2, R1, F1 | V1-7.1 |
| 6 CLAUDE.md `끝.` | S2(옵션 고정: settingSources 생략 + preset) | V1-7.1 |
| 7 세션 1줄·Lead 1개·id 일치·토큰 없음 | S2(stderr 진단), D6(새 경로 없음) | V1-7.1·7.8, V1-5 |
| 8 Bash 카드·거부·허용 | S1(c)(h), S2, R2, F1 | V1-7.2·7.3 |
| 9 이 세션 동안·새 대화·settings.local.json 없음·해시 | S1(c)(d), R1(대화=프로세스) | V1-7.4~7.7 |
| 10 AskUserQuestion `▶ 배` | S1(e), F1 | V1-7.8 |
| 11 중단 5초·중단됨·후속 정상 | S1(b), S2, F1 | V1-7.9·7.10 |
| 12 카드 대기 중 창 닫기 → 프로세스 없음·a.txt 없음 | R1(stop·taskkill), R2(RunEvent::Exit), S1(f), S2 | V1-7.7 |
| 13 node 없음 문구, 나머지 동작 | R1(NotFound 문구), F1 | V1-4 |
| 14 로그인 오류 텍스트·토큰 없음·grep | S1(i), S2, R1(stderr inherit), 사용자(로그아웃) | V1-5, 사용자 |
| 15 HTML 글자 그대로 | F1(JSX 텍스트) | F1 grep, V1-7.10 |
| 16 node LISTEN 없음·훅 서버 127.0.0.1 | S2 grep(`listen(`·`createServer` 없음), server.rs 불변 | V1-7.9 |
| 17 Orbit 꺼짐 회귀 | 훅·서버 코드 불변 | V1-7.11 |
| 18 시각 대조 | D1, F1, F2 | V1-8 + V2 |
| 19 SPEC diff 범위 | L1 | L1 검증, V1-2 |
| D10 상단 바 | F2 | F2 grep, V1-3 |

## 위험·가정

- **W1. Windows 프로세스 정리.** Node를 kill해도 `claude.exe`는 남을 수 있다. 정상 경로는 `close` → `q.close()`, 비정상은 `taskkill /T /F`(트리)와 사이드카의 stdin EOF 감지다. Orbit이 강제 종료(작업 관리자)되면 RunEvent::Exit가 오지 않아 EOF 경로에만 기댄다. `q.close()`가 `claude.exe`를 끝내는지는 미확인 → 기준 12로 확인.
- **W2. interrupt 뒤 result 메시지가 오는지 미확인.** 오지 않으면 `stopped`가 안 나와 입력이 안 열린다. S2가 `.d.ts`로 확인하고, V1-7.9에서 본다. 안 오면 S2에서 `await q.interrupt()` 뒤 `stopped`를 직접 쓰고 다음 result를 버리는 쪽으로 고친다.
- **W3. 프로젝트 설정 훅으로 "설치" 경우를 만드는 방법(V1-6)은 미확인**(SDK 비대화형 세션이 `<cwd>/.claude/settings.json` 훅을 신뢰 확인 없이 쓰는지). 안 되면 그 경우는 사용자 몫으로 넘긴다.
- **W4. `redact`는 휴리스틱이다.** 40자 이상 연속 영숫자를 가리므로 긴 해시가 섞인 SDK 오류 문구가 일부 가려질 수 있다(수용). 반대로 짧은 토큰 형식은 못 가린다. SDK 오류 문구에 토큰이 들어간다는 근거는 없고, 대비책이다.
- **W5. stderr inherit.** dev 콘솔에 사이드카·SDK stderr(가린 뒤)가 보인다. release(창 하위 시스템)에서는 버려진다. claude.exe가 SDK `stderr` 콜백을 거치지 않고 직접 콘솔에 쓰는지는 미확인 → V1-5 `dev.log` grep으로 본다.
- **W6. 콘솔 창.** `CREATE_NO_WINDOW`로 node 창은 막는다. SDK가 `claude.exe`를 `windowsHide`로 띄우는지는 미확인(dev에서는 부모 콘솔이 있어 안 보임). release 빌드는 이번 범위 밖.
- **W7. 스크립트 경로가 빌드 시점 저장소 경로로 고정된다**(`CARGO_MANIFEST_DIR`). 설치 파일·다른 PC에서는 동작하지 않는다(D5 수용). 저장소를 옮기면 다시 빌드해야 한다.
- **W8. peer 자동 설치.** npm 7+가 peer를 lock에만 넣는다고 가정했다. `npm ci --omit=optional`이나 `--legacy-peer-deps` 환경에서는 `claude.exe`·peer가 빠진다(RESEARCH 1 함정). 이때 SDK 오류 문구가 채팅에 그대로 보인다.
- **W9. 사용자 settings의 allow 규칙·훅은 카드 없이 통과시킨다**(RESEARCH 3). 실제 `~/.claude/settings.json`에 `Bash(echo:*)` 같은 allow가 있으면 기준 8의 카드가 안 뜬다. V1-6에서 `Select-String $HOME\.claude\settings.json -Pattern 'Bash\(' -Quiet`로 미리 보고, 있으면 기준 8·9를 사용자 몫으로 넘긴다.
- **W10. "이 세션 동안 (Edit 전부)"의 범위**는 cwd 안팎 모든 편집이다(D4 수용).
- **W11. 실행 중 다른 세션을 골라도 폴더는 고정**이지만, `exit`·오류로 대화가 닫힌 뒤 보내면 그때 고른 세션 폴더에서 새 대화가 시작된다(첫 줄로 구분).
- **W12. 정책·과금(D3 수용).** 구독 로그인 SDK 사용의 약관 판단은 미확인, 환경변수 API 키가 있으면 화면 표시 없이 API 요금. 비용 줄은 추정치.
- **W13. SPEC.md 112행**("API 키는 ⑥에서 OS 키체인")은 BRIEF 9가 다른 절을 건드리지 말라고 해서 그대로 둔다. 실제와 어긋나므로 다음 문서 run 후보.
- **W14. Tauri 2 `Builder::build` + `App::run(callback)` + `RunEvent::Exit` 이름**은 이 계획에서 공식 문서로 다시 열어 보지 않았다(미확인). R2가 `cargo build`로 확인하고 다르면 같은 뜻의 API를 쓴다.
