# SPIKE.md — S1 결과 (CLI 검증 스파이크)

실행일 2026-11-14. 실험 폴더 `C:\Users\lclk1\AppData\Local\Temp\orbit-spike\` (plugin, plugin-nohook, proj, sdk, mk). 모든 `claude -p`는 `--model haiku`로 실행했다. 오르빗 저장소 파일은 이 SPIKE.md 외에 건드리지 않았다. 커밋 없음.

## 요약

| Q | 결론 | 타는 분기 |
|---|---|---|
| 0 | 성공 (exit 0, 경고만) | 설계대로. templates 경고 없음 |
| 0b | 성공 | L1 확정 (2.1 그대로) |
| 1·4 | 성공 | B형: Agent `subagent_type`과 훅 `agent_type` 모두 `spike:probe`(범위 이름). T1(d)는 B |
| 2 | 부분 성공 | 서브에이전트에서는 맨 이름 `alpha`, 범위 이름 `spike:alpha` 둘 다 CANARY-ALPHA 보고. 메인 스레드 에이전트(boss, `skills: [alpha]`)는 NONE (아래 주의) |
| 3·7 | 부분 성공 | `Agent(spike:probe)`(범위)만 동작, `Agent(probe)`(맨 이름)는 실패. `--agent`와 settings `agent` 모두 동작 -> 2.3 A |
| 6a~6d | 성공 (M1 중단 사유 없음) | 플러그인 PreToolUse 훅 exit 2가 메인·서브에이전트 Write를 모두 차단. 훅 없는 대조군은 써짐 |
| 8 | 성공 | (a) `bin` PATH와 (b) SKILL.md `${CLAUDE_PLUGIN_ROOT}` 치환 둘 다 됨. 우선순위상 (a) |
| 9 | 성공 | a, b, c 세 방식 모두 CANARY-POST 전달. 처음 되는 방식 = a (additionalContext) |
| 10 | 부분 | Agent `tool_input.model`에 `haiku`가 들어옴(성공 쪽). 실제 모델이 바뀌었는지는 미확인 |
| 12 | 성공 | SDK 0.3.325 `Options.agent?: string`, `agents`, `plugins` 있음 -> 2.3 SDK A |
| 5a | 미실행(불가) | `claude plugin list`에 `--settings` 옵션 없음. 대체 시험도 플러그인 미로드. S2로 |

## 0단계 환경

```
> claude --version
2.1.317 (Claude Code)

> claude --help | Select-String 'setting-sources|permission-mode|allowedTools|plugin-dir|--agent |--settings|--model'
  --agent <agent>                       Agent for the current session. Overrides
  --allowedTools, --allowed-tools <tools...>
  --model <model>                       Model for the current session. Provide
  --permission-mode <mode>              Permission mode to use for the session
  --plugin-dir <path>                   Load a plugin from a directory or .zip     (... --plugin-dir A --plugin-dir B.zip)
  --setting-sources <sources>           Comma-separated list of setting sources
  --settings <file-or-json>             Path to a settings JSON file or a JSON

> 조상 폴더 CLAUDE.md 탐색 (proj에서 루트까지): 출력 없음 -> 조상 CLAUDE.md 없음

> claude plugin list
  > ponytail@ponytail  Version: 5.3.3  Scope: user  Status: enabled
```

- `--plugin-dir <path>`는 값 하나이고 반복해서 쓴다. `--allowedTools <tools...>`는 가변 인자다. 그래서 프롬프트를 `-p` 바로 뒤에 뒀다(계획대로).
- `--setting-sources`가 help에 있으므로 `$F`는 계획 그대로 썼다. 확인: init 이벤트의 `plugins`에 `ponytail`이 없다(`ponytail in init: False`). 즉 `--setting-sources project,local`로 사용자 수준 플러그인이 빠진다. 따라서 이후 출력에 ponytail 영향은 없다고 본다. 미확인: 사용자 CLAUDE.md가 빠지는지(확인 방법 없음).
- 사용자 설정이나 플러그인 설치 상태는 바꾸지 않았다.

## 실험 플러그인

계획 4.1대로 만들었다(`plugin\`, `plugin-nohook\`). 훅 명령은 계획대로 따옴표 없는 `node ${CLAUDE_PLUGIN_ROOT}/hooks/log.mjs`다.

## Q0 — validate

```
> claude plugin validate plugin        (exit=0)
✔ Validation passed with warnings
 warnings: plugin.json description/author 없음; hooks.PreToolUse/PostToolUse "Shell command uses ${CLAUDE_PLUGIN_ROOT} without quotes ... Wrap the placeholder in double quotes, or use exec form"
 (--profile directory가 아닌 기본 실행에서) 디렉터리 점검: README_MISSING, LICENSE_MISSING은 "problems the directory refuses" 로 표시되나 결과에는 영향 없음, ICON_MISSING 경고
