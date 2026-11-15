# SECURITY — 20261114-graph-ui (security-deep, full 트랙)

이전 감사 커밋(1차): eebe9617032a18c13b5fc72b4f4ce9cc65b76cee — 현재 판정·커밋은 맨 아래 "재감사" 절 끝의 줄이 기준이다.

대상: `git diff main...orbit/20261114-graph-ui`(18개 파일). 검사 시작·끝 모두 `git status --porcelain --untracked-files=no` 출력 없음, `git rev-parse HEAD` = eebe9617032a18c13b5fc72b4f4ce9cc65b76cee.
앱은 띄우지 않았다(qa가 같은 시각 사용). 릴리스 exe 미실행. 실제 `~/.claude`는 읽거나 쓰지 않았다. 프로브는 `%TEMP%\orbit-sec4`와 스크래치 폴더에서만 했고 끝나고 지웠다(정션은 `rmdir`로 먼저 끊음).

## 판정 요약

차단 없음. 권고 G1~G7.
하네스·에이전트 설정(`CLAUDE.md`, `.claude/`, `harness/`, `.mcp.json`)과 capability, 훅 서버(`server.rs`), settings 병합(`hooks.rs`), `config.rs`, `package.json`은 이번 diff가 건드리지 않았다(`git diff --name-only`로 확인, 아래 "확인한 것" 1).

## 위협 모델 (이번 변경분)

자산: 사용자 파일시스템(특히 `%USERPROFILE%\.claude`의 토큰 든 settings.json·자격 증명), 훅 토큰, webview가 부를 수 있는 Rust 명령(훅 설치·제거, 폴더 열기), 화면 표시의 정확성, Orbit·Claude Code의 반응성.

| 신뢰 경계 | 공격자 입력 | 결과 | 완화(파일:줄) | 판정 |
|---|---|---|---|---|
| asset 프로토콜 URL(webview) → 파일 읽기 | `..`, 하위 폴더, 링크·정션 경로 | 폴더 밖 파일 노출 | `tauri.conf.json:23-26` scope 하나, Tauri `scope/fs.rs` `require_literal_separator: true` + 경로 canonicalize 후 매칭(프로브로 확인) | 막힘. 단 G1·G2 |
| `screens/` 폴더 내용(같은 사용자의 다른 프로세스) → `list_screens` → `<img>` | SVG, 링크, 하위 폴더, 경쟁 교체 | 스크립트 든 그림, 폴더 밖 파일 | `screens.rs:3,12,16,24-25` 확장자·`is_file`·canonicalize 부모 비교, asset scope 재검사 | 막힘. G1·G2·G7 |
| webview → Rust 명령 `list_screens`·`open_screens_dir` | 경로 인자 | 임의 경로 열기 | 두 명령 모두 인자 없음(`lib.rs:84,92`), `open_path`에 넘기는 값은 `app_data_dir().join("screens")`(`lib.rs:178,96`) | 막힘 |
| 훅 페이로드·세션 로그 → 화면 | `<b>`·스크립트 문자열의 `agent_type`·`subagent_type`·`description`·`cwd` | XSS → Rust 명령 호출 | React 텍스트 렌더만, `src/`에 `dangerouslySetInnerHTML`·`innerHTML` 없음(grep), CSP `script-src`는 Tauri가 hash로 채움(T8 5번 헤더) | 막힘 |
| 훅 페이로드·세션 로그 → 경로·명령 | `cwd`, id | 경로·셸 사용 | 새 코드에서 이 문자열을 경로·명령으로 쓰는 곳 없음. `cwd`는 `folderName`(`types.ts`)으로 표시만 | 해당 없음 |
| 훅 페이로드·세션 로그 → 메모리 | 긴 문자열, 많은 노드·세션 | Orbit 메모리 증가·느려짐 | `MAX_AGENTS`=200/세션(`sessions.rs:6,114`), 훅 본문 4 MiB(`server.rs:9`). 문자열 길이·세션 수 상한 없음 | G3 |
| 가짜 훅·가짜 로그 → 그래프 상태 | 꾸민 Subagent*/PostToolUse, JSONL 줄 | 거짓 "끝남·실패·실행 중" 표시 | 훅은 토큰 검사(`server.rs:68`, 이번 diff 무변경). 로그는 같은 사용자 쓰기 권한이면 가능 | G5 |
| 30초 재요청 → Orbit 잠금 | 세션 많음 | Orbit 지연, Claude Code 지연 | 훅 서버는 204를 먼저 보내고 이벤트를 넘김(`server.rs:99-106`) → Claude Code는 영향 없음 | G4 |
| 번들 글꼴 → webview | 변조된 woff2 | 글꼴 파서 공격 | npm 타르볼·GitHub 태그와 대조(아래 5) | 이상 없음 |

STRIDE 빠짐 확인: 위장(G5), 변조(G5), 부인(해당 없음 — 로그 없음), 정보 노출(G1·G2), 서비스 거부(G3·G4), 권한 상승(XSS 경로 없음, capability 무변경).

## CLAUDE.md 보안·검증 체크리스트 판정

