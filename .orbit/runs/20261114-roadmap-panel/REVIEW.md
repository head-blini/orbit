# REVIEW — 20261114-roadmap-panel

대상: `git diff main...orbit/20261114-roadmap-panel`, head 2145246 (커밋 6개).
패널(full): reviewer-correctness, reviewer-tests, reviewer-maintainability, reviewer-rules, reviewer-accessibility. Lead가 gate 스킬의 병합 규칙으로 합쳤다(내용은 리뷰어 보고 그대로, 중복만 합침).

## 1단계: 계획 준수 (reviewer-correctness)

**PASS.** 커밋 6개가 D1·L1·S1·R1·R2·F1과 1:1. SPEC.md diff는 PLAN의 네 곳뿐. capabilities·tauri.conf.json·package*.json·Cargo.*·Graph.tsx diff 없음. roadmap.rs 인터페이스·상수·검사 순서(접두사 → symlink → is_file → canonicalize parent → 열린 핸들 → take)가 PLAN과 같음. get_roadmap은 id만 받고 락은 파일 IO 전에 풀림. short_kind는 내보내는 복제본에만 적용. DESIGN 2.1 상태 8개·2.2 상단 바·2.3 문구·4절 aria 일치. `cargo test` 100 passed(correctness·tests 리뷰어가 각각 실행), 정션 거부 단언 실제 실행("junction: 만들어짐, 단언 실행"), 심볼릭 링크 단언은 권한 1314로 건너뜀.

## 차단

없음.

## 수정 권고

- **W1** (maintainability, 중간) `src-tauri/src/roadmap.rs:94-100` — `screens.rs:24-26`의 `inside`와 같은 canonicalize·parent 비교를 다시 구현했고, 왜 남기는 방어선인지 주석이 없다. `screens::inside`를 `pub(crate)`로 열어 쓰거나 "방어선, 지우지 않는다" 한 줄. (관련 참고: 105-113행 열린 핸들 재확인의 이유(TOCTOU 완화)도 주석 없음.) → **이번에 고침**(주석).
- **W2** (tests, 중간) `src-tauri/src/roadmap.rs:235-241` — MAX_LINE은 +1(빠짐)만 단언하고 정확히 MAX_LINE바이트 줄이 남는지는 단언하지 않는다. `>`를 `>=`로 바꿔도 통과. → **이번에 고침**(단언 추가).
- **W3** (accessibility, 높음) `src/App.css:85`, `src/App.tsx:183` — 서버 상태가 240px에서 말줄임되는데 `title`이 없어 긴 오류 사유 전문을 볼 방법이 없다. → **이번에 고침**(`title`).
- **W4** (accessibility, 중간) `src/App.tsx:187-188` — 누른 버튼이 `disabled`가 되면 WebView2에서 포커스가 body로 빠진다(추정, 이전 코드도 같은 패턴). `aria-disabled` + 클릭 무시 제안. → 후속 목록.
- **W5** (accessibility, 중간, CSS 추정) `src/App.css:80,82` — 상단 바 한 줄 고정이라 960 폭 200% 확대에서 결과 줄 폭이 0이 되고 오른쪽 묶음이 가로 스크롤로 밀린다(WCAG 1.4.10). → 후속 목록(개인용, 한 줄 고정은 승인된 DESIGN).

## 참고

- **N1** (rules, 중간) `roadmap.rs:121-137` — cwd는 드라이브 문자로 시작하는 로컬 절대 경로면 어느 폴더든 통과(매핑 드라이브 포함). PLAN 위험 R4·R5로 수용한 결정. Security가 한 번 더 본다.
- **N2** (correctness, 낮음) `src/App.tsx:127` — 세션을 바꾼 직후 이전 세션의 로드맵이 한 render 동안 남을 수 있다(보일 가능성 낮음, PLAN 방식 그대로).
- **N3** (maintainability, 높음) `src/App.tsx:38-63` — 항목 0개여도 묶기를 끝까지 계산한 뒤 버림. 먼저 return하면 삼항이 사라진다.
- **N4** (tests, 높음) `roadmap.rs:287-293` — 심볼릭 링크 단언은 이 환경에서 건너뛰고 기본 출력에는 ok로만 보인다. 정션은 `!is_file`로도 거부되어 `is_symlink` 분기와 94-100행 범위 검사는 어느 테스트로도 닿지 않는다. VERIFY.md에 "심볼릭 링크 단언 미실행"을 적는다.
- **N5** (tests, 중간) `roadmap.rs:182-200` — CRLF판은 줄 목록만 비교하고 skipped는 보지 않는다.
- **N6** (tests, 중간) `roadmap.rs:332-338` — 직렬화 테스트가 toobig의 필드 이름·error의 `reason`을 검사하지 않는다(프론트가 기대는 이름, 현재는 맞음).
- **N7** (tests, 중간) `roadmap.rs:256,271,312,329` — 단언 실패 시 임시 폴더가 남는다.
- **N8** (accessibility, 낮음) `src/App.tsx:181` — 말줄임된 결과 전문이 `title`에만 있어 키보드로는 못 본다. `role="status"`의 title이 이름으로도 노출돼 두 번 낭독될 수 있다.
- **N9** (accessibility, 중간) `src/App.tsx:160` — `액정 폴더` 실패가 같은 문구로 반복되면 다시 낭독되지 않는다.
- **N10** (accessibility, 낮음) `src/App.tsx:185,188` — 훅 상태 문구는 live 영역이 아니다.
- **N11** (tests) get_roadmap glue와 프론트는 테스트 없음 — 수용(로직은 R1 테스트, 프론트는 V1 QA 절차가 유일한 검증).
- 리뷰어들이 못 한 것: 앱 실행, 확대·낭독기 실측, `npm run build`(읽기 전용 리뷰어).

## 판정

차단 없음. W1~W3은 QA 전에 engineer가 고친다(작은 변경). W4·W5와 참고는 `.orbit/decisions.md` 후속 목록으로 넘긴다.

VERDICT: PASS
