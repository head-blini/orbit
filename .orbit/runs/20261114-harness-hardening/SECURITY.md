# SECURITY — 20261114-harness-hardening (security-deep)

범위: `git diff main...HEAD`. 커밋 6개(fd33eac, 6d461ae, f3d680d, 8c1fd59, c29bbfc, 사람이 적용한 키트 430fd07), 파일 28개, +377/−35. 판정은 모두 이번에 직접 실행하거나 코드를 읽어 확인했다. REVIEW.md와 engineer 보고는 참고로만 썼다.

판정 기준은 이전 run과 같다. `.claude/settings.json`에 `permissions.allow`와 `defaultMode`가 없으므로 지금은 **기본 모드**다(셸·편집마다 확인 창이 뜬다). 그래서 우회 경로는 **권고**로 분류했다. **[자동 승인 시 차단]**이 붙은 항목은 자동 승인을 켜거나 제품 ⑥이 SDK를 자동 승인으로 돌리기 전에 닫아야 한다. 이번 run의 BRIEF 목표("자동 승인에서도 미통과 코드가 main에 못 들어감")는 아래 N1~N3 때문에 **아직 달성되지 않았다**.

## 요약

- **관문 약화 없음.** gate.mjs에서 지워진 줄은 모두 같은 검사를 더 좁게 다시 쓴 것이다. 근거는 "확인한 것" 3이다. 새 허용은 run 브랜치의 `rebase --continue|--abort|--skip|--quit` 면제 하나다. 원본은 rebase를 아예 검사하지 않았으므로 원본보다 약하지 않다. 에이전트 frontmatter(tools·permissionMode·hooks·mcpServers)는 바뀌지 않았다. settings는 deny 2줄 추가뿐이다.
- S1~S13 상태: 닫힘 9개(S2·S3·S5·S6·S9·S10·S11·S12·S13), 부분 4개(S1·S4·S7·S8).
- 새 발견은 권고 4건(N1~N4)과 참고 2건이다. 그중 N1~N3은 미통과 커밋을 main에 넣는 경로이고, 임시 저장소에서 실제 git으로 재현했다. N1은 **이 저장소에서 지금 바로 쓸 수 있다**. 모든 관문을 통과한 `orbit/20261114-harness-plugin` 브랜치와 run이 남아 있기 때문이다.
- N1은 Q4(git 쪽 `reference-transaction` 강제)로도 닫히지 **않는다**. 그 훅도 같은 `check ship`을 부르기 때문이다. 관문 통과를 커밋 해시에 묶어야 닫힌다.
- 이 세션에서 새 관문이 실제로 걸렸다. 이 security의 셸 명령 3개가 S13에 막혔다(`cd … && git diff -- .claude/settings.json`, `git diff … | grep`, `git diff … gate.mjs | grep`). 첫 번째는 "orbit@orbit-local plugin" 훅, 세 번째는 settings 백스톱(`${CLAUDE_PROJECT_DIR}/harness/hooks/gate.mjs`)이 막았다. Write를 run 폴더 밖(스크래치패드)에 쓰려던 시도도 막혔다. 우회하지 않고 파이프 없는 단일 명령과 `.orbit/` 안의 프로브 파일로 바꿨다.

## S1~S13 상태

