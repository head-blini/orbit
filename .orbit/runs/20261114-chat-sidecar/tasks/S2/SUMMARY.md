# S2 SUMMARY
- 파일: sidecar/chat.mjs (새). SDK 옵션 이름(includePartialMessages, canUseTool, stderr, systemPrompt preset claude_code, Query.close/interrupt)은 sdk.d.ts와 일치, 차이 없음.
- core.test.mjs: tests 9 pass 9 fail 0.
- 연기 검사: '{bad'+'{"t":"zzz"}' -> stdout 빈 출력, exit 0. '{"t":"close"}' -> exit 0, 98ms.
- 금지어 grep(settingSources 등) -> 없음. permissionMode "default" -> 58행 1줄.
- 미검증: 실제 query/interrupt/close 동작(모델 호출 금지), Node<18.14 분기(실행 환경이 더 높음).
