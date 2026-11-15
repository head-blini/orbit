# RESEARCH: 마일스톤 ③ 세션 로그 감시

확인 날짜: 2026-11-14. 표기: **[문서]** = 공식 문서로 확인, **[실측]** = 이 PC의 실제 파일에서 필드 이름·type 값만 확인(바뀔 수 있음). 실제 로그의 내용(프롬프트·도구 입출력·경로)은 옮기지 않았다. 필드 이름과 열거값만 적었다.

출처 약칭
- [DIR] https://code.claude.com/docs/en/claude-directory (Application data 절)
- [SET] https://code.claude.com/docs/en/settings
- [HOOKS] https://code.claude.com/docs/en/hooks (②의 `.orbit/runs/20261114-hook-server/RESEARCH.md`에서 인용)
- [NOTIFY] https://docs.rs/notify/8.2.0/notify/ , https://docs.rs/crate/notify/8.2.0/source/src/windows.rs , https://crates.io/api/v1/crates/notify
- [RDCW] https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw
- [OOE] https://doc.rust-lang.org/std/os/windows/fs/trait.OpenOptionsExt.html

## 질문 1. 세션 JSONL 구조

### 문서로 확인한 것 [문서]
- 위치와 파일 ([DIR]):
  - `~/.claude/projects/<project>/<session>.jsonl`: 대화 transcript(메시지, 도구 호출, 도구 결과, 모델에 보낸 시스템 프롬프트·도구 정의·요청 파라미터까지).
  - `projects/<project>/<session>/subagents/`: 서브에이전트 transcript, "세션 transcript와 같은 형식". 부모 세션이 만료되면 함께 삭제.
  - `projects/<project>/<session>/tool-results/`: 큰 도구 출력과 MCP 이미지 원본이 별도 파일로 빠진다. `projects/<project>/<session>/mcp-tasks/`도 있다.
  - 세션이 transcript를 옆으로 치운 경우: `<session>.orphaned-<timestamp>-<suffix>.jsonl`, `<session>.jsonl.superseded-<timestamp>`. 세션 선택기에 안 나오는 옛 사본이다. 감시기는 `<uuid>.jsonl` 형태 파일명만 세션으로 취급해야 한다(orphaned는 `.jsonl`로 끝나므로 확장자만 보면 섞인다).
  - `<project>` 폴더명 규칙: 작업 디렉터리 경로의 영숫자 외 문자를 `-`로 바꾼 것(문서 예: `-Users-you-my-project`; 스크래치패드 설명에서 나온 규칙이고 projects 폴더에도 같은 모양이 쓰임). 손실 변환이라 슬러그에서 경로를 복원하지 말고 줄의 `cwd`를 쓴다.
- 경로 기준: Windows `~/.claude`는 `%USERPROFILE%\.claude`. `CLAUDE_CONFIG_DIR`를 설정하면 세션 기록을 포함해 전부 그 아래로 간다 ([DIR], [SET]). → 로그 루트는 `CLAUDE_CONFIG_DIR`이 있으면 그 아래 `projects`.
- 보관: `cleanupPeriodDays` 기본 30일, 최소 1, 0은 검증 오류. 오래되면 transcript·subagents·tool-results를 삭제한다. Claude Desktop/Cowork에서 시작한 세션은 `desktopSessionCleanupPeriodDays` 규칙을 따로 쓴다 ([DIR]). → 감시 중 파일이 사라질 수 있다(삭제 이벤트에 죽지 않기).
- transcript는 평문이며 `.env` 내용·명령 출력·자격증명이 그대로 들어간다 ([DIR]). → Orbit도 내용 로깅 금지(SPEC 일치).
- `CLAUDE_CODE_SKIP_PROMPT_HISTORY` 또는 `--no-session-persistence`/`persistSession:false`면 transcript를 안 쓴다 ([DIR]). → 그런 세션은 로그에 안 나오고 훅으로만 보인다.
- **줄 단위 스키마(필드·type 값)는 공식 문서에 없다.** 문서는 "같은 형식"이라고만 한다. 따라서 아래 [실측]은 전부 "바뀔 수 있는 것"이다.

