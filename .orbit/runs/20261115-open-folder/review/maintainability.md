reviewer-maintainability: 차단 0건, 수정 권고 2건, 참고 3건.

1. 수정 권고 — src-tauri/src/chat.rs:154: `fn write_json(w: &mut ...)` → `w:&mut`로 콜론 뒤 공백이 사라진 무관 포맷 회귀. 원래대로 되돌린다. confidence 높음.
2. 수정 권고 — src-tauri/src/lib.rs:117, src/Chat.tsx:208: 빈 session = 고른 폴더(picked) 약속이 코드에 없음. chat_send 위에 한 줄 주석. confidence 높음.
3. 참고 — src/Chat.tsx:177: effect 의존성 session?.id는 거의 불필요([pickSeq]만). confidence 낮음.
4. 참고 — src/Chat.tsx:229: Rust가 이미 stop() 했는데 reset()이 chat_reset을 또 부름(무해, 주석 없음). confidence 중간.
5. 참고 — src-tauri/src/lib.rs:125-126: 같은 오류 문구 두 번. 그대로 둬도 됨.

문제없음: 의존성 하나(rfd·tauri-plugin-fs 끌어옴, 공식 플러그인), check_cwd 동작 동일, strip_verbatim_disk 인덱싱 안전, 인라인 style 기존 관례, 락 패턴 기존대로, 계획 밖 추상화 없음.
확인 못 한 것: 빌드·테스트 미실행, Cargo.lock의 libc 추가 출처.
