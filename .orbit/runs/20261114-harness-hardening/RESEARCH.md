# RESEARCH — 하네스 보강 (SECURITY.md S1~S13, REVIEW R10·R11)

확인 날짜: 2026-11-14. 출처는 전부 Claude Code 공식 문서(code.claude.com/docs/en). 로컬 실험은 하지 않았다. "추정"은 문서에 명시가 없는 것.
프로필: `.orbit/profile.json` 새로 만듦(기존 파일 없음, 덮어쓴 값 없음). 신호: designer·reviewer-accessibility(React UI), devops(Tauri bundle), security-deep. data는 비움(SPEC.md:94는 SQLite 계획이지만 저장소에 DB 코드·마이그레이션이 아직 없음). reviewer-performance·qa-mobile 비움.

## 질문과 찾은 것

### Q1. 훅 additionalContext 길이 제한 (S11)
- `additionalContext`, `systemMessage`, `initialUserMessage` 문자열과 일반 stdout은 각각 **10,000자**로 제한된다. 필드마다 따로 잰다. 넘으면(PreCompact stdout 제외) 세션 디렉터리의 파일로 저장하고, 출력을 **파일 경로 + 앞 2,000자 미리보기**로 바꾼다. Claude에게 그 파일을 읽으라고 시키지 않는다. 이벤트별 다른 한도는 문서에 없다. 출처: https://code.claude.com/docs/en/hooks ("JSON output", "Add context for Claude")
- 따라서 SECURITY.md 재현(stdout 1.89MB)은 Claude 컨텍스트에 통째로 들어가지는 않는다. 그래도 파일 쓰기·훅 시간·미리보기 낭비는 남는다.

### Q2. settings의 `env`·`disableAllHooks`는 세션 중에 다시 읽히나 (S13) — 이전 추정("다음 세션")은 틀렸다
- Claude Code는 settings 파일을 감시하고 바뀌면 다시 읽는다. `permissions`, `hooks`를 포함한 대부분의 편집이 재시작 없이 실행 중인 세션에 적용된다. 세션 중에 새로 만든 settings 파일도, 폴더가 세션 시작 때 있었다면 읽는다(프로젝트 `.claude/`는 같은 세션에서 만든 폴더여도 읽는다). 출처: https://code.claude.com/docs/en/settings ("When edits take effect")
- `env`: "A running session applies new and changed values to its environment when you save the file". 값을 지워도 실행 중 세션에서는 unset되지 않는다. 출처: https://code.claude.com/docs/en/env-vars ("Set variables in settings files"). 또 Precedence 절: "Claude Code writes each `env` entry into the process environment". 훅 프로세스는 부모 환경을 상속한다(https://code.claude.com/docs/en/hooks "Common input fields"). **추정**: 그래서 `.claude/settings.local.json`의 `"env": {"ORBIT_GATE": "off"}`는 저장 직후의 다음 훅 실행부터 `gate.mjs`의 `process.env.ORBIT_GATE`에 보인다. 직접 확인은 안 함.
- `disableAllHooks: true`: "Direct edits to hooks in settings files are normally picked up automatically by the file watcher". 값은 우선순위를 적용한 뒤 남은 값이다(local이 shared project를 이긴다). managed 수준에서만 managed 훅을 끌 수 있다. 출처: hooks 문서 "Disable or remove hooks". 플러그인 훅이 `disableAllHooks`로 꺼지는지는 문서에 별도 문장이 없다(문장은 "all hooks"). **추정**: 꺼진다.
- 방어 수단: `ConfigChange` 훅. settings 파일(`user_settings`/`project_settings`/`local_settings`)이 바뀌면 실행되고, exit 2 또는 `{"decision":"block"}`이면 "새 설정이 실행 중인 세션에 적용되지 않는다"(`policy_settings` 제외). 입력에 `source`, `file_path`가 있다. 출처: https://code.claude.com/docs/en/hooks ("ConfigChange"). 단 "Yes, and don't ask again"으로 Claude Code가 직접 쓰는 `settings.local.json` 변경은 같은 세션에서 훅 없이 적용된다. 플러그인 `hooks.json`의 ConfigChange 훅이 발동하는지, 훅 자신이 `disableAllHooks`로 꺼지면 의미 없는지는 미확인.
- 참고: `permissions.defaultMode`의 `auto`·`bypassPermissions`는 프로젝트·로컬 settings에서 효력이 없다(v2.1.257 이후). 사용자 settings·`--settings`·managed에서만. 출처: settings 문서 "A value you set is ignored". 즉 자동 승인 모드는 사용자가 켠 것이고, 저장소 파일이 켤 수 없다.
- 참고: PreToolUse에서 auto 모드일 때 훅의 `"ask"`는 분류기가 아니라 사용자 확인 창으로 간다. 훅 `deny`는 항상 차단하고, deny·ask 규칙은 훅 결과와 무관하게 평가된다. 출처: hooks 문서 "PreToolUse decision control". 애매한 경우(config 승인 필요 등)는 exit 2 대신 `ask`를 쓸 수 있다는 뜻이다.

