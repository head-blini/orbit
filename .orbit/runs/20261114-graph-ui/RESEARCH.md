# RESEARCH: 마일스톤 ④ 화면 (그래프 데이터 / 그림 표시 / 픽셀 글꼴)

확인 날짜: 2026-11-14. 실제 `~/.claude` 내용은 읽지 않았다. 로그 필드는 ③ RESEARCH(`.orbit/runs/20261114-session-log-watch/RESEARCH.md`)의 [실측] 인용이며 비공식이다.

출처 약칭
- [HOOKS] https://code.claude.com/docs/en/hooks (SubagentStart/Stop, Stop, StopFailure, SessionEnd, Notification, PermissionRequest, PostToolUseFailure, Agent 도구 절을 직접 읽음)
- [ASSET] https://v2.tauri.app/security/asset-protocol/
- [CFG] https://v2.tauri.app/reference/config/
- [CSP] https://v2.tauri.app/security/csp/
- [CFS] https://v2.tauri.app/reference/javascript/api/namespacecore/ (convertFileSrc)
- [OPENER] https://v2.tauri.app/plugin/opener/
- [FEAT] https://docs.rs/crate/tauri/latest/features
- [GAL] https://github.com/quiple/galmuri , https://raw.githubusercontent.com/quiple/galmuri/main/ofl.md

## 질문 1. 그래프에 필요한 값이 어디에 있나

