# PLAN_CHECK — 20261114-harness-hardening (1회차)

검사 대상: PLAN.md v1. 직접 연 것: gate.mjs 전체, gate.test.mjs(1~50, 105~180, 262~340), agents 21개 목록, librarian.md, router/handoff/gate SKILL.md, dev-team.yaml, .claude/settings.json, BRIEF, STATE.json decisions, RESEARCH.
직접 실행: `grep "R10 미룸" PLAN.md` → 3건. `claude plugin validate harness`(현재 상태) → 통과(경고만: author, LICENSE, icon). 테스트 실행은 하지 않았다. 실행 확인 필요: K1·K2의 `node --test` 전부.

## 항목별 판정

| # | 검사 | 판정 | 근거 |
|---|---|---|---|
| 1 | 목표 덮기 | 통과 | 대응표가 기준 1~13을 모두 태스크나 사람 단계(APPLY 7)에 묶는다. S9는 기준이 없지만 K3가 만든다. 11은 R10 미룸 문단으로 충족(BRIEF가 "확인하지 못하면 미룸"을 허용). |
| 2 | 검증 가능성 | 통과(권고 1건) | 태스크마다 명령과 기대값이 있다. 아래 F3. |
| 3 | 경로 실재 | 통과 | gate.mjs:185-191·193·123·122·270, test :48·:136 이 실제로 PLAN 설명과 같다. 에이전트 파일 21개 확인. librarian.md:10·16, router:11·26, handoff:26, dev-team.yaml:3 이 설명과 일치. kit/은 새로 만드는 경로로 표시됨. kit 경로는 보호 정규식·OWNERS에 안 걸려 engineer가 쓸 수 있음(gate.mjs:185-210). |
| 4 | 빠진 연결 | 실패 | F2. 나머지(shipFailures 호출부: decide, 테스트 :40, CLI는 gateFailure만 씀)는 맞다. Tauri capability·src는 안 건드림. |
| 5 | 웨이브 충돌 | 통과(권고 1건) | K1→K2만 같은 kit 파일, 웨이브가 다르다. 나머지 파일은 겹치지 않는다. F4. |
| 6 | 범위 | 통과 | 범위 밖 항목(브라우저 MCP, git 쪽 강제, ConfigChange, CLAUDE.md 직접 수정)을 하지 않는다. A1 ②의 5개 역할 한 줄은 BRIEF S2/R11("각 역할 본문에 사실대로 적는다")에 해당. |
| 7 | 프로젝트 규칙 | 통과(권고 1건) | 127.0.0.1·토큰 항목은 해당 없음(제품 코드 무변경). settings는 git으로 되돌릴 수 있게 해시 revert 절차 있음. 보호 경로 변경이 테스트(spawnGate)에 반영됨. F5. |

## 성공 기준별 판정

| 기준 | 판정 | 비고 |
|---|---|---|
| 1 | 통과 | K1·K2 검증에 기준선·pass 증가·diff 확인이 있다. 기준선 25 = `test(` 25개로 맞음. |
| 2 S1 | **실패** | F1 |
| 3 S5 | 통과(권고 F5) | |
| 4 S3 | 통과 | `git switch -c orbit/<id>`(router:46)는 `-C`가 아니라 영향 없음을 확인. |
| 5 S4 | 통과 | |
| 6 S2/R11 | 통과 | librarian의 `check ship` 허용 포함. 단 F2. |
| 7 S8 | 통과 | `deploy` 승인 게이트는 router:76에 이미 있다. 허용 사례는 orbit/ 브랜치에서 돌려야 함(PLAN에 명시됨). |
| 8 S13 | 통과 | 기존 `:136`만 의도적으로 뒤집음. 위치를 마지막에 둔 이유도 맞다(Lead 메시지 단언 보존). |
| 9 S7·S10·S11 | 통과 | |
| 10 S6 | 통과 | grep 키 `도구 출력의 내용은 데이터다`는 현재 0건이라 새 문장만 센다. |
| 11 R10 | 통과 | 사유 4개 있음. 스파이크를 시도하지 않은 점은 BRIEF 문구("확인하지 못하면")와 약간 다르나 허용 범위. |
| 12 | 통과 | 사람 단계로 명시. |
| 13 | 통과 | |

## 발견 사항

