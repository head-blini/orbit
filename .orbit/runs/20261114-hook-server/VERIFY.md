# VERIFY — 20261114-hook-server

COMMIT: 1395da7d5095a0c82002e4a83f7312f3971f406a

작업 트리 깨끗함(`git status --porcelain --untracked-files=no` 출력 없음, 검증 전후 모두). 이전 판정(커밋 4c2a2a4, FAIL)의 결과는 재사용하지 않고 전부 이번에 다시 실행했다. 환경: Windows 10, Claude Code 2.1.317, Node 24. 앱은 `ORBIT_CLAUDE_SETTINGS=%TEMP%\orbit-qa\settings.json`(사본)을 지정한 같은 명령줄에서만 띄웠고, 화면 대상 경로가 사본임을 먼저 확인했다. 실제 `~/.claude/settings.json`과 저장소 `.claude/`는 열지도 고치지도 않았다. 토큰은 변수로만 다뤘고 아래에 값은 없다.

창 조작: WebView2 원격 디버깅(`--remote-debugging-port=9222`)으로 CDP `Input.dispatchMouseEvent`(mouseMoved/Pressed/Released)를 버튼 좌표에 보냈다. 실제 버튼 클릭 이벤트이며 Tauri 명령을 직접 호출한 것이 아니다(사람 손의 클릭은 아님).

## 기준 1. cargo test — 통과
명령: `cd src-tauri; cargo test`
```
test server::tests::stalled_unauth_body_does_not_block_others ... ok
test server::tests::oversized_header_rejected ... ok
test result: ok. 31 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.31s
(bin 0 tests, doc-tests 0 tests: ok)
CARGO_EXIT=0
```
서버(401·403 Origin/Host·413·405/404·깨진 JSON 후 생존·모르는 필드·`binds_loopback_only`·431·멈춘 본문·거대 Content-Length), 설치 도우미 테스트 포함.

## 기준 2. npm run build — 통과
```
✓ built in 101ms
BUILD_EXIT=0
```

## 기준 3. gate 회귀 — 통과
명령: `node --test harness/hooks/gate.test.mjs`
```
ℹ tests 71   ℹ pass 71   ℹ fail 0
GATE_EXIT=0
```

## 기준 4. 서버 상태 표시, 토큰 비노출 — 통과
화면 텍스트(CDP로 읽음): `127.0.0.1:53039에서 듣는 중`, `대상 경로: C:\Users\lclk1\AppData\Local\Temp\orbit-qa\settings.json`(사본).
설치 후 사본에서 읽은 토큰(64자)을 변수에 두고 화면 검사:
```
{"inHtml":false,"hex64":false,"url":false,"text":false}
```
HTML·URL·보이는 텍스트 어디에도 토큰 없음, 64자 hex 문자열 자체도 없음.

## 기준 5. 설치·제거(사본) — 통과
원본 사본 SHA-256 `A7AF9242...0F8A98`. 모두 버튼 마우스 클릭.
- 설치: 화면 `성공 · 백업: ...\orbit-qa\settings.json.orbit-backup-1794636010617`, "훅 상태: 설치됨". 백업 SHA-256 = 원본과 같음(`a7af9242...f8a98`).
- 사본 검사: `model:"x"` 유지, 기존 `PreToolUse` Bash command 훅 그대로, **이벤트 11개**(PreToolUse, UserPromptSubmit, PostToolUse, SubagentStop, Stop, Notification, SubagentStart, PostToolUseFailure, PermissionRequest, SessionEnd, StopFailure) 각각 Orbit http 핸들러 1개(`url=http://127.0.0.1:53039/events`, `timeout:2`, 키는 headers/timeout/type/url뿐). `SessionStart` 없음(`false`).
- 제거: 화면 `성공 · 백업: ...`, "설치 안 됨". 사본 JSON = 원본과 같은 JSON(`same JSON as original: true`), Orbit 항목만 빠짐. 한 번 더 제거: `제거할 항목 없음`, 백업 수 2 그대로. 다시 설치: 성공, "설치됨"(백업 3).

## 기준 6. 실제 Claude Code 세션 이벤트 도착 — 통과
명령(임시 프로젝트 폴더): `claude --settings %TEMP%\orbit-qa\settings.json --model sonnet --debug-file %TEMP%\orbit-qa\debug1.log -p "Read the file README.md and tell me its first line"` → 정상 응답, `EXIT=0`.
화면 타임라인(같은 session_id 앞 8자 `60c08176`, 최신이 위):
```
오후 3:01:09 · SessionEnd · 60c08176
오후 3:01:09 · Stop · 60c08176
오후 3:01:06 · PostToolUse · 60c08176 · Read
오후 3:01:06 · PreToolUse · 60c08176 · Read
오후 3:01:05 · UserPromptSubmit · 60c08176
```
UserPromptSubmit → PreToolUse → PostToolUse → Stop이 같은 session_id로 순서대로 도착(결정 10의 기대 충족). 디버그 로그에서 `not supported|Skipping HTTP hook|Transfer-Encoding|fail|error` 검색 → 일치 0건(11개 중 지원 안 된다는 줄이 더 없음). 새 파서에 대한 응답:
```
Hooks: HTTP hook response status 204, body length 0   (5회, 이벤트 5개와 일치)
```
Claude Code가 `Content-Length`로 보낸다는 실측: Transfer-Encoding 요청은 411인데(기준 7) 실제 훅 요청 5건은 모두 204 → chunked가 아니다.

