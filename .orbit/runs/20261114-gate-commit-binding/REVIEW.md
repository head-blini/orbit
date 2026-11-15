# REVIEW — 20261114-gate-commit-binding (1회차)

리뷰어 4명(correctness, tests, maintainability, rules)의 최종 메시지를 Lead가 병합. 대상: git 밖 키트 `kit/`(gate.mjs, gate.test.mjs, APPLY.md — `git diff --no-index`로 원본과 비교)와 `git diff main...HEAD`(885cf98, de97621). 첫 줄: correctness "차단 있음", rules "차단 있음", tests "차단 없음", maintainability "차단 없음".

## 계획 준수 (correctness, rules)
- N1-a~e, N2-a/b/c, N2-c', N3-a~c, N4-W/S, 주석, CLI commit 줄, export 8개 모두 구현. A1·A2 문서 diff는 PLAN 문구와 일치, 계획에 없는 변경 없음.
- 키트 테스트 `node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → tests 65, pass 65, fail 0, exit 0 (correctness·tests가 각각 직접 실행).
- 기존 테스트의 `-` 줄 21개가 K1 SUMMARY 표와 빠짐없이 일치(tests).
- 결정 Q1a·Q1b·Q2·Q3·Q4 준수, 범위 밖(src/, src-tauri/, CLAUDE.md, .claude/) 무변경, git 실행은 전부 execFileSync argv, whereOf는 정규화 후 범위 검사, 비밀값·개인 경로 없음(rules).
- 정당한 흐름(run 브랜치 안 머지, 멈춘 rebase의 --continue, librarian docs 커밋 → switch main → merge)은 막히지 않음(correctness, 코드 확인).
- REBASE_RESUME 삭제·isShip 변경 자체는 약화 아님(correctness).

## 차단
| # | 위치 | 문제 | 시나리오 | 리뷰어 · confidence |
|---|---|---|---|---|
| B1 | kit/gate.mjs:197-200 (`locates`의 `-m`·`-F` 값 걷어내기) → moves(:201) → isShip(:220), whereOf(:239-241) | `-m "…"` 값을 통째로 지워, 큰따옴표 안 명령 치환(`$(…)`, 백틱) 속의 위치 변경이 안 보임. 옛 MOVES는 원문에서 `cd`·` -C `를 찾아 출고로 봤으므로 **회귀(관문 약화)** | 미통과 run, engineer, run 브랜치: `git commit --allow-empty -m "$(git -C ../w merge orbit/new)"` 또는 `-m "$(cd <main worktree> && git merge orbit/r1)"` → ALLOW, main에 머지. N2-b도 whereOf가 같은 locates를 써서 비켜 감(`$(git -C ../w cherry-pick …)`). N3 전체(Push-Location, GIT_DIR 등)가 이 형태로 우회 | correctness·rules · 중간(코드 추적, 미실행) |
| B2 | kit/gate.mjs:224-225 (`rebasesMain`) | 따옴표 안의 공백·`;&|`를 `_`로 바꿔, 따옴표 안의 git 호출이 GIT 정규식에 안 잡힘. 옛 gate(:156)는 원문 정규식으로 출고로 잡았으므로 **회귀**. 원인은 PLAN N3-b ①의 설계이고 K2의 `;&|` 치환이 넓힘. 테스트 없음 | 미통과 run, engineer, `orbit/r1`: `bash -c "git rebase orbit/r1 main"`, `git commit --allow-empty -m "$(git rebase orbit/r1 main)"` → ALLOW, main이 미검토 코드로 이동 | correctness · 중간(코드 추적, 미실행) |

## 수정 권고
| # | 위치 | 문제 | 시나리오 | 리뷰어 · confidence |
|---|---|---|---|---|
| R1 | kit/APPLY.md:67 | 커밋 전 되돌리기 `git restore -- <두 파일>`은 `git add` 뒤에는 인덱스에서 복원해 아무것도 되돌리지 못함 | `git commit` 실패 후 따라 하면 새 gate.mjs가 작업 트리에 남음. 제안: `git restore --staged --worktree --source=HEAD -- harness/hooks/gate.mjs harness/hooks/gate.test.mjs` | maintainability · 높음 |
| R2 | kit/gate.mjs:136-157 (commitOf·commitFailure 사유) | 무엇이 틀렸는지만 말하고 다음 할 일이 없음 | 막힌 Lead·librarian이 우회를 찾음. 제안: 접미사 "→ qa(full은 security도)가 출고할 커밋에서 다시 검증하고 COMMIT 줄을 고친다" | maintainability · 중간 |
| R3 | kit/gate.mjs:152, kit/gate.test.mjs:680 | 후손 허용 정규식에서 `^`를 빼는 변이가 살아남음 | `src/docs/x.ts`, `src/CHANGELOG.js` 커밋이 검토 없이 출고. BLOCK 사례 `src/docs/a.ts` 추가 | tests · 중간(코드 추적) |
| R4 | kit/gate.mjs:199, kit/gate.test.mjs:757 | `--git-dir` 사례에 늘 `--work-tree`가 함께 있어 `--git-dir`만 빼는 변이가 살아남음 | `git --git-dir=../w/.git commit -am x` ALLOW 회귀를 놓침. 단독 사례 추가 | tests · 중간(코드 추적) |

## 참고
- kit/gate.mjs:230 — 값 받는 옵션 중 테스트는 `--onto`뿐. `-s`·`-X`·`-x`·`--exec`를 빼는 변이 생존(`git rebase -x make feat main` ALLOW)(tests).
- kit/gate.test.mjs:780 — 기준20 BLOCK 세 사례의 cwd가 main이라 "경로 모름" 판정을 구분 못 함(기준17 GIT_DIR commit 사례가 같은 변이를 잡음)(tests).
- kit/gate.test.mjs:788 — 기준22는 Write만, Edit 없음(경로 검사 코드는 같음)(tests).
- kit/gate.test.mjs:28, 785 — 임시 저장소를 지우지 않음. 전역 git 설정(diff.renames, core.hooksPath)이 결과에 영향 가능. 실행 약 70초(tests).
- kit/gate.mjs:299 — MAIN_READ의 `(switch|checkout)\s+[^\s-]\S*$`가 경로에도 맞아 main에서 `git checkout .`·`git checkout src/a.ts` ALLOW(작업 트리 변경 버림, ref는 안 움직임)(correctness).
- kit/gate.mjs:376-377 — `git -C <프로젝트 밖 clone> merge orbit/r1`은 COMMIT 대조를 cwd 저장소 기준으로 함. 관문 통과 전제의 잔여, 문서화 권고(correctness).
- kit/gate.mjs:208, :223, :296 — git 접두 패턴이 `MERGE_ARGS`·`REBASE_ARGS`·`GIT_INV`·`gitSub` 네 곳에 복사. :198과 :211의 `-m`·`-F` 걷어내기 정규식 중복(maintainability).
- kit/gate.mjs:395 — 차단 사유의 계획 내부 ID `(N2-b)`(maintainability · 낮음).
- kit/gate.mjs:112, :390-395 — git 단어가 든 셸 명령마다 git 프로세스 1~2개 추가, execFileSync에 timeout 없음. 훅 timeout 10초를 넘기면 fail-open. 실측 없음(rules · 낮음).
- harness/agents/librarian.md:15 vs :18 — 2단계 "README 등을 고친다"와 5단계 "README를 바꾸면 출고가 막히니 보고"가 엇갈림(rules).
- harness/skills/orbit/router/SKILL.md:88(기존 줄) — `orbit/<run-id>/<task>` 브랜치는 `orbit/<run-id>`와 D/F 충돌로 만들 수 없음. 이번 변경과 무관(correctness).

## 미확인 (리뷰어들이 밝힌 것)
- B1·B2는 코드 추적이며 실제 실행 재현은 없음. tests 리뷰어의 변이 10종도 코드 추적(사본을 만들지 못함).
- 훅 1회 실행 시간 실측, 원본 `harness/hooks/gate.test.mjs` 재실행, 기준10 rename 변이가 사용자 전역 diff 설정에서도 잡히는지.
- maintainability는 테스트 미실행, 테스트 추가분 268줄 전체는 읽지 않음.

## Lead의 처리 결정
- 차단 2건 → FAIL. review-fix-1(engineer, 루프 1/3): B1·B2를 테스트 먼저(두 시나리오와 `-m "add CD workflow"` ALLOW 유지) 고친다. 함께 R1~R4, 참고 중 `checkout <경로>`(:299), 값 받는 rebase 옵션 사례(:230), librarian.md :15/:18 엇갈림, 프로젝트 밖 `-C` 잔여 문서화, 문서(gate/SKILL.md)의 과차단 문구를 수정 결과에 맞춤.
- 고치지 않는 것: 접두 패턴·걷어내기 정규식 중복(리팩터, 관문 판정을 건드리는 범위를 키우지 않음), `(N2-b)` 표기, 임시 폴더 정리, router :88(이번 변경과 무관 — 후속 후보), 훅 시간 실측(적용 뒤 qa).
- 수정 뒤 correctness·tests 2명이 수정분만 재리뷰(2회차).

1회차 판정: FAIL (차단 2)

---

# 2회차 (review-fix-1 수정분 한정 재리뷰 — 키트 + 커밋 `834dd2a`)

리뷰어 2명(correctness, tests). correctness "차단 있음", tests "차단 없음". 키트 테스트 `node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → tests 69, pass 69, fail 0 (둘 다 직접 실행). 원본 대비 삭제 21줄 그대로(tests: `309 insertions(+), 21 deletions(-)`).

