# REVIEW — 20261115-open-folder

패널(full): reviewer-correctness, reviewer-tests, reviewer-maintainability, reviewer-rules, reviewer-accessibility, reviewer-idiom.
대상: `git diff main...orbit/20261115-open-folder` (2c3db15 T3, 2b6a932 T2, c565526 T1).
계획 준수(reviewer-correctness spec): PASS. 차단 0건.

리뷰어 실행 증거(reviewer-tests):
```
cargo test                              -> 111 passed; 0 failed (check_cwd_*, strip_verbatim_*, spawn_rejects_bad_cwd_* ok)
node --test harness/hooks/gate.test.mjs -> tests 71, pass 71, fail 0
npm run build                           -> exit 0, built in 159ms
```

## 차단
없음.

## 수정 권고 (Rust 쪽 — 이 run에서 고침, DECISIONS 3번째 항목)
- W1 `src-tauri/src/chat.rs:154` `fn write_json(w:&mut` — 무관한 공백 회귀, `w: &mut`로 되돌림. (maintainability, rules, idiom, correctness)
- W2 `src-tauri/src/chat.rs:301-302` UNC 두 경우를 `is_err()`만 확인 → `check_cwd` 거부 메시지("로컬 절대 경로가 아닙니다")까지 단언해 `local_abs` 단계를 고정. (tests)

## 수정 권고 (채팅 쪽 — 고치지 않음: 다음 run에서 채팅 삭제로 해소, DECISIONS 참조)
- W3 `src-tauri/src/lib.rs:117`, `src/Chat.tsx:208` 빈 session = 고른 폴더 약속 주석 없음. (maintainability; idiom 참고)
- W4 `src/Chat.tsx:229` 폴더 선택 후 스크린리더 안내 없음(`say` 미호출). (accessibility)
- W5 `src/Chat.tsx:243,232` 다이얼로그 동안 `disabled`로 포커스 유실, 복귀 없음. (accessibility, WebView2 실측 필요)

## 참고
- N1 Chat.tsx:177 effect 의존성 `session?.id` 거의 불필요 / pickSeq → effect 초기화 패턴(프로젝트 선례 App.tsx:129). (maintainability, idiom)
- N2 Chat.tsx:229 reset()이 chat_reset 재호출(무해). (maintainability)
- N3 lib.rs:125-126 같은 오류 문구 2회. (maintainability)
- N4 `command(async)` 안 blocking_pick_folder가 워커 하나를 묶음 — 메인 스레드 아님, PLAN 위험 5 감수. (idiom, correctness 확인)
- N5 다이얼로그가 떠 있는 동안 세션 클릭 → 폴더 확정이 이김(시간상 마지막 확정, DECISIONS와 모순 아님). (correctness)
- N6 strip→check 결합 테스트 없음, chat_send picked 분기 테스트 없음 → QA 6·7 필수. (tests)
- N7 strip_verbatim_disk의 `\\?\C:`·소문자·숫자 드라이브 미테스트 — local_abs가 거부, 영향 없음. (tests)
- N8 커밋 순서 T2가 T1보다 먼저(중간 커밋 단독 실행 시 버튼 오류). (rules)
- N9 세션 재클릭 시 폴더 버림 안내 없음. (accessibility)

VERDICT: PASS
