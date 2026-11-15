# SECURITY — 20261114-session-log-watch (security-deep)

대상: `git diff main...orbit/20261114-session-log-watch` (2d13d9d..83cc9fa, 커밋 6개). 바뀐 파일: `src-tauri/src/lib.rs`, `src-tauri/src/sessions.rs`(새 파일), `src-tauri/src/watch.rs`(새 파일), `src/App.tsx`, `src/App.css`.
모드: security-deep. 파일 감시와 신뢰할 수 없는 외부 입력(JSONL) 파싱이 새로 생겼고, 훅 서버 콜백이 바뀌었고, full 트랙이다. 작업 트리가 깨끗할 때(`git status --porcelain --untracked-files=no` 출력 없음) HEAD를 감사했다. 감사를 시작할 때와 끝낼 때 HEAD가 같았다.

COMMIT: 83cc9fa7e02cea1acd7f863a99c171ab2f13d665

## 요약

- 차단 0건.
- 권고 8건(A1~A8). 모두 **후속 목록에 적을 것**이다. 이 프로젝트는 권고를 바로 새 run으로 만들지 않는다.
- 가장 무거운 권고는 A1과 A2다.
  - A1: 16 MiB 줄 하나가 `serde_json::Value`로 바뀌면서 메모리가 수백 MiB에서 1 GiB 넘게까지 일시적으로 커질 수 있다(추정, 측정 안 함).
  - A2: 블록이 아주 많은 줄은 중복 키 집합을 끝없이 키운다. 또 그 줄을 처리하는 동안 잠금을 오래 쥔다.
  - 두 경우 모두 최악의 결과는 Orbit 프로세스의 OOM 종료다. 그 줄이 남아 있으면 Orbit을 켤 때마다 다시 일어날 수 있다. Claude Code는 막히거나 느려지지 않는다. 데이터가 새거나 바뀌지도 않는다.
- 좋아진 점
  - ②에서는 훅 페이로드 전체(`tool_input`, 프롬프트 포함)를 `hook-event`로 webview에 보냈다.
  - 이제는 고른 필드만 보낸다: 세션 ID, cwd, 시각, 도구 이름, tool_use_id. 프롬프트·코드·도구 입출력은 화면 쪽으로 가지 않는다.
- 사용자가 이미 수용한 것(PLAN R1~R10, `.orbit/decisions.md` 12번 S1)은 이번 변경으로 범위가 넓어지지 않았다. A1·A2·A3은 R3·R7이 가정한 "작음"을 넘는 최악의 경우를 적은 것이다.

## 위협 모델 (이번 변경분)

**자산**
- 로그 내용: 사용자의 프롬프트, 코드, 도구 입출력, 그 안의 비밀값.
- 사용자의 로그 파일 자체(무결성).
- Claude Code의 가용성: 로그 쓰기, 이름 바꾸기, 삭제.
- Orbit의 가용성과 화면 타임라인의 정확성. 이 화면은 감시 도구다.
- 훅 토큰. 이번에 바뀌지 않았다.

**진입점과 쓰는 주체**
1. `<projects>/<slug>/<uuid>.jsonl` 파일
   - Claude Code가 쓴다.
   - 줄의 내용은 신뢰할 수 없다. 프롬프트 인젝션을 받은 모델이 만든 tool_use(`name`, `input`), MCP 서버나 도구가 돌려준 결과(tool_result 안의 구조화된 JSON), 저장소 파일 내용이 섞여 들어온다.
   - 줄 구조(`\n` 경계)는 Claude Code가 JSON으로 직렬화하므로 내용으로는 바꿀 수 없다.
   - 같은 계정의 다른 프로세스도 이 폴더에 쓸 수 있다. 그러나 이 프로세스는 이미 사용자 권한을 가졌으므로 새로운 공격자가 아니다.
2. 환경 변수
   - `CLAUDE_CONFIG_DIR`: 릴리스에서도 쓴다.
   - `ORBIT_CLAUDE_PROJECTS`: 디버그 빌드에서만 쓴다.
   - 환경 변수를 정할 수 있는 주체는 Claude Code도 같은 방법으로 조종할 수 있다. 그래서 신뢰 경계가 아니다.
