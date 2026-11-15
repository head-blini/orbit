# VERIFY — 20261114-chat-sidecar (V1, qa)

COMMIT: f816135354bd2a79abf35361abe4aa6ca9ac5f21

(아래 V1 본문은 @ed57684 기준(당시 PASS). 6007f52·f816135 이후 재확인은 맨 아래 "재확인 (RV3)" 절. 그 절의 R4·R5는 화면에서 못 봐 사용자 결정(DECISIONS 13)으로 사용자 확인 항목에 넘겼다.)

검증 환경: Windows 10, 브랜치 `orbit/20261114-chat-sidecar`, 시작·끝 모두 `git status --porcelain --untracked-files=no` 출력 없음, HEAD 불변. 앱은 `src-tauri\target\debug\orbit.exe`(debug 빌드, vite 1420)를 직접 띄웠고 화면 조작·스크린샷은 WebView2 원격 디버깅(CDP, 127.0.0.1:9222, 끝나고 닫힘)으로 했다. 창 크기 960×640은 CDP 뷰포트 에뮬레이션이다(실제 창 크기 조절 아님). 스크린샷은 `RUN_DIR/shots/`.
설정: 호출 없는 단계는 `ORBIT_CLAUDE_SETTINGS`·`ORBIT_CLAUDE_PROJECTS`를 임시 폴더로, `[호출]` 단계는 `ORBIT_CLAUDE_SETTINGS`만 임시 파일로(실제 settings.json에 `설치`가 쓰지 못하게) 두고 projects는 실제 폴더를 봤다. 임시 프로젝트 = `%TEMP%\orbit-qa6\proj`(README.md, CLAUDE.md만).
`[호출]` 단계의 시드 세션: 계획의 "실제 projects에 시드 파일을 둔다"는 쓰기가 자동 분류기에 막혀 하지 않았다. 대신 호출 1 전에 앱의 훅 서버(자기 앱, 127.0.0.1)에 `UserPromptSubmit` 페이로드를 직접 보내(토큰·Origin 거부 확인 포함: 토큰 없음 401, Origin 있음 403, 정상 204) cwd=임시 proj인 세션을 메모리에 만들어 골랐다. 그 뒤로는 앞 호출이 남긴 로그 세션이 목록에 떠서 그것을 골랐다.

## 요약 (@ed57684)

| 기준 | 결과 |
|---|---|
| 1 자동 테스트 | 통과 |
| 2 사이드카 node --test | 통과 |
| 3 의존성·Cargo·capability·CSP diff | 통과 |
| 4 세션 미선택 | 통과 |
| 5 스트리밍·완료 줄·입력 재개 | 통과 |
| 6 CLAUDE.md `끝.` | 통과 |
| 7 세션 +1·Lead 1개·id 일치·토큰 없음 | 통과(로그 감시 경로). "훅이 실제로 이 앱에 닿는 경우"는 사용자 몫 |
| 8 Bash 카드·거부·허용 | 통과 |
| 9 이 세션 동안 | 통과 |
| 10 AskUserQuestion | 통과(미해명 이상 현상 1건, 아래) |
| 11 중단 | 통과 |
| 12 카드 대기 중 창 닫기 | 통과 |
| 13 node 없음 | 통과 |
| 14 인증·토큰 | 통과(grep·로그·화면). 실제 로그아웃 확인은 사용자 몫 |
| 15 HTML 글자 그대로 | 통과 |
| 16 LISTEN 없음 | 통과 |
| 17 Orbit 꺼짐 회귀 | 통과 |
| 18 시각 대조 | 이 문서 범위 밖(V2 designer). 스크린샷만 제공 |
| 19 SPEC diff 범위 | 통과 |
| D10 상단 바 | 통과 |
| W1 / W2 실측 | W1: close·강제 종료 모두 claude.exe까지 끝남. W2: interrupt 뒤 result 옴 |

@ed57684 시점: 실패 0. 미검증 = 사용자 몫으로 넘긴 것(아래 "사용자 몫")과 V2(기준 18)뿐. 호출 횟수는 한도 13을 1회 넘겼다(아래). 미해명 이상 현상 1건(기준 10, 호출 8): 재현되지 않았다.

## [호출] 사용 횟수

