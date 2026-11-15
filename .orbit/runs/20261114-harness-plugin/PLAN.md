# PLAN — 20261114-harness-plugin (full)

## 변경 이력

**plan 루프 3회차 (PLAN_CHECK.md 2회차 검사 VERDICT: FAIL, F-12 대응)**

- HARNESS.md 재확인: 디스크의 현재 내용을 다시 읽었다. 이 계획이 인용하는 0, 2, 3, 4, 5, 6, 7, 8, 11절과 대조했고 계획과 어긋나는 변경은 없었다. 7절 사람 승인은 여전히 6개이고, 8절 파일 구조와 3절 감지 신호 표도 그대로다. 그래서 반영할 것이 없다.
- [F-12] 사람 단계의 커밋 전 중단 경로를 넣었다.
  - 2.7 ④⑤의 순서를 "전제 확인 → 복사·`git rm` → `git add` → **커밋 전 확인** → `git commit`"으로 바꿨다. 로드 확인은 작업 트리만 보면 되므로 커밋 전으로 옮겼다. 그래서 로드가 실패해도 커밋 전 중단(`[ABORT]`)으로 처리된다.
  - 2.7 "되돌리기"에서 커밋 전 `[ABORT]`(`git reset --hard HEAD`)와 커밋 후 `[REVERT]`(`git revert --no-edit`)를 나눴다.
  - 중단 명령이 무엇을 지우지 않는지 따져서 적었다. `git reset --hard`는 추적 파일과 index만 HEAD로 되돌린다. 추적되지 않은 파일과 gitignore된 `.orbit/`(cutover 원본, STATE.json)은 그대로 남는다. 시작 전제가 `git status --short` 비어 있음이므로, 되돌려지는 것은 그 단계의 변경뿐이다. `git add`는 이미 추적 중인 두 파일만 지정한다. 그래서 index에만 있는 새 파일이 생기지 않고, reset이 새 파일을 지우는 경우도 없다. `git add -A`를 쓰지 않는 이유는 `.claude/settings.local.json`이 `.gitignore`의 `*.local`에 걸리지 않기 때문이다. 확인 세션이 이 파일을 만들면 `-A`가 커밋에 넣는다. `git clean`은 금지했다(`NO-GIT-CLEAN`).
  - 같은 구조인 C1(④)에도 같은 전제·`[ABORT]`를 넣었다. H0(C0)은 작업 트리 파일을 바꾸지 않는 첫 커밋이다. 그래서 중간에 실패해도 되돌릴 파일 변경이 없고, `[ABORT]`를 두지 않았다.
  - T9 행, 3.1 V-T9 필수 표지(`[ABORT]` 2개 이상, `git status --short`, `git log --oneline -3`, `git add -- .claude/settings.json CLAUDE.md`, `git commit -m`, `git reset --hard HEAD`, `NO-GIT-CLEAN`)와 표지 설명, 5절 C1·C2 행을 고쳤다.
- [Lead 확인 사실 1] `node --test <디렉터리>`가 이 PC(Node v24.22.1, Windows)에서 MODULE_NOT_FOUND로 실패한다. V-T1·V-T7·V-T8·M1 출구의 `node --test harness/hooks/`를 `node --test harness/hooks/gate.test.mjs`로 바꿨고, V-T1의 원본 테스트는 `node --test .claude/hooks/gate.test.mjs`로 바꿨다. V-T9가 CLAUDE.step2.md에서 찾는 문자열과 3.1 머리말 규칙도 바꿨다(PLAN_CHECK 실행 확인 필요 1).
- [Lead 확인 사실 2] 3.1 머리말에 훅 스크립트를 손으로 시험하는 규칙을 넣었다. Git Bash에서 `printf '%s' '…' | node …` 형식으로 넘기고, JSON 안의 Windows 경로는 `C:/…`처럼 슬래시로 쓴다. PowerShell 5.1 파이프는 BOM을 붙인다.
- [실행 확인 필요 2] 4.0에 프롬프트를 `-p` 바로 뒤에 두는 규칙을 넣었다(`claude -p "<프롬프트>" @F …`). `--plugin-dir`·`--allowedTools`가 여러 값을 받는 형식이면 맨 뒤의 프롬프트가 값으로 먹히기 때문이다. 0단계에서 help에 나온 두 플래그의 형식을 기록하게 했다. V-T5의 `claude -p` 명령도 같은 순서로 바꿨다.
- [실행 확인 필요 3] `post.mjs`는 모드 값을 `.trim()`해서 읽고(4.1), Q9는 `Set-Content -NoNewline`을 쓴다. Q8의 env 확인은 `$`가 필요 없는 `printenv CLAUDE_PLUGIN_ROOT CLAUDE_PROJECT_DIR`(Bash 도구)로 바꿨다. 실제로 쓴 도구 이름(로그의 tool_name)을 SPIKE.md에 적게 했다.
- [경미 1] V-T2의 `--stat`을 뺐다. 이제 바뀐 줄만 출력하고(`-U0` + `grep`), 기대 결과는 "name 줄과 SOURCES.md에 기록된 줄만"이다.
- [경미 2] 2.2 범용화 규칙과 T6 행에, 보호 경로를 문서화할 때 `.claude/hooks`를 붙여 쓰지 말고 "`.claude/` 아래 `hooks/`"처럼 풀어 쓰라고 적었다. 검사 명령은 바꾸지 않았다. gate 스킬 예외를 두면 V-T6·V-W4가 복잡해진다.
- [경미 3] V-T5에 `designer.md`의 브라우저 도구 와일드카드 검사를 넣었다(H7 A안일 때 `CLEAN`).
- [4절 약한 점] 2.6 역할 범위에서 engineer·debugger·devops가 `.orbit/` 안의 소유자 없는 파일(`tasks/*/SUMMARY.md`, `DEBUG.md`)도 쓴다고 명시했다. V-T7의 "정상 경로는 null"에 engineer의 SUMMARY.md 쓰기와 debugger의 DEBUG.md 쓰기를 넣었다.
- 도구 제약: 이 회차의 architect 세션에는 부분 편집 도구가 없었다. 그래서 파일을 다시 썼다. 위에 적은 곳 말고는 1회차 내용을 글자 그대로 유지했다.

**plan 루프 1회차 (PLAN_CHECK.md VERDICT: FAIL 대응)**

- HARNESS.md 재확인: 디스크의 현재 내용을 다시 읽었다. 이 계획이 인용하는 절(0, 2-7, 3, 4, 5, 6, 7, 8, 11절)과 대조했고 계획과 어긋나는 내용은 없었다. 처음 계획을 쓸 때의 사본이 없어서 글자 단위 diff는 하지 못했다. 다만 3절의 "Tauri 프론트" 같은 감지 예시 때문에 researcher.md가 범용 금지어 검사에 걸린다는 점을 찾았고, F-5에서 함께 고쳤다.
- [F-2] 기준 2와 5의 닫힘 시점을 1절 표 밑에 적었다. 둘 다 **이 run 안의 C2(사람 커밋)에서 닫힌다.** 옛 C3에 있던 `.claude/agents`·`.claude/skills` 삭제와 CLAUDE.md 갱신을 C2 커밋으로 옮겼다. CLAUDE.md 새 내용은 T9가 `cutover/CLAUDE.step2.md`로 미리 만들고 M1 리뷰에서 검토한다. 그래서 다음 run(C3)은 CLAUDE.md와 `.claude/`를 건드리지 않는다. 남은 일은 SPEC.md 문서 정리와 데스크톱 도그푸딩 확인이다. H8 규칙상 full이 필요한 이유가 없어졌으므로 C3 트랙은 **quick**이다. 이 근거를 5절에 적었다. "C3을 full로"라는 지적은 C3에서 설정 변경을 빼는 방식으로 해소했다.
- [F-3] T3·T4·T5 검증을 3.1의 V-T3/V-T4/V-T5 코드 블록으로 바꿨다. 들어간 검사는 다음과 같다.
  - 파일마다 존재와 `name` 일치를 본다.
  - 역할별 `model` 값을 21개 모두 대조한다.
  - lead의 `tools` 줄에 `Agent(...)` 20개 이름과 `AskUserQuestion`, `skills:` 줄에 router·handoff가 있는지 본다.
  - `[V1]`/`[V2]`/`[V3]` 표지가 engineer·debugger·qa에 있는지 본다.
  - qa.md에 `qa-mobile`, security.md에 `security-deep`가 있는지 본다.
  - W4가 끝나면 V-W4로 에이전트가 21개인지 센다.
  - 표지는 ASCII로 정했다. 한글을 명령줄 인자로 넘기면 인코딩 문제가 생길 수 있어서다.
