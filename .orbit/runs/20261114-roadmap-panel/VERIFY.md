# VERIFY — 20261114-roadmap-panel (qa, V1 재판정)

브랜치 `orbit/20261114-roadmap-panel`. 시작·끝 모두 `git status --porcelain --untracked-files=no` 출력 없음, `git rev-parse HEAD` = 3a45ced16382416dde7dcaaada6518aa6c7d95ad (재판정 때 다시 확인, 코드 변화 없음).

## 요약

| 기준 | 결과 |
|---|---|
| 1 cargo test + 로드맵 테스트 | 통과 (심볼릭 링크 단언은 **사용자 확인 대기**, 기준 11) |
| 2 npm build, gate.test | 통과 |
| 3 다섯 항목 · 2 / 5 · 막대 | 통과 |
| 4 30초 안 3 / 5, 재선택 | 통과 (14.1초, 재선택 즉시) |
| 5 네 경우 안내 | 통과 |
| 6 상세·경로 없음, 버튼은 상단 바만, 액정 | 통과 |
| 7 노드 이름 접두사 없음 | 통과 |
| 8 시안 대조 "같다" | 통과, **알려진 예외 1건**: 960×640 그래프 가로 스크롤 위치(DECISIONS 11, 후속 목록). 아래 12절 |
| 9 SPEC diff 범위 | 통과 |
| 10 HTML 글자 그대로 | 통과 |
| 11 경로 인자 없음, 정션·링크 거부 | 정션·UNC·장치·상대 경로 통과. **심볼릭 링크 거부: 사용자 확인 대기**(DECISIONS 12) |
| 12 capability·CSP·scope 변경 없음 | 통과 |
| 13 새 의존성 없음 | 통과 |
| DESIGN 6절 미확인(960×640 상단 바 한 줄) | 통과 |

실패(깨진 동작) 0건. 에이전트가 실행으로 확인할 수 있는 항목은 모두 통과다. 남은 것은 사용자만 닫을 수 있는 "사용자 확인 대기" 1건(심볼릭 링크)과, 사용자가 후속으로 넘긴 알려진 예외 1건(그래프 스크롤)이다. 이것은 미검증을 통과로 바꾼 것이 아니라 사용자가 확인 책임·위험을 가져간 것이다(아래 인용, ④ run `20261114-graph-ui` VERIFY의 "사용자 확인 대기"와 같은 방식).

## 환경

