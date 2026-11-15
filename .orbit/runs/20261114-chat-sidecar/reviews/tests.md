reviewer-tests: 20261114-chat-sidecar

실행: `node --test sidecar/core.test.mjs` 9/9, `cargo test` 107 passed(chat:: 6, roadmap::local_abs_shapes·for_cwd_shapes, warning 없음), `node --test harness/hooks/gate.test.mjs` 71/71.

1. 수정 권고 | sidecar/core.test.mjs:31-33 (core.mjs:45-46) — result 오류 경로는 `t:"error"`만 확인, message가 redact를 거치는지 확인 안 함. `redact(why)`를 지워도 통과 → `sk-ant-…`·Bearer가 화면에 나올 수 있음. confidence: 중간
2. 수정 권고 | src-tauri/src/chat.rs:237-245 `pump_never_buffers_more_than_max_line` — 이름·주석은 버퍼 상한을 잰다지만 단언은 "긴 줄 emit 안 함, 뒤 줄 살림"뿐. 줄 전체를 Vec에 모은 뒤 버리는 구현도 통과 → 끝없는 줄에서 메모리 무한 증가. confidence: 중간
3. 참고 | chat.rs:113-127, 84-86, 26-28 — 세대 번호(옛 exit 버림), "이미 대화가 있습니다", send 기존 프로세스 분기 테스트 없음. 120행 `p.epoch == epoch` 비교를 지워도 통과. spawn_with on_line 주입으로 `node -e` 가짜 자식 테스트 가능(PLAN은 V1에 맡김). confidence: 중간
4. 참고 | core.test.mjs:164-171 (core.mjs:16) — redact 경계는 45자뿐, 39/40자와 40자 이상 경로 조각 미검사. confidence: 중간
5. 참고 | core.test.mjs:63-96 (core.mjs:68) — Bash command가 문자열이 아닐 때 session 규칙 미생성(key=null) 테스트 없음. confidence: 중간
6. 참고 | chat.mjs:75-81 — 턴이 없을 때 interrupt면 `st.interrupting=true`가 남아 다음 턴 delta 버림·result가 stopped(correctness 지적과 같음). confidence: 낮음

PLAN 대조: S1 (a)~(i) 모두 단언 있음. R1 parse_line 7사례, pump 경계, local_abs 형태, Chat::default write/stop, bad cwd 미spawn. 불안정 요소 없음.
확인하지 않은 것: mutation 실행, 프론트 테스트(없음).

VERDICT: PASS
