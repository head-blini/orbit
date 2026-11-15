# REVIEW — 20261114-chat-sidecar (2회차)

1회차(차단 B1~B4, 수정 권고 W1~W7, VERDICT FAIL)는 아래 "1회차 기록". 수정 커밋: 8a92087(프론트), 8558f23(사이드카), 197eab6(Rust). 2회차 리뷰어: correctness(PASS, `reviews/correctness-2.md`), accessibility(FAIL 표기이나 지적은 모두 수정 권고 등급, `reviews/accessibility-2.md`). 병합 규칙상 차단 없음.

## 1회차 지적 확인
- B1~B4 해결(correctness-2). W1, W2, W4, W5, W6, W7 해결. W3 일부 해결.

## 차단
없음.

## 수정 권고 (QA 전에 RV2로 고친다)
- **R1 보낸 뒤 포커스 유실** — correctness-2 #1, accessibility-2 #1. `src/Chat.tsx:84,153,249-261`: Enter로 보내면 textarea가 사라져 body로, 턴 끝에 입력칸으로 안 돌아옴. run(false)에서 activeElement가 body이거나 입력 줄 안이면 refocus.
- **R2 `새 대화` 뒤 포커스 유실** — accessibility-2 #2. `src/Chat.tsx:203,212`: reset 뒤 입력칸이 켜져 있으면 textarea, 아니면 `#h-chat`.
- **R3 사이드카 재시작 뒤 카드 id 충돌** — correctness-2 #2. `src/Chat.tsx:150,169,175,226-227`: 새 프로세스가 p1부터 다시 써서 옛 카드 결과를 덮어씀·포커스가 옛 카드로·`q-p1` id 중복. 결과는 result===null인 카드만 바꾸고, 화면 id는 대화(프로세스)마다 다르게.

## 참고 (고치지 않음, 후속 목록)
- correctness-2 #3(SDK import 중 `중단`은 no-op), #4(exit와 send 실패 경쟁 시 open 되살림), accessibility-2 #3(50ms 안 알림 두 번이면 앞 알림 누락), 1회차 참고 목록 전부.

## 1회차 기록
차단: B1 F2 미완료, B2 중단 플래그가 턴 밖에서 남음, B3 사이드카가 죽어도 카드 남음, B4 chat_send 실패 뒤 open=true. 수정 권고: W1 stop() poison, W2 aria-live, W3 포커스, W4 같은 알림, W5 group 레이블, W6 redact 테스트, W7 pump 상한 테스트. 원문 `reviews/{correctness,tests,maintainability,rules,accessibility,idiom}.md`.

VERDICT: PASS