## 해소 확인
- **B1 부분 해소**: 따옴표 값, `$(…)`·백틱이 든 값은 닫힘. `-m"$(…)"`, `--message="$(…)"`, `-am "$(…)"`는 걷어내지 않아 BLOCK. 따옴표 없는 값에서 회귀가 남음 → N1.
- **B2 부분 해소**: 따옴표 안 git, `$(…)`, 백틱, 값 받는 옵션은 닫힘. 토큰 끝 `}`·`>`에서 회귀가 남음 → N2.
- **R1~R4, 참고(checkout, 값 받는 옵션), librarian.md :15/:18** 해소. R3·R4·B1·B2 되돌리기 변이, checkout·NEXT 변이는 rf1 테스트가 잡음(tests, 코드 추적). 2를 기대하는 rf1 단언 중 다른 규칙 덕에 통과하는 것 없음.
- 정당한 흐름(main의 `git switch orbit/<id>`·`switch -c`, librarian `switch main` → merge)은 막히지 않음. 834dd2a 문서는 키트 동작과 일치(N1·N2 형태는 잔여 목록에 없음).

## 차단
| # | 위치 | 문제 | 시나리오 (옛 gate → 키트) | 리뷰어 · confidence |
|---|---|---|---|---|
| N1 | kit/gate.mjs:199 (`locates`의 `\S+` 갈래), whereOf(:243)·isShip(:220) | 따옴표 없는 `-m`·`-F` 값을 `\S+`로 지우며 `;` 뒤 `cd`까지 삼킴. 따옴표 짝이 셸과 다르게 맞는 형태도 실제 실행되는 `cd`를 지움 | 미통과 run, engineer, `orbit/r1`: `git commit --allow-empty -m x;cd ../w;git merge orbit/r1`, PowerShell `-m x;Set-Location ../w;…`, `-m x&&cd ../w&&…`, `echo " -m 'a" ; cd ../w ; git merge orbit/r1 ; echo "'"` → 옛 BLOCK / 키트 ALLOW. N2-b도 같은 형태로 비켜 감(`…;git cherry-pick orbit/r1`) | correctness · 중간(코드 추적) |
| N2 | kit/gate.mjs:230, :236 | 토큰 끝에서 `)`·백틱만 떼어 `main}`, `main>NUL`이 main으로 인식 안 됨 | 같은 run: PowerShell `& {git rebase orbit/r1 main}`, `pwsh -Command "& {git rebase orbit/r1 main}"`, `git rebase orbit/r1 main>/dev/null` → 옛 BLOCK(:156) / 키트 ALLOW | correctness · 중간(코드 추적) |