1. 127.0.0.1 바인딩 — **통과(무변경)**. `server.rs:119` `bind(("127.0.0.1", port))`, diff에 `server.rs` 없음.
2. 토큰 검증·상수 시간·노출 없음 — **통과(무변경)**. `server.rs:15,68` `ct_eq`. 새 `Status.screens_dir`(`lib.rs:73`)는 경로뿐, 토큰 필드 없음. 새 `eprintln!`은 테스트 안 하나(`screens.rs` 테스트, 링크 생성 오류만).
3. Origin/Host 검사 — **통과(무변경)**.
4. 본문 크기 제한 — **통과(무변경)**. `server.rs:9` 4 MiB.
5. settings.json 백업 후 병합·원자적 쓰기 — **통과(무변경)**. `hooks.rs` diff 없음.
6. 로그·페이로드 문자열을 HTML로 넣지 않음, 경로는 정규화 후 범위 검사 — **통과**. grep 결과 `src/`에 HTML 삽입 API 없음. 그림 경로는 Rust가 만들고(`screens.rs:13`) canonicalize 부모 비교(`screens.rs:24-25`), asset scope가 다시 canonicalize해 검사. 페이로드 문자열은 경로로 쓰이지 않음.
7. Tauri capability 최소 — **통과**. `capabilities/default.json` 무변경(`core:default`, `opener:default`). 새 명령 둘은 인자 없음. Cargo feature `protocol-asset` 하나 추가.
   CSP 최소 — **통과, 권고 G6**. prod `csp`(`tauri.conf.json:21`)에 `'unsafe-inline'`·ws 출처 없음. devCsp는 `tauri dev`에서만 쓰인다: Tauri 2.12.5 `manager/mod.rs:362-371` `if !crate::is_dev() { csp } else { dev_csp.or(csp) }`, tauri-codegen 2.7.4 `context.rs:161-170` 같은 분기. T8 5번이 디버그 빌드 응답 헤더에서 `ws://localhost:1420`·`'unsafe-inline'` 없음을 확인. `style-src 'self'`에서 React `style` prop은 CSSOM(`el.style.x`)으로 적용돼 막히지 않음(T8 5번 대조 실험). `style=` 쓰는 곳: `App.tsx:190`, `Graph.tsx:38,50,62` — 모두 숫자 상수·계산값.
8. 신뢰 경계 — 위 표.

## 질문별 결과

**(1) asset 프로토콜 scope `$APPDATA/screens/*`**
- scope 항목은 하나(`tauri.conf.json:25`). `$APPDATA` = `app_data_dir()` 동일은 T8 1번 증거(내가 재확인하지 않음).
- glob 의미(Tauri 2.12.5 `src/scope/fs.rs` 읽음 + 같은 로직의 프로브 실행): `require_literal_separator: true`라 `*`는 `\`를 넘지 않는다(GHSA-6mv3-wm7j-h4w5 대응 주석). 요청 경로는 `is_symlink`면 `read_link`, 존재하면 `canonicalize` 뒤 매칭. 프로브 결과 — `screens\a.png` 허용, `screens\a.svg` **허용**, `screens\sub\in.png` 거부, `screens\..\secret.txt` 거부, `screens\nope\..\..\secret.txt` 거부, `screens\..` 거부, 정션 `screens\jdir\in.png`(→ 폴더 밖) 거부. 존재하지 않는 경로는 canonicalize 없이 매칭되지만 열 파일이 없어 404.
- **`screens` 자체가 정션·링크이면 scope가 그 대상 폴더의 바로 아래 파일로 넓어진다**: 앱 시작 때 패턴을 canonicalize(`canonicalize_parent`)해 두 번째 패턴으로 넣기 때문. 프로브: `app2\screens`→`outside` 정션일 때 패턴에 `\\?\…\outside\*`가 추가되고 `outside\secret.txt` 직접 경로가 허용됨, `outside\deeper\x.txt`는 거부. → G2.
- 파일 심볼릭 링크는 일반 사용자 권한으로 만들 수 없어(“Administrator privilege required”) 프로브하지 못했다. 코드상 `read_link` 후 canonicalize라 대상이 폴더 밖이면 거부된다(추정, 코드 근거).
- `http-range` 0.1.6: `protocol-asset`이 끌어온 Tauri 공식 선택 의존성, Range 헤더 파싱. 소스에 `unsafe` 0건, build.rs 없음. `cargo audit` 미설치로 **미실행**(G 권고 아님, 아래 "못 한 것").

**(2) CSP** — 위 체크리스트 7.

**(3) `list_screens`·`open_screens_dir`** — 인자 없음, 경로는 Rust가 만듦. `open_screens_dir`는 `create_dir_all` 후 `open_path`(`lib.rs:92-96`). `screens`가 파일이거나 파일 링크면 `create_dir_all`이 실패해 열지 않음. 폴더 정션이면 그 폴더를 탐색기로 엶(실행 아님). SVG 제외·`is_file`·canonicalize 범위 검사 있음(`screens.rs:3,12,16`). 파일 교체 경쟁(N20)은 G7. capability 무변경.

**(4) 페이로드·로그 문자열** — 텍스트 렌더만. `<b>x</b>`는 T8 4번에서 글자 그대로 보임, 테스트 `y_agent_odd_shapes_cap_and_text`가 저장 값 확인. 노드 수 상한 200/세션, 문자열 길이·세션 수 상한 없음 → G3(③ A3과 같은 종류, 대상이 agents로 넓어짐). 가짜 훅은 토큰 가진 쪽만, 가짜 로그 줄은 `~/.claude/projects`에 쓸 수 있는 같은 사용자 프로세스 → G5.

**(5) 글꼴** — 바이트 대조 완료(아래 확인한 것 5). SOURCE.md의 커밋은 GitHub 태그 `v2.40.3`과 같다.

**(6) 30초 `get_sessions`** — Claude Code는 느려지지 않는다(훅 응답이 잠금 전에 나감, `server.rs:99-106`; 로그 감시는 원래 별도 스레드). Orbit 쪽 비용은 G4.

## 차단

없음.

## 권고 (번호는 Lead가 decisions.md 후속 목록에 옮김)

**G1 · 권고 · `src-tauri/tauri.conf.json:25`** — asset scope가 확장자를 보지 않는다. SVG(그리고 HTML 등 아무 파일)도 `screens/` 바로 아래면 asset 프로토콜이 내준다(프로브 `a.svg` 허용). 확장자 필터는 `list_screens`(`screens.rs:16`)에만 있다.
- 시나리오: 같은 사용자의 다른 프로세스나 사용자가 `screens\x.svg`/`x.html`을 둠 → 지금 코드는 그 경로를 화면에 넘기지 않으므로 그대로는 아무 일 없음. webview에 스크립트 실행(XSS)이 생기거나 나중 코드가 asset URL로 이동하면, Tauri가 MIME을 내용·확장자로 정해(`protocol/asset.rs:83-97`) SVG·HTML 문서로 열 수 있다.
- 최악: 다른 결함과 연쇄될 때 asset.localhost 출처에서 스크립트 실행. 그 출처가 IPC를 부를 수 있는지는 확인하지 못했다. 영향 범위는 이 PC의 Orbit webview.
- 수정: scope를 `{"allow": ["$APPDATA/screens/*"], "deny": ["$APPDATA/screens/*.svg", "$APPDATA/screens/*.svgz", "$APPDATA/screens/*.htm*", "$APPDATA/screens/*.xhtml"]}`로 하거나 확장자별 allow로 좁힌다(glob 매칭은 대소문자 구분이라 대문자 변형도 적어야 함).

**G2 · 권고 · `src-tauri/tauri.conf.json:25`, Tauri `scope/fs.rs` `canonicalize_parent`** — 앱 시작 때 `screens`가 정션·심볼릭 링크면 scope에 그 대상 폴더(`<대상>\*`)가 추가된다(프로브 확인). 하드 링크는 `is_file`·`inside`·asset scope를 모두 통과한다(같은 파일이므로).
- 시나리오: `%APPDATA%\dev.orbit.app`에 쓸 수 있는 같은 사용자 프로세스가 `screens`를 `%USERPROFILE%\.claude` 정션으로 바꿈 → 다음 실행부터 webview가 `http://asset.localhost/…\.claude\.credentials.json`·`settings.json`(훅 토큰 평문) 같은 파일을 읽을 수 있는 범위가 됨. `list_screens`는 그림 확장자만 보이므로 화면에 저절로 나오지는 않음.
- 최악: webview에 스크립트 실행이 생기면(현재 경로 없음) Claude 자격 증명·훅 토큰을 webview 메모리로 읽을 수 있다. CSP가 원격 `connect-src`·`img-src`를 막아 바깥으로 보내는 직접 경로는 없지만 최상위 이동(navigation)은 CSP가 막지 않는다(확인 안 함). 그 프로세스는 이미 같은 사용자 권한이라 파일을 직접 읽을 수 있으므로 권한 경계를 새로 넘지는 않는다. 영향 범위: 이 PC 사용자 한 명의 자격 증명·토큰.
- 수정: `assetProtocol.scope`를 비우고 setup에서 `screens`가 재분석 지점(reparse point)이 아님을 `symlink_metadata`로 확인한 뒤 `app.asset_protocol_scope().allow_directory(..., false)`로 런타임 등록하거나, 최소한 시작 때 `screens`가 링크·정션이면 액정을 끄고 상태에 알린다.