```
- 결론: 성공(exit 0). 중첩 skills·`templates/`에 대한 경고 없음.
- 분기: 성공 시. 부가 발견: 훅 명령의 `${CLAUDE_PLUGIN_ROOT}`는 따옴표로 감싸거나 exec 형식(`"command":"node","args":[...]`)을 쓰라는 경고가 나온다. T7(hooks.json) 작성 시 반영 권장. 이 환경 경로에는 공백이 없어 따옴표 없이도 동작했다.

## Q0b — 스킬 그룹 두 개 로드

```
> claude -p "Say OK" @F --output-format stream-json --verbose --model haiku   (exit=0)
init.skills: [..., "spike:alpha", "spike:beta", ...]      beta in init: True / alpha: True
init.agents: [..., "spike:boss","spike:boss2","spike:probe","spike:probe2", ...]

> claude -p "Load the skill spike:beta and quote its CANARY word" @F --model haiku   (exit=0)
The `spike:beta` skill loaded. Its canary word is **CANARY-BETA**.
```
- 결론: 성공. 분기: **L1 확정**(`"skills":["./skills/orbit","./skills/vendor"]` 그대로). 스킬 이름은 `spike:alpha`, `spike:beta`(폴더 중첩과 무관하게 `<plugin>:<name>`).
- (계획 명령의 `Select-String -AllMatches`는 그대로 쓰면 줄 단위로 한 번만 매치돼 `spike:beta`가 출력에 안 보였다. init 줄을 `-match`로 따로 확인해 true를 얻었다.)

## Q1·Q4 — 훅의 agent_type, Agent의 subagent_type

```
> claude -p "Use the spike:probe subagent to run: echo probe. Also report its CANARY word." @F --model haiku
 log:
 {"tool_name":"Agent","subagent_type":"spike:probe",...}
 {"tool_name":"Bash","command":"echo probe","agent_id":"a2a3c5c1a0ed5979c","agent_type":"spike:probe",...}
```
- 결론: 성공. 값은 **범위 이름 `spike:probe`(B형)**. 서브에이전트 Bash 줄에 `agent_id`, `agent_type`이 있다. 메인 스레드 줄에는 `agent_id`가 없다(Q3 참조). 훅 env에 `CLAUDE_PROJECT_DIR`(proj 경로), `CLAUDE_PLUGIN_ROOT`(plugin 경로, 슬래시 `/` 형식)가 들어온다 -> 훅 프로세스에 env가 전달된다. 분기: T1(d)는 B.

## Q2 — frontmatter skills 이름

```
> claude -p "Use the spike:probe2 subagent to run: echo probe2. Also report its CANARY word." @F --model haiku
 Its CANARY word is `CANARY-ALPHA`.
(probe, 맨 이름 alpha: 위 Q1 실행에서 "It reported the CANARY word as CANARY-ALPHA" 로 보고)
(boss2, skills 없음, 메인 스레드: "NONE" -> 대조군 역할)
```
- 결론: 서브에이전트에서 `skills: [alpha]`와 `skills: [spike:alpha]` 둘 다 동작(둘 다 CANARY-ALPHA 보고, CANARY-ALPHA는 alpha 스킬 본문에만 있음). 계획 분기 "둘 다". 둘 다 되므로 범위 이름(B형)을 쓰는 편이 이름 충돌에 안전하다.
- 주의: **메인 스레드 에이전트로 띄운 boss(`skills: [alpha]`)는 CANARY를 NONE으로 보고했다**(Q3 참조). 즉 `skills:` 미리 불러오기는 서브에이전트에서만 확인됐고, `--agent`로 메인 스레드에 띄운 경우엔 확인되지 않았다(맨 이름 때문인지 메인 스레드라서인지는 구분하지 못함 — 미실행). 메인 스레드 에이전트(lead)가 스킬을 미리 받는다고 가정하지 말고, 계획 Q2 실패 분기처럼 `Skill` 도구를 남기고 본문에 "먼저 Skill로 불러온다"를 쓰는 편이 안전하다.
- 한계: probe(맨 이름)는 모델이 "your message에서 왔다"고 서술한 부분이 있어 haiku의 서술이 불안정했다. 단 메인은 "I don't see it"이라 했고 서브에이전트는 CANARY-ALPHA를 정확히 냈으므로 미리 불러오기 성공으로 판단.

## Q3·Q7 — Agent() 범위 이름, 메인 스레드 에이전트

```
> claude -p "First report your own CANARY word. Then spawn the probe subagent to run: echo hi, and relay its answer." @F --agent spike:boss --model haiku
 boss: "My CANARY word: NONE"; probe는 echo hi 실행 성공
 log: Agent sub=spike:probe agent_id= agent_type=spike:boss
      Bash  agent_id=a50578751361adb9a agent_type=spike:probe cmd=echo hi

