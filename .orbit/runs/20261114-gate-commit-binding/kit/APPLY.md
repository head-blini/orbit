# APPLY — 관문 commit-binding kit(N1-N4) 적용 (사람이 Claude 밖에서 실행)

대상: `C:\Users\lclk1\Projects\orbit`. 도구: 일반 PowerShell 5.1 창(Claude 세션 아님), git, node, claude CLI.
명령은 한 줄씩 복사해 붙인다. `&&`는 쓰지 않는다. 각 명령 아래 "기대"와 다르면 멈추고 Lead에게 보고한다.
kit 위치(`<kit>`): `.orbit\runs\20261114-gate-commit-binding\kit` (git 밖이라 지워지면 다시 만들어야 한다). 이번 kit은 파일 두 개(`gate.mjs`, `gate.test.mjs`)뿐이다.

## 1 전제
1. 모든 Claude 세션(터미널, 데스크톱)을 닫는다. gate.mjs가 실행 중인 세션에 즉시 반영되기 때문이다.
2. 저장소 루트에서 브랜치로 간다.
```
cd C:\Users\lclk1\Projects\orbit
```
```
git switch orbit/20261114-gate-commit-binding
```
```
git status --short --untracked-files=no
```
기대: 출력 없음.

## 2 사전 테스트
```
node --test .orbit\runs\20261114-gate-commit-binding\kit\gate.test.mjs
```
기대: `# fail 0`. 아니면 3으로 가지 않는다.

## 3 복사 (2개)
```
Copy-Item .orbit\runs\20261114-gate-commit-binding\kit\gate.mjs harness\hooks\gate.mjs -Force
```
```
Copy-Item .orbit\runs\20261114-gate-commit-binding\kit\gate.test.mjs harness\hooks\gate.test.mjs -Force
```

## 4 확인
```
git diff --stat
```
기대: 정확히 2파일(`harness/hooks/gate.mjs`, `harness/hooks/gate.test.mjs`).
```
node --test harness/hooks/gate.test.mjs
```
기대: exit 0, `# fail 0`, `# pass` 46 초과.
```
claude plugin validate harness
```
기대: exit 0.

## 5 커밋
```
git add -- harness/hooks/gate.mjs harness/hooks/gate.test.mjs
```
(`git add -A`는 쓰지 않는다.)
```
git commit -m "chore(harness): apply gate commit-binding kit N1-N4"
```
```
git log --oneline -1
```
기대: 방금 커밋이 맨 위. **이 해시를 기록한다**(STATE.json `history`, 되돌리기에 필요).

## 6 되돌리기 (문제가 있을 때)
HEAD가 아니라 기록한 해시로 한다(이후 커밋이 쌓였을 수 있다).
```
git revert --no-edit <기록한 해시>
```
기대: gate.mjs, gate.test.mjs가 이전 내용으로 돌아온 새 커밋. 이어서 Lead에게 보고한다. 커밋 전에 실패했다면 두 파일만 되돌린다: `git restore --staged --worktree --source=HEAD -- harness/hooks/gate.mjs harness/hooks/gate.test.mjs`(`git add` 뒤에도 되돌린다. `git reset --hard`·`git clean`은 쓰지 않는다).

## 7 새 세션 확인
```
claude
```
- 폴더 신뢰를 승인한다. `orbit:` 로 시작하는 에이전트 목록이 보이는지 확인한다.
- Lead에게 입력한다: `node "C:\Users\lclk1\Projects\orbit\harness\hooks\gate.mjs" check ship` 실행해 줘
- 기대: 출력에 `run=20261114-gate-commit-binding track=full`이 찍힌다. 이 시점에는 `FAIL commit:`(COMMIT 줄 없음)과 FAIL 관문 줄이 정상이다.
- `/exit`로 닫는다.

## 8 알림
- 적용 뒤에는 COMMIT 줄이 없는 옛 run(`orbit/20261114-harness-plugin` 포함)을 출고할 수 없다.
- 에이전트는 main에서 add·commit·reset 등을 할 수 없다.
- 사람의 터미널 작업은 영향받지 않는다.