**G3 · 권고 · `src-tauri/src/sessions.rs:125-132, 113-116, 260`** — `kind`·`description`·`agent_id`·`tool_use_id`·`cwd` 길이 상한 없음, 세션 수 상한 없음(노드는 세션당 200). 훅 하나 4 MiB(`server.rs:9`), 로그 줄 하나 16 MiB까지 들어온다.
- 시나리오: 토큰 가진 쪽이 세션 id를 바꿔 가며 큰 `description`의 PreToolUse(Agent)를 보냄, 또는 같은 사용자 프로세스가 큰 `description`의 JSONL 줄을 씀 → 세션당 최대 200×(4~16 MiB)를 메모리에 들고 30초마다 IPC로 직렬화해 webview가 파싱.
- 최악: Orbit 메모리 수 GiB → OOM 종료, 로그에 남은 줄이면 켤 때마다 반복(③ A1과 같음). webview가 멈춤. Claude Code·다른 프로세스에는 영향 없음. 정상 사용에서 `description`은 모델 출력이라 짧다(추정).
- 수정: 저장할 때 문자열을 예컨대 256자로 자른다(`fill_from_input`, `nonempty`, `touch`의 `cwd`). 세션 수 상한은 ③ A3과 함께.

**G4 · 권고 · `src-tauri/src/lib.rs:80`, `sessions.rs:381-383`, `src/App.tsx:76`** — 30초마다 `all()`이 모든 세션을 **events(세션당 최대 500개, 직렬화하지 않음)까지** 복제하고, 그동안 Store 잠금을 쥔다. 잠금을 기다리는 쪽은 훅 이벤트 소비 스레드와 로그 감시 회차뿐이라 Claude Code는 느려지지 않는다(`server.rs:99-106` 응답 먼저).
- 최악(추정·미측정): 로그 폴더에 세션이 수천 개면 30초마다 수십~수백 MB를 잠시 할당하고 그 시간만큼 화면 갱신이 늦는다. 영향 범위 Orbit 하나.
- 수정: 잠금 안에서 events를 빼고 복제(예: `Session`을 events 없이 만드는 함수)하거나, 마지막 전송 이후 `ver`가 바뀐 세션만 보낸다.

