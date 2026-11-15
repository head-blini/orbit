# PLAN — 20261114-gate-commit-binding (full)

## 변경 이력
- v1 (2026-11-14): 최초 작성. BRIEF(승인됨)와 STATE.json `decisions`(Q1가·Q1나·Q2·Q3·Q4 모두 기본안)를 따른다.

## 목표

BRIEF 성공 기준 1~25를 참으로 만든다. 자동 승인 아래에서도 main에는 qa·security가 검증한 바로 그 커밋(그리고 그 뒤 `CHANGELOG*`·`docs/**`만 바꾼 커밋)만 들어간다. main을 움직이는 에이전트의 길은 "관문을 통과한 `orbit/<id>`의 merge" 하나만 남긴다.

거꾸로 내려온 결과, 존재해야 하는 것은 다음과 같다.
- `harness/hooks/gate.mjs`·`gate.test.mjs` 수정본. 관문이 막는 파일이라 `RUN_DIR/kit/gate.mjs`, `kit/gate.test.mjs`에 둔다. 사람용 `kit/APPLY.md`도 둔다(K). kit은 `.orbit/` 안이라 git 밖이다.
- `harness/agents/qa.md`·`security.md`: COMMIT 줄 지시. `librarian.md`: main에서는 merge만 한다(A1).
- `harness/skills/orbit/gate/SKILL.md`: COMMIT 대조, main 읽기 전용, 위치 변경 목록, 잔여 목록(C2). `router/SKILL.md` §8: 출고 단계(A2).

## 설계 요지

### gate.mjs 변경 (줄 번호는 현재 `harness/hooks/gate.mjs` 기준)