- [F-4] T6 검증에 V-T6을 넣었다. `yaml@2`를 저장소 밖 임시 폴더에 `--no-save`로 설치한 뒤 `dev-team.yaml`을 실제로 파싱하고, version·roles 9개 키·budget.loops를 확인한다. T3에는 researcher.md 안 json 예시를 `JSON.parse`해 `signals` 7개 키가 정확히 맞는지 보는 검사를 넣었다(V-T3).
- [F-5] 모든 검증 명령을 표 밖 3.1 코드 블록으로 옮겼다(Git Bash, `rg` 대신 GNU `grep`). "일치 없음" 검사는 `test $? -eq 1 && echo CLEAN` 형식이라, 파일이 없을 때(exit 2) 거짓으로 통과하지 않는다. PowerShell 대체 명령을 하나 적었다. T1의 matcher는 hooks.json을 `JSON.parse`해서 문자열이 정확히 같은지 비교한다(V-T1). 함께 고친 거짓 실패: researcher.md와 reviewer-idiom.md는 감지 신호로 생태계 이름(Tauri, Cargo 등)을 써야 하므로, 이 둘에만 생태계 이름을 뺀 금지어 목록을 쓴다.
- [F-6a] 스파이크를 저장소 밖 `%TEMP%\orbit-spike\`로 옮겼다. 0단계에서 다음을 기록한다.
  - `--setting-sources` 플래그가 있는지
  - 조상 폴더에 `CLAUDE.md`가 있는지
  - 사용자 수준 플러그인이 무엇인지
  - 모든 `claude -p`에 공통 플래그 `$F`(`--permission-mode acceptEdits` + `--allowedTools` + 가능하면 `--setting-sources project,local`)를 붙인다.
  - Q6은 네 가지로 나눴다. Q6a는 대조군(허용 파일 쓰기 성공 + 로그), Q6b는 차단 + 로그 + 사유 문구, Q6c는 서브에이전트, Q6d는 훅을 뺀 플러그인 사본으로 같은 쓰기를 하는 대조군이다.
  - S1이 `claude -p`·`npm`을 부르는 단계에서 권한 창 승인이 필요하다는 점을 적었다(참고 1 반영).
- [F-7] 전환 구간을 없앴다. C2 한 커밋에서 옛 hooks·agents·skills를 지우고 CLAUDE.md를 바꾼다. 그래서 옛 이름과 새 이름이 함께 있는 구간은 ④(확인만 하고 작업하지 않음)뿐이다. ⑤ 이후에는 `orbit:*` 이름만 존재한다. Lead는 A안이면 `orbit:lead`, B안이면 CLAUDE.md를 따르는 메인 세션이다. C3 run은 `orbit:librarian`·`orbit:qa`로 돈다. 이 내용을 2.7과 T9(CUTOVER.md 필수 항목)에 적었다.
- [F-8] S2에 Q11 실패 분기를 넣었다. 순서는 project scope 설치 → local scope 설치 → user scope 설치이고, 각 경우에 대한 결정을 6.1-⑪에 적었다. S2 결과를 SPIKE.md에 적는 보고 서식도 정했다.
- [F-9] Q0b를 추가했다. 이제 `spike:alpha`와 `spike:beta`가 둘 다 로드되는지 확인한다(init 메시지 + CANARY). L1(그룹 폴더) → L2(스킬 폴더를 하나씩 나열) → 둘 다 실패(평탄화, 사용자 결정 6.1-⑫, W3의 T2와 W4 정지) 순서의 분기와, 분기마다 바뀌는 태스크를 적었다.
- [F-10] Q9를 세 방식으로 시험한다. a는 additionalContext, b는 `decision:"block"`+reason, c는 exit 2 + stderr다. 셋 다 안 되면 T8을 취소하고, 2.6의 해당 행을 "미룸"으로 바꾸고, T6 문구를 고치고, 사용자에게 알린다.
- [F-11] T9 검증(V-T9)에 CUTOVER.md 필수 표지 체크리스트(④⑤ 명령, `claude plugin list` 기대 출력, revert, 데스크톱, 캐시, "④에서 작업 금지", "C2 이후 settings 무수정")와 CLAUDE.step2.md 내용 검사를 넣었다.
- [F-6] 기준 6을 관문으로 강제한다(T7). 모든 에이전트는 `CLAUDE.md`·`CLAUDE.local.md`·`.claude/**`·`.mcp.json`에 쓸 수 없다. 예외는 현재 run의 track이 full이면서 STATE.json `approvals`에 `{"gate":"config","result":"approved"}`가 있을 때뿐이다. 판단은 경로 모양으로 하므로 worktree 사본에도 적용된다. `.claude/hooks/`·`.claude/settings*.json`은 승인이 있어도 막는다.
  - 도그푸딩과 양립하는 방법: 오르빗의 CLAUDE.md를 고칠 때는 full run에서 Lead가 `AskUserQuestion`으로 "설정 변경" 승인을 받는다. 이번 전환에서는 사람이 C2에서 Claude 밖에서 고친다.
  - 이 규칙 때문에 SECURITY.md의 `engineer Write agents/security.md`·`skills/orbit-gate/SKILL.md` 사례도 BLOCK이 되고, T7의 "21개 BLOCK" 숫자와 맞는다. 그전에는 H8 행과 어긋나 있었다.
  - 사람 승인 지점이 하나 늘어난다(6.1-⑬). 셸 경유 우회는 6.3에 적었다.
- 참고 2(H9): 셸에서 `cat .env`로 읽는 것은 남는 위험이라고 6.3에 적었다.
- 참고 3(general-purpose Bash): READ_SHELL을 모르는 에이전트에도 적용한다고 2.6에 적었다. T7의 기대값을 "20 BLOCK + 1 ALLOW(qa Bash, 미룸)"로 명확히 했다. reviewer 사례는 reviewer-rules로 테스트한다.
- **4회차 (Lead 지시로 engineer가 부분 편집, 사용자가 한도 초과 1회 승인)**
  - F-13: 사람 단계 C1·C2의 시작 전제와 커밋 후 검증을 `git status --short --untracked-files=no`(추적 파일 변경 없음)로 바꿨다. `??` 파일은 지우지 않고 둔다. 2.7 ④⑤·되돌리기, T9 절차 1번, 5절 C1·C2.
  - 6.1: 사용자 결정을 기록했다(전부 권장안, ⑧ ponytail은 계속 사용).
  - 2.8 토큰 절약 규칙 추가(사용자 결정): architect·plan-checker에 Edit, plan-checker에 Bash, 모델은 team.yaml로 덮어쓰기, standard 리뷰어 최대 2명, vendor 스킬 프리로드 안 함, 인계 범위·보고 30줄.
- **5회차 (Lead 지시로 engineer가 부분 편집)**
  - F-14: 남아 있던 `git status --short` 전제·확인(5절 C2, 2.7 ④⑤, T9 절차 4번)을 `--untracked-files=no`로 맞췄다. `??` 파일은 이름만 기록하고 실패로 치지 않는다.
- **6회차 (리뷰 반영)**: V-T9의 settings.step2 검사를 백스톱 훅(R1)과 B안(agent 없음)에 맞췄다.
  - F-15: 오르빗 저장소의 `.orbit/team.yaml`은 사람이 만든다(2.8-3).
  - F-16: plan-checker의 셸에서 `node --test`를 뺐다. `grep`과 `claude plugin validate`만 허용(2.8-2, 2.6 READ_SHELL, H1 행, V-T7).
  - F-17: 2.8-5의 Lead 스킬 목록을 2.1·T3·V-T3과 맞췄다. T6 표지에 2.8-3을 더하고 V-T6에 검증 줄 3개를 추가했다.

---

기준 문서: `HARNESS.md`(2026-11-14 디스크 내용, 1회차와 3회차에 다시 확인함), `RESEARCH.md`, `20261114-vendor-skills/SECURITY.md`.
읽은 현재 하네스: `.claude/agents/*.md`(13), `.claude/skills/orbit-*`(5), `vendor-*`(3) + `VENDOR_SOURCES.md`, `.claude/hooks/gate.mjs`·`gate.test.mjs`, `.claude/settings.json`, `CLAUDE.md`, `SPEC.md`, `.gitignore`.

---

## 1. 목표

성공 기준 1~6(아래에 줄여 씀)이 참이 되게 한다.

| # | 기준 | 참이 되려면 존재해야 하는 것 | 만드는 태스크 |
|---|---|---|---|
| 1 | `claude plugin validate harness` 통과, HARNESS 8절 구조 | `harness/.claude-plugin/plugin.json`, `agents/`, `skills/orbit/`, `skills/vendor/`, `hooks/`, `templates/` | T2, T3~T6, T1 |
| 2 | 역할이 전부 있고 범용 | 에이전트 21개(2.2), 오르빗 전용 문구가 없는 역할·스킬, 오르빗 규칙은 오르빗 CLAUDE.md에만 | T3~T6, T9(`CLAUDE.step2.md`), C2 |
| 3 | profile.json·team.yaml 형식이 있고 Lead가 그것으로 역할을 켜고 끔 | 형식 정의(2.4), researcher가 profile.json을 씀, router가 병합 규칙으로 STATE.json `roles`를 기록 | T3(researcher), T6(router·template) |
| 4 | 7절 자동 관문을 플러그인 훅으로 강제 + 사람 승인 단계 + 예산 범위 + H1~H9·V1~V3 분류 | `harness/hooks/hooks.json` + `gate.mjs`, router의 승인 단계, 2.6 표 | T1, T7, T8, T6 |
| 5 | 도그푸딩: 저장소를 열면 플러그인이 로드되고, `.claude/`에 중복 사본이 없고, vendor는 `harness/skills/vendor/`에 있음 | 저장소 루트 `.claude-plugin/marketplace.json`, `.claude/settings.json`의 marketplace·enabledPlugins, 옛 사본 삭제 | T2, T9, C1, C2 |
| 6 | 플러그인이 사용자 저장소의 CLAUDE.md·`.claude/`를 건드리지 않음 | 훅·스킬·역할 어디에도 그 경로에 쓰는 단계가 없고, **관문이 그 경로의 쓰기를 막음**(설정 변경 승인이 있는 full run만 예외) | T1, T7, T4(librarian), T6(router), M1 출구 |

**이 run의 완료 정의**: M1(S1~T9) 머지, 그리고 사람 단계 C1·C2 커밋과 C2 확인까지다. 기준 1·3·4·6은 M1 머지 때 닫힌다. 기준 2·5는 C2 커밋 때 닫힌다. C2에서 옛 `.claude/agents·skills·hooks`가 지워지고, 오르빗 전용 체크리스트가 들어간 CLAUDE.md가 반영된다. 단, Q11(데스크톱)이 실패해 6.1-⑪이 "터미널만"으로 결정되면 기준 5의 데스크톱 부분은 열린 채로 남기고, 이 run의 최종 보고에 그렇게 적는다. 다음 run C3은 SPEC.md 정리와 데스크톱 도그푸딩 확인만 한다.

범위 밖(접점만 정함): 오르빗 앱 UI(팀 명단 뷰 등), SDK 사이드카, 오르빗 이벤트 전송 훅, "이 프로젝트에 설치" 버튼, 보안점검팀 템플릿(HARNESS 11절, 2단계), 비용 예산 강제.

---

## 2. 설계 요지

### 2.1 플러그인 배치 (한 저장소 = 마켓플레이스 + 플러그인)

```
orbit/
├─ .claude-plugin/marketplace.json   {"name":"orbit-local","owner":{"name":"orbit"},"plugins":[{"name":"orbit","source":"./harness"}]}
├─ .claude/settings.json             (C1·C2) extraKnownMarketplaces.orbit-local(directory) + enabledPlugins["orbit@orbit-local"] (+ agent, permissions.deny)
└─ harness/
   ├─ .claude-plugin/plugin.json     {"name":"orbit","version":"0.1.0","description":…,"skills":["./skills/orbit","./skills/vendor"]}  ← skills 형식은 S1-Q0b 결과(L1/L2)
   ├─ agents/        21개 .md (2.2)
   ├─ skills/orbit/  router, handoff, gate, threat-model, agent-config-audit, design-system-guard, data-migration-safety, devops-release
   ├─ skills/vendor/ test-driven-development/, verification-before-completion/, systematic-debugging/, SOURCES.md, LICENSE-superpowers.txt
   ├─ hooks/         hooks.json, gate.mjs, gate.test.mjs
   └─ templates/     dev-team.yaml (= team.yaml 형식 정의 겸 기본값)  ← Q0에서 오류가 나면 6.1-⑩
```

- 이름: 플러그인이 `orbit`이므로 스킬은 `orbit:router`, 에이전트는 `orbit:engineer`가 된다. 그래서 스킬 폴더 이름에서 `orbit-` 접두사를 뺀다.
- vendor 스킬은 frontmatter `name`과 폴더 이름을 **원본 이름으로 되돌린다**. `vendor-` 접두사의 역할은 플러그인 범위 이름이 대신한다. 원문 안의 `superpowers:…` 참조는 `orbit:…`로 바꾼다. 원본과의 차이가 줄어든다. 모든 수정은 SOURCES.md에 기록한다.
- `agents` 키는 쓰지 않는다(기본 `agents/` 스캔). `skills` 키는 두 그룹 폴더를 선언한다(RESEARCH 1절). S1-Q0b가 실패하면 스킬 폴더를 하나씩 나열하는 L2로 바꾼다.
- 관문 스크립트는 하나만 둔다(gate.mjs: 훅 모드 + `check` CLI). 루트는 파일 위치가 아니라 `CLAUDE_PROJECT_DIR`(없으면 `process.cwd()`)에서 구한다. 플러그인은 캐시나 다른 위치에서 돌 수 있기 때문이다.
- gate.mjs는 team.yaml을 읽지 않는다(YAML 파서 의존성을 들이지 않음). team.yaml은 Lead(모델)가 읽는다.
- 역할 파일 frontmatter 형식은 검증 명령이 그대로 읽을 수 있게 고정한다. `tools:`는 한 줄 쉼표 구분, `skills:`는 한 줄 흐름 목록(`skills: [router, handoff]`), `model:`은 한 줄이다.

### 2.2 역할 = 에이전트 파일 21개 (정본 이름 목록, 모든 태스크가 이 이름을 쓴다)

| 구분 | 파일(`harness/agents/<name>.md`) | 모델 | 비고 |
|---|---|---|---|
| 핵심 | lead | opus | |
| | researcher(신규) | sonnet | |
| | product, architect | opus | |
| | plan-checker, engineer | sonnet | |
| | debugger | opus | |
| | reviewer-correctness, reviewer-tests, reviewer-maintainability, reviewer-rules | opus | reviewer 패널 기본 4 |
| | qa | sonnet | Mobile QA는 qa.md 안의 `qa-mobile` 모드 |
| | security | opus | 심화는 security.md 안의 `security-deep` 모드 |
| | librarian | sonnet | |
| 전문 3(신규) | designer, data | opus | profile·team.yaml로 켜짐 |
| | devops | sonnet | |
| 조건부 리뷰어 4(신규) | reviewer-performance, reviewer-accessibility, reviewer-data, reviewer-idiom | opus | diff·profile에 따라 Lead가 패널에 추가 |

모델은 HARNESS 4절 권장값이다. "주요 스킬" 중 외부 것(gstack, Superpowers brainstorming·using-git-worktrees, Compound Engineering, GSD, Anthropic frontend-design)은 **가져오지 않는다**. 그 방식은 역할 본문 몇 줄로 옮긴다("~방식"). 가져오려면 사용자 승인이 필요하다(6.2).

범용화 규칙:
- 역할과 스킬에 Tauri, `127.0.0.1`, `1420`, `cargo`/`npm run …` 같은 고정 명령, `SPEC.md`, `.claude/hooks/` 경로를 쓰지 않는다. 대신 "프로젝트 CLAUDE.md·README에 적힌 빌드·테스트 명령"이나 "생태계의 audit 도구"처럼 쓴다.
- 보호 경로를 문서화해야 하는 곳(gate 스킬, security의 설정 감사 등)에서는 `.claude/hooks`를 붙여 쓰지 않고 "`.claude/` 아래 `hooks/`"처럼 풀어 쓴다. 금지어 검사(V-T4~V-T6, V-W4)를 거짓으로 실패시키지 않기 위해서다.
- 예외: researcher.md(감지 신호 표)와 reviewer-idiom.md(언어·프레임워크별 관용구)는 생태계 이름 자체가 내용이므로, Tauri·Cargo 같은 이름을 예시로 쓸 수 있다. 이 둘에도 오르빗 전용 값(`127.0.0.1`, `1420`, `SPEC.md`, `.claude/hooks`, `npm run tauri`)은 쓰지 않는다. researcher.md의 profile.json 예시는 중립 예시(오르빗 값이 아닌 것)로 쓴다.
- 오르빗 전용 점검 목록은 오르빗 `CLAUDE.md`의 "보안·검증 체크리스트" 절로 옮긴다. 대상은 현재 `.claude/`의 threat-model 22~30행, qa의 tauri dev·1420, security의 Tauri capability·CSP, reviewer-rules의 127.0.0.1, plan-checker의 오르빗 항목이다. 옮기는 방법은 T9가 `cutover/CLAUDE.step2.md`에 쓰고, C2에서 사람이 반영하는 것이다. 역할 본문에는 "프로젝트 CLAUDE.md의 체크리스트도 확인"이라고만 쓴다.

### 2.3 메인 세션을 Lead로 만드는 법 (스파이크 S1·S2 결과로 분기)

| 경로 | A안 (스파이크에서 동작 확인 시) | B안 (안 되면) |
|---|---|---|
| 터미널·데스크톱 Code 탭(도그푸딩) | 커밋된 `.claude/settings.json`에 `"agent": "orbit:lead"`(또는 S1에서 확인된 맨 이름)를 둔다. lead.md의 tools(`Agent(…)` 목록)와 `skills:` 미리 불러오기가 메인 스레드에 적용된다 | 오르빗 `CLAUDE.md`의 "메인 세션은 Lead, `orbit:router`부터" 문단을 유지한다(지금 방식). 도구 제한은 gate.mjs의 Lead 규칙(`agent_id` 없음 = Lead)이 대신 강제한다 |
| Agent SDK(마일스톤 ⑥) | SDK에 메인 스레드 에이전트 옵션이 있으면 `orbit:lead` | `systemPrompt: {type:'preset', preset:'claude_code', append: <lead.md 본문>}`(문서 확인됨) + 같은 gate 훅 |

- SessionStart 훅으로 Lead 지시를 주입하는 안은 쓰지 않는다. 플러그인을 켠 모든 세션을 강제로 바꾸고, 사용자 CLAUDE.md보다 앞설 위험이 있다.
- 공통 안전장치(T9의 `CLAUDE.step2.md`가 담고 C2에서 반영): 오르빗 CLAUDE.md에 다음 한 줄을 넣는다. "`orbit:` 에이전트가 목록에 없으면 플러그인이 로드되지 않은 것이다. 관문이 꺼져 있다고 보고 작업하지 말고 사용자에게 알린다." CLAUDE.md는 플러그인이 없어도 항상 로드된다.

### 2.4 접점 파일 형식 (오르빗 UI·엔진이 나중에 읽고 쓴다)

**`.orbit/profile.json`**: researcher만 쓴다(관문이 강제).
```json
{
  "version": 1,
  "generatedAt": "2026-11-14T05:00:00Z",
  "stack": ["typescript", "react", "rust", "tauri"],
  "signals": {
    "designer": ["package.json: react 19", "src/App.css"],
    "reviewer-accessibility": ["package.json: react 19"],
    "data": [],
    "devops": ["src-tauri/tauri.conf.json: bundle"],
    "security-deep": ["harness/hooks/ (훅·에이전트 설정)"],
    "reviewer-performance": [],
    "qa-mobile": []
  }
}
```
- 위 예시는 오르빗 저장소 값이다. researcher.md에는 같은 키를 가진 중립 예시를 쓴다(2.2 범용화).
- `signals`의 키는 이 7개로 고정한다. 값은 근거(파일: 내용) 목록이고, 비어 있지 않으면 신호가 켜진 것이다. 근거 문자열은 팀 명단 뷰에서 "켜진 이유"로 쓴다.
- `stack`은 reviewer-idiom이 쓴다. 감지 규칙은 HARNESS 3절 표를 researcher.md 본문에 둔다.

**`.orbit/team.yaml`**: 에이전트는 쓰지 않는다(관문이 강제). 사용자나 오르빗 UI가 쓴다. 파일이 없으면 전부 기본값이다. 형식의 정본은 `harness/templates/dev-team.yaml`(주석 포함)이다.
```yaml
version: 1
roles:            # on | off | auto. 핵심 역할은 끌 수 없음(트랙이 쓰임을 정함)
  designer: auto
  data: auto
  devops: auto
  security-deep: auto
  qa-mobile: auto
  reviewer-performance: auto
  reviewer-accessibility: auto
  reviewer-data: auto
  reviewer-idiom: auto
models: {}        # <역할>: opus|sonnet|haiku — 비우면 역할 파일의 model (적용 방식은 S1-Q10 결과)
track: auto       # quick | standard | full | auto
budget:           # 이번 범위: loops만 Lead가 지킴. *_usd는 오르빗 엔진 몫(형식만 고정)
  run_usd: null
  day_usd: null
  loops: { plan: 3, review: 3, debug: 2, security: 2 }
rules: []         # 추가 규칙 문장. 사용자 CLAUDE.md와 충돌하면 CLAUDE.md가 우선
```

**병합 규칙(router):** `on`/`off`는 그대로 따른다. `auto`는 profile 신호와 이번 작업 내용(diff·요청)을 보고 Lead가 판단한다(HARNESS 3절 "신호일 뿐"). 결과는 STATE.json에 기록한다.

**STATE.json 추가 필드**(기존 형식 유지 + 두 개):
```json
"roles": { "designer": "auto: profile designer(package.json: react 19) + UI 변경", "data": "off: team.yaml" },
"approvals": [{ "gate": "plan", "result": "approved", "at": "…", "via": "AskUserQuestion" }]
```
`approvals[].gate` 값: `brief`, `design`, `plan`, `db-migration`, `deploy`, `vendor-skill`, `config`.

### 2.5 흐름과 사람 승인 (router 개정)

- 흐름은 HARNESS 5절 그래프와 6절 트랙 표로 바꾼다. Researcher는 profile.json이 없거나 조사가 필요할 때 부른다. Designer와 Data는 병렬로 돈다. Architect ⇄ Plan Checker는 최대 3회다.
- 사람 승인 지점은 HARNESS 7절의 6개다: BRIEF(full), DESIGN(UI 큰 변경), PLAN(standard 이상), DB 마이그레이션 실행, 배포·외부 공개, 외부 스킬 가져오기. 여기에 **설정 변경(`config`)** 승인을 더한다. 이것은 기준 6과 HARNESS 2절 7번에서 나온 것이다(6.1-⑬). 대상은 CLAUDE.md·`.claude/`·`.mcp.json`을 바꾸는 full run이다.
- Lead는 `AskUserQuestion`으로 묻고 결과를 `approvals`에 적는다. 승인 없이 다음 단계로 가지 않는다. 나중에 오르빗 UI 승인 카드도 같은 `approvals`를 쓴다.
- 트랙 상향(H8): 에이전트 설정(CLAUDE.md, `.claude/`, 플러그인 폴더·`.claude-plugin/`, `.mcp.json`)을 바꾸거나 외부 스킬을 들이는 작업은 full로 한다. 관문은 full + `config` 승인이 없으면 앞의 세 경로(CLAUDE.md·`.claude/`·`.mcp.json`) 쓰기를 막는다(2.6). 그래서 router 규칙을 지키지 않아도 그 경로는 열리지 않는다. 반면 플러그인 폴더 안의 agents·skills 본문은 경로 모양으로 구별되지 않으므로 router 규칙(full 트랙의 reviewer-rules·security)에 맡긴다.
- 승인과 위조 방지의 한계: `approvals`는 Lead가 쓴다(소유자 규칙상 Lead만 쓸 수 있다). 그래서 사람이 실제로 답했는지를 훅이 확인하지는 못한다. 실제 경계는 대화형 질문(사람이 답함)이다. 6.3 참고.

### 2.6 관문: 무엇을 어떻게 강제하나

| HARNESS 7절 항목 | 이번에 | 방법 |
|---|---|---|
| REVIEW.md 승인 없이 머지 금지 | 고침(이전) | 기존 ship 관문(standard/full)을 플러그인 훅으로 옮긴다 |
| VERIFY.md 증거 없이 완료 처리 금지 | 고침(이전 + 1개 추가) | ship 관문에 더해, **verify가 실패한 상태에서 STATE.json을 `stage: "done"`으로 쓰는 것을 차단**한다(T7) |
| tokens.json 밖 색·크기 하드코딩 경고 | 고침(신규, S1-Q9로 분기) | PostToolUse `gate.mjs design-warn`. `design/tokens.json`이 있을 때만 동작하고 막지 않는다. 경고는 Q9에서 처음 동작한 방식(a additionalContext / b decision+reason / c exit 2 stderr)으로 전한다(T8). **셋 다 안 되면 미룸**: T8을 취소하고, hooks.json에 PostToolUse를 두지 않는다. 대신 design-system-guard 체크리스트(designer·reviewer)가 같은 점검을 지시 수준으로 한다 |
| 예산: loop 최대 반복 | 일부 | Lead가 team.yaml `budget.loops`(없으면 기본값)와 STATE.json `loops`로 멈춘다. 지시 수준이다. 훅 강제는 미룬다. 카운터를 Lead가 쓰므로 훅이 읽어도 강제력이 늘지 않는다. 엔진이 카운터를 가질 때(⑥) 옮긴다 |
| 예산: 실행·일별 토큰/비용 상한 | 미룸 | 형식(`budget.run_usd/day_usd`)만 고정한다. 훅 페이로드에 비용이 없고(미확인), 일별 합계는 오르빗 DB에 있다. 마일스톤 ⑥에서 SDK `maxBudgetUsd` + DB로 처리한다 |

**보안 권고 분류 (RESEARCH 7절)**

| id | 분류 | 내용 / 이유 | 태스크 |
|---|---|---|---|
| H1 | 일부 고침 | 셸을 가진 읽기 전용 리뷰어(correctness·tests 제외)와 **모르는 에이전트**(general-purpose, 사용자 자신의 에이전트)는 `git status/log/diff/show`만 쓸 수 있다(READ_SHELL, H3 수정 포함. plan-checker는 추가로 `grep`, `claude plugin validate <경로>` 허용(2.8-2). 리다이렉션·파이프로 쓰는 형태는 차단). **미룸**: qa, security, reviewer-correctness, reviewer-tests, data는 테스트·스캐너·로컬 DB 실행이 일이다. 테스트 실행은 임의 코드 실행이라 문자열 검사로 가둘 수 없다. 경계는 권한 확인 창과 샌드박스다. gate 스킬의 "모든 에이전트" 문구를 실제 범위에 맞게 고친다 | T7, T6 |
| H2 | 고침(쓰기 주체 제한) | 소유자 표: PLAN_CHECK.md→plan-checker, VERIFY.md→qa, SECURITY.md→security, REVIEW.md·STATE.json·`.orbit/current`→Lead, profile.json→researcher, team.yaml→어떤 에이전트도 못 씀. STATE.json의 track 하향은 차단한다(Write는 content로, Edit는 현재 파일에 old→new를 적용한 결과로 판단). 셸 경로를 통한 위조는 H1의 미룸 범위에 남는다 | T7 |
| H3 | 고침 | `\r\n`와 `(`를 제외한다. `--output`, `-f`, `-C`, `-B`, `--force`, `-D`를 거부한다. Lead가 실행하는 gate는 **이 gate.mjs의 실제 경로**로 고정한다. 아무 `gate.mjs`나 허용하면 Lead가 `.orbit/`에 쓴 스크립트를 실행할 수 있기 때문이다. Q8이 전부 실패하면 Lead의 gate CLI 허용 자체를 뺀다(4절) | T1, T7 |
| H4 | 일부 고침 | `git(.exe)?`, `gh pr merge`, `update-ref`, `branch -f`, `switch -C`, `checkout -B`를 출고로 감지한다. **미룸**: git 쪽 강제(`pre-push`, `reference-transaction` 훅)는 사용자 저장소의 `.git/hooks`나 `core.hooksPath`에 써야 한다. 이는 HARNESS 2절 7번과 기존 husky 등과 충돌하므로 사용자 결정이다(6.1-⑦). heredoc 오탐도 남는다 | T7 |
| H5 | 고침 | 존재하는 가장 깊은 조상을 `realpathSync.native`로 정규화한다. 세그먼트 끝의 `.`/공백, 드라이브가 아닌 `:`, `~\d` 모양 세그먼트는 정규화하지 못하면 거부한다. 메모리 예외는 `os.homedir()/.claude/projects/*/memory/`로 고정한다 | T7 |
| H6 | 일부 고침 | 주석·스킬 문구를 실제 보장 범위로 고친다. 문법 오류는 `node --test`가 import 단계에서 잡는다. **미룸**: node가 없을 때, 타임아웃, 2가 아닌 종료 코드에서 열리는 것은 Claude Code 동작이라 플러그인에서 바꿀 수 없다. MCP matcher는 H7 이후 쓰기 가능한 MCP를 가진 역할이 없으므로 미룬다 | T1 |
| H7 | 고침(분기) | S2에서 확인한 브라우저 도구 이름을 qa·designer에 이름으로 나열한다. 이름을 얻지 못하면 와일드카드를 두고 위험에 남긴다. URL 제한은 문서화된 수단이 없어 미룬다(미확인) | T4, T5 |
| H8 | 고침 | router: 에이전트 설정·외부 스킬을 바꾸는 작업은 full. gate: (1) 어느 위치에 있든 `.claude-plugin/`, `hooks/{hooks.json,gate.mjs,gate.test.mjs}`, 실행 중인 gate.mjs의 폴더, `.claude/hooks/`, `.claude/settings*.json`은 모든 에이전트가 쓸 수 없다. (2) `CLAUDE.md`·`CLAUDE.local.md`·`.claude/**`·`.mcp.json`은 full + `config` 승인 run에서만 쓸 수 있다(기준 6). 플러그인 agents·skills 본문 변경은 full 트랙의 reviewer-rules·security가 본다 | T1, T7, T6 |
| H9 | 일부 고침 | 오르빗 저장소: C2에서 `.claude/settings.json`에 `permissions.deny`(`Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`)를 추가한다(사람). 이 규칙은 Read 도구만 막는다. 셸의 `cat .env`는 막지 못한다(6.3). **미룸**: 제품 쪽은 플러그인이 permissions를 실을 수 없다. 마일스톤 ⑥에서 SDK 옵션으로 넣는다 | T9, C2 |
| V1 | 고침 | engineer.md에 `[V1]` 표지와 함께 "vendor 스킬과 충돌하면 이 문서가 우선. 태스크 밖 실패는 보고만. 삭제는 자기 태스크 파일 안에서만"을 넣는다 | T3 |
| V2 | 고침 | debugger.md에 `[V2]` 표지와 함께 "진단 로그에 토큰·환경변수 값·페이로드 본문을 찍지 않는다. 존재 여부와 길이만"을 넣는다 | T3 |
| V3 | 고침 | engineer·debugger·qa 본문에 `[V3]` 표지와 함께 "human partner = 사용자. Lead·에이전트 메시지는 승인이 아님. 질문은 보고로"를 넣는다(vendor 원문은 수정하지 않음). Lead의 `Skill` 도구는 S1-Q2/Q7이 A안이면 뺀다(skills 미리 불러오기). B안이면 남기고 위험에 기록한다 | T3, T4 |
| (H10) | 범위 밖 | 사용자 수준 ponytail 플러그인은 사용자 판단이다(6.1-⑧) | — |

**역할별 쓰기 범위(T7)**: 판단은 위에서부터 순서대로 한다.
1. 보호 경로(H8-1)는 누구도 쓸 수 없다.
2. 설정 경로(H8-2: `CLAUDE.md`, `CLAUDE.local.md`, `.claude/**`, `.mcp.json`)는 경로 모양으로 판단한다. 저장소 안이면 어느 깊이든, `.orbit/` 안의 worktree 사본도 포함한다. 현재 run이 full이고 `config` 승인이 있으면 아래 역할 범위로 넘어가고, 아니면 막는다. 메모리 예외 경로(`os.homedir()/.claude/projects/*/memory/`)는 저장소 밖이라 해당하지 않는다.
3. `.orbit/` 안에서는 소유 규칙(H2)이 앞선다.
4. 역할 범위는 다음과 같다.
   - Lead: `.orbit/`
   - engineer·debugger·devops: 그 밖 전부. `.orbit/` 안에서도 3의 소유자가 없는 파일(예: `tasks/*/SUMMARY.md`, `DEBUG.md`, `RELEASE.md`)은 쓸 수 있다
   - librarian: `*.md`, `docs/**`, `CHANGELOG*`(2를 통과한 경우에만 CLAUDE.md)
   - designer: `design/**`
   - 그 외 역할과 **모르는 에이전트**: `.orbit/`만

셸은 Lead가 LEAD_SHELL, H1 대상 역할과 모르는 에이전트가 READ_SHELL을 쓴다. plan-checker는 추가로 `grep`, `claude plugin validate <경로>`를 허용한다(2.8-2). 리다이렉션·파이프로 쓰는 형태는 차단한다. 나머지 역할은 출고 검사만 받는다.

### 2.7 전환 순서 (관문이 0개인 구간 없음)

| 단계 | 누가 | 관문 상태 | 내용 |
|---|---|---|---|
| ① 기준 커밋 C0 | 사람 | 옛 관문 | 지금 상태를 그대로 첫 커밋으로 남기고 `orbit/20261114-harness-plugin` 브랜치를 만든다. **이 run에서 저장소를 바꾸는 첫 태스크(T1/T2) 전에 필요하다** |
| ② M1 빌드 | engineer(옛 맨 이름) | 옛 관문(`.claude/hooks`, settings만 보호) | `harness/`, `.claude-plugin/`만 새로 만든다. 옛 `.claude/`는 건드리지 않는다. 이 run의 리뷰·QA·보안이 옛 역할로 돌기 때문이다 |
| ③ 리뷰·QA·보안 → main 머지 | 옛 역할들 | 옛 관문 | QA는 `--plugin-dir`로 새 플러그인을 띄워 관문 동작을 확인한다(두 관문이 함께 돌아도 무방). 리뷰 대상에 `RUN_DIR/cutover/*`(특히 `CLAUDE.step2.md`)를 포함한다 |
| ④ C1 겹치기 | 사람, **Claude 없는 일반 PowerShell** | 옛 + 새 관문 | 전제 확인(`git status --short --untracked-files=no` 출력 없음, `git log --oneline -3` 맨 위가 M1 머지) → `cutover/settings.step1.json`(옛 hooks 유지 + marketplace + enabledPlugins)을 `.claude/settings.json`에 복사 → `git add -- .claude/settings.json` → **커밋 전에** 새 세션에서 신뢰·설치·로드를 확인(터미널, 데스크톱)하고 세션을 닫는다 → `git commit`. 확인 세션 뒤 `git diff --cached --stat`과 `git status --short --untracked-files=no`가 settings.json 한 파일만 보여야 한다(설치 명령이 settings.json을 다시 썼으면 `git diff -- .claude/settings.json`으로 보고, step1과 다르면 `[ABORT]` 후 Lead에게 보고). 어느 단계든 실패하면 `[ABORT]`. **확인만 하고 이 구간에서는 작업하지 않는다.** 옛 gate는 `orbit:*`를 모르는 에이전트로 보고 막고, 새 gate는 옛 맨 이름을 모르는 에이전트로 보고 막는다 |
| ⑤ C2 옛 하네스 제거 | 사람, 일반 PowerShell | 새 관문 | 커밋 하나로 다음을 한다. 전제 확인(`git status --short --untracked-files=no` 출력 없음, `git log --oneline -3` 맨 위가 C1) → `settings.step2.json`(hooks 제거 + agent + deny) 복사, `cutover/CLAUDE.step2.md` → `CLAUDE.md` 복사, `git rm -r .claude/hooks .claude/agents .claude/skills`, `git add -- .claude/settings.json CLAUDE.md` → **커밋 전에** `git status --short --untracked-files=no`가 `M`·`D` 줄만 보여 주는지 확인한다. 이어서 새 세션에서 Lead의 `src/` 쓰기가 **플러그인 gate 경로가 찍힌 메시지**로 막히는지 확인하고 세션을 닫는다 → `git commit`. 어느 단계든 실패하면 `[ABORT]`. 기준 2·5가 이 커밋에서 닫힌다 |
| ⑥ C3 첫 도그푸딩 run(다음 run, quick) | `orbit:lead` → `orbit:librarian`, `orbit:qa` | 새 관문 | SPEC.md 65행 정리(문서)를 데스크톱 Code 탭에서 끝까지 진행한다. CLAUDE.md·`.claude/`는 건드리지 않는다 |

- 이름 규칙: ⑤ 이후 저장소에는 `orbit:*` 에이전트·스킬만 있다. 옛 맨 이름(`engineer`)은 파일이 지워져서 호출할 수 없다. 혹시 남아 있더라도 새 gate는 그것을 모르는 에이전트(`.orbit/`만, READ_SHELL)로 다룬다. 즉 닫힌 쪽으로 실패한다. Lead는 2.3 A안이면 settings `agent`의 `orbit:lead`이고, B안이면 CLAUDE.md를 따르는 메인 세션이다.
- `ORBIT_GATE=off`는 쓰지 않는다. 보호 파일(settings.json, `.claude/hooks/`, CLAUDE.md) 변경은 사람이 Claude 밖에서 파일 복사와 git으로 한다. 그래서 Claude 세션의 관문은 한 번도 꺼지지 않는다. 꼭 Claude 안에서 해야 하면 이 한 줄을 쓴다: `$env:ORBIT_GATE='off'; claude; Remove-Item Env:ORBIT_GATE` (같은 창에 값이 남지 않게).
- 되돌리기는 커밋 전과 커밋 후로 나눈다.
  - **커밋 전 `[ABORT]`**: ④⑤에서 복사, `git rm`, 커밋 전 확인 중 어느 것이든 실패하면 한다. Claude 세션을 모두 닫고 일반 PowerShell에서 `git reset --hard HEAD`를 실행한다. 그다음 `git status --short`로 결과를 본다. ⑤라면 `Test-Path .claude/hooks/gate.mjs` → True도 확인한다.
    - 되돌려지는 것: HEAD에 있는 추적 파일(settings.json, CLAUDE.md, `git rm`으로 지운 파일)과 index.
    - 남는 것: 추적되지 않은 파일(`??`)과 gitignore된 `.orbit/`(cutover 원본, STATE.json, run 산출물).
    - 이 명령이 안전한 이유: 시작 전제로 `git status --short --untracked-files=no`가 비어 있었다(추적 파일 변경 없음). 그래서 되돌려지는 것은 그 단계의 변경뿐이다. 또 `git add`는 이미 추적 중인 파일만 지정한다. 그래서 index에만 있는 새 파일이 생기지 않고, reset이 그런 파일을 지우는 일도 없다.
    - `git clean`은 쓰지 않는다. 확인 세션이 만든 `??` 파일(예: `.claude/settings.local.json`. `.gitignore`의 `*.local`에 걸리지 않음)은 지우지 않고 그대로 둔다. `git add -- <파일>`이 파일을 지정하므로 커밋에 들어가지 않고, 시작 전제가 추적 파일만 보므로 재시도와 다음 단계를 막지 않는다.
  - **커밋 후 `[REVERT]`**: 각 단계가 커밋 하나다. 일반 터미널에서 `git revert --no-edit <C2>`(필요하면 `<C1>`까지)를 실행하면 옛 `.claude/hooks·agents·skills`, settings, CLAUDE.md가 함께 돌아온다. revert가 충돌하지 않도록 C2 이후에는 settings.json을 손대지 않는다. 나중 세션에서 로드가 실패하면 2.3의 CLAUDE.md 안전장치가 작업을 멈추고, 사람이 `[REVERT]`한다.
- 전환 뒤 Lead 세션은 새로 시작해야 한다. 플러그인과 agent 설정은 세션 시작 때 로드되기 때문이다. run 상태는 `.orbit/`에 남는다.

### 2.8 토큰 절약 규칙 (사용자 결정 2026-11-14 — 2.2·2.5·3절의 해당 내용과 다르면 이 절이 우선)

1. **부분 편집**: `architect`와 `plan-checker`의 tools에 `Edit`를 넣는다. 수정 회차에는 산출물을 Edit로 부분 편집하고 전체를 다시 쓰지 않는다. 쓰기 범위는 gate가 그대로 `.orbit/` 안으로 막는다.
2. **plan-checker의 셸**: `plan-checker`의 tools에 `Bash`를 넣는다. 계획의 검증 명령 중 `grep`과 `claude plugin validate <경로>`만 직접 실행해 보고, 나머지(테스트 실행 등)는 읽어서 판단해 "실행 확인 필요"로 적는다. gate의 읽기 전용 셸 규칙(READ_SHELL)에 plan-checker 한정으로 이 두 명령을 더한다(T7).
3. **모델**: 플러그인의 기본 모델은 HARNESS 4절 그대로 둔다. 프로젝트별로 `.orbit/team.yaml`의 `models.<역할>`(2.4 형식의 `models` 맵)이 덮어쓰고, Lead가 Agent 호출의 `model` 인자로 넘긴다(스파이크 Q10이 실패하면 덮어쓰기는 불가 — 6.3에 기록하고 기본 모델로 돈다). 오르빗 저장소의 `.orbit/team.yaml`은 C2 뒤 **사람이** 만든다(Lead가 내용을 채팅으로 제시하고, 사람이 Claude 밖에서 파일로 저장한다. gate는 에이전트의 team.yaml 쓰기를 막는다): `architect`·`security`·`debugger`는 opus, `plan-checker`·`librarian`은 haiku, 나머지 역할은 sonnet, `budget.loops.plan: 2`.
4. **리뷰어 수**: standard 트랙의 리뷰는 최대 2명이다 — `reviewer-correctness`와, diff에 가장 맞는 리뷰어 1명. 전체 패널(기본 4 + 조건부)은 full 트랙에서만 돌린다. router 스킬(T6)에 적는다.
5. **vendor 스킬은 미리 넣지 않는다**: 역할 frontmatter의 `skills:`에 vendor 스킬을 넣지 않는다(넣으면 호출할 때마다 전문이 들어간다). 대신 역할 본문의 "스킬" 줄에 언제 어떤 스킬을 부르는지 이름으로 적는다(HARNESS 9절의 "명시적으로 연결"은 이 줄로 충족). orbit 스킬 중 Lead의 router·handoff만 frontmatter에 남긴다.
6. **인계와 보고**: handoff 스킬(T6)에 두 규칙을 넣는다 — READ는 파일 전체 대신 절·줄 범위를 지정할 수 있으면 지정한다 / 서브에이전트의 최종 메시지는 30줄 이내로 쓰고 상세는 산출물 파일에 둔다.

---

## 3. 태스크 표 — M1: 검증 스파이크 + 플러그인 빌드 (상세)

공통 READ: HARNESS.md, 이 PLAN.md, RESEARCH.md, (W3부터) `RUN_DIR/SPIKE.md`.
공통 금지: `.claude/` 아래 파일 수정·삭제(C1·C2 몫), 저장소의 `CLAUDE.md` 수정.
검증 명령은 3.1에 있다. 표의 "V-xx"는 그 코드 블록을 뜻한다.
**[사람 승인: 계획 확정 + 6.1 결정]은 W1 전에 받는다.**

| id | 할 일 | 파일 경로 | 검증 | 웨이브 | 의존 | 주체 |
|---|---|---|---|---|---|---|
| S1 | **CLI 검증 스파이크.** 4절의 0단계 + Q0~Q10, Q12를 실행해 확인한다. 저장소 코드는 바꾸지 않는다. 최종 메시지에 질문마다 명령/출력/결론(4절 표의 "성공 시/실패 시" 중 어느 쪽인지)을 보고한다. Lead가 이를 `SPIKE.md`로 저장한다. `claude -p`·`npm pack`(네트워크) 호출은 권한 창에서 사람 승인이 필요하다 | `%TEMP%\orbit-spike\**` (저장소 밖) | 4절의 명령마다 출력 첨부. `claude plugin validate $S\plugin` → exit 0(또는 Q0 실패 분기 보고). Q마다 결론 한 줄이 없으면 미완료 | 1 | — | engineer |
| S2 | **설정 경로·데스크톱 스파이크.** S1이 준비한 `settings.project.json`과 marketplace를 저장소 밖 임시 프로젝트에 놓고 Q5, Q7b, Q11, Q13을 확인한다(4절 S2 체크리스트·분기) | `%TEMP%\orbit-spike-proj\` (저장소 밖) | 항목마다 4절의 보고 서식으로 Lead에게 전달하고, SPIKE.md에 기록 | 2 | S1 | 사람 |
| H0 | **기준 커밋 C0** + run 브랜치 생성 | (git) | `git log --oneline -1` → 커밋 1개. `git branch --show-current` → `orbit/20261114-harness-plugin` | 2 | 승인 | 사람 |
| T1 | **gate 이전.** `.claude/hooks/gate.mjs`·`gate.test.mjs`를 `harness/hooks/`로 **복사**(원본 유지)하고 아래 (a)~(e)를 바꾼다. 테스트를 먼저 바꿔 실패하는 것을 확인한다. (a) ROOT = `CLAUDE_PROJECT_DIR ?? process.cwd()` (b) 보호 경로를 H8-1대로(경로 모양 + 실행 중인 gate 폴더) (c) Lead 허용 gate 명령을 S1-Q8 결과 형식 + 이 파일의 실제 경로로 고정한다. Q8이 전부 실패하면 허용을 뺀다 (d) agent_type 비교를 S1-Q1 결과로 한다(A: `orbit:<role>` 정확히 일치 / B: 맨 이름). 메인 스레드 판정은 Q7 결과로 `agent_id` 없음 또는 `agent_type`이 lead (e) H6 주석 정정. `hooks.json`: PreToolUse matcher는 정확히 `Edit` `Write` `NotebookEdit` `Bash` `PowerShell`을 정규식 OR(`|`)로 이은 문자열, exec 형식 `node ${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs`, timeout 10 | `harness/hooks/gate.mjs`, `harness/hooks/gate.test.mjs`, `harness/hooks/hooks.json` | V-T1 | 3 | S1, H0 | engineer |
| T2 | **매니페스트 + vendor 이전.** `plugin.json`(skills 형식은 S1-Q0b 결과: L1 그룹 / L2 개별 11개 나열. L2면 T5·T6 몫인 8개 orbit 스킬 폴더에 frontmatter만 있는 자리표시 `SKILL.md`를 만든다), 저장소 루트 `marketplace.json`(2.1). vendor 3개를 `harness/skills/vendor/<원본 이름>/`로 복사하고 name을 원본으로 되돌린다. `vendor-…`/`superpowers:` 참조는 `orbit:<원본 이름>`으로 바꾼다. `VENDOR_SOURCES.md` → `SOURCES.md`(수정 기록 갱신). LICENSE는 바이트 단위로 같게 복사한다. 원본 `.claude/skills/`는 유지한다 | `harness/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `harness/skills/vendor/**` (L2면 + `harness/skills/orbit/*/SKILL.md` 자리표시) | V-T2 | 3 | S1, H0 | engineer |
| T3 | **핵심 역할 1.** 아래 역할을 범용화해 옮긴다(frontmatter 형식은 2.1 마지막 항목). lead: 2.3 분기 반영, tools의 `Agent(...)`에 21개 중 lead를 뺀 20개를 S1-Q3 형식으로, AskUserQuestion 포함, `skills: [router, handoff]`를 S1-Q2 형식으로. researcher(신규): profile.json 중립 예시를 json 코드 블록으로(2.4 키 7개), 감지 규칙 표, RESEARCH.md 출처 링크, tools Read/Grep/Glob/WebSearch/WebFetch/Write. product, architect, plan-checker(오르빗 항목은 T9로 넘김), engineer(`[V1]`,`[V3]`), debugger(`[V2]`,`[V3]`). 모델은 2.2 (+2.8-1·2·5) | `harness/agents/{lead,researcher,product,architect,plan-checker,engineer,debugger}.md` | V-T3 | 4 | T2 | engineer |
| T4 | **리뷰·검증·보안·기록 역할.** 다음을 범용화해 옮긴다. reviewer-correctness/tests/maintainability/rules, qa(`qa-mobile` 모드, H7 분기, `[V3]`), security(`security-deep` 모드: 위협 모델·인증·입력 검증·MCP·훅·에이전트 설정 감사), librarian(사용자 CLAUDE.md·`.claude/`는 관문이 막는다. 고치려면 Lead가 받은 `config` 승인이 있는 full run이어야 한다는 문장. 표지 `[CONFIG]`). 조건부 4개는 신규로 만든다(performance, accessibility, data, idiom: profile `stack`을 읽음). 리뷰어 공통 최종 메시지 형식은 기존 것을 유지한다. 모델은 2.2 (+2.8-5) | `harness/agents/{reviewer-correctness,reviewer-tests,reviewer-maintainability,reviewer-rules,reviewer-performance,reviewer-accessibility,reviewer-data,reviewer-idiom,qa,security,librarian}.md` | V-T4 | 4 | T2 | engineer |
| T5 | **전문 역할 + 전용 스킬.** designer(DESIGN.md, `design/tokens.json`, 시각 리뷰, 브라우저 도구 H7 분기), data(DATA.md: 스키마 변경·마이그레이션 계획·롤백, 운영 DB 금지, 마이그레이션 실행은 사람 승인), devops(RELEASE.md: 배포 절차·롤백, 배포 명령은 사람 승인). 스킬 3개는 각각 30줄 안팎의 짧은 체크리스트다: design-system-guard(Q9가 전부 실패하면 "토큰 밖 값 점검" 항목이 경고 훅을 대신한다고 적음), data-migration-safety, devops-release. 모델은 2.2 | `harness/agents/{designer,data,devops}.md`, `harness/skills/orbit/{design-system-guard,data-migration-safety,devops-release}/SKILL.md` | V-T5 | 4 | T2 | engineer |
| T6 | **오르빗 스킬 범용화 + 팀 템플릿.** 각 스킬의 변경 내용은 다음과 같다. router: 2.4 병합 규칙, 2.5 흐름·승인 7개(`config` 포함)·H8 트랙 규칙, HARNESS 6절 트랙, 리뷰어 선택에 조건부 4개, team.yaml loops, STATE.json `roles`/`approvals`. handoff: 21역할 읽기·쓰기 표, DESIGN/DATA/RELEASE/RESEARCH 형식. gate: CLI 호출 형식 = S1-Q8(전부 실패면 "Lead는 Read로 VERDICT 확인"), H1·H2 실제 강제 범위, 2.6 쓰기 범위·설정 경로 규칙(보호 경로는 2.2 규칙대로 "`.claude/` 아래 `hooks/`"처럼 풀어 씀), design-warn 상태(Q9 결과). threat-model: 오르빗 전용 목록을 지우고 "프로젝트 CLAUDE.md 체크리스트"로 바꿈. agent-config-audit: `VENDOR_SOURCES.md` → 프로젝트의 vendor 출처 기록, 플러그인 `.claude-plugin/`·hooks.json 점검 추가. `templates/dev-team.yaml` = 2.4 형식(Q0 실패 분기면 6.1-⑩의 위치). router는 team.yaml의 `models.<역할>`을 읽어 Agent 호출의 `model` 인자로 넘긴다(`[MODELS]`). router는 standard 트랙 리뷰어를 최대 2명으로 한다(`[REVIEW-MAX2]`). handoff는 보고를 30줄로 제한한다(`[REPORT-30]`). 이 세 표지는 해당 문장 끝에 그대로 적는다 (+2.8-3·4·6) | `harness/skills/orbit/{router,handoff,gate,threat-model,agent-config-audit}/SKILL.md`, `harness/templates/dev-team.yaml` | V-T6 | 4 | T2 | engineer |
| T7 | **관문 강화.** 2.6의 H1(READ_SHELL, 모르는 에이전트 포함), H2(소유자 표 + track 하향 차단), H3(정규식), H4(패턴 확장), H5(경로 정규화), H8-2 설정 경로 규칙, 역할별 쓰기 범위, `stage:"done"` + verify 실패 차단. SECURITY.md "6) 우회 재현"의 22개 사례를 먼저 테스트로 쓰고, 지금 대부분 ALLOW라서 실패하는 것을 확인한다 (+2.8-2) | `harness/hooks/gate.mjs`, `harness/hooks/gate.test.mjs` | V-T7 | 5 | T1 | engineer |
| T9 | **전환 키트.** 2.7 ④⑤용 파일 4개. `settings.step1.json`: 지금 hooks 그대로 + `extraKnownMarketplaces.orbit-local` directory source(S2-Q5 형식) + `enabledPlugins`(Q11 분기에 따라 설치 scope). `settings.step2.json`: hooks 없음 + `agent`(2.3 A안일 때) + `permissions.deny`(H9). `CLAUDE.step2.md`: 지금 CLAUDE.md를 바탕으로 11·17·18·22·32행을 새 이름·경로로 바꾸고(11행 테스트 명령은 `node --test harness/hooks/gate.test.mjs`), "보안·검증 체크리스트" 절(2.2의 원본 목록에서 옮김), 2.3 안전장치 한 줄, 캐시 방식이면 갱신 명령을 넣는다. 나머지 줄은 그대로 둔다. `CUTOVER.md`: 3.1 V-T9의 필수 표지를 모두 포함한 PowerShell 절차. ④⑤ 각각 전제 확인 → 복사·`git rm` → `git add` → 커밋 전 확인 → `git commit` 순서이고, 각 절에 커밋 전 중단 `[ABORT]`와 커밋 후 `[REVERT]`를 구분해 적는다(2.7 되돌리기) | `RUN_DIR/cutover/settings.step1.json`, `RUN_DIR/cutover/settings.step2.json`, `RUN_DIR/cutover/CLAUDE.step2.md`, `RUN_DIR/cutover/CUTOVER.md` | V-T9 | 5 | T1, T2, T3~T6, S2 | engineer |
| T8 | **디자인 토큰 경고(Q9 성공 시에만).** gate.mjs `design-warn` 모드(PostToolUse Edit/Write)를 만든다. `<root>/design/tokens.json`이 있고 대상이 css/scss/less/tsx/jsx/vue/svelte/html이면, 새 내용의 hex 색과 `Npx` 중 tokens.json 본문에 없는 값을 Q9에서 동작한 방식으로 경고한다. 내부 오류는 조용히 통과한다(Q9-c 방식일 때만 exit 2, 그 외 exit 0). hooks.json에 PostToolUse 항목을 추가한다. **Q9 a·b·c가 모두 실패하면 이 태스크는 취소한다** | `harness/hooks/gate.mjs`, `harness/hooks/gate.test.mjs`, `harness/hooks/hooks.json` | V-T8 | 6 | T7 | engineer |

웨이브 파일 충돌 점검: W3 = T1(hooks/), T2(manifest, vendor, L2면 orbit 자리표시). W4 = T3, T4, T5, T6(agents와 skills/orbit 파일이 서로 겹치지 않음. T2의 자리표시는 W3이라 충돌 없음). W5 = T7(hooks/), T9(RUN_DIR/cutover). W6 = T8(hooks/). gate 파일을 건드리는 T1→T7→T8은 웨이브를 나눴다. W4가 끝나면 Lead가 V-W4를 실행한다.

### 3.1 검증 명령

모두 **Git Bash**(Bash 도구)에서 저장소 루트를 cwd로 실행한다. 코드 블록 안의 `|`는 정규식 OR이고, 마크다운 표 이스케이프가 아니다. `rg`는 쓰지 않는다(GNU `grep`은 Git for Windows에 들어 있다). "일치 없음" 검사는 `test $? -eq 1 && echo CLEAN` 형식이다. grep은 일치가 없으면 1, 파일이 없거나 오류면 2를 돌려주므로, 대상 파일이 없을 때 거짓으로 통과하지 않는다. `MISSING`/`BAD`로 시작하는 줄이 하나라도 나오면 실패다.

- `node --test`에는 **테스트 파일을 직접** 준다(`node --test harness/hooks/gate.test.mjs`). 이 PC(Node v24.22.1, Windows)에서는 디렉터리를 주면 모듈로 읽으려다 MODULE_NOT_FOUND로 실패한다(Lead 확인).
- 훅 스크립트를 손으로 시험할 때는 Git Bash에서 `printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"C:/Users/…/src/x.ts"}}' | node harness/hooks/gate.mjs` 형식을 쓴다. PowerShell 5.1에서 문자열을 파이프로 node에 넘기면 앞에 BOM이 붙어 `JSON.parse`가 실패한다. JSON 안의 Windows 경로는 슬래시(`C:/…`)로 쓴다. 역슬래시는 Bash 도구를 거치며 깨진다(Lead 확인).

