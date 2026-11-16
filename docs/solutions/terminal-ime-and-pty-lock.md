# 내장 터미널: 맥 한글 IME와 PTY write lock

## 맥 WKWebView 한글 IME
- 증상: 맥 Tauri 앱의 xterm 6.0.0에서 2벌식 "안녕하세요"가 "ㅇㄴㅎ세"처럼 들어간다(사용자 직접 확인).
- 원인: WKWebView는 한글에 composition 이벤트를 쏘지 않고 `input`만 쏜다. 첫 자모는 `insertText`, 조합 갱신은 `insertReplacementText`. xterm 6.0.0 `_inputEvent`는 `insertText`만 PTY로 보내고 뒤의 것은 버려 음절마다 첫 자모만 남는다. xterm PR #5704가 같은 문제를 고치지만 미병합(OPEN)이다. 근거는 run 20261115-terminal의 DEBUG.md.
- 해결: xterm·node_modules는 건드리지 않고 `src/hangulIme.ts`(순수 로직)와 `Terminal.tsx`의 capture 단계 `input` 리스너로 한글 `insertReplacementText`를 받아 음절 단위로 보낸다. 조합 중 keydown 229는 xterm의 textarea diff 전송을 막는다. 단위 테스트 `node --test src/hangulIme.test.mjs`.
- 삭제 조건: xterm이 #5704 또는 동등 수정을 병합한 버전으로 올릴 때 `hangulIme.ts`와 `Terminal.tsx` 보정 블록을 지운다(안 지우면 이중 처리 위험).
- 미확인: 실제 IME로는 재현·검증하지 못했다(사용자 재확인 필요). 조합 중 Enter 한 번에 전송되는지, 한자 변환 같은 비한글 replacement는 xterm이 버릴 수 있다는 추정.
- 다음에 미리 할 것: WKWebView 위에 xterm류 입력 컴포넌트를 올릴 때는 구현 전에 맥에서 한글을 먼저 쳐 본다. 이벤트 열을 모형 테스트로 먼저 고정한다.

## 조합 중 Shift가 반쪽 음절을 먼저 보낸다 ("있어요" → "이있어요")
- 증상: 2벌식에서 음절 중간에 Shift를 누르는 글자(ㅆ 받침, ㅒ·ㅖ 모음, ㄲ 받침)에서 앞 반쪽 음절이 먼저 들어가 글이 겹친다. `있어요`→`이있어요`, `했어`→`해했어`, `예`→`ㅇ예`, `깎아`→`까깎아`. Shift 없는 겹받침(갑시)과 음절 첫 Shift(가까)는 정상.
- 원인: `attachCustomKeyEventHandler`가 조합 중 229가 아닌 keydown을 모두 "Enter·방향키 같은 비IME 키"로 보고 `ime.flush()`했다. 수정키 Shift는 IME를 거치지 않아 keyCode 16으로 와서, 반쯤 된 음절("이")이 먼저 나가고 이어 오는 replacement "있"이 새 음절로 또 나갔다. 첫 IME 보정(d550ed7)부터 있던 분기이고 회귀는 아니다.
- 해결: keydown 판단을 `HangulIme.keydown(keyCode, key)`로 옮기고 수정키 단독(`Shift`·`Control`·`Alt`·`Meta`)은 flush하지 않는다. 모형 테스트 `node --test src/hangulIme.test.mjs`에 `type()`으로 keydown까지 넣었다.
- 다음에 미리 할 것: IME 보정의 "이 키는 조합을 끊는다" 판단은 키 종류별(수정키 단독, 229, 그 밖)로 테스트에 적는다. 이벤트 열 모형은 keydown을 포함한다.
- 미확인: WKWebView의 Shift keydown이 실제로 keyCode 16인지(모형 가정, 증상 문자열이 정확히 맞음), CapsLock·지구본 입력 소스 전환과 blur(Cmd+Tab) 중 조합에서 같은 겹침이 나는지.

## PTY write는 상태 lock을 쥔 채 하지 않는다
- 증상(REVIEW 1회차 B1): `term_write`가 상태 `Mutex`를 쥔 채 PTY에 쓰면, 자식이 입력을 안 읽어 쓰기가 막힐 때 `stop`·재시작·resize까지 같은 lock에 걸려 멈춘다.
- 원인: 느린 I/O(블로킹 write)를 공유 상태 lock 안에서 했다.
- 해결: write는 lock에서 writer만 꺼내 lock을 푼 뒤 쓴다(`term.rs`). epoch·Exit·재시작 거부는 그대로. 회귀 테스트 `blocked_write_does_not_block_stop_or_running`(옛 동작에서는 타임아웃으로 실패).
- 다음에 미리 할 것: 블로킹 가능한 I/O가 있는 상태 객체는 "I/O 중에 stop이 되는가"를 테스트로 먼저 적는다.
- 미확인: 프로세스 정리(종료 버튼·Cmd+Q·빨간 단추 뒤 claude·자식 0, M9), 재로드 복구(M15), 사용자 한글 재확인(M5)·TUI 그리기(M3)는 QA/사용자 실측 전이다.
