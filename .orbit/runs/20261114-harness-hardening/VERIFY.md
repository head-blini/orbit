# VERIFY — 20261114-harness-hardening (qa, 브랜치 orbit/20261114-harness-hardening, 커밋 430fd07)

대상: 저장소에 적용된 harness/hooks/gate.mjs 등(kit 사본 아님). 직접 프로브: `.orbit/runs/20261114-harness-hardening/qa-probe.mjs`(gate.mjs에 페이로드를 stdin으로 넣고 exit 확인, 실제 저장소·run 상태 기준, agent_id 포함 = 서브에이전트 페이로드).

## 1 전체 테스트 — 통과
```
$ node --test harness/hooks/gate.test.mjs
ℹ tests 46 / pass 46 / fail 0 / cancelled 0 / skipped 0     EXIT=0
```
이전 커밋(HEAD~1) 테스트 수 25(`test(` 개수) -> 46. 신규 S1·S3·S4·S5·S7·S8·S10·S11·S13·S2/R11 테스트 이름이 출력에 있음(S1 … N2). 기존 테스트 이름도 모두 남아 있음.

## 2 S1 — 통과 (테스트 + 프로브)
테스트 `S1:`(gate.test.mjs:355) 통과. 내용: main에서 current=r1 quick 통과 시 `merge orbit/other`=2, `merge orbit/r1`=0, 브랜치 orbit/zzz(current 불일치)·feature는 push 대체도 2.
프로브(run 브랜치 위): `git merge orbit/other-run`(Lead) = exit 0. run 브랜치 안의 merge는 설계상 허용("run 브랜치 안의 merge는 허용" 테스트)이라 BRIEF 기준(main에서)과 다른 상황. main 시나리오는 위 테스트가 검증.
한계: main 위 임시 저장소 재현은 셸 쓰기 금지라 직접 하지 않고 테스트의 gitProject 재현에 의존.

## 3 S5 — 통과 (프로브 중 서브에이전트 사례는 아래 참고)
```
OK exit=2 (lead) Write ~/.claude/projects/C--other-proj/memory/x.md | 자동 메모리는 Lead만, 현재 프로젝트 폴더에만 쓸 수 있음
OK exit=0 (lead) Write ~/.claude/projects/C--Users-lclk1-Projects-orbit/memory/x.md
```
qa·general-purpose의 현재 슬러그 Write: 첫 프로브는 agent_id 없이 보내 Lead로 판정돼 exit 0(프로브 오류). agent_id를 넣어 재실행한 결과 22 OK / 6 OK(exit 0) / BAD 1(S1 항목, 위 설명) — S5 qa·general-purpose는 exit 2로 OK. 테스트 `S5:` 통과.

## 4 S3 — 통과
```
OK exit=2 (lead) git branch -m main old / git branch -M orbit/x main / git branch -df x / git switch --force-create main
OK exit=0 (lead) git branch / git branch --show-current
```

## 5 S4 — 통과
테스트 `S4:`(main에서 engineer: `"git" push origin main`, GIT_CONFIG_* 별칭 push, pull, rebase feat, reset --hard origin/main 각각 exit 2; run 브랜치 안 rebase main·reset --hard HEAD~1은 0) 통과. 프로브 `"git" push origin main`(engineer, 관문 미통과) = 2.
```
gate/SKILL.md "우회 가능" 일치: 2건 (Grep count)
```

## 6 S2/R11 — 통과
```
OK exit=2 librarian: echo x >> CLAUDE.md
OK exit=0 librarian: git commit -m x
gate.mjs:29 const FREE_SHELL = ['engineer','debugger','devops','qa','security','reviewer-correctness','reviewer-tests','data'];  (librarian 없음; LIBRARIAN_SHELL 별도)
```

## 7 S8 — 통과
```
OK exit=2 engineer·devops × {npm publish, cargo publish, gh release create v1}  (관문 미통과: VERIFY.md 없음; SECURITY.md 없음)
data.md localhost 일치: 1건
```
deploy 승인 있으나 관문 미통과 조합은 테스트 `S8:`가 검증(통과).