### 찾은 것 (필드 이름 그대로)
- 공통 필드 [HOOKS]: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `agent_id`, `agent_type`. `agent_id`는 "훅이 서브에이전트 안에서 발동할 때" 붙는다(= 서브에이전트 안의 PreToolUse/PostToolUse에도 붙는다). `agent_type`은 `--agent` 세션이거나 서브에이전트 안일 때 존재.
- SubagentStart [HOOKS]: 공통 + `agent_id`, `agent_type`. 예시 `"agent_id":"agent-abc123"`, `"agent_type":"Explore"`. 내장은 `general-purpose`/`Explore`/`Plan`, 커스텀은 frontmatter `name`, 플러그인 제공은 `my-plugin:reviewer`처럼 접두 포함(이 저장소는 `orbit:engineer` 꼴). subagent 재개(resume)와 agent-team 팀원이 새 메시지를 처리할 때마다도 발동한다.
- SubagentStop [HOOKS]: 공통 + `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`(= `<session>/subagents/agent-<id>.jsonl`), `last_assistant_message`, `background_tasks`, `session_crons`. `transcript_path`는 메인 세션 것. **Claude 내부 에이전트(프롬프트 제안, `/btw`)도 SubagentStop을 낸다**: 그때 `agent_type`은 세션의 `--agent` 이름이거나 빈 문자열. 성공/실패를 나타내는 필드는 문서에 없다.
- Agent 도구 PreToolUse/PostToolUse [HOOKS]: 도구 이름은 `Agent`(문서에 `Task`는 안 나옴). `tool_input`: `prompt`, `description`, `subagent_type`, `model`(선택). PostToolUse `tool_response`(포그라운드): `status`(`completed`/`async_launched`), `agentId`, `content`, `resolvedModel`, `modelsUsed`, `totalTokens`, `totalDurationMs`, `totalToolUseCount`, `usage`. 백그라운드는 `status`, `agentId`, `description`, `prompt`, `outputFile`, `resolvedModel`.
- PostToolUseFailure [HOOKS]: `tool_use_id`, `error`(문자열), `is_interrupt`(선택), `duration_ms`(선택).
- Stop [HOOKS]: `stop_hook_active`, `last_assistant_message`, `background_tasks`[`id`,`type`(shell/subagent/monitor/workflow/teammate/…),`status`,`description`,`command`,`agent_type`], `session_crons`. 메인 에이전트가 끝났을 때. **사용자 중단이면 안 온다.** API 오류면 Stop 대신 StopFailure.
- StopFailure [HOOKS]: `error`(`rate_limit`/`overloaded`/`authentication_failed`/`oauth_org_not_allowed`/`account_on_hold`/`billing_error`/`invalid_request`/`model_not_found`/`server_error`/`max_output_tokens`/`cloud_credential_error`/`unknown`), `error_details`(선택), `last_assistant_message`(오류 문구 자체).
- SessionEnd [HOOKS]: `reason`(`clear`/`resume`/`logout`/`prompt_input_exit`/`other`).
- Notification [HOOKS]: `message`, `title`(선택), `notification_type`(`permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `agent_needs_input`, `agent_completed` 등 14종).
- PermissionRequest [HOOKS]: `tool_name`, `tool_input`, `permission_suggestions`. **`tool_use_id` 없음.**
- 부모 에이전트 ID 필드: 위 어디에도 없다.
- 로그 쪽(③ [실측], 비공식): 메인 줄은 `isSidechain:false`, 서브에이전트 줄은 `isSidechain:true` + `agentId` + `sessionId`(=부모 세션). 서브에이전트 파일 `<session>/subagents/agent-<agentId>.jsonl` + `.meta.json`(`agentType`, `description`, `toolUseId`, `spawnDepth`, `finished`). `parentUuid`는 메시지 사슬이지 에이전트 부모가 아니다. 메인 로그의 Agent 도구 호출은 `message.content[]`의 `tool_use`(`id`,`name`,`input`) 블록 — `input`에 `subagent_type`이 있는지는 이번에도 직접 못 봤다(미확인).

### 표 1-A. 그래프 요소별 출처
| 필요한 것 | 훅만으로 | 로그가 있어야 | 둘 다 없음 |
|---|---|---|---|
| 서브에이전트 시작(실시간) | SubagentStart `agent_id`,`agent_type`(시각은 Orbit 도착 시각) | | |
| 서브에이전트 종료(실시간) | SubagentStop `agent_id` (+ `last_assistant_message`) | | |
| 에이전트 종류·이름 | `agent_type`(Start/Stop), Pre(Agent) `tool_input.subagent_type`·`description` | 과거 세션: `.meta.json` `agentType`·`description`(비공식) | |
| 노드 토큰·소요시간 | 포그라운드만, PostToolUse(Agent) `tool_response.totalTokens`·`totalDurationMs`·`totalToolUseCount`·`usage` | 과거·백그라운드: 서브에이전트 jsonl의 `assistant` `message.usage` 합산, 첫/끝 `timestamp` | |
| 이 노드의 도구 호출 | 서브에이전트 안 Pre/PostToolUse의 `agent_id` | 과거: `agent-*.jsonl` 줄 | |
| 메인 → 서브에이전트 연결(부모-자식, 1단계) | Pre(Agent) `tool_use_id` ↔ Post(Agent) `tool_response.agentId`(**끝날 때만**; 시작 시점엔 `SubagentStart`에 `tool_use_id`가 없어 순서·`agent_type`으로 짝짓는 추정) | `.meta.json` `toolUseId`(비공식, 시작 직후부터 확정 가능) | |
| 서브에이전트의 서브에이전트(손자) | | `.meta.json` `spawnDepth`만(부모 id는 아님) | 훅·공식 문서에 부모 에이전트 id 필드 없음 |
| 서브에이전트 실패 | | (로그의 오류 표시 필드 미확인) | SubagentStop에 성공/실패 필드 없음. Agent 도구 호출이 실패하면 PostToolUseFailure(`error`)가 올 가능성은 있으나 문서가 Agent에 대해 보장하지 않음(미확인) |
| 백그라운드 서브에이전트 진행 | Stop/SubagentStop `background_tasks`(`type:"subagent"`,`status`,`agent_type`) | | |
| Dynamic Workflow 노드 | | | 문서에서 `background_tasks.type:"workflow"`만 확인. 노드 필드·부모 관계는 못 찾음 |
| Orbit 시작 전 과거 세션의 그래프 | | 전부 로그(메인 `tool_use`+`subagents/` 파일) | |
| 훅 설치 전/Orbit이 꺼져 있던 동안 | | 로그 | |
| 내부 에이전트(`/btw`, 프롬프트 제안)와 진짜 서브에이전트 구분 | SubagentStop `agent_type`이 빈 문자열이거나 세션 `--agent` 이름 → 그 경우 대응하는 SubagentStart/Pre(Agent)가 없는 것으로 걸러야 함(추정) | | |

### 표 1-B. 세션 상태(작업 중 · 권한 대기 · 완료 · 에러)
| 상태 | 판단 근거 | 주의 |
|---|---|---|
| 작업 중 | UserPromptSubmit 이후 ~ Stop 전. 중간 PreToolUse/PostToolUse/SubagentStart가 오는 동안 | |
| 권한 대기 | PermissionRequest 또는 Notification `notification_type:"permission_prompt"` | **응답(허용/거부) 이벤트는 훅에 없다.** 다음 Pre/PostToolUse가 오면 해제로 추정해야 함. 거부 후 Stop까지 아무 훅이 없으면 "대기"가 남을 수 있음 |
| 입력 대기(유휴) | Notification `idle_prompt` | 완료와 구분 불가능한 경우 있음(Stop과 함께 올지 미확인) |
| 완료 | Stop | **사용자가 Esc로 중단하면 Stop이 안 온다** → "작업 중"에 멈춘 채 남음. 백그라운드 작업이 있으면 `background_tasks`가 비어 있지 않을 때 "끝"이 아닐 수 있다 |
| 에러 | StopFailure(`error`) | API 오류만. 도구 실패(PostToolUseFailure)는 세션 에러가 아님 |
| 종료 | SessionEnd(`reason`) | SessionEnd 타임아웃 기본 1.5초, 훅 `timeout` 2초 설정과 별개 |
| 훅이 안 온 세션(터미널에서 Orbit 훅 없이) | | 로그만: 마지막 줄 시각, `system` `turn_duration`/`stop_hook_summary` 등. 완료/에러 구분 불가(로그에 Stop 대응 줄 못 찾음, ③) |

### 이 저장소가 지금 다루는 것
- `src-tauri/src/hooks.rs`: 11개 이벤트 이름을 모두 구독(SubagentStart/Stop, Notification, PermissionRequest, SessionEnd, StopFailure 포함).
- `src-tauri/src/sessions.rs`: `ingest_hook`는 `session_id`, `cwd`, 그리고 Pre/PostToolUse(+Failure)의 `tool_use_id`·`tool_name`만 `Event`로 만든다. **`agent_id`·`agent_type`·`hook_event_name`별 상태·`notification_type`·`error`는 저장하지 않는다.** 서브에이전트/상태 이벤트는 `touch`만 하고 반환. `Event`에 `agent_id` 필드 없음. `ingest_log`는 `message.content[]`의 `tool_use`/`tool_result`만 본다(`isSidechain`·`agentId`·`usage` 무시).
- `src-tauri/src/watch.rs`: `list_logs`가 `root/<dir>/<uuid>.jsonl`(깊이 2)만 읽는다. `subagents/agent-*.jsonl`은 의도적으로 제외(테스트 fixture 경로 `watch.rs:267`). 즉 ③ 결과만으로는 서브에이전트 로그가 아예 안 들어온다(결정 13(다) "서브에이전트 로그 포함은 ④에서").
- 프론트에는 원본 훅 payload가 `hook-event`로 그대로 emit되므로 훅 기반 그래프는 Rust 변경 없이 프론트에서 필드를 읽을 수도 있다(`src/App.tsx`는 이번에 안 읽음).

## 질문 2. Tauri 2: 앱 데이터 `screens/` 그림만 `<img>`로

### 찾은 것
- 설정: `app.security.assetProtocol` = `{ "enable": true, "scope": [...] }`, 기본 `enable:false`, `scope:[]` [CFG][ASSET]. scope는 glob 목록 또는 `{allow, deny, requireLiteralLeadingDot}`, `$APPDATA` 같은 변수로 시작 가능, `deny`가 `allow`보다 우선 [CFG][ASSET]. 예: `"scope": ["$APPDATA/screens/**/*"]` (설계 제안; 문서 예시는 `$APPCACHE/**/*` 형태). 넓은 패턴(`$HOME/**/*`, `**/*`)은 피하라고 문서가 권고 [ASSET]. 해석된 경로는 절대경로라 `*/**`는 안 맞는다 [ASSET].
- 허용 밖 경로는 WebView가 로드를 거부("asset protocol not configured to allow the path") [ASSET].
- 프론트: `convertFileSrc(filePath, protocol = "asset")`가 경로를 URL로 바꾼다. 요건은 (1) 설정에서 활성 (2) 파일이 scope 안 (3) 해당 출처가 CSP에서 허용 [CFS]. 반환 URL 형태(Windows `http://asset.localhost/…`, 그 외 `asset://localhost/…`)는 이번에 문서에서 직접 확인 못 했다(미확인).
- CSP: Tauri가 쓰는 예시는 `"img-src": "'self' asset: http://asset.localhost blob: data:"` [CSP], convertFileSrc 문서 예시는 `img-src 'self' asset: http://asset.localhost` [CFS]. 현재 이 저장소 `tauri.conf.json`은 `"csp": null`(CSP 없음). ④에서 CSP를 새로 켜면 Tauri가 번들 스크립트·스타일의 해시/nonce를 자동 추가하므로 개발자는 자기 출처만 쓰면 된다 [CSP]. 최소 후보: `default-src 'self'; img-src 'self' asset: http://asset.localhost; font-src 'self'; style-src 'self' 'unsafe-inline'`(후보, 미검증 — React 인라인 style 속성과 Vite dev 서버(`devUrl` `connect-src ws://localhost:1420`) 때문에 dev에서 깨질 수 있어 실제 실행 확인 필요; `devCsp`를 따로 둘 수 있음 [CFG]).
- Cargo: `tauri`에 `protocol-asset` 기능이 있다(= `http-range` 활성) [FEAT]. 이 기능 없이 `assetProtocol.enable:true`가 컴파일/빌드 오류가 되는지는 이번에 확인 못 했다(미확인). 현재 `Cargo.toml`은 `tauri = { version = "2", features = [] }`. 권장: `features = ["protocol-asset"]`을 넣고 `cargo build`로 확인. 최신 tauri 2.12.5 [FEAT].
- capability: asset 프로토콜 자체는 capability가 아니라 `tauri.conf.json`의 scope로 제어한다 [ASSET]. `<img src>` 로드에는 새 permission이 필요 없다(문서가 capability 항목을 요구하지 않음). 기존 `core:default`로 충분해 보이나 직접 실행 확인 전까지 가정.
- 폴더 열기:
  - 이미 설치됨: Cargo `tauri-plugin-opener = "2"`, npm `@tauri-apps/plugin-opener ^2`, `lib.rs:93`에서 `.plugin(tauri_plugin_opener::init())`, capability에 `opener:default`.
  - `opener:default`는 `allow-open-url`, `allow-reveal-item-in-dir`, `allow-default-urls`를 담고 `allow-open-path`는 **없다**. `openPath`는 `opener:allow-open-path`를 capability에 추가하고 경로 scope(`$APPDATA/screens` 등)를 줘야 한다 [OPENER]. `openPath`가 폴더에 대해 어떻게 동작하는지는 문서에 안 적혀 있다 → Windows에서 실행 확인 필요(미확인).
  - `revealItemInDir`는 기본 권한에 들어 있고 scope 없이 허용된다고 문서에 표기 [OPENER]. 폴더 자체를 인자로 주면 "그 폴더를 부모 폴더에서 선택해 연다"일 가능성이 있다(미확인).
  - 대안(권장 후보): Rust 명령 `open_screens_dir`가 경로를 직접 만들고(프론트가 경로를 넘기지 않음) Rust 쪽에서 `tauri_plugin_opener::OpenerExt`의 `open_path`로 연다. 프론트 capability/scope를 넓히지 않아도 되는지(Rust 호출은 scope 검사를 받지 않는다는 것)는 문서로 확인 못 했다(미확인, 구현 후 실행 확인). 새 의존성은 어느 쪽이든 필요 없다.
- `$APPDATA`가 `app_data_dir()`(= `%APPDATA%\dev.orbit.app`)와 같은 폴더를 가리키는지는 [CFG]에 변수 이름만 있고 식별자 붙는 규칙은 직접 확인 못 했다(미확인). `config.rs`가 `app_data_dir`을 이미 쓰므로(토큰 파일) 같은 위치다. scope 문자열과 Rust가 쓰는 폴더가 다르면 이미지가 안 뜨므로 실행 확인 항목.

## 질문 3. Galmuri11 번들과 라이선스

### 찾은 것
- 라이선스: **SIL OFL 1.1** [GAL]. 저작권 표기: `Copyright © 2019–2025 Lee Minseo (quiple@quiple.dev)` [GAL ofl.md]. Reserved Font Name은 선언되어 있지 않다 [GAL ofl.md](요약 도구 판독; 원문 대조 권장). README: 작성자는 폰트 파일에 저작권이 있고 "글꼴 디자인"에는 권리를 주장하지 않는다.
- 허용: 소프트웨어에 포함·임베드·재배포 가능, 수정본도 가능. 조건: 각 사본에 저작권 표기와 라이선스 전문을 함께 둘 것(별도 텍스트 파일·헤더·메타데이터 가능), 글꼴 단독 판매 금지, 수정본은 OFL 유지 [GAL ofl.md]. → **저장소에 글꼴 파일을 넣어도 된다.** 오르빗은 앱에 묶어 쓰므로 해당. 라이선스 전문(`OFL.txt`/`ofl.md`)을 글꼴 옆에 같이 두고 출처(repo URL, 버전, 커밋)를 기록하면 충족.
- 입수 방법: npm `galmuri`(최신 package.json 버전 2.40.3, 라이선스 OFL-1.1), `import 'galmuri/dist/galmuri.css'`, 패밀리 이름 `Galmuri11` [GAL]. CDN 링크는 있으나 Tauri 문서가 원격 콘텐츠를 피하라고 하므로 [CSP] 파일을 앱에 넣는 것이 맞다. `dist/`의 개별 파일명(woff2 등)은 확인 못 했다(미확인) → 설치 시 `node_modules/galmuri/dist/`를 열어 Galmuri11의 woff2만 `src/` 아래로 복사하는 식이 최소.
- 번들 방식(설계 판단): `src/assets/fonts/Galmuri11.woff2`를 `@font-face { font-family: Galmuri11; src: url(...) format("woff2"); }`로 선언하면 Vite가 해시 파일명으로 빌드에 포함한다. 한글 지원은 Galmuri 계열의 한글 글리프 포함(작성자 설명상 한글 비트맵 글꼴)이며 woff2에 한글이 들어 있는지는 파일을 열어 확인 필요(미확인). CSP를 켜면 `font-src 'self'`가 필요.
- 저장소에는 아직 Galmuri 파일이나 `@font-face`가 없다(Grep 결과 없음). `harness/skills/vendor/SOURCES.md`는 "외부 스킬" 규칙이라 글꼴에는 해당하지 않으나 같은 형식으로 출처를 남기는 것을 제안(Lead 판단; 글꼴 전용 `THIRD_PARTY.md` 등).

## 설계에 미치는 영향
1. 그래프: 실시간 노드(시작/종료/종류/토큰/시간)는 **훅만으로** 가능하다. 단 부모-자식 연결은 종료 시점(`tool_response.agentId`)에야 확정되고 시작 시점엔 추정이다 → 1단계 그래프(Lead → 서브에이전트 가로 흐름)는 "메인 → 평면 목록" 으로 충분하고 손자 노드·Workflow 노드는 데이터가 없어 범위 밖으로 둔다.
2. 실패 노드(`✕`)는 신뢰할 신호가 없다. 후보: Agent 도구의 PostToolUseFailure, 아니면 실패 표시를 SPEC에서 "도구 실패/세션 에러"로 좁힌다. Lead 결정 필요.
3. "과거 세션 그래프"는 서브에이전트 로그가 필요하다. 현재 `watch.rs`는 읽지 않으므로 (a) `list_logs`에 `subagents/` 포함 + `agentId` 보존 (b) 이번 ④에서는 훅 기반 라이브 그래프만 하고 과거는 후속으로 미룸, 중 선택해야 한다. (a)는 파서·세션 모델·중복키 변경이 따른다.
4. `sessions.rs`는 `agent_id`/`agent_type`/상태 계열 훅을 버린다. 그래프·상태 배지를 Rust 세션 모델에서 얻으려면 Event 확장, 프론트에서 `hook-event` 원본을 쓰려면 프론트 상태 머신이 필요(재시작하면 사라짐, DB 미도입 — 결정 13(나)).
5. 상태 배지: "완료"는 Stop뿐이라 사용자 중단이 영원히 "작업 중"으로 남는다 → 마지막 활동 후 N분 경과 시 "유휴/중단 추정"을 표시하는 등 타임아웃이 필요. "권한 대기"는 해제 이벤트가 없어 후속 도구 이벤트로 해제.
6. 서브에이전트 이벤트를 쓸 때 `agent_type`이 빈 문자열인 SubagentStop(내부 에이전트)은 노드로 만들지 않는다. 문자열은 전부 텍스트로만 렌더(CLAUDE.md).
7. 그림 표시: Cargo `protocol-asset` 추가 + `assetProtocol.scope`를 `$APPDATA/screens/**/*` 하나로 + CSP(현재 null)는 새로 켤지 결정 필요(켜면 `img-src 'self' asset: http://asset.localhost`, `font-src 'self'` 등). 확장자 필터와 경로 정규화는 Rust 명령에서(결정 13 보안 줄). 새 의존성 없음. 폴더 열기는 opener(이미 설치)로 가능, 권장은 Rust 명령에서 직접 열기(프론트 scope 확대 없음).
8. 글꼴: 저장소에 woff2 + OFL 전문 + 저작권 줄 + 출처 기록. 새 런타임 의존성 없음(npm 패키지는 복사용 일회성).

## 확인하지 못한 것
- Agent 도구가 실패했을 때 PostToolUseFailure가 오는지, 로그 `tool_result`의 오류 표시 필드.
- 로그의 `tool_use.name`이 `Agent`인지(문서 기준), `input.subagent_type` 존재(저장소 fixture에 서브에이전트 사례 없음; fixture는 `tool_use_id` 위주).
- SubagentStart/Pre(Agent)/Post(Agent) 훅 payload와 로그 `.meta.json` `toolUseId`의 실제 값 일치(③과 동일하게 미대조).
- 서브에이전트가 서브에이전트를 부를 수 있는지, 부모 id 표현, Dynamic Workflow 노드 필드.
- `convertFileSrc` 반환 URL 형태, `assetProtocol.enable:true`에서 `protocol-asset` 기능이 필수 빌드 조건인지, `$APPDATA`와 `app_data_dir()` 일치, `openPath`의 폴더 동작, Rust 쪽 `open_path`의 scope 면제 여부 — 모두 문서 직접 확인 못 함, 구현 후 `npm run tauri dev`에서 실행 확인 필요.
- CSP를 켰을 때 Vite dev/React 인라인 스타일과의 충돌 여부.
- Galmuri `dist/` 파일명, woff2의 한글 글리프 포함 여부, ofl.md 원문 대조(요약 도구 판독만).
- 훅 `Notification` `idle_prompt`가 Stop과 함께 오는지.
