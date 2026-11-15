# VERIFY — 20261114-session-log-watch

COMMIT: 83cc9fa7e02cea1acd7f863a99c171ab2f13d665

작업 트리 깨끗함(`git status --porcelain --untracked-files=no` 출력 없음, 검증 전후). 환경: Windows 10, 디버그 빌드. 앱은 `ORBIT_CLAUDE_PROJECTS`·`ORBIT_CLAUDE_SETTINGS`를 `%TEMP%\orbit-qa3` 아래로 지정한 같은 셸에서만 띄웠다. 실제 `~/.claude/projects`, `~/.claude/settings.json`은 열지도 읽지도 않았다. 토큰은 변수로만 읽었고 아래에 값은 없다. 테스트 JSONL은 직접 만든 가짜 줄뿐이다.

화면 확인 방법: WebView2 원격 디버깅(`--remote-debugging-port=9222`)으로 CDP `Runtime.evaluate`(화면 텍스트·DOM 읽기)와 `Input.dispatchMouseEvent`(세션 버튼 좌표 클릭)를 썼다. 실제 화면 텍스트이며 Tauri 명령을 직접 부른 것이 아니다. 사람 눈으로 본 것은 아니다(스크린샷 안 봄).

## 기준 1. cargo test — 통과
명령: `cd src-tauri; cargo test`
```
test watch::tests::l_oversize_valid_json_and_numeric_tail ... ok
test watch::tests::k_big_file_one_poll ... ok
test result: ok. 54 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.36s
(bin 0 tests, doc-tests 0 tests: ok)
CARGO_EXIT=0
```
watch/sessions/lib/server 테스트가 모두 포함된다. 세부 테스트 항목별 목록은 이번에 개별 확인하지 않았고 54개 전부 통과만 확인했다.

## 기준 2. npm run build — 통과
```
dist/assets/index--QYZHnfZ.js   224.88 kB │ gzip: 71.07 kB
✓ built in 113ms
BUILD_EXIT=0
```

## 기준 3. gate 회귀 — 통과
명령: `node --test harness/hooks/gate.test.mjs`
```
ℹ tests 71   ℹ pass 71   ℹ fail 0
GATE_EXIT=0
```

## 기준 4. 감시 폴더 표시 — 통과
앱을 띄운 직후 화면 텍스트: `로그 폴더: C:\Users\lclk1\AppData\Local\Temp\orbit-qa3\projects` (임시 폴더). 대상 경로도 `...\orbit-qa3\settings.json`. 실제 `~/.claude/projects` 경로는 화면에 없음.

## 기준 5. 시작 전 기록 복원 — 통과
앱 시작 전에 만든 `slugA\<u1>.jsonl`(3줄: user, tool_use Grep, tool_result). 첫 화면 읽기 시점에 이미 목록에 있음:
```
6f9795af · C:\qa\projA · 2026. 11. 1. 오후 7:00:00 · 2026. 11. 1. 오후 7:00:02 · 로그
```
(시작 시각 = 첫 줄 timestamp 10:00:00Z = KST 19:00:00.)

## 기준 6. 새 파일 = 새 세션 — 통과
앱 실행 중 `slugB\<u2>.jsonl` 생성·첫 줄(timestamp 2026-11-14T03:00:00Z) 기록, 4초 뒤:
```
148876e4 · C:\qa\projB · 2026. 11. 14. 오후 12:00:00 · ... · 로그
```
시작 시각 12:00:00(= 03:00Z, KST 12:00). 훅 SessionStart 없이 나타남.

## 기준 7. 타임라인 호출·결과 — 통과
`tool_use`(toolu_qa1, Read), `tool_result` 덧붙인 뒤 세션을 CDP 마우스 클릭으로 선택:
```
오후 12:00:01 · Read · 호출 · 로그
오후 12:00:02 · Read · 결과 · 로그
```

## 기준 8. 훅+로그 한 번만, 둘 다 — 통과
`curl.exe -X POST http://127.0.0.1:<port>/events -H "X-Orbit-Token: $t"`(토큰은 `hook-server.json`에서 변수로).
- 로그 먼저 → 훅 PreToolUse(toolu_qa1) → HTTP 204. 타임라인(Read 호출 한 줄만, 출처 변경):
```
오후 12:00:01 · Read · 호출 · 둘 다
오후 12:00:02 · Read · 결과 · 로그
```
세션 목록 출처도 "둘 다"로 바뀜.
- 훅 먼저(toolu_qa2, Edit) → 204 → `Edit · 호출 · 훅` 1줄. 이어서 로그에 같은 id `tool_use` 덧붙임 → 4초 뒤 `Edit · 호출 · 둘 다` 1줄(중복 없음).