## 기준 7. 거부 — 통과
포트 53039, `curl.exe`, 토큰은 변수. 출력은 HTTP 상태 코드.
```
토큰 없음              -> 401
틀린 토큰              -> 401
올바른 토큰+Origin     -> 403
Origin만(토큰 없음)    -> 403
Host: evil.example     -> 403
GET /events            -> 405
POST /other            -> 404
깨진 JSON(올바른 토큰) -> 400
Transfer-Encoding: chunked(올바른 토큰) -> 411
5 MiB 본문(올바른 토큰) -> 413
```
거부 요청 뒤 화면 타임라인에 이벤트 0건(`도구 호출이 시간순으로 표시됩니다`만 있음). 올바른 토큰 요청은 204.

새 파서 부하 확인(앱에 대고, node `net`, half-open으로 소켓을 쥠):
```
토큰 없이 Content-Length 2000 / 2^50 / u64 최대 / 4000000, 본문 안 보냄 -> 모두 3ms에 401, 연결 닫힘(FIN)
토큰 있고 Content-Length 4000000 / 2000, 본문 안 보냄 -> 2015ms에 400(마감 2초)
쥔 채로 정상 이벤트: 2ms에 204 (during) / 3.1초 뒤 1ms에 204 (after)
```
쥐고 있는 동안·후 모두 정상 이벤트가 화면에 도착(`StallProbe-during`, `StallProbe-after`). 앱 프로세스 계속 살아 있음(`orbit.exe` 유지). 64 KiB 헤더 요청은 셸 인자 길이 제한(`Argument list too long`)으로 curl 시도 실패 — 이 항목은 앱에 대해 미검증(`cargo test`의 `oversized_header_rejected`가 431을 확인).

## 기준 8. HTML 글자 그대로 — 통과
페이로드 `{"hook_event_name":"<b>x</b>","session_id":"<i>s</i>zzzzz","tool_name":"<b>x</b>"}` → 204. 화면 `오후 3:00:24 · <b>x</b> · <i>s</i> · <b>x</b>`, innerHTML에 `&lt;b&gt;x&lt;/b&gt;` 있음, `b,i` 요소 수 0.

## 기준 9. Orbit 꺼짐 — 통과 (관찰 1건)
명령: `claude --settings <사본> --model sonnet -p "say hi"` 3회씩, 훅 설치 상태 동일.
```
앱 켜짐: exit=0 5832ms / 6198ms / 5976ms
앱 꺼짐: exit=0 6238ms / 5885ms / 6672ms   (orbit.exe 종료, 53039 리슨 없음 확인)
```
꺼짐 상태에서 응답 정상, exit 0, 눈에 띄는 지연 없음(편차 범위). 관찰: 꺼짐일 때 stderr에 한 줄이 나온다(실패 경로, 작업 차단 아님, 이전과 같음). "오류 없이"를 stderr 한 줄까지 엄격히 읽으면 걸릴 수 있어 Lead가 판단한다.
```
SessionEnd hook [http://127.0.0.1:53039/events] failed: connect ECONNREFUSED 127.0.0.1:53039
```

## 기준 10. 사용자 확인 대기
실제 `~/.claude/settings.json` 설치와 터미널 세션 확인은 사용자 몫. 이 QA는 하지 않았다. 사용자에게 알릴 것: SessionStart는 Claude Code 2.1.317이 http 훅을 지원하지 않아 뺐고(결정 10) 이벤트는 11개다.

## 미검증
- 64 KiB 헤더 → 431을 앱에 대해 직접 확인하지 못함(자동 테스트로만 확인).
- 대화형 Claude Code 세션의 권한 대화상자와 PermissionRequest 훅(이번엔 비대화형 `-p` 이벤트만 확인).
- 실제 사람 손의 클릭·시각 확인(CDP 입력으로 대체).
- 기준 10(사용자 몫).

## 정리
앱·dev 서버 종료(`orbit.exe` 없음, 1420/9222/53039 리슨 없음, 53039는 TIME_WAIT 소켓만 잔존), `%TEMP%\orbit-qa`와 dev 로그 삭제. 환경변수는 도구 호출 셸에서만 설정했다.

기준 1~9 모두 통과, 실패 없음. 기준 10은 사용자 몫.

VERDICT: PASS
