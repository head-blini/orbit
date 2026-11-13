---
name: orbit-router
description: Lead(메인 세션)가 코드 변경 요청을 받으면 가장 먼저 쓴다. 요청을 Quick/Standard/Full 트랙으로 분류하고, run을 만들고, 역할 서브에이전트를 순서대로 호출하며 관문을 판정한다.
---

# orbit-router — 요청 분류와 진행

Lead는 조율만 한다. 코드를 읽고 판단할 수는 있지만 고치지 않는다(훅이 막는다).
질문에 답하기, 설명, 조사만 하는 요청은 run 없이 바로 답한다.

## 1. 트랙 선택 (작은 쪽부터 의심)

| 트랙 | 언제 | 순서 |
|---|---|---|
| quick | 버그 하나, 작은 수정, 파일 1~3개 | architect(간단 계획) → engineer → qa |
| standard | 일반 기능 | architect ⇄ plan-checker → engineer ×N → reviewer 패널 → qa → librarian |
| full | 새 프로젝트, 큰 기능, 보안 민감(훅 서버·토큰·settings 수정·파일 감시·외부 입력 파싱) | product → standard 전체 + security(qa 다음) |

애매하면 사용자에게 한 줄로 묻는다. 작업 중 규모가 커지면 트랙을 올리고 STATE.json에 이유를 적는다.

## 2. run 만들기

1. run-id: `YYYYMMDD-짧은-슬러그` (영문 소문자·숫자·하이픈).
2. `.orbit/runs/<run-id>/STATE.json` 작성, `.orbit/current`에 run-id 한 줄.
3. `git switch -c orbit/<run-id>` — 모든 작업은 이 run 브랜치에서 한다. main은 관문 통과 후에만.

```json
{
  "run": "20261114-hook-server",
  "track": "standard",
  "request": "사용자 요청 원문 요약",
  "stage": "plan",
  "loops": { "plan": 0, "review": 0, "debug": 0 },
  "tasks": { "t1": "pending" },
  "history": [{ "stage": "plan", "result": "started", "at": "2026-11-14T05:00:00Z" }]
}
```

`stage`: brief → plan → build → review → verify → security → release → done. 단계가 바뀔 때마다 STATE.json을 갱신한다(Orbit 화면이 이 파일을 읽는다).

## 3. 역할 호출

- 호출 프롬프트는 `orbit-handoff` 형식만 쓴다. 대화 내용을 요약해 넘기지 않는다 — 산출물 경로를 넘긴다.
- 각 역할은 새 컨텍스트의 서브에이전트다. 같은 역할을 다시 부를 때도 새로 부른다.
- build: PLAN.md의 웨이브 단위로, 같은 웨이브의 태스크는 한 메시지에서 engineer를 병렬 호출한다.
  - 기본: 같은 웨이브의 태스크는 서로 다른 파일만 건드리므로 같은 체크아웃(run 브랜치)에서 병렬로 돌린다.
  - worktree 격리(같은 파일을 병렬로 건드려야 하거나 태스크가 클 때만 — worktree마다 `npm install`과 콜드 `cargo build`가 필요해 비싸다): handoff에 `WORKTREE: .orbit/wt/<task>`와 `BRANCH: orbit/<run-id>/<task>`를 준다. 웨이브가 끝나면 Lead가 run 브랜치에서 `git merge --no-ff orbit/<run-id>/<task>`. 충돌은 engineer에게 맡긴다.
- review: diff에 맞는 리뷰어만 병렬 호출 → `orbit-gate`의 병합 규칙으로 REVIEW.md 작성.
  - 항상: reviewer-correctness, reviewer-rules
  - 테스트 대상 로직이 바뀌면: reviewer-tests
  - 새 파일·새 의존성·100줄 넘는 diff면: reviewer-maintainability

## 4. 루프와 한도

| 루프 | 한도 | 넘으면 |
|---|---|---|
| architect ⇄ plan-checker | 3회 | 멈추고 사용자에게 쟁점 보고 |
| reviewer → engineer | 3회 | 멈추고 사용자에게 쟁점 보고 |
| qa 실패 → debugger → engineer | 2회 | 멈추고 사용자에게 보고 |
| security 차단 이슈 → engineer | 2회 | 멈추고 사용자에게 보고 |

횟수는 STATE.json `loops`에 센다. 한도를 넘겼는데 계속 돌리지 않는다.

## 5. 관문 판정

단계를 넘기기 전에 `orbit-gate`대로 `node .claude/hooks/gate.mjs check <관문>`을 실행하고 출력을 그대로 믿는다. 서브에이전트의 "끝났습니다"는 증거가 아니다.

## 6. 끝내기

`check ship`이 전부 PASS면 librarian을 불러 main 머지·문서·배운 것 기록을 맡긴다(quick 트랙은 librarian 없이 사용자에게 머지 여부를 묻는다). 사용자에게는 결과, 증거 위치(VERIFY.md), 남은 위험을 세 줄 안으로 보고한다. push는 사용자가 요청했을 때만.