- `$d = %TEMP%\orbit-qa5`. `ORBIT_CLAUDE_SETTINGS=$d\settings.json`, `ORBIT_CLAUDE_PROJECTS=$d\projects`를 설정한 같은 셸에서 `npm.cmd run tauri dev`(디버그). WebView2는 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`으로 관찰(CDP, 뷰포트 `Emulation.setDeviceMetricsOverride`, dpr 1).
- 임시 settings를 가리키는 증거: `get_status`에는 이제 경로가 없다(기준 6). 대신 시작 직후 훅 상태가 "설치 안 됨"이었다(임시 settings는 `{"hooks":{}}`, 사용자의 실제 settings에는 훅이 설치돼 있다). [설치]를 누르자 `$d\settings.json`이 바뀌었고 결과 줄의 백업 경로가 `...\Temp\orbit-qa5\settings.json.orbit-backup-...`였다. 실제 `~/.claude`는 열지 않았다(게이트가 그 경로를 가리키는 셸 명령을 막아 mtime도 확인하지 않음).
- 사용자의 `%APPDATA%\dev.orbit.app\screens`는 읽기만(파일 개수 5 → 5, 옮기거나 지우지 않음). 훅 토큰은 스크립트 변수로만 읽었고 출력·파일에 없다(settings 출력은 토큰을 가렸다).
- 스크립트: `RUN_DIR\shots\tools\*.mjs`.

## 1. cargo test (기준 1)

명령: `cargo test` (`src-tauri/`)
```
test server::tests::oversized_header_rejected ... ok
test server::tests::bad_json_400_then_server_alive ... ok
test server::tests::stalled_unauth_body_does_not_block_others ... ok
test watch::tests::l_oversize_valid_json_and_numeric_tail ... ok
test watch::tests::k_big_file_one_poll ... ok
test result: ok. 100 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
(main.rs 0 tests, Doc-tests 0 tests)
EXIT=0
```
명령: `cargo test roadmap:: -- --nocapture`
```
test roadmap::tests::parse_bad_utf8_line_is_skipped ... ok
test roadmap::tests::parse_keeps_html_verbatim ... ok
test roadmap::tests::parse_recognizes_and_ignores ... ok
test roadmap::tests::parse_long_line_is_skipped ... ok
test roadmap::tests::parse_sample_crlf_bom ... ok
test roadmap::tests::serializes_as_tagged_json ... ok
test roadmap::tests::parse_entry_limit ... ok
test roadmap::tests::read_missing_file_and_dir ... ok
test roadmap::tests::for_cwd_shapes ... ok
read_rejects_folder_and_links: 심볼릭 링크를 만들 수 없어 단언을 건너뜀: Err(Os { code: 1314, ... "클라이언트가 필요한 권한을 가지고 있지 않습니다." })
test roadmap::tests::read_size_limit ... ok
test roadmap::tests::read_rejects_folder_and_links ... ok
test result: ok. 11 passed; 0 failed
```
`cargo test sessions::tests::short` → `short_kind_strips_prefix ... ok`.
요구된 6종: 정상(parse_sample_crlf_bom·recognizes), 파일 없음(read_missing_file_and_dir), 크기 초과(read_size_limit), 잘못된 UTF-8(parse_bad_utf8_line_is_skipped), 깨진 줄(같은 테스트), 링크·정션·범위 밖(read_rejects_folder_and_links, for_cwd_shapes) 모두 있다.
**심볼릭 링크 단언은 이 환경에서 실행되지 않았다(사용자 확인 대기, 기준 11 참고).** 위 출력대로 심볼릭 링크를 만들 수 없어(1314) 테스트가 그 단언을 건너뛰고 ok로 끝난다(REVIEW N4). `is_symlink` 분기는 어느 실행으로도 닿지 않았다. 결과: 통과(심볼릭 링크 단언 제외).

## 2. build, gate.test (기준 2)

명령: `npm.cmd run build`
```
✓ 23 modules transformed.
dist/index.html                         0.39 kB │ gzip:  0.26 kB
dist/assets/Galmuri11-DfQIlyDK.woff2  504.73 kB
dist/assets/index-ox4dnIrK.css          7.75 kB │ gzip:  2.27 kB
dist/assets/index-COv-TYjx.js         234.14 kB │ gzip: 73.95 kB
✓ built in 135ms
EXIT=0
```
명령: `node --test harness/hooks/gate.test.mjs`
```
ℹ tests 71
ℹ pass 71
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
EXIT=0
```
결과: 통과.

## 3. 상단 바 훅 버튼 · 액정 폴더 (기준 6의 일부, 절차 2단계)

데이터: 1400×900.
```
시작:        TEXT: ORBIT | 127.0.0.1:53039에서 듣는 중 | · | 훅 설치 안 됨 | 설치 | 액정 폴더
[설치] 클릭:  "성공 · 백업: C:\Users\lclk1\AppData\Local\Temp\orbit-qa5\settings.json.orbit-backup-1794660894445" | 훅 설치됨 | 제거 | 액정 폴더
              $d\settings.json에 11개 이벤트(UserPromptSubmit … StopFailure)의 http 훅(url http://127.0.0.1:53039/events, X-Orbit-Token, timeout 2) 병합
11초 뒤:      결과 줄이 빔 (TEXT: ORBIT | 127.0.0.1:53039에서 듣는 중 | · | 훅 설치됨 | 제거 | 액정 폴더)
[제거] 클릭:  "성공 · 백업: ...orbit-qa5\settings.json.orbit-backup-1794660916976" | 훅 설치 안 됨 | 설치 ; settings.json 내용 = {}
[액정 폴더]:  탐색기 창 MainWindowTitle = "screens" 이 열림 (확인 후 그 창만 닫음)
```
참고: 제거 뒤 settings는 원래의 `{"hooks":{}}`가 아니라 `{}`다(hooks 키가 비면 지운다). 동작상 문제는 아니다.
서버 상태 `.tb-srv`에 `title`: `["tb-srv px","127.0.0.1:53039에서 듣는 중",[960,28,169,18],"127.0.0.1:53039에서 듣는 중"]` — title이 붙었다. 결과 줄 `.tb-result`에도 같은 전문이 title로 있다.
결과: 통과.

## 4. 기준 3 — 다섯 항목, 2 / 5, 40% 막대

데이터: `$d\proj\ROADMAP.md` = 시안 데이터 그대로(`## 1단계: 관찰` + `[x]` 2, `## 2단계: 화면` + `[ ]` 3, 긴 항목 포함). 세션 `proj`(cwd = `$d\proj`, 로그 첫 줄 + 훅). 명령: `node look.mjs`(SESS=proj).
```
로드맵 / 2 / 5 / 1단계: 관찰 / ✓ 완료: 훅 수신 서버와 설치 도우미 / ✓ 완료: 세션 목록과 상태 표시 /
2단계: 화면 / · 미완료: 에이전트 그래프 / · 미완료: 로드맵 패널 — 프로젝트 폴더의 ROADMAP.md를 읽어 ... 채운다 / · 미완료: 채팅 패널 연결
PANEL>> {"prog":["2","5","5개 중 2개 완료","40%"],"marks":["✓","✓","·","·","·"], "h3":["1단계: 관찰","2단계: 화면"]}
```
파일 순서대로 5항목, `✓` 2개, "2 / 5", 막대 폭 40%, `role=progressbar` aria 값(now 2, max 5, 텍스트 "5개 중 2개 완료"). 결과: 통과.

## 5. 기준 4 — 30초 안에 3 / 5

앱을 켠 채 `ROADMAP.md`의 `- [ ] 에이전트 그래프`를 `- [x]`로 고침(`poll.mjs`).
```
before "2 / 5"
0.0s "2 / 5"
14.1s "3 / 5"
marks ["✓","✓","✓","·","·"] 60%
```
세션 재선택: 다른 항목(`채팅 패널 연결`)을 `[x]`로 고친 뒤 gp 세션 → proj 세션을 골랐더니 0.8초 안에 `{"prog":["4","5","5개 중 4개 완료","80%"],"marks":["✓","✓","✓","·","✓"]}`. 결과: 통과.

## 6. 기준 5 — 네 경우의 안내 (앱은 계속 동작)

각 경우 뒤 상단 바 "듣는 중"이 그대로고 다음 장면으로 계속 조작됨(`topbar alive: True`).
```
a 세션 미선택(앱 시작 직후): 로드맵 / 세션을 고르면 그 프로젝트의 로드맵이 보입니다
b 파일 없음(ROADMAP.md 이름 변경): 로드맵 / ROADMAP.md가 없습니다 / 프로젝트 폴더 맨 위에 두면 여기 보입니다 — ## 묶음, - [ ] 할 일, - [x] 끝난 일
c 300 KiB(`- [ ] x` 반복, 307280 바이트): 로드맵 / ✕ ROADMAP.md가 너무 커서 읽지 않았습니다 / 한도: 256 KiB · 500개
d 잘못된 UTF-8(`- [ ] \xFF\xFE 깨진 줄` 섞임): 1 / 3, 항목 하나·둘·셋(깨진 줄만 빠짐) + 읽지 못한 줄을 건너뛰었습니다
d2 전부 잘못된 UTF-8: ROADMAP.md에 체크 항목이 없습니다 / ... / 읽지 못한 줄을 건너뛰었습니다
```
안내는 DESIGN 2.1 표대로 제목 줄 + 보조 줄(최대 두 줄)이다. 결과: 통과.

## 7. 기준 6 — 상세·경로 없음, 액정 그대로

`scan.mjs`: proj 선택 + Lead 노드 클릭 뒤 화면 텍스트와 title·aria-label에서 검색.
```
출처 - | settings.json - | projects - | AppData - | Users - | screens - | 3f2a9c1e(세션 id) - | 종류 - | 시작 - | orbit: - | 로그 - | 대상 - | 평문 - | 토큰  - | allowedHttpHookUrls - | 상세 - | 폴더 열기 FOUND
h2: ["세션","에이전트 그래프","로드맵","채팅"]
buttons: 훅 설치, 액정 폴더 열기, <세션들>, ▶ Lead, architect, plan-checker, engineer ×3, reviewer, 다음 그림
aria-current(▶): Lead
```
"폴더 열기"는 `액정 폴더` 버튼의 aria-label("액정 폴더 열기")뿐이다(질문 d에서 남기기로 한 상단 바 버튼). 노드 클릭은 `▶`만 바꾸고 상세가 뜨지 않는다. `src/` grep(`dangerouslySetInnerHTML|SOURCE_LABEL|settings_path|projects_dir|상세 · 하네스|설정 참고|평문|allowedHttpHookUrls|orbit:`): 결과 없음(`screens_dir`는 `src\App.tsx:160`의 Rust 명령 이름 `open_screens_dir`뿐).
오른쪽 아래 액정(`lcd.mjs`):
```
lcd before SML1-1.gif 160x144
distinct images after 6 clicks: 5 ["SML1-1.gif","pokemon-red-title.gif","super-mario-land-1-1.gif","4.png","PokemonRed-Title.gif"]
lcd disabled? false
```
그림이 표시되고 클릭할 때마다 다음으로 넘어간다(④와 같음). 결과: 통과.

## 8. 기준 7 — 노드 이름

훅으로 `subagent_type`을 접두사 그대로 보냄(`orbit:architect`, `orbit:plan-checker`, `orbit:engineer`, `orbit:reviewer`, 그리고 `general-purpose`, `other-plugin:reviewer`).
```
proj 세션: Lead 실행 중 / architect 끝남 2분 10초 · 41k 토큰 / plan-checker 끝남 40초 · 12k 토큰 / engineer 끝남 5분 2초 · 88k 토큰 / engineer 끝남 4분 31초 · 70k 토큰 / engineer 실행 중 / reviewer 대기 권한 요청
gp 세션:   Lead 실행 중 / general-purpose 실행 중 / reviewer 실행 중
VP 1400x900 orbit: in body? false html has orbit: false   (화면 텍스트와 HTML 모두 "orbit:" 없음)
```
결과: 통과.

## 9. 기준 10 — HTML 글자 그대로

`ROADMAP.md` = `## <b>h</b> 제목` / `- [ ] <b>x</b>` / `- [x] <img src=x onerror=alert(1)>` / `- [ ] <script>alert(2)</script>`. `window.alert`를 가로채고 재선택(`xss.mjs`):
```
items ["<b>h</b> 제목","· 미완료: <b>x</b>","✓ 완료: <img src=x onerror=alert(1)>","· 미완료: <script>alert(2)</script>"]
child elements in .detail that are b/img/script: 0
alerts fired: []
```
`src/` 전체에서 `dangerouslySetInnerHTML` grep 결과 없음. 스크린샷 `shots\s6-xss.png`. 결과: 통과.

## 10. 기준 11 — 경로 인자 없음, 정션·링크·위험한 cwd

`src-tauri/src/lib.rs`:
```
72: fn get_roadmap(state: State<AppState>, id: String) -> roadmap::Roadmap {
73:     let cwd = lock(&state.store).get(&id).and_then(|s| s.cwd.clone());
74:     roadmap::for_cwd(cwd.as_deref())
184:            get_roadmap,
```
인자는 세션 id뿐이다. 정션: `ROADMAP.md`를 지우고 `cmd /c mklink /J "$p\ROADMAP.md" "$d\projects"`:
```
Junction created for ...\proj\ROADMAP.md <<===>> ...\Temp\orbit-qa5\projects
Name ROADMAP.md  Attributes Directory, ReparsePoint  LinkType Junction
화면: 로드맵 / ✕ 로드맵을 읽지 못했습니다 / 링크·정션은 읽지 않습니다   (앱 계속 동작)
```
`cmd /c mklink "$p\LINK.md" "$d\settings.json"`(파일 심볼릭 링크): `You do not have sufficient privilege to perform this operation.` — 만들 수 없어 실행하지 못함.
cwd 모양(훅으로 만든 세션, `unc.mjs`·`unc2.mjs`):
```
cwd \\127.0.0.1\c$\x          => ✕ 로드맵을 읽지 못했습니다 / 로컬 절대 경로가 아닙니다
cwd \\.\C:\devx               => ✕ 로드맵을 읽지 못했습니다 / 로컬 절대 경로가 아닙니다
cwd relx (상대)               => ✕ 로드맵을 읽지 못했습니다 / 로컬 절대 경로가 아닙니다
cwd C:\orbit-qa5-does-not-exist\nodirx => ROADMAP.md가 없습니다
```
정션 삭제는 `cmd /c rmdir`로 했고 대상 폴더(`projects`)는 남아 있었다(Test-Path True). 결과: 정션·UNC·장치·상대 경로·폴더 거부 통과.

**심볼릭 링크 거부: 사용자 확인 대기 (DECISIONS 12).** 사용자가 AskUserQuestion으로 "미검증으로 두고 진행"을 골랐다(2026-11-14). DECISIONS 12 인용: "이 PC는 권한(1314) 때문에 파일 심볼릭 링크를 만들 수 없어 기준 11의 그 부분은 '사용자 확인 대기'로 둔다(④ run DECISIONS 15와 같은 방식)." 사용자가 수용한 위험(인용): "거부가 안 되는 결함이 있어도 머지 뒤에야 드러난다 — 최악은 프로젝트 폴더에 링크를 만들 수 있는 프로그램이 다른 텍스트 파일의 체크박스 줄(256 KiB 이하)을 로드맵 패널에 띄우는 것." 대체 증거: 정션이 같은 reparse point로 거부됨(실측), 폴더 거부 테스트, `read_rejects_folder_and_links`가 ok(단 심볼릭 단언은 건너뜀 — 위 1절). 이 항목은 에이전트가 닫을 수 없다(권한 1314는 시스템 권한 문제이고 개발자 모드를 켜는 것은 시스템 설정 변경). 닫는 방법: 관리자 권한 또는 개발자 모드에서 `src-tauri`의 `cargo test roadmap:: -- --nocapture`를 돌려 "건너뜀" 줄이 없는지 확인.

## 11. 960×640 상단 바 (DESIGN 6절 미확인 항목, 절차 8단계)

실제 Galmuri11(앱, `dist/assets/Galmuri11-*.woff2`)로 측정. 뷰포트 960×640(`innerWidth×innerHeight` = 960×640).
```
설치 안 됨, 결과 줄 없음: bar [8,8,944,58] scrollW 938 = clientW 938, tb-srv [520,28,169,18], 훅 [709,28,75,18], 버튼 [792,25,52,24] [852,25,81,24]
설치 안 됨 + 긴 결과 문구("성공 · 백업: C:\Users\lclk1\AppData\Local\Temp\orbit-qa5\settings.json.orbit-backup-…"): bar 높이 58 그대로, scrollW 938 = clientW 938, tb-result 폭 385px(글이 말줄임, 스크린샷에서 "…"), 버튼 위치 792/852 그대로
훅 설치됨 + 같은 결과: tb-result 407px, 버튼 792/852
```
상단 바는 두 줄로 늘지 않고, 긴 문구는 말줄임되며, 버튼이 밀리지 않는다. 서버 오류 문구(`server_error`)는 서버를 띄운 상태에서 만들 수 없어 실행하지 못했다(긴 결과 문구로 대신 확인, `.tb-srv`는 `flex`·말줄임 규칙은 코드 읽기만). 스크린샷 `shots\s8-960-hook-notinstalled-longresult.png`. 결과: 통과.

## 12. 기준 8 — 시안 대조 (V2 결과 반영)

저장: `RUN_DIR\shots\app-1400.png`, `app-960.png`, `ref-1400.png`, `ref-960.png`. 앱은 CDP 뷰포트 override로 안쪽 크기 1400×900, 960×640을 맞췄다(OS 창 자체는 건드리지 않음). 시안은 Edge 헤드리스(CDP 9334)에서 같은 크기로 연 `design/reference/layout_v4.html`.
앱 데이터: ROADMAP.md는 시안과 글자까지 같음. 노드: Lead + architect + plan-checker + engineer ×3(▶ 선택은 실행 중) + reviewer(대기, 권한 요청).

**데이터가 시안과 달라 차이 목록에서 제외한 것**: 세션 목록(시안 4개, 앱 `proj` 1개), 상단 바 문구(결과 줄·포트·설치됨/안 됨), 글꼴(시안 monospace 대체, 앱 Galmuri11), 액정 그림, 애니메이션 위상(실행 중 막대, reviewer `!`, 간선 흐름).

**정정(V1의 오기술).** V1은 "960×640 캡처의 그래프 가로 스크롤 위치(맨 오른쪽)는 둘 다 같은 규칙이다"라고 적었다. 이것은 캡처와 맞지 않았다. 이번에 `shots\app-960.png`와 `shots\ref-960.png`를 직접 열어 다시 봤다.
- 시안(`ref-960.png`): 그래프가 맨 오른쪽. 스크롤 손잡이가 오른쪽 끝 쪽(약 x 494–626), engineer ×3 열과 reviewer(대기·권한 요청) 열이 모두 보인다.
- 앱(`app-960.png`): 손잡이가 가운데(약 x 387–519). plan-checker 열이 보이고, engineer 열은 오른쪽 가장자리에서 잘린다("enginee…"). reviewer 열은 화면 밖이다.
DESIGN_REVIEW의 측정(시안 494–626 / 앱 387–519, reviewer 안 보임)은 내 캡처와 일치한다. 즉 두 화면은 같은 규칙이 아니라 **다르다**. 1400×900 캡처는 DESIGN_REVIEW가 픽셀 단위로 같다고 봤고(배치·테두리·색·로드맵 막대·항목 y·상단 바), 내가 본 1400 인상과도 어긋나지 않는다.

**원인과 범위 확인.** `git diff main...HEAD -- src/Graph.tsx` → 출력 0줄(비어 있음, `wc -l` = 0). `Graph.tsx`는 이번 run diff에 없다. 즉 이 차이는 ④의 기존 동작이다(DESIGN_REVIEW 추정: `scrollIntoView`가 `moveKey` 변경 때만 돌아 1400→960으로 폭이 줄어도 다시 맞추지 않음. 이 추정은 코드를 내가 다시 읽어 확인하지 않았고, 캡처가 같은 페이지의 뷰포트만 바꿨다는 점은 V1 기록과 일치한다). 내가 이 원인을 재현하려고 앱을 새로 띄우지는 않았다(코드·캡처 불변).

**사용자 결정 (DECISIONS 11, 2026-11-14, "후속 목록에 적고 진행").** 인용: "이번 run의 diff가 아닌 ④의 기존 동작(`src/Graph.tsx`)이라 이번에는 고치지 않고 `.orbit/decisions.md` 후속 목록에 적는다. 성공 기준 8은 이 차이를 알려진 예외로 두고 판정한다(판정은 QA)."

**QA 판정.** 기준 8은 이 로드맵 패널 변경이 만든 화면(로드맵 패널·상단 바·이중 테두리·배치)에 대해 1400×900·960×640 모두 시안과 같다. 같지 않은 1건은 이번 diff 밖의 기존 코드가 만든 것이고 사용자가 후속으로 넘겼으므로 알려진 예외로 두고 **통과(예외 1건)**로 한다. 이것은 "같다"의 무조건 통과가 아니다. 결함 자체는 실재한다(DESIGN_REVIEW 심각도 "고쳐야 함": 창을 줄이면 권한 요청 노드가 안 보일 수 있음). 확인할 책임은 후속 목록(`.orbit/decisions.md`)에 있다 — 내가 그 파일에 적혔는지는 확인하지 않았다(DECISIONS 11이 "적는다"고만 말함).
못 본 것(DESIGN_REVIEW): 키보드 포커스 링·hover 반전·reduced-motion, 파일 없음·너무 큼·링크 거부 화면의 시안 대조(시안에 그 상태 없음).

## 13. 기준 9·12·13 — diff

명령: `git diff --exit-code main -- src-tauri/capabilities src-tauri/tauri.conf.json package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock`
```
EXIT=0   (출력 없음)
```
명령: `git diff main --stat` (마지막 줄 포함)
```
 SPEC.md                         |  14 +-
 design/reference/layout_v4.html |  95 +++++------
 design/tokens.json              |  12 ++
 src-tauri/src/lib.rs            |  27 ++--
 src-tauri/src/roadmap.rs        | 346 +++++
 src-tauri/src/sessions.rs       |  33 +++-
 src/App.css                     |  25 +--
 src/App.tsx                     | 147 ++++++------
 src/types.ts                    |   4 +
 9 files changed, 562 insertions(+), 141 deletions(-)
```
`git diff -U0 main -- SPEC.md` hunk: `@@ -30,2 +30,2 @@`, `@@ -47 +47 @@`, `@@ -51,3 +51,3 @@`, `@@ -147 +147 @@`. 바뀐 줄은 훅 설치 도우미 30~31(상단 바, 평문 안내 삭제), 노드 클릭(`▶ 선택 표시만`), 4 "로드맵"(+ 하네스 카드·팀 명단 뷰는 ⑥ 뒤 시점 미정), 147 "⑤ 로드맵 패널 + 노드 이름"뿐이다. `grep -nE '하네스 카드 \+ 팀 명단|노드 클릭 → 오른쪽 상세|평문으로 저장된다는 안내' SPEC.md` → 결과 없음(exit 1).
재판정 때 추가 확인: `git diff main...HEAD -- src/Graph.tsx` 출력 0줄.
capability·CSP·asset scope, `package.json`·`package-lock.json`·`Cargo.toml`·`Cargo.lock`에 변경 없음 → 새 의존성·권한 없음. 결과: 통과(기준 9, 12, 13).

## 정리

- `orbit.exe`, vite, npm·cargo, 헤드리스 Edge(프로필 `orbit-qa5-edge`) 종료. 포트 1420·9333·9334·53039 LISTEN 0개, `orbit` 프로세스 0개, `vite|tauri dev|orbit-qa5` 명령줄 프로세스 없음.
- 정션은 `rmdir`로 지움(이후 `ROADMAP.md`는 일반 파일로 복원해 지움). `%TEMP%\orbit-qa5`와 Edge 프로필 삭제(`Test-Path` False). 환경변수는 백그라운드 셸에만 있었고 그 셸은 종료됨.
- `%APPDATA%\dev.orbit.app\screens` 파일 5개 그대로. 설정 백업 파일(`settings.json.orbit-backup-*`)은 `$d` 안이라 함께 지워짐.
- 재판정에서는 앱을 띄우지 않았다(파일 읽기·git 명령만). 코드는 고치지 않았다. 시작·끝 `git status --porcelain --untracked-files=no` 출력 없음.

## 남은 항목

사용자 확인 대기:
1. 심볼릭 링크 거부(기준 1의 단언, 기준 11) — DECISIONS 12. 닫는 방법은 기준 11 절 끝.

알려진 예외(후속으로 이관, DECISIONS 11):
2. 창을 줄인 뒤 그래프 가로 스크롤이 다시 맞춰지지 않음(`src/Graph.tsx`, 이번 diff 밖) — 기준 8.

미검증(통과에 영향 없다고 판단, 근거 약함이므로 남김):
3. 서버 오류 문구가 긴 960×640 상단 바(긴 결과 문구로 같은 규칙만 확인).

COMMIT: 3a45ced16382416dde7dcaaada6518aa6c7d95ad

VERDICT: PASS