> (같은 프롬프트) --agent spike:boss2
 "I could not spawn it. The Agent call failed with 'Agent type 'probe' not found. Available agents: none.'"
 log: Agent sub=probe agent_id= agent_type=spike:boss2

> '{"agent":"spike:boss"}' -> agent.json
> claude -p "What is your role? Report your own CANARY word. Run Bash: echo hi" @F --settings agent.json --model haiku  (exit=0)
 log: Bash agent_id= agent_type=spike:boss      (CANARY: NONE)
```
- 결론: `Agent(spike:probe)`(범위 이름)는 probe를 띄운다. `Agent(probe)`(맨 이름)는 "Agent type 'probe' not found"로 실패. 목록 제한 효과(다른 에이전트 차단)는 이번엔 시험하지 않았다(목록에 없는 에이전트를 시킨 대조군 미실행).
- 메인 스레드 판정값: 메인 스레드 Bash/Agent 줄은 `agent_id` 없음, `agent_type`=`spike:boss`(`--agent`·settings `agent` 모두). T1(d)는 "서브에이전트는 agent_id 존재, 메인 스레드 에이전트는 agent_type만 있고 agent_id 없음"으로 구분 가능.
- `--agent`와 settings `agent`(범위 이름) 둘 다 동작 -> **2.3 A**.
- boss가 CANARY-ALPHA를 못 봤다는 점은 Q2 주의 참조.
- 분기: T3 lead `Agent()`에는 `Agent(orbit:<role>)` 형식(범위 이름)을 쓴다. 이 스파이크에서 플러그인 이름은 `spike`이므로 실제 값은 `Agent(orbit:...)`가 된다.

## Q6 — 플러그인 훅이 도구 호출을 차단하는가 (M1 핵심)

```
> 6a  claude -p "Write hi to allowed.txt" @F --model haiku     (exit=0)
  allowed.txt exists: True    log: Write file=...\allowed.txt
> 6b  claude -p "Write hi to blocked.txt" @F --model haiku     (exit=0)
  blocked.txt exists: False   log: Write file=...\blocked.txt
  응답: "A PreToolUse hook from the `spike@inline` plugin rejected the write with `SPIKE-BLOCK: blocked by spike hook`."
> 6c  claude -p "Use spike:probe to write hi to blocked.txt" @F --model haiku   (exit=0)
  blocked.txt exists: False
  log: Write file=...\blocked.txt agent_id=a950dbeed6ddbd46b agent_type=spike:probe
  응답: "PreToolUse:Write hook error: [node ...plugin/hooks/log.mjs]: SPIKE-BLOCK: blocked by spike hook"
> 6d  (blocked.txt 없는 상태, --plugin-dir plugin-nohook)  claude -p "Write hi to blocked.txt" @F' --model haiku  (exit=0)
  blocked.txt exists: True
```
- 결론: **성공. M1을 멈출 사유 없음.** 권한 플래그(`--allowedTools 'Bash,Write,...'` 쉼표 형식)가 동작했고(6a), 플러그인 PreToolUse 훅 exit 2가 메인 스레드(6b)와 서브에이전트(6c) 모두에서 Write를 차단했다. 훅이 없으면(6d) 써진다 -> 차단 원인은 훅.
- 6c의 서브에이전트는 차단 뒤 Bash로 `cat blocked.txt`만 했고(파일 없음), 우회하지 않았다.
- 분기: 성공 시(Q6b -> c -> d 모두 통과). 쉼표 구분 `--allowedTools`는 그대로 동작해 4.0의 공백 분리 대안은 필요 없었다.

## Q8 — gate CLI 경로

```
> "Run exactly: spike-echo"                       -> BIN-OK      log tool_name=Bash cmd=spike-echo
> "Run with the Bash tool: printenv CLAUDE_PLUGIN_ROOT CLAUDE_PROJECT_DIR"
     -> 두 변수 모두 unset (printenv exit 1; 재확인 echo도 <unset>)
