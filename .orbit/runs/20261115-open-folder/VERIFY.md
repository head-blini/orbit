# VERIFY — 20261115-open-folder

COMMIT: 32e9d044eb533a1ccc322a7c954c8868b57a15ab

시작 전 재확인: `git rev-parse HEAD` 출력 `32e9d044eb533a1ccc322a7c954c8868b57a15ab`, `git status --short` 출력 없음(깨끗). 끝난 뒤에도 같음.
실제 앱은 `npm run tauri dev`로 띄우고 Windows UI Automation(PowerShell)으로 조작했다. 모델 호출: 이전 1회($0.1086) + 이번 추가 1회($0.0917, 사용자 "1회 더 허용", (a)에만 사용). (b)는 모델 호출 없음.

## 자동 (기준 1~6) — 이전 증거 유지

| # | 명령 | 출력(요약) | 결과 |
|---|---|---|---|
| 1 | `npm run build` | `✓ built in 164ms`, EXIT=0 | 통과 |
| 2 | `cd src-tauri && cargo test` | `test result: ok. 111 passed; 0 failed`, EXIT=0. `check_cwd_rejects_bad_and_accepts_dir ... ok`, `strip_verbatim_disk_only_strips_drive_paths ... ok`, `spawn_rejects_bad_cwd_without_starting_a_process ... ok` | 통과 |
| 3 | `node --test harness/hooks/gate.test.mjs` | `tests 71 / pass 71 / fail 0`, EXIT=0 | 통과 |
| 4 | `git diff main -- src-tauri/capabilities/ \| wc -c` | `0` | 통과 |
| 5 | `git diff main -- src-tauri/Cargo.toml package.json` | 추가 `+tauri-plugin-dialog = "2"` 하나, package.json 변경 없음 | 통과 |
| 6 | `rg -n "chat_open_folder\|chat_send" src/Chat.tsx` | `invoke("chat_send", { session: folder ? "" : session?.id ?? "", text: t })`, `invoke<string \| null>("chat_open_folder")` (경로 인자 없음) | 통과 |

## 실제 앱 (기준 7~13) — 이전 증거 유지

- 7 버튼 존재·배치 통과(새 색 없음은 아래 (c)에서 확인).
- 8 다이얼로그 `#32770 "폴더 선택"` 뜸(capability 0개), 떠 있는 동안 `폴더 열기`·`보내기` 비활성, Esc 취소 후 문구 그대로·`오류` 없음. 통과.
- 9 새 빈 폴더 선택 → `보내면 qa-fresh-folder 폴더에서 새 대화를 시작합니다`, 입력 활성, 오류 없음. 통과.
- 10 전송 → 구분선 `새 대화 · 폴더: qa-fresh-folder`, 응답 `qa-fresh-folder`, `완료 · 추정 비용 $0.1086`. 통과.
- 11 목록에 `qa-fresh-folder` 1개, 클릭 시 그래프 `Lead 실행 중`. 통과.
- 12 세션 로그 `"cwd":"...\\scratchpad\\qa-fresh-folder"`. 통과.
- 13 실행 중 `폴더 열기` 비활성. 통과.
- 재클릭 후 문구 복귀. 통과.

## 이번에 직접 확인한 3건

### (a) 기준 14: 기존 세션 선택 후 전송 — 통과
조작: 앱 기동 후 왼쪽 목록의 기존 세션 `qa-fresh-folder 멈춤(추정) 10:26` 버튼 클릭 → 입력 `이 작업 폴더의 이름만 말해` → `보내기`(UIA Invoke).
UIA 출력(채팅 영역 끝부분):
```
Text|새 대화 · 폴더: |  Text|qa-fresh-folder
Text|나 | Text|이 작업 폴더의 이름만 말해
Text|Claude | Text|`qa-fresh-folder`
Text|완료 · 추정 비용 $0.0917
Button|보내기|en=False   (입력 비움)
```
세션 로그 확인: `grep -o '"cwd":"[^"]*"' <qa-fresh-folder 로그 jsonl> | sort | uniq -c` → `16 "cwd":"C:\\Users\\lclk1\\AppData\\Local\\Temp\\claude\\...\\scratchpad\\qa-fresh-folder"` (다른 cwd 없음, 로그 수정시각 10:50:03 = 전송 직후). 구분선·응답·로그 cwd가 모두 그 세션 폴더. 비고: 세션 선택 후 보내기는 이어가기가 아니라 그 폴더에서 새 대화를 시작하는 동작(DECISIONS 1: resume은 별도 run).

### (b) 잘못된 폴더의 `✕ 오류` 줄 — 통과
조작: `폴더 열기` → 다이얼로그에서 새 폴더 `scratchpad\qa-del-folder` 선택(문구 `보내면 qa-del-folder 폴더에서 새 대화를 시작합니다` 확인) → 앱 밖에서 `rmdir`로 그 폴더 삭제(`removed`) → 입력 `안녕` → `보내기`.
UIA 출력:
```
Text|새 대화 · 폴더: | Text|qa-del-folder
Text|나 | Text|안녕
Text|✕ 오류: | Text|폴더가 없습니다
Text|✕ 오류: 폴더가 없습니다   (상태 줄)
```
모델 호출 없음 확인: 전송 5초 뒤 `ls ~/.claude/projects | grep -c qa-del` → `0`(세션 로그 디렉터리·파일 생성 안 됨), 비용 줄(`완료 · 추정 비용`) 없음. 폴더 검사에서 거부됨.
참고: 첫 시도 때 다이얼로그에 키 입력을 잘못 보내 `문서` 폴더가 선택됐으나 보내지 않고 다시 `폴더 열기`로 덮어씀(전송·모델 호출 없음).

### (c) 새 색 없음 — 통과
`http://localhost:1420`(같은 vite 서버·같은 CSS)에서 `getComputedStyle`:
```
게임보이 화면 | color rgb(28,30,24) | bg rgb(248,248,236) | border rgb(28,30,24) 2px solid | radius 0px | Galmuri11 12px | padding 2px 12px
폴더 열기     | color rgb(28,30,24) | bg rgb(248,248,236) | border rgb(28,30,24) 2px solid | radius 0px | Galmuri11 12px | padding 2px 12px
(비활성 보내기/설치: color rgb(92,96,82), 2px dashed — 기존 .btn:disabled 규칙)
```
`폴더 열기`가 기존 `btn`과 값이 모두 같다. `새 대화`도 `className="btn"`(Chat.tsx 244행, 변경 전부터 있던 버튼). `git diff main -- src/*.css | wc -c` → `0`(CSS 변경 없음). 앱 화면 스크린샷에서도 `폴더 열기`가 다른 버튼과 같은 점선/실선 테두리 흑백.

## 기록(비차단, 다음 run에서 채팅 삭제로 해소 — DECISIONS 7)

- W3·W4·W5는 고치지 않음. 낭독·포커스는 확인하지 않음.
- 세션 목록의 `qa-fresh-folder`는 대화 완료 후에도 `작업 중`/`멈춤(추정)`으로 표시가 오락가락함(로그 기반 상태, 조사하지 않음).

## 정리

`orbit.exe`(PID 21536) 종료, vite(1420) 종료, `tasklist`·`netstat`로 둘 다 없음 확인. 스크래치의 `qa-fresh-folder`, `qa-folder-b` 폴더와 `qa-fresh-folder` 세션 로그는 남아 있다. 브라우저 탭 1개(localhost:1420, 서버 없음)는 열려 있음.

## 판정

미검증 없음, 실패 없음. 기준 1~14 전부 직접 실행 증거로 통과.

VERDICT: PASS