| id | 위치 | 변경 |
|---|---|---|
| N1-a | `:23` 뒤 | `const BINDS = ['verify', 'security'];`를 둔다. Q1나에 따라 REVIEW는 묶지 않는다. 트랙의 `SHIP[track]` 중 BINDS에 있는 것만 본다. quick·standard는 verify만, full은 verify와 security다 |
| N1-b | `:108` 뒤 (새 함수 3개, export 안 함) | `rev(dir, ref)`: `execFileSync('git', ['rev-parse','--verify','--quiet', ref+'^{commit}'], {cwd: dir, stdio:['ignore','pipe','ignore']})`. 실패하면 `null`이다. ref에는 `HEAD` 또는 `orbit/<run.id>`만 들어간다(run.id는 `currentRun`이 `^[\w.-]+$`로 검증한다. argv라 셸을 거치지 않는다). **`refs/heads/`를 붙이지 않는다**: 같은 이름의 태그가 있으면 git은 merge 때 태그를 고른다. 판정도 git과 같은 해석을 써야 한다.<br>`commitOf(runDir, gate)`: 파일의 `/^COMMIT:[ \t]*(\S*)[ \t]*$/gm` 중 **마지막** 줄을 쓴다(VERDICT와 같은 규칙). 줄이 없으면 `${GATES[g]}에 COMMIT 줄 없음`, 값이 `/^[0-9a-f]{40}$/`가 아니면 `${GATES[g]}의 COMMIT이 40자리 hex가 아님`을 돌려준다.<br>`commitFailure(run, target, dir)`: ① BINDS 산출물마다 commitOf를 부른다. 오류가 있으면 그대로 돌려준다. ② 값이 둘 이상 다르면 `VERIFY.md(abc1234)와 SECURITY.md(def5678)의 COMMIT이 다름`. ③ target이 `null`이면 `출고 대상 커밋을 알 수 없음`. ④ target === bound이면 `null`. ⑤ `git merge-base --is-ancestor bound target`가 실패하면 `검토한 커밋과 다름 — 검토 <b7>, 대상 <t7> (대상이 검토 커밋의 후손이 아님)`. ⑥ `git diff --no-renames --name-only -z bound target`의 파일 중 `/^(CHANGELOG[^/]*|docs\/.+)$/i`(librarian 규칙 `:267`과 같은 모양)에 맞지 않는 것이 있으면 `검토한 커밋과 다름 — 검토 <b7>, 대상 <t7>: 그 뒤 커밋이 CHANGELOG*·docs/** 밖을 바꿈 (<최대 5개>)`. `--no-renames`가 없으면 `src/a.ts → docs/a.ts` 이름 바꾸기가 docs만 바꾼 것으로 보인다. `-z`를 써야 비ASCII 경로가 따옴표로 바뀌지 않는다. git 실행이 실패하면 사유를 돌려준다(닫힌 쪽) |
| N1-c | `:166` | id 정규식을 `ORBIT_REF = /(?<![\w./-])orbit\/([\w.-]+)(?=$|[\s"':;&|)])/g` 상수로 뺀다. 뒤에 `/`·`~`·`^`·`@`가 붙은 `orbit/r1/t1`·`orbit/r1~1`은 run 브랜치로 인정하지 않는다. 지금은 `orbit/r1/t1`에서 id `r1`을 뽑으므로, main에서 `pull . orbit/r1/t1`을 하면 `orbit/r1` 해시로 대조된다. 이 구멍을 닫는다. ref 형태(merge 등)에서는 id가 없어 `null`이 되고 차단된다 |
| N1-d | `:278-283` (출고 분기) | `shipFailures`가 빈 배열일 때만 `commitFailure(currentRun(root), rev(dir, cmd.match(ORBIT_REF) ? \`orbit/${ids[0]}\` : 'HEAD'), dir)`를 더한다. `dir = whereOf(cmd, cwd, root) ?? cwd`다. 명령에 `orbit/<id>`가 있으면 그 ref의 현재 해시를 쓴다(shipFailures를 통과했으면 모든 id가 run.id다). 없으면(ref 없는 push·publish 대체) HEAD를 쓴다. 사유 앞머리 `머지/푸시/배포 차단 — 관문 미통과:`는 그대로다. `shipFailures`의 시그니처는 바꾸지 않는다. 그래서 기존 `shipFailures(...)` 단위 테스트(`:29-44`)의 기대값도 그대로다 |
| N1-e | `:297-315` `cli` | `what === 'ship'`이면 관문 줄 뒤에 `commitFailure(run, rev(ROOT, \`orbit/${run.id}\`), ROOT)`를 실행한다. 출력은 `FAIL commit: <사유>`(code 1) 또는 `PASS commit <t7>`이다. `check verify` 같은 단일 관문 확인은 바꾸지 않는다 |
| N2-a | `:232`, `:235` | `/(^|[\\/])\.git[\\/](hooks[\\/]|config$)/i` → `/(^|[\\/])\.git([\\/]|$)/i`. 어느 깊이의 `.git/` 아래와 worktree의 `.git` 파일이 막힌다. `.gitignore`·`.gitattributes`·`.github/`는 `.git` 바로 뒤가 구분자나 끝이 아니므로 열려 있다. 사유 문구(`:235`)에 `.git/ 전체·사용자 git 설정`을 넣는다. `수정할 수 없음`은 기존 테스트 단언(`:86-90`, `:97`)이라 유지한다 |
| N4-W | `:227-234` 보호 경로 OR 목록 | 세 줄을 더한다. `/(^|[\\/])\.gitconfig$/i`(위치 무관, `~/.gitconfig` 포함), `/[\\/]\.config[\\/]git([\\/]|$)/i`, `process.env.XDG_CONFIG_HOME && inside(canon(join(resolve(process.env.XDG_CONFIG_HOME), 'git')).path, file)`. 경로 모양으로 보는 기존 방식(`:226` 주석)을 따른다 |
| N2-c | `:123-129` `branchOf` | `symbolic-ref`가 실패하면(HEAD 떼어짐) `git rev-parse --git-dir`(cwd 기준, worktree면 그 worktree의 gitdir)을 한 번 실행한다. 그 아래 `rebase-merge/head-name`, `rebase-apply/head-name`을 차례로 읽는다. 내용이 `^refs/heads/(orbit/[\w./-]+)$`이면 그 브랜치 이름을 돌려준다. 그 밖(읽기 실패 포함)은 지금처럼 `'main'`이다 |
| N2-c' | `:144-145`, `:157-158` | **`REBASE_RESUME`을 지운다.** N2-c 뒤에는 쓸모가 없다. 진짜로 멈춘 rebase는 branchOf가 run 브랜치를 돌려주므로 출고가 아니다. 그냥 떼어진 HEAD는 N2-b가 어차피 막는다. `:157-159`는 `const mv = moves(cmd); if (!SHIP_FORMS.some((n) => gitSub(n).test(cmd)) && …) return false; return mv || …`로 줄인다 |
| N3-a | `:138` `MOVES` | 함수 두 개로 바꾼다. `locates(c) = /\b(cd|pushd|chdir|sl|Set-Location|Push-Location)\b|--git-dir|--work-tree|\bGIT_(DIR|WORK_TREE)\b/i.test(c) \|\| /\s-C\s/.test(c)`(위치 변경), `moves(c) = /\b(switch|checkout)\b/.test(c) \|\| locates(c)`. `i`는 PowerShell의 `push-location`·`SL`·`$env:git_dir`를 잡는다. `-C`는 대소문자를 구분한다. `-c`(설정 덮어쓰기)를 위치 변경으로 오인하지 않기 위해서다. 호출부 `:157`(isShip), `:168`(shipRunId)의 `MOVES.test(cmd)`를 `moves(cmd)`로 바꾼다. 다른 호출부는 없다 |
| N3-b | `:156` rebase 부분 | 정규식을 `rebasesMain(cmd)`로 바꾼다. ① 먼저 cmd의 따옴표 문자열을 내용으로 바꾸되 공백은 `_`로 바꾼다(`--exec "a; b"`가 구분자·토큰을 쪼개지 못하게 한다. 따옴표 친 `"main"`도 잡힌다). ② `${GIT}(?:-[Cc]\s+\S+\s+|-\S+\s+)*rebase\b([^;&|\n]*)`(g)로 rebase마다 인자를 얻는다(`MERGE_ARGS` `:147`과 같은 모양). ③ 토큰을 훑는다. `--onto`·`-s`·`--strategy`·`-X`·`--strategy-option`·`-x`·`--exec` 다음 토큰은 값이라 뺀다. `-`로 시작하는 토큰도 뺀다. ④ 옮길 브랜치는 `--root`가 있으면 첫 위치 인자, 없으면 두 번째다. 그것이 `^(refs/heads/)?(main|master)$`이면 출고다. `fetch … :main` 부분(`:156` 뒤쪽)은 그대로 둔다. 커밋 메시지 속 "rebase … main" 문자열은 더는 걸리지 않는다(git 호출의 rebase만 본다) |
| N3-c | `:171` 뒤 (새 함수) | `whereOf(cmd, cwd, root)`: git이 실행될 위치를 정한다. 모르면 `null`이다. `AT = /^\s*(?:git -C ([\w.\\/:-]+)(?=\s)|cd ([\w.\\/:-]+)\s*(?:&&|;))/`. 맞으면 그 부분을 뗀 나머지에, 안 맞으면 cmd 전체에 `locates`가 있을 때 `null`이다. AT의 경로는 `canon(resolve(cwd, p)).path`가 `canon(resolve(root)).path` **안**일 때만 인정한다. 밖이면 `null`이다(`../w` 같은 바깥 경로에서 git을 실행하지 않는다. CLAUDE.md "경로로 쓸 때 정규화 후 범위 검사"). `-C` 뒤 공백은 소비하지 않는다(lookahead). 그래야 `git -C a -C b`에서 둘째 `-C`가 남아 `null`이 된다. 이 함수는 N2-b와 N1-d의 대상 위치에만 쓴다. **isShip의 "위치를 바꾸면 보호 브랜치" 규칙(`:160`)은 그대로 둔다.** 그래서 기존 `git -C . pull`(`:386`)·`git -C .. rebase --continue`(`:500`) 기대값 2가 바뀌지 않는다 |
| N2-b·N4-S | `:287` 뒤, S13(`:288`) 앞 | `GIT_INV = new RegExp(\`${GIT}(?:-[Cc]\\s+\\S+\\s+|-\\S+\\s+)*([^;&|\\n]*)\`, 'g')`로 명령 안의 git 호출마다 `하위명령 + 인자`(`m.at(-1).trim()`)를 모은다(`subs`).<br>**N4-S (Q3)**: `subs` 중 `/^config\b/`이면서 `CONFIG_READ = /\s(--get[\w-]*|--list|-l)(?=\s|=|$)/`가 없는 것이 있으면 `git config 쓰기는 모든 역할에서 차단 (사용자·저장소 git 설정 보호)`이다.<br>**N2-b**: `subs`가 있으면 위치를 정한다. `subs.length > 1`이고 `switch`·`checkout` 호출이 섞였으면 `null`이다(한 명령 안에서 브랜치가 바뀐다). 아니면 `whereOf(cmd, cwd, root)`다. `null`이거나 `branchOf(위치)`가 `main|master`이면 모든 sub가 `MAIN_READ`를 만족해야 한다. 아니면 `main/master 위에서는 git 읽기·다른 브랜치로 가기·관문을 통과한 merge만 허용 (N2-b): <첫 위반 sub의 첫 단어>`이다.<br>`MAIN_READ = ^((status|log|diff|show|rev-parse|ls-files|blame|merge)\b|worktree list\b|branch(\s+--show-current)?\s*$|fetch\b(?!.*:\+?(refs/heads/)?(main|master)(?![\w./-]))|(switch|checkout)(\s+-[cb])?\s+[^\s-]\S*\s*$)`. merge가 여기까지 왔다면 앞의 출고 판정(`:278`)을 통과한 것이다. 위치가 이 블록보다 뒤라 기존 Lead·READ_SHELL·librarian 사유 문구 단언(`:513-514`, `:519`)이 그대로 산다. git 호출이 없는 명령에서는 branchOf를 실행하지 않는다(빌드·테스트가 느려지지 않는다) |
| 주석 | `:2-8`, `:131-132`, `:144` | 머리 주석에 "출고는 COMMIT 대조, main에서는 읽기 git만"을 더한다. `:131` 주석에 위치 변경 목록을 반영한다. `:144` 주석은 REBASE_RESUME와 함께 지운다 |