합계 **14회** (계획 11 / 최대 13을 **1회 넘김**). Orbit 채팅 13회(표 1~12, 12b) + 터미널 `claude -p "hi"` 1회. 넘긴 1회는 12b(카드 대기 중 사이드카 강제 종료 확인)로, 남은 호출 수를 잘못 세고 보냈다(비용 줄 없이 끝남). 늘어난 이유: Claude가 처음에 `echo hi > a.txt && cat a.txt`를 제안해 D8대로 `거부`하고, 정확히 한 줄만 쓰라고 다시 보냄(2회: 표 3·4번이 정확한 한 줄 요청), 1부터 300까지 세기가 중단 전에 끝나 더 긴 요청으로 다시(1회), 질문 카드 1회째가 내 조작 없이 `사과`로 답해져 있어 다시(1회).
`done` 줄에 보인 추정 비용 합 약 $1.28 (중단·창 닫기·사이드카 강제 종료로 끝난 호출은 비용 줄 없음).
RV3 재확인에서는 모델 호출 0회(합계 변동 없음).

| # | 보낸 프롬프트(요약) | 누른 버튼 | 결과 |
|---|---|---|---|
| 1 | README.md 첫 줄을 그대로 보여 줘 | — | 완료 $0.1372, 끝 줄 `끝.` |
| 2 | `echo hi > a.txt`를 Bash로 실행해 줘 | 카드가 `echo hi > a.txt && cat a.txt`를 제안 → `거부` | a.txt 없음, 답이 거부 언급. $0.1298 |
| 3 | (같은 대화) Bash 명령은 정확히 `echo hi > a.txt` 한 줄만 | 카드 명령이 정확히 `echo hi > a.txt` → `허용` | a.txt 생김(내용 `hi`). $0.1570. 이후 a.txt 삭제 |
| 4 | (새 대화) 정확히 `echo hi > a.txt` 한 줄만 | `이 세션 동안 (이 명령만)` | a.txt 생김. $0.1283. 삭제 |
| 5 | (같은 대화) 같은 요청 | 없음(카드 안 뜸) | a.txt 생김, 대기 카드 없음. $0.1548. 삭제 |
| 6 | (같은 대화) `echo bye > b.txt` | 카드가 다시 뜸 → `거부` | b.txt 없음. $0.1804 |
| 7 | (새 대화) `echo hi > a.txt` | 카드가 다시 뜸 → 창 닫기(기준 12) | a.txt 없음 |
| 8 | AskUserQuestion으로 사과/배 | 아래 "이상 현상" 참고 | 카드 확인 전에 `→ 사과`로 답해져 있었음. $0.1270 |
| 9 | 1부터 300까지 한 줄씩 천천히 세어 줘 | 중단 전에 끝남 | 스트리밍 증거용. $0.1107 |
| 10 | 1부터 3000까지 전부 써 줘 | 6초 뒤 `중단` | 중단됨(기준 11) |
| 11 | (같은 대화) 다음 글자를 그대로 출력해: `<img src=x onerror=alert(1)>` | — | 글자 그대로(기준 15, 11 후속). $0.0309 |
| 12 | (새 대화) AskUserQuestion으로 사과/배 | `배` | `배를 고르셨습니다.` $0.1208 |
| 12b | (새 대화) `echo hi > a.txt` | 카드 대기 중 사이드카 PID 강제 종료 | 카드 접힘, 오류 줄(RV 수정 확인, W1 보강). 비용 줄 없음. 한도 초과분 |
| 13 | 터미널 `claude -p "hi"` (Orbit 꺼짐, `proj`에서) | — | 기준 17 |

(호출 번호는 시간 순으로 1~12, 12b, 13 = 14회.)

## 기준별 (@ed57684)

### 1. 자동 테스트 — 통과
```
cd src-tauri; cargo test   -> test result: ok. 107 passed; 0 failed (lib), 나머지 0 tests ok     exit 0
npm.cmd run build          -> ✓ built in 145ms                                                    exit 0
node --test harness/hooks/gate.test.mjs -> tests 71 / pass 71 / fail 0                            exit 0
node --test sidecar/core.test.mjs       -> tests 12 / pass 12 / fail 0                            exit 0
```
(HEAD f816135에서 다시 돌린 결과는 아래 R1.)

### 2. 사이드카 테스트 — 통과
위 `core.test.mjs` 12개 통과((a)~(i): text_delta 이어 붙이기, 권한 allow/deny 형태·`updatedPermissions` 없음, 세션 규칙 일치·불일치, AskUserQuestion answers, 모르는 타입·깨진 JSON, target, redact).

