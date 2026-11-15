T1 완료.
바꾼 파일: C:\Users\lclk1\Projects\orbit\src-tauri\src\server.rs (이 파일만)
커밋: c8dfe26 (orbit/20261114-hook-server)

검증 (src-tauri에서):
1) 구현 전 `cargo test server::` -> 12 failed (스텁이 "not implemented" 반환, 실패 확인)
2) 구현 후 `cargo test server::`:
```
running 12 tests
ct_eq_cases, binds_loopback_only, localhost_host_ok, unknown_fields_passed_through,
wrong_method_and_path, bad_host_403, missing_token_401, too_large_413, origin_403,
wrong_token_401, ok_with_token_delivers_event, bad_json_400_then_server_alive ... ok
test result: ok. 12 passed; 0 failed
```
테스트는 PLAN (a)~(l)을 모두 덮는다. 전체 `cargo test`는 실행하지 않았다(다른 태스크 모듈이 동시 작업 중이라 server:: 필터만 실행).

계획과 달라진 점:
- 헤더 비교에 `field.equiv(name)` 대신 `field.as_str().as_str().eq_ignore_ascii_case(name)`를 썼다. `equiv`가 `'static` 인자를 요구해 컴파일이 안 됐다. 동작은 같다(대소문자 무시).
- `server_addr().to_ip()`는 tiny_http 0.12에서 실제로 존재하며 컴파일된다(R2 확인).
- 판정 순서와 응답 코드는 PLAN 그대로다. 경로의 쿼리스트링은 무시하고 `/events`만 비교한다.
- 컴파일 경고(미사용 `start` 등 dead_code)는 T5 배선 전이라 남아 있다.

못 한 것: chunked 본문의 413 경로(`take(MAX+1)`)는 코드만 있고 테스트하지 않았다. 4 MiB를 넘는 실제 본문 전송도 테스트하지 않았다(Content-Length 헤더 경로만 테스트). 토큰은 로그·출력에 남기지 않았다.
