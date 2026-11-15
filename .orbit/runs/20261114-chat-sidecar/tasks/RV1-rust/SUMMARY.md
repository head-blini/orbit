RV1-rust 완료.
바꾼 파일: src-tauri/src/chat.rs
커밋: 197eab6 (orbit/20261114-chat-sidecar)

지적별 처리
- W1: chat.rs의 Mutex lock 4곳(send, write, stop, spawn_with)과 reader 스레드의 lock을 `unwrap_or_else(|e| e.into_inner())`로 바꿨다. 그래서 stop()은 poison이어도 take()해서 정리한다. 스레드의 epoch 비교는 match 대신 if로 풀어 썼다.
- W7: 버퍼 길이는 pump 내부 변수라 밖에서 관측할 수 없었다. 테스트 이름을 `pump_drops_overlong_line_with_tiny_reader_buffer`로 바꾸고 주석에 단언 범위를 적었다. 단언 내용은 그대로다.
- 선택 항목(CREATE_NO_WINDOW 상수, epoch 비교 테스트)은 하지 않았다.

검증
```
cargo build  -> Finished dev profile (경고 없음)
cargo test   -> test result: ok. 107 passed; 0 failed (나머지 2개 바이너리 0 tests)
grep unwrap(/expect(/println in chat.rs (unwrap_or_else, unwrap_err 제외) -> 0건
```
계획과 달라진 점 없음. W7은 단언을 강화하지 못하고 이름·주석을 맞추는 쪽으로 처리했다(buffer 상한 자체는 여전히 테스트로 증명되지 않음). poison 상태에서 stop()이 정리하는지 보는 테스트는 추가하지 않았다.