**G5 · 권고 · `src-tauri/src/sessions.rs:134-232, 234-255`** — 그래프 상태는 위조할 수 있다. 훅은 토큰 가진 쪽만(유효), 로그는 `~/.claude/projects`에 쓸 수 있는 같은 사용자 프로세스 누구나, `description`·`subagent_type` 텍스트는 점검 대상 저장소의 프롬프트 인젝션으로 모델이 쓰게 만들 수 있다(예: description "qa 통과").
- 최악: 실패·실행 중인 서브에이전트가 "끝남"으로 보이거나 없는 노드가 보여 사용자가 잘못 판단(DECISIONS 6의 수용 위험과 겹침). 코드 실행·파일 접근은 없음(텍스트 렌더). 영향 범위: 모든 세션의 그래프 표시.
- 수정: 지금은 문서화만. 출처(`hook`/`log`)를 노드에도 보이게 하는 것은 ⑤ 이후 검토.

**G6 · 권고 · `src-tauri/tauri.conf.json:21`** — prod CSP에 `default-src`가 덮지 않는 `base-uri`·`form-action`·`frame-ancestors`가 없고, `object-src`·`frame-src`가 `ipc:`·`http://ipc.localhost`까지 상속한다. 지금 HTML 삽입 경로가 없어 악용 경로는 찾지 못함.
- 수정: `object-src 'none'; base-uri 'none'; form-action 'none'`을 붙인다(devCsp도 같이).

**G7 · 권고 · `src-tauri/src/screens.rs:12-25`, Tauri `protocol/asset.rs:53-59`** — 검사와 사용 사이 경쟁(N20): `list`는 `is_file` 뒤 canonicalize, Tauri asset 처리는 `is_allowed`(canonicalize) 뒤 원래 경로로 `File::open`. 그 사이 파일을 링크로 바꾸면 검사를 지난 경로로 다른 파일이 열릴 수 있다. 할 수 있는 쪽은 `screens`에 쓸 수 있는 같은 사용자 프로세스뿐이고, 같은 결과를 하드 링크로 경쟁 없이 얻을 수 있다(G2). `screens.rs:23` 주석 "도달 경로 없음"은 "정상 경로에서는"이 맞다.
- 최악: G2와 같음. 수정: G2를 고치면 따로 할 것 없음. 주석만 바로잡는다.

## 확인한 것 (명령과 출력)

1. 변경 범위·커밋
   - `git status --porcelain --untracked-files=no` → (출력 없음, 시작·끝 두 번). `git rev-parse HEAD` → `eebe9617032a18c13b5fc72b4f4ce9cc65b76cee`.
   - `git diff --name-only main...orbit/20261114-graph-ui | grep -E '^(\.claude|harness|CLAUDE\.md|\.mcp\.json|package|src-tauri/(capabilities|build\.rs|src/(server|hooks|config|watch)))'` → 출력 없음. `git diff --stat … -- src-tauri/capabilities …server.rs hooks.rs config.rs package.json package-lock.json` → 출력 없음.
2. 비밀값: 추가 줄에서 `lclk1|C:\\Users|token=…|api_key|secret|password|sk-|ghp_|AKIA|BEGIN … PRIVATE|Bearer` grep → `design/reference/layout_v4.html`의 예시 경로 `C:\Users\you\…` 4줄뿐(자리표시자). 새 로그 출력은 테스트 안 `eprintln!` 1곳(링크 생성 오류). Tauri asset 처리의 `log::error!`는 로거 플러그인이 없어 출력되지 않는다(Cargo.toml에 log 플러그인 없음).
3. HTML 삽입: `grep -rn -E 'dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|href=|window\.open|location' src/` → 출력 없음. `design/reference/layout_v4.html`에 원격 출처·`<script src` 없음, 빌드 입력도 아님.
4. Tauri 소스(2.12.5, tauri-utils 2.10.2, tauri-codegen 2.7.4, glob 0.3.4 — `Cargo.lock`) 읽음: `scope/fs.rs` 100-250, 410-500 (`require_literal_separator: true`, canonicalize), `protocol/asset.rs` 33-100, `manager/mod.rs` 360-372, `tauri-codegen/src/context.rs` 155-175.
5. 글꼴: `sha256sum src/assets/fonts/Galmuri11.woff2` → `f467d1b10e6b88dfa8399c9f93b38c7643e050abfe4fc15800ac0b000f5a57d6`, 첫 4바이트 `wOF2`.
   `npm view galmuri@2.40.3 dist.integrity gitHead` → `sha512-eXflXih1…Q7mWbw==`, `c53c3038e200c5516c84c66cede840ae1c409b2d`.
   `npm pack galmuri@2.40.3 --ignore-scripts`(스크래치 폴더) → 타르볼 sha512 = `sha512-eXflXih1AWy2J+jWeT5sGVj4PUCb1bMK7lnwKDKMzEd3lx+F6myuxqp6c0eZlD7EMXOicUYaM+FH7DAoQ7mWbw==`(SOURCE.md와 같음), `package/dist/Galmuri11.woff2` sha256 = `f467d1b1…5a57d6`(저장소 파일과 같음), `cmp dist/LICENSE.txt src/assets/fonts/OFL.txt` → 같음.
   `git ls-remote https://github.com/quiple/galmuri 'refs/tags/*2.40.3*'` → `c53c3038e200c5516c84c66cede840ae1c409b2d refs/tags/v2.40.3`(gitHead와 같음). 글꼴은 `App.css:1`에서 상대 경로로만 로드, 원격 없음.