### 3. diff — 통과
```
git diff main -- package.json
  dependencies에 "@anthropic-ai/claude-agent-sdk": "0.3.325" 한 줄 추가. peer는 package.json에 없음. (나머지 +/- 줄은 npm이 의존성을 알파벳 순으로 다시 정렬한 것)
git diff --exit-code main -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities src-tauri/tauri.conf.json
  -> exit 0 (변경 없음)
```

### 4. 세션 미선택 — 통과
`npm.cmd run tauri dev`(처음 한 번)로 띄운 앱. 화면 글: `세션을 고르면 그 폴더에서 대화를 시작합니다`, textarea `disabled=true`, 보내기 `disabled=true`. `shots/00-nosession-1400x900.png`, `00-nosession-960x640.png`.

### D10. 상단 바 — 통과
버튼 글자 `게임보이 화면`. 훅 미설치(`훅 설치 안 됨`)일 때 `설치` 버튼 → 누르자 임시 settings에 병합되고 백업(`…orbit-backup-<ms>`) 생김 → 상태가 `훅 설치됨`으로 바뀌고 `설치`·`제거` 버튼 없음(상단 바 글자: `훅 설치됨 / 게임보이 화면`).

### 5. 스트리밍·완료 줄 — 통과
호출 1: `내 말`(`README.md 첫 줄을 그대로 보여 줘`)이 보낸 직후 보임, 답 뒤 `완료 · 추정 비용 $0.1372`, 입력 다시 열림(`textarea disabled=false`, 포커스 TEXTAREA). 여러 번에 나눠 늘어나는 증거는 호출 9(MutationObserver): 채팅 길이가 서로 다른 값으로 95번 바뀜, 10.6초에 걸쳐(첫 변화 +1ms 78자 → +51ms 93자 → +3585ms 96자 …). `shots/05-streaming-*.png`(스트리밍 중), `05-done-*.png`(완료 줄).
참고: 짧은 답(호출 1~7)은 2~3번의 큰 덩어리로만 늘어난다, 긴 답에서만 잘게 늘어난다.

### 6. CLAUDE.md — 통과
임시 proj의 CLAUDE.md = `모든 답의 마지막 줄은 `끝.`이다`. 확인한 답(호출 1~6, 8~12) 마지막 줄이 모두 `끝.`(호출 11은 HTML 글자 출력 뒤 `끝.`). 중단된 호출 10은 제외.

### 7. 세션 목록·그래프 — 통과(로그 감시 경로), 훅 경로는 사용자 몫
- 세션 목록: 호출 1 전 `button.sess` 89개 → 후 90개(+1). `get_sessions`에서 같은 id를 가진 항목은 정확히 1개(`source: "log"`, cwd = 임시 proj).
- 그래프: 그 세션 선택 시 `Lead` 노드 1개(`Lead count=1`).
- id 일치: 사이드카 stderr `orbit-sidecar: session d20fda07-9963-46d4-bcef-70f66b7fd18c` = `~/.claude/projects/C--Users-lclk1-AppData-Local-Temp-orbit-qa6-proj/d20fda07-9963-46d4-bcef-70f66b7fd18c.jsonl`. 사이드카 진단 줄 9개(`app.err`·`app2.err`) 전부 로그 파일명과 일치. 진단 줄에는 id 외 아무것도 없음.
- 훅 설치 경우: 실제 `~/.claude/settings.json`의 Orbit 훅은 포트 55579를 가리키는데 이 앱(`hook-server.json`)은 53039에서 듣는다. 그래서 이번 호출에서는 훅이 앱에 닿지 않았다(터미널 `claude -p`도 `SessionEnd hook [http://127.0.0.1:55579/events] failed: connect ECONNREFUSED` 한 줄). 따라서 이번 실측은 사실상 "훅 없음/로그 감시만" 경우다. "훅이 이 앱에 닿는 상태에서 중복이 없는지"는 사용자 몫(W3: 프로젝트 설정 파일에 훅을 넣는 방법은 관문이 그 경로를 가리키는 셸 명령을 막아 시도하지 못함).

### 8. Bash 카드 — 통과
카드: `Bash 실행을 허용할까요?`, 명령 글자 그대로(`echo hi > a.txt`), 버튼 `▶ 허용` / `거부` / `이 세션 동안 (이 명령만)`, 아래에 `고를 때까지 기다리고 있다…`와 `중단`. `shots/08-permit-*.png`.
- 첫 카드는 `echo hi > a.txt && cat a.txt`(성공 기준 명령 아님) → D8대로 `거부` → `→ 거부함`, a.txt 없음(`Get-ChildItem`에 a.txt 없음), 다음 답: "`echo hi > a.txt`를 실행하지 못했습니다. Bash 실행 권한 요청이 거부되어 …".
- 정확히 `echo hi > a.txt` 카드에서 `허용` → `a.txt` 생김(`Length 3`, 내용 `hi`).