**인터페이스**: export는 바뀌지 않는다(`GATES`, `SHIP`, `memorySlug`, `currentRun`, `gateFailure`, `shipFailures`, `decide`, `designWarn`). CLI `check ship`의 출력에 `PASS commit <7자리>` 또는 `FAIL commit: …` 한 줄이 더해진다. **산출물 형식**: VERIFY.md(모든 트랙)와 SECURITY.md(full)에 `COMMIT: <40자리 소문자 hex>` 줄이 생긴다. **gate.mjs 밖 호출부**: 없다(grep: `shipFailures`·`gate.mjs`를 import하는 코드는 `gate.test.mjs`뿐이다. hooks.json·settings.json은 실행 경로만 가리킨다).

### 테스트 (kit/gate.test.mjs)

- 새 픽스처 헬퍼 `shipProject(branch, track, files, state)`: `project(track, {}, state)` → `git init -b main` → 빈 커밋 → `switch -c orbit/r1` → 빈 커밋 → `sha = rev-parse HEAD`. 그 뒤 files를 쓴다. `VERIFY.md`·`SECURITY.md`에는 앞에 `COMMIT: ${sha}\n`을 붙인다. 마지막으로 `branch`로 switch한다. `{ root, sha }`를 돌려준다. git은 `-c user.name=t -c user.email=t@t -c commit.gpgsign=false`로 실행한다(전역 서명 설정에 흔들리지 않게).
- 새 import는 **새 줄로** 더한다. 기존 import 줄을 고치면 `-` 줄이 생긴다.
- 새 테스트 이름은 모두 `cb ` 접두사(commit-binding)와 N 표기를 붙인다. 이전 run의 `N1·N5`·`N2`·`N6·N7`·`N3: design-warn`과 섞이지 않게 하기 위해서다. 목록은 아래 대응표에 있다. 기준마다 허용 대조를 하나 이상 둔다. 훅은 기존 `spawnGate`/`exitOf`로 실제 실행한다. XDG 사례는 `spawnGate`의 `env`로 넘긴다.

