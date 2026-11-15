# BRIEF — 20261114-gate-commit-binding

## 문제

요청 원문은 "이전 run SECURITY.md의 권고 N1~N4를 닫는다"이다. 실제로 풀어야 할 문제는 이것이다.

> **자동 승인으로 돌아도 main에는 관문이 검토·검증한 바로 그 커밋만 들어가야 한다. main을 움직이는 길은 "관문을 통과한 `orbit/<id>`의 머지" 하나뿐이어야 한다.**

이전 run은 "미통과 run의 브랜치를 머지하는 길"만 닫았다. 남은 길은 세 종류다.
- **통과의 의미가 비어 있음(N1).** 관문 통과는 run 단위의 기록이다. 그 브랜치에 지금 있는 커밋이 검토받은 커밋인지는 보지 않는다. 통과한 옛 run(`orbit/20261114-harness-plugin`, 이 저장소에 실제로 있다)에 미검토 커밋을 머지한 뒤 main에 넣으면 열린다. Lead 혼자서, 평범한 switch·merge만으로 가능하다.
- **main이 머지 말고도 움직임(N2·N3).** main 위에서 commit·cherry-pick·revert를 하거나, `.git/refs`를 직접 쓰거나, `--git-dir`·`GIT_DIR`·`Push-Location`·`rebase --root main`으로 다른 곳에서 main을 옮기면 된다.
- **읽기 명령이 코드를 실행하게 됨(N4).** 에이전트가 `~/.gitconfig`에 `core.fsmonitor`를 쓰면 Lead의 `git status`가 그 스크립트를 실행한다. 영향이 사용자의 모든 저장소에 미친다.

N1은 문자열 검사로는 닫히지 않는다. git 쪽 `reference-transaction` 훅으로도 닫히지 않는다(같은 `check ship`을 부르기 때문). 관문 통과를 **커밋 해시에 묶어야** 닫힌다. 이것이 이번 run의 핵심이다. N2~N4는 같은 파일 안의 작은 변경이라 함께 한다.

구조적 제약은 이전 run과 같다. 고칠 곳(`harness/hooks/gate.mjs`, `gate.test.mjs`)은 관문이 항상 막는다. 그래서 `RUN_DIR/kit/`에 수정본과 `APPLY.md`를 두고 사람이 Claude 밖에서 적용·커밋한다.

## 누구를 위한 것

- **1차: 오르빗 저장소의 사용자(DK).** 지금은 기본 모드(확인 창)라 권고 수준이다. 이번 run의 목적은 자동 승인을 켜도 되는 상태를 만드는 것이다. 이전 run의 ship 기록에 "그때까지 자동 승인 모드는 켜지 않는 전제"가 걸려 있다.
- **2차: 오르빗 제품 사용자.** 제품 ⑥이 이 플러그인을 남의 저장소에 자동 승인으로 투입할 때 같은 보장을 받는다. 제품 코드는 건드리지 않는다.

## 범위 안

갈래 표기: **K**는 키트(`kit/gate.mjs`, `kit/gate.test.mjs`, `kit/APPLY.md`)로 만들고 사람이 적용한다. **A**는 에이전트가 직접 고친다(`harness/agents/*.md`, `harness/skills/orbit/**`).

