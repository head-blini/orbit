T4 완료.

바꾼 파일: C:\Users\lclk1\Projects\orbit\src\App.tsx, C:\Users\lclk1\Projects\orbit\src\App.css
커밋: c47919b (orbit/20261114-hook-server)

검증:
```
> npm run build   (tsc && vite build)
✓ 19 modules transformed.
dist/assets/index-BUMlsGs4.js  223.82 kB │ gzip: 70.70 kB
✓ built in 161ms        -> exit 0
grep -c dangerouslySetInnerHTML src/App.tsx -> 0
```

구현:
- `Panel`에 선택적 `children`을 추가했다. children이 없으면 기존 hint를 그대로 표시한다.
- 상단바는 `get_status` 결과에 따라 "<addr>에서 듣는 중", "훅 서버 시작 실패: <err>", "확인 중…"을 `role="status"`로 보여준다.
- 상세 칸에는 대상 경로, 설치 여부, `<button type="button">` 설치·제거, 결과 줄(`role="status" aria-live="polite"`), 안내 2줄을 넣었다. 설치·제거 후에는 `get_status`를 다시 부른다.
- 타임라인 칸은 `listen("hook-event")`로 받은 최근 200개를 최신순으로 보여준다. 줄 형식은 시각 · hook_event_name · session_id 앞 8자 · tool_name이고, 필드는 문자열일 때만 쓰고 JSX 텍스트로만 렌더한다.
- `useEffect` 정리에서 unlisten을 부르고, StrictMode 이중 실행에도 안전하게 `cancelled` 플래그를 둔다.
- 토큰은 프론트가 다루지 않는다.

계획과 달라진 점: 없음.

검증하지 못한 것:
- 실제 Tauri 앱에서 invoke와 listen이 capability 없이 동작하는지는 못 봤다(PLAN 미확인 항목 R1, T5/QA 몫). `npm run build`는 타입과 번들만 검사한다.
- 화면을 브라우저나 앱에서 직접 보지 않았다.
- Rust 쪽 명령(`get_status` 등)은 T5가 배선한다. 그 전에는 화면이 "상태를 읽지 못했습니다"로 나온다.
- 커밋 시 LF→CRLF 경고만 났고 오류는 없었다.
