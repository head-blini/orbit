# PLAN_CHECK — 20261114-gate-commit-binding (PLAN v1)

검사 방법: BRIEF, PLAN, STATE.json을 읽고 gate.mjs(360줄), gate.test.mjs(561줄), gate/SKILL.md, router/SKILL.md, librarian.md, qa.md, security.md를 직접 열어 줄 번호와 단언을 대조했다. 실행한 것은 읽기뿐이다. 테스트·`claude plugin validate`는 계획 단계라 대상 파일이 아직 없어 "실행 확인 필요"로 남긴다.

## 1. 목표 덮기: 통과
기준 1~25가 모두 대응표(PLAN "성공 기준 대응표")에 태스크와 검증으로 걸려 있다. 빠진 기준은 없다.
- 기준 21·25(실제 git 재현, 옛 run 사본)는 qa 몫이다. 진행 순서 5에 `qa-probe.mjs`로 적혀 있다. 이 파일을 쓰는 태스크는 표에 없다. qa가 `.orbit/runs/<id>/` 안에 Write하면 되고 관문이 허용한다(OWNERS에 없는 파일). 차단 아님.
- 테스트 대응표의 `cb` 테스트는 19개이고 기준 4~20·22·23·P5를 모두 덮는다.

## 2. 검증 가능성: 통과
K1·K2·K4·A1·A2 모두 명령과 기대 결과가 있다. 기준선 46은 `^test(` 카운트 46과 일치한다. 실행 확인 필요: K1·K2의 `node --test`, A1·A2의 `claude plugin validate harness`.

## 3. 경로 실재: 통과
확인한 것: gate.mjs `:23`, `:108`, `:123-129 branchOf`, `:138 MOVES`, `:144-145 REBASE_RESUME`, `:156`, `:166`, `:227-235`, `:267`, `:278-283`, `:287-288`, `:297-315 cli`. 모두 PLAN이 말한 위치와 같다. 테스트 줄 `:50 :52 :109 :296 :356 :361 :395 :424 :425 :470 :478 :484 :490-494 :526 :533-536 :541 :553`도 실제 단언과 맞다. 문서 쪽도 맞다: qa.md `:27`, security.md `:28`, librarian.md `:12`·`:18`, router `:112`, gate/SKILL.md `:53-54`("출고로 보지 않는 rebase 옵션" 문구가 `:53`에 실제로 있음). kit 파일과 APPLY.md는 새로 만드는 것으로 표시돼 있다.

