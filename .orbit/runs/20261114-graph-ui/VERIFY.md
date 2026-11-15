# VERIFY — 20261114-graph-ui (qa, 4차: head 803e28f)

브랜치 `orbit/20261114-graph-ui`. 시작·끝 모두 `git status --porcelain --untracked-files=no` 출력 없음, `git rev-parse HEAD` = 803e28f467eaa8b3cb351cd5413862969d4f1db6. 이전 VERIFY(37f3ecc, 실패 0·미검증 3 → FAIL)를 이 파일로 대체했다.
증거 표기: **[803e28f]** = 이번에 이 커밋에서 실행, **[37f3ecc]** = 직전 QA가 그 커밋에서 실행한 증거를 그대로 둠(아래 diff 근거로 유효).

## 증거가 유효한 근거 — 37f3ecc..803e28f
```
$ git diff 37f3ecc..803e28f --stat
 src/Graph.tsx | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git diff 37f3ecc..803e28f   (바뀐 줄)
-    key: "lead", ... label: LEAD_LABEL[st], run: false, meta: "", x: 0, ...
+    key: "lead", ... label: LEAD_LABEL[st], run: false, meta: st === "waiting" ? "권한 요청" : "— · —", x: 0, ...
```
한 줄(`src/Graph.tsx` 55행, Lead 노드의 `meta`)뿐이다. Rust·CSS·설정·capability·SPEC·하네스 무변경 → [37f3ecc] 증거 중 Rust·설정·보안·SPEC·설치·액정·글꼴 관련은 그대로 유효하다. 그래프 화면에 닿는 증거(기준 4·7·D10~D13, 노드 크기·좌표)는 이번에 다시 실행했다.