> "Load skill spike:alpha and print its ROOT= line verbatim"
     -> ROOT=C:/Users/lclk1/AppData/Local/Temp/orbit-spike/plugin     log tool_name=Skill
```
- 모델이 쓴 셸 도구는 세 번 모두 `Bash`(PowerShell 도구 아님).
- 결론: (a) 플러그인 `bin/`이 PATH에 올라와 `spike-echo`가 `BIN-OK`를 낸다(Bash에서 확장자 없는 쪽이 실행됐는지 `.cmd`인지는 구분하지 않음). (b) SKILL.md의 `${CLAUDE_PLUGIN_ROOT}`가 슬래시 형식 절대경로로 치환된다. (c) Bash 도구 env에는 `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PROJECT_DIR`가 **없다**(훅 프로세스에는 있음, Q1 참조).
- 분기: "처음으로 되는 방식" = (a) `bin` PATH. T1(c)·T6 gate 스킬은 `bin`의 명령 이름으로 부른다. (b)는 보조 수단. Bash env에 의존하지 않는다.

## Q9 — PostToolUse로 모델에게 경고 전달

```
> post-mode a: 응답 "the hook context contained this canary word: CANARY-POST"
> post-mode b: 응답 "the hook output included this canary word: CANARY-POST"
> post-mode c: 응답 "the PostToolUse hook returned the canary word: CANARY-POST"
```
- 결론: 성공, 세 방식 모두 모델에 전달. 분기: 처음으로 되는 방식 = **a** (`hookSpecificOutput.additionalContext`, exit 0)를 T8이 쓴다.
- 한계: 각 방식을 따로 한 번씩만 실행했고, 방식 사이에 차이(예: 모델이 지시로 받아들이는 강도)는 보지 않았다.

## Q10 — 역할별 모델 덮어쓰기

```
> claude -p "Spawn spike:probe using model haiku to run: echo m" @F --model haiku
 log: {"tool_name":"Agent","subagent_type":"spike:probe","model":"haiku",...}
```
- 결론: Agent 호출의 `tool_input.model`이 존재한다(성공 쪽 분기: Lead가 team.yaml `models`를 Agent 호출에 넣는다). 한계: 메인 모델이 이미 haiku라 서브에이전트의 실제 모델이 바뀌었는지는 검증하지 못했다(미실행: 다른 모델로의 전환 확인은 토큰 비용 때문에 생략).

## Q12 — SDK 메인 스레드 에이전트 옵션

```
> npm pack @anthropic-ai/claude-agent-sdk   (exit 0)  -> anthropic-ai-claude-agent-sdk-0.3.325.tgz
> tar -xzf ...                              (exit 0)   version 0.3.325
sdk.d.ts:1673-1690  /** Agent name for the main thread. ... equivalent to the `--agent` CLI flag. */ agent?: string;
sdk.d.ts:1706       agents?: Record<string, AgentDefinition>;
sdk.d.ts:2166       plugins?: SdkPluginConfig[];
sdk.d.ts:2573       systemPrompt?: string | string[] | {...}
```
- 결론: 성공. 분기: **2.3 SDK A** (`agent` 옵션 있음, 파일 읽기만 했고 SDK는 실행하지 않음). 참고: 주석에 "The agent must be defined either in the `agents` option or in settings." 가 있어 플러그인 에이전트를 범위 이름으로 쓰는 경우는 실행 시험하지 않았다.

## Q5a — directory source + --settings (참고용)

```
> claude plugin list --settings ...\mk.json
error: unknown option '--settings'   (exit 1)
> (대체) cd mk; claude -p "Say OK" --setting-sources project,local --settings mk.json --output-format stream-json --verbose
 init.plugins: builtin 4개만. spike 없음. init에 spike:alpha 없음.
