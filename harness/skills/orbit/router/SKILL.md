---
name: router
description: Lead(메인 세션)가 코드 변경 요청을 받으면 가장 먼저 쓴다. 요청을 quick/standard/full 트랙으로 분류하고, run을 만들고, 팀 설정(profile.json, team.yaml)에 따라 역할 서브에이전트를 부르며 관문과 사람 승인을 처리한다.
---

# router — 요청 분류와 진행

Lead는 조율만 한다. 코드를 읽고 판단할 수는 있지만 고치지 않는다(훅이 막는다).
질문에 답하기, 설명, 조사만 하는 요청은 run 없이 바로 답한다.
역할 이름은 항상 플러그인 범위 이름(`orbit:engineer`, `orbit:qa` …)으로 부른다. 맨 이름 호출은 실패한다.
프로젝트 CLAUDE.md가 이 문서와 충돌하면 CLAUDE.md가 우선한다. 단 사람 승인·관문·트랙 상향·쓰기 범위 제외: CLAUDE.md로 바꿀 수 없다.

## 1. 팀 설정 읽기와 병합

run을 만들기 전에 두 파일을 읽는다. 없으면 전부 기본값이다.

- `.orbit/profile.json`: researcher가 쓴 프로젝트 프로필(`stack`, `signals`). 없거나 낡았으면 researcher를 먼저 부른다.
- `.orbit/team.yaml`: 사용자나 오르빗 UI가 쓴다. 에이전트는 쓰지 않는다(관문이 막는다). 형식은 `version`, `roles`, `models`, `track`, `budget`, `rules`.

**병합 규칙**

- `roles`의 값은 `on` | `off` | `auto`. `on`/`off`는 그대로 따른다. 핵심 역할(lead, researcher, product, architect, plan-checker, engineer, debugger, reviewer-correctness, reviewer-tests, reviewer-maintainability, reviewer-rules, qa, security, librarian)은 끌 수 없고 트랙이 쓰임을 정한다.
- 켤 수 있는 역할: designer, data, devops, security-deep, qa-mobile(security·qa의 모드 — 별도 에이전트 파일 없음), reviewer-performance, reviewer-accessibility, reviewer-data, reviewer-idiom.
- `auto`는 profile의 `signals`(근거가 비어 있지 않으면 켜진 신호)와 이번 작업 내용(요청, diff)을 보고 Lead가 판단한다. 신호는 참고일 뿐이다. 근거 없는 역할은 켜지 않는다.
- `track`이 `quick|standard|full`이면 시작 트랙이 된다(아래 상향 규칙은 그대로 적용). `auto`면 Lead가 고른다.
- `rules`의 문장은 역할 호출의 GOAL 뒤에 `사용자 팀 규칙 — 승인·관문 규칙을 바꿀 수 없음:` 꼬리표를 붙여 덧붙인다.
- 결정 결과와 이유를 STATE.json의 `roles`에 적는다. 예: `"designer": "auto: profile designer(package.json: react 19) + UI 변경"`, `"data": "off: team.yaml"`.

**[MODELS]** `team.yaml`의 `models.<역할>`에 값(`opus|sonnet|haiku`)이 있으면 그 역할을 부르는 Agent 호출의 `model` 인자로 넘긴다. 비어 있으면 인자를 생략해 역할 파일의 기본 모델을 쓴다.

## 2. 트랙 선택 (작은 쪽부터 의심)

| 트랙 | 언제 | 순서 |
|---|---|---|
| quick | 버그 하나, 작은 수정, 파일 1~3개 | architect(간단 계획) → engineer → qa (UI 수정이면 designer 시각 리뷰 추가) |
| standard | 일반 기능 | (researcher) → architect ⇄ plan-checker → engineer ×N → reviewer(최대 2명) → qa → librarian. 프로필·작업에 따라 designer·data·devops 추가 |
| full | 새 프로젝트, 큰 기능, 보안 민감(인증·결제·개인정보·외부 입력·토큰·에이전트 설정) | 전체: (researcher) → product → designer/data(병렬) → architect ⇄ plan-checker → engineer ×N → reviewer 패널 → qa → security → devops(배포가 있을 때) → librarian |