## 앱 실행 환경 [803e28f]
`$d=%TEMP%\orbit-qa4`, `ORBIT_CLAUDE_SETTINGS`·`ORBIT_CLAUDE_PROJECTS`·`CLAUDE_CONFIG_DIR` 셋 다 `$d`, `npm.cmd run tauri dev`(디버그, 릴리스 exe 안 씀). `get_status`(앞 실행 중에 확인, `$d` 아래 → 진행):
```
settings_path C:\Users\lclk1\AppData\Local\Temp\orbit-qa4\settings.json | projects_dir ...\Temp\orbit-qa4\projects | listen_addr 127.0.0.1:53039 server_error null | screens_dir ...\Roaming\dev.orbit.app\screens
```
실제 `~/.claude`는 읽지도 쓰지도 않았고 실제 Claude Code 세션도 안 돌렸으며 인증 파일을 복사하지 않았다. 훅 토큰은 `shots\v4\tools\d.mjs` 안의 변수로만 읽었다(출력·파일에 없음). 관찰은 WebView2 CDP 127.0.0.1:9333. 스크립트·스크린샷·측정: `RUN_DIR\shots\v5\`(`tools\r4.mjs`, `status.mjs`).

## 요약

| 기준 | 결과 | 커밋·근거 종류 |
|---|---|---|
| 1 cargo test | 통과 | 803e28f 실행 |
| 2 npm build | 통과 | 803e28f 실행 |
| 3 gate.test | 통과 | 803e28f 실행 |
| 4 확정 배치(Designer 시각 리뷰 포함) | 통과 | 803e28f 측정 재실행 + Designer 2차 리뷰(REVIEW.md 3차 절, "기준 시안과 같다, 차단 없음") |
| R4 Lead 셋째 줄 | 통과 | 803e28f 실행 |
| 5 실제 세션 → 노드 | 통과 | 37f3ecc 실행 |
| 6 재시작 → 로그 복원 | 통과 | 37f3ecc 실행 |
| 7 세션 줄·기호·상세 | 통과 | 37f3ecc 실행 |
| 8 액정 | 그림 표시·순환·svg/txt 제외·폴더 열기 통과(37f3ecc). **빈 액정 화면: 사용자 확인 대기 (DECISIONS 15)** | 실행 + 코드·테스트 |
| 9 설치·제거 | 통과 | 37f3ecc 실행 |
| 10 금지 요소 없음 | 통과 | 37f3ecc 실행 |
| 11 채팅 입력 비활성 | 통과 | 37f3ecc 실행 |
| 12 SPEC | 통과(참고 1건) | git diff·grep |
| 13 텍스트로만 렌더 | 통과 | 37f3ecc 실행 |
| 14 asset scope·capability | 통과 | 37f3ecc |
| 15 OFL·출처·글꼴 | 번들 URL 로드·외부 요청 0건 통과(37f3ecc). **네트워크를 끈 재실행 픽셀 글꼴: 사용자 확인 대기 (DECISIONS 15)** | 실행 + 구조 |
| D10~D13 | 통과 | 37f3ecc 실행 + 803e28f 노드 측정 불변 |

실패한 기준: 없음.

### 사용자 확인 대기 (DECISIONS 15)
사용자가 AskUserQuestion으로 "머지 후 내가 확인"을 골랐다(2026-11-14). 수용한 위험: 빈 폴더일 때 액정이 깨져 보이거나 인터넷이 없을 때 글꼴이 대체 글꼴로 보이는 결함이 있어도 머지 뒤에야 드러난다(화면 표시 문제, 데이터·Claude Code 영향 없음). 이 두 건은 에이전트가 볼 수 없다(사용자 그림 5개를 옮기지 않음 / Wi-Fi 끄기는 시스템 설정 변경). 판정 규칙: 이전 run(session-log-watch)처럼 사용자만 확인할 수 있는 항목은 "사용자 확인 대기"로 남기고, 나머지 전부가 실행 증거로 통과면 PASS로 한다. 이것은 미검증을 통과로 바꾼 것이 아니라 확인 책임을 사용자가 가져간 것이며, 아래 대체 증거를 붙인다.
1. **기준 8 빈 액정 화면.** 대체 증거: `src/Screen.tsx` 빈 목록 → `<button disabled>`에 img 없음. Rust 테스트 `screens::tests::missing_and_empty_dir_give_empty` — 아래 기준 1 출력에서 `ok`([803e28f] 재실행 `87 passed`에 포함).
2. **기준 15 네트워크 끈 재실행의 픽셀 글꼴.** 대체 증거([37f3ecc]): 글꼴이 번들 URL `http://tauri.localhost/assets/Galmuri11-DfQIlyDK.woff2`에서 로드(`loaded`), 외부 출처 요청 0건. 빌드 산출물에도 `dist/assets/Galmuri11-DfQIlyDK.woff2`가 있다(기준 2 출력).

## R4 — Lead 셋째 줄 [803e28f] (통과, 실행)
`node shots\v5\tools\r4.mjs`: 임시 환경의 앱에 훅 POST로 세션 5개를 만들고, 세션을 눌러 첫 노드(Lead)를 읽었다(좌표·크기는 `style.left/top`·`getBoundingClientRect`, 1400×900).
```
done-one   (Stop)                            {"text":"Lead | 끝남 | — · —","cls":"node","pbar":false,"w":168,"h":60,"left":"0px","top":"0px"}
api-server (StopFailure)                     {"text":"Lead | 실패 | ✕ | — · —","cls":"node is-fail","pbar":false,"w":168,"h":60,...}
my-blog    (PermissionRequest)               {"text":"Lead | 대기 | 권한 요청","cls":"node is-wait","pbar":false,"w":168,"h":60,...}
notes      (오래된 로그만, 멈춤 추정)         {"text":"Lead | 멈춤(추정) | ? | — · —","cls":"node","pbar":false,"w":168,"h":60,...}
orbit      (실행 중, 장면 A)                  {"text":"Lead | 실행 중","cls":"node is-run","pbar":true,"w":168,"h":60,"left":"0px","top":"72px"}
```
- 대기 → "권한 요청", 끝남·에러·멈춤 → "— · —", 실행 중 → 진행 막대 그대로(`pbar:true`, 텍스트 메타 없음). 요구와 일치. (대기 줄에 `!`가 안 보이는 것은 `!`가 깜빡임이라 캡처 위상에 따라 `innerText`에 안 잡혀서다. 시안·앱 어느 쪽도 위상마다 다르며, 스크린샷에는 대기 노드 구조가 시안과 같다.)
- 스크린샷: `shots\v5\lead-stop-graph.png`, `lead-error-graph.png`, `lead-wait-graph.png`, `lead-stalled-graph.png`, `lead-run-graph.png`(실행 중 장면 A 그래프), `app-A.png`.

