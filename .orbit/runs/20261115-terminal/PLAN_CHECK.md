# PLAN_CHECK — 20261115-terminal (2회차)

**1회차 요약**: 7개 항목 중 항목 4(빠진 연결)만 실패(B1: 웹뷰 재로드·언마운트 뒤 Rust에 남은 claude를 프론트가 복구할 방법이 없어 "이미 실행 중"으로 영구 거부). 나머지(목표 덮기 1~22, 경로 실재, 웨이브 충돌, 범위, CLAUDE.md 체크리스트, 사이드카 삭제 호출부, 멈춤 지점이 삭제보다 앞, 보안, BRIEF 이탈 3가지)는 통과. 경고 W1~W6, 쟁점 5개를 남겼다.

## 2회차: 바뀐 곳만 재검사

| 항목 | 판정 | 근거 |
|---|---|---|
| B1 해결 | 통과 | (가) 채택: T1b 마운트 effect `term_stop` + cleanup `term_stop`, 끝날 때까지 시작 버튼 비활성. 설계 요지 1·4, 인터페이스 `term_stop`, 검증 M15(새로고침·HMR 뒤 이전 claude 0, 다시 시작됨). T1b grep(`term_stop` 3곳 이상)도 실행 가능 |
| Channel send 무시·EOF까지 읽기 | 통과 | 설계 요지 1·T1a(`let _ = on_out.send`). 끊긴 채널로 계속 읽어 PTY 버퍼가 차지 않음. 대기 스레드가 epoch로 자기 Proc만 정리하므로 옛 reader가 새 세션을 건드리지 않음 |
| W1 (T1b가 `<Chat>` 유지) | 통과 | `src/Chat.tsx` 직접 확인: 마운트 effect는 `listen("chat")`만(100~145행), `invoke("chat_*")`는 전부 사용자 조작 핸들러(185~225행) 안. 숨겨도 사이드카 기동·외부 부작용 없음. `<div hidden>`은 display:none이라 grid 칸을 차지하지 않아 `.terminal`(row 3)과 겹치지 않음. T1b grep `<Chat` 1건·T3 삭제 grep(`pickSeq\|<Chat\|\.chat\b`)과 일관. R1 (다)가 두 줄 되돌림으로 정리됨 |
| W2 | 통과 | 기본 80x24, 테스트 `Term::default()` 크기·resize(100,30), lock 하나 안 확인+spawn+설정 명시 |
| W4 | 통과 | T1c 사전 조건(`ls -l ~/.local/bin/claude`, 로그인 확인) 추가 |
| DECISIONS 8 반영 | 통과 | `TERM=xterm-256color` T1a 한 줄·M13 확인, `picked` 삭제 승인 표기, `CLAUDECODE`는 QA `env -u`만(앱 코드 불변). DECISIONS 7의 예외가 이 하나뿐임을 R4에 적음 |
| 새 문제: 마운트 stop vs 시작 버튼 경합 | 통과(주의 1) | 버튼이 stop promise 후에만 켜지므로 사용자 클릭이 stop보다 앞설 수 없다. 단 StrictMode dev 이중 마운트에서 첫 마운트의 stop 완료가 버튼을 일찍 켤 수 있다. 그래도 두 stop은 클릭 전에 이미 발행돼 있어 실해는 사실상 없음. 구현 시 effect의 `cancelled` 플래그로 최신 마운트 promise만 버튼을 켜게 하면 깔끔(권고, 비차단) |
| 새 문제: 언마운트 stop | 통과(수용됨) | dev HMR이 실행 중 claude를 끝내는 것은 R15에 dev 전용 불편으로 기록. 운영에서는 Terminal이 언마운트되지 않음 |

7개 항목 재판정: 목표 덮기 통과 / 검증 가능성 통과(W3은 R12로 기록) / 경로 실재 통과(1회차 확인, 변경 없음) / 빠진 연결 통과(B1 해결) / 웨이브 충돌 통과(T1b가 `App.tsx`·`App.css` 수정, T1a는 Rust만, T3는 웨이브 3) / 범위 통과 / 프로젝트 규칙 통과(W5·W6는 R13·R14로 기록).

실행 확인 필요: `cargo test`, `npm run build`, `node --test harness/hooks/gate.test.mjs`, 구현 후 기준 4·9 grep, M15·M9(`/bin/kill -- -pid` 맥 동작) 실측. 이번 2회차 변경은 계획 문서뿐이라 `claude plugin validate` 대상 없음.

VERDICT: PASS
