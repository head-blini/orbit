# VERIFY — 20261114-gate-commit-binding (qa)

COMMIT: 720f340cd84f6e789975c7a9d3e45dc6720d0fb9

검증 대상: 브랜치 `orbit/20261114-gate-commit-binding`의 HEAD 720f340(적용 커밋). 시작 때 `git status --porcelain --untracked-files=no` 출력 없음(깨끗). 이 파일과 `qa-probe*.mjs`는 `.orbit/`(비추적)라 트리를 더럽히지 않는다. 저장소 파일은 고치지 않았다. 실제 `.orbit/current`·브랜치·main은 건드리지 않았고, git이 필요한 재현은 `%TEMP%`의 임시 저장소에서만 했다.

```
$ git rev-parse HEAD ; git branch --show-current
720f340cd84f6e789975c7a9d3e45dc6720d0fb9
orbit/20261114-gate-commit-binding
```

프로브 스크립트(재실행 가능): `node .orbit/runs/20261114-gate-commit-binding/qa-probe.mjs`, `node .orbit/runs/20261114-gate-commit-binding/qa-probe2.mjs`. 둘 다 적용된 `harness/hooks/` 훅을 stdin 페이로드로 실제 실행한다. qa-probe.mjs의 "9 push after extra commit" BAD 1건은 프로브 결함이다(빈 커밋은 파일을 바꾸지 않아 Q1 허용 대상이라 ALLOW가 맞다). qa-probe2.mjs에서 src 파일 커밋으로 고쳐 BLOCK을 확인했다(기준 9). 그 외 프로브 결과는 전부 기대와 같다.

## 기준 1. 전체 테스트 (통과)

```
$ node --test harness/hooks/gate.test.mjs        (적용본, 이번에 실행)
ℹ tests 71
ℹ suites 0
ℹ pass 71
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 73741.0337
$ node --test harness/hooks/gate.test.mjs > /dev/null ; echo   -> repo-exit=0
$ node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs > /dev/null ; echo -> kit-exit=0
$ git diff --no-index --stat harness/hooks/gate.test.mjs .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs
(줄 바꿈 경고만, 차이 없음 — 테스트 파일은 kit와 동일)
```
pass 71 > 46. 결과: 통과. 
한계: `git diff --no-index`로 적용된 gate 스크립트와 kit 사본을 비교하는 명령은 관문 훅이 막았다(S13, qa 셸). 그래서 스크립트 바이트 동일은 직접 보이지 못했다. 같은 테스트 71개가 양쪽에서 통과하고 키트 테스트가 동일한 것으로 간접 확인(미확인: 바이트 동일).

## 기준 2. 기존 테스트에서 바뀐 줄 (통과, 대조 한계 있음)

```
$ git diff --unified=0 4a35fe7 HEAD -- harness/hooks/gate.test.mjs | grep -E "^-[^-]" | wc -l
21
(내용 요약, 앞 150자)
- project('quick', { 'VERIFY.md': EVIDENCE }) 픽스처 4줄 / gitProject(..., FULL_PASS·EVIDENCE) 픽스처 7줄 → COMMIT 픽스처(범주 1)
- git commit -m "merge notes" 단언 1줄, librarian commit·add 단언 2줄, reset --soft 제목·단언 2줄, pull . orbit/r1 단언 1줄 → main 위 쓰기 git BLOCK(범주 2)
- R2 제목 1줄 + checkout --detach 줄 + --continue/--abort/--skip/--quit 단언 줄 → 떼어진 HEAD는 main(범주 2, N2-c)
```
`-` 줄은 전부 PLAN의 범주 1(COMMIT 픽스처)·범주 2(main 위 쓰기 git이 BLOCK) 표와 내용이 맞는다. SUMMARY와의 1:1 대조는 하지 않았다(SUMMARY는 참고만). 결과: 통과.

## 기준 3. H1~H10 22사례 (통과)

```
$ node --test --test-name-pattern="22" harness/hooks/gate.test.mjs
✔ SECURITY.md 6) 우회 재현 22사례: 22 BLOCK (S13 이후) (207.9607ms)
✔ cb N4 기준22: ~/.gitconfig·~/.config/git·XDG git 설정 Write는 BLOCK, docs/gitconfig-notes.md는 ALLOW (602.6211ms)
ℹ tests 2  ℹ pass 2  ℹ fail 0
```
결과: 통과.

## 기준 4~10 (N1 커밋 묶기, 실제 git 임시 저장소 + 적용된 훅, 통과)