## 기준 4 — 측정 재실행 [803e28f] (통과)
시안과 같은 데이터(장면 A)를 같은 측정식(`m3.mjs`)으로 쟀다. `node shots\v4\tools\cmp.mjs shots\v4\ref-measure.json shots\v5\app-A-measure.json`(시안 측정은 정적 HTML이라 v4 것 재사용):
```
canvas size 1032x204 1032x204
edges equal true
texts [... "reviewer | 대기 | ! | 권한 요청"]  앱 [... "reviewer | 대기 | 권한 요청"]   (! 는 깜빡임 위상 차이)
TOTAL DIFFS (excluding scrollLeft/rtl, text) 0
```
- Lead 노드: `{"x":-13,"y":191,"w":168,"h":60}`, `left 0px / top 72px` — v3 NOTES와 같은 크기·좌표(x는 자동 스크롤 값 337 vs 333의 4px 차, v3 NOTES에 같은 사유 기록). .gscroll 320,115 703×430, scrollWidth/Height 1040/415 = v3 NOTES와 같음, 간선 5개 같음.
- 이전 QA 측정(37f3ecc, `shots\v4\app-A-measure.json`)과 노드 7개의 텍스트(`!` 제외)·left·top·크기·border·radius·shadow·bg·padding 비교: 같음(`v4==v5 true`).
- Designer 시각 리뷰: 완료(RUN_DIR\REVIEW.md "3차" 절, "Designer 2차 시각 리뷰" 줄 — 기준 시안과 같다, 차단 없음; W13 = 이번 R4). 나는 이 판단을 다시 하지 않고 측정만 확인했다.
- 나머지(배치 패널 크기·색 4명암·이중 테두리·글꼴)는 [37f3ecc] 측정, 아래 기준 4 [37f3ecc] 절.

## 기준 1 — cargo test [803e28f] (통과)
`cd src-tauri; cargo test` (마지막 줄들)
```
test result: ok. 87 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
test result: ok. 0 passed; 0 failed; ... (main.rs, Doc-tests orbit_lib)
EXIT=0
```
(37f3ecc 출력에서 확인한 이름: `r_col_*` 11개, `q_snapshot_stall`, `screens::tests::{missing_and_empty_dir_give_empty, excludes_non_images_and_folders, inside_checks_parent, symlink_out_is_excluded, picks_images_sorted_and_joined}`. 이번 재실행도 87개 통과, 같은 수.)

## 기준 2 — npm.cmd run build [803e28f] (통과)
```
dist/assets/Galmuri11-DfQIlyDK.woff2  504.73 kB
dist/assets/index-x6RZg5Rr.css          7.15 kB │ gzip:  2.17 kB
dist/assets/index-gSfGVyNY.js         233.11 kB │ gzip: 73.62 kB
✓ built in 136ms
EXIT=0
```

## 기준 3 — gate.test [803e28f] (통과)
`node --test harness/hooks/gate.test.mjs` → `ℹ tests 71 / pass 71 / fail 0 / cancelled 0 / skipped 0`, EXIT=0.

---
아래는 [37f3ecc]에서 실행한 증거다(위 diff 근거로 유효. 그래프 그림에 닿는 항목은 이번에 R4·기준 4에서 재실행).

