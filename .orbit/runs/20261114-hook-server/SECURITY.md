# SECURITY — 20261114-hook-server (security-deep, 재감사)

대상: run 브랜치 끝 커밋 1395da7. 이전 감사(4c2a2a4, FAIL) 뒤의 커밋 2개를 봤다. ebcd1da는 SessionStart를 빼서 이벤트를 11개로 줄였고, 1395da7은 tiny_http를 지우고 std `TcpListener` 기반 파서로 바꿨다. 바뀐 파일: SPEC.md, src-tauri/Cargo.toml·Cargo.lock, src-tauri/src/hooks.rs·server.rs.
모드: security-deep(full 트랙, 로컬 서버·토큰·직접 쓴 HTTP 파서). 작업 트리가 깨끗한 상태(`git status --porcelain --untracked-files=no` 출력 없음)의 HEAD를 감사했다. 감사 시작과 끝에 HEAD가 같았다.

COMMIT: 1395da7d5095a0c82002e4a83f7312f3971f406a

## 요약

- S1(포트 점유로 훅 가로채기): **수용한 잔여 위험으로 옮긴다.** 사용자가 받은 질문 문구는 공격자 범주, 조건, 얻는 것을 바르게 짚었다. 다만 최악의 결과를 "영향을 시도"로 약하게 적은 점 등 빠진 것 3가지를 아래에 적는다. 이 빠진 것들이 판단을 뒤집을 정도는 아니라고 봤다. 어떤 조건이 되면 차단으로 되돌리는지도 적는다.
- S2(인증 전 요청이 서버를 멈추거나 앱을 죽임): **해소.** 새 파서를 처음부터 감사했고 차단할 결함은 없다. 회귀 테스트 3개가 통과했다.
- 새 권고 2건: R5(동시 연결 상한 없음, 수용 가능), R6(파서의 작은 관대함). 이전 권고 R1~R4는 그대로 둔다(R4의 대상 크레이트는 바뀌었다).
- 차단 0건.

## S1 · 수용한 잔여 위험(이전에는 차단) · Orbit이 꺼진 동안 포트를 점유해 훅을 가로채기

- 위치: `src-tauri/src/hooks.rs`의 `EVENTS`(이제 11개, 모두 `http://127.0.0.1:<고정 포트>/events`), `config.rs`(포트를 한 번 정해 영구 저장). 시나리오는 이전 SECURITY.md S1과 같다.
- 수용 기록: DECISIONS.md 11번(사용자에게 보인 질문 문구와 답), `.orbit/decisions.md` 12번(후속 (가) 응답 무시 옵션 조사, (나) 2xx JSON이 권한 판단·도구 입력을 바꾸는지 실측, (다) 결과에 따라 완화책 결정).
- 질문 문구가 바르게 전한 것:
  - 공격자 범주: 다른 계정의 프로세스, 파일 접근이 막힌 프로세스.
  - 같은 계정의 악성 프로세스는 이미 settings.json을 고칠 수 있으므로 새로 생기는 위험이 아니다.
  - 조건: Orbit이 꺼져 있을 때.
  - 공격자가 얻는 것: 훅 페이로드와 토큰, 응답 JSON으로 Claude Code 동작에 영향을 줄 여지.
  - 위험이 남는 곳: 여러 사람이 쓰는 PC.
  이 판단에 필요한 핵심은 빠지지 않았다.
- 빠졌거나 약하게 적힌 것(판정에 반영함):
  1. 최악의 결과가 "동작에 영향을 시도"로만 적혔다. 실제 최악은 이렇다. PreToolUse·PermissionRequest에 allow와 `updatedInput`을 돌려주면 사용자 권한의 Claude Code 세션에서 공격자가 고른 명령이 실행될 수 있다. 다른 계정에서 이 사용자 계정으로 권한이 오르는 것이다. 이 결과는 실측되지 않은 추론이고, 후속 (나)가 바로 그 실측이다.
  2. 범위가 모든 프로젝트와 모든 세션이라는 점이 문구에 없다. 전역 설치(결정 2)로 이미 정해진 사항이긴 하다. 페이로드에는 프롬프트, 도구 입력·출력, 읽은 파일 내용이 들어가므로 비밀값도 함께 넘어간다.
  3. "꺼진 동안"에는 다음 경우도 들어간다. Orbit을 켰는데 포트가 이미 점유돼 bind에 실패한 상태(결정 6, 오류만 표시)와 재시작 사이의 틈.