3. 훅 서버(②) → `ingest_hook`. 토큰을 통과한 요청만 들어온다.
4. webview → `get_sessions` 명령. 읽기 전용이고 인자가 없다.

**신뢰 경계 흐름**: JSONL 줄 → `watch::consume`(16 MiB 상한) → `serde_json::from_slice`(깊이 128 상한, 기본값) → `Store::ingest_log`(필드 6개만 꺼낸다: `timestamp`, `cwd`, `uuid`, `message.content[].type/id/tool_use_id/name`) → `Session` 스냅숏 → Tauri `emit("session-update")` → React 텍스트 노드.

| 위협 | 결과 | 판정 |
|---|---|---|
| 로그 문자열이 HTML, 경로, 셸 명령으로 쓰임 | 쓰이지 않는다. Rust는 로그 문자열을 경로·명령으로 쓰지 않는다. 세션 ID는 파일 stem인데, UUID 모양으로 검사한 뒤 표시와 맵 키로만 쓴다. 프론트는 JSX 텍스트로만 넣는다(`App.tsx:118-126,149-153`). `dangerouslySetInnerHTML`·`innerHTML`·`eval` grep 결과 없음 | 지킴 |
| 거대한 줄 | 줄이 16 MiB를 넘으면 버린다(`watch.rs:105-119`). 읽기 버퍼는 16 MiB+1 단위다(용량은 최대 약 32 MiB, REVIEW N14). 상한 안의 줄이 Value로 바뀔 때 커지는 메모리는 막지 않는다 | A1 권고 |
| 깊게 중첩된 JSON | serde_json 기본 재귀 상한 128에서 오류가 나고 그 줄을 버린다. `unbounded_depth` feature를 쓰지 않는다(Cargo.toml 확인). 스택 오버플로·panic 없음. 대신 그 줄의 도구 블록이 화면에서 빠진다 | 지킴, 숨기기는 A4 |
| 블록·세션 ID가 아주 많음 | 이벤트는 세션당 500개로 제한된다. 그러나 `seen` 키 집합과 세션 수에는 상한이 없다. 블록마다 `Vec::remove(0)`가 일어나고, 잠금은 줄 단위로 쥔다 | A2 권고 |
| `\n` 없이 끝없이 자라는 꼬리 | 16 MiB 이하면 offset을 그대로 두고 다음 회차에 다시 읽는다. 16 MiB를 넘으면 skipping으로 넘긴다. 한 회차는 파일 끝까지 계속 읽는다(W1 수정) | 지킴, 회차 독점은 A6 |
| panic(release는 `panic = "abort"`) | 운영 코드에 `unwrap`·`expect`·인덱싱이 없다. `split_at(i)`의 i는 `position` 결과다. `get(1..)`과 `str::get` 슬라이스는 경계가 아니면 None을 준다. `parse_ms`는 연도 ≤ 9999라 i64 오버플로가 없고 `u64::try_from`으로 변환한다. offset은 `saturating_add`. 잠금 poison은 `into_inner`로 처리한다. 스레드 생성 실패만 panic한다(A8) | 지킴 |
| 로그 폴더 밖 읽기 | 깊이 2만 본다. `DirEntry::file_type()`은 링크를 따라가지 않으므로 심볼릭 링크는 `is_dir`/`is_file`가 둘 다 false다. Windows 정션도 name-surrogate 재분석 지점이라 std가 symlink로 분류해 걸러진다(std 동작 지식, 실측 안 함 — 프로브 파일 쓰기가 관문에 막힘). 하드링크와 "목록 작성 → open" 사이의 바꿔치기는 막지 못한다. 하지만 둘 다 projects 폴더에 쓰기 권한이 있어야 하고, 읽은 내용은 필드 6개로만 해석되어 프로세스 밖으로 나가지 않는다 | 지킴(경계 아님) |
| 로그 내용 유출 | 콘솔 출력 없음(`println!`/`eprintln!`/`dbg!` grep 결과 없음). 파일 쓰기 없음. emit 페이로드는 `Session`/`Event` 필드뿐이다(`sessions.rs:7-27`, `key`는 `serde(skip)`). cwd 경로와 도구 이름은 화면에 보이지만 이 앱의 목적에 필요한 값이다 | 지킴 |
| Orbit이 로그를 쓰거나 Claude Code의 쓰기를 막음 | 운영 코드에 쓰기·삭제·이름 바꾸기 호출이 없다. grep에 걸린 것은 전부 `#[cfg(test)]` 안(`watch.rs:125~`, `lib.rs:163~`)이다. `File::open`은 std 기본 공유 모드(READ·WRITE·DELETE)를 쓰고 `share_mode` 호출이 없다. 핸들은 회차가 끝나면 닫는다(`watch.rs:86-98`) | 지킴, 잔여는 A7 |
| `CLAUDE_CONFIG_DIR`(릴리스) | 비어 있지 않으면 `<값>/projects`를 쓴다(`lib.rs:128-129`, DECISIONS 5 수용). 상대 경로면 프로세스 cwd를 기준으로 풀린다. 환경 변수를 정할 수 있는 주체는 이미 Claude Code를 조종할 수 있어 새 위험이 아니다 | 지킴 |
| `ORBIT_CLAUDE_PROJECTS` | `#[cfg(debug_assertions)]` 문장 하나 안에만 있다(`lib.rs:136-139`). release 프로필에 `debug-assertions = true`가 없으므로 릴리스에서는 컴파일되지 않는다 | 지킴 |
| 훅 서버 경로가 약해졌는가 | `server.rs`는 바뀌지 않았다. 콜백은 응답 204를 보낸 뒤 별도 소비 스레드에서 돈다(`server.rs:100-108,122`). 콜백이 store 잠금을 기다려도 Claude Code는 기다리지 않는다. 대기 중에는 mpsc 큐(상한 없음)에 쌓이고, 쌓이는 것은 토큰을 통과한 이벤트뿐이다. webview로 가는 데이터는 오히려 줄었다(위 요약) | 약해지지 않음 |
| capability·CSP | `src-tauri/capabilities`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json` diff 출력 없음. 새 명령 `get_sessions`는 인자 없이 읽기만 한다 | 그대로 |

## 차단

없음.

## 권고 (전부 "후속 목록에 적을 것")

### A1 · 권고 · 상한 안의 줄이 Value로 바뀌면서 메모리가 크게 늘 수 있음
- 위치: `src-tauri/src/watch.rs:114`(`serde_json::from_slice::<Value>`), `src-tauri/Cargo.toml`(`serde_json` `preserve_order`).
- 시나리오
  - tool_result나 도구 입력에 구조화된 JSON이 그대로 기록되고, 그 안에 `[0,0,0,…]` 같은 작은 원소가 16 MiB 가까이 들어 있다고 하자. MCP 서버의 구조화 결과나 인젝션된 모델 출력에서 나올 수 있다. Claude Code가 이런 값을 문자열이 아닌 JSON 그대로 기록하는지는 확인하지 못했다.
  - 원소 하나(2바이트)가 Value 하나가 된다. `preserve_order`(IndexMap)에서 Value는 약 72~80바이트로 추정한다. 그러면 원소 약 840만 개 × 약 72~80바이트 ≈ 600 MiB다. Vec이 용량을 두 배로 늘리는 순간에는 잠깐 1 GiB를 넘을 수 있다(추정, 측정 안 함).
  - 할당이 실패하면 프로세스가 종료된다. 감시 스레드는 시작할 때 처음부터 다 읽으므로, 그 줄이 로그에 남아 있는 한 Orbit을 켤 때마다 같은 일이 생길 수 있다.
  - Claude Code와 로그 파일은 영향받지 않는다.
- 권장 수정: `Value` 전체 대신 필요한 필드만 담는 `#[derive(Deserialize)]` 구조체로 파싱한다. 나머지는 `IgnoredAny`로 건너뛴다. 이렇게 하면 할당이 필드 수에 비례한다. 또는 상한을 낮춘다(DECISIONS 6과 함께 다시 정함).

