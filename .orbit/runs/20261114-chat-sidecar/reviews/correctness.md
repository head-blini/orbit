reviewer-correctness: 20261114-chat-sidecar

[차단] 계획 준수: F2 태스크가 PLAN대로 끝나지 않았다
- 위치: src/App.tsx:145,153 / src/App.css:79
- PLAN F2는 run()을 install_hooks만 남기고 "제거할 항목 없음" 분기를 지우라고 했는데 둘 다 남음. F2 검증 grep `uninstall_hooks`(결과 없어야 함)가 145행에서 걸림. 79행 주석도 "[설치|제거] [액정 폴더]". tasks/R2·L1의 SUMMARY.md 비어 있음(코드는 a982e8f·3c8348c).
- confidence: 높음 (grep 재현)
그 밖의 태스크는 PLAN대로: 프로토콜 이름·필드, 명령 5개와 generate_handler, local_abs 분리, RunEvent::Exit→stop, updatedPermissions 없음, 규칙 키 Bash\n+command, capability·tauri.conf·Cargo diff 0, SPEC hunk 59~77행. R2의 `#[tauri::command(async)]`는 stop 3초 대기가 메인 스레드를 막지 않게 하므로 맞는 선택.

[수정 권고] sidecar/chat.mjs:75-80 + core.mjs:40-42 — 중단과 완료가 겹칠 때 다음 턴이 사라진다
- result(done) 직후 `중단`을 누르면 끝난 턴 뒤에 interrupting=true가 남음. 다음 send의 delta가 전부 버려지고 result가 "중단됨"으로 바뀜. 도구는 그대로 실행됨.
- 방향: 실행 중일 때만 플래그를 켠다. confidence: 중간
[수정 권고] src/Chat.tsx:117-120 — exit가 와도 열린 카드가 닫히지 않는다
- 카드 대기 중 사이드카가 query 예외로 죽으면 chat.mjs:71은 denyAll 없이 error와 exit(1)만. 카드 result가 null로 남고, 질문 1개 카드면 askOne이 남아 입력이 chat_answer로 가 "대화가 없습니다" 반복. 권한 버튼도 살아 있음. `새 대화` 전까지 새 대화 불가. confidence: 중간
[수정 권고] src/Chat.tsx:165,169 — chat_send가 Err여도 open=true가 남는다
- 폴더 없음·node 없음으로 실패해도 open=true. 다른 세션을 골라 보내면 "새 대화 · 폴더:" 줄 없이 새 폴더에서 시작(W11 첫 줄 구분 깨짐). confidence: 중간
[참고] sidecar/chat.mjs:49-53,79 — start가 SDK를 동적 import하는 동안 q가 null. 이 사이 `중단`은 no-op, 턴은 끝까지 돌고 "중단됨"만. 창이 짧아 위험 낮음. confidence: 중간
[참고] src-tauri/src/chat.rs:116-127 — 이전 프로세스의 줄은 세대 구분 없이 emit(exit만 epoch로 거름). 지금은 새 대화 버튼이 실행 중 꺼져 있어 영향 없음.

확인한 것: Chat.tsx 상태 전이, stop()의 close→3초→taskkill /T, pump EOF epoch, stdin EOF→shutdown, MAX_LINE 경계 테스트. 실행: `node --test sidecar/core.test.mjs` 9/9, `cargo test` 107 통과(경고 없음).
확인하지 않은 것: q.close()가 claude.exe를 끝내는지, interrupt 뒤 result(W1·W2, V1 몫), npm run build, 실제 앱 실행.

VERDICT: FAIL