- 판정 근거:
  - 사용자는 공격자 범주와 조건을 정확히 알고 수용했다. 빠진 것은 결과의 크기 표현과 범위이고, 공격 성립 조건은 빠지지 않았다.
  - 대상 환경은 Windows 개인 개발 PC다.
  - 이번 변경(ebcd1da)으로 컨텍스트를 주입할 수 있는 이벤트가 하나 줄어 공격면이 늘지 않았다. UserPromptSubmit에는 주입 경로가 남아 있다.
  - 그래서 수용으로 옮긴다.
- 다음 경우에는 차단으로 되돌린다:
  - 후속 (나)의 실측에서 http 훅의 2xx JSON 응답이 실제로 permission allow 또는 `updatedInput`으로 적용되는 것이 확인되고, 여러 사용자가 쓰는 PC나 다른 사람에게 배포하는 빌드를 대상으로 하는 경우.
  - 다른 사람에게 배포하는 경우에는 위 1~3을 사용자 안내에 적는다.
- 권장: 후속 (나)를 다음 마일스톤에서 서버 기능을 넓히기 전에 한다. 같은 실측에서 이 저장소 하네스 관문(gate.mjs)의 deny가 다른 훅의 allow보다 우선하는지도 함께 확인한다.

## S2 · 해소 · 토큰 없는 로컬 요청 하나로 수신 서버가 멈추거나 앱이 종료되던 문제

- 수정: 1395da7. tiny_http와 그것이 끌어오던 ascii·chunked_transfer·httpdate를 Cargo.lock에서 지웠다. `server.rs` 전체를 새로 썼다.
- 이전 시나리오 a~c에 대한 확인:
  - a) 본문을 보내지 않고 멈추는 경우
    - 연결마다 스레드를 따로 띄운다(`server.rs:124-129`).
    - 연결 하나가 읽기에 쓸 수 있는 시간이 총 2초다(`server.rs:13`, `server.rs:20-27`).
    - 응답 뒤 남은 입력은 고정 4 KiB 버퍼로 버린다(`server.rs:110-111`, 2초 안에서).
    - 테스트 `stalled_unauth_body_does_not_block_others` ok.
  - b) 거대한 Content-Length
    - 인증되지 않은 요청은 Content-Length를 해석하기 전에 401로 끝난다(`server.rs:68-69`).
    - 인증된 요청은 `u64`로 파싱하고, 오버플로면 400, `> MAX_BODY`면 413으로 끝낸다(`server.rs:74-80`). 할당은 그 뒤에만 한다.
    - 본문은 미리 확보하지 않고 받은 만큼만 늘린다(`server.rs:83-88`, `with_capacity`·`vec![0; n]` 없음).
    - 테스트 `huge_content_length_does_not_crash`(2^50, u64 최대) ok.
  - c) 끝없이 긴 헤더
    - 헤더 버퍼는 4 KiB 청크로 자라고, `MAX_HEAD`(16 KiB)를 넘으면 431을 돌려준다(`server.rs:38-40,46-48`). 버퍼는 최대 약 20 KiB까지 커진다.
    - 테스트 `oversized_header_rejected` ok.

## 새 파서 감사 (`src-tauri/src/server.rs`)

