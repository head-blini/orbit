# DEBUG — S2 (토큰 없는 로컬 요청 하나로 훅 수신 서버가 멈추거나 앱이 죽음)

역할: debugger · 브랜치 `orbit/20261114-hook-server` · 대상 `src-tauri/src/server.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
참고: 지시된 `orbit:systematic-debugging` / `orbit:verification-before-completion` 스킬은 이 에이전트에 Skill 도구가 없어 불러오지 못했다. 절차(재현 → 좁히기 → 원인 → 테스트 먼저 → 수정 → 확인)는 역할 지시대로 따랐다.

## 증상

SECURITY.md S2(정적 분석): 토큰 없는 요청이 (a) 수신 스레드를 무기한 멈추게 하고, (b) 거대 Content-Length로 프로세스를 죽이며, (c) 헤더 길이에 상한이 없다.

## 재현 방법

`src-tauri/src/server.rs` 테스트에 회귀 테스트 3개를 먼저 추가하고(구현은 tiny_http 그대로) 실행했다. 모두 `C:\Users\lclk1\Projects\orbit\src-tauri`에서.

- `stalled_unauth_body_does_not_block_others`: 토큰 없이 `POST /events` + `Content-Length: 2000` 헤더만 보내고 소켓을 쥔 채, 다른 연결로 정상 요청 → 1초 안에 204를 기대.
- `huge_content_length_does_not_crash`: 토큰 없이/있이 `Content-Length` 2^50, u64 최대값 → 401/413을 기대하고 이어서 정상 요청 204.
- `oversized_header_rejected`: 정상 토큰 + 64 KiB 헤더 한 줄 → 431, 이벤트 0건을 기대.

### 수정 전 출력 (a, c)

```
$ cargo test --lib server:: -- --skip huge_content_length
running 14 tests
...
test server::tests::oversized_header_rejected ... FAILED
test server::tests::stalled_unauth_body_does_not_block_others ... FAILED

---- server::tests::oversized_header_rejected stdout ----
assertion `left == right` failed
  left: 204
 right: 431

---- server::tests::stalled_unauth_body_does_not_block_others stdout ----
thread 'server::tests::stalled_unauth_body_does_not_block_others' panicked at src\server.rs:98:51:
called `Option::unwrap()` on a `None` value          <- 정상 요청이 3초 읽기 타임아웃 동안 응답을 하나도 못 받음

test result: FAILED. 12 passed; 2 failed; ...
```

### 수정 전 출력 (b) — 테스트 프로세스 자체가 종료

```
$ cargo test --lib server::tests::huge
running 1 test
memory allocation of 1125899906842624 bytes failed
error: test failed, to rerun pass `--lib`
Caused by:
  process didn't exit successfully: `...orbit_lib-8becba6b2b047dd5.exe 'server::tests::huge'` (exit code: 0xc0000409, STATUS_STACK_BUFFER_OVERRUN)
