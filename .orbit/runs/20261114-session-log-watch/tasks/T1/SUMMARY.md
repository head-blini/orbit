T1 완료.
바꾼 파일: C:\Users\lclk1\Projects\orbit\src-tauri\src\watch.rs (이 파일만)
커밋: d1b84b1 (브랜치 orbit/20261114-session-log-watch, watch.rs 1개 파일, 289줄)

검증:
- 구현 전(`poll`을 빈 스텁으로 두고 테스트만 작성): `cargo test watch::` -> `test result: FAILED. 0 passed; 10 failed`
- 구현 후:
```
cargo test watch::
test watch::tests::a_complete_line ... ok
test watch::tests::b_half_line ... ok
test watch::tests::c_broken_json ... ok
test watch::tests::d_oversize_line ... ok
test watch::tests::e_growing_tail ... ok
test watch::tests::f_truncated_rewrite ... ok
test watch::tests::g_deleted_file ... ok
test watch::tests::h_excluded_files ... ok
test watch::tests::i_missing_root ... ok
test watch::tests::j_no_change ... ok
test result: ok. 10 passed; 0 failed
```
- 금지 패턴 점검: `unwrap(|expect(|println!|eprintln!|dbg!|share_mode`와 `[` 인덱싱을 grep(Select-String 대신 grep)으로 확인했다. 매치는 모두 121행 `#[cfg(test)]` 이후이고, 프로덕션 코드(1~120행)에는 0건이다. A4에 따라 `[ ]` 인덱싱 없이 `split_at`, `get(1..)`, `saturating_add`, `position`만 썼다.
- 테스트는 temp_dir 임시 폴더만 쓰고 앱은 띄우지 않았다.

계획과 달라진 점: 없음. 인터페이스(`MAX_LINE`, `Watcher::new`, `poll`)는 계획 그대로다. 테스트 (h)는 `slug` 폴더를 먼저 만들게 했다. 테스트 코드의 사소한 버그 수정이었다.
확인 못 한 것: 전체 `cargo test`(T2·T3 파일과 같이 도는 상태)는 돌리지 않았다. `watch::` 필터 실행만 했다.