PowerShell만 있을 때 금지어 검사 대체 명령(같은 정규식, 대소문자 무시, 파일이 없으면 오류):
```powershell
if (Select-String -Path harness\agents\lead.md,harness\agents\product.md -Pattern 'tauri|127\.0\.0\.1|1420|cargo|src-tauri|SPEC\.md|\.claude/hooks' -ErrorAction Stop) { 'FOUND' } else { 'CLEAN' }
```

**V-T1** — 기대: `node --test` 전부 pass, 그다음 `OK`, 원본 테스트도 pass
```bash
node --test harness/hooks/gate.test.mjs
node -e 'const h=JSON.parse(require("fs").readFileSync("harness/hooks/hooks.json","utf8"));const e=h.hooks.PreToolUse[0];const m=e.matcher;const c=e.hooks[0];if(m!=="Edit|Write|NotebookEdit|Bash|PowerShell"||c.timeout!==10||!JSON.stringify(c).includes("${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs")){console.error(JSON.stringify(e));process.exit(1)}console.log("OK")'
node --test .claude/hooks/gate.test.mjs
```
새 테스트에 반드시 들어갈 것: `harness/hooks/gate.mjs`·`x/.claude-plugin/plugin.json`·`.orbit/wt/t1/harness/hooks/hooks.json` 쓰기 차단, Lead의 `node .orbit/x/gate.mjs check` 차단과 정식 경로 허용, `CLAUDE_PROJECT_DIR` 기준 currentRun, 범위 붙은 agent_type.

