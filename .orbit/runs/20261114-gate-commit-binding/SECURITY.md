# SECURITY — 20261114-gate-commit-binding (security-deep)

범위: `git diff main...HEAD`. 커밋은 6개다(885cf98, de97621, 834dd2a, e88c825, 4a35fe7, 사람이 적용한 키트 720f340). 바뀐 파일은 7개다(agents 3, gate/SKILL.md, router/SKILL.md, hooks/gate.mjs, gate.test.mjs). 판정은 모두 이번에 직접 실행하거나 코드를 읽어 확인했다. REVIEW.md는 참고로만 썼다.

판정 기준은 이전 run과 같다. 지금은 기본 모드(확인 창)다. 그래서 옛 관문보다 약해진 곳만 **차단**으로 보고, 새 코드가 다 닫지 못한 우회는 **권고**로 둔다. **[자동 승인 시 차단]**이 붙은 항목은 자동 승인을 켜기 전에 닫아야 한다.

COMMIT: 720f340cd84f6e789975c7a9d3e45dc6720d0fb9

## 요약

- **옛 관문 대비 회귀는 없다.** 같은 임시 저장소에서 main의 gate.mjs와 적용된 gate.mjs를 같은 명령 61개 × 두 상태(통과 run, 미통과 run)로 나란히 판정했다. 옛 관문에서 BLOCK인데 새 관문에서 ALLOW인 경우는 0건이다. 바뀐 판정은 모두 ALLOW에서 BLOCK으로 간 것이다("확인한 것" 3). 네 차례 리뷰가 줄 단위 대조로만 확인하던 부분을 처음으로 실행해서 확인했다.
- **N1~N4 상태**: N1 부분, N2 부분, N3 닫힘(알려진 형태 기준), N4 부분. 이전 run이 재현했던 시나리오는 이번에 모두 BLOCK이다. 다만 새 우회 세 가지를 실제 git으로 재현했다(F1~F3). 셋 다 옛 관문에서도 열려 있었으므로 회귀는 아니다. 이번 변경이 닫으려던 범위에 남은 구멍이다.
- **목표 "자동 승인에서도 미통과 코드가 main에 못 들어감"은 아직 달성되지 않았다.** 근거는 F1(N1 우회), F2(N2·출고 우회), F3(N4 셸 우회)이다. 사용자가 이미 수용한 잔여도 남는다: 셸로 `.git/`에 쓰기, 셸로 산출물 위조, `push <sha>:main`, reference-transaction 미룸.
- 비밀값·개인 경로·숨은 문자는 없다. 에이전트 frontmatter·hooks.json·settings·매니페스트는 바뀌지 않았다. 의존성 변경이 없어 audit는 실행하지 않았다.

## N1~N4 상태

| id | 상태 | 근거 |
|---|---|---|
| N1 | **부분** | 이전 run 시나리오(통과한 `orbit/A`에 미검토 `orbit/new`를 머지한 뒤 main으로 머지)가 이제 BLOCK이다. 옛 관문은 ALLOW였다. 사유는 `검토한 커밋과 다름 — 검토 e38d31d, 대상 8e35a32: … (src/evil.ts)`이다(프로브 "N1 chain"). COMMIT 없음·단축·불일치·태그·`orbit/<id>~1`·다시 만든 브랜치는 테스트 `cb N1 …`이 통과한다. Q1a 후손 판정에서 `src/a.ts`·`harness/agents/qa.md`·`README.md`는 BLOCK, `docs/**`·`CHANGELOG*`는 ALLOW다(프로브). **남는 것: `git replace`(F1)**. 셸로 VERIFY/SECURITY에 COMMIT 줄을 덧붙이는 위조는 수용된 잔여다(SKILL "셸을 통해 산출물을 위조하는 경로") |
| N2 | **부분** | engineer·librarian의 main 위 쓰기 git 17개 형태(commit, cherry-pick, `checkout -- 경로`, restore, am, revert, reset 전 모드, stash pop, read-tree, apply, rm, symbolic-ref, replace, add, `commit -F`)가 두 상태 모두에서 ALLOW에서 BLOCK으로 바뀌었다. `.git/` 아래 Write는 BLOCK이다(테스트 `cb N2-a 기준13`). 멈춘 rebase 처리는 테스트 `cb N2-c 기준16`이 통과한다. **남는 것: 한 명령 안에서 `git symbolic-ref`로 HEAD를 main으로 바꾸는 형태(F2)**. 셸 리다이렉트로 `.git/refs/heads/main`에 쓰는 것(프로브 ALLOW)은 수용된 잔여다 |
| N3 | **닫힘**(알려진 형태) | `--git-dir`(단독 포함), `GIT_DIR=`, `$env:GIT_DIR`, `Push-Location`, `sl`, `-C ../w`, `cd ../w`, `rebase --onto X --root main`, `rebase --root main`이 모두 ALLOW에서 BLOCK으로 바뀌었다. `rebase main`은 ALLOW 그대로다(프로브). 남는 것은 문자열 우회 계열(참고 C2 `Start-Process`)이다 |
| N4 | **부분** | `~/.gitconfig`·`~/.config/git/*`·XDG Write는 BLOCK이다(테스트 `cb N4 기준22`). `git config --global core.fsmonitor x`와 `git config core.hooksPath x`도 BLOCK이다. **남는 것: 읽기 플래그를 뒤에 붙인 쓰기(F3)** |

