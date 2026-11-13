---
name: orbit-handoff
description: Lead가 역할 서브에이전트를 호출할 때 쓰는 인계 형식. 역할끼리는 대화가 아니라 .orbit/runs/<run-id>/ 의 산출물 파일로 일을 넘긴다.
---

# orbit-handoff — 산출물로 인계

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

## 누가 무엇을 읽고 쓰는가

| 역할 | 읽는 것 | 쓰는 것 |
|---|---|---|
| product | 요청, SPEC.md | BRIEF.md |
| architect | BRIEF.md(있으면), SPEC.md, 코드 | PLAN.md |
| plan-checker | BRIEF.md, PLAN.md | PLAN_CHECK.md |
| engineer | PLAN.md의 자기 태스크 | 코드 + 커밋, 최종 메시지로 SUMMARY 내용 |
| debugger | VERIFY.md의 실패, 코드 | 수정 + DEBUG.md |
| reviewer-* | PLAN.md, run 브랜치 diff | 최종 메시지로 발견 사항(파일은 Lead가 병합) |
| qa | BRIEF.md/PLAN.md의 목표, 실행 중인 앱 | VERIFY.md |
| security | diff, 설정 파일 | SECURITY.md |
| librarian | run 폴더 전체 | CHANGELOG.md, docs/solutions/*.md, 머지 |

- engineer와 reviewer는 파일 대신 **최종 메시지**로 결과를 돌려준다(worktree에서는 RUN_DIR에 쓸 수 없을 수 있고, 리뷰는 병합이 필요하다). Lead가 받아서 `tasks/<task>/SUMMARY.md`와 `REVIEW.md`로 저장한다. 내용은 고치지 않고 그대로 옮긴다.
- 판정이 필요한 산출물(PLAN_CHECK, REVIEW, VERIFY, SECURITY)은 마지막 줄을 `VERDICT: PASS` 또는 `VERDICT: FAIL`로 끝낸다. 관문 스크립트가 이 줄을 읽는다.

## 산출물 최소 형식

- **BRIEF.md**: 문제 / 누구를 위한 것 / 범위 안 / 범위 밖 / 성공 기준(관찰 가능한 것).
- **PLAN.md**: 목표 / 설계 요지 / 태스크 표(id, 할 일, 파일 경로, 검증 방법, 웨이브, 의존) / 위험.
- **SUMMARY.md**: 바꾼 파일 / 커밋 해시 / 실행한 검증 명령과 출력 / 계획과 달라진 점.
- **VERIFY.md**: 성공 기준마다 — 실행한 명령, 출력(코드 블록), 결과. 출력 없는 "확인함"은 무효.
