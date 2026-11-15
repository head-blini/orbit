T3 완료.
바꾼 파일: C:\Users\lclk1\Projects\orbit\src-tauri\src\config.rs (이 파일만)
커밋: ac32866 (브랜치 orbit/20261114-hook-server)

검증 (src-tauri에서 `cargo test config::`)
- 구현 전: 3 passed 아님, "1 passed; 3 failed" (creates_in_empty_dir, reuses_existing, different_dirs_different_tokens가 Err("todo")로 실패). 깨진 파일 테스트는 스텁이 항상 Err라서 구현 전에도 통과했다.
- 구현 후:
```
test config::tests::corrupt_file_errs_and_is_untouched ... ok
test config::tests::creates_in_empty_dir ... ok
test config::tests::different_dirs_different_tokens ... ok
test config::tests::reuses_existing ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 12 filtered out
```

계획과 달라진 점
- R2 확인: getrandom 0.4는 `getrandom::fill(&mut [u8])`로 컴파일·동작했다. docs.rs를 직접 열어 본 것은 아니고 컴파일로 확인했다.
- 테스트는 OS 임시 폴더(프로세스 ID와 카운터로 고유 이름)만 쓰고 끝에 지운다.
- 토큰은 출력·오류 메시지에 넣지 않았다. 오류 메시지에는 경로와 사유만 있다.
- 깨진 파일 판정은 JSON 파싱 실패 기준이다. 저장 파일의 포트 0이나 토큰 형식(64자 hex)은 검증하지 않는다. 필요하면 후속 처리.
- 실행 중 lib.rs의 mod 선언은 이미 있어서 건드리지 않았다.
