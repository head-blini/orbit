# REVIEW — 20261114-harness-hardening (1회차)

리뷰어 4명(correctness, tests, maintainability, rules)의 최종 메시지를 Lead가 병합. 대상: `git diff main...HEAD`(fd33eac, 6d461ae)와 git 밖 키트 `kit/`(gate.mjs, gate.test.mjs, settings.json, APPLY.md — `git diff --no-index`로 원본과 비교). 네 명 모두 첫 줄 "차단 없음".

## 계획 준수 (correctness, rules)
- 통과. K1·K2·K3·A1·A2 모두 구현. gate.mjs 차이는 S1·S3·S4·S8·S2/R11·S13·S5·S7·S10·S11과 머리 주석뿐. 계획에 없는 코드 변경 없음.
- 키트 테스트 `node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs` → tests 35, pass 35, fail 0 (correctness·tests가 각각 직접 실행). 원본 `node --test harness/hooks/gate.test.mjs` → pass 25, fail 0 (tests).
- 기존 테스트에서 지워진 줄은 3개(:48, :123 제목, :136) — 모두 의도된 변경, 판정은 같거나 더 강함.
- settings 차이 `+2`줄, `"Read(./.env.*)",` 바로 아래. 데이터 문장 21개 파일에 1개씩, "셸은 관문이" 5개 파일.
- 관문 약화 없음(rules): kit/gate.mjs의 모든 변경이 조이는 쪽. `approved()` 리팩터 판정 동일. A 본문에 권한을 넓히거나 승인을 약화하는 문장 없음. Q1~Q5 결정과 일치(R1 제외). 범위 밖(src/, src-tauri/, HARNESS.md, CLAUDE.md, MCP 와일드카드, reference-transaction) 무변경.

## 차단
없음.

## 수정 권고
| # | 위치 | 문제 | 시나리오 | 리뷰어 · confidence |
|---|---|---|---|---|
| R1 | kit/gate.mjs:152, harness/skills/orbit/gate/SKILL.md:38·52 | `git merge orbit/r1 feat`처럼 orbit이 아닌 ref를 하나 더 붙이면 명령 안의 `orbit/<id>`가 current와 같기만 하면 통과. 사용자 결정 Q5("다른 이름의 브랜치는 항상 차단")와 SKILL:38 문구에 어긋남(:52는 잔여로 인정). 기준선보다 약해지지는 않음 | 통과한 run의 Lead·librarian이 관문을 안 거친 `feat`를 main에 함께 머지 | rules · 높음(정규식·문구 대조, 미실행) |
| R2 | kit/gate.mjs:143-147(isShip), :123-128(branchOf) | run 브랜치에서 충돌로 멈춘 rebase의 `--continue`/`--abort`가 항상 막힘. detached HEAD라 branchOf가 'main'을 돌려주고 rebase가 출고 형태로 판정, refForm이라 대체도 없음. 키트 이전에는 없던 막힘. `pull --rebase` 충돌도 같음 | engineer가 `orbit/r1`에서 `git rebase main` 충돌 → 저장소가 rebase 도중 상태로 남음 | correctness · 중간(코드 확인, 미재현) |
| R3 | kit/gate.mjs:273-274 (S13) | 정규식이 대소문자를 구분해 NTFS에서 우회. Edit/Write 보호 정규식(:214-218)은 `i` 플래그 | qa `echo x >> harness/hooks/Gate.mjs`, `echo {} > .CLAUDE/settings.local.json` 허용 | correctness · 중간(코드 확인) |
| R4 | kit/gate.mjs:271, :269 | librarian이 막혔을 때 메시지가 여전히 "git status/log/diff/show만 허용(READ_SHELL)". Lead 메시지의 branch에도 제한 표기 없음 | librarian이 괄호 든 `commit -m`으로 막힌 뒤 add/commit을 못 쓰는 줄 알고 멈추거나 우회 시도 | maintainability · 높음 |
| R5 | kit/gate.mjs:140-145, :264 | 출고 형태 목록이 세 곳(REF_FORMS, isShip 첫 줄, `['merge','pull','rebase']`), `gh pr merge` 정규식 중복. 264행 대체 조건을 읽으려면 세 목록 대조 필요 | 다음에 출고 형태를 더할 때 REF_FORMS를 빠뜨리면 F1 구멍이 다시 열림 | maintainability · 높음 |
| R6 | harness/skills/orbit/gate/SKILL.md:44, :50 | S13 공통 차단(disableAllHooks·ORBIT_GATE, 관문·설정 파일 언급 명령)과 허용되는 읽기 형태(INSPECT_SHELL)가 "훅이 막는 것"에 없음 | qa·Lead가 막힌 이유와 되는 형태를 문서에서 못 찾음 | maintainability · 중간 |
| R7 | kit/gate.test.mjs:369-371 (S3) | LEAD_SHELL을 옛 형태로 되돌려도, FORCE_MOVE에서 `--force-create`나 묶은 옵션을 빼도 통과. 2를 기대하는 단언이 사유를 안 봐 다른 규칙이 막아 줘도 통과 | 변이 후 Lead `git branch -d x`·`git branch newname` 0, engineer `git switch --force-create main` 0인데 스위트 초록 | tests · 높음(재현) |
| R8 | kit/gate.test.mjs:359 (S1 F1) | 대체를 늘 켜거나 MOVES 예외를 없애도 통과. merge는 원래 대체 대상이 아니라 "위치가 바뀌면 대체 안 함"을 검사 못 함 | 변이 후 `cd ../other && git push`, `git branch -f main HEAD`가 0인데 스위트 pass | tests · 높음(재현) |
| R9 | kit/gate.test.mjs:434 (S13) | `disableAllHooks` 유일 사례가 settings 경로 검사에도 걸려, (a)에서 disableAllHooks를 빼도 통과 | qa `node -e "1" --disableAllHooks` 0이 되는 회귀를 놓침 | tests · 높음(재현) |
| R10 | kit/gate.test.mjs:431-443 (S13) | 셸 검사에서 `.claude-plugin`을 가리키는 사례 없음. 패턴에서 지워도 통과 | qa `echo x > x/.claude-plugin/plugin.json` 0이 되는 회귀 | tests · 높음(재현) |