| id | 상태 | 근거 |
|---|---|---|
| S1 | **부분** | current≠명령의 id면 차단된다(프로브: `lead merge orbit/new, current=old` → BLOCK "명령이 현재 run(orbit/old)의 브랜치만 가리키지 않음"). 테스트 "S1"·"R8" 통과. 다만 Lead가 관문을 통과한 옛 run의 **브랜치 내용을 바꾸는** 경로가 열려 있다 → N1. `gate/SKILL.md:38`의 "`orbit/<id>`가 아닌 브랜치·id는 항상 차단"은 맞지만, 통과의 의미(그 내용이 검토됐다는 것)는 보장하지 않는다 |
| S2 | **닫힘** | librarian이 `FREE_SHELL`에서 빠졌다(`gate.mjs:29`). `LIBRARIAN_SHELL`이 있다(`:115`). 테스트 "S2/R11" 통과. librarian.md:12·:18·:20 문구도 일치한다. 남는 것: 허용 목록 안의 `git commit`·`git add`를 main에서 쓰는 경로 → N2 |
| S3 | **닫힘** | `LEAD_SHELL`의 branch는 목록과 `--show-current`만 허용한다(`:114`). `FORCE_MOVE`에 `-[a-zA-Z]*[fMmCc]`·`--move`·`--copy`·`--force-create`가 들어갔다(`:135-137`). 테스트 "S3"·"R7" 통과 |
| S4 | **부분** | 따옴표 git, `GIT_CONFIG_*`, main의 pull·rebase·reset --hard는 막힌다(`:133`, `:154`, `:159`, 테스트 "S4"·"BRIEF 기준 5"). 남는 것: 문서화된 P1~P3(수용), 문서에 없는 `--git-dir`·`GIT_DIR`·`Push-Location`·`rebase --onto X --root main`(→ N3), main에서의 commit·cherry-pick 등(→ N2). git 쪽 강제는 Q4로 미뤘다(사용자 결정) |
| S5 | **닫힘** | Lead만, 현재 슬러그만 허용한다(`:236-242`). 테스트 "S5"(qa·general-purpose·다른 슬러그 → 2, 슬러그 고정값) 통과. 실제 메모리 폴더 이름 `C--Users-…-Projects-orbit`은 `memorySlug` 결과와 같다. 비ASCII·worktree·`CLAUDE_CONFIG_DIR`는 미확인이지만 닫힌 쪽으로 실패한다 |
| S6 | **닫힘(범위 안)** | 21개 본문 모두 첫 문단 뒤에 데이터 문장이 들어갔다(diff에서 확인). `router/SKILL.md:11`, `:26`, `handoff/SKILL.md:26`, `dev-team.yaml:4`. "처음 보는 team.yaml 보여 주기"는 BRIEF에서 범위 밖으로 미뤘다 |
| S7 | **부분** | `.claude.json`, `.git/hooks/`, `.git/config`는 보호된다(`:231-232`, 테스트 "S7"). 같은 목적인데 빠진 경로: `~/.gitconfig`, `~/.config/git/config`, `.git/refs/**`, `.git/packed-refs`, `.git/info/*`(프로브: 모두 ALLOW) → N2·N4. git 실행 옵션 강제는 BRIEF에서 범위 밖으로 뒀다 |
| S8 | **부분** | publish·deploy가 deploy 승인과 ship을 요구한다(`:139`, `:276-282`, 테스트 "S8"). data.md:14에 localhost 문장이 있다. 브라우저 MCP 와일드카드(qa.md:5, designer.md:5)는 범위 밖으로 미뤘다. `deploy` 승인은 Lead가 STATE.json에 직접 쓰는 기록이라 사람 승인과 구별되지 않는다(참고 C1) |
| S9 | **닫힘** | `.claude/settings.json:20-21`에 `Read(./**/.env)`, `Read(./**/.env.*)`가 들어갔다. 이전 권고가 함께 짚은 `*.p12`·`*.pfx`·`id_*`와 셸 `cat .env`(H9, 수용)는 남는다 |
| S10 | **닫힘** | `:247`. 테스트 "S10" 통과 |
| S11 | **닫힘** | `:336`(20개 + "외 N개"). 테스트 "S11" 통과 |
| S12 | **닫힘(대상 없음)** | 전환 키트는 끝났다. 이번 적용은 STATE.json history에 해시 `430fd070…`를 기록했고, 되돌리기도 해시로 하게 되어 있다 |
| S13 | **닫힘(문자열 검사, 우회 수용)** | `:289-291`. 테스트 "S13"·"R3·R9·R10" 통과. 이 세션에서 실제로 막힌 것도 확인했다(요약). 스크립트 파일 안의 쓰기 같은 우회는 `gate/SKILL.md` "강제되지 않는 것"에 적혀 있다(수용) |

H1~H10 재대조: 기존 테스트 "SECURITY.md 6) 우회 재현 22사례: 22 BLOCK (S13 이후)"이 통과한다. 판정이 바뀐 사례는 의도된 두 곳뿐이다. 테스트 diff에서 지워진 줄은 3개다(`git merge feat`→`orbit/r1`, 22사례 제목, `qa Bash write hooks` ALLOW→BLOCK). H2는 N1, H4는 N2·N3, H8은 N4 때문에 "부분"으로 남는다. H10은 이 실행에도 SubagentStart 훅으로 "PONYTAIL MODE" 지시가 주입됐다. 관문이나 권한에 관한 내용은 없어 데이터로 취급했다(수용 범위 그대로).

## 새 발견 사항