**V-T2** — 기대: validate 둘 다 exit 0. diff 명령은 바뀐 줄만 출력하며, 그 줄은 `name:` 줄이거나 `SOURCES.md`에 기록된 수정(`superpowers:`/`vendor-` → `orbit:`)이어야 한다. 마지막은 `SAME`
```bash
claude plugin validate harness
claude plugin validate .
git diff --no-index -U0 .claude/skills/vendor-test-driven-development harness/skills/vendor/test-driven-development | grep -E '^[-+][^-+]'
cmp .claude/skills/VENDOR_LICENSE-superpowers.txt harness/skills/vendor/LICENSE-superpowers.txt && echo SAME
```

**V-T3** — 기대: `CLEAN` 세 줄, `OK`, 그 외 출력 없음, validate exit 0
```bash
A=harness/agents
grep -EniH 'tauri|127\.0\.0\.1|1420|cargo|src-tauri|SPEC\.md|\.claude/hooks' $A/{lead,product,architect,plan-checker,engineer,debugger}.md; test $? -eq 1 && echo CLEAN
grep -EniH '127\.0\.0\.1|1420|SPEC\.md|\.claude/hooks|npm run tauri' $A/researcher.md; test $? -eq 1 && echo CLEAN
while read n m; do grep -Eq "^name: $n\s*$" "$A/$n.md" || echo "BAD name $n"; grep -Eq "^model: $m\s*$" "$A/$n.md" || echo "BAD model $n"; done <<'EOF'
lead opus
researcher sonnet
product opus
architect opus
plan-checker sonnet
engineer sonnet
debugger opus
EOF
for n in researcher product architect plan-checker engineer debugger reviewer-correctness reviewer-tests reviewer-maintainability reviewer-rules reviewer-performance reviewer-accessibility reviewer-data reviewer-idiom qa security librarian designer data devops; do grep -Eq "^tools:.*Agent\(([^)]*[ ,])?(orbit:)?$n[,) ]" $A/lead.md || echo "MISSING Agent $n"; done
grep -Eq '^tools:.*AskUserQuestion' $A/lead.md || echo "MISSING AskUserQuestion"
grep -Eq '^skills:.*router' $A/lead.md && grep -Eq '^skills:.*handoff' $A/lead.md || echo "MISSING lead skills"
for p in "engineer V1" "engineer V3" "debugger V2" "debugger V3"; do set -- $p; grep -Fq "[$2]" "$A/$1.md" || echo "MISSING [$2] in $1"; done
for n in architect plan-checker; do grep -Eq '^tools:.*Edit' $A/$n.md || echo "MISSING Edit tool in $n (2.8-1)"; done
grep -Eq '^tools:.*Bash' $A/plan-checker.md || echo "MISSING Bash tool in plan-checker (2.8-2)"
grep -E -A6 '^skills:' $A/engineer.md $A/debugger.md | grep -Ei 'test-driven|verification-before|systematic-debugging'; test $? -eq 1 && echo CLEAN
node -e 'const t=require("fs").readFileSync("harness/agents/researcher.md","utf8");const m=t.match(/```json\r?\n([\s\S]*?)```/);const k=Object.keys(JSON.parse(m[1]).signals).sort().join();if(k!=="data,designer,devops,qa-mobile,reviewer-accessibility,reviewer-performance,security-deep"){console.error(k);process.exit(1)}console.log("OK")'
claude plugin validate harness
```