## 참고
- kit/gate.test.mjs:410 — 사용자 이름이 든 개인 경로(`C:\\Users\\lclk1\\…`)가 고정 단언에 있음. 적용하면 플러그인 테스트에 커밋됨. 중립 경로로 바꿔도 슬러그 규칙 검증은 같음(rules · 높음).
- kit/gate.test.mjs:378-384, :353-363 — BRIEF 기준 5·2의 사례 문구를 그대로 쓰지 않음(`git pull . orbit/x` 대신 `git pull` 등, "current=quick A, 브랜치 orbit/B" 대신 `merge orbit/other`). 효력은 같으나 QA가 글자 그대로 대조하면 어긋남. `reset`에서 `--hard` 조건을 빼는(과차단) 변이는 살아남음. 기준 2의 full 트랙 `merge orbit/B` 허용은 quick으로만 확인(correctness, tests).
- kit/gate.mjs:8 — `grep -n FREE_SHELL` 결과의 주석 줄에 "librarian"이 함께 나옴. 목록(:29)에는 없음. QA는 `FREE_SHELL =`로 grep(correctness).
- 정당한 흐름 두 가지(Lead `git switch -c orbit/<id>`, librarian `git switch main` → `git merge --no-ff orbit/<id>`)가 테스트에 없음. 코드로는 허용(correctness).
- kit/gate.test.mjs:404-406 — `import * as gateMod` 중복 import, 파일 중간 import. kit/gate.mjs:118 `READ_SHELL =new` 공백. :151 `shipRunId` export는 쓰는 곳 없음(maintainability).
- kit/APPLY.md:70 — 커밋 전 되돌리기가 `git reset --hard HEAD`. 세 파일만 `git restore -- …`로(maintainability).
- kit/APPLY.md:35 — settings를 병합이 아니라 전체 덮어쓰기. 키트 작성 뒤 원본이 바뀌었다면 조용히 사라짐. 4번 단계는 `--stat`만 봄(rules · 낮음 — 재현 없음, 참고로 내림).

## 미확인 (리뷰어들이 밝힌 것)
- 실제 Claude Code 세션의 훅 페이로드(agent_type 형식, 비ASCII·worktree 슬러그), 키트 적용 뒤 `harness/hooks` 자리 실행, APPLY.md 실제 적용, 기준 12.
- R1·R2·R3은 코드 대조이며 실행 재현은 없음.
- maintainability·rules는 읽기 전용 셸이라 테스트를 돌리지 않음.