| id | 이번에 하는 것 | 갈래 |
|---|---|---|
| N1 | **검토 커밋 묶기.** qa는 VERIFY.md에, security는 SECURITY.md에 검증한 커밋을 `COMMIT: <40자리 hex>` 줄로 적는다(작업 트리가 깨끗한 상태의 `git rev-parse HEAD`). 출고 판정(훅의 ship 판정과 `check ship` CLI)은 대상 커밋이 트랙의 필수 산출물 중 COMMIT을 적는 것 전부와 같은지 본다. 대상 커밋은 명령이 가리키는 `orbit/<id>`의 현재 해시다. ref가 없는 push·publish는 현재 HEAD다. 줄이 없거나, 형식이 틀리거나, 산출물끼리 다르거나, 대상과 다르면 차단한다. 묶은 커밋 뒤에 붙은 커밋의 처리는 Q1을 따른다 | K + A(qa.md, security.md, gate/SKILL.md, router의 출고 단계) |
| N2-a | **`.git/` 전체 보호.** Edit·Write·NotebookEdit로 어느 깊이의 `.git/` 아래(그리고 worktree의 `.git` 파일)도 모든 역할이 쓸 수 없다. `.gitignore`·`.gitattributes`는 해당하지 않는다 | K |
| N2-b | **main/master 위의 git은 읽기만.** 현재 브랜치(또는 명령이 옮겨 가는 곳)가 main/master이면 git 하위 명령은 허용 목록만 통과한다. 목록: status, log, diff, show, rev-parse, ls-files, blame, branch(목록·`--show-current`), worktree list, fetch(main을 대상으로 하지 않는 것), switch/checkout으로 다른 브랜치로 가기(새 브랜치 `-c`/`-b` 포함, 경로 지정 `--` 제외), 그리고 ship 판정을 받는 merge. 그 밖(commit, cherry-pick, am, revert, restore, `checkout <ref> -- 경로`, reset(모든 모드), stash pop/apply, add 등)은 모든 역할에서 차단한다. librarian도 main에서는 add·commit을 못 한다 | K + A(librarian.md, gate/SKILL.md) |
| N2-c | **멈춘 rebase는 run 브랜치로 본다.** HEAD가 떼어져 있어도 `.git/rebase-merge/head-name`(또는 `rebase-apply/head-name`)이 `refs/heads/orbit/…`이면 그 브랜치로 판정한다. 그래야 N2-b가 run 브랜치의 충돌 해결(add·commit·`rebase --continue`)을 막지 않는다. 그 밖의 detached HEAD는 지금처럼 main으로 본다 | K |
| N3 | **위치를 바꾸는 형태 추가.** `--git-dir`, `--work-tree`, `GIT_DIR`, `GIT_WORK_TREE`(PowerShell `$env:` 형태 포함), `Push-Location`, `sl`, `chdir`를 위치 변경으로 본다. 위치를 바꾸는 명령은 지금처럼 보호 브랜치로 판정한다. 예외는 하나다. 대상이 문자 그대로의 경로인 `git -C <경로>`·`cd <경로>`는 그 경로의 브랜치로 판정한다. 이 예외가 없으면 router의 worktree 흐름(`.orbit/wt/<task>`에서 commit)이 N2-b에 막힌다. **rebase**: `--root`가 있으면 첫 위치 인자를, 없으면 두 번째 위치 인자를 "옮길 브랜치"로 본다. 그것이 main/master이면 출고다. 위치 인자는 `--onto`·`-s`·`-X`·`-x`·`--exec` 같은 옵션의 값을 뺀 것이다. upstream 자리의 main(`git rebase main`)은 출고가 아니다 | K |
| N4 | **사용자 git 설정 보호.** Edit·Write로 `~/.gitconfig`, `~/.config/git/` 아래 전부(`XDG_CONFIG_HOME`이 있으면 그 아래 `git/`도)를 모든 역할이 쓸 수 없다. 셸 쪽 `git config` 쓰기는 Q3을 따른다 | K |
| 문서 | gate/SKILL.md "실제 강제 범위"와 잔여 목록을 새 판정에 맞춘다. COMMIT 줄, main 읽기 전용, 위치 변경 목록, 남는 우회를 적는다(Q4의 C2와 같은 일) | A |
| 키트 | `kit/gate.mjs`, `kit/gate.test.mjs`(키트 자리에서 그대로 실행 가능), `kit/APPLY.md`(적용 명령, 확인 명령, 해시로 되돌리기, "적용 뒤 COMMIT 줄이 없는 옛 run은 출고할 수 없음" 안내) | K |

