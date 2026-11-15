N1 완료. 커밋 58fecb4 (orbit/20261114-chat-sidecar).
바꾼 파일: package.json, package-lock.json
의존성: "@anthropic-ai/claude-agent-sdk": "0.3.325" (정확한 버전). peer는 package.json에 넣지 않음. npm 7+가 자동 설치했고 missing/invalid 없음.

npm view 출력 (요약):
```
version = '0.3.325'; engines = { node: '>=18.14.0' }
peerDependencies = { zod: '^4.0.0', '@anthropic-ai/sdk': '>=0.93.0', '@modelcontextprotocol/sdk': '^1.29.0' }
optionalDependencies = 8개 플랫폼 (win32-x64 포함, 모두 0.3.325)
```
검증:
```
npm.cmd ls ...  -> claude-agent-sdk@0.3.325 / win32-x64@0.3.325 / @anthropic-ai/sdk@1.8.0 / @modelcontextprotocol/sdk@1.32.2 / zod@4.6.7 (missing/invalid 없음)
node -e "import(...).then(m=>console.log(typeof m.query))" -> function
ls node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe -> 존재
npm.cmd run build -> 성공 (built in 192ms)
```
git diff main -- package.json: dependencies에 SDK 한 줄 추가. 단, npm이 dependencies/devDependencies 키를 알파벳순으로 재정렬해서 react, react-dom, @tauri-apps/cli, vite 줄도 위치만 바뀌었다(값은 불변).

라이선스: package.json 필드는 "SEE LICENSE IN README.md". README(node_modules/.../README.md:68)에는 라이선스 조항이 없고 "For full details, please review our Commercial Terms of Service (https://www.anthropic.com/legal/commercial-terms) and Privacy Policy (https://www.anthropic.com/legal/privacy)."만 있다. 즉 Anthropic 상용 약관 적용이고 OSS 라이선스가 아니다. 사용자가 확인할 사항.

계획과 달라진 점: 없음. 미검증: 실제 모델 호출(금지라 안 함), `git diff main` 외 Windows 외 플랫폼 설치.