| 항목 | 판정 | 근거 |
|---|---|---|
| 요청 줄·헤더 상한 16 KiB, 431 | 지킴 | `:38-40` 종단(`\r\n\r\n`)을 찾기 전에 버퍼가 16 KiB를 넘으면 431. `:46-48` 한 번에 받은 덩어리 안에서 종단 위치가 16 KiB를 넘어도 431. 헤더를 다 받기 전에 연결이 끊기거나 마감이 지나면 응답 없이 닫는다(`:42`) |
| Content-Length 해석 | 지킴 | `str::parse::<u64>`: 음수(`-1`)·비숫자·빈 값·`5, 5`·오버플로는 400(`:77`). 값이 없으면 0으로 보고, 빈 본문은 JSON 오류 400. `+5`는 허용(Rust 파서 동작, 무해). 중복 헤더는 첫 번째 값을 쓴다(R6) |
| Transfer-Encoding → 411 | 지킴 | `:70-72`, 토큰 검사 뒤에 있으므로 인증되지 않은 요청은 TE가 있어도 401. CL과 TE가 함께 오면 411 |
| 연결당 총 2초 읽기 제한 | 지킴 | `:98` 연결을 받을 때 마감을 한 번 정한다. `:20-27` 읽을 때마다 남은 시간을 타임아웃으로 다시 건다. 남은 시간이 0이면 `TimedOut`. 1 ms 미만 값은 std가 Windows에서 반올림하거나(소스 미확인) Err로 돌려주는데, 어느 쪽이든 `Err` 경로로 연결을 닫는다. 무한 대기로 빠지지 않는다. 쓰기 타임아웃은 없지만 응답이 100바이트 미만이라 소켓 송신 버퍼에 들어가므로 쓰기에서 막히지 않는다 |
| 인증·크기 검사 뒤에만 본문 할당 | 지킴 | 본문 Vec은 `:83`에서 처음 생긴다. 401·413 경로 전부보다 뒤다. 인증 전에 할당되는 것은 헤더 버퍼(약 20 KiB 이하)뿐이다 |
| 판정 순서 | 지킴 | Host 403 `:59-61` → Origin 403 `:62-63` → 경로 404 `:64-65` → 메서드 405 `:66-67` → 토큰 401 `:68-69` → TE 411 → CL 400 → 413 → 본문(끊기면 400) → JSON 400 / 204. 404·405가 토큰보다 앞서지만 드러나는 정보는 없다(이전 판정 유지) |
| 상수 시간 비교 | 지킴 | `:15-17` XOR 누적. 길이만 먼저 비교하는데 토큰 길이가 64로 고정이라 무해. 테스트 `ct_eq_cases` ok |
| 헤더 이름 대소문자 | 지킴 | `:57` `eq_ignore_ascii_case`. 헤더 이름 앞뒤 공백은 trim한다(`Origin :`도 Origin으로 잡힘 → 닫힌 쪽) |
| 중복 Host | 지킴 | 첫 번째 값만 보고, 그 값이 `127.0.0.1:<port>`/`localhost:<port>`와 정확히 같아야 한다. 브라우저는 Host를 덧붙일 수 없다. 두 번째 Host로 우회할 경로가 없다(뒤에서 해석하는 프록시가 없음) |
| 중복 Origin | 지킴 | `is_some()`이라 Origin이 하나라도 있으면 403 |
| 요청 스머글링 | 해당 없음 | 연결 하나에 요청 하나만 받고, 응답에 `Connection: close`, 응답 뒤 `shutdown(Write)` 후 남은 입력은 버린다. 앞에 프록시가 없다. 본문 길이를 넘는 바이트는 `truncate`한 뒤 버린다. 두 번째 요청을 해석할 주체가 없다 |
| 비UTF-8 헤더 | 지킴 | `from_utf8_lossy`. 토큰은 hex라 대체 문자가 섞이면 일치할 수 없다 |
| 토큰·페이로드 비노출 | 지킴 | 출력 호출이 없다(grep 결과 없음). 응답은 상태 줄과 빈 본문뿐(`:101-102`) |
| 패닉 경로 | 지킴 | `unwrap`은 테스트 안에만 있다. 슬라이스 `buf[..head_end]`·`split_off(head_end+4)`는 종단 위치가 확인된 뒤라 범위 안이다. 스레드 생성 실패는 `let _`로 그 연결만 버린다 |
| 동시 연결 상한 없음 | 권고 R5 (수용 가능) | 아래 |

### R5 · 권고(수용 가능) · 동시 연결·스레드 상한이 없음

- 위치: `src-tauri/src/server.rs:124-129`. DEBUG.md "남은 한계" 1번.
- 시나리오: 토큰이 없는 로컬 프로세스가 연결을 쉬지 않고 연다.
  - 연결마다 스레드가 하나 생기고 최대 2초 산다. 스레드마다 스택 커밋 수십 KiB와 헤더 버퍼 20 KiB 이하를 쓴다.
  - 루프백 출발 포트 범위(Windows 동적 포트 약 16k) 안에서 Orbit의 메모리·CPU가 수백 MiB 규모까지 늘 수 있다.
  - 헤더를 1바이트씩 보내면 `:35` `windows(4).position`이 매번 버퍼 전체를 다시 훑는다. 연결당 2초 동안 CPU를 쓴다(R6).
  - 공격하는 동안에는 accept가 늦어져 정상 훅이 2초 타임아웃까지 기다릴 수 있다.
