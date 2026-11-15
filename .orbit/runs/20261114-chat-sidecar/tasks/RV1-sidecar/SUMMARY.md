RV1-sidecar 완료. 커밋 8558f23 (orbit/20261114-chat-sidecar).
바꾼 파일: sidecar/core.mjs, sidecar/chat.mjs, sidecar/core.test.mjs. COMMIT_MSG.txt는 tasks/RV1-sidecar/에 두었고 커밋하지 않았다(.orbit).

지적별 처리
- B2: core.mjs에 markInterrupt(st) 추가. st.turns > 0일 때만 interrupting을 켠다. chat.mjs는 push마다 turns++, fromSdk는 result마다 turns를 1 줄이되 0 밑으로 내리지 않는다. start의 push는 SDK import 성공 후라서 import 중 interrupt는 turns 0이고 플래그가 안 켜진다. 테스트 (b2)로 idle, 턴 직후, 다음 턴 delta 통과를 확인했다.
- B3 사이드카 쪽: chat.mjs의 query catch에서 error를 내기 전에 permits.denyAll("오류")를 호출한다. 열린 카드마다 closed가 먼저 나간다. 이 경로의 단위 테스트는 없다(chat.mjs는 SDK 의존). denyAll 자체는 기존 테스트 (f)가 덮는다.
- W6: 테스트 (b3). sk-ant-가 든 result 오류의 message에 sk-ant-가 없음을 단언한다.
- tests 5: 테스트 (c0). Bash command가 숫자면 session을 눌러도 규칙이 안 생기고, 같은 호출이 permit을 다시 낸다.
- maintainability 8(쓰지 않는 tool 필드)은 선택이라 건드리지 않았다.

검증
구현 전, 테스트만 추가한 상태:
```
SyntaxError: The requested module './core.mjs' does not provide an export named 'markInterrupt'
```
구현 후:
```
node --test sidecar/core.test.mjs -> tests 12, pass 12, fail 0
① printf '{bad\n{"t":"zzz"}\n' | node sidecar/chat.mjs -> stdout 빈 출력, exit=0
③ printf '{"t":"close"}\n' | timeout 1 node sidecar/chat.mjs -> exit=0 (타임아웃 전에 종료)
```
계획과 달라진 점: 프로토콜은 그대로다. 추가한 export는 markInterrupt뿐이다. S2 연기 검사 ②와 settingSources 등 Select-String 검사는 다시 돌리지 않았다. 모델 호출은 하지 않았다. 실제 SDK 실행 중 interrupt 동작은 검증하지 못했다.
