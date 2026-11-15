# VERIFY — 20261114-harness-plugin (브랜치 orbit/20261114-harness-plugin, HEAD 41e620b)

QA가 직접 실행한 결과다. engineer SUMMARY는 참고만 했다. 코드는 고치지 않았다. `claude -p`는 모두 `--model haiku`, 저장소 밖 임시 폴더(`mktemp -d` + `git init`, 안에 `CLAUDE.md`와 `src/`)에서 `--plugin-dir <repo>/harness --setting-sources project,local --permission-mode acceptEdits --allowedTools Bash,Write,Edit,Read,Agent,Skill --output-format stream-json --verbose`로 실행했다. 임시 폴더는 끝나고 삭제했고 저장소 `git status --short`는 비어 있다.

## A. 정적

기준: gate 테스트 25/25, 옛 gate 테스트 6/6, validate exit 0, V-W4(21, CLEAN), 역할 21개의 name·model이 2.2와 일치.

```
$ node --test harness/hooks/gate.test.mjs        (마지막 줄들)
ℹ tests 25   ℹ pass 25   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0
exit 0
$ node --test .claude/hooks/gate.test.mjs
ℹ tests 6    ℹ pass 6    ℹ fail 0
exit 0
$ claude plugin validate harness
⚠ .claude-plugin/plugin.json icon: No icon (ICON_MISSING) ... (경고 1개, 디렉터리 제출용 점검)
✔ Validation passed with warnings
validate_exit 0
$ ls harness/agents/*.md | wc -l
21
$ grep -EniH '127\.0\.0\.1|1420|SPEC\.md|\.claude/hooks|npm run tauri' harness/agents harness/skills/orbit -r; test $? -eq 1 && echo CLEAN
CLEAN
$ (2.2 정본 21개 이름·모델을 연관 배열로 두고 각 파일의 name:, model: 줄을 비교하는 루프)
checked 21 of expected-list        (MISMATCH 출력 없음)
```

경고: ICON_MISSING 1건(검증 통과에 영향 없음, 기록만).
결과: 통과.

## B. 런타임 (저장소 밖 임시 프로젝트)

### B1. init 메시지의 에이전트·스킬
```
$ claude -p "Reply with just OK." --model haiku --plugin-dir <repo>/harness --setting-sources project,local --output-format stream-json --verbose   (init 메시지 파싱, exit 0)
agents 21 orbit:architect,orbit:data,orbit:debugger,orbit:designer,orbit:devops,orbit:engineer,orbit:lead,orbit:librarian,orbit:plan-checker,orbit:product,orbit:qa,orbit:researcher,orbit:reviewer-accessibility,orbit:reviewer-correctness,orbit:reviewer-data,orbit:reviewer-idiom,orbit:reviewer-maintainability,orbit:reviewer-performance,orbit:reviewer-rules,orbit:reviewer-tests,orbit:security
skills 11 orbit:agent-config-audit,orbit:data-migration-safety,orbit:design-system-guard,orbit:devops-release,orbit:gate,orbit:handoff,orbit:router,orbit:threat-model,orbit:systematic-debugging,orbit:test-driven-development,orbit:verification-before-completion
plugins: orbit@inline v0.1.0
```
누락 없음(에이전트 21/21, 오르빗 스킬 8 + vendor 3).
결과: 통과.

### B2. Lead의 src 쓰기 차단, 대조군
```
$ claude -p "Use the Write tool to create src/a.txt ..." --plugin-dir ...        (exit 0)
tool_result(is_error): PreToolUse:Write hook error: [node ...\harness/hooks/gate.mjs]: [orbit gate] Lead는 직접 코딩하지 않음: .orbit/ 밖의 파일은 서브에이전트(engineer 등)에게 맡길 것
ls src  -> (비어 있음, a.txt 없음)
$ (대조군) 같은 프롬프트, --plugin-dir 없음   (exit 0)
ls src -> a.txt ; cat -> hello
```
결과: 통과(플러그인 있으면 막히고 파일 없음, 없으면 써짐).