- 차단이 아닌 이유:
  - 이전 S2와 달리 공격자가 계속 자원을 써야 하고, 멈추면 2초 안에 회복된다.
  - 소켓 하나로 무기한 멈추게 할 수 없고, 할당 크기를 공격자가 정할 수도 없다.
  - 스레드 생성 실패는 패닉하지 않는다.
  - 같은 PC에서 코드를 실행하는 공격자는 메모리·CPU를 직접 소모해 어떤 프로세스든 느리게 만들 수 있다. 이 서버가 새로 여는 위험은 크지 않다.
  - 상한을 두면 공격자가 그 상한만 채워 정상 이벤트를 막을 수 있다는 DEBUG.md의 반론도 타당하다.
- 권장 수정(후속): 동시 연결 상한(예: 256)을 두고, 넘는 연결은 응답 없이 바로 닫는다. 그러면 Claude Code는 즉시 실패해 느려지지 않는다. 함께 종단 탐색을 직전 탐색 위치부터 하게 고친다(R6). `listener.incoming().flatten()`은 accept 오류가 계속 나면 바쁜 루프가 되므로 오류 때 짧게 sleep한다.

### R6 · 권고 · 파서의 작은 관대함(보안 영향 없음, 기록용)

- 종단 탐색 `:35`가 읽을 때마다 버퍼 전체를 다시 훑는다. 최악의 경우 연결당 약 20 KiB²을 비교하며, 2초 제한 안에 갇힌다. 수정: 마지막 3바이트부터 이어서 찾기.
- 헤더 줄을 `\r\n`으로만 나눈다. 맨 LF로 이어 붙인 `Origin`은 앞 줄의 값이 되어 Origin으로 잡히지 않는다. 브라우저는 맨 LF 헤더를 보낼 수 없고 토큰도 필요하므로 우회 경로가 아니다.
- 중복 Content-Length는 첫 번째 값을 쓴다. 연결당 요청 하나라 스머글링으로 이어지지 않는다. 엄밀하게 하려면 값이 서로 다른 중복은 400으로 거부한다.
- 오류 응답의 reason phrase가 비어 있다(RFC 9112 허용).

## 이전 권고(그대로 둠, `.orbit/decisions.md` 12번 후속 목록)

- R1 토큰이 든 백업 파일 누적, 토큰 회전 없음: 이번 diff가 `hooks.rs`의 백업 경로를 바꾸지 않았다. 이전 판정을 유지한다.
- R2 settings.json 교체 때 권한·심볼릭 링크 보존 안 됨: 바뀐 코드가 없어 이전 판정을 유지한다.
- R3 hook-server.json Unix 권한: `config.rs`가 바뀌지 않아 이전 판정을 유지한다.
- R4 cargo audit 미실행: 이번에도 `cargo audit`·`cargo deny`가 없어 실행하지 않았다(설치하지 않음). 새로 추가된 크레이트는 없고 4개가 빠졌다(tiny_http, ascii, chunked_transfer, httpdate). 그래서 이전의 tiny_http 관련 메모는 더 이상 해당 없다. CI나 출고 전에 `cargo audit`를 한 번 돌리라는 권장은 그대로다.

## 수용한 잔여 위험 (이번 run에서 바꾸지 않음)

- **S1** 포트 점유로 훅 가로채기(위 절, DECISIONS 11, 후속 decisions 12). 차단으로 되돌리는 조건은 위에 적었다.
- **R5** 동시 연결 상한 없음(로컬 자원 소모형 DoS, 공격이 멈추면 2초 안에 회복).
- CSP `null`(PLAN R6): 바뀌지 않아 이전 판정을 유지한다.
- 토큰 평문 저장(결정 2·7): 바뀌지 않아 이전 판정을 유지한다.
- settings.json 동시 쓰기 경합(PLAN R5): 바뀌지 않아 이전 판정을 유지한다.
- Host 비교가 대소문자를 구분해 `LOCALHOST:<port>`는 403(닫힌 쪽): 새 파서에서도 같다(`:60`).
- Transfer-Encoding(chunked) 요청은 411로 거절: 닫힌 쪽이다. Claude Code가 chunked로 보내면 이벤트를 잃을 뿐 보안 영향은 없다(QA 실측 몫).