## Lead의 처리 결정
- 차단 없음 → 리뷰 관문 통과.
- **사람이 키트를 적용하기 전에 review-fix-1(engineer)**: 적용은 사람 손이 드는 단계라 한 번에 끝내기 위해 수정 권고 R1~R10 전부와 참고 중 개인 경로(:410), 사례 문구(BRIEF 기준 2·5 그대로 추가), 정당한 흐름 2개 테스트, 중복 import·공백·안 쓰는 export, APPLY.md:70 `git restore`, APPLY.md 4번에 settings `git diff` 본문 확인을 고친다. R6은 커밋되는 문서(gate/SKILL.md) 변경.
- 수정 뒤 correctness·tests 2명이 수정분만 재리뷰한다(2회차).

1회차 판정: PASS (차단 없음)

---

# 2회차 (review-fix-1 수정분 한정 재리뷰 — 키트 + 커밋 `f3d680d`)

리뷰어 2명(correctness, tests). 둘 다 첫 줄 "차단 없음". 키트 테스트 `node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs` → tests 43, pass 43, fail 0 (둘 다 직접 실행). 원본 대비 지워진 줄은 3개(:48, :123, :136)로 유지(tests).

## 해소 확인
- **R1 부분 해소**(correctness, decide()와 임시 저장소로 재현): `merge orbit/r1 feat`, `-c x=y merge orbit/r1 feat`, 줄바꿈·`&&`로 이은 두 번째 merge, `-m orbit/r1 feat` 모두 차단. librarian의 `merge --no-ff orbit/r1`, `-m "Merge orbit/r1 into main"`, `--no-edit`는 허용. 남는 것은 N1·N4.
- **R2 해소**: detached에서 4개 형태 단독, `| tail`, `GIT_EDITOR=true` 접두는 허용. `; reset --hard main`, `; rebase main`, `--continue main`, `cd`·`-C`는 차단. 면제 자체는 main으로 가는 새 출고를 열지 않음.
- **R3 해소**: 대소문자 사례 5개 모두 2. `i` 플래그를 빼는 변이도 테스트가 잡음.
- **R4 해소**. **R5 판정 동일**(코드 대조 — 이전 키트 사본과의 직접 diff는 못 함). **R6 해소**(N3 문구 오류 남음).
- **R7~R10 해소**(tests, 변이 재현): 같은 변이를 scratch 사본에 넣자 각각 테스트 1개 실패(42/1). R1 검사 끄기·첫 merge만 보기, R2 면제 끄기·lookahead 제거·위치 변경에도 면제·무조건 면제 변이도 모두 잡힘.