### 9. 이 세션 동안 — 통과
- 새 대화 + 카드 `echo hi > a.txt` → `이 세션 동안 (이 명령만)` → 실행됨.
- 같은 대화 같은 요청 → 대기 카드 0(`고를 때까지` 문구가 한 번도 안 보임, 100ms 폴링), a.txt 생김.
- `echo bye > b.txt` → 카드 다시 뜸 → `거부` → b.txt 없음.
- `새 대화` 뒤 같은 명령 → 카드 다시 뜸(호출 7).
- 임시 proj의 `.claude\settings.local.json`: 임시 proj에 `.claude` 폴더 자체가 없음(Glob: README.md, CLAUDE.md만). 실제 `~/.claude/settings.json`: 전후 모두 172줄이고 Orbit 훅 URL 11줄·ponytail 3줄 등 구성 동일. **해시 비교는 못 했다**: 관문이 `~/.claude/settings.json`을 가리키는 셸 명령(Get-FileHash·sha256sum·node -e)을 막았다. Read·Grep 도구로 전후 내용(줄 수·구성)만 대조.

### 10. AskUserQuestion — 통과 (미해명 이상 현상 1건)
호출 12: 카드에 `과일`(태그), `사과와 배 중 하나를 골라주세요.`, `▶ 사과 / 사과를 고릅니다.`, `배 / 배를 고릅니다.`, 아래 입력 줄 문구 `다른 답은 여기에 쓰고 Enter`. `배` 클릭(JS click, isTrusted=false 기록) → `→ 배` → 답 `배를 고르셨습니다.` `shots/10-ask-*.png`.
이상 현상(미해명): 호출 8에서는 질문 카드를 확인하기 전에(보낸 뒤 14초 폴링 안에) `→ 사과`로 이미 답해져 있었다. 그 호출에는 클릭 로깅이 없었고, 호출 12에서 같은 요청을 클릭 로깅(click·keydown·pointerdown, isTrusted)을 켠 채 다시 했을 때는 재현되지 않았다(카드가 `배`를 누를 때까지 대기). 사이드카·Chat.tsx에는 자동 답 코드가 없다(core.mjs `answer`는 `answer` 메시지가 올 때만, AskCard는 클릭 때만). 가장 그럴듯한 원인은 그 순간 실제 마우스 클릭이지만 확인하지 못했다. 사용자가 실제 사용에서 질문 카드가 혼자 답해지는지 한 번 봐 주기 바란다.

### 11. 중단 — 통과
호출 10: 6초 시점 길이 545, `중단` 클릭 → 28ms·78ms 뒤 길이 540→545로 마지막 변화(`중단됨`이 붙음), 그 뒤 5초 동안 변화 0(`len1=545`, `len2=545`). 채팅 끝 `중단됨`, 입력 열림(`textarea disabled=false`, 포커스 TEXTAREA). 이어서 보낸 짧은 요청(호출 11)이 `완료 · 추정 비용 $0.0309`로 정상 처리(중단 플래그가 다음 턴에 남지 않음). `shots/11-stopped-*.png`.
참고(호출 9): `1부터 300까지 … 천천히`는 모델이 한 번에 출력해 10초 안에 끝나, 첫 시도에서는 `중단` 버튼이 이미 없어졌다. 중단 시험은 호출 10으로 했다.

### 12. 카드 대기 중 창 닫기 — 통과
호출 7: 카드가 떠 있을 때 사이드카 `node.exe` PID 25636(부모 orbit 30436), 자식 `claude.exe` PID 21016. `Process.CloseMainWindow()` 뒤:
```
elapsed(s)=0.5 alive after loop:        (orbit 30436, node 25636, claude 21016 모두 없음)
after +10s alive:                         (없음)
new claude.exe not in baseline: 23220<-4956   (부모 4956 = Claude 데스크톱 앱, Orbit 것 아님)
a.txt: 없음 (임시 proj에 CLAUDE.md, README.md만)
```
**W1 실측**: `RunEvent::Exit` → `stop()`의 close 경로(3초 유예 안)로 0.5초 안에 `claude.exe`까지 끝났다. 사이드카만 `Stop-Process -Force`로 강제 종료했을 때도(호출 12b) 3초 뒤 자식 `claude.exe` 2개(18908, 15048)가 모두 없었다(stdin이 닫혀 스스로 끝난 것으로 보임). `taskkill /T` 경로는 타지 않았다.

