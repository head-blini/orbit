---
name: gate
description: 단계 사이의 관문(Gate) 통과 조건과 판정 방법. Lead가 다음 단계로 넘기기 전, 리뷰 결과를 REVIEW.md로 병합할 때, 머지·푸시 전에 쓴다.
---

# gate — 관문

관문은 이 플러그인의 PreToolUse 훅(`hooks/gate.mjs`)이 강제한다. 이 스킬은 그 규칙의 설명서다. 훅이 막는 범위를 넘어서까지 강제되는 것처럼 믿지 않는다(아래 "실제 강제 범위").

## 확인 방법

Lead는 플러그인의 `gate.mjs`를 이 스킬 문서에 적힌 절대 경로로 실행한다. 훅의 허용 규칙은 **이 gate.mjs의 실제 경로**만 인정한다. 다른 경로의 같은 이름 스크립트는 막힌다. 변수(`$`) 형태를 글자 그대로 치거나 상대 경로를 쓰면 체크포인트가 막는다. 스킬을 불러 보이는 절대 경로(막힘 메시지에도 적혀 있다)로 실행한다.

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check plan      # PLAN_CHECK.md
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check review    # REVIEW.md
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check verify    # VERIFY.md (증거 코드 블록 필수)
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check security  # SECURITY.md
node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check ship      # 현재 트랙의 필수 관문 전부 + commit 줄(PASS commit <7자리> 또는 FAIL commit: <사유>)
```

위 명령이 전부 실행되지 않으면(막히거나 경로를 못 찾으면) 우회하지 말고, Lead가 해당 산출물을 Read로 열어 마지막 `VERDICT:` 줄과 증거 코드 블록을 직접 확인한다. 이때도 판정은 그 역할의 몫이라 VERDICT 줄을 고치지 않는다.

FAIL이 나오면 다음 단계로 가지 않는다. 산출물의 VERDICT 줄을 Lead가 고쳐서 통과시키지 않는다. 판정은 그 역할만 내린다.

## 트랙별 출고(ship) 조건

| 트랙 | 필수 관문 |
|---|---|
| quick | verify |
| standard | plan, review, verify |
| full | plan, review, verify, security |

## 검토 커밋 묶기(COMMIT)

출고는 관문 통과에 더해, qa·security가 검증한 바로 그 커밋만 나가게 묶는다.

- **적는 이**: qa는 VERIFY.md에, security는 SECURITY.md에 `COMMIT: <40자리 소문자 hex>` 줄을 적는다(마지막 줄이 유효). quick·standard는 VERIFY.md만, full은 둘 다 본다. REVIEW는 묶지 않는다: 리뷰 뒤 붙은 커밋을 qa·security만 보고 출고할 수 있고, 수용한 잔여다.
- **실패하는 경우**: 줄이 없음, 40자리 hex가 아님(단축 해시 포함), VERIFY와 SECURITY의 값이 다름. 사유에 산출물 이름이 나온다.
- **대상**: 명령 안의 `orbit/<id>`를 git과 같은 방식(`rev-parse orbit/<id>^{commit}`, 같은 이름의 태그가 먼저)으로 푼 해시다. `orbit/<id>` 없는 push·publish는 HEAD다. `check ship`은 `orbit/<현재 run id>`를 쓴다.
- **허용**: 대상이 묶은 해시와 같거나, 그 후손이면서 묶은 해시 이후 바뀐 파일이 모두 `CHANGELOG*`(루트)·`docs/**`일 때. 이름 바꾸기는 원래 경로와 새 경로를 모두 본다. 그 밖의 파일(README 포함)을 바꾸면 막힌다. 조상이 아니거나 git 실행이 실패해도 막는다.
- 이 규칙을 적용하기 전에 만든 run은 COMMIT 줄이 없어 출고할 수 없다.

## 실제 강제 범위

훅이 막는 것(Edit·Write·NotebookEdit·Bash·PowerShell 호출 직전에 검사). 역할별 권한과 허용 명령의 원본은 `hooks/gate.mjs` 상단의 상수다. 이 문서는 그 설명이다.

- **출고**: `git push` 전부, main/master로 들어가는 `git merge`·`pull`·`rebase`·`reset --hard`, 그 밖의 출고 형태(`gh pr merge`, `update-ref`, `branch -f` 등, `git`을 따옴표로 감싼 형태와 `GIT_CONFIG_*` 환경변수 포함)를 ship 조건 미통과 시 막는다. 명령 안의 `orbit/<id>`(없으면 push 계열에 한해 현재 브랜치)가 현재 run의 id와 같아야 하고, `orbit/<id>`가 아닌 브랜치·id는 항상 차단된다. 머지 명령에 `orbit/<id>`가 아닌 ref가 하나라도 섞이면(연결된 머지 포함) 차단한다. `rebase`는 옮기는 브랜치(`--root`면 첫 위치 인자, 아니면 둘째)가 main/master일 때만 출고다(`--exec` 등 값 받는 옵션의 값은 세지 않는다). 그래서 `rebase --continue|--abort|--skip|--quit`와 upstream 자리의 main은 출고가 아니다. 한 명령 안에서 위치를 바꾸면(`cd`, `pushd`, `chdir`, `sl`, `Set-Location`, `Push-Location`, `-C`, `--git-dir`, `--work-tree`, `GIT_DIR`, `GIT_WORK_TREE`, `$env:`로 설정한 같은 변수) 지금 브랜치를 믿을 수 없어 main으로 본다. id 판정은 뒤꼬리와 상관없이 `orbit/<id>`를 모아 현재 run과 대조한다(`~0`이 붙은 다른 id도 잡혀 차단). `orbit/<id>` 뒤에 `/`·`~` 등이 붙은 ref(`orbit/r1/x`, `orbit/r1~1`)는 id가 맞아도 run 브랜치로 인정하지 않고 차단한다. 관문을 통과해도 위 COMMIT 대조를 통과해야 한다. Lead가 새 quick run을 만들어 그 관문을 통과시키는 경로는 수용한다. run 브랜치 안의 머지는 자유. 사용자 저장소의 git 훅(pre-push 등)은 건드리지 않으므로 터미널에서 사람이 직접 하는 push는 이 관문 밖이다. **1차 감지이며 문자열 우회 가능**하다(변수 조합, `g""it` 따위).
- **게시·배포**: `npm|pnpm|yarn publish`, `cargo publish`, `gh release create`, `vercel|netlify|firebase|wrangler|fly|flyctl … deploy`, `vercel --prod`는 deploy 승인과 ship 조건이 모두 있어야 한다. 목록 밖 도구는 감지하지 못한다. main에서는 항상 차단되므로 run 브랜치에서 실행한다.
- **완료 처리**: verify가 실패한 상태에서 STATE.json을 `stage: "done"`으로 쓰는 것을 막는다.
- **쓰기 주체**: PLAN_CHECK.md는 plan-checker, VERIFY.md는 qa, SECURITY.md는 security, REVIEW.md·STATE.json·`.orbit/current`는 Lead, profile.json은 researcher만 쓴다. team.yaml은 어떤 에이전트도 못 쓴다. STATE.json의 `track`을 낮추는 쓰기도 막는다.
- **보호 경로**: 어느 위치에 있든 `.claude-plugin/`, `hooks/` 아래의 `hooks.json`·`gate.mjs`·`gate.test.mjs`, 실행 중인 gate.mjs가 있는 폴더, `.claude/` 아래 `hooks/` 폴더, `.claude/` 아래 `settings*.json`, `.claude.json`, `.git/` 아래 전부(어느 깊이든, worktree의 `.git` 파일 포함. `.gitignore`·`.gitattributes`는 열려 있다), `.gitconfig`(위치 무관), `~/.config/git/`, `$XDG_CONFIG_HOME/git/`는 모든 에이전트가 쓸 수 없다.
- **main 읽기 전용(N2-b)**: 모든 역할이 main/master 위에서는 `status|log|diff|show|rev-parse|ls-files|blame`, `worktree list`, `branch`(목록·`--show-current`), main을 갱신하지 않는 `fetch`, 다른 브랜치로 가는 `switch <이름>`(`-c` 허용; `checkout`은 경로 체크아웃과 구분할 수 없어 막힌다), 그리고 위 출고 판정을 통과한 `merge`만 쓸 수 있다. add·commit·reset 등 나머지는 관문 통과와 무관하게 막힌다(librarian의 add·commit은 run 브랜치에서만). 위치 판정: 위치 변경이 있으면 main으로 본다. 예외는 명령 맨 앞의 프로젝트 안 문자 그대로의 경로 `git -C <경로>`·`cd <경로> &&|;`(그 경로의 브랜치로 본다). 떼어진 HEAD는 main으로 본다. 단 `orbit/…`에서 멈춘 rebase는 그 브랜치다.
- **설정 경로**: CLAUDE.md, CLAUDE.local.md, `.claude/` 폴더 전체, `.mcp.json`은 현재 run이 full 트랙이고 STATE.json의 `approvals`에 `config` 승인이 있을 때만 쓸 수 있다. 그 뒤에도 아래 역할 범위가 적용된다.
- **쓰기 범위**: Lead는 `.orbit/`만. engineer·debugger·devops는 그 밖 전부(`.orbit/` 안에서는 소유자가 정해진 파일 제외). librarian은 `*.md`, `docs/**`, `CHANGELOG*`. designer는 `design/**`. 나머지 역할과 모르는 에이전트는 `.orbit/`만. `.orbit/wt/`는 engineer·debugger·devops만 쓴다. 자동 메모리(`~/.claude/projects/<슬러그>/memory/`)는 Lead만, 현재 프로젝트 폴더의 것만 쓴다(슬러그가 안 맞으면 닫힌다).
- **셸 공통**: 모든 역할에서 `disableAllHooks`·`ORBIT_GATE`를 담은 명령(대소문자 무시)은 읽기 형태여도 항상 차단된다(`git log --grep=orbit_gate` 포함). 관문·설정 파일(`gate.mjs`, `hooks.json`, `.claude-plugin`, `.claude/settings*`, `settings.local.json`)을 언급하는 명령은 읽기·테스트 실행 형태만 허용한다: `git status/log/diff/show`, `node --test <경로>`(옵션 없이), 관문 확인 명령, `grep`·`cat`·`Get-Content`·`Select-String`. 리다이렉션·파이프·연결이 있으면 차단된다. 읽기 형태(`--get*`, `--list`, `-l`)가 아닌 `git config`는 모든 역할에서 차단된다.
- **셸**: Lead는 관문 확인 명령과 `git status/log/diff/show/branch(목록·--show-current만)/worktree list/switch/merge`만. librarian은 관문 확인 명령과 `git add/commit/switch/merge/status/log/diff`만(add·commit은 main 밖에서만). push는 Lead·librarian 모두 허용 목록에 없어 막힌다. 사용자가 push를 원하면 사용자가 직접 실행한다. 읽기 전용 리뷰어와 모르는 에이전트는 `git status/log/diff/show`만(plan-checker는 추가로 `grep`, `claude plugin validate <경로>`). 리다이렉션·파이프로 쓰는 형태는 차단된다.

**강제되지 않는 것(경계는 권한 확인 창과 샌드박스다)**

- qa, security, reviewer-correctness, reviewer-tests, data의 셸. 테스트·스캐너·로컬 DB 실행이 일이고, 테스트 실행은 임의 코드 실행이라 문자열 검사로 가둘 수 없다.
- 셸을 통해 산출물을 위조하는 경로 일부(위 셸 규칙이 닫지 못하는 형태).
- engineer·debugger·devops·qa 등 자유 셸 역할의 관문·설정 파일 쓰기 차단은 문자열 검사라 우회 가능하다. 관문은 작업 트리의 gate.mjs라 브랜치 전환으로 바뀐다. settings는 세션 중 다시 읽혀 `env`(ORBIT_GATE)·`disableAllHooks` 변경이 즉시 적용될 수 있다. 프로젝트 `.claude/agents`는 `orbit:` 이름을 흉내 낼 수 없고, `--agents`·동명 플러그인은 사용자 행위가 필요한 경로라 수용한다.
- **COMMIT 묶기의 잔여(수용)**: REVIEW는 묶지 않는다(리뷰 뒤 붙은 커밋을 qa·security만 보고 출고). `docs/**`·`CHANGELOG*` 변경은 다시 검토되지 않는다. 프로젝트 밖 `git -C <다른 clone> merge orbit/<id>`는 COMMIT 대조가 cwd 저장소 기준이다. publish는 HEAD가 아니라 작업 트리를 올리므로 더러운 트리가 HEAD 대조를 통과한다. sha256 저장소는 40자리 규칙 때문에 출고할 수 없다(닫힌 쪽).
- 출고 감지의 알려진 잔여 경로: `git push origin <sha>:main`처럼 refspec 소스가 HEAD·`orbit/<id>`가 아닌 push, 붙여 쓴 `-m"…"`·`--message="…"`(P1) 값 속 구분자가 든 merge(merge 인자 검사만 `-m`·`-F` 값을 걷어낸다), `feat+orbit/r1`처럼 `+ @ , = !`가 앞에 붙은 ref는 통과할 수 있다. rebase는 값 받는 옵션 목록(`--onto`·`-s`·`-X`·`-x`·`--exec` 등) 밖의 옵션(`--empty drop` 등)이 위치 인자 계산을 어긋나게 하고, `heads/main`·`@{-1}` 같은 main 표기는 비껴간다. 근본 해법은 git 쪽 강제(reference-transaction 훅)이며 이번 run에서는 미룸.
- 셸의 `.git/`·`.gitconfig` 쓰기: Write 계열만 막는다. 스크립트·임의 프로그램의 쓰기는 못 막는다(멈춘 rebase의 `head-name` 위조 포함). 시스템 gitconfig, `GIT_CONFIG_GLOBAL`, `include.path`가 가리키는 파일도 보호 경로 밖이다. 셸 호출 사이에 환경변수가 남는지는 확인하지 못했다(남으면 `export GIT_DIR=…`가 위치 변경 검사를 비껴간다).
- 닫힌 쪽 과차단(수용): 위 목록 밖의 main 읽기 명령(`git config --get`, `rev-list`, `stash list`, `remote -v`, `tag -l`), `git` 단어가 든 비git 인자, switch와 다른 git을 한 줄에 묶은 명령, 커밋 메시지(`-m`) 속의 `cd`·`sl`·`chdir`·`Set-Location`·`Push-Location`·`pushd` 단어(걷어내지 않고 원문 전체에 적용하므로 위치 변경으로 읽혀 막힌다; 메시지는 `-F <파일>`로 쓴다), 메시지에 "rebase … main" 꼴이 든 명령(옛 원문 정규식이 그대로 적용된다), main에서의 `git switch -c <새> <시작점>`(인자 둘), `git`이 든 따옴표 문자열 속의 rebase(`bash -c "git rebase …"`), main에서의 `git checkout`(경로 체크아웃과 구분 못 함, `switch`만 허용), 값 있는 `merge --message "…"`·`-s`·`-X`, run 브랜치의 `rebase --exec "make test" main`·`rebase -x make main`처럼 main 앞에 옵션 값이 오는 형태(`rebase main --exec "make test"`처럼 값을 main 뒤에 두면 통과), 메시지에 `git`·merge가 든 명령, run 브랜치의 `git pull --rebase origin main`. 대신 `git fetch origin` 뒤 `git rebase origin/main`, 커밋 메시지는 `-F` 파일로 쓴다. 기존 P2·P3의 main 쪽(따옴표 친 `"main"` 대상, `rebase` 우회)은 main 읽기 전용(N2-b)과 rebase 대상 규칙으로 닫혔다.
- 플러그인 agents·skills 본문 변경. 경로 모양으로 구별되지 않으므로 full 트랙의 reviewer-rules·security가 본다.
- 예산: loop 반복 한도는 Lead가 `budget.loops`와 STATE.json `loops`로 지키는 지시 수준이다. 실행·일별 비용 상한은 오르빗 엔진 몫이다.
- 훅 자체가 실행되지 않는 경우(node 없음, 타임아웃 등)는 Claude Code 동작이라 플러그인이 바꿀 수 없다.

## 디자인 토큰 경고

`design/tokens.json`이 있는 프로젝트에서 PostToolUse 훅(`gate.mjs design-warn`)이 토큰 밖 색·크기 하드코딩을 발견하면 컨텍스트로 경고만 전한다. 막지는 않는다. 이 훅이 없는 설치에서는 designer와 reviewer가 `design-system-guard` 체크리스트로 같은 점검을 한다. 경고를 받으면 토큰으로 바꾸거나, 바꿀 수 없는 이유를 SUMMARY에 적는다.

막혔을 때 우회로를 찾지 않는다. 사유를 읽고 빠진 단계를 수행하거나 사용자에게 보고한다.

## REVIEW.md 병합 규칙 (Lead)

리뷰어들이 쓴 `RUN_DIR/reviews/<역할>.md`를 Read해서 다음 순서로 합친다. 리뷰어의 최종 메시지에는 그 경로와 차단 요약만 있다. 파일이 없거나 비어 있거나 메시지의 차단 요약과 파일의 차단 지적이 맞지 않으면(이전 루프의 파일이 남은 경우 등) 그 리뷰어를 다시 호출한다.

1. 같은 파일·같은 줄·같은 원인의 지적은 하나로 합치고, 지적한 리뷰어를 모두 적는다.
2. 신뢰도 필터: 리뷰어가 `confidence`를 낮음으로 표시했고 재현 방법이 없는 지적은 "참고"로 내린다.
3. 심각도: **차단**(버그·데이터 손실·보안·계획 미준수) / **수정 권고** / **참고**.
4. 차단이 하나라도 있으면 `VERDICT: FAIL`, 없으면 `VERDICT: PASS`.

2단계 순서를 지킨다: 계획 준수(reviewer-correctness의 spec 항목)가 FAIL이면 품질 지적은 미루고 바로 engineer에게 되돌린다.

## 증거 규칙

"완료"는 명령과 그 출력이 붙어 있을 때만 인정한다. "테스트 통과했습니다"라는 문장은 증거가 아니다. 출력이 길면 마지막 20줄과 종료 코드를 붙인다.