**V-T4** — 기대: `CLEAN` 세 줄(qa skills 검사 포함), 그 외 출력 없음, validate exit 0. 마지막 줄은 H7 A안일 때만 `CLEAN`이 기대값이다(B안이면 와일드카드가 있으므로 6.3에 기록)
```bash
A=harness/agents
grep -EniH 'tauri|127\.0\.0\.1|1420|cargo|src-tauri|SPEC\.md|\.claude/hooks' $A/{reviewer-correctness,reviewer-tests,reviewer-maintainability,reviewer-rules,reviewer-performance,reviewer-accessibility,reviewer-data,qa,security,librarian}.md; test $? -eq 1 && echo CLEAN
grep -EniH '127\.0\.0\.1|1420|SPEC\.md|\.claude/hooks|npm run tauri' $A/reviewer-idiom.md; test $? -eq 1 && echo CLEAN
while read n m; do grep -Eq "^name: $n\s*$" "$A/$n.md" || echo "BAD name $n"; grep -Eq "^model: $m\s*$" "$A/$n.md" || echo "BAD model $n"; done <<'EOF'
reviewer-correctness opus
reviewer-tests opus
reviewer-maintainability opus
reviewer-rules opus
reviewer-performance opus
reviewer-accessibility opus
reviewer-data opus
reviewer-idiom opus
qa sonnet
security opus
librarian sonnet
EOF
grep -Fq 'qa-mobile' $A/qa.md || echo "MISSING qa-mobile"
grep -Fq '[V3]' $A/qa.md || echo "MISSING [V3] in qa"
grep -Fq 'security-deep' $A/security.md || echo "MISSING security-deep"
grep -Fq '[CONFIG]' $A/librarian.md || echo "MISSING [CONFIG] in librarian"
grep -E -A6 '^skills:' $A/qa.md | grep -Ei 'test-driven|verification-before|systematic-debugging'; test $? -eq 1 && echo CLEAN
claude plugin validate harness
grep -En 'mcp__[^ ,)]*\*' $A/qa.md; test $? -eq 1 && echo CLEAN
```