### 13. node 없음 — 통과 (호출 없음)
`PATH`에서 `nodejs` 폴더와 `node.exe`가 있는 폴더를 뺀 뒤(`Get-Command node` → 없음) `orbit.exe` 직접 실행(vite 1420 별도). 시드 세션 선택 후 보냄:
```
새 대화 · 폴더: proj
나  README.md 첫 줄을 그대로 보여 줘
✕ 오류: Node.js 18.14 이상이 필요합니다 — node를 찾지 못했습니다
```
세션 목록 계속 표시, 그래프 `Lead 실행 중`, 로드맵 `ROADMAP.md가 없습니다`(임시 폴더에 없음, 정상 안내). 실패 뒤 다시 보내면 `새 대화 · 폴더: proj` 첫 줄이 다시 붙음(보내기 실패 뒤 첫 줄, RV 수정 확인). `shots/13-error-nonode-*.png`.

### 14. 인증·토큰 — 통과(사용자 몫 있음)
```
Select-String src-tauri\src\*.rs, sidecar\*.mjs, src\*.ts, src\*.tsx -Pattern '\.credentials','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','dangerouslySetInnerHTML' -> 0건
Select-String dev.log, vite.log, app*.err/out, %APPDATA%\dev.orbit.app\* -Pattern 'sk-ant','Bearer ','oauth' -Quiet -> 전부 False
```
이 PC에서는 로그인이 보여 호출이 됐다(에이전트 셸에서 로그인 파일이 보임). 화면 글에도 토큰 문자열 없음. 실제 로그아웃 상태에서 오류 한 줄이 어떻게 나오는지는 사용자 몫.

### 15. HTML 글자 그대로 — 통과
호출 11 답: `<img src=x onerror=alert(1)>` 글자 그대로(코드 블록 안). `window.alert`를 가로채 센 호출 수 0, `.chat img` 요소 0. `src/`의 `dangerouslySetInnerHTML` 0건(위 grep).

### 16. LISTEN — 통과
호출 7(카드 대기)·호출 9(스트리밍) 중:
```
Get-NetTCPConnection -State Listen | ? OwningProcess -in <node, claude PID>  -> 0건
Orbit: 127.0.0.1:53039 LISTENING (orbit.exe) 한 개뿐
claude.exe: 서버로 LISTEN 없음. 바깥 HTTPS(443) ESTABLISHED만
```
(참고: claude.exe에 `0.0.0.0:<포트> Bound`가 몇 개 보이는데 Established 연결의 로컬 바인딩이고 LISTEN이 아니다.)

### 17. Orbit 꺼짐 회귀 — 통과
Orbit을 닫고 `proj`에서 `claude -p "hi"`:
```
exit=0 elapsed_s=8
안녕하세요! 무엇을 도와드릴까요?
끝.
(stderr) SessionEnd hook [http://127.0.0.1:55579/events] failed: connect ECONNREFUSED 127.0.0.1:55579
```
막히거나 멈추지 않고 정상 응답. 훅 실패는 비차단 한 줄. ④·⑤ 때 수치와의 직접 비교는 하지 못했다(기록 없음).

### 18. 시각 대조 — V2 몫
스크린샷(5 완료·스트리밍, 8 권한 카드, 10 질문 카드, 11 중단됨, 오류 2종, 세션 미선택)을 1400×900·960×640으로 `shots/`에 저장. 눈에 띈 것(시각 판정은 V2): 960×640 에뮬레이션에서 페이지 가로·세로 스크롤바가 보이고 세션 목록이 길 때 1400×900에서도 우측 페이지 스크롤바가 보인다(6007f52에서 `.panel position: relative`로 고침, 아래 R3에서 사라짐 확인). 960×640 질문 카드 안에서 `▶`가 첫 선택지 앞에만 있다.

### 19. SPEC diff — 통과
```
git diff -U0 main -- SPEC.md | Select-String '^@@' -> @@ -59 +59,3 / @@ -62 +64 / @@ -68,0 +71,4 / @@ -71 +77   (원래 56~72행 안)
git diff main -- ROADMAP.md -> 9행 한 줄: ⑥ [ ] -> [x]
```

