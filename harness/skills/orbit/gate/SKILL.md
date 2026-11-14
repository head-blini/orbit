---
name: gate
description: 단계 사이의 관문(Gate) 통과 조건과 판정 방법. Lead가 다음 단계로 넘기기 전, 리뷰 결과를 REVIEW.md로 병합할 때, 머지·푸시 전에 쓴다.
---

# gate — 관문

관문은 이 플러그인의 PreToolUse 훅(`hooks/gate.mjs`)이 강제한다. 이 스킬은 그 규칙의 설명서다. 훅이 막는 범위를 넘어서까지 강제되는 것처럼 믿지 않는다(아래 "실제 강제 범위").

## 확인 방법

Lead는 플러그인의 `gate.mjs`를 이 스킬 문서에 적힌 절대 경로로 실행한다. 훅의 허용 규칙은 **이 gate.mjs의 실제 경로**만 인정한다. 다른 경로의 같은 이름 스크립트는 막힌다.

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check plan      # PLAN_CHECK.md
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check review    # REVIEW.md
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check verify    # VERIFY.md (증거 코드 블록 필수)
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check security  # SECURITY.md
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check ship      # 현재 트랙의 필수 관문 전부
```

위 명령이 전부 실행되지 않으면(막히거나 경로를 못 찾으면) 우회하지 말고, Lead가 해당 산출물을 Read로 열어 마지막 `VERDICT:` 줄과 증거 코드 블록을 직접 확인한다. 이때도 판정은 그 역할의 몫이라 VERDICT 줄을 고치지 않는다.

FAIL이 나오면 다음 단계로 가지 않는다. 산출물의 VERDICT 줄을 Lead가 고쳐서 통과시키지 않는다. 판정은 그 역할만 내린다.

## 트랙별 출고(ship) 조건

| 트랙 | 필수 관문 |
|---|---|
| quick | verify |
| standard | plan, review, verify |
| full | plan, review, verify, security |

## 실제 강제 범위

훅이 막는 것(Edit·Write·NotebookEdit·Bash·PowerShell 호출 직전에 검사). 역할별 권한과 허용 명령의 원본은 `hooks/gate.mjs` 상단의 상수다. 이 문서는 그 설명이다.

- **출고**: `git push` 전부, main/master로 들어가는 `git merge`·`pull`·`rebase`·`reset --hard`, 그 밖의 출고 형태(`gh pr merge`, `update-ref`, `branch -f` 등, `git`을 따옴표로 감싼 형태와 `GIT_CONFIG_*` 환경변수 포함)를 ship 조건 미통과 시 막는다. 명령 안의 `orbit/<id>`(없으면 push 계열에 한해 현재 브랜치)가 현재 run의 id와 같아야 하고, `orbit/<id>`가 아닌 브랜치·id는 항상 차단된다. 머지 명령에 `orbit/<id>`가 아닌 ref가 하나라도 섞이면(연결된 머지 포함) 차단한다. run 브랜치에서 충돌로 멈춘 rebase의 `--continue|--abort|--skip|--quit`는 단독으로 쓰면 출고로 보지 않는다(위치를 바꾸거나 다른 명령과 연결되면 그대로 출고 판정). Lead가 새 quick run을 만들어 그 관문을 통과시키는 경로는 수용한다. run 브랜치 안의 머지는 자유. 사용자 저장소의 git 훅(pre-push 등)은 건드리지 않으므로 터미널에서 사람이 직접 하는 push는 이 관문 밖이다. **1차 감지이며 문자열 우회 가능**하다(변수 조합, `g""it` 따위).
- **게시·배포**: `npm|pnpm|yarn publish`, `cargo publish`, `gh release create`, `vercel|netlify|firebase|wrangler|fly|flyctl … deploy`, `vercel --prod`는 deploy 승인과 ship 조건이 모두 있어야 한다. 목록 밖 도구는 감지하지 못한다. main에서는 항상 차단되므로 run 브랜치에서 실행한다.
- **완료 처리**: verify가 실패한 상태에서 STATE.json을 `stage: "done"`으로 쓰는 것을 막는다.
- **쓰기 주체**: PLAN_CHECK.md는 plan-checker, VERIFY.md는 qa, SECURITY.md는 security, REVIEW.md·STATE.json·`.orbit/current`는 Lead, profile.json은 researcher만 쓴다. team.yaml은 어떤 에이전트도 못 쓴다. STATE.json의 `track`을 낮추는 쓰기도 막는다.
- **보호 경로**: 어느 위치에 있든 `.claude-plugin/`, `hooks/` 아래의 `hooks.json`·`gate.mjs`·`gate.test.mjs`, 실행 중인 gate.mjs가 있는 폴더, `.claude/` 아래 `hooks/` 폴더, `.claude/` 아래 `settings*.json`, `.claude.json`, `.git/hooks/`·`.git/config`는 모든 에이전트가 쓸 수 없다.
- **설정 경로**: CLAUDE.md, CLAUDE.local.md, `.claude/` 폴더 전체, `.mcp.json`은 현재 run이 full 트랙이고 STATE.json의 `approvals`에 `config` 승인이 있을 때만 쓸 수 있다. 그 뒤에도 아래 역할 범위가 적용된다.
- **쓰기 범위**: Lead는 `.orbit/`만. engineer·debugger·devops는 그 밖 전부(`.orbit/` 안에서는 소유자가 정해진 파일 제외). librarian은 `*.md`, `docs/**`, `CHANGELOG*`. designer는 `design/**`. 나머지 역할과 모르는 에이전트는 `.orbit/`만. `.orbit/wt/`는 engineer·debugger·devops만 쓴다. 자동 메모리(`~/.claude/projects/<슬러그>/memory/`)는 Lead만, 현재 프로젝트 폴더의 것만 쓴다(슬러그가 안 맞으면 닫힌다).
- **셸 공통**: 모든 역할에서 `disableAllHooks`·`ORBIT_GATE`를 담은 명령(대소문자 무시)은 읽기 형태여도 항상 차단된다(`git log --grep=orbit_gate` 포함). 관문·설정 파일(`gate.mjs`, `hooks.json`, `.claude-plugin`, `.claude/settings*`, `settings.local.json`)을 언급하는 명령은 읽기·테스트 실행 형태만 허용한다: `git status/log/diff/show`, `node --test <경로>`(옵션 없이), 관문 확인 명령, `grep`·`cat`·`Get-Content`·`Select-String`. 리다이렉션·파이프·연결이 있으면 차단된다.
- **셸**: Lead는 관문 확인 명령과 `git status/log/diff/show/branch(목록·--show-current만)/worktree list/switch/merge`만. librarian은 관문 확인 명령과 `git add/commit/switch/merge/status/log/diff`만. push는 Lead·librarian 모두 허용 목록에 없어 막힌다. 사용자가 push를 원하면 사용자가 직접 실행한다. 읽기 전용 리뷰어와 모르는 에이전트는 `git status/log/diff/show`만(plan-checker는 추가로 `grep`, `claude plugin validate <경로>`). 리다이렉션·파이프로 쓰는 형태는 차단된다.

**강제되지 않는 것(경계는 권한 확인 창과 샌드박스다)**

- qa, security, reviewer-correctness, reviewer-tests, data의 셸. 테스트·스캐너·로컬 DB 실행이 일이고, 테스트 실행은 임의 코드 실행이라 문자열 검사로 가둘 수 없다.
- 셸을 통해 산출물을 위조하는 경로 일부(위 셸 규칙이 닫지 못하는 형태).
- engineer·debugger·devops·qa 등 자유 셸 역할의 관문·설정 파일 쓰기 차단은 문자열 검사라 우회 가능하다. 관문은 작업 트리의 gate.mjs라 브랜치 전환으로 바뀐다. settings는 세션 중 다시 읽혀 `env`(ORBIT_GATE)·`disableAllHooks` 변경이 즉시 적용될 수 있다. 프로젝트 `.claude/agents`는 `orbit:` 이름을 흉내 낼 수 없고, `--agents`·동명 플러그인은 사용자 행위가 필요한 경로라 수용한다.
- 출고 감지의 알려진 잔여 경로: run 브랜치에서 관문을 통과한 run이 `git push origin <sha>:main`으로 다른 커밋을 미는 형태, `git pull`·`rebase`에 `orbit/r1`과 비-orbit ref를 함께 주는 형태는 통과할 수 있다(머지는 위에서 막는다). 반대로 닫힌 쪽의 과차단도 있다: `merge --message "…"`·`--message=…`·`-s`·`-X` 같은 값 있는 옵션, `rebase --continue`에 `-c`·`2>&1`을 붙인 형태는 막힐 수 있다(`-m`·`-F`와 따옴표 친 `"orbit/<id>"`는 허용). 출고로 보지 않는 rebase 옵션은 `--continue|--abort|--skip|--quit` 넷뿐이다. 이 목록을 넓히면 main에서 `git rebase --root` 같은 이력 재작성이 열리는데, 그 변경을 잡는 테스트는 없다(목록을 고칠 때 주의).
- 플러그인 agents·skills 본문 변경. 경로 모양으로 구별되지 않으므로 full 트랙의 reviewer-rules·security가 본다.
- 예산: loop 반복 한도는 Lead가 `budget.loops`와 STATE.json `loops`로 지키는 지시 수준이다. 실행·일별 비용 상한은 오르빗 엔진 몫이다.
- 훅 자체가 실행되지 않는 경우(node 없음, 타임아웃 등)는 Claude Code 동작이라 플러그인이 바꿀 수 없다.

## 디자인 토큰 경고

`design/tokens.json`이 있는 프로젝트에서 PostToolUse 훅(`gate.mjs design-warn`)이 토큰 밖 색·크기 하드코딩을 발견하면 컨텍스트로 경고만 전한다. 막지는 않는다. 이 훅이 없는 설치에서는 designer와 reviewer가 `design-system-guard` 체크리스트로 같은 점검을 한다. 경고를 받으면 토큰으로 바꾸거나, 바꿀 수 없는 이유를 SUMMARY에 적는다.

막혔을 때 우회로를 찾지 않는다. 사유를 읽고 빠진 단계를 수행하거나 사용자에게 보고한다.

## REVIEW.md 병합 규칙 (Lead)

리뷰어들의 최종 메시지를 받아 다음 순서로 합친다.

1. 같은 파일·같은 줄·같은 원인의 지적은 하나로 합치고, 지적한 리뷰어를 모두 적는다.
2. 신뢰도 필터: 리뷰어가 `confidence`를 낮음으로 표시했고 재현 방법이 없는 지적은 "참고"로 내린다.
3. 심각도: **차단**(버그·데이터 손실·보안·계획 미준수) / **수정 권고** / **참고**.
4. 차단이 하나라도 있으면 `VERDICT: FAIL`, 없으면 `VERDICT: PASS`.

2단계 순서를 지킨다: 계획 준수(reviewer-correctness의 spec 항목)가 FAIL이면 품질 지적은 미루고 바로 engineer에게 되돌린다.

## 증거 규칙

"완료"는 명령과 그 출력이 붙어 있을 때만 인정한다. "테스트 통과했습니다"라는 문장은 증거가 아니다. 출력이 길면 마지막 20줄과 종료 코드를 붙인다.
