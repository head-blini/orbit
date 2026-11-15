T5 완료. 커밋 976cecd (orbit/20261114-hook-server), 파일은 src-tauri/src/lib.rs 하나. T1~T4 모듈과 SPEC.md는 건드리지 않았다.

lib.rs 구현 내용
- AppState {cfg, server, settings_path}를 setup에서 manage하고, 서버 콜백이 "hook-event"를 emit한다.
- 명령 get_status, install_hooks, uninstall_hooks를 PLAN 계약대로 등록했다. 토큰은 반환·출력하지 않는다.
- ORBIT_CLAUDE_SETTINGS 분기는 `#[cfg(debug_assertions)]` 안에 있다.

검증 (cargo 명령은 src-tauri에서 실행)
```
cargo test        -> 24 passed; 0 failed (lib), 나머지 0 tests, 실패 없음
npm run build     -> built in 96ms, 0 종료
grep -rn ORBIT_CLAUDE_SETTINGS src-tauri/src -> lib.rs:83 한 건 (cfg(debug_assertions) 블록 안)
```
앱 실행은 같은 명령줄에서 ORBIT_CLAUDE_SETTINGS=%TEMP%\orbit-qa\settings.json을 지정해 `npm run tauri dev`로 했다. 변수 없이 띄운 적은 없다.
- 창 스크린샷으로 확인한 것: 대상 경로가 C:\Users\lclk1\AppData\Local\Temp\orbit-qa\settings.json(사본)이다. 상단바에 "127.0.0.1:53039에서 듣는 중", 훅 상태 "설치됨"이 떠 있다.
- 사본에서 읽은 토큰을 변수로만 써서 curl.exe POST를 보냈다. 토큰 없이 보내면 401, 올바른 토큰이면 204가 왔다. 스크린샷 타임라인에 "오후 2:35:58 · T5" 한 줄이 생겼다. 따라서 invoke·listen 가정은 맞고 capabilities/default.json은 바꾸지 않았다.

계획과 달라진 점
- "설치" 버튼은 내가 누르지 못했다(UI 클릭 자동화 없음). 그런데 사본에 이미 "설치됨" 상태였고 백업이 77개 쌓여 있었다. 같은 시간대에 화면 밖에서 사용자가 "오른쪽 설치 눌러야 되나" 하며 그 창의 설치 버튼을 직접 눌렀던 것으로 보인다. 그래서 설치 후 curl 단계는 그 설치 결과(사본의 토큰)로 진행했다. 두 가지는 확인하지 못했다. 그 설치가 누구의 클릭이었는지 내가 직접 본 것은 아니다. 백업 해시와 원본 해시 대조(QA 4)도 하지 않았다.
- 제거 버튼, 실제 claude 세션 이벤트, Origin 403 curl은 이 태스크 범위 밖이라 하지 않았다.
- 정리: 앱 프로세스(orbit.exe)와 이 작업이 띄운 vite·tauri node 프로세스를 종료했다. orbit-qa 임시 폴더는 삭제했다. 남은 node 프로세스 하나(25256)는 이 작업과 무관한 codex 런타임이다.
- `git commit -F <파일> -- src-tauri/src/lib.rs`로 lib.rs만 커밋했다. 커밋 시 LF→CRLF 경고만 나왔다.
- 실제 ~/.claude/settings.json과 저장소 .claude/는 읽지도 쓰지도 않았다.

Lead 메모(engineer 보고가 아님): "백업 77개"는 설명되지 않았다. 한 번의 설치로는 백업이 1개여야 한다. 리뷰(correctness)와 QA가 원인을 확인한다.