```

`0xc0000409`는 Windows에서 Rust `abort`의 종료 코드다. 디버그 빌드에서도 패닉이 아니라 할당 실패 abort라 앱 전체가 죽는다.

## 좁히기

- 같은 stall 테스트에서 `Content-Length`만 2000 → 1000으로 바꾸면(다른 것은 그대로) 통과했다:
  ```
  test server::tests::stalled_unauth_body_does_not_block_others ... ok
  test result: ok. 1 passed; ...
  ```
  즉 단일 스레드 처리 일반의 문제가 아니라 1024바이트 경계에서 갈리는 tiny_http의 본문 리더 문제다. 확인 뒤 2000으로 되돌렸다.
- tiny_http 0.12.0 소스(`~/.cargo/registry/src/*/tiny_http-0.12.0`):
  - `src/request.rs:194` `else if content_length <= 1024 && !expects_continue {` — 1024 이하는 미리 읽고, 그보다 크면 `:215` `EqualReader::new(source_data, content_length)`.
  - `src/util/equal_reader.rs` `impl Drop for EqualReader`: `while remaining_to_read > 0 { let mut buf = vec![0; remaining_to_read]; match self.reader.read(&mut buf) ...` — 남은 길이만큼 한 번에 할당하고 소켓에서 끝까지 읽는다.
  - 소스 전체에 `set_read_timeout` 호출 없음(grep 결과 0건).

## 근본 원인

tiny_http 0.12.0은 Content-Length > 1024인 요청의 본문을 `EqualReader`로 감싸고 `Request`가 drop될 때 남은 본문을 `vec![0; 남은 길이]`로 할당해 타임아웃 없이 읽기 때문에, 우리 `handle`이 401/403 등을 응답한 뒤 `Request`를 drop하는 순간 (a) 본문을 안 보내는 클라이언트에 단일 수신 스레드가 무기한 묶이고 (b) 거대 Content-Length는 할당 실패로 프로세스를 abort시킨다. (c) 헤더 줄 길이 상한도 tiny_http에 없어 64 KiB 헤더가 그대로 통과했다(204). 증거는 위 수정 전 출력 3개와 1000/2000 대조.

## 수정 내용

SECURITY.md 권장 1번: tiny_http를 걷어내고 `std::net::TcpListener` 기반 최소 파서로 바꿨다(`src-tauri/src/server.rs`). `Cargo.toml`에서 `tiny_http`를 지웠고 `Cargo.lock`에서 `tiny_http`, `ascii`, `chunked_transfer`, `httpdate`가 빠졌다.

- 연결마다 스레드(`thread::Builder::spawn`, 생성 실패 시 그 연결만 닫힘). 이벤트는 채널로 단일 디스패처 스레드에 넘겨 `on_event`를 호출하므로 `on_event`에 `Sync`를 요구하지 않는다 → `pub fn start(port, token, on_event: impl Fn(Value)+Send+'static) -> Result<SocketAddr,String>`와 `pub const MAX_BODY` 그대로, `lib.rs` 호출부 변경 없음.
- 연결당 총 읽기 마감 2초(`DEADLINE`). 읽을 때마다 남은 시간을 `set_read_timeout`으로 다시 건다 → 조금씩 흘려 보내는 클라이언트도 2초 안에 끊긴다.
- 요청 줄+헤더 상한 16 KiB(`MAX_HEAD`), 넘으면 431. 헤더 버퍼는 고정 4 KiB 청크로만 자란다.
- 판정 순서 그대로: Host 403 → Origin 403 → 경로 404 → 메서드 405 → 토큰(상수 시간) 401 → (새) `Transfer-Encoding` 있으면 411 → Content-Length 파싱 실패 400 → `> MAX_BODY` 413 → 본문 읽기(Content-Length만큼, 이때 처음 할당) → JSON 실패 400 / 성공 204 후 이벤트 전달.
- 응답 뒤 `shutdown(Write)`하고 남은 입력은 마감까지 고정 4 KiB 버퍼로 버린다(할당 없음). 안 읽은 바이트를 남기고 닫으면 RST로 응답이 사라질 수 있어서다.
- 응답은 모두 빈 본문, `Connection: close`. 토큰·헤더·본문을 어디에도 출력하지 않는다.

## 확인 출력 (수정 후)

```
$ cargo test --lib server::
running 15 tests
test server::tests::ct_eq_cases ... ok
test server::tests::binds_loopback_only ... ok
test server::tests::unknown_fields_passed_through ... ok
test server::tests::localhost_host_ok ... ok
test server::tests::wrong_method_and_path ... ok
test server::tests::huge_content_length_does_not_crash ... ok
test server::tests::wrong_token_401 ... ok
test server::tests::missing_token_401 ... ok
test server::tests::bad_host_403 ... ok
test server::tests::origin_403 ... ok
test server::tests::ok_with_token_delivers_event ... ok
test server::tests::oversized_header_rejected ... ok
test server::tests::too_large_413 ... ok
test server::tests::bad_json_400_then_server_alive ... ok
test server::tests::stalled_unauth_body_does_not_block_others ... ok
test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 16 filtered out; finished in 0.30s
```

```
$ cargo test
running 31 tests
test result: ok. 31 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.31s
running 0 tests  (x2, doc/bin)
test result: ok. 0 passed; ...

$ cargo build
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.68s     (경고 없음)
```

기존 server 테스트 12개 + 새 3개 모두 통과. 앱은 띄우지 않았다(실제 Claude Code 요청으로의 확인은 QA 몫).

## 남은 한계 / 같은 종류의 버그가 숨어 있을 만한 곳

- 연결 수 상한이 없다. 로컬 프로세스가 연결을 대량으로 열면 연결마다 스레드가 생긴다(각자 최대 2초·헤더 ≤ ~20 KiB 버퍼). 상한을 두면 공격자가 그 상한만 채워 정상 이벤트를 막을 수 있어 넣지 않았다. 스레드 생성 실패는 그 연결만 버리고 패닉하지 않는다.
- `Transfer-Encoding`(chunked) 요청은 411로 거절한다. Claude Code http 훅이 Content-Length로 보낸다고 가정했다(미실측). QA 5(실제 세션 이벤트 도착)에서 이벤트가 안 오면 여기부터 본다.
- 오류 응답의 reason phrase는 비어 있다(`HTTP/1.1 401 \r\n`, RFC 9112상 허용). 204만 `No Content`를 붙인다.
- keep-alive 미지원(요청 하나 뒤 닫음). http 훅은 호출마다 요청 하나라 영향 없다고 봄.
- 인증된 클라이언트는 여전히 최대 4 MiB 본문을 연결마다 할당시킬 수 있다(토큰 보유자 = 신뢰 경계 안).
- 비슷한 패턴 점검 후보: 외부 입력 길이로 `vec![0; n]`/`with_capacity(n)`를 하는 곳, 타임아웃 없는 소켓·파이프 읽기. 현재 Rust 코드에서 소켓을 다루는 곳은 `server.rs`뿐이다. 세션 로그(JSONL) 파서가 생기면 줄 길이 상한을 같은 방식으로 둬야 한다.
- PLAN R10(단일 스레드 느린 클라이언트)은 이 수정으로 해소됐다 — PLAN 갱신은 Lead 몫.