### 실제 파일로만 확인한 것 [실측]
(파일 약 100개 이상, 여러 프로젝트, Claude Code 2.1.x. 줄 내용은 읽지 않고 Grep `-o`로 키·열거값만 뽑음)
- 서브에이전트 파일: `<session>/subagents/agent-<agentId>.jsonl` + 같은 이름의 `.meta.json`, `.prefix.json`. 문서의 `subagents/`와 일치. 서브에이전트 jsonl의 줄은 `"isSidechain":true`, `agentId` 키를 가지며 `sessionId`는 부모 세션 ID와 같았다(파일 하나에서 73줄 전부 부모 ID와 일치).
  - `.meta.json` 키: `agentType`, `isBuiltIn`, `launchedWithDefaults`, `description`, `toolUseId`(부모의 Agent 호출 tool_use id로 보임), `spawnDepth`, `requestShape`, `requestNonInteractive`, `pickedEffortModel`, `finished`. → 서브에이전트 ↔ 부모 호출 연결 후보. 단 이것도 비공식.
  - `.prefix.json` 키: `v`, `by`, `state`, `systemHash`, `toolsHash`, `cacheControlHash`, `toolNames`, `systemCharCount`, `model`, `fastMode`. 쓸 일 없음(무시).
- 최상위 `type` 값(줄 맨 앞 `{"type":"…"`로 시작하는 줄): `session-owner`, `queue-operation`(`operation`: `enqueue`/`dequeue`), `last-prompt`, `file-history-snapshot`, `atis-latch`, `api-request-shape`, `api-request-blob`, `api-request`, `cost-state`, `custom-title`, `agent-name`.
  - 이 줄들은 `parentUuid`/`uuid`가 없다. `sessionId`는 `cost-state`에는 있었고, `session-owner`(`accountUuid`), `queue-operation`, `last-prompt`(`lastPrompt`), `file-history-snapshot`(`messageId`)은 첫 키가 달라 `sessionId` 유무를 확인하지 못했다.
- 메시지 계열 줄은 `{"parentUuid":…,"isSidechain":…,…}`로 시작하고 `"type":"user"|"assistant"|"attachment"|"system"` + `uuid`를 가진다.
  - 공통 키(확인됨): `parentUuid`(첫 줄은 null), `isSidechain`, `uuid`, `timestamp`, `userType`(값 `external`), `entrypoint`(예 `claude-desktop`; CLI 등 다른 값은 미확인), `cwd`, `sessionId`, `version`, `gitBranch`, `promptId`(사용자 줄), `permissionMode`, `requestId`, `slug`, `agentId`(사이드체인).
  - `system` 줄은 `subtype`을 가진다: `stop_hook_summary`(+`level`), `turn_duration`.
  - `attachment` 줄은 안쪽 `attachment.type`이 매우 다양하다: `hook_success`, `deferred_tools_delta`, `agent_listing_delta`, `mcp_instructions_delta`, `skill_listing`, `total_tokens_reminder`, `session_context`, `date`, `credential_org`, `remote_session_change`, `prompt_snapshot` 등. 훅 관련 키 `hookName`, `hookEvent`, `toolUseID`, `durationMs`가 있다(어느 줄 종류에 붙는지는 미확인).
  - `assistant`: `message.role`, `message.model`, `message.usage`(`input_tokens`, `output_tokens`, `cache_read_input_tokens` …), `stop_reason`(예 `end_turn`), `service_tier`, `speed`. 비용 키 `costUSD`도 어딘가에 있다(위치 미확인). → 누적 토큰은 `usage`에서 합산 가능, 비용은 `cost-state` 줄이 후보(미확인).
- 도구 호출/결과(`message.content[]` 블록):
  - 호출: `{"type":"tool_use","id":…,"name":…,"input":…}`(`id`가 `type` 바로 다음 키).
  - 결과: `{"type":"tool_result","content":…,"tool_use_id":…}`는 `user` 줄 안에 들어가고, 같은 줄 최상위에 `toolUseResult`, `sourceToolAssistantUUID`가 붙는다.
  - 기타 블록 type: `text`, `thinking`.
  - 서버 도구(`server_tool_use`), `image`, `redacted_thinking`은 확인하려 했으나 이번 표본에서 나오지 않았다(미확인).
- 새 세션의 첫 줄: 확인한 파일들의 첫 줄은 `session-owner`/`queue-operation`/`attachment`(`parentUuid:null`)였다. 파일명이 세션 ID(UUID)다.
- 한 파일에 줄 종류가 섞여 있고 모르는 종류가 많다(위 목록만 11종 이상). → 파서는 `type`을 열거형으로 두지 말고 문자열로 받아 모르면 건너뛴다.