**V-T5** — 기대: `CLEAN`, 그 외 출력 없음, validate exit 0, `claude -p` 명령 출력에 `design-system-guard`, `data-migration-safety`, `devops-release`가 모두 있음(S1-Q0b에서 확인한 init 메시지 방식). 마지막 줄은 H7 A안일 때만 `CLEAN`이 기대값이다(B안이면 6.3에 기록)
```bash
A=harness/agents; K=harness/skills/orbit
grep -EniH 'tauri|127\.0\.0\.1|1420|cargo|src-tauri|SPEC\.md|\.claude/hooks' $A/{designer,data,devops}.md $K/{design-system-guard,data-migration-safety,devops-release}/SKILL.md; test $? -eq 1 && echo CLEAN
while read n m; do grep -Eq "^name: $n\s*$" "$A/$n.md" || echo "BAD name $n"; grep -Eq "^model: $m\s*$" "$A/$n.md" || echo "BAD model $n"; done <<'EOF'
designer opus
data opus
devops sonnet
EOF
claude plugin validate harness
claude -p "Say OK" --plugin-dir harness --output-format stream-json --verbose | grep -o 'orbit:[a-z-]*' | sort -u
grep -En 'mcp__[^ ,)]*\*' $A/designer.md; test $? -eq 1 && echo CLEAN
```

**V-T6** — 기대: `CLEAN`, 그 외 `MISSING` 없음, `YAML OK`, validate exit 0. `npm install`은 네트워크를 쓴다(권한 창). 저장소 밖 임시 폴더에 `--no-save`로 설치하므로 저장소 의존성은 늘지 않는다
```bash
K=harness/skills/orbit
grep -EniH 'tauri|127\.0\.0\.1|1420|cargo|src-tauri|SPEC\.md|\.claude/hooks|VENDOR_SOURCES' $K/{router,handoff,gate,threat-model,agent-config-audit}/SKILL.md; test $? -eq 1 && echo CLEAN
for s in AskUserQuestion approvals roles team.yaml profile.json budget.loops reviewer-idiom config; do grep -Fq "$s" $K/router/SKILL.md || echo "MISSING $s in router"; done
grep -Fq '[REVIEW-MAX2]' $K/router/SKILL.md || echo "MISSING REVIEW-MAX2 in router (2.8-4)"
grep -Fq '[MODELS]' $K/router/SKILL.md || echo "MISSING MODELS in router (2.8-3)"
grep -Fq '[REPORT-30]' $K/handoff/SKILL.md || echo "MISSING REPORT-30 in handoff (2.8-6)"
Y="$(node -p 'require("path").join(require("os").tmpdir(),"orbit-yaml")')"
npm install --no-save --no-package-lock --prefix "$Y" yaml@2 >/dev/null
node -e 'const y=require(require("path").join(require("os").tmpdir(),"orbit-yaml","node_modules","yaml"));const d=y.parse(require("fs").readFileSync("harness/templates/dev-team.yaml","utf8"));const k=["designer","data","devops","security-deep","qa-mobile","reviewer-performance","reviewer-accessibility","reviewer-data","reviewer-idiom"];const miss=k.filter(x=>!d.roles||!(x in d.roles));if(d.version!==1||miss.length||!d.budget||!d.budget.loops||!("models" in d)||!("track" in d)||!("rules" in d)){console.error("BAD",miss);process.exit(1)}console.log("YAML OK")'
claude plugin validate harness
```

**V-W4** (W4가 끝난 뒤 Lead가 실행) — 기대: `21`, `CLEAN`, validate exit 0
```bash
ls harness/agents/*.md | wc -l
grep -EniH '127\.0\.0\.1|1420|SPEC\.md|\.claude/hooks|npm run tauri' harness/agents harness/skills/orbit -r; test $? -eq 1 && echo CLEAN
claude plugin validate harness
```

**V-T7** — 기대: 전부 pass
```bash
node --test harness/hooks/gate.test.mjs
```
테스트에 반드시 들어갈 것:
- SECURITY.md 6)의 22사례. `ship baseline`은 BLOCK. 우회 21개 중 20개는 BLOCK(`reviewer Bash write src`는 reviewer-rules로, `general-purpose Bash`는 모르는 에이전트로, `engineer Write agents/security.md`·`skills/orbit-gate/SKILL.md`는 `.claude/` 아래 경로로 config 승인 없이). `qa Bash write hooks` 1개는 이름에 "미룸(H1)"을 붙여 ALLOW를 단언한다.
- 설정 경로(기준 6):
  - 승인이 없으면 BLOCK: engineer의 `CLAUDE.md` 쓰기(standard + config 승인 / full + 승인 없음 둘 다), librarian의 `CLAUDE.md` 쓰기, engineer의 `.claude/agents/x.md`·`.orbit/wt/t1/CLAUDE.md`·`.mcp.json` 쓰기.
  - full + `config` 승인이 있으면 null: engineer의 `CLAUDE.md`, librarian의 `CLAUDE.md`.
  - 승인이 있어도 BLOCK: engineer의 `.claude/settings.json`.
- READ_SHELL 허용(2.8-2): plan-checker의 `grep -n x file`, `claude plugin validate harness`는 null. 같은 plan-checker의 `node --test harness/hooks/gate.test.mjs`, `grep x > out.txt`는 BLOCK.
- 정상 경로는 null: engineer의 `src/` 쓰기, engineer의 `.orbit/runs/<id>/tasks/t1/SUMMARY.md` 쓰기, debugger의 `.orbit/runs/<id>/DEBUG.md` 쓰기, qa의 VERIFY.md 쓰기, Lead의 `git status`.

**V-T8** — 기대: 전부 pass, validate exit 0
```bash
node --test harness/hooks/gate.test.mjs
claude plugin validate harness
```
새 테스트: tokens.json 없음 → 출력 없음, tokens에 있는 `#1e1e2e` → 출력 없음, 새 `#ff0000` → 경고(Q9 방식의 형식), 잘못된 tokens.json → 조용히 통과.

**V-T9** — 기대: `JSON OK`, `CLEAN`, 그 외 `MISSING` 없음
```bash
R=.orbit/runs/20261114-harness-plugin/cutover
node -e 'const fs=require("fs"),R=process.argv[1];const a=JSON.parse(fs.readFileSync(R+"/settings.step1.json","utf8")),b=JSON.parse(fs.readFileSync(R+"/settings.step2.json","utf8")),cur=JSON.parse(fs.readFileSync(".claude/settings.json","utf8"));if(JSON.stringify(a.hooks)!==JSON.stringify(cur.hooks)||!(b.hooks&&b.hooks.PreToolUse&&!b.hooks.PostToolUse&&!("agent" in b))||!a.enabledPlugins||!b.enabledPlugins||!(b.permissions&&b.permissions.deny&&b.permissions.deny.length===4)){console.error("BAD");process.exit(1)}console.log("JSON OK")' "$R"
grep -En 'orbit-router|orbit-handoff|orbit-gate|\.claude/hooks|VENDOR_SOURCES' "$R/CLAUDE.step2.md"; test $? -eq 1 && echo CLEAN
for s in 'orbit:router' 'node --test harness/hooks/gate.test.mjs' 'harness/skills/vendor/SOURCES.md' 'CSP' 'capabilit' '127.0.0.1' 'npm run tauri dev'; do grep -Fq -- "$s" "$R/CLAUDE.step2.md" || echo "MISSING $s in CLAUDE.step2"; done
for s in '[STEP4]' '[STEP5]' '[ABORT]' '[REVERT]' '[DESKTOP]' '[CACHE]' 'Copy-Item' 'settings.step1.json' 'settings.step2.json' 'CLAUDE.step2.md' 'git status --short' 'git log --oneline -3' 'git rm -r .claude/hooks .claude/agents .claude/skills' 'git add -- .claude/settings.json CLAUDE.md' 'git commit -m' 'git reset --hard HEAD' 'claude plugin list' 'orbit@orbit-local' 'git revert --no-edit' 'NO-WORK-IN-STEP4' 'NO-SETTINGS-EDIT-AFTER-C2' 'NO-GIT-CLEAN'; do grep -Fq -- "$s" "$R/CUTOVER.md" || echo "MISSING $s in CUTOVER"; done
test "$(grep -cF '[ABORT]' "$R/CUTOVER.md")" -ge 2 || echo "MISSING [ABORT] in both STEP4 and STEP5"
grep -Eq 'claude plugin marketplace update|CACHE: none' "$R/CUTOVER.md" || echo "MISSING cache command"
```
CUTOVER.md 표지의 뜻:
- `[STEP4]`/`[STEP5]` 절은 각각 다음 순서로 쓴다.
  1. 전제: Claude 세션을 모두 닫은 일반 PowerShell, 저장소 루트. `git status --short --untracked-files=no` → 출력 없음(있으면 시작하지 않는다. `??` 파일은 전제에 넣지 않고 지우지도 않는다). `git log --oneline -3` → 맨 위가 M1 머지(④) 또는 C1(⑤).
  2. 복사(`Copy-Item`)와 ⑤의 `git rm -r …`.
  3. `git add -- .claude/settings.json`(④) 또는 `git add -- .claude/settings.json CLAUDE.md`(⑤). `-A`는 쓰지 않는다.
  4. 커밋 전 확인: `git status --short --untracked-files=no`의 기대 출력(④는 `M  .claude/settings.json` 한 줄, ⑤는 그 줄과 `M  CLAUDE.md`, 그리고 `D  .claude/…` 줄들. `??` 파일은 따로 `git status --short`로 보고 이름만 기록한다(실패 아님)). 이어서 새 세션에서 기대 출력을 본다: `claude plugin list`에 `orbit@orbit-local` enabled, `/hooks`에 플러그인 PreToolUse, ⑤는 Lead 차단 메시지에 플러그인 gate 경로. 확인한 뒤 세션을 닫는다.
  5. `git commit -m "…"`과 `git log --oneline -1`.
- 각 절의 `[ABORT]`(커밋 전, 1~4 중 실패): Claude 세션 종료 → `git reset --hard HEAD` → `git status --short` → ⑤는 `Test-Path .claude/hooks/gate.mjs` → True. 2.7 "되돌리기"대로, 이 명령이 되돌리는 것과 남기는 것(추적되지 않은 파일, `.orbit/`)을 적는다.
- `[REVERT]`(커밋 후): `git revert --no-edit <C2>`(필요하면 `<C1>`).
- `[DESKTOP]`: Code 탭에서 `orbit:` 에이전트 목록을 확인하는 절차.
- `[CACHE]`: S2-4가 캐시면 갱신 명령, 아니면 `CACHE: none`.
- 규칙 줄 세 개:
  - `NO-WORK-IN-STEP4`: ④ 겹치기 구간에서는 확인만 한다.
  - `NO-SETTINGS-EDIT-AFTER-C2`: C2 이후 settings.json을 고치지 않아야 revert가 충돌하지 않는다.
  - `NO-GIT-CLEAN`: 중단할 때 `git clean`을 쓰지 않는다.
- step2의 `agent` 키는 2.3 A안일 때만 있으므로 검사하지 않고 리뷰가 확인한다.

**M1 출구(QA·리뷰·보안이 확인할 것)**
- `claude plugin validate harness` → exit 0 (기준 1). `--strict`의 경고는 VERIFY.md에 기록한다.
- `node --test harness/hooks/gate.test.mjs` → pass. V-W4 → `21`, `CLEAN`.
- 저장소 밖 임시 프로젝트(그 안에 `CLAUDE.md`와 `.claude/agents/x.md` 미리 생성)에서 `claude -p "<프롬프트>" --plugin-dir <repo>/harness` + 4절의 공통 플래그(프롬프트는 `-p` 바로 뒤)로 다음을 확인한다.
  1. 메인 세션의 `src/x` 쓰기가 `[orbit gate]`로 막힌다.
  2. `orbit:engineer`를 호출한 뒤 `src/` 쓰기는 허용된다.
  3. `orbit:qa`의 `src/` 쓰기는 막힌다.
  4. init 메시지에 `orbit:router`와 vendor 3개가 있다.
  5. `orbit:engineer`에게 그 `CLAUDE.md`에 한 줄을 추가하라고 시키면 막힌다.
  6. 실행 전후로 `.claude/`와 `CLAUDE.md`가 같다(`Get-FileHash` 비교, 기준 6).
- full 트랙이므로 reviewer 패널(rules가 하네스를 약화하는지 확인. `RUN_DIR/cutover/CLAUDE.step2.md`와 `CUTOVER.md` 포함)과 security(`orbit-agent-config-audit`)를 실행한다.

---

## 4. 스파이크 상세 (S1·S2)

### 4.0 위치와 격리 (S1, PowerShell 5.1)

```powershell
$S = Join-Path $env:TEMP 'orbit-spike'      # 저장소 밖. plugin\, plugin-nohook\, proj\, sdk\
New-Item -ItemType Directory -Force $S\proj, $S\sdk | Out-Null
claude --version
claude --help | Select-String 'setting-sources|permission-mode|allowedTools|plugin-dir'
$d = "$S\proj"; while ($d) { if (Test-Path "$d\CLAUDE.md") { "ANCESTOR CLAUDE.md: $d" }; $d = Split-Path $d }
claude plugin list
```
- 기대 결과: 조상 폴더에 `CLAUDE.md`가 없다. `claude plugin list`에 나온 사용자 수준 플러그인은 기록한다(결과 해석 때 감안).
- help 출력에서 `--plugin-dir`와 `--allowedTools`가 값을 여러 개 받는 형식(`<…...>`)인지 SPIKE.md에 적는다.
- 공통 플래그 `$F` — `--setting-sources`가 help에 있으면:
  ```powershell
  $F = @('--setting-sources','project,local','--permission-mode','acceptEdits','--allowedTools','Bash,Write,Edit,Read,Agent,Skill','--plugin-dir',"$S\plugin")
  ```
  help에 없으면 앞의 두 요소를 빼고, "사용자 설정·플러그인이 함께 로드됨"이라고 SPIKE.md에 적는다(미확인: `--setting-sources`가 사용자 CLAUDE.md까지 빼는지).