```
- 결론: `plugin list`는 `--settings`를 받지 않는다. 대체 시험에서는 `extraKnownMarketplaces`+`enabledPlugins`만으로는 플러그인이 로드되지 않았다(설치 단계 `claude plugin marketplace add`/`install`이 필요한 것으로 보이나, 사용자 수준 상태를 바꾸므로 실행하지 않음). **S2(사람)로 넘김.**
- S2용 파일 작성: `$S\settings.project.json`(directory `./`, enabledPlugins `spike@spike-local`, `agent: spike:boss`), `$S\marketplace.json`, `$S\mk\.claude-plugin\marketplace.json`+`$S\mk\plugin\`(복사본), `$S\proj\mk.json`. 주의: `settings.project.json`의 `agent`는 `--settings`로 쓰인 `agent.json` 방식이 동작함을 Q3에서 확인했다.

## 계획 명령 -> 실제로 쓴 명령 (계획 수정용)

| 계획의 명령 | 실제로 쓴 명령 | 이유 |
|---|---|---|
| Q0b `claude -p @F --output-format stream-json --verbose "Say OK" \| Select-String -Pattern 'spike:alpha','spike:beta' -AllMatches` | `claude -p "Say OK" @F --output-format stream-json --verbose --model haiku`, 결과를 `$l = ($o \| ? {$_ -match '"subtype":"init"'})`로 뽑아 `-match 'spike:beta'` | 프롬프트는 `-p` 바로 뒤(4.0 규칙). Select-String은 줄당 하나만 보여 beta가 안 보임 |
| 표 전반 `claude -p @F … "<프롬프트>"` | `claude -p "<프롬프트>" @F …` | 4.0 규칙대로 |
| Q6d `$F`의 `--plugin-dir` 값 교체 | `$F`를 `plugin-nohook` 경로로 다시 만들어 사용 | 동일 의도 |
| Q5a `claude plugin list` + `--settings mk.json` | 실행 불가(옵션 없음), `claude -p ... --settings mk.json` init 확인으로 대체 | 옵션 미지원 |
| 모든 Q | `--model haiku` 추가 | 토큰 절약(지시) |
| 4.0 `Select-String` help 필터 | `'--agent ', '--settings', '--model'` 추가 | 관련 플래그 존재 확인 |

고쳐 쓴 계획 명령: 5건(Q0b, 프롬프트 위치 표기 전반, Q6d 표기, Q5a, 모델 플래그). 문법 오류로 실패한 것은 Q5a의 `--settings` 하나뿐.

## 계획에 반영할 점

1. 훅 명령의 `${CLAUDE_PLUGIN_ROOT}`는 따옴표로 감싸거나 exec 형식으로 쓰라는 validate 경고(Q0).
2. 스킬/에이전트 이름은 범위 이름(`orbit:<name>`): 훅 `agent_type`, Agent `subagent_type`, `Agent()` 목록, `--agent`, settings `agent` 전부. `Agent(<맨 이름>)`은 실패.
3. 메인 스레드 에이전트의 `skills:` 미리 불러오기는 확인되지 않았다(Q2 주의).
4. Bash 도구 env에는 CLAUDE_* 변수가 없다. 훅 프로세스에는 있다. gate는 `bin`으로.
5. 서브에이전트 구분 신호: `agent_id` 존재 여부.

## S2 (터미널 부분, engineer 대행)

폴더 `C:\Users\lclk1\AppData\Local\Temp\orbit-spike-proj\` (plugin\, .claude-plugin\marketplace.json, .claude\settings.json, sub\, git init). 모두 헤드리스(`claude -p`)로 대신했다. 데스크톱 Q11·Q13은 하지 않았다.

**정정(S1 부작용)**: S1의 Q5a 대체 실험(`claude -p --settings mk.json`, cwd `orbit-spike\mk`)이 사용자 수준 `known_marketplaces.json`에 `spike-local`(Folder `...\orbit-spike\mk`)을 자동 등록했다. S1에서는 "로드 안 됨"이라 적었으나 등록은 남았다. 그래서 S2 첫 실행은 이 잔여 등록(`spike-local`)을 타서 오염됐다(spike가 `orbit-spike\mk\plugin`에서 로드됨). 이후 프로젝트의 마켓플레이스 이름을 `spike-proj`로 바꿔 다시 시험했다.

### S2-1 설정 배치
- 한 일: 폴더 생성, S1 파일 복사, `git init`. marketplace/settings의 이름을 `spike-local`->`spike-proj`로 변경.
- 관찰: `Initialized empty Git repository`.
- 결론: 완료.

### S2-2 Q5 설정 파일만으로 플러그인이 로드되는가 (헤드리스 대행)
- 한 일(각 1회, `--plugin-dir` 없음, `claude -p "Say OK" --model haiku --output-format stream-json --verbose`, init의 plugins/skills 확인):
  1. 루트, `--setting-sources project,local`, 이름 spike-local(오염): spike 로드됨, 경로 `orbit-spike\mk\plugin`.
  2. 루트, 플래그 없음, spike-local(오염): spike와 ponytail 둘 다 로드.
  3. 하위 폴더 `sub\`, `--setting-sources project,local`: spike 없음.
  4. 이름 spike-proj, 루트, `--setting-sources project,local` (프로젝트 `.claude/settings.json`만): spike 없음. 플래그 없이도 없음.
  5. `claude plugin install spike@spike-proj --scope project`: `Failed to install plugin "spike@spike-proj": Plugin "spike" not found in marketplace "spike-proj"` (exit 1). `marketplace list`에 spike-proj가 없었다 -> 마켓플레이스가 등록되지 않아서 난 오류.
  6. 같은 파일을 `--settings <abs>\.claude\settings.json`로 지정 + `--setting-sources project,local`: **로드됨**. `{"name":"spike","path":"...\orbit-spike-proj\plugin","source":"spike@spike-proj"}`, skills에 `spike:alpha/beta`, agents에 `spike:boss` 등. `sub\`에서도 로드됨. 이때 사용자 수준에 `spike-proj`(Folder 프로젝트 루트)가 자동 등록됐다.
- 관찰 요약: `--setting-sources project,local`이 마켓플레이스 선언을 막는 것은 아니다(6번에서 같이 쓰고도 로드). 그러나 `.claude/settings.json`이 프로젝트 설정으로 읽힐 때는(4번) 로드·등록이 안 됐다. 원인은 헤드리스에서 폴더 신뢰 미수락 때문인지 불명(신뢰 관련 메시지는 출력에 없었음). `--settings`로 주면 같은 내용이 적용됨. `"./"`는 settings 파일 위치(`.claude\`)가 아니라 프로젝트 루트(cwd) 기준으로 풀렸다(plugin 경로 = `<proj>\plugin`).
- 결론: 부분. 대화형으로만 확인할 수 있는 것 = 신뢰 후 프로젝트 settings만으로 로드되는지(미확인). `"."`/절대 경로 시도는 `./`가 되는 것이 확인돼 하지 않았다. 설치 요구 여부: 대화형 미확인, 헤드리스에서 `plugin install`은 마켓플레이스 미등록으로 실패. 데스크톱/대화형에서 Lead가 신뢰 후 재확인 필요.

### S2-3 Q7b 메인 스레드 agent
- 한 일: `claude -p "What is your role? Quote any CANARY word. Then run Bash: echo hi"` + 6번의 플래그, 루트.
- 관찰: 응답 "Canary words: NONE." 로그: `{"tool_name":"Bash","agent_type":"spike:boss",...}` (agent_id 없음).
- 결론: settings `agent`가 메인 스레드에 적용됨(agent_type=spike:boss) -> 2.3 A. boss의 `skills:`는 메인 스레드에서 미리 불러오지 않음(S1 Q2 주의와 일치). 응답에 boss 본문이 드러나지 않아 "역할" 문구로는 판별 못 함 — 훅 로그가 근거.

### S2-4 훅의 CLAUDE_PLUGIN_ROOT
- 관찰: `env_root: C:/Users/lclk1/AppData/Local/Temp/orbit-spike-proj/plugin`, `env_proj`는 프로젝트 루트.
- 결론: 캐시가 아니라 프로젝트의 `plugin\`(directory source). 이 경우 `CACHE: none`. (`--settings` 경로 기준; 설치한 경우는 시험하지 않음.)

### 사용자 수준에 남은 것 (지우지 않음)
- `~\.claude\plugins\known_marketplaces.json`: `spike-local`(Folder `...\orbit-spike\mk`, S1 Q5a가 만듦), `spike-proj`(Folder `...\orbit-spike-proj`, S2-2의 6번이 만듦).
- `claude plugin list`: ponytail만(spike 설치 없음). `plugin install`은 성공한 적 없음. `~\.claude\plugins\cache`에 새 항목 없음. `claude plugin marketplace add`와 `--scope user` 설치는 실행하지 않음.
- 정리 때: `claude plugin marketplace remove spike-local` / `spike-proj`.