## 수정분(RV1·RV2) 실제 앱 확인 (@ed57684)
- 보낸 뒤·턴 끝 포커스: 호출 1·8 이후 `document.activeElement` = TEXTAREA(턴 끝에 입력 줄로 돌아옴). 단, 보내기는 JS click이었고 실제 키보드 Enter는 시험하지 않았다.
- 카드에 답한 뒤 포커스: 답한 카드의 결과 줄(`→ 사과` P 요소)로 이동한 것을 호출 8에서 봄.
- exit 시 카드 접힘: 호출 12b에서 카드가 `→ 거부됨 (사이드카 종료)`로 접히고 `✕ 오류: 사이드카가 끝났습니다`가 붙음, 입력이 다시 열리고 `새 대화` 버튼 활성(`shots/err-exit-*.png`). a.txt 없음. (문구는 6007f52에서 `연결 끊김`으로 바뀜.)
- 보내기 실패 뒤 첫 줄: 기준 13에서 확인.
- 중단 플래그: 기준 11(중단 뒤 다음 요청이 `완료`로 끝남).
- 미확인: `새 대화` 직후 포커스 위치(R2), 카드 id 충돌(사이드카 재시작 뒤 `p1`) — 이 경로는 실제로 만들어 보지 않았다.

## W2 실측
`interrupt` 뒤 `result`가 온다: 호출 10에서 `중단` 클릭 28ms 뒤 `중단됨` 줄이 붙고 입력이 열렸다(`stopped`는 result를 바꿔 낸 것). 별도 보정 불필요.

## 사용자 몫 (체크리스트)
- [ ] 실제 Claude 로그아웃 상태에서 채팅에 SDK 오류 한 줄이 텍스트로 보이는지(기준 14).
- [ ] 훅이 이 앱에 실제로 닿는 상태(설정의 훅 포트 = 앱 포트)에서 한 번 보내 세션 목록 +1, Lead 1개인지(기준 7, W3). f816135 이후 실제 `~/.claude/settings.json`의 훅(포트 55579)이 앱 포트와 다르면 상단 바가 `훅 설치 안 됨`+`설치`로 보이니 앱의 `설치`를 누르면(백업 후 병합) 맞춰진다. 이 검증은 실제 settings를 바꾸지 않으려고 누르지 않았다.
- [ ] 훅 제거 상태 경우는 위와 별개로 이미 "로그 감시만"으로 확인됨(기준 7).
- [ ] 오르빗 저장소 같은 실제 프로젝트에서 한 번 써 보기(권한 카드, 이 세션 동안 Edit 전부 범위 등).
- [ ] `done` 줄의 추정 비용과 실제 사용량 대조(이번 호출 합 약 $1.28).
- [ ] 질문 카드가 혼자 답해지는 현상(호출 8)이 실제 사용에서 다시 보이는지.
- [ ] 키보드로 Enter를 눌러 보냈을 때·`새 대화` 직후의 포커스 위치.
- [ ] (RV3, DECISIONS 13) 채팅 끝 간격 — 카드·끝 줄과 입력 줄 사이가 8px 어긋나지 않는지(R4). 연결 끊김 문구 — 사이드카가 끝났을 때 `→ 거부됨 (연결 끊김)` / `✕ 오류: Claude와 연결이 끊겼습니다`가 보이는지(R5). 최악의 경우 간격 8px 어긋남·문구 미반영, 동작·보안 영향 없음.

## 정리 (@ed57684)
- 앱(orbit.exe), 사이드카 node.exe, claude.exe는 자기 PID로 끝냄. vite(`npm run dev`) 트리를 PID로 종료, 포트 1420·9222 LISTEN 없음. 남은 `node.exe` 25256은 시작 전부터 있던 다른 프로그램(codex 런타임), claude.exe는 시작 전 18개 + Claude 데스크톱 앱이 새로 띄운 것(부모 4956)뿐이며 건드리지 않음.
- 지운 것: `%TEMP%\orbit-qa6`(임시 proj·사본·로그), `~/.claude/projects/C--Users-lclk1-AppData-Local-Temp-orbit-qa6-proj`(이번 호출이 만든 세션 로그 10개, 사이드카 9 + 터미널 1). `~/.claude`의 그 밖 부산물(예: `~/.claude.json`의 프로젝트 항목, file-history 등)은 확인하지 않았다.
- 실제 `~/.claude/settings.json`은 쓰지 않았고 Read로 읽었다(내용을 이 문서에 옮기지 않음).

## 재확인 (RV3) — HEAD f816135 (6007f52 + f816135)

