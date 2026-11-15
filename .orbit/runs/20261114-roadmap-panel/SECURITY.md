# SECURITY — 20261114-roadmap-panel

모드: 기본 + security-deep (full 트랙, 외부 입력 cwd → 파일 시스템 접근이라는 새 신뢰 경계)
대상: `git diff main...orbit/20261114-roadmap-panel` (9개 파일: SPEC.md, design/reference/layout_v4.html, design/tokens.json, src-tauri/src/{lib.rs, roadmap.rs(새), sessions.rs}, src/{App.css, App.tsx, types.ts})

COMMIT: 3a45ced16382416dde7dcaaada6518aa6c7d95ad

(작업 트리 깨끗함 확인: `git status --porcelain --untracked-files=no` 출력 없음, 시작과 끝 모두 `git rev-parse HEAD` = 위 값. VERIFY.md의 COMMIT과 같음.)

## 위협 모델 (이번 변경분)

**자산**
- A1. 사용자의 Windows 자격 증명(NTLM 해시): 원격 경로에 접근하면 SMB 인증으로 새어 나갈 수 있다.
- A2. 로컬 파일 내용: Orbit은 사용자 권한으로 돌므로 사용자가 읽을 수 있는 파일은 모두 읽을 수 있다.
- A3. Orbit 앱의 가용성(UI 응답성), 그리고 "Claude Code를 막거나 느리게 하지 않는다"는 규칙.
- A4. webview의 무결성(스크립트 실행 = Tauri 명령 호출 권한).
- A5. 훅 토큰(`~/.claude/settings.json`에 평문으로 저장).

**진입점·신뢰 경계**
- E1. 세션 로그 JSONL의 최상위 `cwd`(sessions.rs:350)와 훅 페이로드의 `cwd`(sessions.rs:310, 127.0.0.1 + 토큰 검증 서버) → `Store` → `get_roadmap(id)` → `roadmap::for_cwd` → `symlink_metadata`/`canonicalize`/`open`. **새 경계.**
- E2. `<cwd>\ROADMAP.md` 파일 내용(아무 저장소나 될 수 있음) → `parse` → JSON → webview 텍스트.
- E3. 프론트(webview) → `get_roadmap`: 인자는 세션 id 문자열뿐. 경로는 프론트에서 넘어가지 않는다(lib.rs:51-53).
- E4. 모델이 정한 `subagent_type`/`agent_type` → `short_kind` → 그래프 노드 이름(표시만).

**공격자**
- T1. 악성 저장소 작성자: ROADMAP.md 내용은 정할 수 있지만 cwd는 정할 수 없다.
- T2. 세션 로그나 훅 이벤트를 위조할 수 있는 같은 사용자 권한의 로컬 프로세스(토큰을 읽었거나 `~/.claude/projects`에 쓸 수 있음). cwd를 마음대로 정할 수 있다.
- T3. 프롬프트 인젝션으로 조종된 모델: `subagent_type` 문자열은 정할 수 있지만, 최상위 `cwd`는 Claude Code가 적으므로 정할 수 없다.

## 발견

### 차단

없음.

### 권고 (후속 목록)

- **S-A1. 느린·끊긴 드라이브에서 get_roadmap 호출이 쌓인다** (권고)
  - 위치: `src/App.tsx:126-134`(`[selected, now]` effect), `src-tauri/src/lib.rs:50-54`(`#[tauri::command(async)]` 동기 몸체)
  - 시나리오: cwd가 끊긴 매핑 드라이브(`Z:\proj`)인 세션을 고른다 → `symlink_metadata`가 SMB 타임아웃까지 막힌다. 30초마다 새 호출이 나가고, 프론트의 `cancelled`는 응답만 버릴 뿐 Rust 호출은 멈추지 않는다. tauri-macros 2.7.4의 `body_async`는 동기 몸체를 `respond_async_serialized(async move {..})`로 async 런타임 워커에서 돌리므로, 막힌 호출마다 워커가 하나씩 잡힌다.
  - 최악의 결과·조건·범위: 워커 수만큼 호출이 막히면 다른 async 명령(`get_status`·`get_sessions`·`list_screens`)이 늦어져 Orbit 화면이 굳는다. 조건은 cwd가 응답하지 않는 원격·매핑 드라이브인 경우이고, 범위는 Orbit UI뿐이다. 훅 서버는 `std::thread`(server.rs:122-128)에서 돌기 때문에 Claude Code는 느려지지 않는다.
  - 권장 수정: 이전 호출이 진행 중이면 새 호출을 건너뛴다(프론트에 in-flight 플래그를 두거나 Rust에서 세션별로 하나만 돌린다). 또는 `spawn_blocking`으로 옮긴다.