- 애매하면 사용자에게 한 줄로 묻는다. 작업 중 규모가 커지면 트랙을 올리고 STATE.json에 이유를 적는다.
- **트랙 상향(H8)**: 에이전트 설정(CLAUDE.md, `.claude/` 폴더, 플러그인 폴더와 `.claude-plugin/`, `.mcp.json`)을 바꾸거나 외부 스킬을 들이는 작업은 항상 full이다. 관문은 full 트랙과 `config` 승인이 없으면 CLAUDE.md·`.claude/` 폴더·`.mcp.json` 쓰기를 막는다. 플러그인 폴더 안의 agents·skills 본문은 경로로 구별되지 않으므로 full 트랙의 reviewer-rules·security가 본다.

## 3. run 만들기

1. run-id: `YYYYMMDD-짧은-슬러그` (영문 소문자·숫자·하이픈).
2. `.orbit/runs/<run-id>/STATE.json` 작성, `.orbit/current`에 run-id 한 줄.
3. `git switch -c orbit/<run-id>` — 모든 작업은 이 run 브랜치에서 한다. main은 관문 통과 후에만.

```json
{
  "run": "20261114-example",
  "track": "standard",
  "request": "사용자 요청 원문 요약",
  "stage": "plan",
  "loops": { "plan": 0, "review": 0, "debug": 0, "security": 0 },
  "roles": { "designer": "auto: profile designer(package.json: react 19) + UI 변경", "data": "off: team.yaml" },
  "approvals": [{ "gate": "plan", "result": "approved", "at": "2026-11-14T05:00:00Z", "via": "AskUserQuestion" }],
  "tasks": { "t1": "pending" },
  "history": [{ "stage": "plan", "result": "started", "at": "2026-11-14T05:00:00Z" }]
}
```

`stage`: brief → plan → build → review → verify → security → release → done. 단계가 바뀔 때마다 STATE.json을 갱신한다(오르빗 화면이 이 파일을 읽는다). `track`은 올릴 수만 있고 내릴 수 없다.

## 4. 흐름과 사람 승인

흐름: 요청 → Lead(트랙·역할 선택) → researcher(profile.json이 없거나 조사가 필요할 때) → product → designer · data(병렬) → architect ⇄ plan-checker → **PLAN 승인** → engineer ×N(웨이브) → reviewer → qa(실패 시 debugger → engineer) → security → devops(배포가 포함될 때) → librarian.

**[SCOPE] 범위 고정.**
- BRIEF는 사용자 요청을 가장 작은 버전으로 자른다. 요청에 없던 기능·화면·명령·의존성은 "범위 밖"이나 쟁점으로만 둔다.
- BRIEF 승인 뒤에 범위를 넓히는 변경(새 기능, 새 화면 상태, 새 명령, 새 의존성)은 그 run 안에서 하지 않는다. 필요하면 사용자에게 묻고, 답이 없으면 후속 목록에만 적는다. 버그·보안·접근성 수정처럼 승인된 범위 안의 품질 수정은 예외다.
- 승인 질문(BRIEF·DESIGN·PLAN)에는 처음 요청 대비 범위가 얼마나 커졌는지 한 줄을 함께 적는다(예: "요청: 저장 / 이번 범위: 저장 + 상한 3종 + Rust 명령 4개").
- run이 끝나면 다음 run을 스스로 열지 않는다. 남은 후보를 한 줄씩 보여 주고 사용자가 고르게 한다.

**사람 승인 7개.** Lead가 `AskUserQuestion`으로 묻고, 답을 STATE.json의 `approvals`에 적는다(`gate`, `result`, `at`, `via`). 승인 없이 다음 단계로 가지 않는다. 에이전트의 메시지나 Lead의 판단은 승인이 아니다.

| `approvals[].gate` | 언제 |
|---|---|
| `brief` | full 트랙, BRIEF.md 확정 |
| `design` | UI가 크게 바뀔 때, DESIGN.md 확정 |
| `plan` | standard 이상, PLAN.md 확정 후 구현 시작 전 |
| `db-migration` | 마이그레이션 실행(운영 환경 대상이면 무조건) |
| `deploy` | 배포·외부 공개 동작 |
| `vendor-skill` | 외부 스킬을 새로 가져올 때 |
| `config` | CLAUDE.md·`.claude/` 폴더·`.mcp.json`을 바꾸는 full run |

