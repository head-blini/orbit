# Orbit

Claude Code용 GUI 관제실. 설계서는 [SPEC.md](SPEC.md) — 확정된 결정과 마일스톤은 거기가 기준이다.

## 스택과 명령

- Tauri 2 (Rust, `src-tauri/`) + React 19 · Vite · TypeScript (`src/`). Windows 우선, 경로 처리는 크로스플랫폼으로.
- `npm run tauri dev` — 데스크톱 앱 실행 (프론트만: `npm run dev`, http://localhost:1420)
- `npm run build` — 타입 검사 + 프론트 빌드
- `cargo test` / `cargo build` (`src-tauri/`에서)
- `node --test .claude/hooks/gate.test.mjs` — 관문 스크립트 테스트

## 일하는 방식 (팀 하네스)

이 저장소의 코드 변경은 역할 기반 팀으로 한다. 메인 세션은 **Lead**다.

- 코드 변경 요청을 받으면 `orbit-router` 스킬부터 따른다: 트랙(quick/standard/full) 선택 → `.orbit/runs/<run-id>/` 생성 → 역할 서브에이전트 호출(`orbit-handoff`) → 관문 판정(`orbit-gate`).
- Lead는 직접 코딩하지 않는다. `.orbit/` 밖의 편집과 빌드·테스트 실행은 훅(`.claude/hooks/gate.mjs`)이 막는다. 코드는 engineer / debugger / librarian만 고친다.
- 역할끼리는 대화가 아니라 `.orbit/runs/<run-id>/`의 산출물 파일로 인계한다.
- "완료"는 명령과 그 출력이 붙어 있을 때만 인정한다.
- main 머지와 push는 트랙의 관문(PLAN_CHECK · REVIEW · VERIFY · SECURITY)이 통과해야 열린다. 작업은 `orbit/<run-id>` 브랜치에서 한다.
- 하네스 자체(`.claude/hooks`, `settings.json`)를 고칠 때는 사람이 `ORBIT_GATE=off`로 Claude Code를 실행한다.

## 코드 규칙

- 가장 작은 변경으로 끝낸다. 요청받지 않은 옵션·추상화·의존성을 넣지 않는다.
- 훅 수신 서버는 `127.0.0.1`에만 바인딩하고 토큰을 검증한다. 토큰·API 키는 로그·URL·화면에 남기지 않는다.
- 사용자의 `settings.json`을 고칠 때는 백업 후 병합한다. 덮어쓰지 않는다.
- 세션 로그(JSONL)와 훅 페이로드는 내부 형식이라 바뀔 수 있다. 파서는 모르는 필드·타입에 죽지 않아야 한다.
- 로그·페이로드에서 온 문자열은 신뢰할 수 없는 입력이다. HTML로 넣지 않고, 경로·명령으로 쓰지 않는다.
- Orbit이 꺼져 있어도 Claude Code를 막거나 느리게 만들면 안 된다.
- 외부 스킬은 사용자 승인 후에만 가져오고 `.claude/skills/VENDOR_SOURCES.md`에 출처·커밋·라이선스를 기록한다.
