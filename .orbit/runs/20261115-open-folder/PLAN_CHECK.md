# PLAN_CHECK — 20261115-open-folder (폴더 열기) — 2회차

검사 대상: PLAN.md(변경 이력 2026-11-15 반영본). 기준: BRIEF.md(성공 기준 1~14), DECISIONS.md(3건), CLAUDE.md 체크리스트.
1회차 차단 항목: B1·B2·B3. 이번 회차에서 PLAN 전체와 코드를 다시 대조했다.
실행: 이 역할의 셸은 grep 계열(Grep 도구)과 읽기만 허용되어, 테스트·빌드·`git diff`·`claude plugin validate`는 실행하지 않았다. 아래 "직접 확인"은 Grep 도구와 파일 읽기로 한 것이다.

## 1회차 차단 항목 해소 확인

| 항목 | 상태 | 근거 |
|---|---|---|
| B1 같은 세션 재선택 | **해소** | T2 파일 목록에 `src/App.tsx` 추가. `pickSeq` 설계는 실제 코드와 맞다: 클릭 핸들러 `App.tsx:202`(`setSelected`는 이 한 곳뿐), `<Chat>` 사용처 `App.tsx:225`(이 한 곳뿐), `cur`는 `App.tsx:172`. 의존성 `[session?.id, pickSeq]`로 같은 세션 재클릭을 잡는다. 위험 7 교체, QA 7 추가 확인. |
| B2 `\\?\` 반환 | **해소** | 택 (a) 확정. `strip_verbatim_disk`는 `chat_open_folder`에서만 `check_cwd` 앞에 쓰이고, `check_cwd`·`spawn_with`는 벗기지 않는다. 근거: `roadmap.rs:351`이 `\\?\C:\x`를 `local_abs` 거부로 고정하고 있어(직접 읽음) `check_cwd`의 `\\?\C:\Windows` 거부 테스트가 그대로 유효하다. 위험 4 교체. |
| B3 검증 명령 | **해소** | T2(2) 패턴이 `chat_open_folder|chat_send`로 고쳐졌다. 직접 확인: 1회차 패턴(`\|`)은 `Chat.tsx`에서 0건, 고친 패턴은 `chat_send` 1건(205행)을 잡는다(신규 커맨드 추가 후 2건 이상이 된다). T1(7) `node --test harness/hooks/gate.test.mjs`, T1(6) `git diff main -- package.json`, QA 4 cwd 확인(기준 12), QA 9 자동 테스트 재확인 모두 들어갔다. |
| R1 위험 8 문장 | 반영 | "`새 대화` 후에도 `picked`·`folder`가 남아 다음 대화의 cwd가 된다"로 고쳐졌다. |
| R2·R3 `picking` | 반영 | 버튼 `disabled={running || picking}`, `canSend`에 `!picking`. |
| R4 정규화 근거 | 반영 | 설계 2번 4번째 항목(`canonicalize` 불사용 이유). |
| R5 오류 경로 | 범위 밖으로 명시 | 위험 10. 아래 권고에 한 줄만 남긴다. |

## 1. 목표 덮기

| 기준 | 상태 | 근거 |
|---|---|---|
| 1 `npm run build` | 통과 | T2(1) |
| 2 `cargo test` + 경로 테스트 | 통과 | T1(3). `check_cwd_rejects_bad_and_accepts_dir`가 없는 경로·파일·빈 값·정상 디렉터리를 모두 덮는다. |
| 3 `node --test …gate.test.mjs` | 통과 | T1(7), QA 9. 파일 존재 확인(harness/hooks/gate.test.mjs). |
| 4 capabilities 빈 diff | 통과 | T1(5). 실패 시 `dialog:allow-open` 폴백은 위험 1에 있다. |
| 5 Cargo.toml·package.json diff | 통과 | T1(6)(추가 줄이 dialog 한 줄, package.json 빈 diff). |
| 6 프론트에 경로 인자 없음 | 통과 | T2(2). |
| 7 버튼 `btn`, 새 색 없음 | 통과 | T2 버튼 항목, T2(3). `.btn`은 `App.css:139`에 있다. |
| 8 취소 시 무변화 | 통과 | 설계 1번(`Ok(None)`은 stop·set_picked 전에 반환), QA 1 |
| 9 빈 폴더 문구·입력 켜짐 | 통과 | `emptyText` 항목, QA 2 |
| 10 구분선·응답·완료 | 통과 | QA 3 |
| 11 세션 정확히 1개, Lead 노드 | 통과(실행 확인 필요) | QA 4 |
| 12 응답이 그 폴더에서 실행 | 통과 | QA 4(응답 이름 또는 구분선 폴더 이름) |
| 13 실행 중 버튼 비활성 | 통과 | QA 5, `disabled={running || picking}` |
| 14 기존 흐름 회귀 없음 | 통과 | QA 6. `chat_send` 시그니처 불변, `session != ""` 경로 불변. |

## 2. 검증 가능성

- T1 (1)~(7): 명령과 기대 결과가 있다. 실행 확인 필요.
- T2 (1)~(4): `npm run build`, `rg` 패턴(수정본), 색 검사, `pickSeq` 위치 확인. (3)은 "git diff main과 비교"라고만 적혀 있어 기준이 조금 느슨하다(권고 R8).
- T3: `git diff main -- ROADMAP.md` 추가 줄 1줄. 통과.
- QA 1~9: 단계별 조작과 판정 기준이 있다. "잘 동작하는지 확인" 류 없음.

## 3. 경로 실재 (직접 확인)

- `src-tauri/src/chat.rs`: `spawn_with` 67행, 검증 73~79행(빈 값·`local_abs`·`is_dir`, 계획과 일치), 테스트 `spawn_rejects_bad_cwd_without_starting_a_process` 252행. `Chat`은 `#[derive(Default)]`(18행).
- `src-tauri/src/lib.rs`: `mod chat;` 1행, `chat_send` 116행, `chat_reset` 140행, `.plugin(opener)` 147행, `AppState.chat` 23행, `generate_handler!` 214행. 계획과 일치.
- `src-tauri/src/roadmap.rs`: `pub fn local_abs` 127행(Windows는 `Prefix::Disk`만 허용). 테스트 351행이 `\\?\C:\x`를 거부로 고정. 계획 전제와 일치.
- `src/App.tsx`: 클릭 핸들러 202행, `cur` 172행, `<Chat session={cur} />` 225행, `useState` import 있음.
- `src/Chat.tsx`: `chat_send` 205행, `canSend` 175행, `submit` 192~207행, `reset` 214~218행, `emptyText` 220행, `chat-head` 224행, `새 대화` 버튼 226행, `folderName` import 4행.
- `src/types.ts`: `folderName` 43행. `src/App.css`: `.btn` 139행, `--s-2` 10행. `src/Chat.css`: `.chat-head`에 `justify-content: space-between`(3행). 계획의 CSS 전제와 일치.
- `ROADMAP.md`: 마지막 절 "미뤄 둔 작업"이 17행부터 끝까지(21행). 맨 아래에 한 줄 추가하는 T3가 맞다.
- `src-tauri/capabilities/default.json`: `core:default`, `opener:default`만. 계획은 바꾸지 않는다.
- 새로 만드는 것(`check_cwd`, `strip_verbatim_disk`, `picked`, `set_picked`, `chat_open_folder`, `pickSeq`, `picking`, `tauri-plugin-dialog`)은 모두 "새 것"으로 표시돼 있다. 현재 저장소에 `tauri-plugin-dialog`·`chat_open_folder` 참조가 없다(Grep 확인, 기대대로).