H1~H10 재대조: 테스트 "SECURITY.md 6) 우회 재현 22사례: 22 BLOCK (S13 이후)"가 통과한다. 이 세션에서 S13도 실제로 걸렸다. `git -C … diff --no-index … gate.mjs` 형태와 `&&`로 연결한 명령이 플러그인 훅과 settings 백스톱 훅 양쪽에서 막혔다. 우회하지 않고 단일 명령으로 바꿨다.

## 새 발견 사항

**F1 · 권고 [자동 승인 시 차단] · `harness/hooks/gate.mjs:114-120`(rev), `:136-158`(commitFailure), `:396-399`(N2-b는 main에서만)**
COMMIT 대조는 ref가 가리키는 해시만 본다. git의 replace 객체(`refs/replace/`)가 있으면 merge는 그 해시의 **대체 커밋 내용**을 읽는다. 대조는 통과하는데 미검토 트리가 main에 들어간다.
- 시나리오(실제 git으로 재현): full run A가 통과했고 COMMIT=bound이다. engineer가 run 브랜치에서 `git replace <bound> <evil>`을 실행한다(ALLOW). evil은 미검토 `src/evil.ts`를 담은 커밋이다. 이때 `rev-parse orbit/A^{commit}`은 그대로 bound이다. librarian이 main에서 `git merge --no-ff orbit/A`를 실행하면 ALLOW이고 실제 머지도 성공한다. 그 결과 `--no-replace-objects`로 봐도 main 트리에 `src/evil.ts`가 있다. 머지 커밋의 부모는 bound(`e38d31d`)로 기록된다. 확인 창에는 평범한 git 명령 두 개만 보인다.
- 권장 수정: (1) 출고 판정에서 `git for-each-ref --count=1 refs/replace/`가 비어 있지 않으면 차단한다. `.git/info/grafts`가 있어도 차단한다. (2) 모든 역할에서 `git replace`를 차단한다(git config와 같은 자리). (3) SKILL "COMMIT 묶기의 잔여"에 적는다.

**F2 · 권고 [자동 승인 시 차단] · `harness/hooks/gate.mjs:199`(moves), `:397`(N2-b 위치 판정)**
`moves`와 N2-b의 "한 명령 안에서 브랜치가 바뀜" 판정은 `switch|checkout`(그리고 위치 변경)만 본다. `git symbolic-ref HEAD refs/heads/main`도 브랜치를 바꾸지만 이 목록에 없다. 그래서 판정은 바뀌기 전 브랜치(run 브랜치)로 내려진다.
- 시나리오(실제 git으로 재현): 미통과 run이고 engineer가 `orbit/new`에 있다. `git symbolic-ref HEAD refs/heads/main; git commit -qm x; git symbolic-ref HEAD refs/heads/orbit/new` → 옛 관문과 새 관문 모두 ALLOW다. 실행하면 main이 움직이고 main에 `src/evil.ts`가 들어간다. `git symbolic-ref HEAD refs/heads/main; git merge --no-ff orbit/new`도 두 관문 모두 ALLOW다. 이 형태는 N2-b뿐 아니라 옛 출고 판정(머지)까지 비켜 간다. 관문 통과가 필요 없다. 사용자 alias(`co = checkout` 등)로 브랜치를 바꾸는 것도 같은 부류다.
- 권장 수정: `moves`의 단어 목록과 N2-b의 `subs.some(/^(switch|checkout)\b/)`에 `symbolic-ref`를 넣는다. 정규식 두 곳만 바꾸면 된다. 테스트 사례 2개를 더한다.