## 기준 4 [37f3ecc] — 확정 배치
(나) 배치(1400×900): topbar 8,8 1384×58 / 세션 8,74 285×486 / 그래프 301,74 741×486 / 상세 1050,74 342×486 / 채팅 8,568 1034×324 / 게임기 화면 1050,568 342×324(채팅과 높이 324 = 324). 문서 1400×900, 스크롤 없음. 960×640: .graph 236,74 428×330, .gscroll 255,115 390×274, canvas x −391(시안과 같음), 바깥 scroll 0,0.
(다) 색: 계산된 색(그림 제외) `rgb(28,30,24)`·`rgb(92,96,82)`·`rgb(180,184,164)`·`rgb(248,248,236)` 4명암. `rgb(0,0,0)`은 액정 `button.lcd`의 `color` 기본값(칠하는 곳 없음). 패널 `3px solid rgb(28,30,24)` + `0 0 0 2px #f8f8ec, 0 0 0 4px #1c1e18`(이중 테두리). `h1` 글꼴 `Galmuri11, monospace`, `document.fonts` Galmuri11 `loaded`.
스크린샷: `shots\v4\app-full-1400.png`, `prod-1400.png`, `app-960.png`, `ref-*.png`.

## 기준 5 [37f3ecc] — 실제 Claude Code 세션 (통과)
`claude -p`, `CLAUDE_CONFIG_DIR=$d`(그때는 인증 파일 복사 후 삭제), 서브에이전트 두 번 호출. `.graph li` 0.7초 폴링(`real-watch3.txt`):
```
10:26:36 [Lead 실행 중(is-run)]
10:26:39 [Lead 실행 중, Explore 실행 중(is-run)]
10:26:53 [Lead 실행 중, Explore 끝남 | 14초 · 20k 토큰]
10:26:56 [Lead 실행 중, Explore 끝남, general-purpose 실행 중]
10:26:59 [Lead 실행 중, Explore 끝남 | 14초 · 20k 토큰, general-purpose 끝남 | 2초 · 36k 토큰]
10:27:03 [Lead 끝남, Explore 끝남, general-purpose 끝남]
```
노드 좌표(1400×900): `Lead 0,0 / Explore 216,0 / general-purpose 432,0`, 168×60. 상세: `노드 | 종류 | Explore | 상태 | 끝남 | 시작 | 19:26 | 시간 | 14초 | 토큰 | 20k 토큰`. 로그 Agent 호출에 `subagent_type` 있음. (이번 4차에는 Lead 셋째 줄 변경으로 "끝남"일 때 "— · —"가 뜬다 — R4와 일치. 위 R4 참고.)

## 기준 6 [37f3ecc] — Orbit 끈 상태의 세션 → 재시작 복원 (통과)
앱 끄고 세션 실행 `exit=0`(경고 `SessionEnd hook ... ECONNREFUSED`만 — Claude Code는 막히지 않음). 재시작 뒤 로그만으로 `Explore/끝남 216,0`, `general-purpose/끝남 432,0` 복원(두 열). 얻지 못한 토큰은 "—". 재시작한 세션의 Lead "실행 중"은 알려진 한계(R9, 10분 뒤 `?`).

## 기준 7 [37f3ecc] — 세션 줄·기호·상세 (통과)
```
["▶|<img src=x>|작업 중|19:36","orbit|작업 중|19:35","qa-col|대기|19:30","my-blog|대기|19:29","api-server|✕|에러|19:29","work|?|멈춤(추정)|19:25","notes|?|멈춤(추정)|11/12 18:10", ...]
```
줄은 폴더 이름 + 상태 + 시각만. 대기 `!`, 에러 `✕`, 완료 기호 없음, 멈춤 `?`. 이번(803e28f)에도 세션 이름으로 클릭해 5개 세션을 선택할 수 있었다(R4 실행).