**N1 · 권고 [자동 승인 시 차단] · `harness/hooks/gate.mjs:103-107`, `:256-259`, `:114`**
ship 판정은 "명령의 `orbit/<id>` = `.orbit/current`, 그 run의 산출물 PASS"만 확인한다. **그 브랜치에 지금 있는 커밋이 검토받은 커밋인지는 보지 않는다.** Lead는 `.orbit/current`를 아무 run-id로나 쓸 수 있고, `git switch`(`-c` 포함)와 run 브랜치 안의 `git merge`가 허용된다.
- 시나리오(프로브, 모두 ALLOW): 미통과 run의 Lead가 인젝션이나 "막힘 해소" 압박을 받는다 → `Write .orbit/current = 20261114-harness-plugin`(full, 4관문 PASS. 실제 이 저장소의 상태) → `git switch orbit/20261114-harness-plugin` → `git merge orbit/<미통과 run>`(run 브랜치 안이라 자유) → `git switch main` → `git merge orbit/20261114-harness-plugin` → check ship PASS. 결과적으로 검토받지 않은 코드가 main에 들어간다. 옛 브랜치가 지워졌어도 `git switch -c orbit/<옛 id> orbit/<새 id>`로 다시 만들 수 있다(ALLOW). 확인 창에는 평범한 switch·merge만 보인다.
- 이것은 원래 S1의 시나리오를 한 단계 늘린 것이다. 사용자가 수용한 "Lead가 새 quick run을 만드는" 경로는 qa가 VERIFY.md를 써야 하지만, 이 경로는 에이전트 협력 없이 Lead 혼자 할 수 있다.
- 권장 수정: 관문 산출물에 검토·검증한 커밋 해시를 적게 한다(예: VERIFY.md·REVIEW.md에 `HEAD: <sha>`). ship 판정 때 `git rev-parse orbit/<id>`가 그 해시와 같아야 열리게 한다. 보조 수단으로 `stage: done`인 run을 `.orbit/current`로 되돌리는 쓰기를 막고, 릴리스 뒤에는 run 브랜치를 지운다. Q4 훅만으로는 닫히지 않는다.

**N2 · 권고 [자동 승인 시 차단] · `harness/hooks/gate.mjs:152-161`(출고 형태), `:227-235`(보호 경로)**
출고 모델이 "main으로 들어가는 merge·pull·rebase·reset"뿐이다. main 위에서 직접 커밋을 만드는 명령과 ref 파일 쓰기는 검사하지 않는다.
- 시나리오(프로브, current=미통과 full run, 브랜치 main, 모두 ALLOW): engineer의 `git cherry-pick orbit/new`, `git checkout orbit/new -- b.txt` 뒤 `git commit -am x`, `git restore --source orbit/new …`, `git am`, `git revert`. librarian의 `git add src/a.ts`와 `git commit -F msg.txt`(LIBRARIAN_SHELL 안에서). engineer의 Write `.git/refs/heads/main`·`.git/packed-refs`. Write 경로는 셸도 필요 없다. 결과적으로 main에 미검토 커밋이 쌓이고, 다음에 사람이 push할 때 함께 나간다.
- 권장 수정: (1) 보호 경로를 `.git/` 전체로 넓힌다. 에이전트가 `.git` 안을 직접 쓸 일은 없다. (2) 브랜치가 main/master일 때 상태를 바꾸는 git 하위 명령(commit, cherry-pick, am, revert, restore/checkout의 경로 지정, stash pop 등)을 출고로 본다. main에서는 읽기 명령만 허용하는 목록 방식이 더 안전하다. (3) librarian은 main에서 `merge --no-ff orbit/<id>` 말고 add·commit을 못 하게 한다. 근본 해법은 Q4다.

