# PLAN: 마일스톤 ⑤ 로드맵 패널 + 노드 이름

## 변경 이력

- 0차(초안): 첫 작성.

RUN: 20261114-roadmap-panel / TRACK: full / 브랜치 `orbit/20261114-roadmap-panel`
근거: BRIEF.md(성공 기준 1~13), DECISIONS.md D1~D9(BRIEF보다 우선), DESIGN.md(승인, D9) + `design/reference/layout_v4.html` + `design/tokens.json`(Designer가 고쳤고 아직 커밋 안 됨), CLAUDE.md "코드 규칙"·"보안·검증 체크리스트".

## 목표

- 세션을 고르면 오른쪽 위 패널("로드맵")에 그 세션 cwd의 `ROADMAP.md`가 읽기 전용으로 보인다. 맨 위에 "완료 / 전체"와 고정 막대가 있고, 그 아래 묶음 제목과 `✓`/`·` 항목이 보인다. 세션을 고를 때와 기존 30초 타이머마다 다시 읽는다.
- 빈 상태와 오류 상태(미선택 · 불러오는 중 · 파일 없음 · 항목 0개 · 너무 큼 · 읽기 실패 · 건너뛴 줄)는 각각 한 줄 안내로 보이고, 앱은 죽지 않는다.
- 상세 패널 내용(세션·노드 상세, "설정" 묶음)을 지운다. 훅 상태, `설치`/`제거`, `액정 폴더` 버튼과 결과 줄은 상단 바로 옮긴다.
- 그래프 노드 이름은 플러그인 접두사를 떼고 보인다(`orbit:qa` → `qa`).
- SPEC.md의 ⑤와 화면 절, 훅 설치 도우미 30~31행을 이 결과에 맞춘다.

## 설계 요지

- **로드맵 읽기는 Rust 새 모듈 `roadmap.rs` 하나가 맡는다.** 마크다운 파서는 넣지 않고, 줄 단위로 직접 읽는다.
  - 인식하는 줄: 앞 공백을 뗀 뒤 `## 제목`(정확히 `#` 둘 + 공백)은 묶음 제목, `- [ ] 글`은 미완료, `- [x] 글`·`- [X] 글`은 완료다.
  - 나머지 줄(`#`, `###`, `* [ ]`, 번호 목록, 본문, 글이 빈 항목)은 조용히 무시한다.
  - 줄 끝 `\r`과 첫 줄 BOM은 뗀다. 글은 앞뒤 공백만 다듬고 그 밖에는 바꾸지 않는다(이스케이프 없음, 표시는 JSX 텍스트).
  - 잘못된 UTF-8 줄과 `MAX_LINE`(2000바이트)보다 긴 줄은 버리고 `skipped = true`로 표시한 뒤 계속 읽는다.
  - 상한은 `MAX_BYTES` = 256 KiB(파일 크기, 읽기 전 metadata로 거르고 읽을 때도 `take(MAX_BYTES + 1)`)와 `MAX_ENTRIES` = 500(묶음 제목 + 항목 줄 수)이다. 둘 중 하나라도 넘으면 `TooBig`이다.