## 범위 밖

- **git 쪽 강제(`reference-transaction`, `core.hooksPath`)와 `ORBIT_GATE=off` 스위치 제거**: Q2. 기본안은 계속 미루는 것이다.
- **승인 기록의 출처(C1), R10, P5 테스트 공백**: Q4.
- **`stage: done`인 run을 `.orbit/current`로 되돌리는 쓰기 차단, 릴리스 뒤 run 브랜치 삭제**: SECURITY가 N1의 보조 수단으로 제안했다. 커밋 묶기만으로 같은 시나리오가 닫히므로 하지 않는다.
- **REVIEW 3회차 P1~P3 문자열 형태**(붙여 쓴 `-m"…"`, 따옴표 친 `"main"`, `feat+orbit/r1`)와 `push origin <sha>:main`: 이미 수용됐다. 다만 N1 대조가 들어가면 결과가 달라질 수 있으므로 SKILL 잔여 목록의 문구는 다시 맞춘다.
- **스크립트·임의 프로그램이 `.git/`나 `~/.gitconfig`를 쓰는 경로**(자유 셸 역할의 `node x.js` 등): 문자열 검사의 한계로 수용한다. 문서에 적는다.
- **시스템 gitconfig, `GIT_CONFIG_GLOBAL`이 가리키는 다른 파일, `include.path`의 대상 파일**: 문서에 잔여로 적는다.
- **main 위의 git 아닌 명령**(빌드·테스트)과 Write: ref를 움직이지 않으므로 그대로 둔다.
- HARNESS.md·CLAUDE.md 본문(사람이 고친다), 제품 코드(`src/`, `src-tauri/`), 브라우저 MCP 와일드카드, 셸 `cat .env`.

## 성공 기준

QA가 그대로 검증한다. "훅 실행"은 `kit/gate.mjs`(적용 뒤에는 `harness/hooks/gate.mjs`)에 페이로드(`agent_type`, `agent_id`, `tool_name`, `tool_input`, `cwd`)를 stdin으로 넣고 종료 코드를 보는 것이다. 2는 BLOCK, 0은 ALLOW다. Lead는 `agent_id`가 없는 페이로드다. 브랜치와 해시가 필요한 사례는 실제 git 임시 저장소에서 한다. 아래 사례는 모두 `gate.test.mjs`에 이름이 붙은 테스트로도 들어간다(테스트 이름에 N1~N4 표기).

**0. 전체와 회귀**
1. `node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs`가 0으로 끝난다. 적용 뒤 `node --test harness/hooks/gate.test.mjs`도 0으로 끝난다. pass 수가 46보다 많다.
2. 기존 테스트에서 지워지거나 기대값이 바뀐 줄은 모두 SUMMARY에 이유와 함께 나열돼 있다(`git diff --unified=0`의 `-` 줄과 대조). 바뀌어도 되는 것은 두 가지뿐이다. 하나는 COMMIT 줄이 생긴 픽스처다. 다른 하나는 main 위에서 쓰기 git을 허용한다고 가정한 사례가 BLOCK으로 바뀐 것이다.
3. 이전 run SECURITY의 H1~H10 재현 22사례가 모두 BLOCK이다.