## 질문 2. 훅 페이로드와 로그 줄 맞추기

②의 11개 이벤트 필드 목록은 [HOOKS](②의 RESEARCH 질문 1)에서 가져왔다.

맞출 수 있는 키
| 훅 | 로그 | 상태 |
|---|---|---|
| `session_id` | 줄의 `sessionId`(=파일명 stem) | 같은 값으로 보임. [실측] 문자열 일치 확인은 서브에이전트 파일↔부모 폴더명에서만 했고, 훅 값과의 직접 대조는 안 함(미확인) |
| `transcript_path` (모든 이벤트의 공통 필드, [HOOKS]) | 파일 경로 | 훅이 로그 파일 경로를 직접 알려 준다. 슬러그 규칙을 추측할 필요가 없다. 경로는 정규화 후 `projects/` 아래인지 검사한 다음에만 쓴다(신뢰 경계) |
| `tool_use_id`(PreToolUse, PostToolUse, PostToolUseFailure) | `tool_use.id`, `tool_result.tool_use_id`, 훅 attachment의 `toolUseID` | 같은 값일 가능성이 높으나 훅 페이로드와 로그 값의 직접 대조는 못 했다(미확인, QA에서 실측 필요) |
| `agent_transcript_path`(SubagentStop), `agent_id`/`agent_type`(서브에이전트 훅) | `subagents/agent-<agentId>.jsonl`, 줄의 `agentId` | 형태상 대응. 문자열 일치는 미확인 |
| `cwd` | 줄의 `cwd` | 대응 |
| `prompt_id` | 줄의 `promptId` | 이름만 대응(값 일치 미확인) |
| (훅에 시각 없음) | 줄의 `timestamp` | 훅 이벤트에는 타임스탬프 필드가 없다([HOOKS] 공통 필드 목록에 없음). 도착 시각은 Orbit이 찍는다 |

훅에만 있는 것: `permission_mode`(로그에도 `permissionMode` 있음), PermissionRequest·Notification(`notification_type`)·StopFailure·SessionEnd 같은 UI 신호(로그에서 대응 줄 종류는 못 찾음, 단 훅 성공 attachment와 `stop_hook_summary`는 있음), `last_assistant_message`, 실시간성(훅은 즉시, 로그는 flush 시점).
로그에만 있는 것: 훅 설치 전 과거 기록, 모델 `usage`(토큰), `gitBranch`, `version`, `slug`, `custom-title`/`agent-name`, 사이드체인 메시지 전체, `parentUuid` 체인(대화 트리).

중복 제거 키(SPEC "오르빗 데이터 저장": `tool_use_id`+종류, 없으면 줄의 `uuid`)는 필드가 실제로 존재해 성립한다. 종류 = {호출 시작(Pre/`tool_use`), 결과(Post/`tool_result`), 실패(PostToolUseFailure/`tool_result`의 오류 표시)}. `tool_result`의 오류 표시 필드(`is_error` 등)는 이번 조사에서 확인하지 못했다(미확인).
uuid 없는 줄 종류(`last-prompt`, `queue-operation` 등)는 중복 키가 없다. 줄을 (파일, 바이트 오프셋)으로 식별하면 재읽기 중복은 막힌다.

"새 세션 시작" 신호(SessionStart는 http 훅 불가 — `docs/solutions/hook-server.md`):
- 문서에 로그 기반 신호 정의는 없다. [실측]으로는 (a) `projects/<slug>/` 아래 새 `<uuid>.jsonl` 파일 생성, (b) 그 파일의 첫 줄(`parentUuid:null`, 대개 `session-owner`/`queue-operation`/`attachment`)이 후보다.
- `--resume`/`/clear`/compact가 새 파일을 만드는지, 기존 파일에 이어 쓰는지, `.orphaned-`/`.superseded-` 사본을 만드는지는 확인하지 못했다([DIR]은 이런 사본이 있다고만 함). → "파일 생성 = 새 세션"으로 단정하면 resume에서 틀릴 수 있다. 세션 ID(`sessionId`) 기준 upsert가 안전하다.
- SessionStart 훅의 `source`(startup/resume/clear/compact/fork, [HOOKS])는 훅이 못 오니 로그에서 복원할 수 없다. UI에 "출처" 구분이 필요하면 미제공으로 둔다.

## 질문 3. Rust 파일 감시