### Q3. 프로젝트 `.claude/agents/`가 `orbit:engineer`를 흉내 낼 수 있나, agent_type 값 (S1 잔여 추정)
- 훅 입력 `agent_type`: "서브에이전트 안에서 훅이 발동할 때 존재. 값은 SubagentStart 절 참조". SubagentStart 절: 사용자 정의 서브에이전트는 frontmatter `name`(파일 이름 아님), 플러그인 서브에이전트는 "the plugin-scoped identifier such as `my-plugin:reviewer`, not the bare frontmatter name". 매처는 정규식이라 `^my-plugin:reviewer$`로 앵커. 출처: https://code.claude.com/docs/en/hooks ("Common input fields", "SubagentStart"). → `gate.mjs:26`의 `agent_type.startsWith('orbit:')` 가정이 맞다(이전 run의 "미확인" 해소).
- 프로젝트·사용자·managed의 `.claude/agents` 파일은 `name`에 `:`가 있으면 **건너뛴다**(오류는 debug 로그). `:`는 플러그인 범위 식별자 전용이라고 문서에 있다. 출처: https://code.claude.com/docs/en/sub-agents ("Frontmatter reference" name 행, "Subagent files Claude Code skips"). → 프로젝트 파일로 `name: orbit:engineer`를 만들 수 없다. 맨 이름 `engineer`로 만들면 agent_type이 `engineer`라 `roleOf`가 null(모르는 에이전트로 제한)이다.
- 우선순위: managed(1) > `--agents` CLI(2) > `.claude/agents/`(3) > `~/.claude/agents/`(4) > 플러그인(5). 같은 이름이면 높은 쪽이 쓰인다. 출처: sub-agents "Choose the subagent scope". 플러그인 에이전트는 범위 이름이라 맨 이름 프로젝트 에이전트와 충돌하지 않는다.
- 남는 위험(미확인): (a) `--agents` CLI JSON의 name에 `:`가 거부되는지, (b) 다른 마켓플레이스의 `orbit`이라는 같은 이름 플러그인이 `orbit:engineer`를 낼 수 있는지(문서에는 같은 이름 플러그인이 둘이면 한쪽 훅만 등록된다는 절이 있음: https://code.claude.com/docs/en/plugins/components "Hooks when two enabled plugins share a name"). 둘 다 사용자가 직접 CLI 플래그나 플러그인 설치를 해야 하는 경로.
- 플러그인 에이전트에서 `hooks`, `mcpServers`, `permissionMode`, `initialPrompt`는 무시된다(보안상). 출처: sub-agents "Choose the subagent scope", plugins/components "Frontmatter fields in plugin agents".

### Q4. 서브에이전트 frontmatter로 스킬 미리 싣기 (R10)
- `skills:` 필드는 "서브에이전트 컨텍스트에 시작 때 **스킬 전문**을 주입"한다(설명만이 아님). 목록 앞 **32개**까지. 목록은 미리 로드할 것만 정하고 접근 가능한 것을 제한하지 않는다(목록에 없는 스킬도 Skill 도구로 부를 수 있음). `disable-model-invocation: true`인 스킬은 미리 싣지 못한다. 목록의 스킬이 없거나 꺼져 있으면 **건너뛰고 debug 로그에만 경고**한다(조용한 실패). 서브에이전트는 부모가 호출한 스킬을 상속하지 않는다. Skill 도구 자체를 막으려면 `tools`에서 Skill을 빼거나 `disallowedTools`에 넣는다. 출처: https://code.claude.com/docs/en/sub-agents ("Frontmatter reference", "Preload skills into subagents")
- 플러그인 에이전트도 `skills`는 지원 필드다. 출처: plugins/components "Frontmatter fields in plugin agents".
- 스킬 이름: 플러그인 스킬의 명령 이름은 `/<plugin>:<디렉터리>`이고 frontmatter `name`을 주면 마지막 구간을 대체한다(접두사는 유지). 출처: plugins/components "Skills". **`skills:` 목록에 범위 붙은 `orbit:report`로 써야 하는지 맨 `report`면 되는지는 문서에 없다.** `harness/agents/lead.md:6`은 이미 `[orbit:router, orbit:handoff]`로 쓴다(검증된 적 없음).

### Q5. 현재 프로젝트 자동 메모리 폴더 슬러그 (S5)
- 메모리 폴더: `~/.claude/projects/<project>/memory/`. `<project>`는 **git 저장소에서 유도**되어 같은 저장소의 모든 worktree·하위 폴더가 한 폴더를 공유한다. git 밖이면 프로젝트 루트. 출처: https://code.claude.com/docs/en/memory ("Auto memory")
- 슬러그 규칙(대화 기록 폴더 기준): "작업 디렉터리 경로에서 영숫자가 아닌 문자를 `-`로 바꾼 것". 변환 이름이 200자를 넘으면 200자로 자르고 전체 경로의 **해시**를 붙인다(해시 알고리즘은 문서에 없음). 출처: https://code.claude.com/docs/en/sessions ("Where transcripts are stored"). 이 환경의 실제 폴더 `C--Users-lclk1-Projects-orbit`(`C:\Users\lclk1\Projects\orbit`)과 일치해 `replace(/[^A-Za-z0-9]/g,'-')`가 맞다. 로컬에서 관찰한 값(메모리 경로 `C:\Users\lclk1\.claude\projects\C--Users-lclk1-Projects-orbit\memory\`).
- 덮어쓰는 설정: `autoMemoryDirectory` — **user, project, local, policy, `--settings` 어느 범위에서나** 읽힌다(저장소 settings가 메모리 위치를 바꿀 수 있다). `CLAUDE_CODE_PROJECT_DIR_NAME`(+`CLAUDE_CONFIG_DIR` 필요, 셸 환경에서만, settings `env`로는 불가)로 폴더 이름을 고정할 수 있다. `CLAUDE_CONFIG_DIR`은 `~/.claude` 자체를 옮긴다. 출처: memory 문서, sessions 문서 ("Name the project directory yourself"), https://code.claude.com/docs/en/settings
- 훅 쪽 재료: 훅은 `CLAUDE_PROJECT_DIR`(프로젝트 루트)을 환경으로 받는다(plugins/components "Reference plugin paths"), 입력에 `cwd`도 있다.

## 확인하지 못한 것
- `skills:` 목록의 범위 붙은 이름(`orbit:x`) vs 맨 이름. 실패해도 경고가 debug 로그뿐이다. → 로컬 테스트 필요(서브에이전트에게 "스킬 본문 첫 줄 인용"을 시키면 됨).
- settings `env`의 `ORBIT_GATE`가 실제로 다음 훅 프로세스에 전달되는지, `disableAllHooks`가 플러그인 훅까지 끄는지(문서 근거는 위 추정까지).
- 플러그인 `hooks.json`의 ConfigChange 훅 발동 여부, 훅이 `disableAllHooks`로 꺼진 뒤의 동작.
- 메모리 폴더가 git 루트 기준일 때 `CLAUDE_PROJECT_DIR`가 하위 폴더이거나 linked worktree인 경우의 정확한 폴더, 비ASCII 문자(한글 사용자 이름 등)가 "영숫자"로 취급되는지, 200자 초과 해시 알고리즘.
- Claude Code 버전별 차이: 위 문서는 2026-11-14 조회본이고 설치된 버전은 확인하지 않았다(`claude --version` 미실행).
- `--agents` CLI의 `:` 이름 거부 여부.

## 설계에 미치는 영향
1. **S13**: "다음 세션부터"라는 가정을 버린다. FREE_SHELL 역할이 `.claude/settings*.json`에 쓰면 **즉시** 관문이 꺼질 수 있다. 권장: (a) `gate.mjs`의 `ORBIT_GATE=off` 경로를 환경 변수 대신 사람만 쓰는 방식으로 좁히거나 제거(settings `env`가 같은 변수를 채울 수 있음), (b) 셸 명령이 `.claude/`·`settings*.json`·`.claude.json`을 가리키면 차단하는 검사(FREE_SHELL 포함, 정확하지 않은 1차 방어), (c) `ConfigChange` 훅으로 `project_settings`/`local_settings`의 `disableAllHooks`·`env.ORBIT_*` 변경을 막기(발동 여부는 먼저 실험), (d) 가장 강한 방어는 사용자 수준 또는 managed 수준 설정이라 하네스 밖. 문서(6.3 수용 문구)에 "관문 자체가 교체·해제될 수 있다"를 적는다.
2. **S11**: Claude Code가 10,000자에서 잘라 주긴 하지만 `design-warn`이 스스로 앞 20개 + "외 N개"로 자르고 총 길이를 2,000자 안팎으로 둔다(미리보기 한도와 맞춤). 상한이 없으면 파일 저장이 일어나 "항상 보여야 하는 내용"이 파일 경로로 바뀐다.
3. **S5/S1 잔여**: 메모리 예외를 `agent_type`이 없는 메인 스레드(Lead)로 한정하고, 경로는 `join(홈 또는 CLAUDE_CONFIG_DIR, 'projects', resolve(CLAUDE_PROJECT_DIR).replace(/[^A-Za-z0-9]/g,'-'), 'memory')` 아래만 연다. 슬러그가 200자를 넘거나 비ASCII이거나 worktree라 맞지 않으면 **닫는다**(config 승인 경로로). `autoMemoryDirectory`를 저장소 settings가 바꿀 수 있으므로, 그 키를 쓰는 settings 편집도 config 승인 대상으로 넣는다. 슬러그 비교는 Windows에서 대소문자 무시.
4. **S1(`orbit:` 가정)**: `roleOf`는 그대로 유효하다. 프로젝트 파일로는 `orbit:` 이름을 흉내 낼 수 없으므로 "프로젝트 에이전트가 coder로 승격" 위험은 닫혔다. 문서에 한 줄 적고, `--agents`·동명 플러그인은 사용자 행위가 필요한 경로로 수용 목록에 둔다. S1 자체(`.orbit/current` 바꿔치기)는 이 조사와 무관하게 gate 로직으로 푼다.
5. **R10(보고 형식을 스킬 하나로)**: `skills: [orbit:report]`(가칭)를 역할 frontmatter에 넣을 수 있다(전문 주입, 32개 한도 안). 단 이름 형식이 미확인이고 실패가 조용하므로 (a) 먼저 한 역할로 실험하고, (b) 역할 본문에 "위에 보고 형식이 없으면 Skill 도구로 `orbit:report`를 호출" 한 줄을 남기거나, (c) `gate.test.mjs`·`claude plugin validate`로 모든 `skills:` 이름이 실재하는지 검사한다. `tools` 허용 목록에 Skill이 빠져 있으면 대체 경로도 막히니 역할별 `tools`를 확인한다. `disable-model-invocation: true`인 스킬은 미리 싣지 못하므로 그 속성을 쓰지 않는다. S6의 "읽은 내용은 데이터" 문장도 같은 스킬 하나에 넣으면 19개 본문을 고치지 않아도 된다(주입이 성공한다는 전제).
6. **auto 모드**: 관문이 막아야 하는 것은 사용자 settings의 auto·bypass에서도 똑같이 막아야 한다. 훅 `deny`/exit 2는 모드와 무관하게 차단되고, `ask`는 auto에서도 사람에게 간다. 애매한 항목(S1 `current` 변경 등)은 `ask`로 사람에게 넘길 수 있다.