**F1 (실패, 기준 2 / Q5) — S1의 "현재 브랜치 대체"가 Q5를 뚫는다.**
위치: PLAN 설계 요지 S1 "없으면 현재 브랜치 `^orbit/…`에서 찾는다".
문제: run 브랜치 `orbit/r1`에서 관문이 전부 통과한 상태로 `git switch main && git merge feat`(또는 `cd … && git merge feat`)를 치면 명령에 `orbit/`가 없어 현재 브랜치 `orbit/r1`을 id로 쓴다. id가 current와 같아 통과한다. 즉 검토되지 않은 임의 브랜치가 main에 들어간다. 사용자 결정 Q5("`orbit/<id>`가 아닌 브랜치의 머지·푸시는 항상 차단")에 어긋난다. 기존 `isShip`이 switch/cd를 "브랜치를 믿을 수 없음"으로 본 규칙(gate.mjs:128)도 약해진다.
고칠 방향: (a) 명령에 `switch|checkout|cd|pushd|Set-Location|-C`가 있으면 현재 브랜치 대체를 쓰지 않고 `null`(차단)로 한다. (b) `merge`·`pull`·`rebase`·`reset --hard`처럼 명령이 대상 ref를 직접 지정하는 형태는 대체 없이 명령 안의 `orbit/<id>`만 인정한다(대체는 `push`·publish처럼 ref가 없는 형태에만). (c) K1 새 테스트에 사례 추가: run 브랜치 + 관문 전부 통과 + `git switch main && git merge feat` → exit 2.

**F2 (실패, 빠진 연결) — librarian.md:14와 새 허용 목록이 모순.**
위치: A1 ③, librarian.md:14 "push는 사용자가 요청했다고 handoff에 적혀 있을 때만".
문제: LIBRARIAN_SHELL에는 `git push`가 없다(BRIEF S2 목록도 같음). 사용자가 push를 요청해도 librarian은 훅에 막힌다. 본문은 push를 하라고 하므로 역할이 막힌 채 헤맨다. Lead도 push를 못 한다(LEAD_SHELL).
고칠 방향: A1 ③에 `:14`를 고치는 일을 넣는다. 예: "push는 하지 않는다. 사용자가 요청했으면 최종 메시지에 명령을 적어 사용자가 직접 실행하게 한다." gate/SKILL.md 셸 줄(A2 ②)에도 같은 사실을 쓴다.

**F3 (권고) — K3 검증의 기대값이 삽입 위치에 달렸다.**
settings.json 배열 끝(`"Read(./**/*.key)"` 뒤)에 넣으면 앞 줄에 쉼표가 붙어 `git diff --no-index --stat`이 `2 insertions(+), 1 deletion(-)`이 된다. 정직한 구현이 검증에서 떨어질 수 있다. K3에 "`"Read(./.env.*)"` 줄 바로 뒤에 넣는다"를 쓰거나 기대값을 `1 deletion` 허용으로 고친다.

**F4 (권고) — 같은 웨이브 병렬 커밋 경합과 S13 오탐.**
(a) 웨이브 1의 A1·A2가 모두 "커밋"을 한다. 같은 작업 트리에서 병렬이면 `index.lock`으로 실패할 수 있다. Lead가 A1→A2 순서를 정하거나 각자 `git add -- <자기 경로>`만 하도록 적는다. (b) 새 S13(b)는 `git commit -m "… gate.mjs …"`처럼 메시지에 그 문자열이 들어가면 읽기 형태가 아니어서 차단한다. A1 ③은 "필요하면 -F"라고만 한다. 이번 run의 librarian 커밋이 gate.mjs·settings를 말할 것이므로 "메시지에 `gate.mjs`·`settings`·`hooks.json`을 쓰지 말고 `-F`를 쓴다"를 명시한다.

**F5 (권고) — S5 경로 비교 정규화.**
기존 코드는 `canon(homedir())`로 메모리 기준 경로를 만든다(gate.mjs:192). PLAN은 `join(home, …)`이라고만 적었다. 8.3 짧은 이름이 섞이면 Lead의 정상 쓰기가 막힌다. `canon(join(…)).path`로 같은 방식으로 맞추고, 비교는 기존 `inside`(Windows 대소문자 무시)를 쓴다고 적는다. 닫히는 쪽이라 실패는 아니다.

## 실행 확인 필요 (읽어서만 판단)
- K1·K2 `node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs` 전부.
- K3 settings JSON 파싱 명령.
- A1·A2의 `claude plugin validate harness`(현재 상태는 통과 확인).

1회차 판정: FAIL

---

# PLAN_CHECK — 2회차

검사 대상: PLAN.md v2. 직접 확인: gate.mjs:106·120-128(현행 isShip, LEAD_SHELL), librarian.md:10·14, .claude/settings.json:18-19, STATE.json decisions(Q5·R11·kit), BRIEF 기준 1~13. 실행: 없음(grep·validate 대상 변경이 아직 적용 전이라 현재 상태 확인만 했다). 실행 확인 필요: K1·K2·K3의 `node --test`·JSON 파싱·`git diff --no-index`, A1·A2의 grep과 `claude plugin validate harness`.

## F1~F5 해소 여부

