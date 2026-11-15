reviewer-idiom: run 20261114-chat-sidecar. 기준 stack: Rust, Tauri 2, Node ESM, React 19, TypeScript (profile.json)

1. 수정 권고: src-tauri/src/chat.rs:26,36,43,83
- 문제: Mutex poison을 다루는 방식이 프로젝트 관례와 다르다. 특히 `stop()`(43)은 poison이면 그냥 return한다. 그러면 앱 종료(RunEvent::Exit) 때 node와 claude.exe가 정리되지 않고 고아로 남는다.
- 제안: 프로젝트 선례 `lib.rs:35-36` `lock()`처럼 `lock().unwrap_or_else(|e| e.into_inner())`로 복구한다. 최소한 `stop()`에는 꼭 적용한다.
- confidence: 높음

2. 참고: sidecar/core.mjs:66,94
- 문제: "이 세션 동안 허용"을 SDK 방식이 아니라 사이드카 안의 `rules` Set으로 직접 구현했다. SDK에는 `options.suggestions`를 받아 `PermissionResult.updatedPermissions`로 돌려주는 방식이 있다(sdk.d.ts:244-252, 2679-2684).
- 제안: 지금 동작에는 문제가 없다. Bash는 명령 문자열이 완전히 같을 때만 다시 허용되므로 의도적인 설계로 본다. 그래도 PLAN에 근거를 한 줄 남겨 두길 권한다.
- confidence: 중간

3. 참고: src-tauri/src/chat.rs:57-69
- 문제: 비 Windows에서는 `child.kill()`이 node만 죽인다. 3초가 지나 강제 종료할 때 손자 프로세스(claude)가 남을 수 있다.
- 제안: Windows가 우선이라 차단은 아니다. 필요해지면 unix에서 `process_group(0)`으로 띄우고 그룹째 kill한다.
- confidence: 중간

4. 참고: src-tauri/src/chat.rs:63
- 문제: `0x0800_0000`에는 94줄에만 `CREATE_NO_WINDOW` 주석이 있고 63줄에는 없다. 같은 매직 넘버가 두 번 나온다.
- 제안: `const CREATE_NO_WINDOW: u32 = 0x0800_0000;`로 이름 붙인 상수 하나를 둔다.
- confidence: 높음

5. 참고: src/Chat.tsx:126
- 문제: `eslint-disable-next-line react-hooks/exhaustive-deps`가 붙어 있지만 package.json에 eslint가 없다. 아무 효과 없는 주석이다. 빈 deps 자체는 setter와 ref만 쓰므로 안전하다.
- 제안: 주석을 지운다.
- confidence: 중간

6. 참고: src/Chat.tsx:164
- 문제: `{ k: "sep", ... } as Item` 단언은 타입 검사를 약하게 만든다.
- 제안: `satisfies Item`을 쓰거나 배열의 타입을 `Item[]`로 명시한다.
- confidence: 낮음

확인했고 지적 없음: SDK 사용이 설치된 sdk.d.ts와 맞음(SDKUserMessage 6869, CanUseTool signal 241, PermissionResult 2679, Query.close() 3455, interrupt() 3037, includePartialMessages, stderr). 사이드카 async generator 깨우기·readline·오류 처리. `#[tauri::command(async)]` 관례, Result<_, String>, build().run()의 RunEvent::Exit. pump 스레드 lock guard 즉시 해제, stop이 기다리는 동안 lock 안 잡음. React listen 해제, isComposing, 훅 규칙. ChatOut 판별 유니온.
확인하지 않은 것: 빌드·테스트 미실행(읽기 전용). ROADMAP/SPEC/디자인 diff.
VERDICT: PASS