## CLAUDE.md "보안·검증 체크리스트" 항목별 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| `127.0.0.1`에만 바인딩 | 지킴(재판정) | `server.rs:119` `TcpListener::bind(("127.0.0.1", port))`, 테스트 `binds_loopback_only` ok |
| 토큰 검증이 모든 경로에 걸림 | 지킴(재판정) | 이벤트를 넘기는 유일한 경로(`:91`→`:106-107`)가 `:68` 토큰 검사 뒤에 있다. 인증 전 요청이 서버를 멈추게 하던 S2는 해소됐다 |
| 비교가 상수 시간 | 지킴(재판정) | `:15-17` |
| 토큰이 로그·URL·화면에 안 찍힘 | 지킴(재판정) | 출력 호출 grep 결과 없음. 토큰은 헤더로만 전달(`hooks.rs`, 바뀌지 않음) |
| `Origin`/`Host` 검사로 브라우저발 요청 거부, DNS rebinding | 지킴(재판정) | `:59-63`. Host가 정확히 일치해야 하므로 `Host: evil.example:<port>`는 403, 중복 Host·Origin도 위 표대로 닫힌 쪽. 테스트 `origin_403`·`bad_host_403`·`localhost_host_ok` ok |
| 요청 본문 크기 제한 | 지킴(재판정, 이전 S2 해소) | `:79-80` 413은 할당 전, 헤더는 16 KiB에서 431. 테스트 `too_large_413`·`huge_content_length_does_not_crash`·`oversized_header_rejected` ok |
| settings.json 백업 후 병합 | 지킴(유지) | 백업·병합 코드는 바뀌지 않았다. 옛 SessionStart 항목도 헤더로 식별해 지운다(테스트 `legacy_session_start_entry_is_removed` ok) |
| 쓰기가 원자적 | 지킴(유지) | 바뀌지 않았다. 권한 보존은 R2 |
| 로그·페이로드 문자열을 HTML로 안 넣음 | 지킴(유지) | `src/`가 바뀌지 않았다. `dangerouslySetInnerHTML`·`innerHTML` grep 결과 없음 |
| 경로로 쓸 때 정규화 후 범위 검사 | 해당 없음(유지) | 페이로드를 경로로 쓰는 곳이 없다 |
| Tauri capability 최소 | 지킴(유지) | capabilities·tauri.conf.json 변경 없음(diff 출력 없음) |
| CSP 최소 | 미충족(수용 잔여, 유지) | `"csp": null`, 바뀌지 않음 |
| 신뢰 경계: 훅 서버 ← Claude Code 훅 | S1 수용 잔여, S2 해소, R5 권고 | 위 |
| 신뢰 경계: 로그·페이로드 → 화면·경로·셸 | 지킴(유지) | 이전 T6·T7 |
| 신뢰 경계: webview → Rust 명령 | 지킴(유지) | `lib.rs`가 바뀌지 않았다. `server::start` 시그니처도 같다 |
| 신뢰 경계: 점검 대상 파일 → 에이전트 프롬프트 | 이상 없음 | 이번에 읽은 DEBUG.md·DECISIONS.md·decisions.md·server.rs에 에이전트를 향한 지시문이 없다 |
| Orbit이 꺼져 있어도 Claude Code를 막거나 느리게 하지 않음 | 꺼짐: 지킴 / 켜짐: 지킴(이전 S2 위반 해소) | 정상 요청은 즉시 204. 공격받는 동안의 지연은 R5 범위(공격이 계속될 때만, 2초 안에 회복). 응답은 전부 빈 본문이라 Claude Code의 판단을 바꾸지 않는다 |

## 에이전트 설정 점검 (orbit:agent-config-audit)

- 이 저장소의 `CLAUDE.md`, `.claude/`, `harness/`, `.mcp.json`: `git diff 4c2a2a4..HEAD --stat`에 없다(출력 없음). 관문을 약화하거나 권한을 넓힌 변경은 없다. `.claude/`의 파일 내용은 열지 않았다(지시대로).
- 제품이 전역 settings에 넣는 훅: 이벤트 목록에서 SessionStart만 빠졌고 형식(`type: http`, 루프백 url, 토큰 헤더, `timeout: 2`)은 같다. 셸 명령이 없다. 응답 해석 경로는 S1(수용)이다.

## 확인한 것 (명령과 출력)