## 4. 빠진 연결: 통과 (권고만)
- export는 그대로다. gate.mjs를 import하는 곳은 gate.test.mjs뿐이다(grep 확인: 나머지는 문서·hooks.json·settings 경로 참조). hooks.json·settings.json·Tauri capability·제품 코드는 닿지 않는다.
- 기존 테스트 기대값 목록을 한 줄씩 대조했다. 범주 1(COMMIT 픽스처)·범주 2(main 쓰기 git 차단) 표가 실제 gate.test.mjs와 맞는다. 표에 없는 기존 단언 중 바뀌는 것을 찾지 못했다. 점검한 것: `:59-62`, `:73-82`(Lead는 `git status`가 MAIN_READ 안), `:126-154` 22사례, `:175-177`, `:213`, `:357-365`, `:370-376`, `:381-386`, `:431-447`, `:497-500`, `:513-522`, `:528-531`, `:542-547`, `:552`, `:558-559`.
- 권고 R-a (`:553`): 범주 2에서 `pull . orbit/r1`을 0→2로 바꾸면 N6·N7 테스트의 "대조(허용)" 줄이 사라진다. 같은 줄을 `merge orbit/r1`(COMMIT 픽스처)로 바꾸거나 새 허용 대조를 `cb` 테스트에 하나 더 두면 대조가 남는다. 기준 2의 허용 범주 안에서 가능하다.
- 권고 R-b (기준 9): 묶은 해시 뒤에 "커밋을 하나 더 만든 뒤 BLOCK" 사례는 비문서 파일을 바꾸는 커밋이어야 한다. 빈 커밋(`--allow-empty`)은 diff가 비어 Q1가 규칙상 허용이다.
- 권고 R-c (기준 14): "모든 역할의 `git rev-parse HEAD`"는 LEAD_SHELL(`:114`)과 READ_SHELL(`:118`)에 rev-parse가 없어 Lead·읽기 리뷰어에게는 이미 BLOCK이고 이번 계획도 그 목록을 바꾸지 않는다. FREE_SHELL 역할(qa·security·engineer)에서만 허용을 단언하도록 `cb N2-b 기준14`의 역할을 못 박아야 QA 때 기준 문구와 충돌하지 않는다.
- 권고 R-d (N2-c): `git rev-parse --git-dir`는 cwd가 저장소 최상위일 때 `.git`처럼 상대 경로를 돌려준다. `join(cwd, out)`로 풀거나 `--absolute-git-dir`를 쓴다고 K2에 못 박을 것. 그렇지 않으면 멈춘 rebase 판정이 조용히 main으로 떨어져 기준 16 허용 사례가 실패한다(테스트가 잡으므로 K2 단계에서 드러나긴 한다).
- 권고 R-e (N3-a): `locates`에 `i` 플래그를 주면 커밋 메시지의 "CD"·"cd"·"sl"·"chdir" 같은 단어도 위치 변경으로 본다. 그러면 `whereOf`가 null이 되고 run 브랜치의 `git commit -m "add CD workflow"`가 main 취급으로 막힌다(N2-b). 닫힌 쪽 과차단이고 `-F` 파일로 우회되지만 engineer가 흔히 만난다. 따옴표 안 문자열을 걷어낸 뒤 `locates`를 보거나(N3-b에서 이미 하는 처리), 최소한 SKILL 과차단 목록과 engineer 안내에 "메시지는 `-F`"를 적을 것.
- 권고 R-f (N4-S): `CONFIG_READ`는 따옴표 안의 ` --list `도 읽기 형태로 본다(`git config core.fsmonitor "x --list "`). 따옴표를 먼저 걷어내면 같은 정규식으로 닫힌다. 문자열 검사의 알려진 한계라 SKILL 잔여에 적어도 되나 한 줄 처리라 권한다.
- 권고 R-g (N3-b 잔여): `rebase`의 값을 받는 옵션 목록 밖(`--empty drop` 등)은 위치 인자 계산을 어긋나게 하고, `heads/main`·`@{-1}` 형태는 `^(refs/heads/)?(main|master)$`를 비껴간다. BRIEF가 문자열 우회 수용을 이미 명시했으므로 gate/SKILL.md 잔여 목록(A2 ④)에 한 줄 더하면 된다.

## 5. 웨이브 충돌과 순서: 통과
W1: K1(kit/gate.test.mjs, kit/gate.mjs 복사), K4(kit/APPLY.md), A1(agents 3개)은 파일이 겹치지 않는다. W2: K2(kit/gate.mjs)는 K1 뒤다. W3: A2(skills 2개)는 K2·A1 뒤다. A1·A2 커밋 시점에는 옛 gate가 살아 있어 `git add`·`git commit -F`가 허용된다(경로와 메시지 파일에 `gate.mjs`·`settings`·`hooks.json` 없음). K1의 검증 명령(`git diff --no-index`, `grep`, `node --test <kit경로>`)은 옛 S13의 INSPECT_SHELL과 충돌하지 않는다(`gate.test.mjs`는 `gate\.mjs` 패턴에 걸리지 않음).