### notify 크레이트 [NOTIFY]
- crates.io: 안정 최신 **8.2.2**, 프리릴리스 9.0.0-rc.8(2026-11-09 갱신). 라이선스 CC0-1.0(9.0 rc 항목 기준; 8.x 라이선스 필드는 응답에 없어 **미확인**, 도입 전 확인 필요). MSRV 1.88(검색 요약; 직접 확인 못 함). tauri MSRV 1.90보다 낮아 충돌 없음.
- Windows 백엔드: `ReadDirectoryChangesW`. 8.2.0 소스: 버퍼 16 KiB, 필터 FILE_NAME·DIR_NAME·ATTRIBUTES·SIZE·LAST_WRITE·CREATION·SECURITY, 디렉터리 핸들 공유 모드 READ|WRITE|DELETE(쓰는 쪽을 막지 않음), 재귀는 `RecursiveMode::Recursive`일 때만. `FILE_ACTION_MODIFIED` → `Modify(Any)`, 이름 변경 → `Modify(Name(From/To))`, 추가 → `Create(Any)`, 삭제 → `Remove(Any)`.
- **버퍼 넘침 처리가 없다**: 소스상 반환 바이트 0(넘침)을 검사해 Rescan 이벤트를 내는 코드가 없다(확인한 8.2.0 소스 기준; 요약 도구 판독이라 한 번 더 검증 권장). MS 문서는 넘치면 버퍼 전체를 버리고 `lpBytesReturned`=0을 돌려주며 "디렉터리를 직접 열거해 변경을 계산하라"고 한다 [RDCW]. → 이벤트를 유일한 진실로 삼으면 가끔 새 줄을 놓칠 수 있다. 느린 보정 스캔(예: 수 초마다 각 파일 크기 확인)이 필요하다.
- **덧붙이기 이벤트는 지연·병합된다**: MS 문서상 SIZE·LAST_WRITE 통지는 "디스크에 쓰일 때만, 캐시가 충분히 flush될 때" 발생한다 [RDCW]. 실시간 보장이 아니다. 신뢰성 주의의 근거.
- 편집기마다 저장 방식(잘라쓰기/교체)이 달라 Write/Delete/Create 조합이 다르다 [NOTIFY Known Problems]. 로그 파일은 덧붙이기라 영향이 작지만 "이벤트 종류로 판단하지 말고 어쨌든 파일 크기를 다시 본다"가 안전.
- debouncer: 공식은 `notify-debouncer-mini`/`notify-debouncer-full`을 안내([NOTIFY]). 우리는 이벤트를 "이 경로를 다시 읽어라" 신호로만 쓰면 되어 debouncer 없이 `HashSet`으로 합치는 정도로 충분해 보인다(설계 판단, 문서 근거 없음).
- 네트워크 파일시스템·WSL에서 Windows 경로를 보면 이벤트가 안 온다고 명시 [NOTIFY]. `PollWatcher`가 대안. `~/.claude`가 OneDrive/네트워크 드라이브에 있으면 해당(이 PC에서는 로컬 `C:\Users\…`이지만 프로젝트 일부가 OneDrive 바탕화면 아래에 있다. 로그 폴더 자체는 `C:\Users\<user>\.claude\projects`).
- 새 하위 폴더(슬러그) 생성도 재귀 감시가 잡아야 한다. 이벤트 기반이면 폴더 생성 직후 그 안에 이미 쓰인 파일을 놓칠 수 있어 "새 디렉터리 이벤트 → 열거" 처리가 필요하다.
- 의존성 비용: notify 8은 Windows에서 `windows-sys` 등을 끌어온다(정확한 목록은 확인 안 함, 미확인). 이 저장소 규칙 "요청 없는 의존성 금지"에 비추면 요청 원문이 "notify 등"이라 허용 범위이긴 하다.

### std 폴링 대안 (설계 판단, 문서 인용 없음)
- 장점: 의존성 0, 동작이 예측 가능, 넘침·지연·네트워크 FS 문제가 없다(어차피 크기를 직접 본다), 테스트가 쉽다(임시 폴더에 파일 덧붙이고 `poll()` 호출).
- 단점: 지연(폴링 주기), 파일 많을 때 `read_dir` 재귀 비용. 오래된 세션이 많아도(이 PC는 100개 이상) 크기·mtime 비교만 하면 수백 개 stat은 가볍다. 단 보관 30일 내 파일이 수천 개면 주기를 늘리거나 최근 변경 파일만 보는 최적화가 필요.
- 혼합안: notify는 "깨우기"만, 실제로는 항상 (경로, 오프셋)과 현재 크기를 비교 + 몇 초마다 전체 스캔 보정. 폴링만 쓰는 안은 이 보정과 같은 코드라 폴링이 하위집합이다.