6. scope 프로브: 스크래치 폴더에 glob 0.3.4로 Tauri `push_pattern`·`canonicalize_parent`·`is_allowed`를 옮긴 프로그램(`cargo build --offline`)을 `%TEMP%\orbit-sec4` 고정물(정션은 `mklink /J`)에 실행. 출력:
   ```
   app/screens/a.png        exists=true  allowed=true
   app/screens/a.svg        exists=true  allowed=true
   app/screens/sub/in.png   exists=true  allowed=false
   app/screens/../secret.txt exists=true allowed=false
   app/screens/jdir/in.png  exists=true  allowed=false   (jdir = 폴더 밖 정션)
   app/screens/nope/../../secret.txt exists=true allowed=false
   app/screens/..           exists=true  allowed=false
   junction-screens patterns: [...\app2\screens\*, \\?\...\outside\*]
   outside/secret.txt  direct allowed=true ; outside/deeper/x.txt direct allowed=false
   ```
   파일 심볼릭 링크 생성: `Administrator privilege required for this operation.` → 링크 경우는 프로브 못 함.
7. `cargo test`(`src-tauri/`, `ORBIT_CLAUDE_SETTINGS`·`ORBIT_CLAUDE_PROJECTS`·`CLAUDE_CONFIG_DIR`를 `%TEMP%\orbit-sec4`로) → `test result: ok. 76 passed; 0 failed`, 종료 0. `symlink_out_is_excluded ... ok`(이 환경에서 링크 생성 실패 시 단언 건너뜀).
8. 의존성: 새 Rust 크레이트 `http-range` 0.1.6 하나(`Cargo.lock`), `unsafe` 0건(`grep -c unsafe src/*.rs` → 0), build.rs 없음. npm 의존성 변경 없음(package.json·lock diff 없음) → `npm audit` 대상 없음. `cargo audit`·`cargo deny` 미설치(`which` 실패) → **미실행**.

## 확인하지 못한 것

- `cargo audit`(미설치, 설치하지 않음). http-range·tauri의 RustSec 권고 여부는 도구로 보지 않았다.
- 앱 실행 기반 확인 전부(qa와 충돌 방지): WebView2에서 asset 출처(`http://asset.localhost`)가 IPC를 부를 수 있는지, asset URL로 최상위 이동이 되는지, SVG가 asset으로 문서처럼 열리는지(G1·G2의 연쇄 가능성).
- 파일 심볼릭 링크 경우의 scope 동작(권한 없음). 정션만 실측.
- `$APPDATA` = `app_data_dir()`, prod CSP 헤더, `style` prop 동작, "폴더 열기" 탐색기 창은 T8 증거를 믿었고 다시 보지 않았다.
- G3·G4 메모리·시간은 측정하지 않았다(추정).
- macOS·Linux(`require_literal_leading_dot` 기본값 true, `asset:` 스킴) 동작은 보지 않았다.
- 실제 `~/.claude`는 보지 않았으므로 실제 세션 수 기준의 G4 비용은 모른다.

1차 판정(eebe961): PASS — 아래 재감사 판정으로 대체됨.

---

## 재감사 (eebe961..37f3ecc)

범위: `git diff eebe961..37f3ecc`(8개 파일 — A1 `src-tauri/src/sessions.rs`, A2 `design/reference/graph_variants.html`·`design/reference/layout_v4.html`·`design/tokens.json`, A3 `src/Graph.css`·`src/App.css`, A4·R3 `src/Graph.tsx`·`src/types.ts`). 시작·끝 모두 `git status --porcelain --untracked-files=no` 출력 없음, `git rev-parse HEAD` = `37f3ecc87ffedb084c013b63a26f84e05c49ce05`. 앱은 띄우지 않았다(qa 사용 중). 실제 `~/.claude`는 읽거나 쓰지 않았다.

### 판정 요약

차단 없음. 새 권고 G8~G9. G1~G7은 변경분과 무관해 그대로 유효하다(asset scope·CSP·screens·훅 서버·settings 병합 코드 무변경). G3·G5의 범위만 아래처럼 조금 넓어졌다.

### 신뢰 경계·권한·의존성

- 새 신뢰 경계 없음. `col`은 입력에서 읽지 않고 Rust가 생성 순서로 계산한다(`sessions.rs:114-119`). `Agent`는 `Serialize`만 derive(`sessions.rs:25`) — 역직렬화 경로 없음, `Agent { … }` 생성 지점은 `push_agent` 하나(`sessions.rs:119`).
- `Cargo.toml`·`Cargo.lock`·`package.json`·`package-lock.json`·`tauri.conf.json`·`capabilities/`·`index.html`·`vite.config.ts` 무변경(아래 R-1). 하네스·에이전트 설정(`CLAUDE.md`, `.claude/`, `harness/`, `.mcp.json`)도 diff에 없음 → agent-config-audit 대상 없음.
- 새 Rust 명령·네트워크·파일 접근 없음.

### 페이로드 문자열 → HTML·경로·명령·CSS·selector