**F3 · 권고 [자동 승인 시 차단] · `harness/hooks/gate.mjs:297`(CONFIG_READ), `:394`**
읽기 판정은 명령에 `--get*`·`--list`·`-l`이 "있는지"만 본다. git 2.56에서 `git config --global core.fsmonitor x --list`와 `… x -l`은 exit 0으로 **값을 쓴다**(임시 `GIT_CONFIG_GLOBAL` 파일로 확인). 관문은 둘 다 ALLOW다. 같은 형태로 `core.hooksPath`, `include.path`, `alias.*`도 쓸 수 있다. 이 모양으로 N4의 셸 경로(Q3)가 다시 열린다. 이전 run의 N4 시나리오(`core.fsmonitor` 설정 → Lead의 `git status`가 스크립트 실행)가 그대로 성립한다.
- 권장 수정: 허용을 "읽기 형태와 정확히 일치하는 명령"으로 바꾼다. 예를 들어 `^config(\s+--(global|local|system|show-origin|show-scope|null|name-only))*\s+(--get(-all|-regexp|-urlmatch)?\s+\S+(\s+\S+)?|--list|-l)\s*$`이다. 또는 위치 인자가 2개 이상이면 차단한다. 테스트로 `x --list`와 `x -l`의 BLOCK을 고정한다.

**참고**
- C1 · `gate.mjs:153` — Q1a 후손 허용의 `CHANGELOG[^/]*`는 루트의 아무 확장자에나 맞는다(`CHANGELOG.config.mjs` ALLOW, 프로브). `docs/build.mjs`도 ALLOW다. 지금 저장소의 빌드 설정(package.json, vite.config, tauri.conf.json)은 `docs/`·`CHANGELOG`를 참조하지 않는다. 그래서 실행 경로는 확인되지 않았다. BRIEF가 말한 "실행되지 않는 문서"로 좁히려면 `CHANGELOG(\.md)?`와 `docs/**/*.md`로 제한하는 것을 검토한다.
- C2 · `gate.mjs:192`(GIT 정규식) — PowerShell `Start-Process git -WorkingDirectory ../w -ArgumentList 'merge','orbit/new'`와 `Start-Process git -ArgumentList 'config','--global',…`는 두 관문 모두 ALLOW다. 수용된 "1차 감지, 문자열 우회 가능" 부류다. 다만 난독화가 아니라 PowerShell의 평범한 형태이므로 SKILL 잔여 목록에 이름을 적는 것을 권한다.
- C3 · SKILL 잔여 목록 — REVIEW 4회차가 넘긴 `push origin refs/heads/orbit/other:main`과 대소문자 `ORBIT/other` 형태가 아직 적혀 있지 않다. F1~F3이 고쳐지기 전까지는 이것들도 잔여 목록에 적어야 한다(문서 수정은 engineer 몫).
- C4 · PLAN "위험·가정"의 head-name 위조 문장("main을 가리키게 하면 오히려 main으로 판정된다")은 경우를 다 덮지 못할 수 있다. 관문은 `rebase-merge`를 먼저 읽는데, git은 `rebase-apply`를 먼저 쓰는 것으로 알고 있다. 그래서 두 폴더를 다르게 위조하면 판정과 실제가 갈릴 수 있다. 실행해 보지는 않았다. 셸로 `.git/`에 쓰는 것이 전제이므로 이미 수용된 잔여에 포함된다.

## 수용된 잔여(새 문제 아님)

- Q1b: REVIEW는 묶지 않는다. Q2: reference-transaction은 미루고 `ORBIT_GATE=off`는 유지한다. Q4: C1(승인 출처)·R10은 미룬다.
- 셸·스크립트로 `.git/`·`~/.gitconfig`에 쓰는 것(프로브: `echo 0000 > .git/refs/heads/main` ALLOW). 셸로 산출물(COMMIT·VERDICT 줄)을 위조하는 것. 시스템 gitconfig, `GIT_CONFIG_GLOBAL`, `include.path`의 대상 파일.
- `push origin <sha>:main` 부류. 통과 상태에서 `git push . HEAD:main`이 ALLOW인 것도 여기에 든다. 이 경우 HEAD가 COMMIT과 같아야 하므로 검토된 커밋만 나간다.
- 프로젝트 밖 clone의 `-C` 머지 대조, publish는 작업 트리를 올린다는 점, sha256 저장소, 닫힌 쪽 과차단 목록(SKILL).
- 셸 호출 사이의 환경변수: 이 세션의 Bash 도구에서 `export ORBIT_SEC_PROBE_ENV=persisted`를 실행한 뒤 다음 호출에서 읽으면 빈 값이다. **유지되지 않는다**. SKILL의 "확인하지 못했다" 문장은 Bash 도구에 대해서는 "유지되지 않음"으로 고칠 수 있다(PowerShell 도구는 미확인).