```
$ git rev-parse HEAD ; git status --porcelain --untracked-files=no
1395da7d5095a0c82002e4a83f7312f3971f406a
(status 출력 없음)

$ git log --format='%H %s' 4c2a2a4..HEAD
1395da7d5095a0c82002e4a83f7312f3971f406a fix(server): replace tiny_http with std listener to close S2 DoS
ebcd1dacbbb98ebe36c7d6d4aba30376514c44bd fix(hook-server): drop SessionStart (http hook unsupported in Claude Code 2.1.317), 11 events (V1)

$ git diff --stat 4c2a2a4..HEAD
 SPEC.md | 2 +-, src-tauri/Cargo.lock | 31 ----, src-tauri/Cargo.toml | 1 -, src-tauri/src/hooks.rs | 18 +++-, src-tauri/src/server.rs | 173 +++---
$ git diff --stat 4c2a2a4..HEAD -- .claude CLAUDE.md harness .mcp.json src-tauri/capabilities src-tauri/tauri.conf.json package.json package-lock.json
(출력 없음)

$ git diff 4c2a2a4..HEAD -- src-tauri/Cargo.lock | grep -E '^[-+]name'
-name = "ascii"
-name = "chunked_transfer"
-name = "httpdate"
-name = "tiny_http"
→ 추가된 크레이트 없음

$ git diff 4c2a2a4..HEAD | grep -niE '^\+.*(secret|password|api[_-]?key|bearer|sk-[a-z0-9]|[0-9a-f]{32,}|C:\\\\Users|/Users/|lclk1)'
(출력 없음) → 비밀값·개인 경로 없음. 테스트 토큰은 "tok-test"·"tok"·"old"·"nope" 같은 더미 값

$ grep -nE 'println!|eprintln!|dbg!|log::|console\.(log|error)' src-tauri/src/*.rs src/*.tsx
(출력 없음)
$ grep -rnE 'dangerouslySetInnerHTML|innerHTML' src
(출력 없음)

$ cargo audit --version ; cargo deny --version
error: no such command: `audit`
error: no such command: `deny`
→ 미실행(설치하지 않음). package.json·lock 변경이 없어 npm audit도 대상 없음, 미실행.

$ cd src-tauri && cargo test
test server::tests::binds_loopback_only ... ok
test server::tests::ct_eq_cases ... ok
test server::tests::localhost_host_ok ... ok
test server::tests::missing_token_401 ... ok
test server::tests::wrong_token_401 ... ok
test server::tests::origin_403 ... ok
test server::tests::bad_host_403 ... ok
test server::tests::too_large_413 ... ok
test server::tests::wrong_method_and_path ... ok
test server::tests::bad_json_400_then_server_alive ... ok
test server::tests::unknown_fields_passed_through ... ok
test server::tests::ok_with_token_delivers_event ... ok
test server::tests::stalled_unauth_body_does_not_block_others ... ok
test server::tests::huge_content_length_does_not_crash ... ok
test server::tests::oversized_header_rejected ... ok
test hooks::tests::legacy_session_start_entry_is_removed ... ok
(hooks 나머지 11개, config 4개 ok)
test result: ok. 31 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.32s

$ grep "fn set_timeout|fn dur2timeout" ~/.rustup/toolchains/stable-x86_64-pc-windows-msvc/lib/rustlib
(출력 없음 — rust-src 미설치, 1 ms 미만 타임아웃 처리는 소스로 확인하지 못함. 어느 쪽이든 닫힌 쪽이라 판정에 영향 없음)
```

읽은 것: 이전 SECURITY.md, DEBUG.md, DECISIONS.md(10·11번), `.orbit/decisions.md` 12번, `server.rs` 전문, `git diff 4c2a2a4..HEAD`(SPEC.md·Cargo.toml·hooks.rs·Cargo.lock), CLAUDE.md 체크리스트.
하지 않은 것: 앱을 띄우지 않았다(QA와 포트·app_data_dir가 겹침). QA 프로세스·임시 폴더는 건드리지 않았다. 실제 `~/.claude/settings.json`과 이 저장소 `.claude/`는 열지 않았다. S1 실측(후속 (나))과 R5 부하 실측은 하지 않았다. 맨 LF·중복 CL 같은 R6 경우는 코드를 읽어 판정했고 테스트로 찔러 보지 않았다.

VERDICT: PASS