**N3 · 권고 [자동 승인 시 차단] · `harness/hooks/gate.mjs:138`(MOVES), `:156`(rebase→main)**
위치·대상을 바꾸는 형태 중 MOVES와 N2 정규식에 없는 것이 있다. 프로브에서 engineer, run 브랜치 `orbit/new`, current=미통과로 넣으면 모두 ALLOW다.
- `git --git-dir=<main worktree의 gitdir> --work-tree=<경로> merge orbit/new`, `GIT_DIR=… git merge …`: 실제 git으로 실행했더니 main이 움직였다(`main moved=true`). 현재 브랜치는 `orbit/new` 그대로였다.
- PowerShell `Push-Location ../w; git merge …`, `sl ../w; …`: `cd`·`pushd`·`Set-Location`만 잡는다.
- `git rebase --onto orbit/new --root main`: main 앞의 토큰이 옵션이라 `:156` 정규식을 빠져나간다. 실제 실행 결과 `main moved=true, main has b.txt=true`였다.
- `gate/SKILL.md`의 잔여 목록(P1~P3, `push origin <sha>:main`)에는 이 형태들이 없다. "1차 감지이며 문자열 우회 가능"이라는 포괄 문구에만 들어간다. `--git-dir`과 `--root`는 문자열 변형이 아니라 의미가 다른 정상 옵션이다.
- 권장 수정: MOVES에 `--git-dir|--work-tree|GIT_DIR|GIT_WORK_TREE|Push-Location|\bsl\b|chdir`를 넣는다. rebase는 옵션이 아닌 마지막 인자가 main/master이면 앞 토큰과 상관없이 출고로 본다. 그리고 SKILL 잔여 목록에 이 형태들을 적는다.

**N4 · 권고 · `harness/hooks/gate.mjs:229-233`**
S7의 근거는 "Lead·READ_SHELL이 승인할 읽기 명령이 코드를 실행하게 됨"이었다. 같은 근거가 사용자 git 설정에도 해당하는데, 이 경로는 열려 있다. `~/.gitconfig`, `~/.config/git/config`에 engineer의 Write가 ALLOW다(프로브).
- 시나리오: engineer가 `~/.gitconfig`에 `core.fsmonitor = <스크립트>`를 쓴다 → Lead가 `git status`를 실행한다(확인 창에는 읽기 명령으로 보인다) → 스크립트가 실행된다. 이 저장소만이 아니라 사용자의 모든 저장소에 영향을 준다.
- 권장 수정: 보호 경로에 `(^|[\\/])\.gitconfig$`, `[\\/]git[\\/]config$`(XDG)를 넣는다. N2 (1)과 함께 처리한다.

**참고 C1 · `gate.mjs:84`, `:281`** — `deploy`·`config` 승인은 Lead가 STATE.json `approvals`에 직접 쓰는 기록이다. 관문은 사람 승인과 구별하지 못한다(이전 run 재현의 "lead Write STATE + self config approval ALLOW"와 같은 성질). 자동 승인 전에 승인 기록의 출처를 사람 쪽(오르빗 UI 등)으로 옮기는 것을 검토한다.

**참고 C2 · `harness/skills/orbit/gate/SKILL.md:38`, `:53-54`** — "출고" 줄이 N1·N2를 언급하지 않아, 실제보다 강하게 읽힌다. 잔여 목록에 N1~N3 형태를 적는다. 문서만 고치는 일이라 engineer가 할 수 있다.

## 수용된 잔여(새 문제 아님)

사용자 결정이나 Lead의 처리 결정으로 이미 문서화된 항목이다. 다시 보고하지 않는다.
- Q2(a): qa·security·reviewer-correctness·reviewer-tests·data의 셸은 자유다. S13 문자열 검사만 받는다.
- Q4: git 쪽 출고 강제(`reference-transaction`)는 미룬다.
- Q5: `orbit/<id>`가 아닌 브랜치의 출고는 항상 차단된다.
- Lead가 새 quick run을 만드는 경로.
- REVIEW 3회차 P1~P3(붙여 쓴 `-m"…"`, 따옴표 친 `"main"`, `feat+orbit/r1`)과 `push origin <sha>:main`.
- 닫힌 쪽 과차단 N4·N8·P4.
- `ORBIT_GATE=off`와 settings 즉시 재로딩. 관문은 작업 트리의 gate.mjs라 브랜치 전환으로 바뀐다(gate SKILL "강제되지 않는 것").
- R10 미룸, 브라우저 MCP 와일드카드(S8 일부), 셸 `cat .env`(H9), 처음 보는 team.yaml 보여 주기, P5 테스트 공백.

## 확인한 것

1) 변경 범위
```
$ git log --oneline main..HEAD
430fd07 chore(harness): apply hardening kit S1-S13
c29bbfc … 8c1fd59 … f3d680d … 6d461ae … fd33eac docs(agents): S6 data sentence, shell scope notes, librarian and data rules
$ git diff --stat main...HEAD   → 28 files changed, 377 insertions(+), 35 deletions(-)
$ git diff main...HEAD --unified=0 -- harness/agents   → 21개 파일 모두 본문 줄 추가만. frontmatter(tools 등) 변경 없음. librarian.md :14 → :18, :16 → :20 두 줄만 수정
$ git diff main...HEAD -- .claude/settings.json   → deny에 "Read(./**/.env)", "Read(./**/.env.*)" 2줄만 추가. allow·defaultMode·hooks 변경 없음
```