- HTML: `src/`에 HTML 삽입 API 없음(R-3). 노드 이름·라벨은 이전과 같이 JSX 텍스트(`Graph.tsx` `render`).
- React `key`: `nodeKey(a)`(`types.ts:15` = `tool_use_id ?? agent_id ?? ""`)는 페이로드 문자열이지만 React 내부 비교용이라 DOM·selector로 가지 않는다. 빈 key 대체 `i${b.x}_${b.y}`는 숫자뿐. 같은 id 중복 시 React 경고·재사용 오류는 이전부터 있던 표시 문제(G5 범주).
- selector: `closest(".gscroll")`는 상수 문자열, `scrollIntoView` 대상은 `targetRef`(상태 `run`/`wait`로만 고름). 페이로드 문자열이 selector·`querySelector`에 들어가는 곳 없음(R-3 grep).
- CSS·SVG: `style`은 `left/top/width/height`에 숫자만(`b.x`, `b.y`, `H`, `cw`, `ch`, side-note `PX`·계산값). SVG `d`·`viewBox`·`width`·`height`도 숫자 템플릿뿐. 페이로드 문자열이 CSS 값·클래스명으로 가는 곳 없음(클래스는 `cls` 열거값).
- CSP `style-src 'self'`: 새 인라인 `<style>`·`style` 속성 문자열 삽입 없음. React `style` prop은 1차 감사(체크리스트 7, T8 5번)대로 CSSOM 적용이라 이전과 같은 경로다. 새 `style=` 위치는 `.canvas` div와 `li`(이전에도 같은 두 곳 + side-note).
- `moveKey`(`Graph.tsx`)는 세션 id·state 열거값을 이은 문자열로 effect 의존성 비교에만 쓰인다.

### `col` 계산 (A1) — 오버플로·조작

- `last + 1`(`sessions.rs:118`)은 u32. 한 번의 `push_agent`에 최대 1 증가하고, 증가하려면 마지막 열에 Done/Failed 노드가 있어야 한다. 토큰 가진 쪽은 "처음부터 끝난" SubagentStop(새 agent_id)을 연달아 보내면 요청 하나당 1 증가시킬 수 있다(테스트 `r_col_born_finished`와 같은 경로). 축출(`MAX_AGENTS`=200, `sessions.rs:6,120`)은 노드 수만 줄이고 `max(col)`은 줄지 않는다 → 세션 하나 안에서 col은 단조 증가하고 상한이 없다.
- u32::MAX(약 4.29×10⁹)까지 같은 세션에 요청 4.29×10⁹개가 필요하다(로그 경로로는 같은 수의 JSONL 줄 ≈ 수백 GB). 결과:
  - 릴리스(`Cargo.toml:29-34`에 `overflow-checks` 없음 → 기본 꺼짐, wrap): 새 노드 col = 0 → 프론트 순위에서 맨 왼쪽 열로 그려짐. 표시만 틀어짐.
  - 디버그(`tauri dev`, overflow-checks 켜짐): `push_agent`에서 panic → 훅 이벤트 소비 스레드(`server.rs:122` `rx.iter().for_each(on_event)`)가 죽어 그 뒤 훅 이벤트가 화면에 반영되지 않음(로그 경로가 panic하면 감시 스레드). Store 잠금은 `lib.rs:35-36`이 poison을 풀어 읽기는 계속됨. Claude Code는 영향 없음(204 먼저).
  - 현실성: 낮음. 토큰 가진 쪽(또는 같은 사용자 프로세스)이 수십억 요청을 보내야 한다. → G8.
- 조작한 col이 화면에 미치는 최대 영향: 프론트가 col을 촘촘한 순위로 바꾸므로(`Graph.tsx` `cols` 정렬·`indexOf`) 열 수 ≤ 노드 수 ≤ 200. canvas 폭 최대 `(200+1)×216−48 ≈ 43,368px`, 한 열에 200개면 높이 `200×72−12 = 14,388px`. 큰 숫자 col 값 자체는 좌표에 들어가지 않는다(순위만 씀). u32는 JS 안전 정수 범위 안. 거짓 열 배치는 G5(위조 가능한 그래프)의 한 형태.
- 비용: `push_agent`가 노드 수만큼 두 번 훑음(n ≤ 200), 프론트 렌더는 `indexOf`로 O(n·열) ≤ 4만 비교, 간선 `<path>` 최대 약 200개 + `.flow` 애니메이션 경로. 30초 폴링·이벤트마다 이 정도라 문제 될 크기 아님(측정 안 함, 추정).
- 합치기 `a.col.min(o.col)`(`sessions.rs:195`)은 값을 줄이기만 해 오버플로 없음.

### 자동 스크롤 (A4·R3)

- `scrollIntoView`는 `.gscroll`과 바깥 스크롤 조상도 움직일 수 있다(PLAN RA6) — 표시 문제, 보안 영향 없음. 포커스가 그래프 안이면 건너뜀(`Graph.tsx` effect 첫 줄).
- 훅으로 상태를 계속 바꾸면 `moveKey`가 바뀌어 스크롤이 반복될 수 있다(사용자가 만지면 `nearest`로 완화). 토큰 가진 쪽이 화면을 흔드는 정도이고 G5 범주.

### 시안 파일 (A2)

