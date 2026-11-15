# RESEARCH — harness/ 플러그인 이전

Lead가 이 세션에서 받은 조사 결과를 옮긴 것. 출처: Claude Code 공식 문서(code.claude.com/docs, 2026-11-14 조회)와 이전 run의 SECURITY.md. **미확인** 표시는 문서에 명시가 없어 로컬 테스트가 필요한 것.

## 1. 플러그인 형식 (plugins/manifest-reference, plugins/components)

- 매니페스트: `harness/.claude-plugin/plugin.json`. 필수 `name`(kebab-case, 공백·@·: 불가). 그 외 `version`, `description`, `author{name}` 등. 모르는 최상위 키는 경고와 함께 제거된다.
- 기본 위치: `skills/<name>/SKILL.md`, `agents/*.md`, `commands/*.md`, `hooks/hooks.json`(최상위 `"hooks"` 키로 감쌈), `bin/`.
- `skills` 키: 경로 또는 경로 배열(디렉터리), 기본 `skills/` 스캔에 **추가**된다. 글롭은 문서에 없음. 중첩 그룹은 `"skills": ["./skills/orbit", "./skills/vendor"]`로 선언. 더 깊은 중첩은 미확인.
- `agents` 키: `.md` 파일 경로(디렉터리 불가), 기본 `agents/` 스캔을 **대체**한다. `agents/` 하위 폴더는 이름에 콜론 세그먼트를 더한다(`agents/review/x.md` → `plugin:review:x`).
- 모든 경로는 `./`로 시작하고 플러그인 루트 안에 있어야 한다.
- `templates/` 같은 추가 폴더는 컴포넌트가 아니라 무시된다(추정).
- 플러그인 루트의 `CLAUDE.md`는 **로드되지 않는다**. 플러그인이 항상 켜진 지시를 줄 방법은 없다 — 스킬, 또는 컨텍스트를 주입하는 훅(SessionStart additionalContext, 플러그인에서의 동작은 미확인)뿐. 플러그인 안의 `settings.json`(예: `agent` 키)은 문서에 없음 → 지원 안 되는 것으로 취급.

## 2. 이름 규칙

- 스킬: `<plugin>:<skill>` (예: `orbit:router`).
- 에이전트: `<plugin>:<name>` (frontmatter name, 없으면 파일 이름).
- 훅 페이로드의 `agent_type`이 범위 붙은 이름(`orbit:engineer`)으로 오는지 맨 이름인지: **미확인**. SubagentStart/Stop 매처는 범위 붙은 식별자를 쓴다고 문서에 있음(매처는 앵커 없는 정규식 → `^…$` 필요).
- 에이전트 frontmatter `skills:`에서 같은 플러그인의 스킬을 범위 붙여 참조해야 하는지: **미확인**(문서 예시는 맨 이름).
- `tools: Agent(a, b)`에 범위 붙은 이름이 되는지: **미확인**. 이 제한 형식은 메인 스레드(`--agent`)에서만 적용된다.
- Agent 도구 `subagent_type`에 범위 붙은 이름: **미확인**.
- `--agent`는 플러그인 에이전트를 맨 이름으로도 찾는다.
- 프로젝트 `.claude/agents/engineer.md`와 플러그인 `orbit:engineer`는 이름이 달라 공존한다. 우선순위는 프로젝트(3) > 플러그인(5).

## 3. 플러그인 에이전트 제약

- 동작: name, description, model, effort, maxTurns, tools, disallowedTools, skills, memory, background, omitClaudeMd, isolation(worktree만), color.
- **무시됨**: permissionMode, hooks, mcpServers, initialPrompt. 훅은 `hooks/hooks.json`에만 둘 수 있다.
- `isolation: worktree`는 기본 브랜치에서 분기한다(부모 HEAD가 아님).

## 4. 플러그인 훅

- `hooks/hooks.json`, settings 훅과 같은 모양. `${CLAUDE_PLUGIN_ROOT}`(설치 위치, 업데이트 시 바뀜), `${CLAUDE_PLUGIN_DATA}`(업데이트에도 유지), `${CLAUDE_PROJECT_DIR}`가 command와 args에서 치환되고 환경 변수로도 전달된다.
- exec 형식(`command` + `args`, 셸 없음) 사용 가능. Windows에서 command는 실제 실행 파일이어야 한다.
- 플러그인 훅은 서브에이전트 안에서도 적용된다. 차단(exit 2)은 settings 훅과 같다고 추정(모양이 같다는 문서 근거).
- 훅 프로세스 cwd는 보장되지 않는다 → 페이로드의 `cwd`와 `CLAUDE_PROJECT_DIR`을 쓴다.

## 5. 로컬 플러그인 로드 (도그푸딩)