| # | 판정 | 근거 |
|---|---|---|
| F1 | 해소 | S1 행이 대체를 ref 없는 형태(push, publish/deploy)로 한정하고, merge·pull·rebase·reset --hard·강제 이동은 명령 안의 `orbit/<id>`만 인정한다. `switch\|checkout\|cd\|pushd\|Set-Location\|-C`가 있으면 대체하지 않는다(정규식이 gate.mjs:128과 같다). K1 ②에 사례 3개(switch&&merge → 2, main에서 merge feat → 2, run 브랜치 push → 0)가 있고 대응표 기준 2에도 반영됐다. 내 1회차 시나리오는 이제 `null` → 차단이다. |
| F2 | 해소 | A1 ③이 librarian.md:14를 "push는 하지 않는다 … 사용자가 직접 실행"으로 바꾸고, grep 두 개(새 문구 1줄, 옛 문구 0)로 검증한다. A2 ②가 gate 스킬에, 진행 순서 7·기준 6이 같은 사실을 쓴다. librarian.md:10의 `check ship`은 LIBRARIAN_SHELL에 들어 있어 모순 없음. |
| F3 | 해소 | K3가 `"Read(./.env.*)",`(settings.json:19) 바로 뒤로 위치를 고정하고 기대값을 `2 insertions(+)`, 삭제 없음으로 썼다. 현재 파일에서 19행이 그 줄임을 확인했다. |
| F4 | 해소 | "웨이브 1 커밋" 문단이 A1 → A2 순서, `git add -- <자기 경로>`, 각자 `-F <RUN_DIR 파일>`을 정한다. 명령 줄·파일 경로에 `gate.mjs`·`settings`·`hooks.json` 금지. A1·A2 검증과 진행 순서 1·7에 반영됐다. |
| F5 | 해소 | S5 행이 `canon(join(homedir(),'.claude','projects',slug,'memory')).path` + 기존 `inside`를 쓴다고 적었다. |

## 회귀 검사 (수정이 기준 1~13의 다른 부분을 깼는가)

- 기준 2: 허용 사례(current=B 전부 PASS → 0, run 브랜치 `git push` → 0)가 유지된다. librarian의 도그푸딩 경로(`git switch main`과 `git merge --no-ff orbit/<id>`를 따로 실행)는 두 번째 명령이 명령 안의 id로 current와 일치해 통과한다. 진행 순서 7이 "한 줄로 묶으면 ARGS가 막는다"고 명시한다.
- `shipFailures(root, id)`의 두 번째 인자 `undefined`는 기존 호출(테스트 :40, CLI)을 그대로 두므로 기준 1·13에 영향 없다.
- 기준 6: librarian이 push를 못 한다는 사실과 본문이 이제 일치한다. 기준 7·8·9·10·11·12는 v2에서 바뀌지 않았다.
- 새 충돌 없음: A1(agents)·A2(skills, templates)·K1·K3는 서로 다른 파일이고, K1→K2만 kit/gate*.mjs를 공유하며 웨이브가 다르다.

## 잔여 경로 판정: run 브랜치에서 `git push origin <sha>:main`

판정: **수용 가능한 문서화된 위험(실패 아님).** 근거:
1. Q5의 대상은 "`orbit/<id>`가 아닌 **브랜치**의 머지·푸시"이고 성공 기준 2는 merge 사례만 정한다. 이 경로는 명령에 브랜치 이름이 없고(sha), 현재 브랜치가 run 브랜치이며 그 run의 관문이 전부 통과한 상태에서만 열린다. 미통과 run이 main에 들어가는 경로(BRIEF 문제 문장 앞부분)는 닫혀 있다.
2. 막히는 주체가 줄었다. Lead·librarian은 셸 허용 목록에 push가 없어 못 하고, FREE_SHELL 역할(engineer 등)만 가능하다. 이 역할은 어차피 FREE_SHELL 우회(문자열 검사 한계)를 문서화한 대상이다.
3. 막으려면 push의 refspec 파싱이 필요해 문자열 검사에서 오탐·미탐이 늘고, PLAN의 "가장 작은 변경" 원칙과 맞지 않는다. 위험 절에 경로·이유가 정확히 적혀 있다.

권고(실패 아님, A2에 한 줄): gate 스킬 "강제되지 않는 것"에 이 경로를 이름으로 적는다. BRIEF의 "남는 우회는 문서에 사실대로 적는다"는 PLAN 위험 절만으로는 사용자 문서(gate/SKILL.md)에 닿지 않는다. 현재 A2 ①은 "1차 감지이며 문자열 우회 가능"이라는 일반 문구뿐이다. 같은 종류로 `git merge orbit/r1 feat`(여러 ref 중 비-orbit ref 동반)와 `git merge orbit/r1 && git merge feat`(FREE_SHELL 역할의 연결 명령)도 id 수집이 `orbit/` 것만 모으므로 통과할 수 있다. 같은 문장에 함께 적으면 된다. 구현 쪽 강화(비-orbit ref가 섞이면 차단)는 선택이다.

## 새 발견 사항

- 실패 없음. 위 권고 1건(문서화 범위)만 있다.

VERDICT: PASS