## 새 지적
| # | 심각도 | 위치 | 문제 | 시나리오 | 리뷰어 · confidence |
|---|---|---|---|---|---|
| N1 | 수정 권고 | kit/gate.mjs:147-150 (foreignMerge) | MERGE_ARGS가 `;&\|`에서 끊겨 `-m` 메시지 안에 구분자가 있으면 그 뒤 ref를 검사하지 않음 | main, 관문 통과 후 engineer `git merge -m "x ; orbit/r1" feat` 허용 — ids는 메시지 속 `orbit/r1`에서 채워지고 `feat`는 미검사. Lead·librarian은 ARGS가 `;&\|`를 금지해 해당 없음(FREE_SHELL만) | correctness · 높음(재현) |
| N2 | 수정 권고 | kit/gate.mjs:157-158 (isShip), gate/SKILL.md 잔여 목록 | run 브랜치에서 main을 바꾸는 `git rebase orbit/r1 main`, `git fetch . HEAD:main`이 출고로 판정되지 않음 | standard 트랙, 관문이 하나도 없는 상태에서 둘 다 허용, 실행 뒤 main에 r1 커밋이 들어감(재현, main log `r1,base`). rebase 쪽은 키트가 막는다고 쓴 범위 안의 구멍. fetch는 원본에서도 열려 있어 회귀 아님. 둘 다 SKILL 잔여 목록에 없음 | correctness · 높음(재현) |
| N5 | 수정 권고 | kit/gate.test.mjs:474 | `-m` 메시지 뒤에 ref가 오는 사례 없음. `-m` 제거 정규식을 `/\s-m\s+.*/g`로 넓혀도 통과 | 변이 후 main에서 `git merge orbit/r1 -m x feat` 0 | tests · 높음(재현) |
| N6 | 수정 권고 | kit/gate.test.mjs:469-481 | `orbit/<id>`를 품었지만 그 형태는 아닌 ref(`feat-orbit/r1`, `origin/orbit/r1`) 사례 없음. `^orbit\/[\w.-]+$`를 `orbit\/`로 넓혀도 통과 | 변이 후 main으로의 `git merge feat-orbit/r1` 0 | tests · 높음(재현) |
| N7 | 수정 권고(참고에서 올림 — 재현된 허용 경로) | kit/gate.mjs:163, :277 | main에서 `git pull . feat-orbit/r1`이 허용. ids가 r1이 되고 foreignMerge는 merge만 봄. SKILL:52 잔여 문구에 이 단일 ref 형태 없음 | 관문 통과한 run이 있을 때 비-orbit 브랜치를 pull로 main에 넣음 | tests · 높음(재현) |
| N3 | 참고 | gate/SKILL.md "셸 공통" | 문서는 `disableAllHooks`·`ORBIT_GATE`가 든 명령도 읽기 형태면 허용되는 것처럼 읽히나 코드(:284)는 항상 막음(qa `git log --grep=orbit_gate` 차단) | correctness · 중간 |
| N4 | 참고(과차단, 닫힌 쪽) | kit/gate.mjs foreignMerge, :145 | `--message "a b"`, `--message="a b"`, `-F msg.txt`, `-s ours`, `-X theirs`, `merge "orbit/r1"`이 main·관문 통과 상태에서도 막힘. detached에서 `git -c core.editor=true rebase --continue`, `git rebase --continue 2>&1`도 막힘 | correctness, tests · 높음(재현) |
| N8 | 참고 | kit/gate.mjs:145 | 면제 플래그 목록을 `--[\w-]+`로 넓히는 변이가 살아남음(단독 `git rebase --root`가 main에서 면제). 영향은 main 자체의 이력 재작성 | tests · 중간 |

## 미확인
- 실제 Claude Code 세션의 훅 페이로드, harness/hooks 자리 실행, APPLY.md 실제 적용, PowerShell 도구 경로, 진짜 충돌 상태의 rebase(테스트는 `checkout --detach`로 흉내).
- tests 리뷰어는 원본 `harness/hooks/gate.test.mjs`를 다시 돌리지 않음(engineer 보고 pass 25).

## Lead의 처리 결정
- 차단 없음 → 리뷰 관문 통과 유지.
- **키트 적용 전 review-fix-2(engineer, 작게)**: N1·N2·N7(출고 구멍), N5·N6(테스트), N3(문구), N4 중 librarian이 실제로 쓰는 형태의 과차단(`-F <파일>`, 따옴표 친 `"orbit/<id>"`). N8과 N4의 나머지는 닫힌 쪽이라 고치지 않고 gate/SKILL.md에 적는다.
- 수정 뒤 correctness 1명이 수정분만 재리뷰한다(3회차, 루프 2/3). 그 뒤에도 남는 문자열 우회는 PLAN "위험"대로 문서화하고(git 쪽 강제는 사용자가 Q4에서 미룸) 키트 적용으로 넘어간다.

2회차 판정: PASS (차단 없음)

---

# 3회차 (review-fix-2 수정분 한정 재리뷰 — 키트 + 커밋 `8c1fd59`)

리뷰어 1명(correctness). 첫 줄 "차단 없음". 키트 테스트 `node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs` → tests 46, pass 46, fail 0(직접 실행).

**증거의 한계**: 이번 회차는 decide() 프로브와 임시 저장소 재현, scratch 변이 실행을 **하지 못했다**. 프로브 명령 문자열이 이 저장소의 실제 관문 훅에 출고로 판정돼 막혔고, 문자열을 쪼개는 우회는 auto mode 분류기가 거부해 리뷰어가 더 시도하지 않았다. 아래 판정은 모두 kit/gate.mjs를 줄 단위로 따라간 코드 대조다(confidence 중간).