## 6. 범위: 통과
BRIEF에 없는 것을 PLAN이 더한 곳은 두 가지이고 둘 다 관문을 약화하지 않는다.
- **REBASE_RESUME 삭제.** 삭제 전에는 떼어진 HEAD면 어떤 `rebase --continue`든 출고가 아니었다. 삭제 후에는 진짜 멈춘 rebase만 `head-name`으로 run 브랜치 판정을 받고, 그냥 떼어진 HEAD는 main으로 본다. 더 엄격하다. 셸로 `head-name`을 위조해도 얻는 것이 없다: main 이동은 `switch`·`checkout`(위치 변경), `branch -f`, `update-ref`, `fetch .:main`, `push` 등 별도 출고 판정이 계속 막는다. PLAN이 잔여로 문서화(A2 ④)한다.
- **`orbit/<id>` 뒤쪽 경계(ORBIT_REF).** `orbit/r1/t1`·`orbit/r1~1`을 id로 인정하지 않으면 shipRunId가 null이 되어 차단된다. 더 엄격하다. run 브랜치 안의 `orbit/<run-id>/<task>` 머지는 출고가 아니라 영향이 없다(`:59`, router §7의 worktree 머지).
그 밖에 BRIEF 범위 밖 항목(reference-transaction, ORBIT_GATE 제거, C1, R10, REVIEW 묶기)은 PLAN "하지 않는 것"에 그대로 있다. `.gitconfig` 위치 무관 차단은 N4 취지 안이다.

## 정당한 흐름 점검: 통과
- router worktree: `git -C .orbit/wt/<t>`·`cd .orbit/wt/<t> && …`는 프로젝트 안 문자 그대로의 경로라 그 브랜치로 판정된다. `.orbit/wt/<t>`의 cwd에서 직접 실행하는 commit도 `symbolic-ref`가 task 브랜치를 돌려주므로 막히지 않는다. run 브랜치 위의 `git merge --no-ff orbit/<run>/<task>`는 출고가 아니다. `git worktree add`는 run 브랜치에서 하므로 N2-b 대상이 아니다.
- 멈춘 rebase: `rebase-merge`·`rebase-apply`의 `head-name`이 `refs/heads/orbit/…`이면 add·commit·`--continue`가 허용된다. 기준 16은 `cb N2-c`가 실제 충돌 rebase로 만든다.
- librarian 출고 순서: run 브랜치에서 add·commit(`CHANGELOG*`·`docs/**`만) → `git switch main`(MAIN_READ의 switch) → `git merge --no-ff orbit/<id>`(ship 판정 통과, MAIN_READ의 merge)로 돈다. `switch main && merge` 한 줄도 허용 목록 안이다. 문서 커밋은 Q1가의 후손 규칙을 통과한다. README 같은 `docs/**` 밖 문서는 막히고 A1이 librarian.md에 보고하라고 적는다(BRIEF Q1의 결과다).
- Lead의 `switch -c orbit/<id>`, quick 트랙의 Lead 직접 merge, `git fetch origin`도 허용 목록 안이다.

## 7. 프로젝트 규칙(CLAUDE.md 체크리스트): 통과
- 이 변경은 훅 수신 서버·토큰·Tauri capability·CSP·settings.json 병합과 무관하다. capability·export·설정 파일 변경이 없고 PLAN이 "gate.mjs 밖 호출부 없음"을 근거와 함께 적었다.
- plan-checker 항목(호출부·테스트·설정·capability·export): 위 4번에서 확인했다.
- "하네스 자체는 관문이 막는다" 원칙대로 gate.mjs·gate.test.mjs는 kit + APPLY.md로 사람이 적용한다. 적용 후 옛 run의 출고 불가 안내가 APPLY 8번에 있다.
- 하네스 문서: HARNESS.md는 이 저장소에 있고 BRIEF가 범위 밖으로 둔다(사람이 고침). 적용 후 HARNESS.md·CLAUDE.md가 새 판정과 어긋나는 곳이 있는지 사람이 한 번 보도록 APPLY.md 8번에 한 줄 더하면 좋다(권고).

## 요약
차단 항목 없음. 권고 R-a~R-g는 K1·K2·A2 작업 중 반영하면 된다. R-d와 R-e가 가장 영향이 크다.

VERDICT: PASS
