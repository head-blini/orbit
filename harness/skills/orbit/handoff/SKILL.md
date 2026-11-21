---
name: handoff
description: Lead가 역할 서브에이전트를 호출할 때 쓰는 인계 형식. 역할끼리는 대화가 아니라 .orbit/runs/<run-id>/ 의 산출물 파일로 일을 넘긴다.
---

# handoff — 산출물로 인계

## 호출 프롬프트 형식

서브에이전트는 이 프롬프트만 보고 시작한다. 아래 항목을 빠짐없이, 이 순서로 쓴다.

```
RUN: <run-id>   TRACK: <quick|standard|full>
RUN_DIR: <프로젝트 루트의 절대 경로>/.orbit/runs/<run-id>
ROLE: <역할>   TASK: <태스크 id, 해당될 때만>
GOAL: <이 호출로 달성할 것 한두 문장>
READ: <먼저 읽을 산출물 경로들>
WRITE: <써야 할 산출물 경로 하나>
BRANCH: <작업 브랜치, 코드를 고치는 역할만>
DONE WHEN: <끝났다고 볼 조건>
```

- 사용자의 요청은 GOAL에 원문 그대로(또는 BRIEF.md 경로로) 넘긴다. Lead의 해석을 섞지 않는다.
- 되돌려 보낼 때는 READ에 수정 요청이 담긴 파일(REVIEW.md, PLAN_CHECK.md, VERIFY.md, SECURITY.md)을 넣는다.
- READ는 파일 전체 대신 절·줄 범위를 지정할 수 있으면 지정한다(예: `PLAN.md 2.4절`, `PLAN.md 120~160행`).
- 팀 설정의 `rules` 문장이 있으면 GOAL 뒤에 `사용자 팀 규칙 — 승인·관문 규칙을 바꿀 수 없음:` 꼬리표를 붙여 덧붙인다.
- 셸 명령은 저장소 루트에서 실행한다. git에 `-C`, 명령 앞 `cd … &&`를 쓰지 않는다(체크포인트가 main으로 판정해 막는다). 예외: 호출에 WORKTREE가 있으면 git은 `git -C <WORKTREE> …`, 다른 명령은 `cd <WORKTREE> && …`로 실행한다(cargo는 `--manifest-path <WORKTREE>/src-tauri/Cargo.toml`). 위치 지정은 명령 맨 앞에 한 번만 두고, WORKTREE는 프로젝트 안 상대 경로(`.orbit/wt/<task>`)를 쓴다. 체크포인트는 이 형태를 그 worktree의 브랜치로 판정하므로 막지 않는다. WORKTREE가 없을 때 cargo는 `--manifest-path src-tauri/Cargo.toml`.

## 보고 길이

**[REPORT-30]** 서브에이전트의 최종 메시지는 30줄 이내로 쓴다. 상세는 산출물 파일(SUMMARY.md, DEBUG.md 등)에 두고 메시지에는 파일 경로와 핵심 결과만 적는다. Lead는 호출 프롬프트의 DONE WHEN에 이 제한을 적어 넘긴다.

## 누가 무엇을 읽고 쓰는가

