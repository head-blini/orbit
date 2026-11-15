# RESEARCH: 마일스톤 ② 훅 수신 서버 + 훅 설치 도우미

확인 날짜: 2026-11-14. 주 출처: https://code.claude.com/docs/en/hooks (이하 [HOOKS]). 페이지가 길어(약 29만자) 일부만 읽었다. 못 읽은 부분은 "미확인"에 표시.

## 질문 1. 훅 이벤트 목록과 페이로드

찾은 것 ([HOOKS]):
- 이벤트 33개: SessionStart, SessionEnd, Setup, UserPromptSubmit, UserPromptExpansion, Stop, StopFailure, PreToolUse, PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, PostToolBatch, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, DirectoryAdded, FileChanged, PreCompact, PostCompact, PreModelSwitch, PostModelSwitch, Elicitation, ElicitationResult, WorktreeCreate, WorktreeRemove, Notification, MessageDisplay.
- 공통 필드(전 이벤트): `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `effort`(객체, `level`), `hook_event_name`. 서브에이전트·팀 훅은 `agent_id`, `agent_type` 추가.
- 이벤트별 추가 필드:
  - SessionStart: `source`(startup/resume/clear/compact/fork), 선택 `model`, `agent_type`, `session_title`
  - UserPromptSubmit: `prompt`, 선택 `session_title`
  - PreToolUse: `tool_name`, `tool_input`, `tool_use_id` (MCP는 `mcp_server`). Windows에서 `file_path`는 백슬래시 절대경로.
  - PostToolUse: `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, 선택 `duration_ms`
  - PostToolUseFailure: `error`, 선택 `is_interrupt`, `duration_ms`
  - Stop: `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`
  - SubagentStop: `stop_hook_active`, `agent_transcript_path`, `last_assistant_message` 등
  - Notification: `message`, 선택 `title`, `notification_type`(예: permission_prompt, idle_prompt)
- Notification 훅은 알림을 막거나 바꿀 수 없다(부수효과용).
- 공식 문서는 `error` 문자열 형식 등을 "안정된 형식 아님"이라 명시 → 파서는 모르는 필드에 관대해야 한다.

## 질문 2. settings.json 훅 형식, HTTP 훅

찾은 것 ([HOOKS]):
- 형식: `hooks.<Event>[] = { matcher?, hooks: [ { type, ... } ] }`. matcher는 `"*"`/빈값/생략이면 전부. 영숫자·`_`·`-`·`,`·`|`만이면 정확한 이름 목록, 다른 문자가 있으면 JS 정규식.
- type: `command`, `http`, `mcp_tool`, `prompt`, `agent`. **`http`는 공식 지원**: 입력 JSON을 `url`로 POST.
- http 필드: `url`(필수), `headers`(값에 `$VAR`/`${VAR}`), `allowedEnvVars`(여기 나열된 변수만 치환, 나머지는 빈 문자열), `onFailure`(`"continue"`|`"block"`, **v2.1.295 이상**), `timeout`.
- 공식 예시:
  ```json
  {"type":"http","url":"http://localhost:8080/hooks/pre-tool-use","timeout":30,
   "headers":{"Authorization":"Bearer $MY_TOKEN"},"allowedEnvVars":["MY_TOKEN"]}
  ```
- timeout 단위는 **초**. 기본 600(command/http/mcp_tool), UserPromptSubmit·PreModelSwitch·PostModelSwitch는 30, MessageDisplay는 10, SessionEnd는 합계 1.5초 예산(최대 60초까지 상향 가능). **기본값이 600초이므로 Orbit이 짧은 timeout을 반드시 명시해야 한다.**
- 서버가 꺼져 있을 때: HTTP 연결 실패, 비-2xx, 일반 텍스트 2xx 본문은 모두 **비차단 오류**(동작은 계속 진행). timeout은 훅을 취소. `onFailure: "block"`을 줄 때만 막는다(기본은 continue로 해석되나 기본값 문구는 직접 확인 못 함). 2xx 빈 본문=성공, 2xx JSON 객체는 command 훅 출력처럼 해석된다 → **서버는 빈 본문 2xx(또는 204)를 돌려줘야 한다.**
- 설정 키 `allowedHttpHookUrls`(정의되면 URL이 병합 허용목록에 맞아야 실행), `httpHookAllowedEnvVars`(정의되면 그 목록만 헤더에 치환). 관리형 정책 포함 전 출처에 적용 → 사용자 환경에 있으면 Orbit 훅이 조용히 안 돌 수 있다.