**N1. 커밋 묶기** (임시 저장소, run A는 full 트랙, PLAN_CHECK·REVIEW·VERIFY·SECURITY 모두 `VERDICT: PASS`, current=A, Lead)
4. VERIFY.md와 SECURITY.md의 `COMMIT:`이 `git rev-parse orbit/A`와 같다. 이때 main에서 `git merge --no-ff orbit/A`는 ALLOW이고, `check ship`은 exit 0이다.
5. 이어서 Lead가 `orbit/A`에서 `git merge orbit/B`를 한다(run 브랜치 안이라 ALLOW). B는 미검토 커밋이다. 그 뒤 main에서 `git merge --no-ff orbit/A`는 BLOCK이고, 사유에 "검토한 커밋과 다름"(해당 뜻의 문구)과 두 해시의 앞 7자리가 나온다. `check ship`은 exit 1이고 같은 사유를 출력한다.
6. `orbit/A`를 지우고 `git switch -c orbit/A orbit/B`로 다시 만든다. 그 뒤 main에서 `git merge orbit/A`는 BLOCK이다.
7. VERIFY.md에 COMMIT 줄이 없으면 BLOCK이다(이전 run들의 산출물이 이 경우다). 줄이 7자리 단축 해시이거나 hex가 아니어도 BLOCK이다. VERIFY와 SECURITY의 COMMIT이 서로 다르면 BLOCK이다. 사유에 어느 산출물인지 나온다.
8. quick 트랙 run은 VERIFY.md의 COMMIT만 본다. standard 트랙 run도 VERIFY.md의 COMMIT만 본다. 둘 다 4·5와 같은 ALLOW/BLOCK 짝이 나온다.
9. ref 없는 형태: engineer가 `orbit/A` 위에서 `git push`를 실행한다. HEAD가 묶은 해시와 같으면 ALLOW이고, 커밋을 하나 더 만든 뒤에는 BLOCK이다. deploy 승인이 있는 `npm publish`도 같은 짝이다.
10. (Q1 기본안을 택한 경우) 묶은 해시 뒤에 librarian이 `CHANGELOG.md`와 `docs/solutions/x.md`만 바꾼 커밋 하나를 더한다. 그래도 main 머지는 ALLOW다. 같은 자리에 `src/a.ts`나 `harness/agents/qa.md`를 바꾼 커밋이 붙으면 BLOCK이다. 묶은 해시가 대상의 조상이 아니면 BLOCK이다.
11. `harness/agents/qa.md`와 `security.md`에 COMMIT 줄을 적으라는 지시가 있다(`grep -n "COMMIT:"`이 각 1줄 이상). `gate/SKILL.md`에 COMMIT 대조가 설명돼 있다.

**N2. main은 머지로만 움직인다** (현재 브랜치 main. "미통과"는 current=new이고 관문이 없는 경우, "통과"는 4번 상태)
12. 미통과 상태든 통과 상태든 BLOCK이다. engineer의 `git cherry-pick orbit/new`, `git commit -am x`, `git checkout orbit/new -- b.txt`, `git restore --source orbit/new b.txt`, `git am x.patch`, `git revert HEAD`, `git reset --soft orbit/new`, `git reset orbit/new`, `git stash pop`. librarian의 `git add src/a.ts`, `git commit -F msg.txt`.
13. engineer의 Write는 BLOCK이다. 대상은 `<repo>/.git/refs/heads/main`, `.git/packed-refs`, `.git/HEAD`, `.git/info/attributes`, `.git/config.worktree`, `.orbit/wt/t1/.git`. engineer의 `.gitignore`·`.gitattributes` Write는 ALLOW다.
14. main에서 ALLOW인 정당한 흐름: 모든 역할의 `git status`, `git log --oneline -5`, `git diff`, `git show HEAD`, `git rev-parse HEAD`. Lead의 `git branch --show-current`, `git switch orbit/new`, `git switch -c orbit/next`. engineer의 `git fetch origin`. 통과 상태에서 librarian의 `git merge --no-ff orbit/A`. 앞의 세 경우(통과 상태의 librarian `switch main`과 머지 포함)는 이전 run의 출고 순서 그대로 돈다.
15. run 브랜치 `orbit/new`에서는 지금처럼 ALLOW다: engineer의 `git commit -am x`, `git cherry-pick abc1234`, `git revert HEAD`, `git reset --hard HEAD~1`, `git stash pop`. librarian의 `git add CHANGELOG.md`와 `git commit -F .orbit/runs/<id>/msg.txt`.
16. 멈춘 rebase: `orbit/new`에서 `git rebase main`이 충돌로 멈춘 상태(HEAD 떼어짐)다. engineer의 `git add a.ts`, `git commit --amend --no-edit`, `git rebase --continue`는 ALLOW다. 같은 명령을 `git switch --detach`로 떼어 놓은 HEAD(진행 중 rebase 없음)에서 실행하면 BLOCK이다.

