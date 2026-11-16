# 로그 줄 줄이기(slim)와 ingest_log가 읽는 필드의 어긋남

## 증상
훅 없이 세션 로그(jsonl)만 있는 세션에서 `.orbit/current` Write가 있어도 run이 안 잡혔다(`session.run`이 null). 같은 Write를 훅으로 보내면 잡혔다. `sessions.rs` 단위 테스트는 모두 통과했다.

## 원인
`watch.rs`의 `slim_block`이 tool_use `input`에서 `subagent_type`·`description`만 남겼다. `sessions::run_start`는 로그 경로에서 `input.file_path`·`content`·`new_string`을 읽는데 이미 버려져 항상 None이었다. 단위 테스트는 `Store::ingest_log`에 원본 JSON을 직접 넣어 `slim`을 거치지 않았다. 훅 경로는 원본을 그대로 넘겨 영향이 없었다.

## 해결
`Inp`에 `file_path`·`content`·`new_string`을 추가하고, 경로가 `.orbit/current`일 때만 본문을 남긴다(`sessions::is_current_path` 한 곳에서 판정). 다른 파일의 본문은 계속 버린다. 실제 경로(`Watcher::poll` → `slim` → `ingest_log`)로 넣는 테스트 `q_slim_keeps_run_fields_through_ingest`, `q2_slim_drops_content_of_other_files`를 추가했다.

## 다음에 미리 할 것
- `ingest_log`가 읽는 필드를 늘리면 `slim`/`slim_block`도 같이 바꾼다.
- 로그 경로 기능 테스트는 원본 JSON 직접 주입이 아니라 `Watcher`를 거치게 쓴다(`watch.rs`의 `o_`·`q_` 테스트 방식).
- `Store::tool`(Lead 말풍선)이 `input`의 다른 필드를 읽게 되면 같은 문제가 난다.
- 훅 경로와 로그 경로가 같은 결과를 내는지 둘 다 확인한다.