### B3. 서브에이전트 쓰기 범위
```
$ Agent(subagent_type "orbit:engineer") -> Write src/b.txt      (활성 run 없음, exit 0)
sub(claude-sonnet-5-5) Write -> "File created successfully at ...\src\b.txt"
$ Agent("orbit:qa") -> Write src/c.txt
sub tool_result ERR: [orbit gate] orbit:qa는 읽기 전용 역할이거나 쓰기 범위 밖: .orbit/ 안의 산출물만 쓸 수 있음 (...)
$ Agent("orbit:reviewer-rules") -> Write src/c.txt
Write 도구가 없어서(tools: Read, Grep, Glob, Bash) 시도 자체가 안 됨. 훅이 아니라 tools 목록이 막음.
ls src -> b.txt (c.txt 없음)
$ (활성 run 수동 생성: .orbit/current=r1, STATE.json {"track":"standard",...}) Agent("orbit:engineer") -> Write src/d.txt
File created successfully (허용)
```
활성 run이 없을 때: 계획 2.6 역할 범위 표에 run 의존이 없고, engineer는 쓰고(src/b.txt) qa는 막혔다. 즉 run 유무와 무관하게 역할 범위로 판정한다(계획과 일치). run이 없으면 `check ship`과 출고 감지만 "활성 run 없음"으로 실패한다(B7).
참고: reviewer-rules는 훅이 아니라 도구 목록으로 막힌다. 훅 쪽 차단은 qa로 확인했다.
결과: 통과.

### B4. 산출물 위조 차단
```
$ Agent("orbit:engineer") -> Write .orbit/runs/r1/Review.md  "VERDICT: PASS"   (run r1 활성)
ERR: [orbit gate] .orbit/runs/r1/Review.md는 lead만 쓸 수 있음
ls .orbit/runs/r1 -> STATE.json (Review.md 없음)
(덤) 같은 engineer가 CLAUDE.md를 Edit -> ERR: [orbit gate] 설정 경로(CLAUDE.md, .claude/, .mcp.json)는 full 트랙 + config 승인이 있는 run에서만 쓸 수 있음. CLAUDE.md 내용 불변("# t").
```
결과: 통과(대소문자 다른 `Review.md`도 차단).

### B5. design-warn
```
임시 design/tokens.json = {"color":{"bg":"#1e1e2e"},"size":{"m":"16px"}}
$ Agent("orbit:engineer") -> Write src/good.css  a{color:#1e1e2e;margin:16px}
tool_result ok, 경고 없음 (에이전트 보고: NONE)
$ Agent("orbit:engineer") -> Write src/bad.css   a{color:#ff0000;margin:13px}
tool_result ok (막지 않음). stream-json에 PostToolUse additional context 전달 확인:
"design/tokens.json에 없는 값이 ...\src\bad.css에 하드코딩됨: #ff0000, 13px. 토큰을 쓰거나 designer와 토큰 추가를 협의할 것."
```
`good.css`에 대한 경고는 stream-json 어디에도 없다(`하드코딩됨:` 문구는 `#ff0000, 13px` 한 종류뿐). 에이전트도 경고를 받아 보고했다.
결과: 통과.

### B6. 모델 덮어쓰기(Q10)
```
$ (대조) Agent("orbit:engineer") 덮어쓰기 없음, 메인 haiku   -> 서브에이전트 assistant message.model = claude-sonnet-5-5 (engineer.md의 model: sonnet)
$ Agent(subagent_type "orbit:engineer", model "haiku"), 메인 haiku
sub message.model = claude-haiku-5-5, result modelUsage 키 = [claude-haiku-5-5]
```
Agent의 `model` 인자가 서브에이전트 정의의 모델을 실제로 바꾼다. 계획이 말한 "메인 haiku + `model: "sonnet"`" 그대로가 아니라, 메인과 다른 쪽으로 가는 대신 에이전트 정의(sonnet)를 haiku로 덮어쓰는 방향으로 확인했다. 정의 모델이 `model` 인자보다 우선하지 않는다는 점이 같은 증거다. (기본: 서브에이전트는 정의의 모델(sonnet)로, 덮어쓰면 인자의 모델로 돈다.) 분기 B(덮어쓰기 불가)는 아니다.
결과: 통과.