**N3. 위치 변경과 rebase 대상** (engineer, 브랜치 `orbit/new`, current=new 미통과. `../w`는 main을 체크아웃한 worktree)
17. BLOCK: `git --git-dir=../w/.git --work-tree=../w merge orbit/new`, `GIT_DIR=../w/.git git merge orbit/new`, `$env:GIT_DIR='../w/.git'; git merge orbit/new`(PowerShell 도구), `Push-Location ../w; git merge orbit/new`, `sl ../w; git merge orbit/new`, `GIT_DIR=../w/.git git commit -am x`, `git -C ../w commit -am x`, `cd ../w; git cherry-pick orbit/new`.
18. BLOCK: `git rebase --onto orbit/new --root main`, `git rebase --root main`, `git rebase --onto orbit/new HEAD~1 main`, `git rebase -i --onto orbit/new main~1 master`.
19. ALLOW: `git rebase main`, `git rebase -i main`, `git rebase origin/main`, `git rebase --onto main HEAD~2`, `git merge main`(main을 run 브랜치로 당겨 오기), `git rebase --continue`.
20. worktree 흐름: `.orbit/wt/t1`이 `orbit/new/t1`을 체크아웃한 worktree일 때 engineer의 `git -C .orbit/wt/t1 commit -am x`와 `cd .orbit/wt/t1 && git commit -am x`는 ALLOW다. `cd $d; git commit -am x`처럼 경로를 알 수 없으면 BLOCK이다.
21. 임시 저장소에서 17의 `--git-dir` 사례와 18의 첫 사례를 실제 git으로 실행해 main이 움직이는 것을 확인한 기록이 VERIFY에 있다. 같은 명령을 훅에 넣으면 BLOCK이라는 것도 함께 있다.

**N4. 사용자 git 설정**
22. engineer, qa, Lead의 Write와 Edit는 BLOCK이다. 대상은 `~/.gitconfig`, `~/.config/git/config`, `~/.config/git/attributes`. `XDG_CONFIG_HOME=<tmp>`일 때 `<tmp>/git/config`도 BLOCK이다. engineer의 프로젝트 안 `docs/gitconfig-notes.md` Write는 ALLOW다.
23. (Q3 기본안을 택한 경우) 모든 역할의 `git config --global core.fsmonitor x`, `git config core.hooksPath x`, `git config --file ~/.gitconfig a.b c`는 BLOCK이다. `git config --get user.name`, `git config --list`, `git config -l`은 ALLOW다(Lead·READ_SHELL 역할은 지금처럼 허용 목록 밖이면 BLOCK).

**적용과 실사용**
24. `kit/APPLY.md` 절차대로 사람이 적용·커밋한 뒤 새 세션에서 `claude plugin validate harness`가 0으로 끝난다. 이 run의 qa·security가 COMMIT 줄을 적은 뒤 Lead의 `node "<plugin>/hooks/gate.mjs" check ship`이 exit 0이다.
25. 같은 세션에서 `.orbit/current`를 바꾸지 않고, 옛 run의 판정을 임시 저장소 사본으로 재현한다. COMMIT 줄이 없는 `orbit/20261114-harness-plugin` 상태가 ship BLOCK임을 보인다. 실제 `.orbit/current`는 건드리지 않는다.

## 열린 질문 (사용자가 정할 것)

