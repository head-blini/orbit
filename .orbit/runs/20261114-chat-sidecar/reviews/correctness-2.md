reviewer-correctness 2회차: 20261114-chat-sidecar

1회차 지적 확인
- B1 해결: grep `uninstall_hooks|액정 폴더|제거할 항목|>제거<` src/ 결과 없음. App.css:79 주석 시안 문구, 옛 채팅 규칙 삭제(62행 격자만).
- B2 해결: core.mjs:53 markInterrupt는 turns>0일 때만. chat.mjs:26 push에서 증가, result마다 core.mjs:40에서 0 아래로 안 내려감. (b2) 통과.
- B3 해결: Chat.tsx:126-130 exit면 열린 카드 "(사이드카 종료)"로 접음, askOne·pend 사라져 입력 풀림. chat.mjs:71 catch에서 denyAll → closed 먼저, 그다음 error.
- B4 해결: Chat.tsx:192 `.catch(e => { setOpen(open); fail(e) })`.
- W1, W2, W4, W5, W6, W7 해결. W3 일부만.

새 발견
1. 수정 권고 — src/Chat.tsx:84, 153 (W3 미해결분): Enter로 보내면 textarea가 사라져 포커스가 body로, 턴 끝에 refocus 안 켜짐. confidence: 중간
2. 수정 권고 — src/Chat.tsx:150, 169, 175, 226-227: 사이드카가 죽은 뒤 `새 대화` 없이 다시 보내면 기록은 남고 새 프로세스의 createPermits가 id를 p1부터 다시 씀. 옛 p1 카드 결과를 새 p1 답이 덮어쓰고, focusDone은 옛 카드로 포커스, `q-p1` id 중복. 수정 방향: 화면 쪽 id를 대화마다 다르게, 또는 result===null인 카드만 바꿈(closed 처리처럼). confidence: 중간
3. 참고 — sidecar/chat.mjs:52-53: import 중 `중단`은 아무 일도 안 함, 턴은 "완료"로 끝남(플래그는 안 남음).
4. 참고 — src/Chat.tsx:192: exit가 submit과 catch 사이에 끼면 setOpen(open)이 옛 true로 되살림. 경쟁 구간 좁음.

계획 준수: 수정 커밋은 REVIEW 지정 파일 안에서만. (c0) 테스트는 계획 밖이나 해롭지 않음. 전체 diff 파일 범위 PLAN과 맞음.
실행: node --test sidecar/core.test.mjs 12 통과, cargo test 107 통과(경고 없음).
미확인: npm run build, 실제 앱 포커스, interrupt 뒤 result(V1).

VERDICT: PASS