## 확인한 것

1) 변경 범위와 적용 일치
```
$ git log --oneline main..HEAD
720f340 chore(harness): apply gate commit-binding kit N1-N4
4a35fe7 … e88c825 … 834dd2a … de97621 … 885cf98 feat(harness): agents bind COMMIT line and librarian main rules (A1)
$ git diff --stat main...HEAD   → 7 files changed, 499 insertions(+), 51 deletions(-)
$ git show --stat 720f340   → harness/hooks/gate.mjs | 157, harness/hooks/gate.test.mjs | 354 (2 files)
$ git diff --no-index --stat harness/hooks/gate.mjs .orbit/runs/20261114-gate-commit-binding/kit/gate.mjs        → 출력 없음(CRLF 경고만), 키트와 같음
$ git diff --no-index --stat harness/hooks/gate.test.mjs .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs → 출력 없음, 키트와 같음
$ git status --porcelain --untracked-files=no   → 출력 없음(깨끗함)
$ git rev-parse HEAD   → 720f340cd84f6e789975c7a9d3e45dc6720d0fb9
```

2) 테스트
```
$ node --test harness/hooks/gate.test.mjs   (exit=0)
ℹ tests 71  ℹ pass 71  ℹ fail 0   (✔ SECURITY.md 6) 우회 재현 22사례: 22 BLOCK (S13 이후) 포함)
```

3) 옛 관문과 새 관문 나란히 판정 + 실제 git 재현
`node .orbit/runs/20261114-gate-commit-binding/sec/probe.mjs <scratchpad>`. 프로브는 `git show main:harness/hooks/gate.mjs`를 스크래치패드에 풀어 import하고, 적용된 gate.mjs도 import(읽기)한다. 두 `decide()`를 스크래치패드 임시 저장소에 대해 실행한다. git 실행은 모두 임시 저장소 안에서만 한다. 발췌(old | new):
```
--- current=A (passed) / current=new (not passed): "<<REGRESSION"(old BLOCK → new ALLOW) 표시 0건
ALLOW | BLOCK | engineer@main: git commit -am x / cherry-pick / checkout orbit/new -- a.txt / restore --source / am / revert / reset --soft / reset / stash pop / read-tree -m -u / apply / rm / symbolic-ref / replace
ALLOW | BLOCK | librarian@main: git add src/a.ts / git commit -F msg.txt
ALLOW | ALLOW | librarian@main(passed): git merge --no-ff orbit/A        ALLOW | ALLOW | lead@main: git switch -c orbit/x, branch --show-current
ALLOW | BLOCK | engineer@A: --git-dir … merge / --git-dir commit / GIT_DIR= / $env:GIT_DIR / Push-Location / sl / -C ../r-w / cd ../r-w / rebase --onto X --root main / rebase --root main
ALLOW | ALLOW | engineer@A: git rebase main
ALLOW | BLOCK | engineer@A: git config --global core.fsmonitor x / git config core.hooksPath x
ALLOW | ALLOW | engineer@A: Start-Process git -WorkingDirectory ../r-w -ArgumentList 'merge','orbit/new' -Wait          (C2)
ALLOW | ALLOW | engineer@A: git symbolic-ref HEAD refs/heads/main; git merge --no-ff orbit/new                      (F2)
ALLOW | ALLOW | engineer@A: echo 0000 > .git/refs/heads/main                                                      (수용 잔여)
--- N1 chain: after merging orbit/new into orbit/A: old ALLOW / new BLOCK
  reason: 머지/푸시/배포 차단 — 관문 미통과: 검토한 커밋과 다름 — 검토 e38d31d, 대상 8e35a32: 그 뒤 커밋이 CHANGELOG*·docs/** 밖을 바꿈 (src/evil.ts) → qa(…)
--- Q1a descendants: ALLOW docs/solutions/x.md, CHANGELOG.md, CHANGELOG.config.mjs, docs/build.mjs | BLOCK src/a.ts, harness/agents/qa.md, README.md
--- git replace (F1): engineer `git replace <bound> <evil>`: ALLOW | rev-parse orbit/A^{commit} == bound: true | librarian@main merge: ALLOW
    real merge ok: true | main tree (--no-replace-objects) has src/evil.ts: true | main merge parents: 130a1c7 e38d31d | bound e38d31d
--- symbolic-ref (F2): old ALLOW / new ALLOW | main moved: true | main has src/evil.ts: true
--- git config mixed forms (F3, GIT_CONFIG_GLOBAL=temp):
exit=0 wrote=true gate=ALLOW :: git config --global core.fsmonitor x --list
exit=0 wrote=true gate=ALLOW :: git config --global core.fsmonitor x -l
exit=0 wrote=true gate=BLOCK :: git config set --global core.fsmonitor x
--- hook timing (실제 훅 프로세스 spawn, 5회, ms)
41,40,40,41,39 npm run build | 110,101,99,102,105 git status(main) | 101~105 git commit(run) | 222~226 librarian merge(출고, COMMIT 대조)
```
훅 시간은 timeout 10초보다 두 자릿수 이상 짧다. 시간 초과로 열리는 경로는 없다. 사본 cmd.exe를 `git.exe`라는 이름으로 cwd에 두고 판정을 속이는 시도도 해 봤다. 재현되지 않았다(새 관문 BLOCK 유지).