### 기존 테스트 중 기대값·픽스처가 바뀌는 것 (BRIEF 기준 2의 두 범주뿐)

**범주 1: COMMIT 줄 픽스처.** 단언은 그대로 두고 픽스처 줄만 `shipProject(...)`로 바꾼다.

| 줄 | 테스트 | 바뀌는 픽스처 | 이유 |
|---|---|---|---|
| `:50` | 머지/푸시는 관문 통과 전까지 | `open` | `:51` merge orbit/r1 ALLOW에 COMMIT 필요 |
| `:109` | CLI는 CLAUDE_PROJECT_DIR 기준 | `root` | `execFileSync`는 exit 1에서 예외를 던진다. `check ship`에 commit 줄이 생겼다 |
| `:296` | R4: check CLI 종료 코드 | `ok` | `:299` exit 0 |
| `:356`, `:361` | S1 | `quick`, `full` | `:359` merge 0, `:363` push 0(HEAD 대조) |
| `:395` | S8 | `ok` | `:401` publish 0(HEAD 대조) |
| `:470`, `:478` | R1 | `quick`, `full` | `:474-475`, `:479` merge 0 |
| `:484` | 정당한 흐름 | `quick` | `:487` librarian merge 0 |
| `:526` | R8 | `full` | `:527` push 0 |
| `:541` | N1·N5 | `quick` | `:545-547` merge 0 |

**범주 2: main 위의 쓰기 git이 BLOCK으로 바뀜.**

| 줄 | 사례 | 전 → 후 | 이유 |
|---|---|---|---|
| `:52` | engineer `git commit -m "merge notes"`(git 아닌 폴더 = main) | null → 차단 | N2-b. 원래 의도("메시지 속 merge는 출고 아님")는 새 테스트 `cb N2-b 기준15`가 run 브랜치에서 같은 명령 ALLOW로 잇는다 |
| `:424` | librarian `git commit -m x`(main) | 0 → 2 | N2-b, BRIEF N2-b "librarian도 main에서는 add·commit 못 함" |
| `:425` | librarian `git add -- docs/a.md`(main) | 0 → 2 | 같은 이유 |
| `:490`(제목), `:494` | R2: rebase 없이 떼어진 HEAD의 `rebase --continue/--abort/--skip/--quit` | 0 → 2 | N2-c: 진행 중 rebase가 없는 detached HEAD는 main이다(기준 16 후반). REBASE_RESUME도 지운다. 제목을 "떼어진 HEAD(진행 중 rebase 없음)는 main으로 본다"로 바꾼다. 진짜로 멈춘 rebase의 ALLOW는 `cb N2-c 기준16`이 맡는다 |
| `:533`(제목), `:536` | `reset --soft HEAD~1`(main) | 0 → 2 | N2-b: reset은 모든 모드를 막는다. 제목의 "reset --soft는 출고 아님"은 "…main에서는 N2-b로 차단"으로 고친다 |
| `:553` | `pull . orbit/r1`(main) | 0 → 2 | N2-b: main 허용 목록에 pull이 없다(merge만). COMMIT 픽스처를 줘도 2다 |

그 밖의 기존 단언은 그대로 통과해야 한다. 22사례(`:126-154`) 포함이다. 검토했지만 바뀌지 않는 것: `:59`(run 브랜치 merge), `:62`·`:386`·`:499-500`(isShip의 위치 변경 규칙 유지), `:374`(Lead `git branch`는 MAIN_READ 안), `:384-385`, `:438-440`(main의 `git diff`는 MAIN_READ 안), `:485-486`, `:513-519`(사유 문구: N2-b가 역할 검사 뒤에 있다), `:558-559`.

### 하지 않는 것
reference-transaction·`ORBIT_GATE=off` 제거(Q2), C1·R10(Q4), `stage: done` run의 current 되돌리기 차단, REVIEW 묶기(Q1나), P1(붙여 쓴 `-m"…"`)·`push <sha>:main` 코드 수정, main의 다른 읽기 명령(`config --get`, `rev-list`, `stash list`, `remote -v` 등) 허용 확장, CLAUDE.md·HARNESS.md.

## 태스크 표