## 기준 8 [37f3ecc] — 액정 (빈 화면만 사용자 확인 대기)
실제 `%APPDATA%\dev.orbit.app\screens`(사용자 그림 5개, 안 건드림)에 시험 파일 4개를 넣고 확인 후 지움:
```
list_screens [..., "qa-t1.png","qa-t2.gif", ...]   (qa-t3.svg·qa-t4.txt 없음)
img0 {"src":"PokemonRed-Title.gif","nat":[160,144],"box":[286,278],"fit":"contain","ir":"pixelated"}   채팅/게임기 높이 324/324
click cycle: PNG·GIF 모두 표시, 순환
폴더 열기 클릭 → 오류 문구 없음, 탐색기 창 "screens | file:///C:/Users/lclk1/AppData/Roaming/dev.orbit.app/screens" (확인 뒤 그 창만 닫음)
정리 뒤 screens = 사용자 그림 5개, 시작 때와 같음: true
```
디버그 exe(번들 CSP)에서도 `asset.localhost` 그림 로드. 폴더 밖·`..\` 이름은 Rust 단위 테스트(`inside_checks_parent`·`symlink_out_is_excluded`). 이번(803e28f) 정리 뒤 `screens`는 그림 5개(`ls | measure` = 5).

## 기준 9 [37f3ecc] — 설치·제거 (통과)
```
after install  : 훅 설치됨 | 성공 · 백업 ...settings.json.orbit-backup-1794651785314 ; hooks keys 11, keep-me true, allow true
after uninstall: 훅 설치 안 됨 | 성공 · 백업 ...-1794651786822 ; hooks keys 1, keep-me true, allow true
after reinstall: 훅 설치됨 | 성공 · 백업 ...-1794651788338 ; hooks keys 11, keep-me true, allow true      (백업 3개)
```

## 기준 10~11 [37f3ecc] (통과)
`grep -rnE "관문|타임라인|중계|timeline" src` → 0건. 화면 `body.innerText`: `관문 false, 타임라인 false, 중계 false, Read false, Bash false, Timeline false`. 채팅 입력 `[["INPUT", disabled=true, "Claude Code에게 무엇을 시킬까?"]]`, 문구 `대화 기능은 ⑥에서 연결됩니다.`

## 기준 12 [37f3ecc] — SPEC (통과, 참고 1건)
`git diff main --stat -- SPEC.md` → `8 insertions(+), 7 deletions(-)`. 참고: `SPEC.md:148`의 `④ 그래프/타임라인 UI` 마일스톤 목록은 그대로(BRIEF 범위 밖; 지울지는 Lead 결정). 37f3ecc..803e28f는 SPEC 무변경(위 diff --stat).

## 기준 13 [37f3ecc] — 텍스트로만 렌더 (통과)
`grep -rn dangerouslySetInnerHTML src` → 0건. `SubagentStart agent_type:"<b>x</b>"`, `cwd:"C:\qa\<img src=x>"` → 노드 이름 `<b>x</b>`가 글자로, `.graph b / .sessions b / img[src="x"]` = 0/0/0.
실패 경로(훅 서버): 틀린 토큰 → 401, 토큰 없음 → 401, 올바른 토큰 + `Origin: http://evil.example` → 403, 깨진 JSON → 400, 3MB → 204, 5MB → 413.

## 기준 14 [37f3ecc] — asset scope·capability (통과)
`git diff main -- src-tauri/capabilities` → 0바이트. `tauri.conf.json`: `assetProtocol {enable:true, scope:["$APPDATA/screens/*"]}`, CSP `default-src 'self' ipc: http://ipc.localhost; img-src 'self' asset: http://asset.localhost; font-src 'self'; style-src 'self'`, `Cargo.toml` `features = ["protocol-asset"]` 하나. 디버그 exe에서 화면·그림·글꼴 정상, CSP 위반·`loadingFailed` 0건. (803e28f은 이 파일들 무변경.)