## 4. 빠진 연결 (직접 확인)

- 호출부: `Chat` 컴포넌트 사용처는 `App.tsx:225` 한 곳. props 변경 대상과 일치. `setSelected` 사용처는 202행 한 곳.
- `chat_send` 호출부: `Chat.tsx:205` 한 곳. 시그니처 불변이라 다른 호출부 없음.
- `chat::Chat` 생성: `lib.rs:211`(`Chat::default()`), 테스트 `chat.rs:245,253`(`Chat::default()`). 필드 추가에도 `Default` 유지라 깨지지 않는다.
- `chat_reset` 호출: `Chat.tsx:215` 한 곳.
- 설정: `build.rs`는 `tauri_build::build()`만 호출(1회차 확인). 새 커맨드는 capability 없이 웹뷰에서 호출되는 기존 커맨드와 같은 조건이다.
- export: `lib.rs`의 `mod chat`는 비공개 모듈이고, `check_cwd`·`strip_verbatim_disk`는 같은 크레이트 안에서만 쓰이므로 `pub`으로 충분하다.
- 플러그인: `.plugin(tauri_plugin_dialog::init())` 등록이 계획에 있다. `app.dialog()` 호출에 필요한 것이 이것이다.
- package.json: npm 패키지를 넣지 않는다(T1(6)이 확인).
- 빠진 것 없음.

## 5. 웨이브 충돌

- T1(`Cargo.toml`, `Cargo.lock`, `chat.rs`, `lib.rs`), T2(`Chat.tsx`, `App.tsx`), T3(`ROADMAP.md`)은 파일이 겹치지 않는다. 같은 웨이브 병렬 가능. 통과.
- T2는 `chat_open_folder` 문자열과 `pickSeq`만 쓰므로 T1 완료 전에도 `npm run build`는 통과한다. 실제 동작은 합친 뒤 QA가 본다. 의존 표기가 맞다.

## 6. 범위