### A2 · 권고 · 블록이 아주 많은 줄: `seen` 무한 증가, 잠금 장기 보유
- 위치: `src-tauri/src/sessions.rs:40-49`(`seen.insert`, `events.remove(0)`), `:112-142`(블록 루프), `:127-130`(`rfind`). `src-tauri/src/lib.rs:38-43`(줄 단위 잠금).
- 시나리오
  - 한 줄의 `message.content`에 id가 모두 다른 `tool_result` 블록이 수십만 개 들어 있다(16 MiB ÷ 블록당 약 45바이트 ≈ 37만 개).
  - 블록마다 다음이 일어난다: `seen`에 키 추가(줄 하나에 약 30 MiB가 남고 해제되지 않음), `remove(0)`로 Event(약 112바이트) 500개를 memmove, 500건 `rfind`.
  - 그동안 store 잠금을 계속 쥔다. 그래서 훅 이벤트의 화면 갱신이 수 초 늦어진다(계산값). 그 사이 훅 이벤트는 mpsc 큐에 쌓인다.
  - 이런 줄이 파일 전체에 퍼져 있으면 `seen`이 로그 크기에 비례해 커진다(1 GiB 로그면 GiB 규모). R7은 "작음으로 추정"이라며 수용했지만, 최악의 경우는 그 가정 밖이다.
  - 세션 수에도 상한이 없다. 다만 세션을 늘리려면 UUID 이름의 파일을 만들거나 토큰을 가져야 한다.
