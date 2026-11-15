F1 SUMMARY

바꾼 파일: src/types.ts (ChatQuestion·ChatOut 추가), src/Chat.tsx (새), src/Chat.css (새)
커밋: b3ee55c  feat(chat): add chat panel component and protocol types (3파일만 add, COMMIT_MSG는 tasks/F1/COMMIT_MSG.txt)

검증 (모두 통과):
$ npx.cmd tsc --noEmit            -> EXIT 0
$ grep dangerouslySetInnerHTML|innerHTML|marked|markdown src/*.tsx src/*.ts   -> 결과 없음
$ grep '#[0-9a-fA-F]{3,8}\b' src/Chat.css                                    -> 결과 없음
$ grep preview src/Chat.tsx       -> 결과 없음 (preview를 읽는 줄 없음)
invoke 인자: chat_send{session,text} / chat_permit{id,decision} / chat_answer{id,answers} / chat_interrupt / chat_reset (경로·cwd 없음)

계획과 달라진 점·판단:
- 이 컴포넌트는 `<section className="panel chat">`까지 자기가 그린다(App.tsx는 section을 <Chat/>로 통째 교체하면 됨, F2 참고). 시안 구조 그대로: chat-head / chat-log>chat-items / input-row / sr role=status.
- 대화 상태는 useState만. 폴더 이름은 첫 보내기 때 sep 항목에 고정. exit는 대화를 닫고(open=false), 실행 중이었을 때만 오류 줄을 붙인다(유휴 중 exit는 조용히 닫음, 다음 보내기는 새 첫 줄).
- 질문 카드: 1개·단일 선택은 ▶ 커서 하나(.choices.one) + 누르면 즉시 chat_answer. 다중·여러 질문은 [ ]/[✓] 토글 + 보내기(", " 합침, 질문 여러 개 결과 줄은 " / "로 구분 표시). 직접 답은 질문 1개일 때 입력 줄 Enter(한글 IME 조합 중 Enter는 무시).
- Chat.css 추가분 2개(시안에 없음): `.card .done.free`(직접 쓴 글은 일반 글꼴, DESIGN 2.4), `.btn[aria-disabled="true"]`(중단 누른 뒤 점선 모양, DESIGN 4절). 나머지는 시안 207~303행 그대로(.tag 제외).
- 주의: App.css에 옛 `.chat-body`·`.input-row`·`.input-row input` 규칙이 아직 남아 있어 F2가 지우기 전까지 `.input-row`가 겹친다(F2 태스크 범위, 지금 App에 Chat이 연결되지 않아 영향 없음).
- Chat.css 하드코딩 값(1px, 19.5px, 7px, 20px)은 시안 CSS 그대로라 훅이 토큰 경고를 냄. 토큰 승격 여부는 designer 판단.

검증하지 못한 것: 실제 렌더링·스타일(App 미연결이라 브라우저로 안 봄), 사이드카와의 실제 이벤트 흐름(R2·S2 이후 V1). 프론트 단위 테스트 러너는 계획상 없음.