- `design/reference/*.html`·`design/tokens.json`은 앱 번들에 들어가지 않는다: `src/`·`index.html`·`vite.config.ts` 어디도 `design`을 참조하지 않음(R-2 grep 출력 없음), Vite 입력은 `index.html` 하나, `publicDir` 기본 `public/`은 비어 있음, `tauri.conf.json:10` `frontendDist: ../dist`, 기존 `dist/`에는 `index.html`·`assets`만.
- 시안 HTML 두 개에 `<script>`·이벤트 핸들러 속성·`http(s)://`·`<link>`·`<img>`·`<iframe>`·`@import` 없음(R-2 grep). 외부 요청은 `graph_variants.html:16`의 글꼴 `url("../../src/assets/fonts/Galmuri11.woff2")` 하나 — 저장소 안 상대 경로. `<style>` 각 1개.
- HTML 주석(`graph_variants.html:2-5`, `layout_v4.html:2-4` 등)은 시안 설명뿐, 에이전트에게 하는 지시 없음.
- 참고: `npm run dev`/`tauri dev` 중 Vite 개발 서버는 저장소 루트 파일을 `localhost:1420`으로 내준다(시안 포함). 기존 동작이고 개발 때만, 비밀 없는 정적 파일이라 권고로 올리지 않음.

### 비밀값

추가 줄에서 `lclk1|C:\\Users|token=|api_key|secret|password|sk-|ghp_|AKIA|PRIVATE|Bearer` → 출력 없음(R-3). 새 로그 출력 없음(Rust 추가분은 계산·테스트뿐).

### 기존 권고 변화

- G3: 노드당 `col: u32` 4바이트 추가뿐, 결론 같음.
- G5: 위조로 바꿀 수 있는 것에 "열 배치"와 "자동 스크롤 위치"가 더해졌다. 최악 결과(잘못된 판단 유도, 코드 실행·파일 접근 없음)는 같다.
- G1·G2·G4·G6·G7: 해당 코드 무변경, 그대로.

### 새 권고

**G8 · 권고 · `src-tauri/src/sessions.rs:118`** — `last + 1`이 u32 오버플로를 막지 않는다.
- 시나리오: 훅 토큰을 가진 쪽(또는 `~/.claude/projects`에 쓸 수 있는 같은 사용자 프로세스)이 한 세션에 "처음부터 끝난" 서브에이전트 이벤트를 약 4.29×10⁹번 보냄 → 디버그 빌드에서 훅 소비 스레드 panic으로 그 뒤 모든 훅 이벤트가 화면에 반영되지 않음(앱 재시작 전까지), 릴리스에서는 col이 0으로 감아 노드가 맨 왼쪽 열에 그려짐.
- 최악: Orbit 화면 갱신 중단(디버그) 또는 배치 오류(릴리스). Claude Code·파일·자격 증명에는 영향 없음. 필요한 요청 수 때문에 현실성 낮음.
- 수정: `last.saturating_add(1)` 한 단어.

**G9 · 권고 · `src/Graph.tsx` effect(`scrollIntoView`, `moveKey`)** — 자동 스크롤 대상과 시점이 위조 가능한 상태(G5)로 정해진다. 토큰 가진 쪽이 상태를 번갈아 바꾸면 사용자가 그래프를 만지기 전까지 화면이 계속 옮겨진다(포커스가 그래프 안이면 멈춤, `smooth`는 reduced-motion 설정을 따름).
- 최악: 그래프를 읽기 어려워지는 표시 방해. 데이터·권한 영향 없음.
- 수정: 지금은 문서화만(G5와 함께 다룬다).

### 확인한 것 (명령과 출력)

R-1. 범위·커밋
- `git status --porcelain --untracked-files=no` → (출력 없음, 시작·끝). `git rev-parse HEAD` → `37f3ecc87ffedb084c013b63a26f84e05c49ce05`.
- `git diff --stat eebe961..37f3ecc` → 8개 파일: `design/reference/graph_variants.html | 366 +`, `design/reference/layout_v4.html | 96`, `design/tokens.json | 18`, `src-tauri/src/sessions.rs | 178`, `src/App.css | 6`, `src/Graph.css | 30`, `src/Graph.tsx | 108`, `src/types.ts | 3` (723 insertions, 82 deletions).
- `git diff --stat eebe961..37f3ecc -- src-tauri/Cargo.toml src-tauri/Cargo.lock package.json package-lock.json src-tauri/tauri.conf.json src-tauri/capabilities index.html vite.config.ts` → 출력 없음.

R-2. 시안·번들
- `grep -rn "design" src vite.config.ts index.html` → `src/assets/fonts/OFL.txt:44`(라이선스 본문 "designer") 하나뿐.
- `grep -niE "<script|src=|href=|url\(|@import|https?://|fetch|<link|<iframe|<img|on[a-z]+=" design/reference/*.html design/tokens.json` → `graph_variants.html:11`·`layout_v4.html:11` `<meta name="viewport" …>`(on 패턴 오탐), `graph_variants.html:16` `src: url("../../src/assets/fonts/Galmuri11.woff2")`. 그 밖에 없음.
- `ls dist` → `assets`, `index.html`. `ls public` → 비어 있음.
- `grep -n csp src-tauri/tauri.conf.json` → `:21` prod `style-src 'self'`(무변경).

R-3. 비밀값·HTML 삽입
- `git diff eebe961..37f3ecc -U0 | grep '^+' | grep -nE 'lclk1|C:\\\\Users|token=|api_key|secret|password|sk-|ghp_|AKIA|PRIVATE|Bearer'` → 출력 없음(rc=1).
- `grep -rnE 'dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|querySelector' src/` → 출력 없음(rc=1).

R-4. `col` 경로
- `Grep 'MAX_AGENTS|derive\(|Agent \{|\.col\b'` in `sessions.rs` → `:6 MAX_AGENTS = 200`, `:25 #[derive(Clone, serde::Serialize)]`, `:116-119` 계산·생성(유일), `:195` min 합치기, 나머지는 테스트.
- `Cargo.toml:29-34` `[profile.release]` → `codegen-units = 1`, `lto = true`, `opt-level = 3`, `panic = "abort"`, `strip = true`(overflow-checks 지정 없음).
- 소비 스레드: `server.rs:122` `std::thread::spawn(move || rx.iter().for_each(on_event))`, 잠금 `lib.rs:35-36` `unwrap_or_else(|e| e.into_inner())`.

