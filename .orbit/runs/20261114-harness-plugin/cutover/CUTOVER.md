# CUTOVER — 옛 하네스에서 orbit 플러그인으로 전환 (사람이 Claude 밖에서 실행)

대상: 오르빗 저장소 `C:\Users\lclk1\Projects\orbit`. 도구: 일반 PowerShell 5.1 창(Claude 세션 아님), git, claude CLI.
이 문서의 명령은 한 줄씩 복사해 붙인다. `&&`는 쓰지 않는다. 각 명령 아래의 "기대"와 다르면 멈추고 그 절의 `[ABORT]`를 따른다.

규칙 (세 개 모두 지킨다)
- `NO-WORK-IN-STEP4`: STEP4(겹치기 구간)에서는 로드 확인만 한다. 코드·문서 작업을 하지 않는다.
- `NO-SETTINGS-EDIT-AFTER-C2`: C2 커밋 뒤에는 `.claude/settings.json`을 고치지 않는다(고치면 나중 `git revert`가 충돌한다).
- `NO-GIT-CLEAN`: 중단할 때 `git clean`을 쓰지 않는다. 확인 세션이 만든 `??` 파일(예: `.claude/settings.local.json`)을 지우지 않는다. 커밋에는 `git add -- <파일>`로 지정한 파일만 들어가므로 두어도 된다.
- 하지 않는 것: `--settings <파일>`로 Claude를 실행하지 않는다. 그렇게 하면 선언된 마켓플레이스가 사용자 수준 `~\.claude\plugins\known_marketplaces.json`에 자동 등록된다(S2에서 확인). 또 `ORBIT_GATE=off`를 쓰지 않는다.

## 시작 전 확인 (한 번)

1. 모든 Claude 세션(터미널, 데스크톱)을 닫는다.
2. PowerShell을 연다. 저장소 루트로 간다.
```
cd C:\Users\lclk1\Projects\orbit
```
3. run 산출물(cutover 원본)이 있는지 본다.
```
Test-Path .orbit\runs\20261114-harness-plugin\cutover\settings.step1.json
```
기대: `True`. `False`면 시작하지 않고 Lead에게 알린다(`.orbit/`은 git 밖이라 지워졌을 수 있다).

## [STEP4] C1 겹치기: 옛 관문 + 새 플러그인 관문을 함께 켠다

### 4-1 전제 확인
```
git status --short --untracked-files=no
```
기대: 출력 없음. 뭔가 나오면 시작하지 않는다(`??` 파일은 `--untracked-files=no`라 보이지 않고, 전제에 넣지 않으며 지우지도 않는다).
```
git log --oneline -3
```
기대: 맨 위가 M1 머지 커밋(브랜치를 main에 머지한 커밋). 아니면 시작하지 않고 Lead에게 알린다.

### 4-2 복사
```
Copy-Item .orbit\runs\20261114-harness-plugin\cutover\settings.step1.json .claude\settings.json -Force
```
```
git add -- .claude/settings.json
```
(`git add -A`는 쓰지 않는다.)

### 4-3 커밋 전 확인
```
git status --short --untracked-files=no
```
기대: 정확히 한 줄 `M  .claude/settings.json`.
```
claude plugin list
```
기대: `orbit@orbit-local`이 enabled로 보인다. 안 보이면 아래 [CACHE] 끝의 "로드되지 않을 때만"을 먼저 한 번 시도한다.

새 대화형 세션에서 확인한다(헤드리스 `claude -p`는 폴더 신뢰 승인이 없어 로드되지 않을 수 있으므로 확인용으로 쓰지 않는다).
```
claude
```
- 폴더 신뢰 질문이 나오면 승인한다.
- `/hooks`를 입력한다. 기대: 옛 `.claude/hooks/gate.mjs`의 PreToolUse와 플러그인(orbit)의 PreToolUse가 둘 다 보인다.
- `/agents`(또는 에이전트 목록)에서 `orbit:` 로 시작하는 에이전트가 보이는지 본다. 기대: 21개 근처(`orbit:lead`, `orbit:engineer` …).
- `NO-WORK-IN-STEP4`: 여기서 다른 것을 시키지 않는다. `/exit`로 닫는다.

