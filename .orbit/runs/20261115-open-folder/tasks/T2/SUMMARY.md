T2 완료. 커밋 2b6a932 (브랜치 orbit/20261115-open-folder).

바꾼 파일: src/Chat.tsx, src/App.tsx

구현: PLAN T2 그대로.
- App: pickSeq 상태, 세션 클릭 핸들러에서 setPickSeq 증가, `<Chat session={cur} pickSeq={pickSeq} />`.
- Chat: folder/picking 상태, useEffect(setFolder(null), [session?.id, pickSeq]), canSend에 !picking과 folder 반영, submit과 구분선 이름과 chat_send의 `session: folder ? "" : id`, emptyText의 폴더 문구, 채팅 머리에 `폴더 열기` 버튼(btn 클래스, running||picking이면 비활성, div flex로 `새 대화`와 묶음), pickFolder(chat_open_folder 인자 없음; null이면 무시, 이름이 오면 items가 있을 때 reset 후 setFolder, catch(fail), finally(setPicking(false))).

검증:
```
npm run build  -> ✓ built in 230ms (tsc 오류 없음, 종료 0)
rg -n "chat_open_folder|chat_send" src/Chat.tsx
208: invoke("chat_send", { session: folder ? "" : session?.id ?? "", text: t })
225: invoke<string | null>("chat_open_folder")
rg -n "pickSeq" src/App.tsx src/Chat.tsx
App.tsx:86 useState / :226 <Chat ... pickSeq={pickSeq}> ; Chat.tsx:67 props / :177 useEffect 의존성
새 색 검사(git diff의 추가 줄에서 color|#hex) -> 없음
```
(클릭 핸들러의 setPickSeq는 대소문자 때문에 rg "pickSeq"에는 안 잡히지만 App.tsx 클릭 핸들러에 들어가 있다.)

계획과 달라진 점: 없음.
검증 못 한 것: T1 백엔드와 합친 실제 동작(npm run tauri dev)은 하지 않았다. QA 몫.