R-5. 테스트
- `cd src-tauri && CARGO_TARGET_DIR=$TEMP/orbit-sec4/target cargo test` → `test result: ok. 87 passed; 0 failed; 0 ignored`(lib), main·doc 0개, 종료 0. 새 `r_col_*` 11개 포함(76 → 87). 테스트는 `~/.claude`를 쓰지 않는다(경로 결정 `lib.rs:143-160`은 앱 setup에만 있음). 빌드 산출물은 `%TEMP%\orbit-sec4\target`에만.

R-6. 의존성: Rust·npm 매니페스트·잠금 파일 무변경(R-1) → `cargo audit`·`npm audit` 대상 없음(그리고 `cargo audit` 미설치, 1차와 같음).

### 확인하지 못한 것

- 앱 실행 기반 확인(qa 사용 중): 열이 200개일 때의 실제 렌더 시간, 자동 스크롤 반복 체감, 바깥 조상 스크롤(RA6), CSP 위반 콘솔 여부는 보지 않았다. CSSOM 경로가 이전과 같다는 코드 근거만 있다.
- G8 오버플로는 실제로 4.29×10⁹ 이벤트를 넣어 보지 않았다(코드·빌드 프로필 근거). 디버그 panic이 소비 스레드를 끝낸다는 것도 코드 근거(`for_each` 안 panic → 스레드 종료).
- `dist/`는 이번 커밋으로 다시 빌드하지 않았다(번들 제외는 참조 grep과 Vite 입력 구성 근거).
- `npm run build`(타입 검사)는 실행하지 않았다(qa 담당).

재감사 1 검증 커밋(이전): 37f3ecc87ffedb084c013b63a26f84e05c49ce05
재감사 1 판정(이전): PASS — 아래 재감사 2 판정으로 대체됨.

---

## 재감사 2 (37f3ecc..803e28f)

범위: 커밋 803e28f(R4) 하나, `src/Graph.tsx` 1줄. 시작·끝 모두 `git status --porcelain --untracked-files=no` 출력 없음, `git rev-parse HEAD` = `803e28f467eaa8b3cb351cd5413862969d4f1db6`. 앱은 띄우지 않았다(qa 담당). 실제 `~/.claude`는 읽거나 쓰지 않았다.

### 판정 요약

차단 없음. 새 권고 없음. G1~G9 그대로 유효(해당 코드 무변경).

### 변경 내용과 판단

- `src/Graph.tsx:55` Lead 노드 `meta: ""` → `meta: st === "waiting" ? "권한 요청" : "— · —"`. 두 값 모두 소스 안 고정 문자열이고, 고르는 조건 `st`는 `shownState(session)`이 돌려주는 상태 열거값이다. 페이로드·로그 문자열이 이 값에 들어가지 않는다.
- 렌더: `Graph.tsx:67` `<span className="n-meta">{b.meta}</span>` — JSX 텍스트 노드. HTML 삽입·`style`·클래스명·selector·경로·명령으로 가는 곳 없음.
- 위조 가능성: 대기 상태를 꾸며 "권한 요청"을 띄우는 것은 이미 있던 `sym "!"`·`blink`·`cls "wait"`와 같은 상태 값에서 나오므로 G5의 범위가 넓어지지 않는다.
- 권한·의존성·CSP·하네스 설정: diff가 `src/Graph.tsx` 하나라 capability, `tauri.conf.json`(CSP), 매니페스트·잠금 파일, `CLAUDE.md`·`.claude/`·`harness/`·`.mcp.json` 모두 무변경 → agent-config-audit·audit 도구 대상 없음.
- 비밀값: 추가 줄은 위 한 줄뿐, 토큰·키·경로 없음. 로그 출력 추가 없음.

### 확인한 것 (명령과 출력)

R2-1. `git status --porcelain --untracked-files=no` → (출력 없음, 시작·끝). `git rev-parse HEAD` → `803e28f467eaa8b3cb351cd5413862969d4f1db6`.
R2-2. `git diff --stat 37f3ecc..803e28f` → `src/Graph.tsx | 2 +-`, `1 file changed, 1 insertion(+), 1 deletion(-)`.
R2-3. `git diff 37f3ecc..803e28f` → 위 1줄 교체(`@@ -52,7 +52,7 @@`, `- … meta: "", …` / `+ … meta: st === "waiting" ? "권한 요청" : "— · —", …`).
R2-4. `git diff --name-only 37f3ecc..803e28f -- package.json package-lock.json src-tauri/` → 출력 없음, 종료 0.
R2-5. `grep -n "meta" src/Graph.tsx` → `:10` 타입 선언, `:42` 서브에이전트 meta(이전과 같음), `:55` 이번 변경, `:67` 텍스트 렌더.
R2-6. `grep -rn "dangerouslySetInnerHTML\|innerHTML" src/` → 출력 없음.

### 확인하지 못한 것

- 화면에서 "— · —"·"권한 요청"이 실제로 보이는지(qa 담당). `npm run build`·`cargo test`는 이번에 다시 돌리지 않았다(Rust 무변경, 타입 검사는 qa).

COMMIT: 803e28f467eaa8b3cb351cd5413862969d4f1db6

VERDICT: PASS