데스크톱 확인은 아래 [DESKTOP]을 따른다. 끝나면 다시 일반 PowerShell에서:
```
git diff --cached --stat
```
기대: `.claude/settings.json` 한 파일만. 확인 세션이 settings.json을 다시 썼는지 보려면:
```
git diff -- .claude/settings.json
```
기대: 출력 없음. 출력이 있으면(step1과 달라졌다) `[ABORT]` 후 Lead에게 보고한다.
```
git status --short --untracked-files=no
```
기대: 여전히 `M  .claude/settings.json` 한 줄.

### 4-4 커밋
```
git commit -m "chore(harness): C1 declare orbit plugin, keep old hooks"
```
```
git log --oneline -1
```
기대: 방금 커밋이 맨 위.

### [ABORT] (STEP4, 커밋 전에 실패했을 때)
1. Claude 세션을 모두 닫는다.
```
git reset --hard HEAD
```
2. 결과 확인.
```
git status --short
```
- 되돌려지는 것: HEAD에 있는 추적 파일(`.claude/settings.json`)과 index.
- 남는 것: 추적되지 않은 파일(`??`)과 gitignore된 `.orbit/`(cutover 원본, STATE.json, run 산출물).
- 안전한 이유: 4-1에서 추적 파일 변경이 없음을 확인했고, `git add`가 이미 추적 중인 파일만 지정했기 때문에 지워질 새 파일이 없다. `NO-GIT-CLEAN`.
3. 원인을 Lead에게 보고하고 4-1부터 다시 시작한다.

### [REVERT] (STEP4, 커밋 뒤에 문제가 발견됐을 때)
```
git revert --no-edit HEAD
```
기대: settings.json이 이전 내용으로 돌아온 새 커밋이 생긴다. 이어서 Lead에게 보고한다.

## [STEP5] C2 옛 하네스 제거: 새 관문만 남긴다

### 5-1 전제 확인
Claude 세션이 모두 닫혀 있어야 한다.
```
git status --short --untracked-files=no
```
기대: 출력 없음.
```
git log --oneline -3
```
기대: 맨 위가 C1(STEP4 커밋). 아니면 시작하지 않는다.

### 5-2 복사와 삭제
```
Copy-Item .orbit\runs\20261114-harness-plugin\cutover\settings.step2.json .claude\settings.json -Force
```
```
Copy-Item .orbit\runs\20261114-harness-plugin\cutover\CLAUDE.step2.md CLAUDE.md -Force
```
```
git rm -r .claude/hooks .claude/agents .claude/skills
```
기대: 삭제된 파일 목록(`rm '.claude/hooks/gate.mjs'` 등)이 나온다. 에러가 나면 `[ABORT]`.
```
git add -- .claude/settings.json CLAUDE.md
```
(`git add -A`는 쓰지 않는다.)

### 5-3 커밋 전 확인
```
git status --short --untracked-files=no
```
기대: `M  .claude/settings.json`, `M  CLAUDE.md`, 그리고 `D  .claude/hooks/…`·`D  .claude/agents/…`·`D  .claude/skills/…` 줄들만. 다른 문자(`??` 제외)가 있으면 `[ABORT]`. `??` 파일은 `git status --short`로 이름만 적어 둔다(실패 아님).

새 세션에서 확인한다.
```
claude
```
- 폴더 신뢰를 승인한다. `orbit:` 에이전트가 목록에 보이는지 확인한다(없으면 CLAUDE.md의 안전장치대로 작업하지 말고 `[ABORT]`).
- `/hooks`: 플러그인(orbit)의 PreToolUse와 settings의 PreToolUse(백스톱)가 보여야 한다. 옛 `.claude/hooks`의 gate는 이미 없다. 백스톱은 플러그인이 로드되지 않아도 관문이 걸리게 하려고 남긴 것이다(`${CLAUDE_PROJECT_DIR}/harness/hooks/gate.mjs`). 플러그인이 로드되면 같은 gate가 두 번 실행되지만 판정이 같아 무해하다.
- Lead(이 세션)에게 입력한다: `src 폴더에 hello.txt를 만들고 hello라고 써 줘`
- 기대: 쓰기가 막히고 `[orbit gate]`로 시작하는 메시지가 나온다. 경로는 `harness\hooks\gate.mjs`다(directory source는 저장소의 `harness/`를 그 자리에서 로드하므로 플러그인 gate와 백스톱 gate는 같은 파일이다). 막히지 않으면 `[ABORT]`.
- Lead에게 이어서 입력한다: `ls를 한 번 실행해 줘`(Lead의 셸 차단 메시지에 gate 경로가 찍힌다). 이때 차단 메시지에 찍힌 gate 경로가 `<저장소>\harness\hooks\gate.mjs`인지 확인한다. 경로가 `…\.claude\plugins\cache\…`이면 `[ABORT]`하고 Lead에게 보고한다. 플러그인이 캐시에서 로드되면 백스톱과 플러그인 훅이 서로 다른 경로를 자기로 여겨 Lead가 관문 확인 명령을 실행하지 못한다.
- `/exit`로 닫는다. 이어서:
```
Test-Path src\hello.txt
```
기대: `False`.