- 모든 Q는 `cd $S\proj` 후 `claude -p "<프롬프트>" @F <기타 플래그>`로 실행한다. **프롬프트는 `-p` 바로 뒤에 둔다.** `$F`의 끝인 `--plugin-dir`가 값을 여러 개 받는 형식이면, 맨 뒤에 둔 프롬프트가 경로로 먹히기 때문이다. 4.2 표의 `claude -p @F … "<프롬프트>"` 표기도 이 순서로 실행한다. 프롬프트에는 큰따옴표를 넣지 않는다(PS 5.1의 네이티브 인자 전달 문제).
- `--allowedTools`의 쉼표 구분은 미확인이다. Q6a 대조군이 권한 때문에 실패하면 `'--allowedTools','Bash','Write','Edit','Read','Agent','Skill'`처럼 공백으로 나눈 형식으로 바꿔 다시 실행한다.

### 4.1 실험 플러그인 `$S\plugin\`

- `.claude-plugin/plugin.json`: `{"name":"spike","version":"0.0.0","skills":["./skills/orbit","./skills/vendor"]}` (L1)
- `skills/orbit/alpha/SKILL.md`: 본문에 `CANARY-ALPHA`와 `ROOT=${CLAUDE_PLUGIN_ROOT}` 한 줄. `skills/vendor/beta/SKILL.md`: `CANARY-BETA`. `templates/x.yaml`: 무시되는지 확인용.
- 에이전트 4개. 본문은 모두 "컨텍스트에 있는 CANARY로 시작하는 단어를 그대로 보고하라"다.
  - `agents/probe.md`: tools Bash, Write; `skills: [alpha]`
  - `agents/probe2.md`: `skills: [spike:alpha]`
  - `agents/boss.md`: tools Read, Bash, `Agent(spike:probe)`; `skills: [alpha]`
  - `agents/boss2.md`: tools Read, Bash, `Agent(probe)`
- `bin/spike-echo.cmd` + `bin/spike-echo`(`BIN-OK` 출력).
- `hooks/hooks.json`:
  - PreToolUse `.*` → `node ${CLAUDE_PLUGIN_ROOT}/hooks/log.mjs`. 페이로드의 tool_name, tool_input.file_path/subagent_type/model, agent_id, agent_type, cwd와 env의 CLAUDE_PROJECT_DIR, CLAUDE_PLUGIN_ROOT를 `<CLAUDE_PROJECT_DIR>/spike-log.jsonl`에 추가한다. Write의 file_path가 `blocked.txt`로 끝나면 stderr에 `SPIKE-BLOCK: blocked by spike hook`을 쓰고 exit 2.
  - PostToolUse Write → `post.mjs`. `<CLAUDE_PROJECT_DIR>/post-mode.txt`의 값(a|b|c)에 따라 동작한다. 값은 `.trim()`해서 비교한다(줄바꿈·BOM 대비). a: `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"CANARY-POST"}}` 출력, exit 0. b: `{"decision":"block","reason":"CANARY-POST"}` 출력, exit 0. c: stderr `CANARY-POST`, exit 2. 환경 변수 대신 파일로 모드를 바꾸는 이유는, 훅 프로세스에 env가 전달되는지가 확인되지 않았기 때문이다.