- 범위 밖 항목(resume, 목록 즐겨찾기, DnD, 경로 입력, 시작 위치, 자동 선택, 사이드카 보안 후속, SPEC 갱신, `set_parent`)은 들어 있지 않다. 통과.
- `strip_verbatim_disk`와 `picking`은 BRIEF 성공 기준 3(`\\?\` 테스트 고정)과 열린 질문 2(실행 중 비활성)·DECISIONS 2번을 만족하기 위한 것이라 범위 안이다. 통과.

## 7. 프로젝트 규칙 (CLAUDE.md)

- capability 0개, CSP 불변: 최소 권한. 통과.
- 경로 처리: 웹뷰 문자열이 cwd가 되지 않는다(Rust에서 고르고 `picked`에 보관). `local_abs` + `is_dir` 재사용. 통과.
- 정규화: `canonicalize` 불사용 이유가 설계 2번에 있다(BRIEF의 "정규화(절대경로화)"는 OS 다이얼로그 결과의 절대경로 모양 검사로 갈음). 근거가 적혀 있어 통과.
- 로그·토큰: 로그에 경로를 찍지 않는다고 적혀 있다. 오류 문구는 고정 문자열. 통과.
- 화면: 폴더 이름은 React 텍스트로 넣는다(`dangerouslySetInnerHTML` 없음). 통과.
- 테스트: 새 분기(`strip_verbatim_disk`, `check_cwd`)는 단위 테스트가 있고, UI 흐름은 QA로 넘어간다. 통과.

## 결정(DECISIONS) 대조

1. 같은 세션 재선택: PLAN은 `pickSeq`로 같은 세션 재클릭에도 폴더를 버린다. DECISIONS 3번과 일치. 통과.
2. `새 대화` 후 `picked`: 고른 폴더가 다음 대화의 cwd로 남는다. DECISIONS 2번과 일치. 통과.
3. `\\?\` 처리: (a) 확정, 테스트 있음. BRIEF 열린 질문 4와 일치. 통과.
4. 실행 중 비활성, 멈춰 있으면 `chat_reset` 후 새 폴더: 설계 3번과 `pickFolder` 흐름이 일치. 통과.
5. 마지막 선택이 이김, 새 세션 자동 선택 없음: 왼쪽 클릭으로 `folder` 비움, 자동 선택 코드 없음. 통과.

## 권고 (실패 아님)

- R6. 다이얼로그가 떠 있는 동안 왼쪽 세션을 누르면, 그 클릭은 `folder`를 비우고 뒤이어 고른 폴더가 `folder`를 채운다. 결과는 "폴더가 이긴다"이고 마지막으로 끝난 선택이 이기므로 DECISIONS와 어긋나지 않는다. 다만 QA 5에 "다이얼로그 중 세션 클릭" 한 줄을 넣으면 동작이 확인된다.
- R7. `chat_send`의 `session == ""` 분기는 한 줄이라 테스트가 필요 없다고 보지만, 원하면 `Chat::default()`에 `set_picked`·`picked`를 넣고 값을 되읽는 3줄짜리 테스트를 T1에 추가해도 된다.
- R8. T2(3)의 "새 색이 없다(`git diff main`과 비교)"는 기준이 모호하다. `git diff main -- src/App.css src/Chat.css`가 비어 있고 색 grep 결과가 1회차와 같다, 로 적으면 판정이 한 가지로 정해진다.
- R5(유지). `fail`이 `end` 항목을 넣어 빈 화면 문구가 사라지고 `새 대화`가 뜬다. 위험 10에 범위 밖으로 적혀 있어 이번 run에서 고치지 않아도 된다.

## 직접 확인 (이번 회차)

- `rg "chat_open_folder\|chat_send" src/Chat.tsx` → 0건(1회차 B3 원인 재확인). 수정 패턴은 `chat_send` 1건을 잡는다.
- `setSelected(` / `<Chat` in `src/`: App.tsx 202·225 각 1건. 다른 사용처 없음.
- `chat_send` 호출: Chat.tsx 205 1건. `chat_reset` 호출: Chat.tsx 215 1건.
- `Chat {` / `Chat::` / `chat::` / `picked` in `src-tauri/`: lib.rs 23·211, chat.rs 18·23·245·253. 필드 추가가 깨뜨릴 리터럴 생성 없음. `AppManifest` 없음.
- `tauri-plugin-dialog` 참조: 없음(추가 전 상태, 기대대로).
- `harness/hooks/gate.test.mjs`: 존재.
- `package.json`: `test` 스크립트 없음(프론트 자동 테스트 없음, 계획은 이를 가정하지 않는다).
- `roadmap.rs` 351행: `\\?\C:\x` 거부 고정(B2 전제 일치).

## 실행 확인 필요

- `rustc --version` ≥ 1.90 (T1 검증 1, 위험 3).
- `FilePath::into_path()` 이름과 반환형, `DialogExt` (컴파일로 확인, 위험 2).
- capability 0개로 다이얼로그가 뜨는지(위험 1, 실제 앱).
- 기준 11: 대화 후 목록에 세션이 1개만 생기는지(실제 로그 생성).
- `cargo test` 전체, `npm run build`, `node --test harness/hooks/gate.test.mjs`.

VERDICT: PASS
