T2 완료.
바뀐 파일: C:\Users\lclk1\Projects\orbit\src-tauri\src\hooks.rs (이 파일만)
커밋: f9fe836 (orbit/20261114-hook-server)

검증: `cargo test hooks::` (src-tauri에서)
```
running 8 tests
test hooks::tests::hooks_not_object_is_untouched ... ok
test hooks::tests::broken_json_is_untouched ... ok
test hooks::tests::uninstall_without_orbit_entries_is_noop ... ok
test hooks::tests::missing_file_is_created ... ok
test hooks::tests::install_preserves_and_adds_all_events ... ok
test hooks::tests::install_then_uninstall_restores_original ... ok
test hooks::tests::is_installed_lifecycle ... ok
test hooks::tests::reinstall_replaces_without_duplicates ... ok
test result: ok. 8 passed; 0 failed
```
PLAN 테스트 (a)~(h)를 모두 덮는다. 테스트는 OS 임시 폴더 안의 사본만 쓰고 끝나면 지운다. 실제 `~/.claude`와 저장소 `.claude/`는 건드리지 않았다.

계획과 달라진 점:
- TDD 순서를 지키지 못했다. 구현을 먼저 쓰고 테스트를 나중에 붙였다. "구현 전 실패"는 확인하지 못했다. 처음 쓴 `strip`은 비게 된 이벤트와 `hooks`를 지우지 못하는 버그가 있어 테스트 실행 전에 고쳤다.
- `Drop` 정리용 테스트 헬퍼 `Dir`을 같은 파일 안에 두었다. 인터페이스 시그니처는 PLAN과 같다.
- 실행 중 컴파일 경고 16개가 나왔다. 대부분 server.rs 등 다른 모듈의 미사용 경고이고 T2 범위 밖이라 손대지 않았다.
- 커밋 때 LF→CRLF 변환 경고가 나왔다. 동작에는 영향이 없다.