```
$ node .orbit/runs/20261114-gate-commit-binding/qa-probe.mjs        (발췌, 4·5·6·7·25 줄은 아래 각 항목)
OK  4 main merge orbit/A (bound) -> exit 0 (want ALLOW)
4 check ship 0  PASS plan / PASS review / PASS verify / PASS security / PASS commit 774a9f4 / run=A track=full
OK  5 on orbit/A: merge orbit/B (run branch) -> exit 0 (want ALLOW)
OK  5 main merge orbit/A after unreviewed merged -> exit 2 (want BLOCK) [orbit gate] 머지/푸시/배포 차단 — 관문 미통과: 검토한 커밋과 다름 — 검토 774a9f4, 대상 553c8ac: 그 뒤 커밋이 CHANGELOG*·docs/** 밖을 바꿈 (b.txt) → ...
5 check ship 1  FAIL commit: 검토한 커밋과 다름 — 검토 774a9f4, 대상 553c8ac: ...
OK  6 recreated orbit/A from B -> exit 2 (want BLOCK) ... 검토 774a9f4, 대상 8a78c00 (대상이 검토 커밋의 후손이 아님)
OK  7 no COMMIT line -> exit 2 ... VERIFY.md에 COMMIT 줄 없음
OK  7 short hash -> exit 2 ... VERIFY.md의 COMMIT이 40자리 hex가 아님
OK  7 non-hex -> exit 2 ... VERIFY.md의 COMMIT이 40자리 hex가 아님
OK  7 VERIFY!=SECURITY -> exit 2 ... VERIFY.md(e07f4da)와 SECURITY.md(aaaaaaa)의 COMMIT이 다름
$ node .orbit/runs/20261114-gate-commit-binding/qa-probe2.mjs       (발췌)
OK  9 push @bound HEAD -> exit 0 / OK 9 npm publish @bound HEAD -> exit 0 (deploy 승인 있음)
OK  9 push after src commit -> exit 2 ... 검토 b44e98c, 대상 95819ba: ... (src/a.ts)
OK  9 npm publish after src commit -> exit 2 (같은 사유)
OK  10 merge after CHANGELOG+docs/solutions commits -> exit 0
OK  10 merge after src/a.ts -> exit 2 ; OK 10 merge after harness/agents/qa.md -> exit 2
$ node --test --test-name-pattern="^cb " harness/hooks/gate.test.mjs
✔ cb N1 기준4·5 / 6 / 7 / 8(quick·standard) / 9 / 10(이름 바꾸기·조상 아님 포함) / 태그·orbit/<id>/x·~1 ...
ℹ tests 19  ℹ pass 19  ℹ fail 0
```
기준 8(quick·standard는 VERIFY만)과 기준 10의 "이름 바꾸기·조상 아님"은 위 프로브에서 직접 재현하지 않았고 cb 테스트(`cb N1 기준8`, `cb N1 기준10`) 통과로 확인했다. 결과: 통과(4·5·6·7·9·10 직접 실행, 8은 테스트).

## 기준 11. 지시·문서 (통과)

```
Grep "COMMIT:" harness/agents → qa.md:1, security.md:1
Grep "COMMIT"  harness/skills/orbit → gate/SKILL.md:5, router/SKILL.md:1
```
qa.md 29줄에 지시가 있음을 Read로 확인(`VERIFY.md에 검증한 커밋을 COMMIT: <40자리 hex> 한 줄로 적는다 …`). 결과: 통과.

## 기준 12~16 (N2 main 읽기 전용·멈춘 rebase)

```
$ node .orbit/runs/20261114-gate-commit-binding/qa-probe2.mjs   (main 위, 통과 상태 run A, 임시 저장소)
OK  12 engineer main: git cherry-pick orbit/A / commit -am x / checkout orbit/A -- b.txt / restore --source / am / revert HEAD / reset --soft orbit/A / reset orbit/A / stash pop -> 전부 exit 2 ("... (N2-b): <sub>")
OK  12 librarian main: git add src/a.ts / git commit -F msg.txt -> exit 2
OK  14 engineer main: git status / log --oneline -5 / diff / show HEAD / rev-parse HEAD -> exit 0
OK  14 lead branch --show-current / switch -c orbit/next -> exit 0
OK  15 engineer run-branch: commit -am x / cherry-pick abc1234 / revert HEAD / reset --hard HEAD~1 / stash pop -> exit 0
OK  15 librarian add CHANGELOG.md -> exit 0
OK  22/13 .git/refs/heads/main, .git/HEAD, .git/packed-refs, .git/info/attributes Write -> exit 2
OK  13 .gitignore, .gitattributes Write -> exit 0
```
12의 "미통과 상태(current=new)" 짝, 14의 `git fetch origin`·통과 상태 librarian `switch main`/`merge`, 13의 `.git/config.worktree`·`.orbit/wt/t1/.git`, 16(실제 충돌 rebase로 멈춘 HEAD)은 프로브에서 직접 재현하지 않았고 `cb N2-b 기준12/14/15`, `cb N2-a 기준13`, `cb N2-c 기준16` 테스트(위 19개 통과)로 확인했다. 결과: 통과(프로브 직접 + 테스트).

