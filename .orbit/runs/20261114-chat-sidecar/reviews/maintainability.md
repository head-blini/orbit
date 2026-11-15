reviewer-maintainability 리뷰 (`git diff main...HEAD`, 17개 파일). 차단할 문제는 없습니다. 수정 권고 2건은 둘 다 PLAN F2에 적힌 일인데 빠진 것입니다.

1. 수정 권고 | `src/App.tsx:145,153` | 제거 버튼은 지웠지만 `run`의 타입에 `"uninstall_hooks"`가 남았고, `"제거할 항목 없음"` 분기는 이제 실행될 일이 없습니다(PLAN F2가 지우라고 한 부분). | 제안: `const run = () => invoke<string|null>("install_hooks")…`로 줄이고, 메시지는 `backup ? … : "성공 (백업 없음…)"` 하나만 둡니다. Rust `uninstall_hooks`는 PLAN대로 남깁니다. | confidence: 높음
2. 수정 권고 | `src/App.css:79` | 주석이 아직 `[설치|제거] [액정 폴더]`라서 지금 UI와 맞지 않습니다(PLAN F2는 시안 92행 문구로 바꾸라고 했습니다). | 제안: `[설치] [게임보이 화면]`으로 고칩니다. | confidence: 높음
3. 참고 | `src/App.css:149` | `.tag{`에 공백이 없어 파일의 다른 규칙(`.btn { … }`)과 모양이 다릅니다. | 제안: `.tag {` | confidence: 높음
4. 참고 | `src/Chat.tsx:112-113` | 비용 문자열을 만드는 같은 삼항식이 두 번 들어 있습니다. | 제안: `const s = typeof m.cost === "number" ? … : "완료"; finish("done", s, s);` | confidence: 높음
5. 참고 | `src/Chat.tsx:229` | 이 줄은 `typing`이 참일 때만 그려지므로 `disabled={!typing}`은 늘 false입니다. | 제안: 이 속성을 지웁니다. | confidence: 높음
6. 참고 | `src/Chat.tsx:163` | `canSend`에 이미 `(open || session !== null)`이 들어 있어 `&& (open || session)`이 중복입니다. 남긴 이유는 아래 `session!`의 타입 좁히기로 보입니다. | 제안: 이유를 한 줄 주석으로 적거나, `folderName(session!)` 쪽에서 좁힙니다. | confidence: 중간
7. 참고 | `src/Chat.tsx:36-37` | 옆에 `Chat.css`가 있는데 정적 레이아웃만 인라인 `style`로 썼습니다. 기존 인라인 스타일(`Graph.tsx`, `App.tsx:70`)은 모두 계산된 값이라 그 패턴과도 다릅니다. | 제안: `.card .qblock { display:grid; gap:var(--s-1) }`, `.card .tag { justify-self:start }`로 옮깁니다. | confidence: 높음
8. 참고 | `sidecar/core.mjs:72,115` | pending 항목에 `tool`을 저장하지만 읽는 곳이 없습니다(54행 주석에도 없음). `denyAll`의 `reason || "중단됨"`은 두 호출부(`chat.mjs:40,76`)가 모두 이유를 넘겨서 쓰이지 않습니다. | 제안: `tool` 필드와 기본값을 지웁니다. | confidence: 높음
9. 참고 | `src/Chat.css:100` | `.btn:disabled` 규칙(`App.css:146`)과 같은 내용을 한 번 더 썼습니다. | 제안: `App.css:146` 선택자에 `.btn[aria-disabled="true"]`를 더하고 Chat.css 쪽은 지웁니다. | confidence: 중간
10. 참고 | `src-tauri/src/chat.rs:63,94` | `0x0800_0000`이 두 번 나오는데, 63행에는 `CREATE_NO_WINDOW`라는 이름 주석이 없습니다. | 제안: `const CREATE_NO_WINDOW: u32 = 0x0800_0000;` | confidence: 높음
11. 참고 | `src-tauri/src/roadmap.rs:136-137` | 함수를 떼어 낸 뒤 `let ok = …; ok`가 남았습니다. 두 cfg 분기에서 값을 바로 반환하면 됩니다. 취향 차이입니다. | confidence: 낮음
12. 참고 | `package.json` | SDK 한 줄을 넣으면서 npm이 키를 정렬해 diff에 순서만 바뀐 줄이 섞였습니다. 동작에는 영향이 없습니다. | confidence: 높음

확인한 것: 새 의존성은 SDK 하나(PLAN D5와 맞음), Cargo 추가 없음. chat.rs·chat.mjs·core.mjs·Chat.tsx에 범위 밖 옵션·추상화 없음. 경로 검사는 roadmap::local_abs 재사용, lib.rs 명령 5개는 기존 lock 패턴. eslint-disable은 Graph.tsx:28 관례.
확인하지 못한 것: package-lock.json, design/, SPEC.md, ROADMAP.md diff 본문과 core.test.mjs. 빌드·테스트 미실행.

VERDICT: PASS