- `$S\plugin-nohook\` = `plugin\`을 복사하고 `hooks\` 폴더만 지운 것(Q6d 대조군).

### 4.2 S1 질문별 명령과 분기

| Q | 미확인 항목 | 명령(`$S\proj`에서) | 판정 | 성공 시 | 실패 시 |
|---|---|---|---|---|---|
| Q0 | 중첩 skills·templates가 validate를 통과하는가 | `claude plugin validate $S\plugin` | exit 0 | 설계대로. templates 경고가 있으면 기록만 | 오류 원인이 templates면 6.1-⑩(사용자 결정, 권장: `skills/orbit/router/dev-team.yaml`로 옮김) → T6 경로·V-T6 경로만 바뀐다. 원인이 skills 경로면 Q0b의 L2로 간다 |
| Q0b | 스킬 그룹 두 개가 실제로 로드되는가 (F-9) | `claude -p @F --output-format stream-json --verbose "Say OK" \| Select-String -Pattern 'spike:alpha','spike:beta' -AllMatches` 그리고 `claude -p @F "Load the skill spike:beta and quote its CANARY word"` | init에 `spike:alpha`와 `spike:beta`가 둘 다 있고, 응답에 `CANARY-BETA` | **L1 확정**: 2.1 그대로 | plugin.json을 L2(`"skills":["./skills/orbit/alpha","./skills/vendor/beta"]`)로 바꿔 다시 실행한다. **L2가 되면** T2가 plugin.json에 11개 폴더를 나열하고 orbit 8개 자리표시를 만든다(나머지 태스크는 그대로). **둘 다 안 되면** 평탄화(`skills/<name>/`)가 남는데 HARNESS 8절 구조와 다르므로 사용자 결정(6.1-⑫). 결정 전까지 T2와 W4를 멈추고, T1만 진행한다. 평탄화가 결정되면 T2·T5·T6·V-T5·V-T6·V-W4·2.1의 경로를 `harness/skills/<name>/`으로 바꾸고, vendor 출처는 `harness/skills/SOURCES.md`로 옮긴다 |
| Q1·Q4 | 훅의 `agent_type`, Agent의 `subagent_type` 이름 | `claude -p @F "Use the spike:probe subagent to run: echo probe"` 후 `Get-Content spike-log.jsonl` | Agent 줄의 `subagent_type`과, 서브에이전트 Bash 줄의 `agent_type` | 값이 `spike:probe`면 A, `probe`면 B → T1(d) | 서브에이전트 줄에 `agent_type`이 없거나, 어느 이름으로도 띄우지 못하면 역할 구분 관문이 성립하지 않는다 → M1 중단, architect로 |
| Q2 | frontmatter `skills:`의 이름 | probe와 probe2를 각각 같은 방식으로 호출 | 어느 쪽이 `CANARY-ALPHA`를 보고하는가 | 맨 이름(A) / 범위 이름(B) / 둘 다 → T3~T5의 `skills:` 형식 | 둘 다 아니면 `skills:` 미리 불러오기를 쓰지 않는다. 역할에 `Skill` 도구를 남기고 본문에 "먼저 Skill로 orbit:router를 불러온다"라고 쓴다. V3는 B안 → 6.3 |
| Q3·Q7 | `Agent()` 범위 이름, 메인 스레드 에이전트 | `claude -p @F --agent spike:boss "Spawn the probe subagent and relay its answer"`, 같은 것을 `boss2`로. 이어서 `{"agent":"spike:boss"}`를 `agent.json`으로 저장하고 `claude -p @F --settings agent.json "What is your role"` | boss와 boss2 중 어느 쪽이 probe를 띄우는가. 메인 스레드 Bash 줄의 `agent_id`/`agent_type`. boss가 `CANARY-ALPHA`를 보고하는가. settings `agent`가 동작하는가 | 띄운 쪽의 형식을 T3 lead `Agent()`에 쓴다. 메인 스레드 판정값 → T1(d). settings `agent`가 동작하면 2.3 A | 둘 다 띄우지 못하면 lead에는 `Agent`(목록 없음)를 쓰고, 역할 제한은 gate가 강제한다(6.3에 기록). 둘 다 제한 없이 띄우면 목록이 무시되는 것이므로 마찬가지로 처리한다. `--agent`나 settings `agent`가 안 되면 2.3 B |
| Q6a | 대조군: 권한 플래그로 쓰기가 되는가 | `claude -p @F "Write hi to allowed.txt"` | `Test-Path allowed.txt` → True, 로그에 `allowed.txt`인 Write 줄 | Q6b로 | 권한 형식을 바꿔(4.0) 다시 한다. 그래도 실패하면 Q6 판정 불가 → M1 중단, 보고 |
| Q6b | 플러그인 훅 exit 2로 막히는가 | `claude -p @F "Write hi to blocked.txt"` | `Test-Path blocked.txt` → False, 로그에 `blocked.txt` Write 줄, 응답이나 transcript에 `SPIKE-BLOCK` | Q6c로 | True면 훅이 막지 못하는 것이다. 관문 설계 전체가 무너지므로 M1 중단, architect로 |
| Q6c | 서브에이전트에서도 막히는가 | `claude -p @F "Use spike:probe to write hi to blocked.txt"` | 위와 같음 + 로그 줄에 `agent_id` | Q6d로 | Q6b와 같다 |
| Q6d | 대조군: 훅이 없으면 써지는가 | `Remove-Item blocked.txt -ErrorAction SilentlyContinue`, 그다음 `$F`의 `--plugin-dir` 값을 `$S\plugin-nohook`으로 바꿔 `"Write hi to blocked.txt"` | `Test-Path blocked.txt` → True | Q6 결론: 차단은 훅 때문이다(확정) | False면 다른 무언가가 막고 있는 것이라 Q6b의 결론을 낼 수 없다 → 원인을 기록하고 M1 중단 |
| Q8 | Lead가 gate CLI를 부를 경로 | `"Run exactly: spike-echo"`, `"Run with the Bash tool: printenv CLAUDE_PLUGIN_ROOT CLAUDE_PROJECT_DIR"`(`$`가 없어 PS 인자 전달과 도구 셸 종류의 영향을 받지 않음), `"Load skill spike:alpha and print its ROOT= line verbatim"`. 각 실행에서 모델이 실제로 쓴 도구 이름(로그의 tool_name: Bash/PowerShell)을 SPIKE.md에 적는다 | 우선순위 (a) `bin` PATH의 `BIN-OK` (b) SKILL.md의 `${CLAUDE_PLUGIN_ROOT}` 치환 (c) Bash env | 처음으로 되는 방식을 T1(c)·T6 gate 스킬에 쓴다 | 셋 다 안 되면 (d) SessionStart additionalContext로 경로를 알리는 방안을 같은 방식으로 시험한다. (d)도 안 되면 Lead의 gate CLI 허용을 뺀다(T1(c)). Lead는 Read로 VERDICT 줄을 확인하고, 출고는 훅이 계속 검사한다 |
| Q9 | PostToolUse로 모델에게 경고를 전하는 방식 (F-10) | `Set-Content -NoNewline post-mode.txt a` 후 `"Write x to a.txt, then quote any CANARY word you were told after writing"`. 이어서 b, c로 반복 | 응답에 `CANARY-POST` | 처음으로 되는 방식(a→b→c)을 T8이 쓴다 | 셋 다 안 되면 T8을 취소한다. 2.6 "tokens.json 경고" 행은 미룸으로 바꾼다. T6 gate 스킬은 "design-warn 없음, design-system-guard 체크리스트가 대신함"으로, T5 design-system-guard는 "토큰 밖 값 점검" 항목을 둔다. 최종 보고에 HARNESS 7절 항목 하나가 미뤄졌다고 적는다 |
| Q10 | 역할별 모델 덮어쓰기 | `"Spawn spike:probe using model haiku"` 후 로그 | Agent `tool_input.model`이 있는가 | team.yaml `models`를 Lead가 Agent 호출에 넣는다고 router에 쓴다 | 터미널에서는 무시되고 SDK 경로 전용(⑥)이라고 dev-team.yaml 주석과 router에 쓴다 |
| Q12 | SDK 메인 스레드 에이전트 옵션 | `cd $S\sdk; npm pack @anthropic-ai/claude-agent-sdk; tar -xzf (Get-ChildItem *.tgz).Name; Get-ChildItem package -Recurse -Filter *.d.ts \| Select-String -Pattern 'agent\??:','agents\??:','plugins\??:','systemPrompt'` (실행하지 않고 읽기만) | 버전, 메인 스레드 에이전트 옵션이 있는가 | 2.3 SDK A | 2.3 SDK B |
| Q5a | directory source + `--settings` | `--settings mk.json`(extraKnownMarketplaces directory `"./"`)으로 `claude plugin list` | 참고용 | 최종 판단은 S2 | 최종 판단은 S2 |

S1은 S2용으로 `$S\settings.project.json`(directory source `"./"`, enabledPlugins `spike@spike-local`, `agent: spike:boss`)과 `$S\marketplace.json`도 만든다.
4.2 표 안의 `\|`는 마크다운 표 이스케이프다. 실행할 때는 `|`로 쓴다.

### 4.3 S2 체크리스트(사람)와 분기

1. `%TEMP%\orbit-spike-proj\`에 `plugin\`(S1 플러그인 복사), `.claude-plugin\marketplace.json`, `.claude\settings.json`(settings.project.json 복사)을 놓고 `git init`한다.
2. **Q5** 그 폴더에서 `claude`를 실행하고 신뢰한 뒤, `/plugin`에서 `spike@spike-local`이 켜졌는지 본다. 설치를 요구하면 `claude plugin install spike@spike-local --scope project`. 하위 폴더에서도 실행해 본다. → `"./"`가 settings 파일 기준인지 프로젝트 루트 기준인지 기록한다. 안 되면 `"."`, 그다음 절대 경로 순으로 시험한다. **절대 경로에서만 되면** B안: 커밋된 settings에는 `enabledPlugins`만 두고, 개발자마다 한 번 `claude plugin marketplace add <repo>`를 실행한다(6.1-⑥). **절대 경로로도 안 되면** 터미널은 `--plugin-dir`만 가능하다 → 6.1-⑥에서 함께 결정한다.
3. **Q7b** 같은 세션에서 "What is your role? Quote any CANARY word"라고 묻는다. → boss 본문이 적용됐으면 2.3 A, 아니면 B.
4. `Get-Content spike-log.jsonl`의 `CLAUDE_PLUGIN_ROOT`가 프로젝트의 `plugin\`인지 `~\.claude\plugins\cache\…`인지 본다. 캐시면 T9에 `[CACHE]` 갱신 명령을 넣고, 아니면 `CACHE: none`.
5. **Q11** Claude 데스크톱 Code 탭에서 같은 폴더를 열고 2·3을 반복한다.
   - **로드됨** → 설계대로.
   - **로드 안 됨** → 아래 순서로 하나씩 시험하고 매번 데스크톱을 다시 연다.
     - (i) 터미널에서 `claude plugin install spike@spike-local --scope project`
     - (ii) `--scope local` (`.claude/settings.local.json`, 커밋되지 않음)
     - (iii) `claude plugin marketplace add <폴더>` + `--scope user`
   - 결과에 따른 처리:
     - (i)이 되면 CUTOVER `[DESKTOP]`에 그 명령을 넣는다.
     - (ii)가 되면 개발자마다 한 번 실행하는 단계로 CUTOVER에 넣는다(6.1-⑥과 함께 결정).
     - (iii)만 되면 사용자 결정(6.1-⑪)이다. user scope는 그 사용자의 모든 프로젝트에서 gate가 돌게 한다.
     - 셋 다 안 되면 사용자 결정(6.1-⑪)이다. 권장: 도그푸딩은 터미널로 하고, 기준 5의 데스크톱 부분은 열린 항목으로 이 run의 최종 보고에 남긴다.
6. **Q13** 데스크톱에서 "List your tool names starting with mcp__"로 브라우저 도구 이름을 받는다. 이름을 얻으면 H7 A, 얻지 못하면 B.
7. 끝나면 임시 폴더를 지운다.

S2 보고 서식(항목마다, Lead가 SPIKE.md에 그대로 옮김):
```
### S2-<번호> <Q번호> <항목>
- 한 일: <명령 또는 클릭 순서>
- 관찰: <출력·화면 문구를 그대로>
- 결론: A | B | 실패 → <위 분기 중 어느 것>
```

**분기 요약**: M1 중단은 Q1·Q4 실패, Q6a~d 실패다. 사용자 결정으로 멈추는 것은 Q0b 둘 다 실패(6.1-⑫)와 Q0 templates 오류(6.1-⑩)다. 그 외는 위 표대로 해당 태스크의 형식만 바뀐다. Q11 실패(6.1-⑪)는 T9와 C1만 막는다.

---

## 5. 전환 (C1·C2는 이 run, 사람) 과 다음 run

| id | 할 일 | 주체 | 검증 |
|---|---|---|---|
| C1 | CUTOVER.md `[STEP4]`: 전제 확인 → step1 settings 복사 → `git add -- .claude/settings.json` → 커밋 전 터미널·데스크톱 로드 확인 → 커밋. 커밋 전에 실패하면 `[ABORT]`, 커밋 후에 실패하면 `[REVERT]`. 이 구간에서는 작업하지 않는다 | 사람 | 커밋 전: `claude plugin list` → `orbit@orbit-local` enabled. `/hooks`에 플러그인 PreToolUse. 데스크톱에서 `orbit:` 에이전트 목록(`[DESKTOP]`). 커밋 후: `git log --oneline -1`에 C1, `git status --short --untracked-files=no` → 출력 없음 |
| C2 | CUTOVER.md `[STEP5]`: 전제 확인(`git status --short --untracked-files=no` 출력 없음, 맨 위 커밋 C1) → step2 settings(H9 deny 포함), `CLAUDE.step2.md` → `CLAUDE.md`, `git rm -r .claude/hooks .claude/agents .claude/skills`, `git add -- .claude/settings.json CLAUDE.md` → 커밋 전 확인 → 한 커밋으로 `git commit`. 커밋 전에 실패하면 `[ABORT]`(`git reset --hard HEAD`), 커밋 후에 실패하면 `[REVERT]` | 사람 | 커밋 전: 새 세션에서 Lead의 `src/` 쓰기 차단 메시지에 플러그인 gate 경로가 보인다. 커밋 후: PowerShell에서 `Test-Path .claude/agents, .claude/skills, .claude/hooks` → False 셋. `Get-ChildItem .claude -Name` → `launch.json`, `settings.json`만(확인 세션이 만든 `settings.local.json`이 있으면 함께 기록). `Select-String -Path CLAUDE.md -Pattern 'orbit-router','\.claude/hooks','VENDOR_SOURCES'` → 출력 없음. `git status --short --untracked-files=no` → 출력 없음 |
| C3 | **다음 run, quick**: 첫 도그푸딩 run. 데스크톱 Code 탭에서 `orbit:lead`(또는 B안 메인 세션)로 SPEC.md 65행(settingSources → 플러그인 로드, HARNESS 8절)과 SPEC 2단계 "보안 점검 템플릿 예" → HARNESS 11절 참조(6.1-⑤)를 고친다 | `orbit:librarian`, `orbit:qa` + 사람 | VERIFY.md에 실행 기록(플러그인 gate 메시지·`orbit:` 에이전트 호출 로그). C3은 CLAUDE.md·`.claude/`·플러그인 폴더를 건드리지 않으므로 H8 상향 대상이 아니다. 그래서 quick이다. 범위가 그 밖으로 넓어지면 full + `config` 승인 |

M2 이후(범위 밖): 오르빗 이벤트 전송 훅(②), 팀 명단 뷰가 profile.json·team.yaml·STATE.json `roles`를 읽는 것(⑤), SDK `plugins`/`systemPrompt`/`maxBudgetUsd`/deny 규칙(⑥), 보안점검팀 템플릿(2단계).

---

## 6. 위험·가정

### 6.1 사용자 결정 필요 (RESEARCH 9절 + 이 계획에서 생긴 것)

| # | 질문 | 막는 태스크 | 권장안 |
|---|---|---|---|
| ① | 트랙 선택 주체: 입력창(SPEC) vs Lead·team.yaml(HARNESS) | T6(router 트랙 절), team.yaml `track` | Lead가 고르고 team.yaml `track`이 기본값이다. 나중에 입력창에서 명시하면 그것이 우선한다(STATE.json `track`에 기록). 지금은 Lead 경로만 구현한다 |
| ② | 템플릿·팀 설정의 원본: DB vs 파일 | T6(템플릿 형식) | 파일이 원본(`harness/templates/`, `.orbit/team.yaml`)이고 DB는 색인이다. SPEC의 "원본과 색인" 원칙과 맞다 |
| ③ | 사용자 저장소 쓰기 경계: "파일을 쓰지 않고 로드" vs `.orbit/` 생성 | T3(researcher가 profile.json 작성), T6, 기준 6 | 하네스 파일(agents/skills/hooks/settings)은 사용자 저장소에 쓰지 않는다. 실행 산출물은 `.orbit/`에만 쓴다. `.gitignore`에 추가할지는 사용자에게 묻는다 |
| ④ | 하네스 카드가 내장 플러그인도 보여주는지 | 없음(⑤ UI) | 보여주되 읽기 전용으로 표시한다 |
| ⑤ | SPEC 2단계 "보안 점검 템플릿 예" → HARNESS 11절 참조 | 없음(문서) | 참조로 바꾼다. C3에서 librarian이 한다 |
| ⑥ | Q5가 절대 경로에서만 되거나 Q11이 local scope에서만 될 때, 개발자별로 한 번 하는 등록·설치를 받아들일지 | T9, C1 | S2 결과를 본 뒤 결정 |
| ⑦ | H4 git 쪽 강제(`pre-push` 훅 설치)를 사용자 저장소에 할지 | 없음(미룸) | 오르빗 저장소에만 수동으로 설치하는 것을 검토한다. 제품은 하지 않는다 |
| ⑧ | 사용자 수준 ponytail 플러그인(H10)이 모든 역할에 지시를 주입함 | 없음 | 이 프로젝트 settings에서 끄거나 커밋을 고정한다 |
| ⑨ | 모르는 에이전트(사용자 자신의 에이전트, general-purpose)를 읽기 전용 + READ_SHELL로 취급하는 것 | T7 | 안전한 쪽을 택한다. 사용자 프로젝트에서 자기 에이전트가 막히면 team.yaml로 예외를 주는 기능은 요청이 있을 때 만든다 |
| ⑩ | (Q0 실패 시) `templates/`가 validate 오류를 내면 팀 템플릿을 어디에 둘지 | T6 | `harness/skills/orbit/router/dev-team.yaml`(router가 읽는 파일). HARNESS 8절 구조와 다르다 |
| ⑪ | (Q11 실패 시) 데스크톱이 user scope 설치에서만 로드되거나 아예 로드하지 않을 때 | T9, C1, 기준 5 | user scope는 모든 프로젝트에 gate를 켜므로 권하지 않는다. 터미널로 도그푸딩하고 데스크톱은 열린 항목으로 둔다 |
| ⑫ | (Q0b 실패 시) 스킬 그룹 폴더가 로드되지 않을 때 `skills/<name>/`로 평탄화할지 | T2, W4 전체 | 평탄화. vendor 구분은 SOURCES.md와 각 SKILL.md 머리말로 한다 |
| ⑬ | 설정 변경(`config`) 승인을 사람 승인 지점에 더하는 것. HARNESS 7절에는 6개만 있다 | T6, T7 | 더한다. 기준 6을 관문으로 강제하면서 도그푸딩(오르빗 CLAUDE.md 수정)을 허용하는 가장 작은 방법이다 |

**사용자 결정 (2026-11-14)**: ①~⑬ 모두 권장안대로 간다. 단 ⑧은 예외 — 사용자 수준 ponytail 플러그인은 **계속 사용한다**(토큰 절약 목적). 이 프로젝트 settings에서 끄지 않고 커밋도 고정하지 않는다. 그 플러그인이 역할 서브에이전트에 주입하는 지시는 하네스 밖 입력으로 남는 위험(H10)으로 6.3에 둔다. H0(기준 커밋)은 사용자가 직접 한다. ⑩~⑫는 스파이크가 실패할 때만 적용된다.

### 6.2 사용자 승인 필요(가져오지 않음)
- 가져오지 않는 목록:
  - gstack: office-hours, plan-ceo-review, plan-eng-review, plan-design-review, design-consultation, design-review, qa, browse, cso, investigate, ship, land-and-deploy, setup-deploy, canary, document-release, retro
  - Superpowers: brainstorming, using-git-worktrees
  - Anthropic frontend-design
  - Compound Engineering: 리뷰 페르소나·데이터 무결성·compound
- 이번에는 역할 본문에 "방식"만 옮겼고, 이들 없이도 기준 1~6이 성립한다.

### 6.3 가정과 위험
- **H10 (남는 위험, 사용자 결정으로 수용)**: 사용자 수준 ponytail 플러그인은 계속 쓴다. 자동 업데이트 채널이라 내용이 바뀔 수 있고, 모든 역할 서브에이전트에 지시를 주입한다. 하네스 밖 입력이므로 gate로 막지 않는다. 주입 내용이 관문·역할 규칙과 충돌하면 역할 규칙이 우선한다고 보고, 충돌을 발견한 역할은 최종 메시지에 적는다.
- **미확인(스파이크로 해소)**: Q0~Q13 전부. RESEARCH 1절 "templates/는 무시됨(추정)"과 4절 "플러그인 훅 차단이 settings 훅과 같음(추정)"도 Q0·Q6으로 확인한다. `--setting-sources`·`--allowedTools` 쉼표 형식·stream-json init 메시지에 skills 목록이 있는지도 미확인이며, 4.0과 Q0b에서 확인한다.
- **미확인(스파이크 밖)**: 데스크톱 앱이 매 세션 프로젝트 settings의 플러그인을 로드하는지는 S2와 C1에서 한 번 확인할 뿐이다. 앱이 갱신되면 바뀔 수 있다. Agent 도구에 없는 도구 이름을 `tools`에 적으면 무시되는지(H7 B안, 다른 환경의 qa)도 미확인이다.
- **미확인(전환)**: C1·C2의 커밋 전 확인은 커밋되지 않은 작업 트리의 settings.json을 Claude가 그대로 읽는다는 전제에 기댄다. 이는 settings가 파일에서 읽힌다는 일반 동작에서 나온 추론이며, 문서로 확인하지는 않았다. 확인 세션이 이 전제와 다르게 동작하면(예: 로드되지 않음) `[ABORT]`로 처리된다. 그래서 잘못 커밋하는 일은 없다.
- **관문의 성격**: 권한 확인 창이 켜진 상태에서 실수를 막는 가드레일이다. bypassPermissions에서는 다음이 남는다.
  - H1의 미룸 부분, 셸을 통한 H2 위조.
  - 셸을 통한 설정 경로 쓰기: engineer·debugger·devops가 `echo >> CLAUDE.md`처럼 쓰는 경우다. 기준 6의 관문은 Edit/Write/NotebookEdit 경로만 막는다.
  - 셸을 통한 `.env` 읽기(H9의 deny는 Read 도구만 막음).
  
  `approvals`(`config` 포함)와 DevOps 배포 승인은 Lead가 쓰는 기록이다. 그래서 사람이 실제로 답했는지를 훅이 확인하지 못한다. Lead 지시와 권한 확인 창에 기댄다.
- **설정 경로 규칙의 범위**: CLAUDE.md, `.claude/`, `.mcp.json`은 경로 모양으로 막는다. 사용자 저장소에 플러그인 폴더(`agents/`, `skills/`)가 있어도 일반 코드와 구별하지 않으므로 막지 않는다. 그런 변경은 H8 router 규칙(full 트랙 리뷰)에만 기댄다.
- **플러그인 캐시**: directory source가 캐시로 복사되면 `harness/` 수정이 다음 갱신 때까지 반영되지 않는다. 도그푸딩 중 "고쳤는데 그대로"인 혼란이 생길 수 있다. S2-4의 결과로 CUTOVER.md `[CACHE]`와 CLAUDE.step2.md에 갱신 명령을 적는다.
- **하네스 수정 비용 증가**: `harness/hooks/`와 `.claude-plugin/`은 모든 에이전트에게 보호된다. 전환 뒤 gate를 고치는 일은 항상 사람 작업이다(지금의 `.claude/hooks`와 같은 수준). 오르빗 CLAUDE.md 수정은 full + `config` 승인 run이 필요하다.
- **이 run 자체**: M1의 리뷰·QA·보안은 옛 `.claude/` 하네스로 돈다. 그래서 C2 전까지 `.claude/`를 지우지 않는다. CLAUDE.step2.md는 `.orbit/`(gitignore)에 있어 git diff에 나오지 않는다. 리뷰어에게 경로를 직접 넘긴다(M1 출구).
- **C2가 커진다**: hooks·agents·skills·CLAUDE.md를 한 커밋에서 바꾼다. 대신 옛 이름과 새 이름이 함께 있는 작업 구간이 없다. 커밋 전 실패는 `[ABORT]` 한 번, 커밋 후 실패는 revert 한 번으로 모두 돌아온다.
- **커밋 없음**: H0 전까지 이 run은 `.orbit/`(gitignore) 밖을 바꾸지 않는다. S1은 저장소 밖에서 하므로 H0 전에 해도 된다. 되돌리기(2.7)는 C0·C1·C2 커밋을 전제로 한다.
- **검증 도구**: V-T6의 YAML 검사는 네트워크로 `yaml@2`를 임시 폴더에 받는다. 네트워크가 막혀 있으면 YAML 검사를 "미검증"으로 SUMMARY.md에 적고, QA가 M1 출구에서 다시 실행한다.
- **SPEC.md 65행**("프로젝트의 하네스(CLAUDE.md, .claude/…)를 settingSources로")은 HARNESS 8절(플러그인 로드)과 어긋난다. HARNESS가 우선이므로 이번에는 고치지 않고 C3에서 정리한다.