## 기준 15 [37f3ecc] — Galmuri·OFL·출처·글꼴 (네트워크 끈 재실행만 사용자 확인 대기)
`src/assets/fonts/`: `Galmuri11.woff2`(504,736 B), `OFL.txt`(SIL OFL 1.1), `SOURCE.md`(버전 2.40.3, 커밋 `c53c3038e200c5516c84c66cede840ae1c409b2d`, integrity, 저장소 URL).
```
dev : origins ["http://localhost:1420","http://ipc.localhost","http://asset.localhost"]  font http://localhost:1420/src/assets/fonts/Galmuri11.woff2  non-local []
exe : origins ["http://ipc.localhost","http://tauri.localhost","http://asset.localhost"]  font http://tauri.localhost/assets/Galmuri11-DfQIlyDK.woff2  non-local []  loadingFailed []
fonts [["Galmuri11","loaded"]]
```
이번(803e28f) 빌드도 같은 `Galmuri11-DfQIlyDK.woff2`를 낸다(기준 2).

## D10~D13, 넘침·자동 스크롤, 선택·포커스(R3), prefers-reduced-motion [37f3ecc] (통과)
- D10: 한 열 8개 모두 `216,(0..504)` 168×60, 세로 스크롤은 `.gscroll` 안에서만(`gs [142,572,430]`, 다른 패널·문서 scroll 0).
- D11: 노드 border(끝남·대기 `2px solid`, 실행·Lead `3px solid`, 실패 `2px dashed`)·radius 6px·이중 box-shadow·알약 진행 막대 시안 일치. 이번 R4 실행의 Lead 노드도 168×60.
- D12: Lead 0 | architect 216 | plan-checker 432 | engineer×3 648(0/72/144) | reviewer 864. 열 6→7개일 때 스크롤은 `.gscroll` 안에서만.
- D13: 함께 시작 3개 = 한 열, 새 호출은 새 열, 기존 좌표 불변. 테스트 `r_col_parallel_then_next`·`r_col_log_restore`·`r_col_is_immutable` 통과.
- 자동 스크롤: 사용자가 맨 왼쪽(scrollLeft 0)으로 옮긴 뒤 30초 `get_sessions` 재요청이 실제로 나가도 0 유지, 새 실행 노드가 생기면 985로 따라감, 바깥 scroll 전부 0.
- R3: 포커스가 그래프 안이면 자동 스크롤 안 함(`scrollLeft 0` 유지), 포커스 해제 후엔 동작(337). 포커스 링은 가장자리와 정확히 4px 간격이라 잘리지 않음.
- reduced-motion: 일반 `anims 13`, reduce `anims 0`, 복원 `13`.

## 정리 [803e28f]
- 앱(orbit.exe·vite·cargo·npm) 종료. 1420·9333·53039에 LISTEN 소켓 없음(`netstat`에 TIME_WAIT만), `orbit` 프로세스 없음.
- `$d`(`%TEMP%\orbit-qa4`: settings·projects·dev 로그) 삭제, `Test-Path` False. 인증 파일은 복사한 적 없음.
- `screens/` 건드리지 않음(그림 5개 그대로). 실제 `~/.claude` 읽기·쓰기 없음.
- 작업 트리: `git status --porcelain --untracked-files=no` 출력 없음, HEAD 803e28f467eaa8b3cb351cd5413862969d4f1db6 불변.
- 산출물: `RUN_DIR\shots\v5\`(스크린샷·`app-A-measure.json`·`tools\r4.mjs`·`tools\status.mjs`). 새 Edge 시안 측정은 하지 않고 v4의 `ref-measure.json`을 재사용했다(정적 HTML).

## 한계
- 대화형(데스크톱) `claude` 세션은 안 돌렸다(이번에는 실제 세션 자체를 안 돌림). 기준 5·6은 [37f3ecc]의 `claude -p` 증거.
- 시안은 Galmuri11 없이 monospace라 글꼴 모양은 대조 대상이 아니다. 깜빡임(`!`)·진행 막대·간선 흐름의 위상은 캡처마다 다르다.
- N17(MSIX 컨테이너 screens 폴더 생성)·N18(asset scope `*`의 하위 폴더)은 시험하지 않았다(Security 몫).

COMMIT: 803e28f467eaa8b3cb351cd5413862969d4f1db6

VERDICT: PASS
