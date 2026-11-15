T3 완료.

바꾼 파일: C:\Users\lclk1\Projects\orbit\src\App.tsx, C:\Users\lclk1\Projects\orbit\src\App.css
커밋: 11d2c04 (두 파일만, 브랜치 orbit/20261114-session-log-watch)

변경 요약
- Status에 projects_dir, projects_error 추가. HookEvent, MAX_EVENTS, str 헬퍼, listen("hook-event") 제거.
- Session/Event 타입은 인터페이스 표대로 추가.
- mount 시 listen("session-update")를 먼저 걸고 invoke("get_sessions")를 부른다. 둘 다 id별 맵에 병합하고, 들고 있는 것보다 ver가 작을 때만 버린다(`<`, PLAN_CHECK A6). unlisten 정리는 기존 cancelled 플래그 패턴 그대로.
- "세션" 칸: 로그 폴더 한 줄, 세션 버튼 목록(aria-pressed, last_ms 내림차순). 목록이 비면 hint 표시.
- "타임라인" 칸: 선택한 세션의 events를 at_ms 오름차순으로 표시.
- 모든 문자열은 JSX 텍스트로만 렌더. CSS는 .sessions 버튼 목록과 선택 표시 18줄.

검증
```
$ npm run build
✓ 19 modules transformed. ... ✓ built in 124ms   (tsc 오류 없음, exit=0)
$ grep -nE 'dangerouslySetInnerHTML|hook-event' src/App.tsx
(결과 없음, grep 종료코드 1)
```
첫 빌드는 괄호 하나가 남아 TS1005로 실패했고, 고친 뒤 통과했다.

계획과 달라진 점
- 없음. 검증 명령은 Select-String 대신 같은 패턴의 grep을 썼다.

검증하지 못한 것
- 앱 실행과 화면 확인은 하지 않았다(지시대로, 백엔드 T4 없음). get_sessions와 session-update가 실제로 동작하는지는 T4 이후 QA에서 확인해야 한다.