| id | 할 일 | 파일 | 검증 (명령 → 기대) | 웨이브 | 의존 |
|---|---|---|---|---|---|
| K1 | ① 기준선: 원본 두 파일을 Read → Write로 kit에 그대로 복사한다. `Copy-Item … gate.mjs`는 S13에 막히므로 쓰지 않는다. ② **먼저 실패할 테스트**: 위 "테스트" 절의 `shipProject` 헬퍼와 대응표의 `cb …` 테스트 19개를 kit/gate.test.mjs에 넣는다. "기존 테스트 중 바뀌는 것"의 범주 1·2를 그대로 반영한다(그 밖의 기존 줄은 고치지 않는다). ③ 실행해서 새 테스트와 범주 1·2 단언만 FAIL인지 확인한다. kit/gate.mjs는 이 태스크에서 원본 그대로 둔다 | `RUN_DIR/kit/gate.test.mjs`, `RUN_DIR/kit/gate.mjs`(복사만) | `node --test harness/hooks/gate.test.mjs` → `# pass 46`, `# fail 0`(SUMMARY에 기준선). `git diff --no-index --stat harness/hooks/gate.mjs .orbit/runs/20261114-gate-commit-binding/kit/gate.mjs` → 출력 없음. `node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → 실패한 테스트 이름 목록을 SUMMARY에 붙인다. 목록은 `cb` 테스트와 범주 1·2가 든 테스트뿐이어야 한다. `git diff --no-index --unified=0 harness/hooks/gate.test.mjs .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → `-` 줄마다 범주(1/2/제목)와 이유를 SUMMARY 표로 적는다(기준 2) | 1 | — |
| K4 | `kit/APPLY.md`를 쓴다. 아래 "APPLY.md 요건"을 따른다 | `RUN_DIR/kit/APPLY.md` | `grep -n "COMMIT" .orbit/runs/20261114-gate-commit-binding/kit/APPLY.md` → ≥2줄(옛 run 출고 불가 안내, 새 세션 확인). `grep -c "settings.json" …/kit/APPLY.md` → 0(이번 키트는 두 파일뿐) | 1 | — |
| A1 | ① qa.md: VERIFY.md 형식 문단(`:27`) 뒤에 한 문단을 넣는다. 내용: "VERIFY.md에 검증한 커밋을 `COMMIT: <40자리 hex>` 한 줄로 적는다. 값은 작업 트리가 깨끗한 상태(`git status --porcelain --untracked-files=no` 출력 없음)의 `git rev-parse HEAD`다. 검증 중 커밋이 바뀌면 다시 검증하고 줄을 고친다. 줄이 없거나 출고 대상과 다르면 출고가 막힌다." ② security.md: SECURITY.md 형식 문단(`:28`) 뒤에 같은 지시를 넣고, 덧붙인다: "full 트랙에서는 VERIFY.md의 COMMIT과 같아야 출고된다. 다르면 같은 커밋을 다시 점검한다." ③ librarian.md: `:12` 셸 문단에 "main/master에서는 `git switch`·`git merge --no-ff orbit/<run-id>`와 읽기 명령만 된다. add·commit은 관문이 막는다"를 더한다. `:18` 반영 단계에 "문서 커밋은 run 브랜치에서 하고 `CHANGELOG*`·`docs/**`만 바꾼다. 검토 커밋(COMMIT) 뒤에 그 밖의 파일(README 등)을 바꾸면 출고가 막힌다. 그런 수정이 필요하면 반영하지 말고 보고한다"를 더한다. 다른 문장은 고치지 않는다. ④ 커밋: `git add -- harness/agents/qa.md harness/agents/security.md harness/agents/librarian.md` → `git commit -F .orbit/runs/20261114-gate-commit-binding/COMMIT_A1.txt`. 명령 줄과 메시지 파일 경로에 `gate.mjs`·`settings`·`hooks.json`을 쓰지 않는다(S13) | `harness/agents/qa.md`, `harness/agents/security.md`, `harness/agents/librarian.md` | `grep -n "COMMIT:" harness/agents/qa.md harness/agents/security.md` → 각 ≥1줄(기준 11). `grep -n "add·commit은 관문이 막는다" harness/agents/librarian.md` → 1줄. `grep -n "docs/\*\*" harness/agents/librarian.md` → ≥1줄. `claude plugin validate harness` → exit 0. `git log --oneline -1` → A1 커밋 | 1 | — |
| K2 | 설계 요지의 gate.mjs 표 전체(N1-a~e, N2-a, N4-W, N2-c, N2-c', N3-a~c, N2-b·N4-S, 주석)를 kit/gate.mjs에 구현한다. kit/gate.test.mjs는 고치지 않는다. 테스트가 틀렸다고 판단되면 고치지 말고 SUMMARY에 적어 Lead에게 돌려보낸다(K1 재작업) | `RUN_DIR/kit/gate.mjs` | `node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → exit 0, `# fail 0`, `# pass` > 46(기준 1). 출력에서 `cb N1`~`cb N4`, `cb P5`, 22사례 테스트 이름이 보인다. `grep -c "REBASE_RESUME" .orbit/runs/20261114-gate-commit-binding/kit/gate.mjs` → 0. `grep -n "^export" .orbit/runs/20261114-gate-commit-binding/kit/gate.mjs` → 원본과 같은 8개. `git diff --no-index --stat harness/hooks/gate.test.mjs .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → K1 SUMMARY와 같은 숫자(K2가 테스트를 건드리지 않음) | 2 | K1 |
| A2 | K2의 최종 kit/gate.mjs를 읽고 문서를 맞춘다. ① gate/SKILL.md "확인 방법": `check ship`이 `commit` 줄도 출력한다. ② 새 절 "검토 커밋 묶기(COMMIT)": 누가 무엇을 적는가(qa→VERIFY, security→SECURITY, quick·standard는 VERIFY만). 대상(명령 안의 `orbit/<id>`를 git과 같은 방식으로 해석한 해시. ref 없는 push·publish는 HEAD). 후손 허용 조건(`CHANGELOG*`·`docs/**`만, 이름 바꾸기는 양쪽 경로를 본다). 적용 이전 run은 COMMIT이 없어 출고할 수 없다. ③ "실제 강제 범위": 출고 줄에서 rebase 면제 문장을 지운다. rebase 대상 규칙(`--root`면 첫 위치 인자, 아니면 둘째), 위치 변경 목록(`--git-dir`, `--work-tree`, `GIT_DIR`, `GIT_WORK_TREE`, `$env:`, `Push-Location`, `sl`, `chdir`), `orbit/<id>` 뒤에 `/`·`~`가 붙은 ref는 인정하지 않는다는 것을 넣는다. 새 줄 "main 읽기 전용(N2-b)": 허용 목록, 모든 역할, 위치 판정(위치 변경 → main, 예외는 프로젝트 안 문자 그대로의 경로 `git -C`·`cd`, 떼어진 HEAD → main, 단 `orbit/…`의 멈춘 rebase는 그 브랜치). 보호 경로에 `.git/` 전체·`.gitconfig`·`~/.config/git/`·`$XDG_CONFIG_HOME/git/`. 셸 공통에 "읽기 형태(`--get*`, `--list`, `-l`)가 아닌 `git config`는 모든 역할에서 차단". 셸 줄에 librarian의 add·commit은 main 밖에서만. ④ "강제되지 않는 것"·잔여(C2): `:53-54`를 새 판정에 맞춰 다시 쓴다. 남는 것: REVIEW는 묶지 않음(Q1나: 리뷰 뒤 붙은 커밋을 qa·security만 보고 출고), `push origin <sha>:main` 등 refspec 소스가 HEAD·`orbit/<id>`가 아닌 push, 붙여 쓴 `-m"…"`(P1)의 merge, `docs/**`는 다시 검토되지 않음, publish는 HEAD가 아니라 작업 트리를 올린다, 스크립트·임의 프로그램의 `.git/`·`.gitconfig` 쓰기, 시스템 gitconfig·`GIT_CONFIG_GLOBAL`·`include.path` 대상, 셸 호출 사이에 남는 환경변수(미확인), 멈춘 rebase `head-name`을 셸로 위조하는 경로. 닫힌 쪽 과차단: main의 다른 읽기 명령, `git` 단어가 든 비git 인자, switch와 다른 git을 한 줄에 묶은 명령, sha256 저장소. P2·P3의 main 쪽은 N2-b로 닫혔음을 적는다. ⑤ router/SKILL.md §8(`:112`): "`check ship`은 VERIFY(full은 SECURITY도)의 COMMIT과 run 브랜치 해시를 대조한다. librarian의 기록 커밋은 `CHANGELOG*`·`docs/**`만. 키트 run은 사람의 적용 커밋 뒤에 qa·security가 COMMIT을 적는다"를 더한다. ⑥ 커밋은 A1처럼 `-F .orbit/runs/20261114-gate-commit-binding/COMMIT_A2.txt`. 자기 경로만 add한다 | `harness/skills/orbit/gate/SKILL.md`, `harness/skills/orbit/router/SKILL.md` | `grep -c "COMMIT" harness/skills/orbit/gate/SKILL.md` → ≥3(기준 11). `grep -c "출고로 보지 않는 rebase 옵션" harness/skills/orbit/gate/SKILL.md` → 0. `grep -n "N2-b" harness/skills/orbit/gate/SKILL.md` → ≥1. `grep -n "Push-Location" harness/skills/orbit/gate/SKILL.md` → ≥1. `grep -n "COMMIT" harness/skills/orbit/router/SKILL.md` → ≥1. `claude plugin validate harness` → exit 0. `git log --oneline -2` → A1, A2 순 | 3 | K2, A1 |

같은 웨이브의 파일은 서로 겹치지 않는다. W1은 K1(kit 테스트·kit 복사본), K4(APPLY.md), A1(agents 3개)이다. W2는 K2(kit/gate.mjs)뿐이다. W3은 A2(skills 2개)뿐이다. kit/gate.mjs는 K1이 복사만 하고 K2가 고친다. kit/gate.test.mjs는 K1만 고친다.

**APPLY.md 요건 (K4).** PowerShell 5.1, 한 줄씩, `&&` 없음. 이전 run `kit/APPLY.md` 형식을 따른다.
1. 전제: 모든 Claude 세션을 닫는다. `git switch orbit/20261114-gate-commit-binding`. `git status --short --untracked-files=no` → 출력 없음.
2. 사전 테스트: `node --test .orbit\runs\20261114-gate-commit-binding\kit\gate.test.mjs` → `# fail 0`.
3. 복사 2개: kit의 `gate.mjs`, `gate.test.mjs` → `harness\hooks\`(`Copy-Item … -Force`). settings.json은 이번에 없다.
4. 확인: `git diff --stat` → 정확히 2파일. `node --test harness/hooks/gate.test.mjs` → exit 0, `# fail 0`, pass > 46. `claude plugin validate harness` → exit 0.
5. 커밋: `git add -- harness/hooks/gate.mjs harness/hooks/gate.test.mjs` → `git commit -m "chore(harness): apply gate commit-binding kit N1-N4"` → `git log --oneline -1`의 해시를 기록한다(STATE.json history).
6. 되돌리기: `git revert --no-edit <기록한 해시>`. 커밋 전 실패면 `git restore -- <두 파일>`. `reset --hard`·`clean`은 쓰지 않는다.
7. 새 세션 확인: `claude` → `orbit:` 에이전트 목록 → Lead에게 `node "C:\Users\lclk1\Projects\orbit\harness\hooks\gate.mjs" check ship` → `run=20261114-gate-commit-binding track=full`. 이 시점에는 `FAIL commit:`(COMMIT 줄 없음)과 FAIL 관문 줄이 정상이다.
8. 알림: 적용 뒤에는 COMMIT 줄이 없는 옛 run(`orbit/20261114-harness-plugin` 포함)을 출고할 수 없다. 에이전트는 main에서 add·commit·reset 등을 할 수 없다. 사람의 터미널 작업은 영향받지 않는다.

## 진행 순서 (Lead)

1. **build**: W1(K1, K4, A1 병렬) → W2(K2) → W3(A2). 커밋은 A1, A2뿐이다(K는 git 밖). 이 동안 살아 있는 관문은 옛 gate.mjs다.
2. **review**(full 패널). kit은 git 밖이므로 리뷰어 READ에 다음을 준다: `git diff --no-index harness/hooks/gate.mjs .orbit/runs/20261114-gate-commit-binding/kit/gate.mjs`, 같은 형식의 gate.test.mjs diff, A 변경은 `git diff main...HEAD`. 리뷰 fix는 같은 파일 분할(테스트는 K1 쪽, gate.mjs는 K2 쪽)로 돌린다.
3. **REVIEW PASS → 멈춘다. 이번 요청의 끝은 "리뷰 PASS 후 사람의 키트 적용 대기"다.** Lead는 사용자에게 `kit/APPLY.md` 실행을 요청한다.
4. (이후, 사람) APPLY 1~7. 적용 커밋 해시를 STATE.json history에 기록한다. 새 세션을 연다(기준 24 전반).
5. **qa**(새 관문 아래, run 브랜치, 깨끗한 트리): 기준 1~23·25를 확인한다. 실제 git이 필요한 재현(기준 21, 25)은 `RUN_DIR`의 프로브 스크립트를 `node <RUN_DIR>/qa-probe.mjs`로 실행한다. 훅은 `node …` 명령만 보므로 프로브 안의 git은 막히지 않는다. 기준 25는 실제 `.orbit/current`를 건드리지 않고 임시 저장소 사본으로 한다. VERIFY.md에 `COMMIT:`을 적는다.
6. **security**: H1~H10 22사례 재대조(기준 3), N1~N4 재현, SECURITY.md에 같은 `COMMIT:`을 적는다.
7. Lead `check ship` → exit 0(기준 24 후반) → librarian: run 브랜치에서 CHANGELOG·docs/solutions만 커밋 → `git switch main` → `git merge --no-ff orbit/20261114-gate-commit-binding`(각각 따로 실행). 새 관문 아래의 첫 출고이고, Q1가 경로를 실제로 쓰는 도그푸딩이다.

## 성공 기준 대응표

| 기준 | 태스크 | 검증(테스트 이름 또는 명령) |
|---|---|---|
| 1 전체·회귀 | K1, K2, 사람 | kit·적용 뒤 `node --test` exit 0, pass > 46 |
| 2 지워진·바뀐 줄 | K1 | K1 SUMMARY의 `--unified=0` 표. 이 PLAN의 범주 1·2 표와 같아야 함 |
| 3 H1~H10 22사례 | K2, security | 기존 "SECURITY.md 6) 우회 재현 22사례" 통과 |
| 4·5 | K1, K2 | `cb N1 기준4·5: 묶은 해시와 같으면 머지 ALLOW, 미검토 커밋을 머지한 뒤엔 BLOCK(두 해시 7자리)·check ship 1` |
| 6 | K1, K2 | `cb N1 기준6: 지우고 다른 커밋에서 다시 만든 orbit/A는 BLOCK` |
| 7 | K1, K2 | `cb N1 기준7: COMMIT 없음·단축·비hex·산출물끼리 다름은 BLOCK, 사유에 산출물 이름` |
| 8 | K1, K2 | `cb N1 기준8: quick·standard는 VERIFY의 COMMIT만 본다` |
| 9 | K1, K2 | `cb N1 기준9: ref 없는 push·publish는 HEAD를 대조` |
| 10 | K1, K2 | `cb N1 기준10: 묶은 해시 뒤 CHANGELOG*·docs/**만 바꾼 커밋은 ALLOW, src·harness/agents·이름 바꾸기·조상 아님은 BLOCK` |
| (N1 보강) | K1, K2 | `cb N1: 같은 이름 태그·orbit/<id>/x·orbit/<id>~1은 검토 커밋으로 인정하지 않는다` |
| 11 | A1, A2 | `grep -n "COMMIT:" harness/agents/qa.md harness/agents/security.md`, `grep -c COMMIT harness/skills/orbit/gate/SKILL.md` |
| 12 | K1, K2 | `cb N2-b 기준12: main 위의 쓰기 git은 통과 여부와 무관하게 BLOCK` |
| 13 | K1, K2 | `cb N2-a 기준13: .git/ 아래·worktree .git 파일 Write는 BLOCK, .gitignore·.gitattributes는 ALLOW` |
| 14 | K1, K2 | `cb N2-b 기준14: main의 정당한 흐름(읽기·다른 브랜치로 가기·fetch·통과한 merge) ALLOW` |
| 15 | K1, K2 | `cb N2-b 기준15: run 브랜치에서는 쓰기 git ALLOW` (`:52` 원래 의도 포함) |
| 16 | K1, K2 | `cb N2-c 기준16: 멈춘 rebase는 그 run 브랜치로, 그냥 떼어진 HEAD는 main으로` (실제 충돌 rebase로 만든다) |
| 17 | K1, K2 | `cb N3 기준17: --git-dir·GIT_DIR·$env:GIT_DIR·Push-Location·sl·-C·cd로 main을 건드리면 BLOCK` (`../w`는 `<root>-w` 형제 worktree) |
| 18 | K1, K2 | `cb N3 기준18: rebase가 main을 옮기면 출고` |
| 19 | K1, K2 | `cb N3 기준19: upstream 자리의 main·rebase --continue·merge main은 ALLOW` |
| 20 | K1, K2 | `cb N3 기준20: 프로젝트 안 문자 그대로의 경로 -C·cd는 그 브랜치로, 모르는 경로는 main으로` |
| 21 | qa | VERIFY의 프로브 기록(실제 git으로 main이 움직임 + 같은 명령의 훅 판정 BLOCK) |
| 22 | K1, K2 | `cb N4 기준22: ~/.gitconfig·~/.config/git·XDG git 설정 Write는 BLOCK, docs/gitconfig-notes.md는 ALLOW` |
| 23 | K1, K2 | `cb N4 기준23: git config 쓰기는 모든 역할 BLOCK, --get·--list·-l은 ALLOW` (ALLOW 사례는 run 브랜치에서. main에서는 N2-b가 막는다) |
| (P5) | K1, K2 | `cb P5: rebase feat main은 BLOCK, merge -F .orbit/… orbit/<id>는 ALLOW` |
| 24 | 사람(APPLY 7), qa·security, Lead | 새 세션 `claude plugin validate harness` 0, COMMIT 기록 뒤 `check ship` exit 0 |
| 25 | qa | 임시 저장소 사본에서 COMMIT 없는 `orbit/20261114-harness-plugin` 상태의 ship BLOCK |

## 위험·가정

- **librarian의 문서 범위와 Q1가의 충돌.** librarian은 `*.md` 전체를 쓸 수 있지만 출고 허용 후손은 `CHANGELOG*`(루트)·`docs/**`뿐이다. README 등을 고치면 출고가 막힌다. A1에서 librarian.md에 적는다. 닫힌 쪽으로 실패한다.
- **main 읽기 전용의 과차단.** 허용 목록 밖의 읽기(`git config --get`, `rev-list`, `stash list`, `remote -v`, `tag -l`)도 main에서는 막힌다. `git` 단어가 든 비git 인자, switch와 다른 git을 한 줄에 묶은 명령도 막힌다. 모두 닫힌 쪽이고 SKILL에 적는다. main에서 `merge --abort`/`--continue`도 출고 판정에서 막힌다. librarian은 충돌하면 멈추고 보고한다(기존 지시).
- **성능.** 지금은 출고 형태에서만 git을 실행한다. 이제 git 호출이 든 모든 명령에서 `symbolic-ref`를 1회 실행하고, 떼어진 HEAD면 1회를 더 한다. 출고 판정에서는 `rev-parse`·`merge-base`·`diff`를 최대 3회 실행한다. hooks.json timeout은 10초이고, 넘으면 Claude Code가 허용한다(fail-open). 실측은 K2가 SUMMARY에 적는다(미확인).
- **publish는 HEAD가 아니라 작업 트리를 올린다.** 더러운 트리의 `npm publish`는 HEAD 대조를 통과한다. 잔여로 문서화한다.
- **셸 호출 사이의 환경변수 유지 여부는 미확인이다.** 한 호출의 `export GIT_DIR=…`가 다음 호출에 남는다면 N3의 문자열 검사를 비켜 간다. 남지 않는다고 가정한다. 잔여로 적는다.
- **N2-c `head-name` 위조.** 자유 셸 역할은 셸로 `.git/rebase-merge/head-name`을 쓸 수 있다(Write만 막힌다). 위조해도 run 브랜치로 판정될 뿐이다. main을 가리키게 하면 오히려 main으로 판정된다. 잔여로 적는다.
- **git ref 해석.** 대상은 `rev-parse orbit/<id>^{commit}`이라 merge·push와 같은 해석(태그 우선, remote 이름 `orbit`)을 따른다. `refs/heads/`로 고정하면 같은 이름의 태그로 우회된다(테스트로 고정한다).
- **sha256 저장소**는 COMMIT 40자리 규칙 때문에 출고할 수 없다(닫힌 쪽, 미확인 대상).
- **kit은 git 밖이다.** 지워지면 다시 만들어야 한다. 리뷰는 `git diff --no-index`로 한다. 적용 중 열린 세션에는 새 gate가 즉시 걸린다. APPLY 1에서 모든 세션을 닫게 한다.
- **도그푸딩.** 적용 뒤 qa·security·librarian이 새 관문에 막힐 수 있다(예: main 위의 읽기 명령, `-m` 메시지에 든 `git` 단어). 우회하지 말고 Lead에게 보고하고 kit 수정 → 재적용으로 처리한다.
- **REVIEW 비결합(Q1나).** 리뷰 PASS 뒤 engineer가 붙인 커밋을 qa·security만 보고 출고할 수 있다. 사용자가 수용했고 SKILL에 적는다.
- 기준선 46은 이전 run SECURITY의 기록이다. 실제 값은 K1이 잰다.
