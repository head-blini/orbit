reviewer-accessibility 2회차. 범위: `git diff a982e8f..orbit/20261114-chat-sidecar -- src/`

- W2 해결: Chat.tsx:215 `role="log" aria-live="off"`.
- W4 해결: say()(Chat.tsx:82) 비웠다가 50ms 뒤 다시. permit·ask·보내기·finish 모두 say, reset은 타이머 지움.
- W5 해결: Chat.tsx:36-38 질문마다 role="group" + aria-labelledby="q-{id}-{qi}", id 겹침 없음.
- W3 일부 해결: 권한·질문 카드 답한 뒤 결과 줄로 포커스(:146-151, :168, :174, :58, :235), 중단 버튼 포커스 → 끝나면 textarea.

1. 수정 권고 / Chat.tsx:84, :249-261 / Enter로 보내면 실행 중 typing=false로 textarea가 사라지고 포커스가 body로. 끝나도 rowRef.contains(activeElement)가 false라 refocus 안 켜짐(W3 첫 항목 그대로). 수정안: run(false)에서 activeElement가 body이거나 입력 줄 안이면 refocus. confidence: 높음
2. 수정 권고 / Chat.tsx:203, :212 / `새 대화` 누르면 버튼이 사라져 포커스가 body로(W3 다섯 곳 중 하나, 손대지 않음). 수정안: reset 뒤 입력칸이 켜져 있으면 textarea, 아니면 #h-chat. confidence: 높음
3. 참고 / Chat.tsx:82 / 50ms 안에 알림 두 번이면 앞 알림이 clearTimeout으로 버려짐. 드묾, 카드는 기록에 남음. confidence: 중간

새 문제 없음. 확인: .done tabIndex=-1 포커스 링, exit 때 카드 닫힘 문구, 보내기 실패 경로. 미확인: 앱 실행, NVDA.
VERDICT: FAIL (Lead 메모: 지적은 모두 수정 권고 등급, 차단 없음)