환경: 작업 트리 깨끗(`git status --porcelain --untracked-files=no` 출력 없음), HEAD 시작·끝 f816135354bd2a79abf35361abe4aa6ca9ac5f21. **모델 호출 0회.** 임시 환경 `RUN_DIR/qa-rv3/`(`ORBIT_CLAUDE_SETTINGS=qa-rv3\settings.json`, `ORBIT_CLAUDE_PROJECTS=qa-rv3\projects`), 실제 `~/.claude`는 열지 않음. 앱 = debug `orbit.exe`(vite 1420), CDP 127.0.0.1:9222로 조작·스크린샷(960×640은 뷰포트 에뮬레이션). 스크립트 `qa-rv3\cdp.mjs`, 스크린샷 `qa-rv3\shot-*.png`. 토큰 값은 이 문서에 옮기지 않음.

`git diff --stat ed57684 HEAD`: hooks.rs, lib.rs, App.css, Chat.tsx 4개 파일뿐.

| 기준 | 결과 |
|---|---|
| R1 자동 테스트 4종 | 통과 |
| R2 다른 포트 훅 → 설치됨 아님 + `설치` 버튼 → 백업·병합·1개씩 → `훅 설치됨`, 버튼 없음 | 통과 |
| R3 세션 45개, 1400×900·960×640 페이지 스크롤 막대 없음, 패널 테두리 | 통과 |
| R4 채팅 끝 간격 | 사용자 확인으로 넘김 (DECISIONS 13, 근거: grep·이전 12b 경로) |
| R5 연결 끊김 문구 | 사용자 확인으로 넘김 (DECISIONS 13, 근거: grep·이전 12b 경로) |
| 나머지 V1 기준 | @ed57684 결과 유지 (아래 diff 근거) |

### R1 자동 테스트 — 통과
```
cd src-tauri; cargo test    -> test result: ok. 109 passed; 0 failed (lib), 나머지 0 tests ok   exit 0
npm.cmd run build           -> ✓ built in 173ms                                                  exit 0
node --test harness/hooks/gate.test.mjs -> tests 71 / pass 71 / fail 0
node --test sidecar/core.test.mjs       -> tests 12 / pass 12 / fail 0
```
(107 → 109: hooks 새 테스트 `is_installed_requires_matching_port_and_token`, `install_after_port_change_leaves_one_new_entry`.)

### R2 훅 포트 불일치 → 설치 — 통과
임시 settings.json = `model:"x"` + 11개 이벤트 모두 `http://127.0.0.1:55579/events`(토큰 `OLDTOKEN`) 한 개씩. 앱은 53039에서 듣는다.
1. 실행 직후 상단 바 글자: `ORBIT / 127.0.0.1:53039에서 듣는 중 · 훅 설치 안 됨 / 설치 / 게임보이 화면`. 버튼 `설치, 게임보이 화면, 보내기`. (`shot-before-install.png`) → "설치됨" 아님, `설치` 보임.
2. `설치` 클릭 → 상태 글 `성공 · 백업: …\qa-rv3\settings.json.orbit-backup-1794675518281`.
3. 파일 확인(ConvertFrom-Json):
```
UserPromptSubmit PreToolUse PostToolUse SubagentStop Stop Notification SubagentStart
PostToolUseFailure PermissionRequest SessionEnd StopFailure: 각각 groups=1 handlers=1 url=http://127.0.0.1:53039/events (11개 전부)
model=x (기존 키 유지)
새 settings.json: 'OLDTOKEN' 없음, '55579' 없음
백업 파일(1500바이트): 'OLDTOKEN' 있음, '55579' 있음 = 설치 전 원본
```
헤더 `X-Orbit-Token`은 앱 토큰으로 바뀜(값 가림: `<redacted>`).
4. 이어서 상단 바 글자: `ORBIT / 127.0.0.1:53039에서 듣는 중 · 훅 설치됨 / 게임보이 화면`, 상단 바 버튼 `[게임보이 화면]`뿐(`설치`·`제거` 없음). (`shot-after-install.png`, `shot-many-*.png`)
토큰만 다른 경우는 화면 실행하지 않고 단위 테스트(`is_installed_requires_matching_port_and_token`: 포트 다름·토큰 다름·이벤트 하나 어긋남 모두 false)로 갈음.
코드: `lib.rs get_status`는 `settings_path`·`cfg` 둘 다 Ok일 때만 `is_installed(p, c.port, &c.token)`, 아니면 오류 문자열.