## 수정 권고
| # | 위치 | 문제 | 리뷰어 · confidence |
|---|---|---|---|
| R5 | kit/gate.mjs:227, kit/gate.test.mjs:824 | 따옴표 안 `;&|` 치환을 BLOCK 쪽에서 확인하는 테스트 없음. `[\s;&|]`→`[\s]` 변이 생존(`git rebase --exec "a; b" feat main` ALLOW) | tests · 중간(코드 추적) |

## 참고
- kit/gate.mjs:232 — `--strategy`·`--strategy-option` 긴 형태 테스트 없음(tests).
- kit/gate.mjs:227 — `git rebase -x "make; git status" feat main`은 따옴표를 벗겨 인자 수집이 `;`에서 끊김. 옛 gate도 ALLOW인 기존 잔여(correctness).
- main에서 `git switch -c orbit/x main`(인자 둘)은 BLOCK — 과차단, 문서에 없음(correctness).

## 미확인
- N1·N2와 변이는 모두 코드 추적. 실행 재현 없음(읽기 전용, S13).

## Lead의 처리 결정
- 차단 2건 → FAIL. 두 회차 연속으로 "문자열을 걷어낸 뒤 검사"에서 옛 gate 대비 회귀가 나왔다. 걷어내기를 더 다듬지 않는다(`docs/solutions/harness-gate-string-detection.md`의 교훈). **review-fix-2(engineer, 루프 2/3)의 원칙: 키트 판정은 옛 판정의 상위 집합이어야 한다.**
  - 위치 변경(`locates`)은 **원문 전체**에 적용한다. `-m`·`-F` 값 걷어내기를 지운다. 대가(닫힌 쪽 과차단): 커밋 메시지에 `cd`·`sl`·`chdir` 등의 단어가 있으면 run 브랜치의 commit도 막힌다 → 메시지는 `-F <파일>`로(문서화). `commit -m "add CD workflow"` ALLOW 테스트는 BLOCK으로 바꾸고 `-F` ALLOW 대조를 둔다.
  - rebase는 **옛 원문 정규식(원본 :156) OR 새 `rebasesMain`** 으로 판정한다. 대가: 메시지에 "rebase … main"이 든 커밋 과차단(이전 run P4와 같음, 이미 문서화된 형태).
  - N1·N2 시나리오와 R5를 테스트로 넣는다. `switch -c <새> <시작점>` 과차단은 SKILL에 한 줄.