- 세션 한정: `claude --plugin-dir ./harness` (복사 없이 그 자리에서 로드). `CLAUDE_CODE_PLUGIN_DIRS` 환경 변수도 있음.
- 저장소에 고정: (a) 저장소 루트 `.claude-plugin/marketplace.json`에 `{"name": …, "owner": …, "plugins": [{"name": "orbit", "source": "./harness"}]}`, (b) `harness/.claude-plugin/plugin.json`의 name을 엔트리 이름과 같게, (c) 커밋된 `.claude/settings.json`에 `extraKnownMarketplaces`(source 종류: github, git, url, file, directory, settings)와 `enabledPlugins: {"orbit@<marketplace>": true}`.
- directory source의 상대 경로 기준(settings 파일 vs 프로젝트 루트): **미확인 — 테스트 필요**.
- `extraKnownMarketplaces`는 폴더를 신뢰한 뒤에만 적용된다. 프로젝트 설정에서 켰는데 설치가 안 된 플러그인은 오류를 보일 수 있고 `claude plugin install <name>@<marketplace> --scope project`로 해결.
- 검증: `claude plugin validate <path> [--strict]`.
- 사용자는 Claude 데스크톱 앱의 Code 탭을 쓴다 → `--plugin-dir` 플래그를 주기 어렵다. settings 경로가 실제로 필요하다.

## 6. Agent SDK (agent-sdk/plugins, agent-sdk/typescript)

- `options.plugins = [{ type: "local", path }]` — 사용자 저장소에 파일 없이 로드. init 메시지에 plugins·skills·plugin_errors가 나온다. 없는 경로는 조용히 건너뛰므로 init 메시지를 확인해야 한다.
- 메인 스레드를 플러그인 에이전트로 돌리는 SDK 옵션: **미확인**.
- `settingSources` 기본값은 user·project·local 전부. `systemPrompt`는 기본이 최소 프롬프트 → `{type:'preset', preset:'claude_code', append?}`.
- 예산: `maxBudgetUsd`(클라이언트 추정, 초과 가능).

## 7. 지금 하네스의 보안 권고 (이전 run SECURITY.md, 차단 0 · 권고 13)

새 관문 훅이 반영해야 할 것:

- **H1** 읽기 전용 강제가 Edit/Write에만 걸린다. Bash/PowerShell을 가진 읽기 전용 역할(qa, reviewer, security)은 셸로 아무 파일이나 쓸 수 있다(gate.mjs, settings.json 포함).
- **H2** `.orbit/`은 누구나 쓸 수 있어 VERDICT 파일·STATE.json의 track·`.orbit/current`를 위조할 수 있다.
- **H3** Lead 허용 명령 정규식 우회: 줄바꿈으로 두 번째 명령, `git diff --output=`, `git branch -f main` / `git switch -C main`, PowerShell `( )`.
- **H4** push·merge 감지 우회: `git.exe push`, alias, `gh pr merge`, `update-ref`. 반대로 명령 본문에 `git push` 글자만 있어도 막는 오탐.
- **H5** 경로 보호가 Windows 별칭을 못 잡는다: 8.3 짧은 이름(`CLAUDE~1`), `::$DATA`, 끝의 점(추정). 메모리 폴더 예외가 위치 고정 없이 걸린다.
- **H6** 닫힌 쪽 실패는 입력 해석 오류뿐이다. gate.mjs 문법 오류, node 없음, 타임아웃에서는 열린다. matcher가 MCP 도구를 포함하지 않는다.
- **H7** qa의 `mcp__Claude_Browser__*` 와일드카드.
- **H8** quick 트랙에서 `.claude/agents`·skills·CLAUDE.md를 바꿔도 리뷰·보안 관문을 거치지 않는다.
- **H9** `.env`·키 파일 읽기를 막는 deny 규칙이 없다.
- **V1~V3** vendor 문구 충돌: TDD의 "Delete it"·"Fix now" vs 태스크 파일만 건드림 / 디버깅의 "환경변수를 로그로" vs 토큰 로그 금지 / description이 넓어 Lead도 자동 호출.

전제: 이 관문은 권한 확인 창이 켜져 있을 때의 **실수 방지 가드레일**이다. 적대적 에이전트에 대한 보안 경계가 되려면 위 항목을 막아야 하고, bypassPermissions 모드에서는 H1·H2·H4가 차단급이다.

## 8. 현재 상태 (이전 대상)

- `.claude/agents/` 13개, `.claude/skills/orbit-*` 5개, `.claude/skills/vendor-*` 3개 + `VENDOR_SOURCES.md` + `VENDOR_LICENSE-superpowers.txt`, `.claude/hooks/gate.mjs` + `gate.test.mjs`, `.claude/settings.json`(PreToolUse 관문 훅), `CLAUDE.md`.
- 저장소: `git init`만 됨, 커밋 없음(사용자 승인 대기).
- 관문 훅이 `.claude/hooks/`와 `.claude/settings*.json` 편집을 모든 에이전트에게 막는다. 전환의 마지막 단계(기존 훅 제거, 플러그인 활성화)는 사람이 `ORBIT_GATE=off`로 해야 한다.

## 9. HARNESS.md ↔ SPEC.md 사이의 열린 질문 (사용자 결정 필요)

1. 트랙 선택 주체: 입력창(SPEC) vs Lead·team.yaml(HARNESS).
2. 템플릿·팀 설정의 원본: DB(SPEC 데이터 저장) vs `harness/templates/` 파일·`.orbit/team.yaml`(HARNESS).
3. 사용자 저장소 쓰기 경계: "파일을 쓰지 않고 로드" vs `.orbit/` 생성.
4. 하네스 카드가 내장 플러그인도 보여주는지.
5. SPEC 2단계 "보안 점검 템플릿 예"가 HARNESS 11절을 가리키게 할지.
