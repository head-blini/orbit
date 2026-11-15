# run 20261115-terminal 결정 (AskUserQuestion, 2026-11-15)

1. BRIEF 승인. 한글 IME 본 판정은 태스크 1 멈춤 지점에서 사용자가 실제 앱에 직접 쳐 보는 것(약 1분). QA는 CDP 흉내로 회귀만 본다. QA 모델 호출 최대 3회(약 $0.35). npm `claude.cmd`만 있는 PC는 범위 밖: "claude를 찾을 수 없음" 한 줄.
2. 세션 선택 → 버튼 3개: `폴더 열기`(새 폴더) / `새로 시작`(고른 세션 cwd, resume 없음) / `이어 가기`(`--resume <id>`). 실행 중에는 시작 버튼 비활성 + `종료` 버튼. 세션 클릭만으로 자동 실행하지 않음.
3. 운영 빌드 CSP: 태스크 1에서 운영 빌드로 실측, xterm 인라인 스타일이 막히면 `style-src`에만 `'unsafe-inline'` 추가(script-src 그대로), Security가 근거 기록.
4. `@xterm/addon-fit` 추가 승인(세 번째 npm 패키지).
5. (상위 Lead 세션이 전달, 사용자 원문: "2단계 들어가기 전에 맥으로 다옮겨서 진행하자 메인은 윈도우가 아니라 맥이야") 주 플랫폼은 macOS. PLAN은 맥(WKWebView 한글 IME, 맥 PTY, 맥에서 claude 경로 찾기)을 주 대상으로, Windows(ConPTY)는 지원 유지. PLAN_CHECK까지 하고 build 전에 멈춘다. 맥에서 이어 갈지는 상위 Lead가 사용자에게 묻는다.
7. DESIGN.md 승인(AskUserQuestion). 24비트 색: 사용자가 claude `/theme`을 "Light mode (ANSI colors only)"로 한 번 바꾼다. 앱은 색 관련 환경변수를 건드리지 않는다. 성공 기준 "4명암 외 색 없음"은 이 테마 설정 상태에서 본다.
8. (AskUserQuestion, PLAN_CHECK 1회차 쟁점) Rust 상수 `TERM=xterm-256color` 허용(터미널 종류, 색 설정 아님 — DECISIONS 7의 예외는 이 하나). `picked` 상태 삭제 승인(BRIEF 10 이탈 확인). `CLAUDECODE`는 QA가 앱을 띄울 때 `env -u CLAUDECODE`로만 처리, 앱 코드는 건드리지 않음. IME 실패 시 선택지는 실패 시점에 사용자가 고른다.
6. (상위 Lead 전달, 사용자 원문: "맥으로 옮겨서") build부터 맥에서 이어 간다. 이 Windows 세션은 PLAN_CHECK까지 하고 멈춘다.