### B7. gate CLI
```
$ CLAUDE_PROJECT_DIR=<임시> node <repo>/harness/hooks/gate.mjs check ship
  (.orbit/current 없음)            -> FAIL 활성 run 없음            exit 1
  (run r1 standard, 관문 파일 없음) -> FAIL plan/review/verify: ... 없음, run=r1 track=standard   exit 1
  (PLAN_CHECK/REVIEW/VERIFY 모두 VERDICT: PASS + VERIFY에 코드 블록) -> PASS plan / PASS review / PASS verify   exit 0
```
결과: 통과.

## C. 전환 키트(실행하지 않음, 정적 확인만)

```
$ cp cutover/settings.step1.json c1/.claude/settings.json ; cp cutover/settings.step2.json c2/.claude/settings.json  (임시 폴더)
c1 valid JSON; keys: hooks,extraKnownMarketplaces,enabledPlugins
c2 valid JSON; keys: extraKnownMarketplaces,enabledPlugins,hooks,permissions
step2 훅: node ${CLAUDE_PROJECT_DIR}/harness/hooks/gate.mjs  (PreToolUse 하나)
$ (임시 프로젝트 c2에서 같은 경로 실행) echo '{}' | node c2/harness/hooks/gate.mjs -> MODULE_NOT_FOUND, exit 1
$ test -e <repo>/harness/hooks/gate.mjs -> 오르빗 저장소에는 있음
```
step2의 백스톱 훅 경로는 `harness/hooks/gate.mjs`가 프로젝트 루트에 있는 오르빗 저장소 구조에서만 성립한다. 다른 구조에서는 node가 exit 1로 실패하고, Claude Code는 exit 2가 아니면 도구를 허용하므로 조용히 무력화된다(해롭지 않지만 관문이 걸리지 않음). CUTOVER.md가 이 백스톱을 "오르빗 저장소용"으로 적고 있는지는 148행의 설명으로 충분하다고 본다.

CUTOVER.md의 코드 블록 35개를 PowerShell 파서(`[System.Management.Automation.Language.Parser]::ParseFile`)로 파싱했다. 구문 오류 0건. 음성 대조(`if ( {`)는 오류 2건을 냈으므로 파서는 동작한다. 실행은 하지 않았다(문법만 확인, 명령의 효과는 미실행).
결과: 통과.

## 전환(C1·C2) 후에만 확인할 항목 (이번 판정에 넣지 않음)
- 오르빗 저장소에서 `.claude/settings.json`의 enabledPlugins로 플러그인이 설정만으로 로드됨(`claude plugin list`에 `orbit@orbit-local`, `/hooks`에 플러그인 PreToolUse).
- 옛 `.claude/agents·skills·hooks` 제거 후 오르빗 저장소에서 Lead 차단 메시지가 플러그인 gate 경로를 가리킴.
- step2 백스톱 훅(`${CLAUDE_PROJECT_DIR}/harness/hooks/gate.mjs`)이 플러그인 로드와 함께 두 번 실행되어도 판정이 같음.
- 데스크톱 Code 탭에서 `orbit:` 에이전트 목록(Q11), `"agent": "orbit:lead"` 설정(2.3 A안)의 메인 스레드 적용.
- CUTOVER.md 명령의 실제 PowerShell 실행(이번엔 구문만 확인).

## 미검증/한계
- 없음(판정 대상 항목 전부 실행). 단 haiku 메인이 프롬프트를 따라 도구를 호출한 것이라, 관문 판정은 각 tool_result의 훅 오류 메시지와 파일 존재 여부로 확인했다.
- M1 출구의 `Get-FileHash` 전후 비교(기준 6)는 임시 폴더의 CLAUDE.md 내용 불변(`# t`)으로 대신 확인했고 `.claude/`는 임시 폴더에 두지 않았다. 계획 명령 그대로의 `.claude/agents/x.md` 사전 생성 케이스는 실행하지 않았다.

VERDICT: PASS
