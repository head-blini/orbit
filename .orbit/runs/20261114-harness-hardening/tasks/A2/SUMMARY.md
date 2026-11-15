SUMMARY A2 (편집·검증만, 커밋 안 함)

바꾼 파일 (stage 안 됨, `git status`상 ` M` 4개):
- harness/skills/orbit/gate/SKILL.md
- harness/skills/orbit/router/SKILL.md
- harness/skills/orbit/handoff/SKILL.md
- harness/templates/dev-team.yaml
- 커밋 메시지: C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-harness-hardening\COMMIT_A2.txt (`git commit -F`용)

커밋 해시: 없음. Lead 지시를 기다린다.

검증 (실행한 명령과 결과):
```
grep -c "우회 가능" gate/SKILL.md                         -> 2
grep -n "승인·관문·트랙 상향·쓰기 범위 제외" router/SKILL.md -> 11행 1줄
grep -c "승인·관문 규칙을 바꿀 수 없음" router, handoff     -> 각 1
grep -n "사용자가 직접 실행" gate/SKILL.md                  -> 45행 1줄
claude plugin validate harness                             -> exit=0 (경고: author, LICENSE, icon만. 기존과 같고 이 변경과 무관)
```

내용:
- gate: 출고 줄(S1 id 일치·비-orbit 브랜치 항상 차단·quick run 경로 수용·S4 형태·"1차 감지이며 문자열 우회 가능"), 게시·배포 줄(S8), 보호 경로(S7), 쓰기 범위(S10 `.orbit/wt/`, S5 메모리), 셸 줄(Lead `branch` 제한, librarian 허용 목록, push는 사용자가 직접 실행), "강제되지 않는 것"에 S13 항목을 더했다.
- PLAN_CHECK 2회차 권고 반영: 같은 곳에 잔여 경로를 이름으로 적었다(`git push origin <sha>:main`, `git merge orbit/r1 feat`, `git merge orbit/r1 && git merge feat`).
- router 11행과 26행, handoff 26행, dev-team.yaml 3행 아래에 PLAN대로 문구를 넣었다.

계획과 달라진 점:
- dev-team.yaml은 3행 끝에 이어 붙이지 않고 새 주석 줄(4행)로 넣었다. 주석이라 의미는 같다.
- 검증하지 못한 것: 위 grep과 validate 외에는 없다. 문서만 바뀌어 테스트 대상은 없다.
- `git status`에 A1 파일(harness/agents)은 아직 보이지 않았다. A1 편집이 아직 안 됐거나 이미 커밋됐는지는 확인하지 못했다.

(커밋은 A1 커밋 뒤 Lead가 별도 engineer 호출로 지시.)

커밋(별도 engineer 호출의 보고 그대로): 6d461ae357a11c146d7fc0a39acc8a45aee2c274
```
 harness/skills/orbit/gate/SKILL.md    | 11 +++++++----
 harness/skills/orbit/handoff/SKILL.md |  2 +-
 harness/skills/orbit/router/SKILL.md  |  4 ++--
 harness/templates/dev-team.yaml       |  1 +
 4 files changed, 11 insertions(+), 7 deletions(-)
```
git status --short: 출력 없음.
