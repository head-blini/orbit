# SECURITY — 20261114-vendor-skills

범위: vendor 스킬 3개(파일 7개)와 VENDOR_SOURCES.md, VENDOR_LICENSE-superpowers.txt, 그리고 하네스(.claude/agents/*.md, settings.json, hooks/gate.mjs, skills/orbit-*, CLAUDE.md). engineer SUMMARY는 참고만 했고, 아래는 모두 직접 확인한 결과다.

## 요약

- **vendor 파일: 깨끗함.** 숨은 문자, HTML 주석, base64/hex 덩어리, 위험한 명령, 설정·관문을 건드리라는 지시가 없다. 원본(v7.0.2 = 22f0b463…)과 비교한 결과, 차이는 SUMMARY/VENDOR_SOURCES에 적힌 수정뿐이다. 실행 파일은 들어오지 않았고 LICENSE는 바이트 단위로 같다.
- **하네스: 관문 우회로가 여럿 있다** (아래 H1–H7, `decide()`로 재현함). 실제 경계는 Claude Code의 권한 확인 창이다. 이 프로젝트와 사용자 settings에는 `permissions.allow`도 `defaultMode`도 없으므로 셸 명령과 편집은 기본 모드에서 사람의 승인을 거친다. 그래서 전부 **권고**로 분류했다. **사용자가 bypassPermissions/auto-accept 모드로 실행한다면 H1·H2·H4는 차단으로 올려야 한다**(이 세션의 실행 모드는 확인하지 못함).
- **vendor 강제 문구는 관문을 약화하지 않는다**(verification 스킬은 오히려 Lead의 "보고는 증거가 아님"과 같은 방향이다). 다만 역할 규칙과 충돌하는 곳이 3개 있다(V1–V3, 권고).

## 발견 사항

### 하네스 (gate.mjs · agents · settings)

**H1 · 권고(실행 모드에 따라 차단) · `.claude/hooks/gate.mjs:100-109`, `:95-96`**
"읽기 전용 역할"은 Edit/Write/NotebookEdit에만 강제된다. Bash/PowerShell 분기는 서브에이전트에 대해 ship 검사만 하므로, Bash를 가진 읽기 전용 역할(qa, reviewer-*, security)과 Lead가 띄운 general-purpose 에이전트는 셸로 어떤 파일이든 쓸 수 있다. `.claude/hooks/gate.mjs`와 `settings.json`도 예외가 아니다. 모든 코더 역할도 마찬가지다. orbit-gate/SKILL.md:34의 "모든 에이전트의 hooks·settings 편집 차단"은 셸 경로에서 성립하지 않는다.
- 시나리오: 리뷰 대상 diff나 세션 로그 fixture 같은 파일에 지시문을 심는다 → reviewer-rules가 `echo 'process.exit(0)' > .claude/hooks/gate.mjs`를 실행한다 → 그다음 호출부터 모든 역할에서 관문이 열린다(훅은 매 호출마다 이 파일을 실행한다). 재현: `qa Bash write hooks → ALLOW`, `reviewer Bash write src → ALLOW`, `general-purpose Bash → ALLOW`.
- 권장: 비코더 역할(`!CODERS.includes(agent_type)`)의 셸 명령도 Lead처럼 허용 목록으로 제한한다(git diff/log/show, 테스트 명령). 아니면 reviewer-maintainability, reviewer-rules에서 Bash를 빼고 Grep/Read로 충분한지 검토한다. 최소한 orbit-gate/SKILL.md:34의 설명을 실제 강제 범위에 맞게 고친다.

**H2 · 권고(실행 모드에 따라 차단) · `.claude/hooks/gate.mjs:92`, `.claude/skills/orbit-gate/SKILL.md:20`**
`.orbit/` 안은 모든 에이전트와 Lead가 쓸 수 있다. 그래서 판정 파일과 run 상태를 누구나 위조할 수 있다. qa가 SECURITY.md를, engineer가 VERIFY.md를 쓸 수 있고, STATE.json의 `track`을 full에서 quick으로 낮추거나 `.orbit/current`를 다른 run으로 돌릴 수도 있다. "판정은 그 역할만 내린다"는 규칙은 강제되지 않는다.
- 시나리오: engineer가 막히면 `.orbit/runs/<id>/VERIFY.md`에 코드 블록과 `VERDICT: PASS`를 쓴다 → quick 트랙의 `check ship`이 PASS가 되고 main 머지가 열린다. 재현: `qa Write forged SECURITY.md`, `engineer Write STATE.json`, `Lead Write .orbit/current` 모두 ALLOW.
- 권장: 관문 파일(`PLAN_CHECK|REVIEW|VERIFY|SECURITY.md`)은 담당 `agent_type`만 쓸 수 있게 한다(REVIEW.md는 Lead). STATE.json의 `track`은 낮아지지 않게 하고, `.orbit/current`는 Lead만 쓰게 한다. 위조를 완전히 막을 수는 없으므로 최소한 쓰기 주체를 제한하는 수준이다.

**H3 · 권고 · `.claude/hooks/gate.mjs:60` (LEAD_SHELL)**
Lead 허용 명령 정규식에 우회로가 있다. 다섯 가지 모두 재현했다.
1. 줄바꿈: `[^;&|<>\`$]`가 `\n`을 허용하고 `$`는 문자열 끝이다 → `git status⏎npm run build`가 통과한다.
2. `git diff --output=src/App.tsx`(log/show도 같음): Lead가 `.orbit/` 밖에 파일을 쓴다.
3. `git branch -f main orbit/<id>`, `git switch -C main orbit/<id>`: merge 없이 main을 run 브랜치로 옮긴다. `isShip`이 merge/push만 보므로 ship 관문을 우회한다.
4. PowerShell 하위 식: `git status (Remove-Item src -Recurse)`는 괄호 안을 실행한다.
- 권장: 정규식에서 `\r\n`과 `(`도 제외한다. `--output`과 `-f`/`-C`/`--force`/`-D`는 거부한다. 또는 Lead용으로는 인자 화이트리스트를 둔다(`git (status|log|diff|show)`는 읽기 옵션만, `switch`는 `orbit/` 브랜치만).

**H4 · 권고(실행 모드에 따라 차단) · `.claude/hooks/gate.mjs:72-77` (isShip)**
출고 감지가 `git … push|merge`라는 글자 모양에만 의존한다. 재현된 우회: `git.exe push …`, `git config alias.p push && git p`, `gh pr merge 1 --merge`, `git update-ref refs/heads/main HEAD`(모두 engineer에서 ALLOW). 위 H3-3도 같다. 반대 방향의 오탐도 있다. 명령 본문(heredoc 안 문자열)에 `git push`라는 글자만 있어도 차단된다. 이번 점검 중 내 스크립트가 그렇게 막혔다.
- 권장: 문자열 검사를 완벽하게 만들려 하지 말고, 강제를 git 쪽으로 옮긴다. `pre-push` 훅과 main에 대한 `reference-transaction` 훅(또는 원격 보호 브랜치)에서 `gate.mjs check ship`을 부른다. 문자열 검사는 1차 안내로만 남긴다.

**H5 · 권고 · `.claude/hooks/gate.mjs:90`, `:93`**
경로 보호 정규식이 Windows의 경로 별칭을 정규화하지 않는다.
- 8.3 짧은 이름: 이 저장소의 `.claude`에는 `CLAUDE~1`이 실제로 있다(`dir /x`로 확인). `CLAUDE~1/hooks/gate.mjs` 쓰기가 ALLOW된다.
- NTFS 스트림 `settings.json::$DATA`가 ALLOW된다(정규식이 `json$`로 끝나기 때문).
- 끝에 점이 붙은 `settings.json.`이 ALLOW된다. Win32에서는 끝의 점이 제거되므로 settings.json에 써질 것으로 **추정**한다(실제 쓰기는 재현하지 않음).
- `:93`의 메모리 예외는 위치를 고정하지 않아서, Lead가 `src/.claude/projects/a/memory/x.ts`처럼 저장소 안 아무 곳에나 쓸 수 있다(ALLOW).
- 시나리오: engineer(코더)가 주입된 지시에 따라 짧은 이름 경로로 gate.mjs를 고친다 → 관문이 꺼진다.
- 권장: 경로를 비교하기 전에 `fs.realpathSync.native`(존재하는 부모 기준)로 정규화하고, `:` 스트림 구분자와 끝의 점·공백은 거부한다. 메모리 예외는 `os.homedir()/.claude/projects/*/memory/` 아래로만 고정한다.

**H6 · 권고 · `.claude/settings.json:5-11`, `.claude/hooks/gate.mjs:133-146`**
닫힌 쪽 실패는 stdin 해석 오류와 `decide()` 예외에만 적용된다. 다음 경우는 exit 2가 아니어서 Claude Code가 비차단 오류로 처리하고 도구를 그대로 실행한다(Claude Code 훅의 동작 방식).
- gate.mjs에 문법 오류가 있을 때(H1로 깨뜨린 경우 포함)
- PATH에 `node`가 없을 때
- 10초 타임아웃
또 matcher가 `Edit|Write|NotebookEdit|Bash|PowerShell`뿐이라 MCP 도구(`mcp__…`, 예를 들어 qa의 브라우저 도구)는 훅을 거치지 않는다.
- 권장: 문서(gate.mjs:140 주석)를 실제 보장 범위에 맞게 고친다. 같은 matcher에 "gate.mjs가 로드되는지"만 확인하는 두 번째 훅을 두는 방안을 검토한다. 파일 쓰기가 가능한 MCP 서버를 추가할 때는 matcher에 넣는다.

**H7 · 권고 · `.claude/agents/qa.md:5`**
`mcp__Claude_Browser__*` 와일드카드가 브라우저 도구 전체를 연다. H6 때문에 이 도구들은 관문 밖에 있다. 브라우저가 사용자의 실제 프로필(로그인된 세션)을 쓴다면, 주입된 지시가 외부 URL로 이동하면서 데이터를 쿼리스트링에 실어 내보낼 수 있다(**추측**: 서버 구현과 프로필 공유 여부는 확인하지 않음).
- 권장: QA에 필요한 도구(navigate, screenshot, click, read)만 이름으로 나열하고, 허용 URL을 `http://localhost:1420`으로 제한할 수 있으면 제한한다.

**H8 · 권고 · `.claude/skills/orbit-router/SKILL.md:15-17`, `.claude/hooks/gate.mjs:16`, `:90`**
gate.mjs는 `.claude/agents/`, `.claude/skills/`(vendor 포함), `CLAUDE.md` 편집을 막지 않는다. quick 트랙은 verify 관문만 요구한다. 따라서 quick 트랙에서 engineer가 역할 정의나 관문 설명 스킬을 바꿔도 reviewer-rules(하네스 약화 = 차단, reviewer-rules.md:13)를 거치지 않는다. 이번 run도 외부 스킬을 에이전트 프롬프트에 넣는 변경이면서 quick이다. 지금은 Lead가 security 점검을 추가해 보완했다.
- 권장: orbit-router 트랙 표의 full 조건에 "`.claude/`·`CLAUDE.md` 변경, 외부 스킬 도입"을 명시한다. 또는 gate.mjs가 이런 경로를 편집하는 run에 대해 review·security 관문을 요구하게 한다.

**H9 · 권고 · `.claude/settings.json`(파일 전체)**
`permissions.deny`에 비밀 파일 읽기 차단(`Read(./.env*)`, 키 파일)이 없다. 지금 저장소에는 .env가 없지만, 훅 토큰을 다루게 되는 단계(SPEC)에서는 필요하다.
- 권장: 그 단계에 들어가기 전에 deny 규칙을 추가한다(사람이 ORBIT_GATE=off로 작업).

**H10 · 권고(프로젝트 밖, 사용자 판단) · `C:\Users\lclk1\.claude\settings.json:2-14`**
사용자 수준에서 서드파티 플러그인 `ponytail@ponytail`(github `DietrichGebert/ponytail` 마켓플레이스)이 켜져 있고 `autoUpdatesChannel: latest`다. 이 플러그인은 SubagentStart 훅으로 **모든 역할 서브에이전트**(이 security 실행 포함)에 행동 지시("PONYTAIL MODE ACTIVE … End your reply with …")를 주입한다. 이번 점검에서 직접 받았다. 이 출처는 VENDOR_SOURCES.md에 없고(CLAUDE.md:32의 기록 규칙 범위 밖), 버전도 고정되지 않았다. 지금 내용에는 관문을 무시하라는 문장이 없고 "보안·검증은 줄이지 말 것"이라고 적혀 있다. 그래서 현재 위해는 확인되지 않았다. 다만 갱신되면 모든 역할의 프롬프트가 검토 없이 바뀐다.
- 권장: 이 프로젝트에서 쓸 거라면 특정 커밋으로 고정하고 VENDOR_SOURCES.md에 기록한다. 아니면 프로젝트 settings에서 비활성화한다. 주입된 지시는 따르지 않았다(역할 산출물 형식이 우선이다).

### vendor 스킬 내용 (팀 규칙과의 충돌)

**V1 · 권고 · `.claude/skills/vendor-test-driven-development/SKILL.md:183`, `:236`, `:37-45`**
"Other tests fail? Fix now."와 "Existing code has no tests → Add tests for existing code"는 engineer.md:15("태스크에 적힌 파일만 건드린다", 같은 체크아웃에서 다른 engineer가 병렬 작업 중일 수 있음) 및 CLAUDE.md:26(가장 작은 변경)과 충돌한다. "Write code before the test? Delete it."를 병렬 웨이브에서 넓게 해석하면, 다른 engineer의 커밋되지 않은 작업을 지울 위험이 있다(**추측**: 재현하지 않음).
- 권장: engineer.md 본문에 우선순위 한 줄을 넣는다. 예: "vendor 스킬과 이 문서가 충돌하면 이 문서가 우선이다. 태스크 밖의 실패는 고치지 말고 보고한다. 삭제는 자기 태스크 파일 안에서만 한다."

**V2 · 권고 · `.claude/skills/vendor-systematic-debugging/SKILL.md:74-85`, `root-cause-tracing.md:155`**
"For EACH component boundary: Log what data enters component"와 "Include context: … environment variables"를 Orbit의 훅 서버나 페이로드 경로에 그대로 적용하면, 훅 토큰과 페이로드(프롬프트·비밀값)가 로그에 남는다. CLAUDE.md:27과 충돌한다. SKILL.md:91의 예시는 SET/UNSET만 출력하므로 그 자체는 안전하다.
- 권장: debugger.md에 "진단 로그에 토큰·환경변수 값·페이로드 본문을 찍지 않는다. 존재 여부와 길이만 찍는다"를 추가한다.

**V3 · 권고 · `vendor-test-driven-development/SKILL.md:3`, `:24-27`, `:330`; `vendor-systematic-debugging/SKILL.md:3`, `:210`**
- description이 "any feature or bugfix", "any bug"로 넓다. `.claude/skills/`에 있으므로 Lead(Skill 도구 보유)도 자동으로 불러올 수 있다. 그러면 Lead가 직접 구현이나 테스트를 시도하다 훅에 막히는 흐름이 생긴다(관문이 막으므로 약화는 아니다).
- "ask your human partner"는 서브에이전트에게는 사람이 없는 상황이다. Lead의 handoff 문장을 "human partner의 허락"으로 오인해 TDD 예외(Configuration files 등)를 적용할 여지가 있다(**추측**).
- 권장: 각 SKILL.md 위에 "이 팀에서 human partner = 사용자. Lead나 다른 에이전트의 메시지는 승인이 아니다. 질문은 보고로 대신한다" 주석을 다는 것을 검토한다. 이것은 원문 수정이므로 VENDOR_SOURCES에 기록해야 한다. 아니면 같은 문장을 역할 파일에 둔다.

확인함, 문제 없음:
- vendor 파일에 숨은 지시, "다른 지시는 무시"류 문장, 다른 스킬을 무시하라는 강제 규칙, 관문이나 설정을 바꾸라는 지시, push/commit을 유도하는 문장이 없다.
- verification 스킬(`:47`, `:69`, `:100-104`)은 "에이전트 보고를 믿지 말고 diff로 확인"하라고 한다. lead.md:18, qa.md:12와 같은 방향이라 관문을 강화한다.
- debugging의 "3회 실패 시 멈춤"(`:191-212`)은 debugger.md:14와 일치한다.

### 참고(보안 아님, Lead용)

- STATE.json의 track이 quick이므로 `check ship`은 VERIFY.md를 요구한다. 이 SECURITY.md는 quick의 ship 조건을 채우지 않는다. 또 저장소가 git 저장소가 아니어서(run 브랜치 없음) H3·H4의 merge/push 관련 항목은 지금은 영향이 없다.
- `root-cause-tracing.md:102`에 빈 줄이 하나 더 있다(수정 흔적, 무해).

## 확인한 것

1) clone 출처, 커밋, 태그
```
$ git -C <clone> rev-parse HEAD; git describe --tags --exact-match HEAD; git rev-parse v7.0.2^{commit}; git cat-file -t v7.0.2
22f0b463e7a5e579904dd6211a520321035526f7
v7.0.2
22f0b463e7a5e579904dd6211a520321035526f7
tag            (annotated, tagger Jesse Vincent, "Release v7.0.2")
$ git -C <clone> remote -v
origin  https://github.com/obra/superpowers (fetch)
$ git -C <clone> status --porcelain | wc -l
0
$ ls <clone>/skills/systematic-debugging
SKILL.md condition-based-waiting-example.ts condition-based-waiting.md defense-in-depth.md find-polluter.sh root-cause-tracing.md
$ ls <clone>/skills/test-driven-development  -> SKILL.md writing-good-tests.md
$ ls <clone>/skills/verification-before-completion -> SKILL.md
```
원격(GitHub)의 태그가 같은 커밋을 가리키는지(`git ls-remote`)와 태그 서명은 확인하지 않았다(네트워크를 쓰지 않음).

