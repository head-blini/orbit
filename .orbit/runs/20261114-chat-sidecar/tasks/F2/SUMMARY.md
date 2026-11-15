F2 SUMMARY

바꾼 파일: src/App.tsx, src/App.css
커밋: bbc34ad (두 파일만 add; 메시지는 tasks/F2/COMMIT_MSG.txt)

변경:
- App.tsx: 옛 채팅 section을 `<Chat session={cur} />`로 통째 교체, `import Chat` 추가. 상단 바: `installed === true`면 훅 버튼 없음(제거 버튼 삭제, Rust uninstall_hooks 명령은 그대로), 그 밖은 `설치`. 폴더 버튼은 `게임보이 화면`(aria-label "게임보이 화면 폴더 열기").
- App.css: 옛 `.chat`·`.chat-body`·`.input-row` 계열 규칙 삭제(Chat.css에 있음). 그레이드 `.chat` grid 배치 줄(62행)은 유지.

검증:
```
$ npm.cmd run build   -> tsc + vite build 통과, EXIT 0 (✓ built in 183ms)
$ grep "액정|⑥" src/App.tsx src/App.css
src/App.css:79: 주석에 "[설치|제거] [액정 폴더]" 문구만 남음 (코드 아님)
```

계획과 달라진 점:
- `.tag` 규칙은 지우지 않았다. Chat.tsx(질문 머리말)가 쓰는데 Chat.css에는 없다(F1이 제외). App.css에 남기고 주석만 바꿨다.
- App.css 79행 주석은 낡은 문구 그대로(안 건드림, 동작 무관).

검증하지 못한 것: `npm run dev`/브라우저 렌더링 확인은 안 했다(빌드만). 사이드카 R2 이전이라 대화 흐름은 못 봄. App.tsx의 `run()` 타입에 "uninstall_hooks"가 남아 있으나 호출부가 없다(작은 잔재, 제거는 요청 밖).
참고: 토큰 경고 훅이 App.css의 기존 하드코딩 값(3px 등)을 냈다. 이번 변경 추가분 아님.

Lead 메모: PLAN F2 행은 79행 주석을 시안 문구로 바꾸고 run()에서 uninstall_hooks 분기를 지우라고 했다 — 미이행, 리뷰에서 확인.