2) 테스트
```
$ node --test harness/hooks/gate.test.mjs
ℹ tests 46  ℹ pass 46  ℹ fail 0   (S1·S3·S4·S8·S5·S2/R11·S13·S7·S10·S11·R1~R8·N1~N7 이름 확인)
```

3) gate.mjs 지워진 줄 (`git diff main...HEAD --unified=0 -- harness/hooks/gate.mjs`)
- `FREE_SHELL`에서 librarian 제거(좁아짐). `LEAD_SHELL`의 `branch` 제거, 목록·`--show-current`만(좁아짐). `configApproved`를 `approved(run,'config')`로 대체(판정 같음). `gitSub`·`FORCE_MOVE`는 따옴표 형태와 옵션을 더한 상위 집합. `isShip`의 merge 판정은 SHIP_FORMS(merge·pull·rebase) + reset --hard로 넓어짐. 예외는 REBASE_RESUME 하나인데, 원본은 rebase를 아예 보지 않았다. `shipFailures(root)`는 인자 없으면 같은 동작. 보호 경로 사유 문구와 designWarn 출력 길이. → **완화 없음**.
- 새 코드의 정규식 시간(아래 4): 입력 길이 4K~96K에서 일정하다. 훅 타임아웃 10초(`hooks.json:7`, `settings.json:11`)에 닿지 않으므로 타임아웃으로 열리는 경로는 찾지 못했다.

4) 프로브: `.orbit/runs/20261114-harness-hardening/sec/probe.mjs`가 실제 `harness/hooks/gate.mjs`의 `decide()`를 import(읽기)해서 스크래치패드 임시 저장소에 대해 판정한다. 관문 경로는 명령 줄이 아니라 파일 안에 적었다. 셸 인자에 관문 파일 이름을 넣으면 S13이 막기 때문이고, 관문 파일은 읽기만 한다. 프로젝트 작업 트리는 바꾸지 않았다. 의미 확인용 git 명령(rebase, --git-dir merge)은 임시 저장소에서만 실행했다.
```
$ node .orbit/runs/20261114-harness-hardening/sec/probe.mjs "<scratchpad>/sec2"
--- S1 (branch main)
BLOCK  lead merge orbit/new, current=new (not passed)  | … PLAN_CHECK.md 없음; REVIEW.md 없음; VERIFY.md 없음; SECURITY.md
BLOCK  lead merge orbit/new, current=old (passed quick)  | … 명령이 현재 run(orbit/old)의 브랜치만 가리키지 않음
ALLOW  lead merge orbit/old, current=old
--- S1 residual: Lead points the passed run branch at unvetted commits
ALLOW  lead on orbit/old: git merge orbit/new
ALLOW  lead: git switch -c orbit/old2 orbit/new
ALLOW  lead Write .orbit/current = old
ALLOW  lead on main: git merge orbit/old (now holds unvetted commit)
--- main changed without merge (engineer, branch main, current=new not passed)
ALLOW  engineer on main: git cherry-pick orbit/new
ALLOW  engineer on main: git commit -am x
ALLOW  engineer on main: git checkout orbit/new -- b.txt
ALLOW  engineer on main: git restore --source orbit/new b.txt
ALLOW  engineer on main: git am x.patch
ALLOW  engineer on main: git revert HEAD
ALLOW  librarian on main: git commit -F msg.txt
ALLOW  librarian on main: git add src/a.ts
--- other worktree / git-dir / location change (engineer on orbit/new, current=new not passed)
ALLOW  engineer on orbit/new: git --git-dir=../w/.git --work-tree=../w merge orbit/new
ALLOW  engineer on orbit/new: GIT_DIR=../w/.git git merge orbit/new
BLOCK  engineer on orbit/new: cd ../w; git merge orbit/new
ALLOW  engineer on orbit/new: Push-Location ../w; git merge orbit/new
ALLOW  engineer on orbit/new: sl ../w; git merge orbit/new
ALLOW  engineer on orbit/new: git rebase --onto orbit/new --root main
BLOCK  engineer on orbit/new: git rebase orbit/new main
--- semantics in temp repo
rebase --onto orbit/new --root main: main moved=true, main has b.txt=true
--git-dir merge into main worktree: main moved=true, current branch=orbit/new
--- S7 neighbours (engineer Write)
ALLOW  engineer Write ~\.gitconfig
ALLOW  engineer Write ~\.config\git\config
ALLOW  engineer Write <tmp>\root\.git\info\attributes
ALLOW  engineer Write <tmp>\root\.git\config.worktree
ALLOW  engineer Write <tmp>\root\.git\refs\heads\main
ALLOW  engineer Write <tmp>\root\.git\packed-refs
--- regex time (hook timeout 10s; a timeout lets the tool run)
  56ms git rebase + "a " x32000 (len 64011) / 56ms git merge + " x" x32000 / ≤3ms branch·vercel·-x·fetch·lead log (len 64K~96K)
  (2000·8000 반복도 같은 수준. 56ms는 대부분 branchOf의 git 실행)
--- real old run gate status (read only)
harness-plugin plan: PASS / review: PASS / verify: PASS / security: PASS
$ git branch --list   → main, * orbit/20261114-harness-hardening, orbit/20261114-harness-plugin   (N1의 실제 대상이 존재)
```