4) 비밀값·개인 경로·숨은 문자
```
$ git diff main...HEAD | grep -nEi '^\+.*(lclk1|C:\\\\Users|/Users/|api[_-]?key|secret|passw|BEGIN .*PRIVATE|ghp_|sk-…|AKIA|curl |wget |Invoke-WebRequest|bypassPermissions|acceptEdits|permissionMode|defaultMode|"allow")'
grep_exit=1 (일치 없음)
$ git diff main...HEAD | LC_ALL=C.UTF-8 grep -cP '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]|<!--'
0
```

5) 에이전트 설정 점검(agent-config-audit)
```
$ git diff main...HEAD --name-only → agents 3, gate/SKILL.md, router/SKILL.md, hooks/gate.mjs, hooks/gate.test.mjs (hooks.json·.claude/·CLAUDE.md·.mcp.json·매니페스트 없음)
$ git diff main...HEAD -U0 -- harness/agents | grep -E '^[-+](tools|model|permissionMode|hooks|mcpServers|name|description):'
fm_exit=1 (frontmatter 변경 없음)
```
본문 추가는 COMMIT 줄 지시(qa, security)와 librarian의 main 제한이다. 둘 다 권한을 좁히는 쪽이다. 인젝션 문구는 없다. router §8 문장도 관문을 설명할 뿐 건너뛰게 하지 않는다. gate.mjs의 새 git 실행은 모두 `execFileSync` argv이다. ref에는 `HEAD` 또는 검증된 run id(`^[\w.-]+$`)만 들어간다. `whereOf`는 정규화한 뒤 범위를 검사한다. 프로젝트 CLAUDE.md 체크리스트 중 127.0.0.1·토큰·Origin·본문 크기·CSP·capability는 대상 코드가 없다(src/, src-tauri/ 무변경).

6) 의존성: package.json·Cargo.toml·잠금 파일 변경이 없다. 그래서 `npm audit`·`cargo audit`는 **미실행**(대상 없음).

## 확인하지 못한 것

- 실제 Claude Code 세션의 PowerShell 도구 페이로드로 F2·F3·C2를 재현하지 않았다. `decide()` 판정과 실제 git만 확인했다.
- PowerShell 도구의 환경변수 유지 여부. C4의 rebase-apply/rebase-merge 우선순위.
- F1의 다른 형태(`git replace --graft`, `.git/info/grafts`). 같은 원리라 같은 수정으로 닫힌다고 본다.
- 기준 24·25(새 세션의 `check ship`, 옛 run 사본)는 qa 몫이라 다시 실행하지 않았다.

## 남긴 흔적

- `.orbit/runs/20261114-gate-commit-binding/sec/probe.mjs`(gitignore 경로). 처음 실행이 실패해서 `node -e`로 한 줄(`mkdirSync`)을 고쳤다. 이 파일은 셸로 쓴 것이다. 프로젝트 추적 파일은 바꾸지 않았다.
- 스크래치패드 `p/` 아래 임시 저장소(r, r-w, s, f, f-w)와 옛 gate 사본.
- 실제 저장소의 `.orbit/current`·브랜치·main은 건드리지 않았다.

VERDICT: PASS