- 권장 수정: 줄당 블록 수에 상한을 둔다. `seen`을 세션별 상한이 있는 집합으로 바꾸거나, 밀려난 키를 오래된 순으로 지운다. `VecDeque`(REVIEW N4). 잠금은 블록 N개마다 놓는다.

### A3 · 권고 · 문자열 필드 길이에 상한이 없음
- 위치: `src-tauri/src/sessions.rs:69,96,125,135`(`cwd`, `tool`, `tool_use_id`), `:56-57`(훅 `session_id`).
- 시나리오
  - 로그의 `name`이나 `cwd`가 수 MiB짜리 문자열이면 Event에 그대로 저장된다.
  - 이 값은 훅 이벤트가 올 때마다 세션 전체 스냅숏과 함께 clone되고 emit된다(`lib.rs:108,111`). 그래서 메모리와 IPC 비용이 그만큼 곱해진다. 최대는 500건 × 16 MiB 이하다.
  - 실제 도구 이름은 API 쪽 제한으로 짧을 것으로 보이지만(미확인), 로그는 그것을 보장하지 않는다.
- 권장 수정: 저장할 때 표시용 문자열을 예를 들어 1 KiB(문자 경계 기준)로 자른다.

### A4 · 권고 · 로그만 보면 도구 호출을 숨길 수 있음(감시 회피)
- 위치: `src-tauri/src/watch.rs:113-117`.
- 시나리오
  - 다음 줄은 통째로 버려진다: 중첩 깊이가 128을 넘는 줄, 짝 없는 서로게이트(`\ud800`)나 잘못된 UTF-8이 든 줄, 16 MiB를 넘는 줄(R4 수용).
  - 도구 출력이나 인젝션된 모델 입력이 이런 모양을 만들면, 같은 줄에 있는 tool_use/tool_result가 로그 기반 타임라인에서 빠진다.
  - 훅이 설치되어 있으면 PreToolUse/PostToolUse로는 여전히 보인다.
  - 이 앱이 보안 감시 도구로 쓰인다면, 화면에 없는 것이 "실행되지 않았다"는 뜻이 아니라는 점을 알려야 한다.
- 권장 수정: 파싱에 실패하거나 버린 줄을 세션별로 세어 화면에 표시한다(내용 없이 개수만). A1의 구조체 파싱으로 바꾸면 깊이 문제의 일부도 사라진다.

