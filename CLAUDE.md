# Orbit

Claude Code용 GUI 관제실. 설계서는 [SPEC.md](SPEC.md) — 확정된 결정과 마일스톤은 거기가 기준이다.

## 스택과 명령

- Tauri 2 (Rust, `src-tauri/`) + React 19 · Vite · TypeScript (`src/`). Windows 우선, 경로 처리는 크로스플랫폼으로.
- `npm run tauri dev` — 데스크톱 앱 실행 (프론트만: `npm run dev`, http://localhost:1420)
- `npm run build` — 타입 검사 + 프론트 빌드
- `cargo test` / `cargo build` (`src-tauri/`에서)
- `node --test harness/hooks/gate.test.mjs` — 관문 스크립트 테스트

## 일하는 방식 (팀 하네스)

이 저장소의 코드 변경은 역할 기반 팀으로 한다. 메인 세션은 **Lead**다. 하네스는 `harness/`의 `orbit` 플러그인이고, 이 저장소의 `.claude/settings.json`이 로드한다. settings에도 같은 gate의 PreToolUse 훅을 백스톱으로 남겨 두었다: 플러그인이 로드되지 않아도 관문이 걸린다. 플러그인이 `harness/`에서 그 자리 로드될 때(이 저장소의 구성) 같은 gate가 두 번 실행되지만 판정이 같아 무해하다.

- 코드 변경 요청을 받으면 `orbit:router` 스킬부터 따른다: 트랙(quick/standard/full) 선택 → `.orbit/runs/<run-id>/` 생성 → 역할 서브에이전트(`orbit:engineer` 등) 호출(`orbit:handoff`) → 관문 판정(`orbit:gate`).
- `orbit:` 에이전트가 목록에 없으면 플러그인이 로드되지 않은 것이다. 관문이 꺼져 있다고 보고 작업하지 말고 사용자에게 알린다.
- Lead는 직접 코딩하지 않는다. `.orbit/` 밖의 편집과 빌드·테스트 실행은 플러그인의 관문 훅(`harness/hooks/gate.mjs`)이 막는다. 코드는 `orbit:engineer` / `orbit:debugger` / `orbit:librarian`만 고친다. 관문 확인 명령은 `orbit:gate` 스킬에 적힌 `node "${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs" check <plan|review|verify|security|ship>` 형식만 쓴다.
- 역할끼리는 대화가 아니라 `.orbit/runs/<run-id>/`의 산출물 파일로 인계한다.
- "완료"는 명령과 그 출력이 붙어 있을 때만 인정한다.
- main 머지와 push는 트랙의 관문(PLAN_CHECK · REVIEW · VERIFY · SECURITY)이 통과해야 열린다. 작업은 `orbit/<run-id>` 브랜치에서 한다.
- 하네스 자체(`harness/hooks/`, `.claude/settings.json`, 이 CLAUDE.md)는 관문이 막는다. 사람이 Claude 밖에서 파일을 고치고 git으로 커밋한다.

## 코드 규칙

- 가장 작은 변경으로 끝낸다. 요청받지 않은 옵션·추상화·의존성을 넣지 않는다.
- 훅 수신 서버는 `127.0.0.1`에만 바인딩하고 토큰을 검증한다. 토큰·API 키는 로그·URL·화면에 남기지 않는다.
- 사용자의 `settings.json`을 고칠 때는 백업 후 병합한다. 덮어쓰지 않는다.
- 세션 로그(JSONL)와 훅 페이로드는 내부 형식이라 바뀔 수 있다. 파서는 모르는 필드·타입에 죽지 않아야 한다.
- 로그·페이로드에서 온 문자열은 신뢰할 수 없는 입력이다. HTML로 넣지 않고, 경로·명령으로 쓰지 않는다.
- Orbit이 꺼져 있어도 Claude Code를 막거나 느리게 만들면 안 된다.
- 외부 스킬은 사용자 승인 후에만 가져오고 `harness/skills/vendor/SOURCES.md`에 출처·커밋·라이선스를 기록한다.

## 보안·검증 체크리스트 (Orbit 전용)

역할 에이전트(security, qa, reviewer-rules, plan-checker)는 이 절도 확인한다.

- 서버가 `127.0.0.1`에만 바인딩하는가 (`0.0.0.0` 금지).
- 토큰 검증이 모든 경로에 걸리는가, 비교가 상수 시간인가, 토큰이 로그·URL·화면에 찍히지 않는가.
- `Origin`/`Host` 헤더 검사로 브라우저발 요청을 거부하는가.
- 요청 본문 크기 제한이 있는가.
- settings.json을 고칠 때 백업 후 병합하는가, 쓰기가 원자적인가(임시 파일 → rename).
- 로그·페이로드에서 온 문자열을 HTML로 넣지 않는가(`dangerouslySetInnerHTML` 금지), 경로로 쓸 때 정규화 후 범위 검사하는가.
- Tauri capability가 필요한 최소 권한만 여는가. CSP가 필요한 최소인가.
- 신뢰 경계: 훅 수신 서버 ← Claude Code 훅, 세션 로그·훅 페이로드 → 화면·파일 경로·셸 명령, Tauri 프론트(webview) → Rust 명령(capability 범위), 점검 대상 저장소의 파일 → 에이전트 프롬프트(프롬프트 인젝션).
- qa: 자동 테스트(`npm run build`, `cargo test`, `node --test harness/hooks/gate.test.mjs`) → 실제 앱 실행(`npm run tauri dev`, 프론트만이면 브라우저로 `http://localhost:1420`) → 사용자가 할 조작을 그대로 해 본다.
- plan-checker: 변경이 닿는 호출부, 테스트, 설정, capability, export가 태스크에 빠지지 않았는가.