### 5-4 커밋
```
git commit -m "chore(harness): C2 remove old harness, use orbit plugin"
```
```
git log --oneline -1
```
기대: 방금 커밋이 맨 위. 이후 `NO-SETTINGS-EDIT-AFTER-C2`.

### [ABORT] (STEP5, 커밋 전에 실패했을 때)
1. Claude 세션을 모두 닫는다.
```
git reset --hard HEAD
```
```
git status --short
```
```
Test-Path .claude/hooks/gate.mjs
```
기대: `True`(옛 관문 파일이 돌아옴).
- 되돌려지는 것: HEAD에 있는 추적 파일(settings.json, CLAUDE.md, `git rm`으로 지운 파일)과 index. 남는 것: `??` 파일과 `.orbit/`. `NO-GIT-CLEAN`.
2. 원인을 Lead에게 보고하고 5-1부터 다시 시작한다.

### [REVERT] (STEP5, 커밋 뒤에 문제가 발견됐을 때)
```
git revert --no-edit HEAD
```
기대: 옛 `.claude/hooks·agents·skills`, settings.json, CLAUDE.md가 함께 돌아온다. 필요하면 C1도 되돌린다(`git revert --no-edit <C1 해시>`; 해시는 `git log --oneline -5`로 본다). 새 세션을 시작해 옛 관문이 동작하는지 본다.

## [DESKTOP] 데스크톱 앱 확인
STEP4와 STEP5의 커밋 전 확인 때 각각 한 번 한다.
1. Claude 데스크톱 앱의 Code 탭에서 저장소 폴더 `C:\Users\lclk1\Projects\orbit`을 새 세션으로 연다.
2. 폴더 신뢰 질문이 나오면 승인한다(설치 명령은 필요 없다. 스파이크에서 신뢰 승인만으로 로드됐다).
3. 입력: `orbit:로 시작하는 에이전트 타입을 모두 나열해 줘`
4. 기대: `orbit:lead`, `orbit:engineer` 등이 나온다. 하나도 없으면 로드 실패: 해당 단계의 `[ABORT]`.
5. 이 구간에서는 이것만 한다. 세션을 닫는다. (메인 세션을 에이전트로 지정하는 `agent` 키는 일부러 쓰지 않는다. 데스크톱 앱의 도구 목록이 사라지는 것이 스파이크에서 관찰됐다. Lead 역할은 CLAUDE.md가 맡는다.)

## [CACHE] 캐시
CACHE: none. 마켓플레이스가 directory source(`./`)라서 플러그인은 캐시 복사본이 아니라 저장소의 `harness/`에서 바로 로드된다(S2에서 `CLAUDE_PLUGIN_ROOT`가 프로젝트 폴더임을 확인). 그래서 `harness/` 파일을 고치면 새 세션부터 바로 반영되고 갱신 명령이 없다. 단, 아래처럼 `claude plugin install`로 설치하면 캐시 경로가 쓰일 수 있어 위 설명이 달라질 수 있다.

로드되지 않을 때만(`claude plugin list`에 `orbit@orbit-local`이 없을 때): 마켓플레이스를 등록하고 프로젝트 scope로 설치한다. 이 명령은 `.claude/settings.json`을 다시 쓸 수 있으므로 실행한 뒤 `git diff -- .claude/settings.json`으로 step 파일과 같은지 본다.
```
claude plugin marketplace add C:\Users\lclk1\Projects\orbit
```
```
claude plugin install orbit@orbit-local --scope project
```
```
claude plugin list
```
기대: `orbit@orbit-local` enabled. 그래도 없으면 해당 단계의 `[ABORT]`.

## 끝난 뒤
- 전환 뒤 Lead 세션은 새로 시작한다(플러그인은 세션 시작 때 로드된다).
- 오르빗 저장소의 `.orbit/team.yaml`은 Lead가 내용을 채팅으로 제시하면 사람이 Claude 밖에서 저장한다.
