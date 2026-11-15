SUMMARY (T1 review fixes W1, W2)
바꾼 파일: src-tauri/src/chat.rs
커밋: 32e9d04 (orbit/20261115-open-folder)
- W1: `fn write_json(w:&mut` -> `w: &mut` 복원. `git diff main -- src-tauri/src/chat.rs`에서 write_json은 컨텍스트 줄로만 나오고 +/- 변경은 없음.
- W2: UNC 두 경우(`\\server\share\p`, `\\?\UNC\server\share\p`)를 `assert_eq!(..unwrap_err(), "로컬 절대 경로가 아닙니다")`로 바꿈.
검증 (src-tauri/에서 cargo test):
```
test chat::tests::check_cwd_rejects_bad_and_accepts_dir ... ok
test result: ok. 111 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
계획과 달라진 점: 없음. 커밋 메시지 파일은 .orbit/runs/20261115-open-folder/commit-msg-t1-review.txt (커밋에 포함 안 됨).
못 한 것: W3~W5는 지시대로 건드리지 않음.
