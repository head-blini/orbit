# APPLY — 하네스 강화 kit(S1-S13) 적용 (사람이 Claude 밖에서 실행)

대상: `C:\Users\lclk1\Projects\orbit`. 도구: 일반 PowerShell 5.1 창(Claude 세션 아님), git, node, claude CLI.
명령은 한 줄씩 복사해 붙인다. `&&`는 쓰지 않는다. 각 명령 아래 "기대"와 다르면 멈추고 Lead에게 보고한다.
kit 위치(`<kit>`): `.orbit\runs\20261114-harness-hardening\kit` (git 밖이라 지워지면 다시 만들어야 한다).

## 1 전제
1. 모든 Claude 세션(터미널, 데스크톱)을 닫는다. settings와 gate.mjs가 실행 중인 세션에 즉시 반영되기 때문이다.
2. 저장소 루트에서 브랜치로 간다.
```
cd C:\Users\lclk1\Projects\orbit
```
```
git switch orbit/20261114-harness-hardening
```
```
git status --short --untracked-files=no
```
기대: 출력 없음.

## 2 사전 테스트
```
node --test .orbit\runs\20261114-harness-hardening\kit\gate.test.mjs
```
기대: `# fail 0`. 아니면 3으로 가지 않는다.

## 3 복사 (3개)
```
Copy-Item .orbit\runs\20261114-harness-hardening\kit\gate.mjs harness\hooks\gate.mjs -Force
```
```
Copy-Item .orbit\runs\20261114-harness-hardening\kit\gate.test.mjs harness\hooks\gate.test.mjs -Force
```
```
Copy-Item .orbit\runs\20261114-harness-hardening\kit\settings.json .claude\settings.json -Force
```

## 4 확인
```
git diff --stat
```
기대: 정확히 3파일(`harness/hooks/gate.mjs`, `harness/hooks/gate.test.mjs`, `.claude/settings.json`).
```
git diff -- .claude/settings.json
```
기대: 추가 2줄(`"Read(./.env.*)",` 바로 아래)뿐. 다른 줄이 지워지거나 바뀌었다면 키트 작성 뒤 원본이 바뀐 것이니 멈추고 Lead에게 보고한다.
```
node --test harness/hooks/gate.test.mjs
```
기대: exit 0, `# fail 0`.
```
claude plugin validate harness
```
기대: exit 0.

## 5 커밋
```
git add -- harness/hooks/gate.mjs harness/hooks/gate.test.mjs .claude/settings.json
```
(`git add -A`는 쓰지 않는다.)
```
git commit -m "chore(harness): apply hardening kit S1-S13"
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
기대: gate.mjs, gate.test.mjs, settings.json이 이전 내용으로 돌아온 새 커밋. 이어서 Lead에게 보고한다. 커밋 전에 실패했다면 3파일만 되돌린다: `git restore -- harness/hooks/gate.mjs harness/hooks/gate.test.mjs .claude/settings.json`(`git reset --hard`·`git clean`은 쓰지 않는다).

## 7 새 세션 확인 (기준 12)
```
claude
```
- 폴더 신뢰를 승인한다. `orbit:` 로 시작하는 에이전트 목록이 보이는지 확인한다.
- Lead에게 입력한다: `node "C:\Users\lclk1\Projects\orbit\harness\hooks\gate.mjs" check ship` 실행해 줘
- 기대: 출력에 `run=20261114-harness-hardening track=full`이 찍힌다(이 시점 FAIL 줄은 정상).
- `/exit`로 닫는다.

## 8 선택 제안 (사람이 판단, 적용도 사람이)
CLAUDE.md의 "main 머지와 push는 … 통과해야 열린다." 뒤에 다음을 붙이는 문안을 검토한다.
`(출고 감지는 문자열 검사라 우회 가능, gate 스킬 참조)`
CLAUDE.md는 관문이 막으므로 Claude 밖에서 직접 고치고 git으로 커밋한다.