### R3 세션 많을 때 — 통과
앱 훅 서버(127.0.0.1, 토큰 헤더)에 `UserPromptSubmit` 45건 POST(응답 204, cwd=없는 폴더 `…\orbit-qa-rv3\p1..p45`) → `button.sess` 45개. 실측:
```
1400x900: scrollH 900 = clientH 900, scrollW 1400 = clientW 1400 -> 페이지 스크롤 막대 없음
          .panel 5개 모두 position:relative, border 3px, 모두 뷰포트 안(chat y568~892 < 900)
960x640:  scrollH 640 = clientH 640, scrollW 960 = clientW 960 -> 없음 (chat y412~632 < 640, topbar 우측 951 < 960)
```
스크린샷 `qa-rv3\shot-many-1400x900.png`·`shot-many-960x640.png`: 세션 목록은 패널 안에서만 스크롤, 5개 패널 테두리 모두 보임, 아래 가장자리 잘림 없음. (@ed57684에서 보인 페이지 스크롤 막대 사라짐.)

### R4 채팅 끝 간격 — 사용자 확인으로 넘김 (DECISIONS 13, 근거: grep·이전 12b 경로)
화면에서 재지 못했다: 채팅에 줄을 만들려고(없는 폴더에서 보내기 → 오류 줄, 모델 호출 없음) CDP로 보내기를 눌렀으나 자동 분류기가 거부했고 우회하지 않았다. 사용자가 "실사용 때 보겠음"으로 결정(DECISIONS 13, 위험 수용: 최악 간격 8px 어긋남, 동작·보안 영향 없음). 근거는 정적 확인뿐: Chat.tsx `<div ref={endRef} style={{ marginTop: -8 }} />`는 gap 8px에 묶인 상쇄값(RV3-front SUMMARY도 같은 한계). 실행으로 확인된 것이 아니다.

### R5 연결 끊김 문구 — 사용자 확인으로 넘김 (DECISIONS 13, 근거: grep·이전 12b 경로)
`exit` 이벤트는 사이드카가 뜬 뒤에만 오는데 보내기가 거부돼 화면에서 재현하지 못했다. 근거:
```
src/Chat.tsx 134행 "→ 거부됨 (연결 끊김)" / "→ 답하지 않음 (연결 끊김)"
src/Chat.tsx 135행 finish("err", "Claude와 연결이 끊겼습니다", "✕ 오류: Claude와 연결이 끊겼습니다")
'사이드카' JSX 문자열 없음(주석 2곳만)
```
@ed57684의 12b에서 같은 `exit` 처리 경로가 화면에서 동작함을 확인했고 이번 diff는 문구 3곳만 바꿨다(제어 흐름 불변). 문구가 화면에 나오는 것은 실행으로 확인하지 못했다.

### 나머지 V1 기준 — @ed57684 결과 유지
근거 `git diff --stat ed57684 HEAD` = `src-tauri/src/hooks.rs`, `src-tauri/src/lib.rs`, `src/App.css`, `src/Chat.tsx` 4개. 바뀐 곳: hooks.rs `is_installed` 시그니처·본문(+테스트), lib.rs `get_status` 분기, App.css `.panel`에 `position: relative` 한 줄, Chat.tsx 종료 문구 3곳·`endRef` 스타일. `sidecar/`, `package.json`, Cargo.*, capabilities, tauri.conf.json, SPEC.md, ROADMAP.md, `server.rs`, `chat.rs`는 diff에 없음 → 기준 2·3·4·5·6·7·8~12·13~17·19·W1·W2는 해당 경로를 바꾸지 않아 결과 유지. D10(`설치` 병합·백업)은 R2로 다시 실행해 확인.

### 정리 (RV3)
앱 `orbit.exe` PID 2504 `Stop-Process`, vite PID 29028 `taskkill /T`. 1420·9222 LISTEN 0, 두 PID 종료 확인. 임시 파일은 `RUN_DIR\qa-rv3\`에 남김(settings.json·백업·스크린샷·cdp.mjs; 앱 토큰이 든 settings.json 포함 — 로컬 임시 앱 토큰이라 앱 재시작 시 바뀜).

판정: 실행한 R1~R3과 diff 근거 항목은 모두 통과, 실패 0. R4·R5는 사용자 결정(DECISIONS 13)에 따라 사용자 확인 항목으로 이관(위험 수용)했으며 이 문서는 그것을 실행 통과로 주장하지 않는다. 사용자 몫 목록에 미확인 항목이 남아 있다.

VERDICT: PASS