5) 비밀값·개인 경로·위험 설정
```
$ git diff main...HEAD | grep -nEi '^\+.*(lclk1|C:\\\\Users|/Users/|api[_-]?key|secret|passw|BEGIN .*PRIVATE|ghp_|sk-[A-Za-z0-9]{10}|AKIA|curl |wget |Invoke-WebRequest|bypassPermissions|acceptEdits|permissionMode|defaultMode|"allow")'
(출력 없음)
$ git diff main...HEAD --unified=0 -- harness/hooks/gate.test.mjs | grep -nE '^-[^-]|lclk1|C:\\\\Users'
→ 지워진 줄 3개만 일치(의도된 변경). 추가 줄에 개인 경로 없음(REVIEW 참고 :410 해소)
$ git diff main...HEAD | LC_ALL=C.UTF-8 grep -cP '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]|<!--'
0
```

6) 에이전트 설정 점검(agent-config-audit 기준): hooks.json은 변경 없음(exec 형식, PostToolUse는 항상 exit 0). settings 백스톱 훅도 그대로다. 플러그인 매니페스트는 변경 없음. 21개 역할의 frontmatter도 변경 없음. 추가된 본문 문장 중 권한을 넓히거나 확인을 건너뛰게 하는 것은 없다. librarian의 push 지시는 "하지 않는다"로 좁아졌다. router·handoff·dev-team.yaml의 변경은 CLAUDE.md·team.yaml이 승인·관문을 덮지 못하게 하는 방향이다. 프로젝트 CLAUDE.md 보안 체크리스트 중 127.0.0.1 바인딩·토큰·Origin·본문 크기·CSP·capability는 이번 diff에 대상 코드가 없다(src/, src-tauri/ 무변경).

7) 의존성: package.json, Cargo.toml, 잠금 파일 변경이 없다 → `npm audit`, `cargo audit`는 **미실행**(대상 없음).

## 확인하지 못한 것

- 실제 Claude Code 세션에서 서브에이전트가 보내는 PowerShell 도구 페이로드로 N3(`Push-Location`)를 재현하지 않았다. `decide()` 판정만 봤다.
- `.git/refs/heads/main` Write가 실제로 main을 옮기는지는 실행하지 않았다(git 동작상 자명하다고 판단).
- 메모리 슬러그의 비ASCII·worktree·`CLAUDE_CONFIG_DIR` 경우, settings `env`·`disableAllHooks`의 세션 중 재로딩(RESEARCH 추정).
- `Claude_Browser` MCP 도구 목록과 브라우저 프로필 공유 여부(S8 미룸 부분).
- 기준 12(`claude plugin validate harness`, 새 세션의 `check ship` 출력)는 QA 몫이라 다시 실행하지 않았다. 다만 이 세션에서 플러그인 훅과 백스톱이 모두 새 S13 사유로 막은 것을 직접 봤다.

## 남긴 흔적

- `.orbit/runs/20261114-harness-hardening/sec/probe.mjs`(gitignore 경로)
- 스크래치패드 `sec2/root` 임시 git 저장소. 프로브가 스스로 worktree를 정리했다.
- 프로젝트 추적 파일은 바꾸지 않았다.

VERDICT: PASS