- 수정 뒤 correctness 1명이 수정분만 재리뷰(3회차). 3회차에서도 회귀가 나오면 루프 한도(3)라 멈추고 사용자에게 보고한다.

2회차 판정: FAIL (차단 2)

---

# 3회차 (review-fix-2 수정분 한정 재리뷰 — 키트 + 커밋 `e88c825`)

리뷰어 1명(correctness). 첫 줄 "차단 있음 (1건)". 키트 테스트 `node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → tests 70, pass 70, fail 0(직접 실행).

## 해소 확인
- **N1 해소**: `locates`(:198)가 원문 전체를 보고 `-m`·`-F` 값을 걷어내지 않음. `-m x;cd ../w;git merge orbit/r1`, `Set-Location`, `&&cd`는 isShip(:217)에서 BLOCK, whereOf(:240)가 null이라 N2-b도 BLOCK.
- **N2 해소**: :215에 옛 원문 정규식 + `|| rebasesMain`. `main}`·`main>`은 `(?![\w./-])`에 걸림(테스트 :830).
- 정당한 흐름은 막히지 않음(테스트로 확인): worktree `cd .orbit/wt/t1 && git commit`·`git -C .orbit/wt/t1 commit`(:781), `rebase main`·`-i main`·`origin/main`·`--continue`(:774), librarian `commit -F`(:734).

## 상위 집합 대조 (옛 :131-171·:276-283 → 키트)
- push/update-ref/FORCE_MOVE/GH_MERGE(:153 → :212), alias·GIT_CONFIG_*(:154 → :213): 같음.
- rebase 원문 정규식·fetch :main(:156 → :215): 같음 + rebasesMain OR(넓음).
- SHIP_FORMS·reset --hard: 키트(:216)는 원문 cmd에서 찾음(넓음). REBASE_RESUME 삭제는 계획된 변경.
- MOVES → moves/locates(:198-199): 단어 추가·대소문자 무시(넓음). shipRunId 대체도 넓음.
- branchOf의 head-name 판정(N2-c): 계획된 변경.
- foreignMerge·PUBLISH·shipFailures: 같음. 출고 분기는 commitFailure만 더함.
- **ORBIT_REF(:248)의 id 추출은 상위 집합이 아님 → B3.**

## 차단
| # | 위치 | 문제 | 시나리오 (옛 gate → 키트) | confidence |
|---|---|---|---|---|
| B3 | kit/gate.mjs:248, :250, :252-254 (ORBIT_REF 뒤쪽 경계, PLAN N1-c) | 뒤쪽 경계 때문에 `orbit/<다른id>`에 `~ ^ @ > } /`·백틱이 붙으면 id 목록에서 빠짐. 다른 id가 남거나 push가 현재 브랜치로 대체되면 null이 되지 않아 통과 | 관문 통과한 run r1, engineer, `orbit/r1`, HEAD=COMMIT: (a) `git push origin orbit/other~0:main` (b) `git rebase --onto orbit/other~0 orbit/r1 main` (c) `git push origin orbit/other>/dev/null`, `& {git push origin orbit/other}` → 옛 BLOCK(ids에 other) / 키트 ALLOW. 미검토 orbit/other가 main에 들어감 | 중간(코드 추적, 미실행) |

수정 방향(리뷰어): id 판정(shipFailures 쪽)에는 옛 정규식을 쓰고, ORBIT_REF는 commitFailure의 대상 선택에만 쓴다.

## 수정 권고
- harness/skills/orbit/gate/SKILL.md:67 (e88c825) — 값 받는 옵션 때문에 생기는 과차단(`git rebase --exec "make test" main`, `git rebase -x make main`, 테스트 :840이 단언)이 문서에 없음(높음).

## 참고
- 같은 줄의 "`rebase --continue`에 `-c`·`2>&1`을 붙인 형태" 과차단 문구는 head-name 판정 뒤로는 맞지 않음(ALLOW). 이번 diff 전부터 있던 문구.

## 미확인
- B3은 실행 재현 없음. 옛 :276-283 밖의 N2-b 블록은 상위 집합 대조 대상이 아님(옛 코드에 없던 추가 검사).

## Lead의 처리 결정
- 차단 1건 → FAIL. B3은 PLAN이 BRIEF 밖에서 더한 N1-c("뒤쪽 경계")에서 나왔다. 수정은 좁다: id 판정은 옛 정규식 그대로, 뒤쪽 경계는 COMMIT 대조의 대상 ref를 고를 때만. review-fix-3(engineer, **루프 3/3 — 한도의 마지막**). 문서 권고·참고 두 줄도 함께.
- 수정 뒤 correctness 1명이 B3과 id 추출 경로만 재리뷰(4회차). 4회차에서도 차단이 나오면 한도를 넘으므로 더 돌리지 않고 사용자에게 쟁점을 보고한다.

3회차 판정: FAIL (차단 1)

---

# 4회차 (review-fix-3 수정분 한정 재리뷰 — 키트 + 커밋 `4a35fe7`)

리뷰어 1명(correctness). 첫 줄 "차단 없음". 키트 테스트 `node --test .orbit/runs/20261114-gate-commit-binding/kit/gate.test.mjs` → tests 71, pass 71, fail 0(직접 실행, rf3 B3 :858-866 포함).

## 해소 확인
- **B3 해소**(코드 추적 + rf3 실행): `ORBIT_ID`(kit/gate.mjs:248)는 옛 :166 정규식과 글자 그대로 같음. shipRunId(:250-256)의 대조 논리는 옛 :165-171과 같고 대체 금지 조건만 `moves()`로 넓어짐(상위 집합). 3회차 시나리오 (a)(b)(c)는 ids에 other가 들어가 shipFailures(:108)에서 차단 — 옛 gate와 같은 판정.
- 개수 비교 검사(:377-378)는 `!fails.length` 분기 안, commitFailure 앞. ORBIT_REF는 ORBIT_ID에 lookahead만 더한 것이라 두 개수가 같으면 모든 매치가 깨끗함. 혼합 형태 `orbit/r1 orbit/r1~0:main`(1 대 2) 차단, `orbit/other~0 orbit/r1` 차단.
- 3회차 상위 집합 대조에서 달라진 줄은 :248-251(옛 정규식으로 복귀)과 :377-378(차단만 추가). 옛 gate에서 BLOCK인데 키트에서 ALLOW가 되는 명령은 찾지 못함.
- 정당한 흐름은 막히지 않음(코드 확인, `push`·`push origin orbit/r1`은 테스트 :863 실행): librarian `merge --no-ff orbit/<id>`, `-F .orbit/runs/<id>/msg.txt orbit/<id>`, `"orbit/<id>"`, engineer `push origin orbit/<id>`, `push -u origin orbit/<id>`, `push origin orbit/<id>:orbit/<id>`.
- 4a35fe7의 gate/SKILL.md는 kit 동작과 일치(id 판정·꼬리 붙은 ref 차단 :378, `rebase main --exec "make test"` ALLOW :865, `--continue` 과차단 문구 삭제).

## 참고
- kit/gate.mjs:248-255 — `ORBIT/other`(대소문자), `refs/heads/orbit/other`를 소스로 쓴 push는 id로 잡히지 않음. 통과한 run r1의 `orbit/r1`에서 `git push origin refs/heads/orbit/other:main` → 옛 gate도 ALLOW, 키트도 ALLOW. 옛 gate부터 있던 잔여(회귀 아님, 이미 수용된 `push origin <sha>:main`과 같은 부류). SKILL 잔여 목록에는 이 두 형태가 없음(중간, 코드 확인).

## 미확인
- 수정 전 키트와의 diff(`.orbit/`는 커밋되지 않음). librarian merge 3형태와 engineer push 나머지 형태는 코드 추적만.
- 네 회차 공통: 실제 Claude Code 세션의 훅 페이로드(PowerShell 도구 포함)로의 재현, 키트 적용 뒤 `harness/hooks` 자리 실행, 훅 1회 실행 시간 실측, 옛 gate와 키트를 같은 명령 집합에 나란히 실행한 비교(상위 집합은 줄 단위 코드 대조와 테스트로만 확인).

## Lead의 처리 결정
- 차단 없음 → 리뷰 관문 통과. 리뷰 루프 3/3 사용.
- 참고(`refs/heads/orbit/other:main`, 대소문자 push)는 옛 gate부터 있던 수용 부류라 코드로 쫓지 않는다. SKILL 잔여 목록에 두 형태를 적는 일은 적용 뒤 security 단계의 문서 수정으로 넘긴다(사용자에게 보고).
- 1회차 참고 중 고치지 않기로 한 것(접두 패턴 중복, `(N2-b)` 표기, 임시 폴더 정리, router/SKILL.md:88의 `orbit/<run-id>/<task>` D/F 충돌)은 그대로 남는다. router :88은 후속 후보로 보고한다.
- 다음: 사람이 `kit/APPLY.md`를 Claude 밖에서 적용·커밋 → 새 세션에서 qa·security(COMMIT 줄 기록, 훅 시간 실측 포함) → check ship → librarian.

4회차 판정: PASS (차단 없음)

VERDICT: PASS