## 기준 9. 깨진·모르는·초과·반쪽 줄 — 통과
같은 파일에 차례로 (a) `{oops` (b) `{"type":"zzz","foo":[1,2]}` (c) 한 줄 약 18 MiB(파일 크기 18,875,651바이트; 채운 바이트는 의도한 `A`가 아니라 NUL이었으나 줄 길이 상한 시험으로는 동일) (d) `\n` 없는 반쪽 `tool_use` 줄. 각 단계 뒤 타임라인은 변화 없음(항목 생성 없음, 앱 살아 있음). (d) 완성 + 정상 `tool_use`(Glob) 1줄 추가 후:
```
오후 12:00:01 · Read · 호출 · 둘 다
오후 12:00:02 · Read · 결과 · 로그
오후 12:00:09 · Write · 호출 · 로그      (완성된 반쪽 줄)
오후 12:00:10 · Glob · 호출 · 로그       (마지막 정상 줄)
오후 3:48:08 · Edit · 호출 · 둘 다
```
`orbit` 프로세스 계속 존재.

## 기준 10. HTML 글자 그대로 — 통과
`cwd`와 도구 이름이 `<b>x</b>`인 줄. 세션 목록 `5156ace6 · <b>x</b> · ...`, 타임라인 `오후 1:00:00 · <b>x</b> · 호출 · 로그`. DOM: `<b>` 요소 수 0, 목록 innerHTML에 `&lt;b&gt;x&lt;/b&gt;` 있음.

## 기준 11. 다른 프로세스의 덧붙이기·이름 변경·삭제 — 통과
앱 실행 중 PowerShell(`$ErrorActionPreference='Stop'`):
```
Add-Content <watched>.jsonl ...  -> append ok
Rename-Item <u2>.jsonl <u2>.orphaned-1-x.jsonl -> rename ok
Remove-Item <u2>.orphaned-1-x.jsonl -> delete(renamed) ok
Remove-Item <watched u3>.jsonl -> delete watched ok
```
이름 변경 뒤 4초 지나도 세션 목록은 3개 그대로(이름 바꾼 사본은 새 세션 아님). 삭제 뒤 `orbit` 프로세스 생존, 화면 응답함(세션은 메모리에 남음).

## 기준 12. 로그 파일 불변 — 통과
QA가 직접 바꾸지 않은 `<u1>.jsonl`의 SHA-256, 앱 실행 전 = 종료 후:
```
F4B23696AED64B110172CBD3D0C7CD350F9E4D7088C5C061B932E392C39A5542
```
(두 번째 실행에서도 앱은 이 파일을 건드리지 않았음. 두 번째 실행 후 해시는 재측정하지 않았다.)

## 기준 13. 콘솔에 로그 내용 없음 — 통과
`<u1>.jsonl`(user 줄과 tool_use 입력에 `ORBIT-QA-SECRET-MARKER`)을 읽은 첫 실행의 전체 콘솔(22줄, 컴파일 출력 + `Running target\debug\orbit.exe`):
```
marker matches: 0
```
두 번째 실행(52 MiB 로그) 콘솔에서 `ORBIT-QA|toolu_big` 일치 0.

## 리뷰 확인거리
- 큰 로그 시작 시 복원 — 확인: 51.9 MiB, 10만 줄(`tool_use` 10만 개) 로그를 앱 시작 전에 두고 재시작. 창이 뜬 뒤 첫 읽기(약 2초 시점)에 세션 `a2bcd083 · C:\qa\big`가 목록에 있음. 그 세션 타임라인의 `Bash` 항목 수 = 500(MAX_EVENTS 상한). 앱 생존. (컴파일 시간은 제외, 창이 뜬 뒤 기준. 정밀 시간 측정은 아님.)
- 이벤트 없는 세션 — 확인: user 줄만 있는 세션(`93ff695e`)을 클릭하면 타임라인에 `기록 없음` 표시.

## 기준 14. 사용자 확인 대기
실제 `~/.claude/projects` 복원, 실제 Claude Code 세션에서 훅 `tool_use_id`와 로그 `tool_use.id`가 같은 값인지는 사용자 몫. 이 QA는 하지 않았다.

## 미검증·한계
- 사람 눈으로 본 화면이 아니다(CDP로 DOM 텍스트 확인, 스크린샷 미확인). 클릭은 CDP 입력.
- 기준 9(c)의 큰 줄은 NUL 바이트로 채웠다(JSON 문자열로는 유효하지 않지만 상한 초과 건너뛰기 경로 확인에는 같은 경우).
- 앱을 처음 실행한 로그 폴더에는 일부러 `CLAUDE_CONFIG_DIR`을 설정하지 않았다(해당 경로 미시험).
- 기준 14(사용자 몫).

## 정리
`orbit.exe`와 dev 서버 종료(1420/9222/53039 리슨 없음), `%TEMP%\orbit-qa3` 및 콘솔 기록 삭제, 환경변수 3개 제거(`ORBIT_CLAUDE_PROJECTS`, `ORBIT_CLAUDE_SETTINGS`, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`), 임시 CDP 도우미 삭제. 코드는 수정하지 않았다.

기준 1~13 모두 통과, 실패 없음. 기준 14는 사용자 몫.

VERDICT: PASS