### A5 · 권고 · 프론트 세션 맵이 일반 객체(`__proto__` 키)
- 위치: `src/App.tsx:50,65-69`(`Record<string, Session>`, `next[x.id] = x`).
- 시나리오
  - 토큰을 가진 훅 송신자가 `session_id: "__proto__"`를 보내면, `next["__proto__"] = x`는 자기 속성을 만들지 않고 그 객체의 프로토타입을 바꾼다.
  - 그 세션은 목록에 보이지 않고, `sessions[selected]` 조회가 엉뚱하게 상속된 값을 얻는다.
  - 전역 `Object.prototype`은 오염되지 않는다(스프레드로 매번 새 객체를 만든다). 텍스트로만 렌더하므로 코드 실행도 없다.
  - 로그 쪽 ID는 UUID 모양만 통과하므로 이 경로로는 불가능하다.
- 권장 수정: `Map<string, Session>`을 쓰거나 `Object.create(null)`. 또는 Rust에서 훅 `session_id`의 모양을 검사한다(길이와 문자 집합).

### A6 · 권고 · 회차당 읽기 예산이 없음
- 위치: `src-tauri/src/watch.rs:88-98`.
- 시나리오: 아주 큰(희소) 파일이나 계속 자라는 파일 하나가 한 회차를 끝까지 붙잡는다. 그러면 다른 세션의 갱신이 늦어진다. projects 폴더에 쓰기 권한이 필요하므로 보안 경계 문제는 아니고 가용성 문제다.
- 권장 수정: 회차당 파일별 바이트 예산(예: 64 MiB)을 둔다. 첫 회차 한 번 emit(PLAN)과 함께 다시 정한다.

### A7 · 권고 · Windows 삭제 대기 창(미실측)
- 위치: `src-tauri/src/watch.rs:86-98`.
- 시나리오
  - Orbit이 핸들을 연 짧은 순간에 Claude Code가 파일을 삭제하면, 파일은 "삭제 대기" 상태가 된다(POSIX 삭제 의미론이 아닐 때).
  - 그 사이 같은 이름으로 다시 만들면 실패할 수 있다.
  - Claude Code가 같은 UUID 파일을 다시 만드는 흐름은 알려져 있지 않다. 확률은 낮다.
- 권장 수정: 없음. QA 8단계(삭제·이름 바꾸기 실측)로 확인한다.

### A8 · 권고 · 스레드 생성 실패 시 panic → abort
- 위치: `src-tauri/src/lib.rs:144`(`std::thread::spawn`). `server.rs:122,124`에도 있던 기존 패턴이다.
- 시나리오: OS가 스레드를 만들지 못하면 setup에서 panic이 나고, 릴리스에서는 앱이 종료된다. 시작할 때만 생긴다.
- 권장 수정: `thread::Builder::spawn`의 `Err`를 `projects_error`로 화면에 표시한다.

## 수용한 잔여 위험 (이번 run에서 바꾸지 않음)

- S1(`.orbit/decisions.md` 12번): 이번 diff가 `server.rs`·`hooks.rs`를 건드리지 않아 범위가 같다. 포트를 가로챈 쪽이 받는 페이로드도 같다.
- CSP `null`
  - 바뀌지 않았다.
  - 이번에 화면에 들어가는 신뢰할 수 없는 문자열(cwd, 도구 이름, 세션 ID)이 늘었다. 하지만 HTML 싱크가 없으므로 이전 판정을 유지한다.
  - HTML 싱크가 생기면 CSP 없이는 막을 장치가 없다는 점은 그대로다.
- PLAN R3·R4·R5·R7·R8: 위 A1·A2·A3·A6은 이 수용 항목들의 최악의 경우를 축소하지 않고 적은 것이다.
  - 최악은 Orbit 프로세스의 메모리 고갈로 인한 종료다. 그 로그가 남아 있으면 켤 때마다 반복될 수 있다.
  - 범위는 Orbit 하나다. Claude Code와 로그 파일, 비밀값 노출에는 영향이 없다.