### 오프셋으로 이어 읽기 주의점
- 줄이 반쯤 쓰인 상태: 마지막 `\n`까지만 처리하고 오프셋을 그 뒤로 둔다. `\n` 없는 꼬리는 다음 회차로 미룬다(파일이 영영 안 끝나는 줄이면 길이 상한 두기). 바이트 단위로 자르고 UTF-8 변환은 완결된 줄에서만(다중 바이트가 경계에서 끊김).
- JSON 파싱 실패 줄은 건너뛰되(오프셋은 전진) 죽지 않기. 줄 길이가 매우 길 수 있다: 줄에 시스템 프롬프트·도구 정의·`api-request-blob`이 들어가므로 상한(예: 몇 MB) 초과 줄은 파싱하지 않고 건너뛰는 것이 안전(상한값은 실측 필요, 이번엔 줄 길이 분포를 안 쟀다).
- 잘림·교체: 현재 크기 < 저장 오프셋이면 잘림/교체로 보고 0부터 다시 읽되, 중복 키로 이미 넣은 이벤트는 걸러진다. 같은 이름의 파일이 교체됐는데 더 크면 못 알아챈다 → 파일 ID(Windows는 `std::os::windows::fs::MetadataExt`의 volume_serial/file_index는 nightly라 쓰기 어렵다고 알려져 있음, 미확인) 대신 "첫 N바이트 해시" 같은 지문을 오프셋과 같이 저장하는 방법이 후보. `.superseded-`/`.orphaned-` 같은 이름 변경은 [DIR]에 근거가 있어 실제로 일어난다.
- 첫 구독 시 과거 로그: SPEC 완료 기준 "Orbit을 나중에 켜도 과거 세션이 로그에서 복원된다"에 따라 0부터 읽는다. 용량(이 PC 로그 100+개, 큰 것은 수 MB 이상 추정)이 있으므로 UI 스레드가 아닌 백그라운드에서, 이벤트는 배치로 emit.
- 삭제: `cleanupPeriodDays` 정리로 읽는 도중 파일이 사라질 수 있다 → NotFound는 오류가 아니라 "그 세션 로그 없음"으로 처리(SPEC "로그가 사라진 세션은 DB에 남은 요약만").
- **쓰는 쪽을 막지 않는가**: Rust `File::open`은 Windows에서 `FILE_SHARE_READ|WRITE|DELETE`를 기본으로 쓰므로 읽기 중에도 다른 프로세스가 쓰기·삭제·이름 변경을 할 수 있다 [OOE]. `share_mode(0)` 같은 설정을 하지 않으면 된다. 읽을 때마다 열고 닫는 방식이면 핸들을 오래 쥐지 않아 삭제 지연(정리 스윕·orphaned 이름 변경)도 최소화된다. Claude Code 쪽(Node) 핸들의 공유 모드는 문서로 확인하지 못했다(미확인): 공유 모드가 읽기를 허용하지 않으면 우리 `open`이 실패(공유 위반)할 수 있으므로 열기 실패는 재시도 대상이며 조용히 넘어가야 한다. 이 PC에서 현재 실행 중 세션의 활성 로그를 ripgrep이 문제없이 읽은 사실은 있다(실측, 간접 근거).
- CLAUDE.md "Orbit이 꺼져 있어도 Claude Code를 막지 않는다"는 읽기 전용 감시만으로 충족된다. Orbit은 로그를 쓰지도 지우지도 않는다(SPEC 일치).

## 질문 4. 코드베이스 접점

