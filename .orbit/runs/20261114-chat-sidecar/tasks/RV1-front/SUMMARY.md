RV1-front 완료. 커밋 8a92087 (orbit/20261114-chat-sidecar).
바꾼 파일: src/Chat.tsx, src/App.tsx, src/App.css (src/Chat.css는 손대지 않음, 필요 없었음).

지적별 처리
- B1: App.tsx run 타입을 "install_hooks"만 남기고 메시지를 하나로 줄임. App.css 79행 주석을 `[설치] [게임보이 화면]`으로 바꿈.
- B3: exit를 받으면 결과 없는 permit·ask 카드를 "→ 거부됨/답하지 않음 (사이드카 종료)" 닫힌 결과 줄로 접음. askOne과 대기 문구는 items에서 파생되므로 같이 비워짐.
- B4: chat_send가 Err면 setOpen(보내기 전 open 값)으로 되돌림. 처음 보낸 경우 open=false로 돌아가 다음 보내기에서 "새 대화 · 폴더:" 줄이 다시 나옴.
- W2: role="log"에 aria-live="off".
- W3: 답한 카드의 결과 줄(`data-done`, tabIndex=-1)로 포커스를 옮김. 실행이 끝날 때 포커스가 입력 줄 안(중단 버튼 포함)에 있었을 때만 textarea로 포커스.
- W4: say()가 알림을 비운 뒤 50ms 뒤에 다시 넣음. permit·ask·진행·종료 알림 모두 적용하고 reset에서는 타이머를 지움.
- W5: AskCard를 질문마다 role="group" + aria-labelledby(`q-<id>-<qi>`)로 바꿈. 바깥 카드의 group은 제거함.
- 참고 항목은 손대지 않음.

검증
```
npm.cmd run build  -> tsc && vite build, "built in 177ms", 종료 0
grep -nE "uninstall_hooks|액정 폴더|>제거<|dangerouslySetInnerHTML" src/*.tsx src/*.css -> 일치 없음 (grep 종료 1)
```

달라진 점과 검증하지 못한 것
- 단위 테스트는 추가하지 않았음. 프론트 테스트 러너가 이 저장소에 없고 `npm run build`가 타입 검사까지 함.
- 포커스 이동, 알림 낭독, exit 시 카드 접힘은 앱을 실행해 확인하지 못했음. 빌드와 코드 검토만 했음.
- App.css 편집 시 훅이 기존 하드코딩 값(3px, 10px 등) 경고를 냈는데 이번 변경과 무관함.