## 질문 3. command 훅 대안, Windows 셸, 종료 코드

찾은 것 ([HOOKS]):
- Windows command 훅 셸: **Git Bash가 설치돼 있으면 Git Bash, 아니면 PowerShell.** `"shell": "bash"|"powershell"`로 지정 가능. `args`를 쓰는 exec 형식은 실제 `.exe`만(.cmd/.bat 불가). → command 훅의 인용 규칙이 환경마다 달라 취약하다. HTTP 훅이면 셸 문제가 사라진다.
- 종료 코드: 0=성공(stdout이 JSON이면 파싱; UserPromptSubmit·SessionStart는 일반 stdout이 Claude 컨텍스트에 추가됨), **2=차단 오류**(PreToolUse, UserPromptSubmit, Stop, SubagentStop, PreCompact, ConfigChange, TaskCreated/Completed, PostToolBatch 등에서 차단. PostToolUse는 도구가 이미 실행됨), 그 외=비차단 오류(1도 경고일 뿐 차단 아님).
- stdout JSON의 `continue:false`는 Claude를 통째로 멈춘다, `decision:"block"`, `permissionDecision`도 차단 → **관찰 전용 훅은 stdout에 아무것도 쓰지 않고 종료 코드 0 또는 2가 아닌 값으로 끝내야 한다.**
- stdin을 POST하는 command 방법(curl.exe 기본 탑재 여부, PowerShell Invoke-RestMethod, node)은 **미확인**(공식 출처를 열지 않음). 필요 없을 가능성이 높다(http 타입 사용 시).

## 질문 4. 병합·우선순위·반영 시점

