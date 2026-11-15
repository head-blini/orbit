# 사용자 결정 (BRIEF "열린 결정"에 대한 답, 2026-11-14, AskUserQuestion)

1. 훅 유형: **http 훅** (`type:"http"`, `http://127.0.0.1:<port>/events`). `onFailure`는 넣지 않는다.
2. 설치 위치: **전역 `~/.claude/settings.json`만**. 프로젝트 선택 UI 없음. 화면에 "토큰이 평문으로 저장됨" 안내 한 줄.
3. 이벤트: **12개** — SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SubagentStop, Stop, Notification, SubagentStart, PostToolUseFailure, PermissionRequest, SessionEnd, StopFailure. (PermissionRequest가 권한 판단에 영향을 주면 QA 실측 뒤 뺀다.)
4. 타임아웃: **2초**, 모든 항목에 명시.
5. 중복 설치: 2번으로 해소.
6. 포트: **첫 실행 때 빈 포트를 골라 저장**, 이후 재사용. 막혀 있으면 오류 표시.
7. 토큰·포트 저장: **Tauri `app_data_dir` 아래 파일**(키체인 아님 — SPEC 112행과 다른 선택, 사용자 확정).
8. 정책으로 훅이 꺼진 경우: **안내 문구만**.
10. **(추가, 2026-11-14, QA 실측 뒤 AskUserQuestion)** Claude Code 2.1.317은 SessionStart에 http 훅을 지원하지 않는다(VERIFY.md 기준 6, 로그 "HTTP hooks are not supported for SessionStart"). 사용자 결정: **SessionStart를 뺀다 → 이벤트 11개.** 3번의 목록에서 SessionStart를 제외하고, BRIEF 성공 기준 6의 기대 이벤트도 SessionStart 없이 UserPromptSubmit · PreToolUse · PostToolUse · Stop(같은 session_id, 순서대로)로 읽는다. 세션 시작 시각·모델은 마일스톤 ③(세션 로그 감시)에서 채운다. command 훅은 쓰지 않는다.
11. **(추가, 2026-11-14, Security 감사 뒤 AskUserQuestion)** SECURITY.md 차단 S1(Orbit이 꺼진 동안 다른 계정·프로세스가 `127.0.0.1:<port>`를 차지해 훅 페이로드·토큰을 받고 http 훅 응답 JSON으로 Claude Code 동작에 영향을 시도할 수 있음). 사용자 결정: **잔여 위험으로 수용.** 이번 마일스톤은 http 훅 그대로 간다. 근거(사용자에게 보인 질문 문구): 같은 계정의 악성 프로세스는 이미 settings.json을 직접 고칠 수 있어 새로 생기는 위험은 다른 계정·파일 접근이 막힌 프로세스이고, 혼자 쓰는 개발 PC에서는 범위가 좁다. 여러 사람이 쓰는 PC에서는 위험이 남는다. 후속: http 훅 응답을 무시하는 옵션 조사, 응답 JSON이 실제로 권한 판단을 바꾸는지 실측(`.orbit/decisions.md` 후속 목록). S2는 수용하지 않는다 — 고친다.
9. 새 Rust 의존성: **tiny_http·getrandom 정도 허용**. 정확한 목록은 PLAN에 적고 PLAN 승인 때 다시 확인.