관찰(실패 아님, 문서와 맞춤): main에서 `git checkout <branch>`는 BLOCK이고 `git switch`만 ALLOW다(코드 주석: checkout은 브랜치 이동과 경로 체크아웃을 구분할 수 없어 막음). BRIEF N2-b는 "switch/checkout으로 다른 브랜치로 가기"를 허용 목록에 적었으나, 기준 14의 사례는 모두 `switch`다. 과차단 방향이다.

## 기준 17~20 (N3 위치 변경·rebase 대상)

```
$ node --test --test-name-pattern="^cb " harness/hooks/gate.test.mjs
✔ cb N3 기준17: --git-dir·GIT_DIR·$env:GIT_DIR·Push-Location·sl·-C·cd로 main을 건드리면 BLOCK
✔ cb N3 기준18: rebase가 main을 옮기면 출고
✔ cb N3 기준19: upstream 자리의 main·rebase --continue·merge main은 ALLOW
✔ cb N3 기준20: 프로젝트 안 문자 그대로의 경로 -C·cd는 그 브랜치로, 모르는 경로는 main으로
```
추가로 qa-probe.mjs에서 기준 21의 `--git-dir` merge와 `rebase --onto orbit/X --root main`을 훅에 넣어 exit 2를 확인했다(아래). 17~20 개별 명령은 테스트로 확인했고 직접 재실행하지는 않았다. 결과: 통과(테스트).

## 기준 21. 실제 git으로 main이 움직임 + 같은 명령의 훅 판정 (통과)

```
$ node .orbit/runs/20261114-gate-commit-binding/qa-probe.mjs   (임시 저장소 + 형제 worktree)
OK  21 hook: --git-dir merge (engineer on orbit/A) -> exit 2 (want BLOCK) [orbit gate] 머지/푸시/배포 차단 — 관문 미통과: PLAN_CHECK.md 없음; REVIEW.md 없음; VERIFY.md 없음; SECURITY.md 없음
21 real: main moved 38b7393 -> ce9b1aa            (git --git-dir=<worktree gitdir> --work-tree=<w> merge orbit/A 를 실제 실행)
OK  21 hook: rebase --onto orbit/X --root main -> exit 2 (want BLOCK) ... 명령이 현재 run(orbit/A)의 브랜치만 가리키지 않음
21 real: main moved 50f79b0 -> 31efe84            (git rebase --onto orbit/X --root main 을 실제 실행)
```
결과: 통과. 주의: 훅이 `--git-dir` 사례를 막은 사유는 "이 run의 관문 산출물이 없음"이다(위치 변경 → 보호 브랜치로 보아 출고 판정). 관문이 통과한 run이면 같은 명령은 `orbit/A` 머지로 보고 COMMIT 대조를 거쳐 ALLOW될 수 있다. 설계상 그렇고(통과한 orbit/<id> 머지만 main을 움직임), 기준 17은 미통과 run 전제다.

## 기준 22·23 (N4 사용자 git 설정)

```
$ node .orbit/runs/20261114-gate-commit-binding/qa-probe2.mjs
OK  22 engineer Write ~/.gitconfig, ~/.config/git/config, ~/.config/git/attributes -> exit 2
OK  22 qa Write ~/.gitconfig -> exit 2 ; OK 22 lead Edit ~/.gitconfig -> exit 2
OK  22 XDG git/config (XDG_CONFIG_HOME=<tmp>) -> exit 2
OK  22 docs/gitconfig-notes.md -> exit 0
OK  23 git config --global core.fsmonitor x / core.hooksPath x / --file ~/.gitconfig a.b c -> exit 2 ("git config 쓰기는 모든 역할에서 차단")
OK  23 git config --get user.name / --list / -l -> exit 0   (run 브랜치 위, engineer)
PROBE2 ALL OK  (exit=0)
```
결과: 통과. (Edit 도구 대상은 Lead·qa 페이로드로 확인. engineer의 Edit·qa의 Edit은 테스트 `cb N4 기준22`에 의존.)

## 기준 24. 적용과 실사용 (전반 통과, 후반 보류)