- **Q1. 커밋 묶기의 범위.** 두 가지를 정해야 한다.
  - (가) **묶은 커밋 뒤에 붙는 커밋.** 이전 run은 security 뒤에 librarian이 기록 커밋(CHANGELOG, docs/solutions)을 만들고 머지했다. 해시를 엄격히 같게 보면 이 흐름이 막힌다. **기본안: 묶은 해시가 대상의 조상이고, 그 뒤 커밋이 `CHANGELOG*`와 `docs/**`만 바꿨으면 허용한다.** 근거: 지금 출고 순서를 바꾸지 않는다. 열리는 범위는 실행되지 않는 문서뿐이다(`*.md` 전체는 아니다. `harness/agents/*.md`와 CLAUDE.md는 프롬프트라 제외). 대안은 엄격히 같게 보고 librarian 기록을 verify 전으로 옮기는 것이다. 코드는 더 작지만 security의 교훈을 기록에 담을 수 없게 된다.
  - (나) **REVIEW.md도 묶을지.** **기본안: 묶지 않는다(VERIFY와 SECURITY만).** 근거: 키트 run은 리뷰 뒤에 사람이 적용 커밋을 만든다. 그래서 리뷰 해시가 출고 커밋과 같을 수 없다. 대가로 "리뷰 PASS 뒤 engineer가 붙인 커밋을 qa·security만 보고 출고"하는 길이 남는다. 이 길은 SKILL에 잔여로 적는다.
- **Q2. git 쪽 강제와 스위치(이전 run의 미룬 후보).**
  - (가) `reference-transaction` 훅(이전 Q4). **기본안: 계속 미룬다.** 근거: N1은 이것으로 닫히지 않는다. 이번 N2·N3로 알려진 형태도 닫힌다. 사용자 저장소 훅과 충돌하는 문제도 그대로다. 다만 문자열 우회(P1~P3, 스크립트 경유)의 근본 해법은 여전히 이것뿐이다. 자동 승인을 켜기 전에 다시 정할 것을 권한다.
  - (나) `ORBIT_GATE=off` 스위치 제거. **기본안: 넣지 않는다.** 근거: 키트 방식에서는 쓸 일이 없다. 그래도 사용자 쪽 `disableAllHooks`가 같은 일을 하므로 지워도 막히는 경로가 거의 없다. settings 파일 쓰기와 셸 문자열은 이미 막혀 있다.
- **Q3. N4의 셸 경로.** 자유 셸 역할(engineer 등)은 Write 없이 `git config --global core.fsmonitor …`나 `git config core.hooksPath …`로 같은 일을 할 수 있다. 이 경로는 이전 S7의 `.git/config` 보호도 비켜 간다. **기본안: 넣는다.** 모든 역할에서 읽기 형태(`--get*`, `--list`/`-l`, `--show-origin`)가 아닌 `git config`를 차단한다(성공 기준 23). 근거: 정규식 하나로 닫히고, 에이전트가 git 설정을 바꿀 정당한 일이 없다. 넣지 않으면 N4는 Write 경로만 닫는다. 대안은 문서에 잔여로만 적는 것이다.
- **Q4. 이전 run의 나머지 후보.** 기본안은 항목마다 다르다.
  - **C2(SKILL이 실제보다 강하게 읽힘): 넣는다.** 출고 판정이 바뀌므로 어차피 고쳐야 하는 문서다.
  - **P5(살아남는 변이: `-F .orbit/...`, `rebase feat main`, 따옴표 형태): 넣는다.** N3에서 rebase 판정을 다시 쓰고 같은 테스트 파일을 고치기 때문이다. `rebase feat main`이 BLOCK인 사례와 `merge -F .orbit/… orbit/<id>`가 ALLOW인 사례만 더한다.
  - **C1(승인 기록을 Lead가 STATE.json에 직접 씀): 미룬다.** 승인 출처를 사람 쪽(오르빗 UI 카드)으로 옮기는 제품 작업이다. 이번 범위는 훅 키트다.
  - **R10(보고 형식 스킬 스파이크): 미룬다.** N1~N4와 무관하다. 서브에이전트 스킬 사전 로드 스파이크가 따로 필요하다.