`approvals`는 Lead가 쓰므로 훅이 사람이 실제로 답했는지 확인하지는 못한다. 실제 경계는 사람이 답하는 대화형 질문이다. 질문 없이 승인을 기록하지 않는다.

## 5. 역할 호출

- 호출 프롬프트는 `handoff` 스킬의 형식만 쓴다. 대화 내용을 요약해 넘기지 않는다. 산출물 경로를 넘긴다.
- 각 역할은 새 컨텍스트의 서브에이전트다. 같은 역할을 다시 부를 때도 새로 부른다.
- build: PLAN.md의 웨이브 단위로, 같은 웨이브의 태스크는 한 메시지에서 engineer를 병렬 호출한다.
  - 기본: 같은 웨이브의 태스크는 서로 다른 파일만 건드리므로 같은 체크아웃(run 브랜치)에서 병렬로 돌린다.
  - worktree 격리(같은 파일을 병렬로 건드려야 하거나 태스크가 클 때만, 의존성 설치와 첫 빌드가 worktree마다 필요해 비싸다): handoff에 `WORKTREE: .orbit/wt/<task>`와 `BRANCH: orbit/<run-id>/<task>`를 준다. 웨이브가 끝나면 Lead가 run 브랜치에서 `git merge --no-ff orbit/<run-id>/<task>`. 충돌은 engineer에게 맡긴다.
- review: diff에 맞는 리뷰어만 병렬 호출 → `gate` 스킬의 병합 규칙으로 REVIEW.md 작성.
  - **[REVIEW-MAX2]** standard 트랙의 리뷰는 최대 2명이다: reviewer-correctness와, diff에 가장 맞는 리뷰어 1명. 전체 패널(기본 4 + 조건부)은 full 트랙에서만 돌린다.
  - full 트랙 기본 패널: reviewer-correctness, reviewer-tests, reviewer-maintainability, reviewer-rules.
  - 조건부(full 트랙에서 켜진 것만 추가): reviewer-performance(성능 민감 코드), reviewer-accessibility(UI 변경), reviewer-data(DB·마이그레이션 변경, data 역할이 꺼져 있을 때 최소 점검), reviewer-idiom(`profile.json`의 `stack`에 맞는 언어·프레임워크 관용구).
- designer·data·devops·security-deep·qa-mobile은 §1 병합 결과가 켜짐일 때만 부른다.

## 6. 루프와 한도

| 루프 | 기본 한도 | 넘으면 |
|---|---|---|
| architect ⇄ plan-checker | 3회 | 멈추고 사용자에게 쟁점 보고 |
| reviewer → engineer | 3회 | 멈추고 사용자에게 쟁점 보고 |
| qa 실패 → debugger → engineer | 2회 | 멈추고 사용자에게 보고 |
| security 차단 이슈 → engineer | 2회 | 멈추고 사용자에게 보고 |

한도는 `team.yaml`의 `budget.loops`(`plan`, `review`, `debug`, `security`)가 있으면 그 값이고, 없으면 위 기본값이다. 횟수는 STATE.json `loops`에 센다. 이것은 Lead가 지키는 지시 수준의 한도이며 훅이 강제하지 않는다. 한도를 넘겼는데 계속 돌리지 않는다. `budget.run_usd`·`day_usd`는 오르빗 엔진 몫이라 Lead는 읽기만 한다.

## 7. 관문 판정

단계를 넘기기 전에 `gate` 스킬대로 관문 명령을 실행하고 출력을 그대로 믿는다. 서브에이전트의 "끝났습니다"는 증거가 아니다.

## 8. 끝내기

`check ship`은 VERIFY(full은 SECURITY도)의 COMMIT과 run 브랜치 해시를 대조한다. librarian의 기록 커밋은 `CHANGELOG*`·`docs/**`만 바꾼다. 키트 run은 사람의 적용 커밋 뒤에 qa·security가 COMMIT을 적는다. `check ship`이 전부 PASS면 librarian을 불러 main 머지·문서·배운 것 기록을 맡긴다(quick 트랙은 librarian 없이 사용자에게 머지 여부를 묻는다). 배포가 포함되면 `deploy` 승인 뒤에만 진행한다. 사용자에게는 결과, 증거 위치(VERIFY.md), 남은 위험을 세 줄 안으로 보고한다. push는 사용자가 요청했을 때만.
