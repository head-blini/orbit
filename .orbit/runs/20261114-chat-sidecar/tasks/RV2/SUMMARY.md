RV2 완료. 바꾼 파일: src/Chat.tsx. 커밋: ed57684.

지적별 처리:
- R1: run(false)에서 activeElement가 body이거나 입력 줄 안이면 refocus. 턴이 끝나면 textarea로 돌아온다.
- R2: reset이 afterReset 플래그를 세운다. items가 바뀐 뒤 textarea가 켜져 있으면 거기로, 아니면 `#h-chat`으로 포커스를 준다. `#h-chat`에 tabIndex=-1을 추가했고 화면 모양은 그대로다.
- R3: permit/ask 항목에 gen(대화 번호)을 넣었다. gen은 exit와 reset마다 올라간다. 화면 id와 DOM id는 `sid`=`gen-id`로 만들어 q-… 와 data-done에 쓴다. 프로토콜 id는 그대로다. closed, answer, permit 모두 result===null인 카드만 바꾼다. 프로토콜과 사이드카는 건드리지 않았다.

검증:
```
grep -c dangerouslySetInnerHTML src/Chat.tsx  -> 0
npm.cmd run build -> 종료 0 (tsc 통과, "✓ built in 133ms")
```
검증하지 못한 것: 앱 실행과 실제 포커스 동작. 프론트 테스트는 이 저장소에 없다.
남은 위험: gen은 exit나 reset을 거칠 때만 오른다. exit 이벤트 없이 사이드카가 다시 뜨는 경우에는 구분하지 못한다.