지금 구조 (직접 읽음):
- `src-tauri/src/lib.rs`: `mod config; mod hooks; mod server;`. `AppState { cfg, server, settings_path }`. `setup`에서 `config::load_or_create(app_data_dir)` → `server::start(port, token, on_event)`(콜백에서 `handle.emit("hook-event", v)`) → `settings_path`를 `home_dir/.claude/settings.json`으로 만들고 **`#[cfg(debug_assertions)]`일 때만** `ORBIT_CLAUDE_SETTINGS` 환경변수로 덮어쓴다. 명령: `get_status`, `install_hooks`, `uninstall_hooks`. `invoke_handler`에 등록.
- `src-tauri/src/server.rs`: std `TcpListener`, 연결당 스레드, 응답 204, 이벤트는 `mpsc` 채널 → 단일 소비 스레드가 `on_event`(Value) 호출. `start(port, token, impl Fn(Value)+Send+'static)`.
- `src-tauri/src/config.rs`: `hook-server.json`(app_data_dir) 토큰·포트 저장, 임시 파일 → rename.
- `src-tauri/Cargo.toml`: tauri 2, tauri-plugin-opener 2, serde, serde_json(preserve_order), getrandom 0.4. edition 2024. release는 `panic = "abort"` → **파서 스레드에서 panic하면 앱 전체가 죽는다**(release). 파서는 `unwrap` 금지, 스레드 경계에서 `catch_unwind`는 abort 때문에 무의미하므로 코드 자체가 panic하지 않게(`serde_json::Value`와 `.get()/as_str()` 위주) 짜야 한다.
- `src-tauri/capabilities/default.json`: `core:default`, `opener:default`만. 프론트가 `listen("session-log-event")` 같은 새 이벤트를 받는 데 별도 권한이 필요한지는 ②와 같은 미확인(②는 `hook-event` listen이 현재 동작 중이라 `core:default`로 충분하다는 간접 증거가 이미 있음). 새 Rust 명령은 앱 커스텀 명령이라 capability 불필요(Tauri 2에서 plugin이 아닌 앱 명령은 기본 허용으로 알고 있으나 이번엔 문서 확인 안 함 → 미확인). 로그 읽기는 Rust 쪽에서만 하므로 `fs` 플러그인 권한을 새로 열 필요가 없다(열지 말 것).
- `src/App.tsx`: `invoke("get_status")`, `listen("hook-event", …)`로 이벤트 수신(15회 참조). 새 이벤트도 같은 패턴. 로그·페이로드의 문자열은 텍스트로만 렌더(`dangerouslySetInnerHTML` 금지, CLAUDE.md).

`ORBIT_CLAUDE_SETTINGS` 방식(②): 디버그 빌드 전용 env 하나로 설정 파일 경로를 임시 사본으로 바꾸고, 릴리스 빌드에서는 컴파일 단계에서 코드가 빠져 일반 사용자가 환경변수로 경로를 바꿀 수 없다(`docs/solutions/hook-server.md` "QA는 실제 settings를 건드리지 않는다"). 로그 폴더도 같은 식으로 `#[cfg(debug_assertions)]` + 새 env(예: `ORBIT_CLAUDE_PROJECTS`) → `AppState`에 `projects_dir: Result<PathBuf,String>` 필드 추가가 일관된 접점이다. 기본값은 `CLAUDE_CONFIG_DIR`(있으면) 아니면 `home_dir/.claude`의 `projects`. `CLAUDE_CONFIG_DIR`은 사용자의 실제 설정이므로 디버그 전용이 아니라 항상 존중해야 한다 [DIR].
- 감시기는 서버처럼 `setup`에서 스레드로 띄우고 `app.handle().clone()`으로 emit. 훅 이벤트(`hook-event`)와 로그 이벤트를 합치는 곳(중복 제거·세션 모델)이 아직 없다: ②는 emit만 하고 DB·세션 모델 저장소가 없다(SPEC의 DB는 ③에서 필요한지가 설계 결정 사항). 스캔한 범위(오프셋)를 저장할 곳도 정해야 한다(`app_data_dir` 파일이 후보, SPEC "세션 … 읽은 위치(offset)").
- 테스트 규약: `cargo test`가 `server.rs`·`config.rs`에 단위 테스트를 둠(임시 디렉터리 패턴: `std::env::temp_dir()` + pid + 카운터). 감시기도 같은 패턴으로 임시 폴더에 줄을 덧붙이는 테스트(반쪽 줄, 잘림, 모르는 type, 깨진 JSON, 삭제)를 쓸 수 있다. 의존성이 없는 쪽이 이 방식에 잘 맞는다.

## SPEC.md와 다른 점 / 확인된 가정