## 해소 여부 (코드 대조)
- **N1 부분 해소**: `-m "x ; orbit/r1" feat`는 막힘. 붙여 쓴 값(`-m"orbit/r1 ;" feat`, `--message="orbit/r1 ;" feat`)과 이스케이프된 따옴표는 걷히지 않음 → P1.
- **N2 부분 해소**: `rebase orbit/r1 main`, `fetch . HEAD:main`, `+HEAD:refs/heads/main`은 출고 판정. 대상을 따옴표로 감싸면 빠짐 → P2.
- **N7 부분 해소**: `feat-orbit/r1`, `origin/orbit/r1`, `.orbit/runs/...`는 id로 안 침. `+ @ , = !`는 lookbehind 밖 → P3.
- **N3 해소**. **N4 해소(요청 범위)**: librarian `merge --no-ff -F .orbit/runs/<id>/X.txt orbit/<id>`, `merge --no-ff "orbit/<id>"` 허용.
- 정당한 흐름은 막히지 않음: Lead `switch -c orbit/<id>`, engineer의 run 브랜치 `rebase main`·`rebase -i main`·`fetch origin`·`commit -F`, librarian `switch main` → `merge --no-ff orbit/<id>`.

## 새 지적
| # | 심각도 | 위치 | 문제 | 시나리오 | confidence |
|---|---|---|---|---|---|
| P1 | 수정 권고 | kit/gate.mjs:150 | `-m`/`-F` 값 제거가 공백으로 띄운 형태만 봄 | main, 관문 통과 상태에서 자유 셸 역할의 `git merge -m"orbit/r1 ;" feat` 허용 → 검토 안 된 feat가 main에. Lead·librarian은 ARGS가 `;`를 금지해 해당 없음. 원본에는 이 merge 검사가 없었으므로 키트가 새로 연 구멍은 아님 | 중간 |
| P2 | 수정 권고 | kit/gate.mjs:156 | main 대상 판정이 따옴표 친 `"main"`, `:"main"`을 놓침 | standard 트랙, run 브랜치, 관문 없는 상태에서 `git rebase orbit/r1 "main"`, `git fetch . HEAD:"main"` 허용. 2회차 N2와 같은 결과(원본에서도 열려 있던 경로) | 중간 |
| P3 | 수정 권고 | kit/gate.mjs:166 | lookbehind가 브랜치 이름에 쓸 수 있는 `+ @ , = !`를 빼 둠 | 관문 통과 상태의 main에서 `git pull . feat+orbit/r1` → ids가 r1, pull은 foreignMerge 대상이 아니라 통과 | 중간 |
| P4 | 참고(닫힌 쪽 과차단) | kit/gate.mjs:156 | `\brebase\b`가 git 하위 명령에 묶여 있지 않고 `--rebase` 안의 단어도 잡음 | run 브랜치에서도 항상 막힘: engineer `git pull --rebase origin main`, `git commit -m "rebase onto main"`, 모든 역할 `git log --grep "rebase x main"`. 다른 형태로 고쳐 쓰면 됨 | 중간 |
| P5 | 참고 | kit/gate.test.mjs | 살아남는 변이(코드 대조): lookbehind에서 `.` 빼기(`-F .orbit/...` 사례 없음), rebase upstream을 orbit/ 형태로 좁히기(`rebase feat main` 사례 없음), 따옴표 형태 | — | 중간 |

P1~P3은 gate/SKILL.md:38의 "문자열 우회 가능"에 포괄적으로만 들어 있고 :53 잔여 목록에는 이 형태들이 없다.

## 미확인
- decide() 실행·임시 저장소 재현·변이 실행(위 사유), 원본 `harness/hooks/gate.test.mjs` 재실행, 실제 세션 훅 페이로드와 PowerShell 경로, `MAIN`처럼 대소문자를 바꾼 rebase 대상.

## Lead의 처리 결정
- 차단 없음 → 리뷰 관문 통과.
- **P1~P3은 코드로 더 쫓지 않는다.** 세 회차 연속으로 따옴표·붙여쓰기·문자 집합 변형이 나왔고, 모두 "관문이 이미 통과한 run이 있거나(P1·P3) 원본에서도 열려 있던 경로(P2)"다. 미통과 run이 `orbit/<id>` 머지로 main에 들어가는 경로는 닫혀 있다. 문자열 검사로는 끝이 없고, 실제 해법은 사용자가 Q4에서 미룬 git 쪽 강제(`reference-transaction`)다 → 다음 run 후보로 사용자에게 보고한다.
- **문서만 고친다(engineer, doc-fix-3)**: gate/SKILL.md 잔여 목록에 P1~P3 형태와 P4 과차단(`git pull --rebase origin main` 대신 `git fetch origin` + `git rebase origin/main`)을 이름으로 적는다.
- P5 테스트 공백은 미룬다.

VERDICT: PASS