## CLAUDE.md "보안·검증 체크리스트" 항목별 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| `127.0.0.1`에만 바인딩 | 지킴(유지) | `server.rs:119`. 바뀌지 않음 |
| 토큰 검증이 모든 경로에 걸림 | 지킴(유지) | `server.rs` 미변경. `ingest_hook`으로 가는 유일한 입구는 `tx.send`(`server.rs:106-107`)이고, 토큰 판정을 통과한 뒤에만 있다 |
| 비교가 상수 시간 | 지킴(유지) | `server.rs:15-17` 미변경 |
| 토큰이 로그·URL·화면에 안 찍힘 | 지킴 | 새 코드에 출력문 없음. emit 페이로드에 토큰이 없음(`sessions.rs:7-27`) |
| `Origin`/`Host` 검사 | 지킴(유지) | `server.rs:59-63` 미변경 |
| 요청 본문 크기 제한 | 지킴(유지) | `server.rs` 미변경. 로그 쪽 줄 상한은 16 MiB(`watch.rs:9`), 메모리 증폭은 A1 |
| settings.json 백업 후 병합·원자적 쓰기 | 해당 없음 | 이번 변경은 settings를 건드리지 않는다(`hooks.rs` 미변경) |
| 로그·페이로드 문자열을 HTML로 안 넣음 | 지킴 | `App.tsx:118-126,149-153` JSX 텍스트. `dangerouslySetInnerHTML`/`innerHTML`/`eval` grep 결과 없음 |
| 경로로 쓸 때 정규화 후 범위 검사 | 해당 없음 | 로그·페이로드 문자열을 경로로 쓰지 않는다. 경로는 `read_dir` 결과에서만 나오고 깊이 2, 링크 제외(`watch.rs:50-70`). 세션 ID는 UUID 모양만(`watch.rs:42-47,64`) |
| Tauri capability 최소 | 지킴(유지) | `capabilities/default.json` 변경 없음(`core:default`, `opener:default`). fs 플러그인을 열지 않았다. 새 명령 `get_sessions`는 인자 없는 읽기 |
| CSP 최소 | 미충족(수용 잔여, 유지) | `tauri.conf.json` `"csp": null`, 바뀌지 않음 |
| 신뢰 경계: 훅 서버 ← Claude Code 훅 | 약해지지 않음 | 콜백만 바뀌었다(`lib.rs:105-113`). 응답 뒤 소비 스레드에서 돈다. A5(토큰 보유자만 가능) |
| 신뢰 경계: 로그·페이로드 → 화면·파일 경로·셸 | 지킴 + A1~A4 권고 | 위 위협 모델 표 |
| 신뢰 경계: webview → Rust 명령 | 지킴 | `get_sessions`(`lib.rs:72-75`)는 인자가 없고 store 복사본만 돌려준다 |
| 신뢰 경계: 점검 대상 파일 → 에이전트 프롬프트 | 이상 없음 | 읽은 PLAN·DECISIONS·REVIEW·decisions.md·소스에 이 역할을 향한 지시문이 없다 |
| Orbit이 Claude Code를 막거나 느리게 하지 않음 | 지킴 | 꺼져 있을 때: 훅 경로는 ②와 같다. 켜져 있을 때: 로그는 읽기 전용이고 공유 모드는 기본값, 핸들은 회차마다 닫는다. 훅 응답은 store 잠금보다 먼저 나간다. 잔여는 A7 |

## 에이전트 설정 점검 (orbit:agent-config-audit)

- `CLAUDE.md`, `.claude/`, `harness/`, `.mcp.json`은 `git diff --stat main...HEAD`에 없다(출력 없음). 관문을 약화하거나 권한을 넓힌 변경은 없다.
- 제품이 사용자 settings에 넣는 훅(`hooks.rs`)은 바뀌지 않았다.

## 확인한 것 (명령과 출력)