찾은 것 ([HOOKS]):
- 위치: `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, 관리형 정책, 플러그인 `hooks/hooks.json`, 스킬/서브에이전트 frontmatter.
- 병합: 모든 수준의 훅 항목이 **합쳐진다**(덮어쓰지 않음). 동일 핸들러가 여러 파일에 있으면 한 번만 실행. 하위 수준이 관리형 훅을 제거할 수 없다. `disableAllHooks: true`는 병합 후 값에 적용.
- 반영 시점: "설정 파일의 훅 직접 편집은 보통 파일 감시자가 자동으로 반영한다." 그 이상의 타이밍 설명은 읽은 범위에 없음. `/hooks` 메뉴는 읽기 전용.

## 질문 5. Tauri 2 / Rust 서버

찾은 것:
- 현재 안정 tauri 2.12.5 (Apache-2.0 OR MIT, MSRV 1.90). 3.0.0-alpha.6은 프리릴리스. 출처: https://crates.io/api/v1/crates/tauri . Cargo.toml은 `tauri = "2"`라 이미 2.x 최신으로 해결된다. edition 2024 사용 중.
- 프론트로 emit: `use tauri::Emitter; app.emit("name", payload)`(전 리스너), `emit_to`로 특정 webview. payload는 `Serialize + Clone`. 출처: https://v2.tauri.app/develop/calling-frontend/ , https://docs.rs/tauri/2.6.0/x86_64-linux-android/trait.Emitter.html
- capability: 공식 페이지에 이벤트 수신에 필요한 별도 권한은 없고 "이벤트는 capability 시스템의 세분 통제 대상이 아님"이라 적혀 있다. 현재 `core:default`가 이미 있다(`capabilities/default.json`). 프론트의 `listen`은 `core:event` 기본 권한에 포함되는 것으로 보이나 `core:default` 구성 내용은 직접 확인하지 못함(미확인).
- 추가 크레이트 후보(crates.io API): tiny_http 0.12.0 (MIT OR Apache-2.0), axum 0.8.9 (MIT; tokio·hyper 연쇄 의존), getrandom 0.4.3 (MIT OR Apache-2.0), subtle 2.6.1 (BSD-3-Clause). 출처: https://crates.io/api/v1/crates/{tiny_http,axum,getrandom,subtle}
- std::net만으로 가능한지: 코드 구조상 가능(TcpListener::bind("127.0.0.1:0") 후 스레드에서 HTTP/1.1 파싱). 공식 문서 인용은 없음(표준 라이브러리 지식).

## SPEC.md와 다른 점

1. SPEC은 "SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SubagentStop, Stop, Notification 등"만 적었다. 실제는 33개이며 SubagentStart, PostToolUseFailure, PermissionRequest, SessionEnd, StopFailure 등이 "지금 무슨 일을 하는지" 화면에 유용하다. SPEC에 적힌 7개는 모두 현존.
2. SPEC은 "훅 stdin을 로컬 서버로 POST(command)"를 예로 들었다. 이제 `type:"http"`가 공식 지원되어 셸·curl 문제가 사라진다. 단 Claude Code 버전 하한(onFailure는 v2.1.295+, http 유형 자체의 도입 버전은 미확인)을 확인해야 한다.
3. SPEC은 "토큰을 요청 헤더로 검증"이라 했다. HTTP 훅 헤더 값은 env 치환(`allowedEnvVars`) 또는 리터럴이다. 이미 실행 중인 Claude Code 프로세스에는 Orbit이 환경변수를 주입할 수 없으므로, 토큰을 settings 파일에 리터럴로 쓰는 방식이 현실적이다(그 경우 프로젝트 `.claude/settings.json`은 커밋될 수 있으니 전역 또는 `settings.local.json`이 안전).
4. 기본 timeout이 600초라 "짧은 타임아웃"은 명시 설정이 필수다. 정수 초 단위; 소수점 허용 여부는 미확인.
5. 훅 항목은 수준 간 병합되므로 전역과 프로젝트에 둘 다 설치하면 중복 호출된다(동일 핸들러는 1회로 합쳐짐). 제거 버튼은 Orbit이 넣은 항목만 식별해 지워야 한다(식별 표지는 url/포트로 판단 필요).

## 설계에 미치는 영향

- 설치 도우미는 http 훅을 기본으로: `{type:"http", url:"http://127.0.0.1:<port>/events", headers:{"X-Orbit-Token":"<token>"}, timeout:2}` 형태. 이벤트마다 항목을 추가(matcher 생략). 포트는 고정(또는 설정 저장)이어야 settings의 url이 유효하다.
- 서버 응답은 빈 본문 2xx. 오류 시에도 JSON 본문 금지(훅 출력으로 해석되어 동작에 영향 가능).
- Orbit이 꺼져 있을 때 HTTP 연결 실패는 비차단이라 SPEC의 "막지 않는다"를 충족한다. `onFailure`는 지정하지 않는다.
- 서버는 std::net으로도 가능하나 헤더·본문 제한·Origin/Host 검사를 직접 구현해야 한다. tiny_http(동기, 의존성 작음)가 최소 추가 크레이트 후보. 토큰은 getrandom + 상수시간 비교(subtle 또는 직접 구현 가능).
- 토큰은 settings.json에 평문으로 남는 점을 사용자에게 알려야 한다(CLAUDE.md "토큰을 로그·URL·화면에 남기지 않는다"와 충돌하지 않게 UI에는 마스킹).

## 확인하지 못한 것

- command 훅으로 POST하는 방법(curl.exe 탑재, PowerShell, node)과 http 유형 도입 버전.
- 실행 중 세션이 훅 변경을 반영하는 정확한 시점(감시자 언급만 확인).
- http 훅이 localhost·사설 IP를 막는지(예시는 localhost 사용).
- `core:default`에 event listen 권한이 포함되는지.
- SessionEnd, PermissionRequest 등 나머지 이벤트의 필드, onFailure 기본값 문구, http 응답 크기 제한.