- **cwd는 로그·훅에서 온 신뢰할 수 없는 문자열이다.** 명령은 세션 id만 받고, cwd는 Rust `Store`에서 꺼낸다(프론트가 경로를 넘기지 않는다). 그다음 `roadmap::for_cwd`가 아래 순서로 거른다. **어떤 파일 시스템 호출보다 먼저** 문자열 모양을 검사한다.
  1. `None`이거나 빈 문자열이면 `Missing`이다.
  2. Windows: 첫 구성 요소가 `Prefix::Disk`(`C:`)이고 `is_absolute()`여야 한다. UNC(`\\server\share`), 장치·verbatim 경로(`\\.\`, `\\?\`, `\\?\UNC\`), 드라이브 상대 경로(`C:rel`), 루트 상대 경로(`\x`), 상대 경로는 모두 `Error`다. 이렇게 하면 로그에 심은 UNC cwd로 SMB 접속(NTLM 해시 유출)이 일어나지 않는다. 비 Windows에서는 `is_absolute()`만 본다.
  3. `dir.join("ROADMAP.md")`의 `symlink_metadata`를 본다. 없으면(`NotFound`, 폴더가 없어도 같음) `Missing`이다. 심볼릭 링크나 정션이면 `Error("링크·정션은 읽지 않습니다")`, 일반 파일이 아니면(폴더 등) `Error`다.
  4. 범위 검사는 `screens.rs::inside`와 같은 방식이다. `canonicalize(파일).parent() == canonicalize(dir)`이 아니면 `Error`다.
  5. 파일을 연 뒤 **열린 핸들**의 `metadata()`로 다시 `is_file()`과 크기를 확인하고, `take(MAX_BYTES + 1)`로 읽어 넘치면 `TooBig`이다. 그다음 `parse`한다.
  - 절대 경로인 로컬 폴더는 어디든 허용한다(cwd는 본래 아무 폴더나 될 수 있다). 읽는 것은 그 폴더의 `ROADMAP.md` 하나뿐이고 결과는 화면 텍스트로만 쓴다. 오류 사유에는 경로를 넣지 않고 `io::Error`의 kind 문구만 쓴다.
- **명령 `get_roadmap(id)`**: Rust 명령을 등록하는 방식은 기존과 같다(`#[tauri::command(async)]` + `generate_handler!`). 락은 cwd를 복제하는 동안만 잡고, 파일 IO 전에 푼다. 없는 세션 id는 `Missing`이다. 앱 명령이라 capability와 CSP는 바꾸지 않는다(기존 명령도 `core:default`만으로 불린다).
- **노드 이름 규칙은 Rust에 둔다.** 테스트 러너가 Rust에만 있기 때문이다(프론트 테스트 러너와 `@types/node`는 없고 새로 넣지 않는다).
  - 세션이 Rust 밖으로 나가는 유일한 길은 `sessions::stalled()`다(`snapshot`도 이것을 부른다). 여기서 `agents[].kind`를 `short_kind`(마지막 `:` 뒤, 결과가 비면 `None`)로 바꾼다.
  - `Store` 안의 원본 `kind`는 그대로 두므로, SubagentStart 짝짓기 비교는 바뀌지 않는다.
  - `Graph.tsx`의 `a.kind ?? a.description ?? "—"`는 그대로 둔다. `description`은 자유 문장이라 떼지 않는다.
- **상단 바**는 DESIGN 2.2와 시안 91~97행을 그대로 따른다: `ORBIT` | `.tb-result` | `.tb-right`(서버 상태 · 훅 상태 [설치|제거] [액정 폴더]).
  - 버튼은 하나만 보인다. `installed === true`면 `제거`, 그 밖에는 `설치`다. `installed`가 `null`(확인 중·확인 실패)이거나 처리 중이면 비활성이다.
  - 결과 줄 문구: 성공 문구는 `setTimeout(10000)` 뒤 같은 문구일 때만 비운다. "✕" 문구는 다음 동작까지 남긴다. `settings_error`가 있고 결과 줄이 비어 있으면 "✕ 확인 실패: 사유"를 보인다.
- **로드맵 재읽기**: 새 `setInterval`을 만들지 않는다. 기존 30초 타이머가 갱신하는 `now`를 effect 의존성으로 쓴다.
  - `[selected]` effect: 로드맵 상태를 `null`("불러오는 중…")로 비운다.
  - `[selected, now]` effect: `invoke("get_roadmap", { id })`를 부른다. cleanup 플래그로 늦게 온 이전 세션 응답을 버린다. invoke가 실패하면 `{kind:"error", reason}`로 둔다.
  - 30초 재읽기 중에는 이전 내용을 그대로 둔다(깜빡임 없음).
- **지우는 것**
  - 프론트: `SOURCE_LABEL`, `curAgent`·`showNode`, 상세 패널의 `dl` 세 묶음, 평문 토큰·allowedHttpHookUrls 안내 두 줄, 경로 세 줄, `Status.settings_path·projects_dir·screens_dir`, 쓰지 않게 된 import(`LEAD_LABEL`, `NODE_LABEL`, `fmtDur`, `fmtTokens`, `nodeKey`).
  - CSS: `dl/dt/dd`, `.path`, `.actions`.
  - Rust: `Status`의 같은 세 필드와 `get_status`에서 그 값을 만드는 코드. `AppState`의 필드는 모두 계속 쓰므로 남긴다.
  - `Session.source`(Rust·TS)는 남긴다. 화면은 더 이상 읽지 않지만 Rust 병합 로직과 기존 테스트(sessions.rs 468~682행)가 쓰는 JSON 계약이다.

### 인터페이스 (태스크 간 계약 — 이름과 형태를 그대로 쓴다)

Rust `src-tauri/src/roadmap.rs` (새 파일):
```rust
pub const FILE: &str = "ROADMAP.md";
pub const MAX_BYTES: u64 = 256 * 1024;
pub const MAX_ENTRIES: usize = 500;
pub const MAX_LINE: usize = 2000; // 바이트
#[derive(serde::Serialize, Debug, PartialEq)] #[serde(rename_all = "lowercase")]
pub enum Mark { Heading, Done, Todo }
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Line { pub mark: Mark, pub text: String }
#[derive(serde::Serialize, Debug, PartialEq)] #[serde(tag = "kind", rename_all = "lowercase")]
pub enum Roadmap {
    Missing,
    TooBig { max_bytes: u64, max_entries: usize },
    Error { reason: String },
    Found { lines: Vec<Line>, skipped: bool },
}
pub fn parse(bytes: &[u8]) -> Roadmap;            // Found 또는 TooBig(줄 수)
pub fn read(dir: &Path) -> Roadmap;               // 설계 요지 3~5단계
pub fn for_cwd(cwd: Option<&str>) -> Roadmap;     // 1~2단계 후 read
```
Rust `sessions.rs`: `pub fn short_kind(k: &str) -> Option<String>`를 추가하고, `stalled()`에서 `agents[].kind`에 적용한다. 다른 시그니처는 바꾸지 않는다.

Tauri 명령:

| 이름 | 형태 |
|---|---|
| `get_roadmap` (새) | `(id: string) -> Roadmap` JSON: `{kind:"missing"}` / `{kind:"toobig", max_bytes, max_entries}` / `{kind:"error", reason}` / `{kind:"found", lines:[{mark:"heading"\|"done"\|"todo", text}], skipped}` |
| `get_status` (필드 삭제) | `{listen_addr, server_error, installed, settings_error, projects_error}` (`settings_path`·`projects_dir`·`screens_dir` 삭제) |
| `get_sessions`, `session-update` | 형태는 그대로. `agents[].kind` 값만 접두사 없는 표시 이름 |
| `list_screens`, `open_screens_dir`, `install_hooks`, `uninstall_hooks` | 그대로 |

프론트 `src/types.ts`(추가):
```ts
export type RoadmapLine = { mark: "heading" | "done" | "todo"; text: string };
export type Roadmap = { kind: "missing" } | { kind: "toobig"; max_bytes: number; max_entries: number }
  | { kind: "error"; reason: string } | { kind: "found"; lines: RoadmapLine[]; skipped: boolean };
```

## 새 의존성

없음. npm 패키지, 크레이트, Cargo feature, Tauri 플러그인, capability 권한, CSP·asset scope 항목을 하나도 추가하지 않는다. 마크다운 파서 대신 줄 단위로 직접 읽는다(위 설계). 노드 이름 테스트를 위한 프론트 테스트 러너도 넣지 않고, 규칙을 Rust에 둔다.

## 태스크

공통 규칙:
- Rust 명령은 `C:\Users\lclk1\Projects\orbit\src-tauri`에서, npm은 `npm.cmd`로 실행한다.
- 각 태스크는 표에 적힌 자기 파일만 고친다.
- 테스트 임시 폴더는 기존 패턴(`std::env::temp_dir()` + pid + `AtomicU32`, 끝나면 삭제)을 쓴다.
- `#[cfg(test)]` 밖에서는 `unwrap(`·`expect(`·`println!`·`eprintln!`·`dbg!`를 쓰지 않는다(`unwrap_or*`는 허용).
- 실제 `~/.claude`는 열지 않는다.
- 커밋은 태스크마다 자기 파일만 `git add <경로>`하고 `git commit -F C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-roadmap-panel\tasks\<id>\COMMIT_MSG.txt`로 한다.
- "테스트 먼저" 태스크는 구현 전 실패 출력과 구현 후 통과 출력을 `tasks/<id>/SUMMARY.md`에 붙인다.

| id | 할 일 | 파일 경로 | 검증 방법 | 웨이브 | 의존 |
|---|---|---|---|---|---|
| D1 | **Designer 산출물 커밋** (engineer). 작업 트리에서 이미 바뀐 `design/reference/layout_v4.html`과 `design/tokens.json`을 내용을 바꾸지 않고 커밋한다. 이 파일들은 F1의 CSS 원본이고 V2의 대조 기준이다 | `design/reference/layout_v4.html`, `design/tokens.json` | 커밋 전 `git status --short design/` → ` M` 두 줄만 나온다. 커밋 후 `git status --short design/` → 빈 출력. `git show --stat HEAD` → 두 파일만 | 1 | — |
| R1 | **로드맵 읽기 모듈** (engineer). `roadmap.rs`를 인터페이스와 설계 요지대로 만든다. `lib.rs`에는 `mod roadmap;` 한 줄만 더한다(R2 전까지 생기는 dead_code 경고는 허용). **테스트를 먼저 쓴다**: <br>parse<br>(a) 정상: 시안 데이터(`## 1단계: 관찰` + `[x]` 2개, `## 2단계: 화면` + `[ ]` 3개, 그중 하나는 200자 넘는 긴 항목) → 7줄, 파일 순서, mark 맞음, `skipped=false`. 같은 입력의 CRLF판·BOM판도 결과가 같다. `- [X]`는 done이다. 들여쓴 `  - [ ] x`는 항목이다. `#`, `###`, `* [ ] x`, `-[ ] x`, `1. x`, 본문, `- [ ]  `(글 없음)는 무시한다. 첫 `##` 앞의 항목도 남는다.<br>(b) 깨진 줄 섞임: 가운데 줄에 `\xff\xfe` → 그 줄만 빠지고 앞뒤 항목은 남으며 `skipped=true`.<br>(c) 모든 줄이 잘못된 UTF-8 → `Found{lines:[], skipped:true}`. 빈 입력 → `Found{lines:[], skipped:false}`.<br>(d) 항목 `MAX_ENTRIES`개 → Found, `MAX_ENTRIES+1`개 → `TooBig`.<br>(e) `MAX_LINE+1`바이트 항목 줄 → 빠지고 `skipped=true`.<br>(f) `<b>x</b>`, `<img src=x onerror=alert(1)>` 글이 바이트 그대로 `text`에 들어간다.<br>read / for_cwd<br>(g) 파일 없음 → `Missing`, 폴더 없음 → `Missing`.<br>(h) 크기 초과: 300 KiB 파일 → `TooBig`, 정확히 `MAX_BYTES` 바이트의 유효 파일 → Found.<br>(i) 범위 밖·링크: `ROADMAP.md` 자리에 폴더 → `Error`. 폴더 밖 파일을 가리키는 `symlink_file`(unix는 `symlink`) → `Error`. 권한이 없어 링크를 못 만들면 screens.rs 104행처럼 사유를 남기고 단언을 건너뛴다. `cfg(windows)`: `cmd /C mklink /J <dir>\ROADMAP.md <밖의 폴더>`로 정션을 만들면(일반 사용자 가능) → `Error`. 만들지 못하면 같은 방식으로 건너뛴다.<br>(j) `for_cwd(None)`, `for_cwd(Some(""))` → `Missing`. `for_cwd(Some("rel\\dir"))` → `Error`. `cfg(windows)`: `\\server\share\p`, `\\?\C:\x`, `\\.\C:\x`, `\\?\UNC\s\x`, `C:rel`, `\rooted` → 모두 `Error`. `for_cwd(Some(임시 폴더 문자열))` + 정상 파일 → Found.<br>(k) `serde_json::to_value`: `Missing` → `{"kind":"missing"}`, Found → `kind=="found"`, `lines[0].mark=="heading"` | `src-tauri/src/roadmap.rs`(새), `src-tauri/src/lib.rs`(`mod` 한 줄) | 구현 전 `cargo test roadmap::` 실패 → 구현 후 통과. `cargo test` 전체 0 종료. `Select-String src\roadmap.rs -Pattern 'unwrap\(','expect\(','println!','eprintln!','dbg!'` → 전부 `mod tests` 안이다. 코드 리뷰 포인트: `for_cwd`에서 접두사 검사가 `symlink_metadata`·`canonicalize`·`open`보다 먼저 온다 | 1 | — |
| S1 | **노드 이름 규칙** (engineer). `sessions.rs`에 `short_kind`를 추가한다(`k.rsplit(':').next()`, 결과가 비면 `None`). `stalled()`에서 `c.agents`의 `kind`에 적용하고, 문서 주석을 "내보내기 직전: 멈춤 판정 + 표시용 kind"로 고친다. **테스트를 먼저 쓴다**: `short_kind("orbit:qa")=="qa"`, `"orbit:engineer"→"engineer"`, `"general-purpose"` 그대로, `"a:b:c"→"c"`, `"orbit:"→None`, `""→None`. 그리고 훅 PreToolUse(Agent, `subagent_type:"orbit:qa"`) 뒤에 `snapshot(..)`의 `agents[0].kind==Some("qa")`이고, `serde_json::to_value`에 `orbit:`이 없으며, `store.get(id)`의 원본 kind는 `"orbit:qa"` 그대로다. SubagentStart(`agent_type:"orbit:qa"`) 짝짓기 기존 테스트도 그대로 통과한다 | `src-tauri/src/sessions.rs` | 구현 전 `cargo test sessions::` 새 테스트 실패 → 구현 후 `cargo test` 전체 0 종료. 위와 같은 Select-String 규칙 | 1 | — |
| L1 | **SPEC.md 갱신** (역할: **librarian**). 이 태스크는 W1에서 run 브랜치에 커밋한다. qa·security가 COMMIT 줄을 적은 뒤 SPEC.md가 바뀌면 출고 대조(gate `CHANGELOG*`·`docs/**`만 허용)가 막히기 때문이다. 고칠 곳은 넷이다. <br>(1) 30행: "Orbit 상단 바의 버튼으로 전역 … 훅 항목을 추가 (프로젝트별 설치 없음)". 평문 안내 문장은 지운다(D4). <br>(2) 31행: "… 제거 버튼도 제공(상단 바)". <br>(3) 화면 절 47행: "노드 클릭 → `▶` 선택 표시만(상세 패널 없음)". 51~53행 "4. 하네스 카드"는 "4. **로드맵** (오른쪽 위)"로 바꾸고 하위 줄을 둔다: 고른 세션 작업 폴더의 `ROADMAP.md`(`## 묶음`, `- [ ]`/`- [x]`)를 읽기 전용으로 보이고, 완료/전체와 막대를 보이며, 세션 선택 때와 30초마다 다시 읽는다. 하위 줄 하나를 더 둔다: "하네스 카드(CLAUDE.md 요약·훅·스킬·에이전트·MCP)와 팀 명단 뷰는 ⑥ 뒤로 미룬다(시점 미정)". <br>(4) 147행: "⑤ 하네스 카드 + 팀 명단 뷰" → "⑤ 로드맵 패널 + 노드 이름". <br>다른 절은 건드리지 않는다. HARNESS.md는 고치지 않는다. 사용자가 고칠 10절 "팀 명단 뷰" 줄 목록은 `tasks/L1/SUMMARY.md`에 적는다 | `SPEC.md` | `git diff --stat` → SPEC.md 한 파일. `git diff -U0 SPEC.md`의 hunk가 29~31행, 39~62행, 147행 안에만 있다. `Select-String SPEC.md -Pattern '하네스 카드 \+ 팀 명단','노드 클릭 → 오른쪽 상세','평문으로 저장된다는 안내'` → 결과 없음 | 1 | — |
| R2 | **명령 배선 + Status 정리** (engineer). `lib.rs`에 `#[tauri::command(async)] fn get_roadmap(state: State<AppState>, id: String) -> roadmap::Roadmap`를 추가한다. 몸체는 `let cwd = lock(&state.store).get(&id).and_then(\|s\| s.cwd.clone());`(문장 끝에서 락이 풀린다) → `roadmap::for_cwd(cwd.as_deref())`다. `generate_handler!`에 등록한다. `Status`와 `get_status`에서 `settings_path`·`projects_dir`·`screens_dir`를 지운다(`hooks::is_installed` 호출과 `projects_error`·`settings_error`는 남긴다). `install_hooks`·`uninstall_hooks`·`open_screens_dir`·`list_screens`·`AppState`는 그대로 둔다. glue뿐이라 새 테스트는 없다(로직 테스트는 R1·S1) | `src-tauri/src/lib.rs` | `cargo build`·`cargo test` 0 종료, 경고 없음. `Select-String src-tauri\src\lib.rs -Pattern 'fn get_roadmap\(state: State<AppState>, id: String\)','get_roadmap,?$'` → 정의 1줄 + 등록 1줄. `Select-String src-tauri\src\lib.rs -Pattern 'settings_path: String','projects_dir: String','screens_dir: String'` → 결과 없음. `git diff --exit-code main -- src-tauri/capabilities src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock` → 0 | 2 | R1 |
| F1 | **프론트: 상단 바 + 로드맵 패널 + 정리** (engineer). <br>`types.ts`: 인터페이스의 `RoadmapLine`·`Roadmap`을 추가한다. <br>`App.tsx`: <br>• `Status` 타입을 R2 형태로 줄인다. `SOURCE_LABEL`·`curAgent`·`showNode`·쓰지 않는 import를 지운다. <br>• 상단 바를 시안 251~262행 구조로 바꾼다(`tb-result`에 `title={result}`, `tb-srv`, `sep`, 훅 상태 문구 "훅 확인 중…/훅 설치됨/훅 설치 안 됨/훅 ✕ 확인 실패", 버튼 하나 + `액정 폴더`, aria-label "훅 제거"/"훅 설치"/"액정 폴더 열기"). `run`·`openScreens` 동작은 설계 요지대로 유지한다. <br>• 세션 오류 문구를 DESIGN 2.3대로 바꾼다(`projects_error`가 있으면 `.note`). <br>• 상세 패널을 `<section className="panel detail" aria-labelledby="h-roadmap">` + `h2#h-roadmap` "로드맵"으로 바꾸고 DESIGN 2.1의 상태 표를 그대로 구현한다. 미선택, 불러오는 중(`null`), missing, error, toobig(한도 문구는 `max_bytes/1024` KiB · `max_entries`개), found에서 항목 0개, 정상, 건너뛴 줄 `.note`. 정상 화면은 요약 줄 `.rm-sum`이다: `aria-hidden` "done / total" + `.rm-bar` `role=progressbar`(aria 값은 DESIGN 4절), 채움 `<i style={{width: %}}>`. 그 아래에 줄을 차례로 묶는다: 제목은 `<h3 className="px">`, 항목 묶음은 `<ul className="rm">`, 항목은 `<li><span className="mk" aria-hidden>✓\|·</span><span><span className="sr">완료: \|미완료: </span>{text}</span></li>`. 모든 문자열은 JSX 텍스트로만 넣는다. <br>• 재읽기는 설계 요지의 두 effect로 한다(새 interval 없음). 세션을 바꿀 때 `setNode(null)`은 유지한다. <br>`App.css`: 시안 91~97행(상단 바)과 186~195행(로드맵·`.detail h3` overflow-wrap·`.note` overflow-wrap)을 옮긴다. `dl/dt/dd`·`.path`·`.actions`는 지운다. 색은 기존 4명암 변수만 쓴다. 값은 `design/tokens.json`의 `roadmap.*`·`topbar.*`와 같아야 한다(16px, 2px, 8px, 12px, 12px, 240px) | `src/types.ts`, `src/App.tsx`, `src/App.css` | `npm.cmd run build` 0 종료. `Select-String -Path src\*.tsx,src\*.ts,src\*.css -Pattern 'dangerouslySetInnerHTML','SOURCE_LABEL','settings_path','projects_dir','screens_dir','상세 · 하네스','설정 참고','평문','allowedHttpHookUrls','<dl','\.path\b','\.actions'` → 결과 없음. `Select-String src\App.css -Pattern '#[0-9a-fA-F]{3,8}\b'` → `:root` 4줄만. `Select-String src\App.tsx -Pattern 'setInterval'` → 기존 1곳만. `npm.cmd run dev`를 띄워 http://localhost:1420에서 상단 바 한 줄과 로드맵 칸의 "세션을 고르면…" 문구를 확인한다(invoke가 없어 서버 상태가 오류로 보이는 것은 정상). 끝나면 1420 포트 프로세스를 끈다 | 2 | R1(인터페이스만, 실행은 R2 뒤 V1) |
| V1 | **QA 실행 검증** (qa). 아래 "QA 절차" 1~9. 결과와 출력, 스크린샷 경로를 VERIFY.md에 적고 `COMMIT:` 줄을 쓴다 | (산출물만) `VERIFY.md`, 스크린샷 | 아래 절차 | 3 | D1, R2, S1, F1, L1 |
| V2 | **시각 대조** (designer, Lead가 호출). V1이 찍은 실제 앱 1400×900·960×640 스크린샷과, 같은 크기로 연 `design/reference/layout_v4.html`을 나란히 본다. 볼 것: 배치, 패널 테두리, 4명암, 로드맵 요약 줄·막대·묶음 제목·`✓`/`·`·매달린 들여쓰기, 상단 바 한 줄, 노드 이름 표기. 결과는 "같다" 또는 차이 목록이다 | (산출물만) Designer 리뷰 문서 | 결과 "같다". 차이가 있으면 F1으로 되돌려 고친 뒤 V1의 3·8단계와 V2를 다시 한다 | 3(V1 뒤) | V1 |

웨이브별 파일 겹침 확인:
- W1: D1 `design/**`, R1 `roadmap.rs`·`lib.rs`(mod 한 줄), S1 `sessions.rs`, L1 `SPEC.md`. 서로 겹치지 않는다.
- W2: R2 `lib.rs`, F1 `src/types.ts`·`App.tsx`·`App.css`. 서로 겹치지 않는다. R2는 R1이 `lib.rs`를 커밋한 뒤에 시작한다.
- W3: V1 → V2. 코드는 고치지 않는다. 수정이 필요하면 해당 태스크(F1/R1/R2/S1) 담당 engineer에게 되돌린다.
- L1(SPEC.md)은 W1에서 커밋되므로 V1·security가 COMMIT을 적기 전에 run 브랜치에 들어간다. CHANGELOG·`docs/solutions/`는 출고 단계에서 librarian이 맡는다(COMMIT 뒤에도 허용되는 경로).

변경이 닿는 곳 점검:
- **호출부**
  - `get_status`의 반환형(R2)과 프론트 `Status`(F1)를 맞춘다. `Screen.tsx`는 `list_screens`만 쓰므로 영향이 없다.
  - `get_roadmap`을 새로 등록하고(R2), 호출하는 곳은 F1이다.
  - `stalled()`는 세 송출 경로(`get_sessions`, 훅 emit, `poll_round`)가 공유하므로 S1 한 곳만 고치면 모두 적용된다.
  - `Graph.tsx`는 바꾸지 않는다(`grep -n "kind" src` 결과는 Graph.tsx 39행과 types.ts뿐이다. App.tsx 170행은 F1이 지운다).
- **테스트**: 새로 쓰는 테스트는 `roadmap::`(R1)와 `sessions::short_kind`·snapshot kind(S1)다. lib.rs의 기존 테스트 두 개는 Status를 쓰지 않아 그대로 둔다. `screens`·`hooks`·`server`·`config`·`watch` 테스트는 손대지 않는다.
- **설정**: `capabilities/default.json`, `tauri.conf.json`(CSP·asset scope), `Cargo.toml`, `package.json`은 바꾸지 않는다(R2 검증의 diff).
- **CSS·토큰**: 지울 클래스와 옮길 클래스는 F1이 맡는다. `design/tokens.json`은 Designer가 이미 값을 넣었고, D1이 커밋한다.
- **export**: `pub fn run()`은 그대로다. `mod roadmap`은 crate 안에서만 쓴다.
- **하네스·HARNESS.md·CLAUDE.md**는 바꾸지 않는다.

## QA 절차 (V1, 임시 사본)

준비:
```powershell
$d = "$env:TEMP\orbit-qa5"; $p = "$d\proj"
mkdir "$d\projects\qa-proj","$p" -Force
Set-Content "$d\settings.json" '{"hooks":{}}'
$env:ORBIT_CLAUDE_SETTINGS = "$d\settings.json"
$env:ORBIT_CLAUDE_PROJECTS = "$d\projects"
```

- `$p\ROADMAP.md`에는 시안 데이터를 넣는다: `## 1단계: 관찰` + `- [x]` 2개, `## 2단계: 화면` + `- [ ]` 3개(시안 368행의 긴 항목 포함).
- `$d\projects\qa-proj\qa-rm.jsonl`의 첫 줄은 `cwd`를 `$p`로 둔 `type:"user"` 줄이다(JSON 이스케이프 `\\`).
- 이어서 assistant 줄을 넣는다. `tool_use` `name:"Agent"`이고 `input.subagent_type`이 `orbit:architect`, `orbit:plan-checker`, `orbit:engineer`×2, `general-purpose`인 줄들이다.

1. 자동 검사: `cargo test`, `npm.cmd run build`, `node --test harness/hooks/gate.test.mjs` → 모두 0이어야 한다(기준 1·2).
2. 같은 창에서 `npm.cmd run tauri dev`를 실행한다. 상단 바 훅 상태가 `$d\settings.json` 기준인지 본다. [설치]를 누르면 `$d\settings.json`에 병합되고, 결과 줄에 백업 경로가 보이며, 버튼이 [제거]로 바뀐다. 10초 뒤 결과 줄이 비는지 본다. [제거]를 눌러 원래대로 돌린다. [액정 폴더]를 누르면 탐색기가 열린다(기준 6).
3. qa-rm 세션을 고른다. 다섯 항목이 파일 순서대로 보이는지, `✓` 2개, "2 / 5", 40% 막대가 보이는지 확인한다(기준 3). 노드 이름이 `architect`·`plan-checker`·`engineer`·`general-purpose`로 보이고 화면 어디에도 `orbit:`이 없는지 확인한다(기준 7).
4. 앱을 켠 채로 `- [ ]` 하나를 `- [x]`로 고친다. 30초 안에 "3 / 5"가 되는지 본다. 다른 세션을 골랐다가 다시 골라도 바로 바뀌는지 본다(기준 4).
5. 네 가지 안내를 확인한다. 각각 한 줄 안내가 보이고 앱은 계속 동작해야 한다(기준 5).
   - 세션 미선택: 앱을 다시 켠다.
   - 파일 없음: 파일 이름을 바꾼다.
   - 300 KiB: `- [ ] x` 줄을 반복해 300 KiB를 만든다.
   - 잘못된 UTF-8: `[IO.File]::WriteAllBytes`로 `0xFF 0xFE` 줄을 섞는다.
6. 항목 `- [ ] <b>x</b>`와 `- [ ] <img src=x onerror=alert(1)>`을 넣는다. 글자 그대로 보이고 alert가 없는지 확인한다. `Select-String -Path src\*.tsx -Pattern dangerouslySetInnerHTML` → 결과 없음(기준 10).
7. 링크를 확인한다. `ROADMAP.md`를 지우고 `cmd /c mklink /J "$p\ROADMAP.md" "$d\projects"`로 정션을 만든다(가능하면 `mklink` 파일 심볼릭 링크도 만든다). "✕ 로드맵을 읽지 못했습니다"와 사유가 보이는지 확인한다. 이어서 cwd를 `\\\\127.0.0.1\\c$\\x`로 둔 세션 줄을 추가하고, 그 세션을 고르면 "읽지 못했습니다"만 나오는지 본다. 이 확인은 화면 관찰만으로 한다. `lib.rs`의 `get_roadmap` 시그니처가 `id: String`뿐인지 grep으로 본다(기준 11).
8. 시안 데이터로 되돌린다(기준 3과 같은 데이터, 노드 포함). 창을 1400×900과 960×640으로 맞춰 스크린샷을 찍는다. 960×640에서 상단 바가 한 줄인지 확인한다. 실제 Galmuri11 글꼴 기준이며, DESIGN 6절의 미확인 항목이다. 서버 오류처럼 긴 문구는 말줄임되어야 하고 버튼이 밀리지 않아야 한다. 오른쪽 아래 액정이 ④처럼 동작하는지 본다(그림 표시, 클릭하면 다음). 상세 정보와 경로가 보이지 않는지 확인한다(기준 6). 스크린샷은 V2로 넘긴다(기준 8).
9. diff를 확인한다(기준 9·12·13). 마지막으로 정리한다.
   - `git diff main -- SPEC.md`의 hunk 범위를 본다.
   - `git diff --exit-code main -- src-tauri/capabilities src-tauri/tauri.conf.json package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock` → 0이어야 한다.
   - 정리: 앱과 `npm`·vite 프로세스를 끈다(`Get-NetTCPConnection -LocalPort 1420` 소유 프로세스 종료). 정션은 `rmdir`로 지운다. `$d`와 환경변수를 지운다.

## 성공 기준 대응

| 기준 | 덮는 태스크 | 검증 |
|---|---|---|
| 1 cargo test + 로드맵 테스트 6종 | R1 (a)~(k), S1 | R1의 `cargo test roadmap::`. 정상=(a), 없음=(g), 크기=(h), UTF-8=(c), 깨진 줄=(b), 링크·정션·범위 밖=(i)(j). V1의 1단계 |
| 2 npm build, gate.test | F1, R2 | F1 검증, V1의 1단계 |
| 3 다섯 항목, 2 / 5, 막대 | R1, R2, F1 | V1의 3단계 |
| 4 30초 안에 3 / 5 | F1(`now` 의존 effect) | V1의 4단계 |
| 5 네 경우 안내 | R1(Missing/TooBig/skipped), F1(상태 표) | V1의 5단계 |
| 6 상세·경로 없음, 버튼은 상단 바만, 액정 그대로 | F1, R2 | F1 grep, V1의 2·8단계 |
| 7 노드 이름 `qa`·`engineer`, `orbit:` 없음 | S1 | S1 테스트, V1의 3단계 |
| 8 시안 대조 "같다" | D1, F1 | V1의 8단계 + V2 |
| 9 SPEC diff 범위 | L1 | L1 검증, V1의 9단계 |
| 10 HTML 글자 그대로, `dangerouslySetInnerHTML` 없음 | R1 (f), F1 | V1의 6단계, F1 grep |
| 11 경로 인자 없음, 정션·링크 거부 | R1 (i)(j), R2 시그니처 | R2 grep, V1의 7단계 |
| 12 capability·CSP·scope 변경 없음 | R2(바꾸지 않음) | R2·V1의 9단계 diff |
| 13 새 의존성 없음 | 전체 | V1의 9단계 diff |

## 위험·가정

- **R1. 정션이 `symlink_metadata().file_type().is_symlink()`로 잡히는지 (미확인).** Rust std 문서로 확인하지 못했다. R1 (i)의 `mklink /J` 테스트가 실제 결과를 보인다. 잡히지 않더라도 정션은 폴더라서 `is_file()` 검사에서 `Error`가 된다. 따라서 어느 쪽이든 읽지 않는다.
- **R2. 검사와 열기 사이의 경쟁(TOCTOU).** 검사한 뒤 열기 전에 파일이 링크로 바뀔 수 있다. 열린 핸들의 `metadata().is_file()`을 다시 보지만 링크를 따라간 결과일 수 있다. 이 공격에는 프로젝트 폴더 쓰기 권한이 필요하고, 결과는 읽기 전용 텍스트(256 KiB 이하)뿐이다. 수용한다.
- **R3. 하드 링크는 걸러지지 않는다.** 하드 링크는 그 폴더의 일반 파일과 구별되지 않는다. 이것도 폴더 쓰기 권한이 필요하다. 수용한다.
- **R4. 네트워크 드라이브.** UNC·장치 경로는 거부한다. 하지만 드라이브 문자로 매핑된 네트워크 드라이브(`Z:\`)의 cwd는 `Disk`라서 통과하고, 사용자가 이미 연결해 둔 서버에 30초마다 접근한다. 수용한다(사용자가 직접 매핑한 서버다).
- **R5. 아무 로컬 절대 경로나 cwd가 될 수 있다.** 예를 들어 로그에 `C:\Windows`를 심으면 그 폴더의 `ROADMAP.md`를 읽는다. 읽는 파일 이름은 고정이고 표시는 텍스트뿐이라 수용한다.
- **R6. 상단 바 960×640 한 줄 여부.** 실제 Galmuri11 글꼴로는 확인하지 못했다(DESIGN 6절, D9). V1의 8단계에서 본다. 넘치면 F1에서 `.tb-srv` 상한을 줄이는 쪽으로 고친다. 디자인 값을 바꿔야 하면 Designer에게 묻는다.
- **R7. 화면의 평문 토큰 안내가 사라진다(D4).** 토큰은 계속 `settings.json`에 평문으로 저장되는데, 이를 알리는 한 줄이 화면에서 빠진다. SPEC 30행도 그에 맞춰 바꾼다. 사용자가 확정한 결정이지만 보안 안내가 줄어드는 것이므로 PLAN 승인 때 다시 알린다.
- **R8. `kind`의 JSON 의미가 바뀐다.** 송출하는 `agents[].kind`가 원래 이름이 아니라 표시 이름이 된다. 지금은 그래프 말고 쓰는 곳이 없다. ⑥ 등에서 원래 이름이 필요하면 그때 필드를 더한다. `kind`가 없어 `description`으로 대체되는 노드는 자유 문장이라 `:`를 떼지 않는다. 플러그인이 달라도 접미사가 같은 에이전트는 구별되지 않는다(BRIEF 질문 c에서 수용).
- **R9. cwd는 세션의 첫 이벤트 값으로 고정된다(sessions.rs 285행).** 세션 도중 폴더를 옮기거나 하위 폴더에서 연 세션은 "ROADMAP.md가 없습니다"로 보인다(D5, 상위 탐색 없음).
- **R10. 줄 수 상한 500은 묶음 제목을 포함한다.** DESIGN의 "항목 수 상한"을 묶음 제목과 항목을 합친 수로 해석했다. 화면 문구는 "{500}개"다.
- **R11. HARNESS.md 10절 "팀 명단 뷰"는 사용자가 직접 고친다.** L1이 고칠 줄 목록을 넘긴다.