```
$ claude plugin validate harness
✔ Validation passed with warnings   (author·LICENSE·icon 경고는 디렉터리 제출 항목이며 결과에 영향 없음)
exit=0
$ node "C:\Users\lclk1\Projects\orbit\harness\hooks\gate.mjs" check ship        (qa, 이 VERIFY.md 쓰기 전)
PASS plan
PASS review
FAIL verify: VERIFY.md 없음
FAIL security: SECURITY.md 없음
FAIL commit: VERIFY.md 없음 → qa(full은 security도)가 출고할 커밋에서 다시 검증하고 COMMIT 줄을 고친다
run=20261114-gate-commit-binding track=full
(exit 1)
```
- 전반(`claude plugin validate harness` 0): 통과(이 세션에서 직접 실행).
- 후반(`check ship` exit 0): **미확인**. security가 SECURITY.md에 같은 COMMIT 줄을 적어야 한다. 이 VERIFY.md로 verify 줄은 PASS가 될 것이다. 최종 `check ship`은 Lead가 SECURITY.md 뒤에 실행한다.
- 사용자의 `; echo` 후행 명령이 막힌 이유 재현: qa 셸에서도 `cd … && node "<gate> check ship"`과 `…check ship; echo exit=$?`가 같은 S13 사유(관문·설정 파일을 가리키는 셸은 읽기·테스트만 허용)로 막혔고, 단독 `node "<gate> check ship"`만 실행됐다. 연결된 명령은 관문이 "읽기 전용 단독 명령"이 아니라고 본다. 우회하지 않았다. 종료 코드는 도구가 직접 알려 준 값(exit 1)을 썼다. 한계: `git diff --no-index`로 gate 스크립트를 비교하는 명령도 같은 이유로 막혔다.

## 기준 25. COMMIT 줄 없는 옛 run (통과)

```
$ node .orbit/runs/20261114-gate-commit-binding/qa-probe.mjs   (임시 저장소, run id 20261114-harness-plugin, 관문 4개 PASS, COMMIT 줄 없음)
OK  25 old run, no COMMIT: main merge -> exit 2 (want BLOCK) [orbit gate] 머지/푸시/배포 차단 — 관문 미통과: VERIFY.md에 COMMIT 줄 없음 → ...
25 check ship 1  FAIL commit: VERIFY.md에 COMMIT 줄 없음 → ...
```
실제 `.orbit/current`·실제 저장소 브랜치는 건드리지 않음(임시 저장소 사본). 결과: 통과.

## 훅 1회 실행 시간 실측 (STATE.json history "qa 몫")

```
TIMING (node 프로세스 기동 포함, 각 5회, Windows 10, 임시 저장소, 이 세션에서 qa-probe.mjs로 측정)
  non-git (npm test): min 38ms median 40ms max 41ms
  git status: min 100ms median 101ms max 104ms
  git commit on run branch: min 100ms median 101ms max 109ms
  ship merge (main): min 219ms median 232ms max 240ms
```
hooks.json timeout 10초 대비 최대 0.24초. 한계: 큰 저장소나 느린 디스크는 미측정, 실제 Claude Code 세션 페이로드(PowerShell 도구 등)로는 측정하지 않음. 결과: 통과(실측값 기록).

## 프로젝트 체크리스트(CLAUDE.md qa 항목)

- 자동 테스트: `node --test harness/hooks/gate.test.mjs` 71/71 통과(기준 1). `npm run build`, `cargo test`는 이 변경(훅 스크립트와 마크다운)이 닿지 않는 제품 코드라 실행하지 않았다: **미검증(범위 밖)**. `npm run tauri dev`/브라우저 확인은 UI·제품 코드 변경 없음으로 해당 없음.
- 실패 경로: 기준 5·6·7·9·10·25의 BLOCK 사례와 12·22·23의 BLOCK 사례가 실패 경로다.
- 정리: 띄운 서버·프로세스 없음. 임시 저장소는 `%TEMP%`(`qa-probe-*`, `qa-probe2-*`)에 남아 있고 저장소 밖이다.

## 미검증·한계 요약

- 기준 24 후반(`check ship` exit 0): SECURITY.md의 COMMIT 대기. 이 시점에는 미확인.
- 적용된 gate 스크립트와 kit 사본의 바이트 동일: 관문이 비교 명령을 막아 직접 확인하지 못함(테스트 71개 동일 통과로 간접 확인).
- 기준 8·10(이름 바꾸기)·12(미통과 짝)·13(config.worktree, wt/.git)·14(fetch)·16·17~20 개별 명령: 프로브 직접 실행 없이 cb 테스트 통과로 확인.
- `npm run build`·`cargo test`: 변경 범위 밖이라 실행 안 함.
- 큰 저장소·실제 세션 페이로드에서의 훅 시간.

## 결과

모든 기준 통과 또는 근거 있는 보류(24 후반)이며 실패는 없다. 미검증이 있으므로(기준 24 후반) 전체 통과 선언은 SECURITY.md COMMIT 이후 Lead의 `check ship`이 확정한다. qa 몫의 기준 1~23·25는 통과다.

VERDICT: PASS