1. SPEC "새 줄을 파싱"은 맞다. 단 SPEC이 말한 "(세션 ID, 중복 키) 유일 제약, 중복 키 = `tool_use_id`+종류, 없으면 uuid"는 로그 쪽에 `tool_use.id`/`tool_result.tool_use_id`/`uuid`가 실제로 있어 성립한다([실측]). 훅 쪽 값과 같은지는 아직 대조하지 않았다.
2. SPEC "세션 시작 정보는 ③ 세션 로그에서"는 첫 줄 종류나 파일 생성 시점으로 근사할 수 있으나 `source`(resume/clear 등)는 로그에서 못 얻는다.
3. SPEC은 서브에이전트가 같은 폴더인지 말하지 않았다. 실제는 `<session>/subagents/agent-<id>.jsonl`(문서+실측). 서브에이전트 파일을 부모 세션의 하위로 묶고 `projects/*/*.jsonl`만 보는 얕은 스캔으로는 놓친다 → 재귀 필요.
4. SPEC "누적 토큰/비용(로그에서 얻을 수 있으면)": 토큰은 `assistant` 줄의 `message.usage`에서 얻을 수 있다(실측). 비용은 `costUSD`, `cost-state` 줄이 후보이나 의미(누적/증분)는 미확인.

## 설계에 미치는 영향 (요약)

- 파서: `serde_json::from_str::<Value>` → 최상위 `type`(문자열)로 분기, 모르는 type·키는 무시, 파싱 실패 줄은 건너뜀(오프셋 전진). release가 `panic=abort`이므로 인덱싱·`unwrap` 금지.
- 세션 식별은 파일명 stem(UUID) 또는 줄의 `sessionId`. 서브에이전트는 경로에 `/subagents/`가 있으면 사이드체인으로 부모 세션에 귀속. 슬러그는 표시용으로도 신뢰하지 말고 `cwd` 필드를 쓰되 그것도 신뢰할 수 없는 문자열(경로로 쓰지 않음).
- 파일 선별: `projects/<slug>/<uuid>.jsonl`, `projects/<slug>/<uuid>/subagents/agent-*.jsonl`. `.orphaned-`·`.superseded-`·`tool-results/`·`.meta.json`·`.prefix.json`은 제외.
- 감시 방식은 폴링(의존성 0)이 요구에 맞고 가장 단순하다. notify를 쓰면 "깨우기 + 주기적 전체 보정"이 필요해 어차피 폴링 코드를 포함한다. 결정은 Lead/Architect 몫.
- 오프셋은 완결된 줄(`\n`)까지만 전진, 크기 감소 시 0부터. 열 때마다 열고 닫기, 공유 모드 기본값 유지.
- 훅↔로그 합치기: 1차 키 `session_id==sessionId`, 도구 이벤트는 `tool_use_id`; 훅의 `transcript_path`로 파일을 직접 지정할 수 있다. QA에서 실제 훅 페이로드와 로그 줄의 `tool_use_id` 일치를 실측할 것.
- 프론트 전달은 `emit`(배치), capability 변경 불필요로 보임(②와 동일한 미확인 포함). 로그 폴더 테스트용 env는 `#[cfg(debug_assertions)]` 전용으로 ②와 같은 방식.

## 확인하지 못한 것

- 줄 스키마의 공식 정의(없음으로 보임). 모든 type·키 목록은 이 PC 표본 기준이며 CLI 터미널 세션(`entrypoint` 다른 값), Bedrock/Vertex 등은 못 봤다.
- 훅의 `tool_use_id`/`session_id`/`agent_id`와 로그 값이 문자열로 같은지(둘 다 실제로 대조하지 않음).
- `tool_result` 실패 표시 필드(`is_error` 등), `costUSD`·`cost-state`의 의미, `sessionId` 없는 줄 종류.
- resume/clear/compact/fork가 파일을 새로 만드는지 이어 쓰는지. orphaned/superseded가 언제 생기는지.
- Claude Code가 로그를 쓰는 방식(flush 주기, 한 줄을 한 번에 쓰는지)과 Windows 공유 모드.
- 줄 길이 분포(상한 정할 근거), 파일 수·크기에 따른 폴링 비용.
- notify 8.2.x 라이선스 필드, 정확한 전이 의존성 목록, MSRV 1.88(검색 요약에만 근거), Rescan 미발행(소스 판독 요약에만 근거).
- 앱 정의 Tauri 명령의 capability 필요 여부, `core:default`의 listen 권한(②에서 이어짐).
- `profile.json`: 현재 내용이 낡지 않아 변경하지 않음.
