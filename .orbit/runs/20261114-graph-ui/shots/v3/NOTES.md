# shots/v3 NOTES (qa 수집만, 판정 없음)

head 4165fd4cc899ed779ca882809ca476e2210cc223, 브랜치 orbit/20261114-graph-ui, `npm.cmd run tauri dev`(디버그). 환경: ORBIT_CLAUDE_SETTINGS·ORBIT_CLAUDE_PROJECTS·CLAUDE_CONFIG_DIR 모두 %TEMP%\orbit-qa4. `get_status`: settings_path·projects_dir 모두 `...\Temp\orbit-qa4\` 아래, 듣는 주소 127.0.0.1:53039, screens_dir은 Roaming\dev.orbit.app\screens(건드리지 않음).
관찰: WebView2 CDP 127.0.0.1:9333, 뷰포트 1400x900 dpr 1. 시안: Edge 헤드리스(CDP 9334)로 file:///.../design/reference/layout_v4.html 1400x900. 토큰은 스크립트 안에서만 읽음. 스크립트: shots\tools\{m3,ref3,ref960v3,stageA3,snap3,cols,scenes,auto}.mjs

## 파일
- 시안: ref-1400.png, ref-graph.png, ref-960.png, ref-measure.json, ref-960-measure.json
- 장면 A(시안과 같은 데이터): app-A.png, app-A-graph.png(자동 스크롤 그대로), app-A-left(.png/-graph.png)(.gscroll을 맨 왼쪽으로), app-A-sel(.png/-graph.png)(실행 중 engineer 선택)
- app-cols(.png/-graph.png/-measure.json)(열 규칙 장면, 2단계 시점), app-tall(.png)·app-tall-down(.png)(한 열 8개, 아래로 스크롤), app-empty, app-states, app-960, app-wide.png·app-wide-userleft.png·app-wide-back.png·app-wide-measure.json(자동 스크롤)
- 각 app-*-measure.json: 패널·.gscroll(scroll 값)·canvas·svg·노드별 getBoundingClientRect·style left/top·border·radius·box-shadow·bg·padding·진행 막대·간선 d·페이지/다른 패널 scroll

## 장면 A 데이터(훅 순서, 부록 A QA A-2)
세션 4개(orbit, my-blog 대기, api-server 에러, notes 멈춤; 폴더 C:\qa\<이름>). orbit: UserPromptSubmit → architect(Pre/Start/Stop/Post 130000ms·41000) → plan-checker(40000·12000) → engineer×3 Pre+Start → e1 Post(302000·88000)·e2 Post(271000·70000) → reviewer Pre+Start+PermissionRequest(agent_id) → Lead PreToolUse(Read).
결과 노드: Lead 실행 중, architect·plan-checker·engineer 2개 끝남, engineer 1개 실행 중, reviewer 대기. 서브에이전트 상태는 Lead의 PreToolUse 뒤에도 그대로였음.

## 시안 / 앱 (1400x900, 장면 A, 자동 스크롤 그대로)
| 요소 | 시안 | 앱 |
|---|---|---|
| .graph 패널 | 301,74 741x486 | 같음 |
| h2 | 320,89 703x18 | 같음 |
| .gscroll 사각형·padding | 320,115 703x430, padding 4px | 같음 |
| .gscroll scrollWidth/clientWidth/scrollHeight/clientHeight | 1040/703/415/415 | 같음 |
| .gscroll scrollLeft | 0으로 읽힘(rtl 흉내, 캔버스 오른쪽 끝이 보임: canvas x -13, right 1019) | 333 (canvas x -9, right 1023 = .gscroll right) |
| canvas / svg 크기 | 1032x204 | 같음 (x 위치만 위 4px 차이) |
| 간선 d 5개(flow 1개 포함) | M168 102 H216 / M384 102 H432 / M600 102 H624 M624 30 V174 M624 30 H648 M624 102 H648 / flow M624 174 H648 / M816 30 H840 M816 102 H840 M816 174 H840 M840 30 V174 M840 102 H864 | 같음 |
| 노드 li left/top (Lead 0/72, architect 216/72, plan-checker 432/72, engineer 648/0·72·144, reviewer 864/72), 168x60 7개 | 같음 | 같음 |
| 노드 border (끝남 2px solid, 실행 중 3px solid, 대기 2px solid) | | 같음 |
| border-radius(6px)·box-shadow·background·color·padding(실행 중 3px 9px, 그 밖 4px 10px) 7개 노드 | | 같음 |
| 진행 막대 radius(4px)/채움(2px)/높이 8px/border 1px (Lead·engineer) | | 같음 |
| 노드 텍스트(이름·상태·메타, reviewer "권한 요청") | | 같음 |
| 노드 글꼴 | 시안은 Galmuri11 파일이 없어 monospace 대체 | Galmuri11 (측정표엔 미포함, 화면 캡처에서 다름) |
| 선택 표시 | 시안 e3에 ::before "▶" | app-A는 선택 없음(app-A-sel에서 e3 선택) |
| 960x640: .graph 236,74 428x330, .gscroll 255,115 390x274 | 같음 | 같음 |
| 960x640: .gscroll scrollWidth/clientWidth/scrollHeight/clientHeight | 1040/390/259/259 | 같음 |
| 960x640: canvas x / scrollLeft | -391 (rtl) | -387 / 646 |
| 마지막 활동 시각·"시작" 시각·훅 설치 문구·경로·서버 주소·액정 | 시안 고정값 | 앱 실제값(임시 환경) |

위 표에 적은 값 말고, 두 화면의 노드 7개·간선·패널 측정은 전부 같았다(비교 스크립트로 노드별 left·top·border·radius·shadow·bg·color·padding·pbar·크기·클래스·텍스트 대조). 깜빡임·흐름 애니메이션 위상은 캡처마다 다르다.

## 열 규칙(app-cols, 세션 qa-col, 1400x900)
1) Pre t1·t2·t3 → w1 216/0, w2 216/72, w3 216/144(한 열 세로 3개), 간선 `M168 102 H192 M192 30 V174` + `M192 30 H216 M192 102 H216 M192 174 H216`(전부 실행 중이라 flow).
2) Post t2 → Pre t4 → w4는 432/72 새 열에 혼자 섬. Lead·w1·w2·w3 좌표는 1)과 같음(0/72, 216/0, 216/72, 216/144). 간선: `M168 102 H192 M192 30 V174 M192 102 H216` / flow `M192 30 H216 M192 174 H216` / `M384 30 H408 M384 102 H408 M384 174 H408 M408 30 V174` / flow `M408 102 H432`. canvas 600x204.
3) Post t1·t3, SubagentStart+PermissionRequest(a-4) → w1·w2·w3 끝남, w4 대기(Lead도 대기로 바뀜). 5개 노드 좌표 2)와 같음. 간선에 flow 없음.

## 한 열 8개(app-tall)
worker1~8 모두 216/(0..504), 168x60. canvas 384x564. .gscroll scrollHeight 572 > clientHeight 430(세로 스크롤 생김), .gscroll scrollTop 0 → app-tall-down에서 142로 옮겨도 .panel.graph·문서·.sessions·.detail·.chat·.console의 scrollTop/scrollLeft 전부 0, h2는 그대로(320,89).

## 상태 장면(app-states, 세션 qa-states)
Lead 실행 중(3px solid, shadow 이중), architect 끝남(2px solid, 이중 shadow, 메타 "2분 10초 · 41k 토큰"), qa 실패(`2px dashed`, box-shadow none, "✕", 메타 "— · —"), librarian 알 수 없음(2px solid, 메타 "— · —"). 모두 한 열씩(0/216/432/648, top 0). 실행 중·대기 서브에이전트가 없어 scrollLeft 0이고 librarian은 1400 폭에서 오른쪽이 잘려 보임(스크롤로 보임).
## 비어 있는 세션(app-empty, my-blog)
노드는 Lead만(0/0). "서브에이전트 없음" 문구가 `.side-note`로 있음. canvas 384x60.

## 자동 스크롤(세션 qa-wide, 열 6개 → 7개, 1400x900; app-wide-measure.json)
| 단계 | .gscroll scrollLeft | 대상 li right / .gscroll right | 바깥(.panel.graph·문서·다른 패널) scroll |
|---|---|---|---|
| 1 열 6개, step6 실행 중, 건드리지 않음 | 765 (scrollWidth 1472, client 703) | 1023 / 1023 | 전부 0,0 |
| 2 가로 휠(CDP mouseWheel deltaX -5000)로 맨 왼쪽 | 0 | 1788 / 1023 (화면 밖) | 전부 0,0 |
| 3 이벤트 없이 40초 뒤 | 0 (그대로) | 1788 / 1023 | 전부 0,0 |
| 4 step6 Post(상태 변화, 실행 중 노드 없음) | 0 | 대상 없음 | 전부 0,0 |
| 5 새 열 Pre step7(실행 중) | 981 (scrollWidth 1688) | 1023 / 1023 | 전부 0,0 |
| 6 다른 세션(my-blog) 갔다가 qa-wide 복귀 | 981 | 1023 / 1023 | 전부 0,0 |
h2는 모든 단계에서 320,89 703x18. 960x640(app-960, 장면 A): .gscroll 255,115 390x274, scrollLeft 646 / scrollWidth 1040, .panel.graph scroll 0,0, 문서 scroll 0,0.
한계: 40초 동안 30초 재요청이 실제로 1회 도는지는 앱 내부 로그로 확인하지 않았다(대기 시간만 40초). 단계 5에서 노드가 보이게 옮겨진 것이 inline "nearest"인지 "end"인지는 값(대상 right = .gscroll right)만으로 구분되지 않는다. 6단계는 5단계와 위치가 같아 manual 해제 여부를 값으로 구별하지 못한다.

## 못 한 것·한계
- 실패 노드는 장면 A에 없다(시안에도 없음); app-states에서 따로 측정.
- 시안의 마지막 활동 시각 등 정적 텍스트는 같게 못 만듦(위 표).
- 시안 960 캡처는 시안 마크업(노드 7개) 그대로, 앱 app-960은 장면 A.
- 애니메이션 위상 고정 안 함.

## 정리
orbit.exe·vite·tauri dev(npm)·cargo·Edge 헤드리스 종료(1420·9333·9334·53039 듣는 소켓 없음), %TEMP%\orbit-qa4와 Edge 임시 프로필 삭제. Roaming\dev.orbit.app\screens 건드리지 않음. `git status --porcelain --untracked-files=no` 출력 없음.
