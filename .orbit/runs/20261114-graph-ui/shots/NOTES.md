# shots NOTES (qa 스크린샷 수집, 판정 없음)

앱: 브랜치 orbit/20261114-graph-ui, head c5a10c5, `npm.cmd run tauri dev`(디버그). 환경: ORBIT_CLAUDE_SETTINGS·ORBIT_CLAUDE_PROJECTS·CLAUDE_CONFIG_DIR 모두 %TEMP%\orbit-qa4. `get_status`: settings_path·projects_dir 모두 `...\Temp\orbit-qa4\` 아래, 듣는 주소 127.0.0.1:53039, screens_dir은 Roaming\dev.orbit.app\screens(건드리지 않음). 창 관찰은 WebView2 CDP 127.0.0.1:9333, 뷰포트 1400x900(Emulation.setDeviceMetricsOverride, dpr 1).
시안: Edge 헤드리스(CDP 9334)로 file:///.../design/reference/layout_v4.html을 1400x900. 시안에는 Galmuri11 파일이 없어 `monospace` 대체 글꼴로 그려진다(시안 파일 주석).
토큰은 노드 스크립트 안에서만 읽었고 출력·파일에 남기지 않았다. 스크립트: shots\tools\*.mjs.

## 파일
ref-1400.png, ref-graph.png(시안 그래프 패널), ref-960.png, ref-measure.json, ref-960-measure.json
app-A.png, app-A-graph.png, app-B-none.png, app-B-selected.png, app-B-graph.png(=B-none 패널), app-B-selected-graph.png, app-C.png, app-D.png, app-E-960.png
app-*-measure.json (패널·canvas·svg·노드별 getBoundingClientRect, computed 글꼴·크기·테두리·배경, 간선 d)

## 장면별 데이터
세션 4개(시안의 폴더 이름·상태). 모두 로컬 가짜 cwd(C:\qa\<이름>):
- orbit: UserPromptSubmit + 서브에이전트(아래) + 마지막에 PreToolUse(Read) → 작업 중. id 3f2a9c1e-… (시안 상세의 id와 같은 값)
- my-blog: UserPromptSubmit + Notification(permission_prompt) → 대기 `!`
- api-server: UserPromptSubmit + StopFailure → 에러 `✕`
- notes: 로그 줄 1개(timestamp 2026-11-12T09:10:00Z, 안 들어온 훅) → 멈춤 `?`

A (orbit 선택 + engineer 선택), 노드 5개:
- architect 끝남: PreToolUse(Agent)+SubagentStart+SubagentStop+PostToolUse(totalDurationMs 130000, totalTokens 41000)
- engineer 실행 중: PreToolUse(Agent)+SubagentStart
- qa 실패: 훅 PreToolUse+SubagentStart 뒤 로그 tool_result(is_error:true, 시각 = 지금+48초) → 상자에 "48초 · —"
- reviewer 대기: PreToolUse+SubagentStart+PermissionRequest(agent_id)
- librarian 알 수 없음: 로그의 tool_use(Agent, subagent_type librarian)만, 결과 없음
B: 같은 세션에 designer(끝남 95s·22k)·security(실행 중)·debugger(끝남 61s·9.5k)를 더해 노드 8개. B-none = 세션만 고름, B-selected = engineer 칩을 누름.
C: my-blog 선택(서브에이전트 없음, Lead만).
D: UserPromptSubmit으로 세션 s1~s6 추가(총 10개), orbit 선택.
E: 960x640, B 데이터(노드 8개)에 orbit + engineer 선택. 시안 960 캡처도 ref-960.png.

## 시안과 다르게 들어간 값
- 마지막 활동 시각: 시안 14:32/14:29/13:05/11/12 09:10, 앱은 실제 시각 17:08~17:09, notes는 11/12 18:10(UTC 09:10을 현지 표시).
- 노드 "시작" 14:28 → 17:08. 상세 "훅 설치됨" → "설치 안 됨"(임시 settings가 `{}`), 대상·로그 경로는 임시 사본 경로, 서버 주소는 127.0.0.1:53039(시안 47600). 성공·백업 문구 없음.
- reviewer의 메타: 시안 "권한 요청", 앱 화면은 "— · —"(훅으로 이 문구를 넣는 경로를 찾지 못해 안 넣음).
- qa 시간: 48초 + 훅~로그 사이 몇 초 오차 가능(화면은 "48초").
- 액정: 시안은 빈 액정, 앱은 사용자의 그림(Roaming screens)이 돌아가며 보임.
- 깜빡이는 `!`·진행 막대·간선 흐름은 캡처 순간의 애니메이션 위상이라 이미지마다 다르다(my-blog의 `!`가 안 보이는 장면 있음).
- 시안은 Galmuri11 없음(monospace 대체), 앱은 Galmuri11 렌더.

## 측정(1400x900, A)
시안과 앱이 같은 값: .graph 301,74 741x486 / .canvas 328,115 416x340 / svg 328,115 416x340 / 간선 d 5개 동일(M168 170 H208 V30/100/H248/240/310, 100은 flow) / 노드 li 좌표·168x60 6개 동일(Lead 328,255 / 나머지 x576, y115·185·255·325·395) / 노드 border 2px(실패는 dashed) / 노드 글꼴 13px 본문, .n-name·.n-state 12px, .n-meta 11px / 배경색 동일. .sessions·.detail·.chat·.console·.topbar·.sess 좌표·크기 동일.
다른 값: 노드 이름·상태·세션 이름의 font-family(시안 Galmuri11 → monospace 대체로 그려짐, 앱은 Galmuri11), 선택 노드 텍스트에 "▶ " 포함(시안도 같은 ::before, innerText 차이), reviewer 메타 텍스트.

## 측정(칩 모드, 노드 8개)
B-none: .canvas 328,115 416x262, Lead 328,216 168x60, 칩 8개 li x576 y115+34k 168x24(border 1px, 실패 1px dashed), svg 416x262, 간선 8개 M168 131 H208 V12+34k H248(실행 중 칩 간선에 flow).
B-selected: .canvas 416x298, Lead y234, engineer가 168x60 큰 상자(border 2px)로 y149, 나머지 칩 168x24, 간선 y기준 M168 149.
그래프 패널 안 스크롤: 1400 폭에서 없음(scroll 735x480=client). 960x640: .graph 236,74 428x330, scrollWidth 456 > clientWidth 407, scrollHeight 348 > clientHeight 309(가로·세로 스크롤바 보임). 시안 960: .graph 236,74 428x330, .canvas 416x340.
C: .canvas 416x60, Lead 328,115 168x60(대기 `!`, is-wait), 간선 없음.
D: 세션 s1~s6, my-blog, api-server, notes는 한 줄 칩(세션 목록 285x486 안), 고른 orbit은 큰 줄. 노드 그래프는 B-none과 같음.

## 못 한 것·한계
- 시안의 "권한 요청" 메타, 실제 시각(14:32 등)은 같게 못 만듦.
- 시안과 같은 6노드 장면은 A 한 번만(이후 B에서 노드를 더해 5노드로 되돌릴 수 없음).
- 960x640 시안 대조용 캡처는 A 노드 5개가 아니라 B 8개 데이터로 찍음(시안은 5개).
- 애니메이션 위상 고정 안 함.

## 정리
orbit·vite·cargo 종료(1420·9333·9334 포트 비움), %TEMP%\orbit-qa4와 Edge 임시 프로필 삭제, 환경변수는 백그라운드 셸에만 있었고 종료됨. screens 폴더는 읽지도 쓰지도 않음. git status 깨끗. shots\tools\*.mjs는 수집 스크립트(남겨 둠).