2) 원본과 대조: `git diff --no-index <clone>/skills/<p> .claude/skills/vendor-<p>` (7개 파일)
```
test-driven-development/SKILL.md        exit=1  -name: test-driven-development / +name: vendor-test-driven-development (only hunk)
test-driven-development/writing-good-tests.md exit=1  @@ -48 : (superpowers:writing-skills) -> (writing-skills 스킬 — 이 프로젝트에는 없음) (only hunk)
verification-before-completion/SKILL.md exit=1  name 줄만 변경
systematic-debugging/SKILL.md           exit=1  name 줄 + @@ -174 superpowers:test-driven-development -> vendor-… + @@ -186 superpowers:verification-before-completion -> vendor-…
systematic-debugging/condition-based-waiting.md exit=1  @@ -79 : 82행 예제 .ts 참조 문장 1줄 교체
systematic-debugging/defense-in-depth.md exit=0  (동일)
systematic-debugging/root-cause-tracing.md exit=1  @@ -98 : find-polluter.sh 문장 교체 + ```bash 블록(bash ./find-polluter.sh …) 와 "Runs tests one-by-one… See script" 줄 삭제
LICENSE vs VENDOR_LICENSE-superpowers.txt exit=0
sha256 0da33ed814ee87e72db078f489c4447af72f13d9f25d9e17476f32efd77705fc (양쪽 동일)
```
→ 모든 차이가 SUMMARY.md의 1–5번 수정과 VENDOR_SOURCES.md:12-33 기록과 일치한다. 기록되지 않은 차이는 없다.

3) 바이트 단위 숨은 문자 스캔(scratchpad의 `sec-scripts/scan.mjs`: C0/DEL 제어 문자, BOM, 제로폭 U+200B-D/2060/FEFF/00AD/180E, 양방향 U+061C/200E-F/202A-E/2066-9, 태그 문자 U+E0000-7F, 변형 선택자 FE00-0F, `<!--`, 40자 이상 base64 연속열, 40자 이상 hex 연속열, UTF-8 유효성)
```
$ node scan.mjs .claude/skills/vendor-*/*.md .claude/skills/VENDOR_* .claude/agents/*.md .claude/settings.json .claude/hooks/gate.mjs .claude/skills/orbit-*/SKILL.md CLAUDE.md
vendor-systematic-debugging/SKILL.md: bytes=9527 utf8valid=true CR=0 ctrl=0 hidden=[] htmlComments=0 b64runs=[] hexruns=[] nonAsciiNonHangul={"U+2192":8,"U+2713":1,"U+2717":1,"U+2265":1,"U+2260":1}
vendor-systematic-debugging/condition-based-waiting.md: bytes=3454 utf8valid=true CR=0 ctrl=0 hidden=[] htmlComments=0 b64runs=[] hexruns=[] nonAsciiNonHangul={"U+274C":4,"U+2705":4,"U+2014":1,"U+2192":1} hangulChars=21
vendor-systematic-debugging/defense-in-depth.md: bytes=3650 ... ctrl=0 hidden=[] htmlComments=0 b64runs=[] hexruns=[] nonAsciiNonHangul={"U+2192":1}
vendor-systematic-debugging/root-cause-tracing.md: bytes=5302 ... ctrl=0 hidden=[] htmlComments=0 b64runs=[] hexruns=[] nonAsciiNonHangul={"U+2192":3,"U+2014":1,"U+2190":1} hangulChars=21
vendor-test-driven-development/SKILL.md: bytes=9585 ... ctrl=0 hidden=[] htmlComments=0 b64runs=[] hexruns=[] nonAsciiNonHangul={"U+2014":8,"U+2260":1,"U+2192":2}
vendor-test-driven-development/writing-good-tests.md: bytes=8297 ... ctrl=0 hidden=[] htmlComments=0 b64runs=[] hexruns=[] nonAsciiNonHangul={"U+2014":19,"U+274C":3,"U+2705":3,"U+2192":4} hangulChars=11
vendor-verification-before-completion/SKILL.md: bytes=3653 ... ctrl=0 hidden=[] htmlComments=0 b64runs=[] hexruns=[] nonAsciiNonHangul={"U+2260":3,"U+2705":5,"U+274C":5,"U+2192":11}
skills/VENDOR_LICENSE-superpowers.txt: bytes=1091 utf8valid=true CR=21 ctrl=0 hidden=[]   (CRLF는 원본 그대로, sha256 동일)
skills/VENDOR_SOURCES.md: ... ctrl=0 hidden=[] b64runs/hexruns=["22f0b463e7a5e579904d"]  (= 커밋 SHA, 정상)
agents/*.md, settings.json, gate.mjs, orbit-*/SKILL.md, CLAUDE.md: 전부 ctrl=0 hidden=[] htmlComments=0 (gate.mjs b64run "status/log/diff/show"는 정규식 문자열)
```
vendor 파일의 비ASCII 문자는 화살표·체크·대시·부등호·이모지(✅❌)와, 수정하면서 넣은 한글뿐이다. 7개 파일은 전문을 읽었다.

4) 위험 패턴 grep과 실행 파일 확인
```
$ grep -rnEi 'curl|wget|Invoke-WebRequest|\| *(ba)?sh|rm -rf|dangerously|bypassPermissions|~/\.ssh|~/\.claude|settings\.json|\.mcp|hooks|telemetry|auto-?update|ignore (all|previous|other)|allowed-tools|<!--|base64' .claude/skills/vendor-*
exit=1   (일치 없음)
$ find .claude/skills/vendor-* -type f ! -name '*.md'
(없음)
$ grep -rnEi 'lclk1|C:\\Users|/Users/|api[_-]?key|secret|passw|token|BEGIN .*PRIVATE|ghp_|sk-…|AKIA' CLAUDE.md .claude/
.claude/skills/vendor-systematic-debugging/SKILL.md:90:   echo "=== Secrets available in workflow: ==="
.claude/skills/vendor-systematic-debugging/SKILL.md:106:  **This reveals:** Which layer fails (secrets → workflow ✓ …)
```
→ 비밀값과 개인 경로는 없다(두 건은 예시 문구). 개인 경로는 `.orbit/runs/.../SUMMARY.md`에만 있다(산출물, 저장소가 git이 아니라 커밋 대상 여부는 해당 없음).
VENDOR_SOURCES.md: 저장소 URL, 태그, SHA, MIT·저작권 줄, 가져온 파일 목록과 제외 목록(find-polluter.sh, condition-based-waiting-example.ts)이 실제와 맞는다.

5) 관문이 실제로 동작하는지(이 세션)
```
Write → scratchpad/sec-scripts/probe.txt  (security 역할, .orbit 밖)
PreToolUse:Write hook error: [orbit gate] security는 읽기 전용 역할: .orbit/ 안의 산출물만 쓸 수 있음 (코드는 engineer/debugger/librarian만)
$ echo ORBIT_GATE=[${ORBIT_GATE:-unset}]  -> ORBIT_GATE=[unset]
```
→ settings.json의 `command`+`args` 형식이 실제로 실행되고, `agent_type`이 전달된다. agents의 `skills:` 미리 불러오기도 동작한다(이 security 실행의 컨텍스트에 orbit-threat-model, orbit-agent-config-audit가 주입된 것으로 확인).

6) 우회 재현: scratchpad의 `sec-scripts/bypass.mjs`가 임시 루트(track=full, main 브랜치)에서 `decide()`만 호출한다. 실제 쓰기나 명령 실행은 하지 않는다.
```
$ node bypass.mjs
ALLOW  Lead newline
ALLOW  Lead diff --output
ALLOW  Lead branch -f main
ALLOW  Lead switch -C main
ALLOW  Lead PS subexpr
BLOCK  ship baseline (engineer)
ALLOW  ship: .exe (engineer)
ALLOW  ship: alias (engineer)
ALLOW  ship: gh pr merge (engineer)
ALLOW  ship: update-ref main (engineer)
ALLOW  qa Bash write hooks
ALLOW  reviewer Bash write src
ALLOW  qa Write forged SECURITY.md
ALLOW  engineer Write STATE.json
ALLOW  Lead Write .orbit/current
ALLOW  engineer Write settings.json::$DATA
ALLOW  engineer Write 8.3 CLAUDE~1
ALLOW  engineer Write settings.json. (trailing dot)
ALLOW  engineer Write agents/security.md
ALLOW  engineer Write skills/orbit-gate/SKILL.md
ALLOW  Lead Write src/.claude/projects/a/memory/x.ts
ALLOW  general-purpose Bash
$ cmd /c "dir /x C:\Users\lclk1\Projects\orbit" | grep -i claude
<DIR>  CLAUDE~1  .claude
```
처음 실행 때는 스크립트 본문에 `git push`라는 글자가 들어 있어서 내 Bash 호출 자체가 `[orbit gate] 머지/푸시 차단 — 관문 미통과: VERIFY.md 없음`으로 막혔다(H4의 오탐 근거).

7) 권한 설정
- 프로젝트 `.claude/settings.json`: hooks만 있다. `permissions`, `defaultMode`, `additionalDirectories`, `env`, `enableAllProjectMcpServers` 모두 없다. `settings.local.json`과 `.mcp.json`은 없다(`ls`: No such file).
- 사용자 `~/.claude/settings.json`: `permissions`·`defaultMode` 없음. `enabledPlugins: ponytail@ponytail`, `autoUpdatesChannel: latest`(H10).
- agents: `permissionMode` 사용 없음. skills: `allowed-tools` 없음. 읽기 전용 역할의 도구 목록:
  - architect, plan-checker, product: Read/Grep/Glob/Write
  - reviewer-*: +Bash
  - qa: +Bash, PowerShell, mcp__Claude_Browser__*
  - security: +Bash, PowerShell
  Bash가 붙은 읽기 전용 역할은 H1의 경로로 쓸 수 있다.
- lead.md: Edit 없음. Write와 Bash는 훅이 제한한다(H3 우회 있음).

8) 의존성 및 Tauri
- 이번 변경은 .md 파일과 frontmatter만 바꿨고 새 패키지가 없다 → `npm audit`, `cargo audit`는 **미실행**(대상 없음).
- Tauri capability와 CSP: 이번 변경이 건드리지 않음 → 점검 대상 아님.

9) 남긴 흔적: scratchpad의 `sec-scripts/`(scan.mjs, bypass.mjs)와 OS 임시 폴더의 `orbit-sec-*` 디렉터리 1개(임시 git 저장소). 프로젝트 파일은 이 SECURITY.md 말고는 바꾸지 않았다.

VERDICT: PASS