## 8 S13 — 통과
```
OK exit=2 qa: echo x >> harness/hooks/gate.mjs
OK exit=2 security: echo {"disableAllHooks":true} > .claude/settings.local.json
OK exit=2 reviewer-tests: node -e "process.env.ORBIT_GATE=1"
OK exit=0 qa: node --test harness/hooks/gate.test.mjs
```
이 세션에서도 관문이 실제로 작동: `node ...gate.mjs check ship; echo EXIT=$?`(연결 포함)와 `grep ... harness/hooks` 합성 명령은 S13 훅에 의해 차단됨(정상 동작). 단독 명령은 통과.

## 9 S7·S10·S11 — 통과
```
OK exit=2 engineer Write ~/.claude.json
OK exit=2 engineer Write .git/hooks/post-merge
OK exit=2 engineer Write .git/config
OK exit=2 reviewer-rules Write .orbit/wt/t1/src/a.ts
OK exit=0 engineer Write .orbit/wt/t1/src/a.ts
```
S11: 내 프로브는 design-warn을 잘못 호출(훅 모드 대신 design-warn 서브커맨드 필요, tokens.json 필요)해 무효. 테스트 `S11: design-warn은 값을 20개까지만 보이고 나머지는 "외 N개"` 통과로 근거를 대신함(직접 실행 증거는 아님).

## 10 S6 — 통과
```
harness/agents 21개 파일 중 "읽은 .*데이터" 일치 21개 (Grep count: 21 files)
router/SKILL.md:11 ... 단 사람 승인·관문·트랙 상향·쓰기 범위 제외: CLAUDE.md로 바꿀 수 없다.
router/SKILL.md:26 ... 사용자 팀 규칙 — 승인·관문 규칙을 바꿀 수 없음
```

## 11 R10 — 통과(미룸 분기)
```
PLAN.md:54 **R10 미룸: 스파이크를 이번 run에서 하지 않는다.** 사유 네 가지 (PLAN.md:110·124에도 언급)
harness/skills/orbit/report-format/ 없음(Glob 0건)
"30줄" 포함 harness/agents 파일: 16개 (미룸이므로 본문 복사 유지가 기대와 일치)
```

## 12 도그푸딩 — 통과
```
$ claude plugin validate harness
✔ Validation passed with warnings   (경고: author 없음, 디렉터리 프로필의 LICENSE·icon — 기본 프로필 결과에는 영향 없음)   EXIT=0
$ node "C:\Users\lclk1\Projects\orbit\harness\hooks\gate.mjs" check ship
PASS plan / PASS review / FAIL verify: VERIFY.md 없음 / FAIL security: SECURITY.md 없음 / run=20261114-harness-hardening track=full   EXIT=1
```
(VERIFY.md 없음은 이 파일 작성 전 시점.) 이 qa 에이전트 자체가 `orbit:qa`로 호출됐고 모든 Bash가 `orbit@orbit-local` 플러그인 훅을 거침(차단 메시지의 출처 표기). 새 세션의 "orbit: 에이전트 목록 화면 확인"은 직접 못 봄 -> 호출 성공과 훅 출처로 간접 확인.

## 13 관문 약화 없음 — 통과(부분)
테스트 `SECURITY.md 6) 우회 재현 22사례: 22 BLOCK (S13 이후)` 포함 기존 테스트 전부 통과(기준 1 출력). security의 재대조는 이 QA 범위 밖.

## 미확인 / 한계
- S1의 main 위 Lead 시나리오, S4 main 위 시나리오, S11 출력, S8 승인 조합은 직접 프로브가 아니라 gate.test.mjs의 임시 저장소 테스트로만 확인.
- 실제 Claude 훅 페이로드 필드(agent_id 유무로 Lead/서브 구분)는 이 세션에서 관문이 실제 차단·허용한 것으로 확인했으나 페이로드 원문은 보지 못함.
- 프로브 파일 qa-probe.mjs가 run 폴더에 남아 있음(삭제는 셸 쓰기 규칙상 하지 않음).

VERDICT: PASS