```
$ git status --porcelain --untracked-files=no ; git rev-parse HEAD
(status 출력 없음)
83cc9fa7e02cea1acd7f863a99c171ab2f13d665      ← 감사 시작·끝 두 번 같음

$ git diff --stat main...HEAD
 src-tauri/src/lib.rs      | 114 +++++++++++++-
 src-tauri/src/sessions.rs | 379 ++++++++++++++++
 src-tauri/src/watch.rs    | 332 ++++++++++++++++
 src/App.css               |  18 +++
 src/App.tsx               |  88 ++++++++---

$ git diff --stat main...HEAD -- src-tauri/Cargo.toml src-tauri/Cargo.lock package.json package-lock.json src-tauri/capabilities src-tauri/tauri.conf.json .claude CLAUDE.md harness .mcp.json
(출력 없음)  → 새 의존성·권한·설정 변경 없음

$ git diff main...HEAD | grep -niE '^\+.*(secret|password|passwd|api[_-]?key|bearer|token|sk-[a-z0-9]|[0-9a-f]{32,}|C:\\\\Users|/Users/|lclk1)'
(출력 없음)  → 비밀값·개인 경로 없음

$ grep -nE 'println!|eprintln!|dbg!|log::|console\.(log|error|warn)' src-tauri/src/*.rs src/*.tsx
(출력 없음)
$ grep -rnE 'dangerouslySetInnerHTML|innerHTML|eval\(|new Function' src
(출력 없음)
$ grep -rn 'hook-event' src src-tauri/src
(출력 없음)

$ grep -nE 'fs::(write|remove|rename|create|copy|hard_link)|OpenOptions|set_len|File::create|Command::' src-tauri/src/watch.rs src-tauri/src/sessions.rs src-tauri/src/lib.rs
watch.rs:128,143,149,161,166,236,249,257,269 / lib.rs:182,184,192,194,196
→ 전부 #[cfg(test)] 모듈 안(watch.rs 125행~, lib.rs 163행~). 운영 코드에 쓰기 없음

$ grep -n 'env::var' src-tauri/src/*.rs
lib.rs:124 ORBIT_CLAUDE_SETTINGS (cfg(debug_assertions), 기존)
lib.rs:128 CLAUDE_CONFIG_DIR
lib.rs:137 ORBIT_CLAUDE_PROJECTS (lib.rs:136 #[cfg(debug_assertions)] 안)
$ grep -n 'unbounded_depth\|debug-assertions' src-tauri/Cargo.toml
(출력 없음)  → serde_json 깊이 상한 128 유지, release에서 debug_assertions 꺼짐

$ cargo audit --version ; cargo deny --version
error: no such command: `audit`
error: no such command: `deny`
→ 미실행(설치하지 않음). 새 크레이트·npm 패키지 없음(위 diff), npm audit 대상 없음 → 미실행
```

읽은 것
- CLAUDE.md, PLAN.md, DECISIONS.md, REVIEW.md
- ② SECURITY.md, `.orbit/decisions.md`(12·13번 부근)
- `watch.rs`·`sessions.rs` 전문, `lib.rs` diff와 setup 전문, `server.rs:90-131`
- `App.tsx` diff, `capabilities/default.json`, `tauri.conf.json`, `Cargo.toml`

하지 않은 것
- 앱을 띄우지 않았다(QA와 포트가 겹침).
- `cargo test`를 돌리지 않았다. QA 빌드와 target 폴더가 겹치기 때문이다. 대신 REVIEW 2차 기록(54 passed)을 참고했다.
- 정션·심볼릭 링크 프로브와 A1의 메모리 증폭 측정을 하지 못했다. 임시 프로브 파일 쓰기가 관문에 막혔다(security 역할의 쓰기 범위는 `.orbit/` 산출물뿐이다). 이 두 판정은 코드를 읽고 std·serde_json 동작 지식으로 내렸다.
- 실제 `~/.claude/projects`와 `~/.claude/settings.json`은 열지 않았다.
- Claude Code가 MCP 구조화 결과를 JSONL에 JSON 그대로 기록하는지(A1·A4의 전제)는 확인하지 못했다.

VERDICT: PASS