- **S-A2. 로컬 경로가 원격으로 이어지는 경우는 막지 않는다** (권고, PLAN R4·R5와 REVIEW N1을 다시 평가함)
  - 위치: `src-tauri/src/roadmap.rs:133-142`
  - 시나리오: T2가 cwd를 매핑 드라이브(`Z:\`), `subst` 드라이브, 또는 UNC를 가리키는 디렉터리 심볼릭 링크가 있는 로컬 경로(`C:\x\link`, 만들려면 심볼릭 링크 권한이나 개발자 모드가 필요하고 L2R 평가는 기본으로 켜져 있음)로 심는다 → 그 서버로 SMB 인증이 일어난다.
  - 최악의 결과·조건·범위: 사용자가 연결해 둔 서버나 공격자가 미리 만든 링크의 대상으로 NTLM 인증이 간다. T2(같은 사용자 권한의 로컬 프로세스)가 필요하다. 그 공격자는 이미 같은 권한으로 직접 SMB 접속을 일으킬 수 있으므로, 이 변경으로 더해지는 위험은 거의 없다. 수용 판단에 동의한다.
  - 권장 수정: 지금은 없음. 필요해지면 `GetDriveTypeW`가 `DRIVE_REMOTE`이면 거부한다.
- **S-A3. 심볼릭 링크 거부 분기와 범위 검사는 실측되지 않았다** (권고, REVIEW N4를 다시 평가함)
  - 위치: `src-tauri/src/roadmap.rs:88-101`, 테스트 290-300
  - 시나리오: 파일 심볼릭 링크(`ROADMAP.md` → 폴더 밖 파일)는 이 환경에서 권한 1314 때문에 만들 수 없어 테스트가 건너뛰었다. 정션은 `!is_file`에서 거부되는 것을 실측했다.
  - 최악의 결과·조건·범위: 분기가 깨져 있으면 링크를 따라가 폴더 밖 파일을 텍스트로 보인다. 그래도 사용자가 이미 읽을 수 있는 파일이고, 이름이 `ROADMAP.md`인 링크를 그 폴더에 만들 권한이 필요하며, 내용은 같은 사용자 화면에만 보인다. 코드상으로는 std `FileType::is_symlink`가 Windows에서 이름 대리 reparse 태그(심볼릭 링크·정션)에 참이고, 그 뒤에 canonicalize 부모 비교가 다시 막는다. 막는 장치가 둘이다.
  - 권장 수정: 개발자 모드나 관리자 환경에서 `cargo test roadmap::`를 한 번 실행해 닫는다(VERIFY.md 못 한 것 2와 같음).
- **S-A4. TOCTOU·하드 링크** (권고, PLAN R2·R3를 다시 평가함)
  - 위치: `src-tauri/src/roadmap.rs:83-117`
  - 시나리오: 검사한 뒤 `open` 전에 파일을 링크로 바꾸거나, 하드 링크를 둔다.
  - 최악의 결과·조건·범위: 사용자가 읽을 수 있는 다른 파일의 앞 256 KiB 중 `## `·`- [ ]` 모양의 줄이 Orbit 화면에 보인다. 그 폴더에 쓸 권한이 필요하고, 결과는 같은 사용자 화면에만 남으며 밖으로 보내지지 않는다. 신뢰 경계를 넘지 않으므로 수용에 동의한다. 열린 핸들로 `is_file`과 크기를 다시 확인하는 완화도 들어 있다.
  - 권장 수정: 없음(필요하면 `FILE_FLAG_OPEN_REPARSE_POINT`로 연다).
- **S-A5. 노드 이름을 플러그인 접두사 없이 보여서 같은 이름으로 위장할 수 있다** (권고, PLAN R8)
  - 위치: `src-tauri/src/sessions.rs:71-82`
  - 시나리오: 다른 플러그인의 `evil:qa` 에이전트나 모델이 적은 `subagent_type:"x:qa"`가 그래프에서 `qa`로 보인다.
  - 최악의 결과·조건·범위: 사용자가 관찰 화면에서 실제 orbit:qa와 구별하지 못한다. 권한 변화는 없고 표시만 영향을 받는다. `Store`의 원본 kind와 짝짓기는 바뀌지 않았다(테스트 `snapshot_shortens_kind_but_store_keeps_original`).
  - 권장 수정: ⑥에서 원래 kind가 필요해지면 툴팁 등으로 전체 이름을 보인다.
- **S-A6. 평문 토큰 안내가 화면에서 빠졌다** (권고, PLAN R7. 사용자가 알고 승인함)
  - 위치: `src/App.tsx`의 이전 상세 패널(삭제됨), SPEC.md 30행
  - 시나리오: 사용자가 `~/.claude/settings.json`을 dotfiles 저장소 등에 공유한다 → 훅 토큰이 샌다.
  - 최악의 결과·조건·범위: 토큰을 가진 사람은 127.0.0.1 훅 서버로 가짜 이벤트를 보낼 수 있다. 그래도 같은 기기의 로컬 프로세스여야 한다. 할 수 있는 것은 가짜 세션 표시와, 이번 변경으로 cwd를 정해 S-A1·S-A2를 유발하는 것이다. 위험은 낮다.
  - 권장 수정: README 등 문서에 한 줄 남긴다.
- **S-A7. 이동식·빈 드라이브 cwd에서 Windows 오류 대화상자가 뜰 수 있다** (권고, 추정)
  - 위치: `src-tauri/src/roadmap.rs:83`
  - 시나리오: cwd가 미디어가 없는 드라이브(`A:\`, 빈 카드 리더)다 → 프로세스 오류 모드에 따라 "드라이브에 디스크가 없습니다" 창이 뜰 수 있고, 30초마다 반복될 수 있다.
  - 최악의 결과·조건·범위: 사용자가 성가실 뿐이다. 실측하지 않았다.
  - 권장 수정: 필요하면 시작할 때 `SetErrorMode(SEM_FAILCRITICALERRORS)`를 설정한다.

## 확인한 것

1. **커밋·작업 트리**: `git rev-parse HEAD` → `3a45ced16382416dde7dcaaada6518aa6c7d95ad`. `git status --porcelain --untracked-files=no` → 출력 없음(시작과 끝 모두).
2. **비밀값 스캔**: `git diff main...HEAD | grep -n -i -E "^\+.*(token|secret|password|api[_-]?key|bearer|sk-[a-z0-9]|ghp_|C:\\\\Users|/Users/|lclk1|AKIA)"` → 맞은 것은 `+++ b/design/tokens.json`(파일 이름, 디자인 토큰) 하나뿐이다. 시안 104행의 `C:\Users\you\...`는 예시 경로라 개인 경로가 아니다.
3. **오류 사유 문자열**: `roadmap.rs`의 `err(..)` 인자는 고정 문구이거나 `io::ErrorKind::to_string()`(경로 없음)이다. 프론트 catch는 `String(e)`로 Tauri 호출 오류를 보인다(경로·토큰 없음). `Status`에서 `settings_path`·`projects_dir`·`screens_dir`를 빼서 화면에 보이는 경로가 줄었다. 상단 바 결과 줄에 보이는 백업 경로는 이전 상세 패널에도 보이던 것을 옮긴 것이고, 이제 10초 뒤 지워진다(App.tsx:137-141). 토큰은 보이지 않는다.
4. **경로 모양 검사** (roadmap.rs:127-143, 코드 읽기와 std `Prefix` 의미 기준): 첫 구성 요소가 `Prefix::Disk`이고 `is_absolute()`여야 하며, 이 검사가 `read()` 안의 모든 FS 호출보다 먼저 온다.
   - std 파서는 접두사 앞부분의 `/`를 `\`로 바꿔 읽는다. 그래서 `//server/share`, `/\server`, `\/server`, `//?/..`, `//./..`는 모두 UNC·Verbatim·DeviceNS가 되어 거부된다.
   - `\??\C:\x`, `\rooted`, `/rooted`, 전각 `＼＼`는 접두사가 없어 거부된다. `C:rel`은 is_absolute가 거짓이라 거부된다.
   - 끝 공백·점(`C:\x. `), 8.3 이름, `..`, 이중 구분자는 Win32 정규화 뒤에도 같은 로컬 디스크 경로라 위험하지 않다.
   - ADS 모양(`C:\x:ads`)은 뒤에 `\ROADMAP.md`가 붙어 잘못된 경로 오류가 된다. 장치 이름(`CON`)은 마지막 구성 요소가 고정된 `ROADMAP.md`라 해당하지 않는다. NUL 문자는 std가 `InvalidInput`으로 거부한다(패닉 없음).
   - 단위 테스트 `for_cwd_shapes`는 `\\server\share\p`, `\\?\C:\x`, `\\.\C:\x`, `\\?\UNC\s\x`, `C:rel`, `\rooted`, 상대 경로를 덮는다. 슬래시 변형은 임시 크레이트로 실측하려 했으나 막혔다(못 한 것 1).
5. **cwd 출처**: sessions.rs:310(훅의 `cwd`), 350(로그 최상위 `cwd`). 둘 다 첫 값으로 고정된다(293-294). 모델 출력(message content)에서는 오지 않는다. 프론트는 id만 넘긴다(`get_roadmap(state, id: String)`). 락은 cwd를 복제하는 문장에서만 잡는다.
6. **상한·메모리**: 파일은 `metadata` 크기와 `take(MAX_BYTES+1)`로 256 KiB 이하만 읽는다. 줄은 2000바이트(`>` 비교, 경계 테스트 있음), 항목은 500개다. 응답 JSON은 대략 1 MB 이하이고 30초에 한 번이다. 파싱은 할당 한 번에 선형이다.
7. **렌더링**: `grep -rn "dangerouslySetInnerHTML\|innerHTML" src` → `no innerHTML`. RoadmapView는 `{l.text}`, `{rm.reason}`을 JSX 텍스트로만 넣는다. `style`에는 숫자로 계산한 `width`만 넣는다. 테스트 `parse_keeps_html_verbatim`과 VERIFY 기준 10(alert 없음)도 확인했다.
8. **capability·CSP·의존성**: `git diff --exit-code main...HEAD -- src-tauri/capabilities src-tauri/tauri.conf.json package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock` → `exit=0`. capability는 `core:default`, `opener:default`이고, CSP·assetProtocol scope(`$APPDATA/screens/*`)는 그대로다. 새 패키지가 없어 `cargo audit`·`npm audit`은 해당 없음(실행하지 않음).
9. **에이전트 설정**: `git diff --name-status main...HEAD`에 `CLAUDE.md`, `.claude/`, `harness/`, `.mcp.json` 변경이 없다. 관문을 약화하거나 권한을 넓히는 변경이 없다. 시안·SPEC diff에서 `<script`, 외부 URL, 지시문 모양의 문장을 grep했고 해당 없음.
10. **CLAUDE.md 보안 체크리스트**:
    - 127.0.0.1 바인딩(server.rs:119)과 토큰·본문 상한·Origin 검사·settings 백업과 원자적 쓰기 코드는 이번 diff에서 바뀌지 않았다.
    - 경로로 쓰는 로그 문자열은 모양 검사와 canonicalize 범위 검사를 거친다.
    - `dangerouslySetInnerHTML`이 없다. capability·CSP는 최소 그대로다.
    - Claude Code 쪽 경로(훅 서버 스레드)는 roadmap 호출과 공유하는 자원이 `Store` 락의 짧은 복제뿐이다.
11. **Tauri async 명령 실행 위치**: `~/.cargo/registry/src/*/tauri-macros-2.7.4/src/command/wrapper.rs:355-383`의 `body_async` → `respond_async_serialized(async move ..)`. 동기 몸체가 async 런타임 워커에서 돈다(S-A1의 근거).
12. **short_kind 영향**: kind를 쓰는 곳은 `Graph.tsx:39`의 표시뿐이다(`grep -n kind src/*`). 짝짓기(sessions.rs:221-242)는 원본 kind를 쓰는 `Store` 안에서 일어난다.
13. **PLAN 위험 재평가**: R1(정션 감지)은 정션 거부가 실측되어 닫혔다. R2·R3는 S-A4로 수용에 동의한다. R4·R5와 REVIEW N1은 S-A2로 수용에 동의한다. REVIEW N4는 S-A3으로 권고로 남긴다.

## 못 한 것

1. **슬래시 혼용·`//?/` 변형 실측**: 경로 모양 검사를 임시 크레이트로 실측하려 했지만 관문 훅이 security 역할의 scratchpad 쓰기를 막았다. heredoc으로 쓴 첫 시도는 컴파일이 깨져 실행되지 않았고, 그 폴더는 지웠다. rust-src가 설치되어 있지 않아 std `parse_prefix` 원문도 대조하지 못했다. 4번의 판단은 std 동작에 대한 지식과 기존 단위 테스트에 기댄다.
2. **심볼릭 링크 분기 실측**: 권한 1314 때문에 못 했다(S-A3).
3. **끊긴 매핑 드라이브와 빈 이동식 드라이브 실측**: 못 했다(S-A1, S-A7은 코드와 런타임 구조에 근거한 추정이다).
4. **`cargo test`, `npm run build` 재실행**: 읽기 전용 역할이라 하지 않았다. QA(VERIFY.md, 같은 COMMIT)의 결과를 썼다.
5. **스킬 호출**: `orbit:threat-model`·`orbit:agent-config-audit`를 호출할 도구가 이 에이전트에 없다. 위협 모델은 위 절의 형식으로 직접 썼다. 에이전트 설정 파일은 이번 diff에 없어 agent-config-audit 대상이 아니다.

VERDICT: PASS