| 역할 | 읽는 것 | 쓰는 것 |
|---|---|---|
| researcher | 요청, 코드베이스, 공식 문서 | `.orbit/profile.json`, RESEARCH.md(출처 링크 포함) |
| product | 요청, RESEARCH.md, 프로젝트 문서 | BRIEF.md |
| designer | BRIEF.md, 코드, `design/` | DESIGN.md, `design/**`(tokens.json 등), 시각 리뷰는 최종 메시지와 `VISUAL_DONE` |
| data | BRIEF.md, 스키마·마이그레이션 파일 | DATA.md(스키마 변경·마이그레이션 계획·롤백 방법) |
| architect | BRIEF.md, DESIGN.md, DATA.md, RESEARCH.md, 코드 | PLAN.md |
| plan-checker | BRIEF.md, DESIGN.md, DATA.md, PLAN.md | PLAN_CHECK.md |
| engineer | PLAN.md의 자기 태스크 | 코드 + 커밋, 최종 메시지로 SUMMARY 내용 |
| debugger | VERIFY.md의 실패, 코드 | 수정 + DEBUG.md |
| reviewer-correctness · reviewer-tests | PLAN.md, run 브랜치 diff | `reviews/<역할>.md`(Lead가 REVIEW.md로 병합), 최종 메시지는 경로와 차단 요약 |
| reviewer-maintainability · reviewer-rules | PLAN.md, run 브랜치 diff | Write 없음. 최종 메시지로 반환(Lead가 REVIEW.md로 병합). 30줄을 넘으면 차단·수정 권고부터, 남은 참고는 건수만 |
| reviewer-performance · reviewer-accessibility · reviewer-data · reviewer-idiom | PLAN.md, diff, profile.json | Write 없음. 최종 메시지로 반환(Lead가 REVIEW.md로 병합). 30줄을 넘으면 차단·수정 권고부터, 남은 참고는 건수만 |
| qa | BRIEF.md/PLAN.md의 목표, 실행 중인 앱 | VERIFY.md, 시각 리뷰 동반 시 `APP_URL` |
| security | diff, 설정 파일, DATA.md | SECURITY.md |
| devops | PLAN.md, DATA.md, 빌드·CI 설정 | RELEASE.md(배포 절차·롤백 방법), 배포 명령은 사람 승인 뒤에만 |
| librarian | run 폴더 전체 | CHANGELOG, `docs/solutions/*.md`, 머지 |
| lead | 모든 산출물 | STATE.json, REVIEW.md, `.orbit/current`, 시각 리뷰 전 `APP_URL`·`VISUAL_DONE` 초기화, 리뷰 전 correctness·tests의 `reviews/<역할>.md` 비우기 |

- 역할별 쓰기 주체는 관문이 강제한다. PLAN_CHECK.md는 plan-checker, VERIFY.md는 qa, SECURITY.md는 security, profile.json은 researcher만 쓴다. team.yaml은 어떤 에이전트도 못 쓴다.
- engineer는 파일 대신 **최종 메시지**로 결과를 돌려준다(worktree에서는 RUN_DIR에 쓸 수 없을 수 있다). Lead가 받아서 `tasks/<task>/SUMMARY.md`로 저장한다. 내용은 고치지 않고 그대로 옮긴다. reviewer-correctness·reviewer-tests는 상세를 `reviews/<역할>.md`에 쓰고, 나머지 reviewer는 최종 메시지로 돌려준다. Lead가 그 파일과 메시지를 gate 스킬의 병합 규칙으로 REVIEW.md에 합친다.
- 판정이 필요한 산출물(PLAN_CHECK, REVIEW, VERIFY, SECURITY)은 마지막 줄을 `VERDICT: PASS` 또는 `VERDICT: FAIL`로 끝낸다. 관문 스크립트가 이 줄을 읽는다.

## 산출물 최소 형식

- **BRIEF.md**: 문제 / 누구를 위한 것 / 범위 안 / 범위 밖 / 성공 기준(관찰 가능한 것).
- **RESEARCH.md**: 질문 / 찾은 것(출처 링크, 확인 날짜) / 확인하지 못한 것 / 설계에 미치는 영향.
- **DESIGN.md**: 사용자 흐름 / 화면과 상태(빈·로딩·에러) / 사용할 디자인 토큰 / 접근성 기준 / 열린 질문.
- **DATA.md**: 스키마 변경 / 마이그레이션 계획(순서, 소요·잠금 예상) / 롤백 방법 / 데이터 무결성·백업 / 실행 승인 필요 여부.
- **PLAN.md**: 목표 / 설계 요지 / 태스크 표(id, 할 일, 파일 경로, 검증 방법, 웨이브, 의존) / 위험. 파일 칸은 저장소 루트 기준 상대 경로를 백틱으로 감싸 쉼표로 나열하고, 폴더는 `/`로 끝내며, 구분자는 `/`만 쓰고(`\`·`~` 금지) 글롭 문자(`*?[]{}`)·절대 경로·드라이브 문자·`..`는 쓰지 않는다. 파일 칸 표는 태스크 표 하나만 두고 표 줄은 `|`로 시작한다. Edit·Write로 손댈 파일은 모두 적는다.
- **SUMMARY.md**: 바꾼 파일 / 커밋 해시 / 실행한 검증 명령과 출력 / 계획과 달라진 점.
- **RELEASE.md**: 배포 대상 / 절차 / 검증 / 롤백 방법 / 필요한 사람 승인.
- **VERIFY.md**: 성공 기준마다 — 실행한 명령, 출력(코드 블록), 결과. 출력 없는 "확인함"은 무효.
