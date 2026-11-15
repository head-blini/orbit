reviewer-rules — run 20261114-chat-sidecar (`git diff main...HEAD`, 커밋 9개)

차단할 것은 없고 수정 권고 1건, 참고 2건.

1. 수정 권고 — `src/App.tsx:145`, `src/App.tsx:153`, `src/App.css:79`
   - F2 태스크가 덜 끝남. `run`의 타입에 아직 `"uninstall_hooks"`, "제거할 항목 없음" 분기 남음. App.css 79행 주석 "[설치|제거] [액정 폴더]". F2 검증 `Select-String src\App.tsx -Pattern 'uninstall_hooks'` → "없음"이 실패.
   - 규칙: PLAN.md:145(F2), DECISIONS.md:14(D10). confidence: 높음
2. 참고 — `package.json:13-25`: npm 자동 정렬로 기존 키 순서 바뀜, 동작 영향 없음. confidence: 중간
3. 참고 — `src/App.css:149`: `.tag{` 공백. 형식만. confidence: 높음

확인한 것(지적 없음): 하네스 파일(.claude/, harness/, .mcp.json, CLAUDE.md)·capability·tauri.conf·Cargo.toml 그대로. 커밋 9개가 태스크와 하나씩, 각자 자기 파일만. dangerouslySetInnerHTML·innerHTML 없음, SDK·로그 문자열은 JSX 텍스트로만, cwd는 프론트에서 받지 않고 Rust store에서 꺼내 local_abs + is_dir 검사. 키를 읽거나 저장하는 코드 없음, 오류·stderr는 redact, stderr 진단은 세션 id만, 새 서버·바인딩 없음. 사이드카는 채팅에서만 뜨고 훅·Claude Code 경로 안 건드림, updatedPermissions/localSettings 쓰기 없음(D4). decisions.md 최종·확정 줄 준수(4명암 var(--c-*), 픽셀 글꼴은 이름표·메뉴·상태만, 도구 목록 없음, "관문" 없음). D1-D11·DESIGN 1·2·4절 대조. Chat.tsx 문구·클래스·aria-label·placeholder가 layout_v4.html:464-679 변형 1-9와 맞음. 코드에 개인 경로 없음.
확인하지 못한 것: 빌드·테스트 미실행, "경고 없음" 미확인.

VERDICT: PASS
