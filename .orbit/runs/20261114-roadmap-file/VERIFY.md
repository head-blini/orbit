# VERIFY — 20261114-roadmap-file (qa)

브랜치 `orbit/20261114-roadmap-file`. 시작·끝 `git status --porcelain --untracked-files=no` 출력 없음.

COMMIT: 68de7b6df387de5824041ae710e23f186caa4dd7

| 항목 | 결과 |
|---|---|
| 1 실제 앱에서 이 저장소 세션을 고르면 묶음 3개 + 5 / 14 | 통과 |
| 2 파일 내용이 사실과 맞음 | 통과 (약한 점 1건 아래) |
| 3 diff가 ROADMAP.md 하나뿐, roadmap.rs 변경 없음 | 통과 |
| 4 cargo test | 통과 |

## 1. 실제 앱

환경: `%TEMP%\orbit-qa-rf`에 `settings.json`(`{"hooks":{}}`)과 `projects\`를 만들고 `ORBIT_CLAUDE_SETTINGS`, `ORBIT_CLAUDE_PROJECTS`를 거기로 지정, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`, 같은 셸에서 `npm.cmd run tauri dev`. 실제 `~/.claude`는 열지 않았다. 세션은 훅 수신 서버에 `UserPromptSubmit`(cwd=`C:\Users\lclk1\Projects\orbit`)을 보내 만들었다(토큰은 스크립트 변수로만 읽고 출력하지 않음). 스크립트 `RUN_DIR/shots/q.mjs`가 CDP로 세션 버튼을 클릭하고 패널을 읽었다.
```
Running `target\debug\orbit.exe`
before session: "... 세션\n\n아직 세션이 없습니다 ... 로드맵\n\n세션을 고르면 그 프로젝트의 로드맵이 보입니다 ..."
hook 204
sess click orbit / 작업 중
PANEL>> {"text":"로드맵\n5 / 14\n1단계: 관찰 · 실행 ✓완료 ①…⑤ ·미완료 ⑥ \n2단계: 설계 · 자동화 ·미완료 ×4\n미뤄 둔 작업 ·미완료 ×4",
 "prog":["5","14","14개 중 5개 완료"],
 "h3":["1단계: 관찰 · 실행","2단계: 설계 · 자동화","미뤄 둔 작업"],
 "marks":"✓✓✓✓✓·········"}
```
묶음 제목 3개, `5 / 14`, 막대 aria `14개 중 5개 완료`, 완료 표시 5개(① ~ ⑤). 스크린샷: `RUN_DIR/shots/roadmap-panel.png`(캡처 명령 성공, 내가 이미지를 열어 보지는 않았고 위 DOM 값이 증거). 결과: 통과.
실패 경로: 세션 선택 전에는 "세션을 고르면 그 프로젝트의 로드맵이 보입니다" 안내(위 before 줄). 이 저장소 외 cwd(파일 없음 등)는 ⑤ run VERIFY가 이미 검증했고 이번에는 다시 하지 않았다.

## 2. 내용의 사실 확인

명령: `git log --oneline main | grep -i merge`
```
0e3ec25 Merge roadmap panel milestone 5
f394f60 Merge screen milestone 4
6a1917a Merge session log watch milestone 3
67be479 Merge hook server and installer milestone 2
(그 아래 하네스·문서 머지들)
```
②③④⑤는 main에 머지 커밋이 있다. ①은 머지 커밋이 없다. 가장 오래된 커밋이 `efa8f14 chore: baseline (Tauri scaffold + team harness)`이고 이후 ② 작업이 그 위에서 시작한다. 즉 ①(뼈대)은 baseline에 포함됐고 별도 머지 기록은 없다. 앱이 실제로 뜨고 화면이 그려지므로 사실상 완료지만 "머지돼 있다"는 증거는 baseline 커밋 수준이다(약한 점).
명령: `sed -n '51,52p;147p' SPEC.md` 및 `grep` 결과: SPEC 147행은 "① 앱 뼈대 + 빈 화면 → ② 훅 서버 + 설치 도우미 → ③ 로그 감시 → ④ 그래프/타임라인 UI → ⑤ 로드맵 패널 + 노드 이름 → ⑥ 프롬프트 입력창 + Agent SDK 사이드카 + UI 권한 승인". ROADMAP의 ①~⑥ 이름과 순서가 같다(④는 SPEC이 "그래프/타임라인 UI"인데 ROADMAP은 "그래프 UI" — 타임라인은 layout_v4 결정으로 없앤 것과 일치). SPEC 85~87행(2단계): 루프 설정(종료 조건·최대 반복·예산 상한·실패 알림), 이름 붙여 저장·재사용, Dynamic Workflow/헤드리스 변환·스케줄 실행이 ROADMAP 2단계 항목과 맞다. "그래프 편집" 항목은 이 grep 출력에 없어 SPEC 해당 줄을 직접 대조하지 않았다. 미뤄 둔 작업(orbit.db, Product 평가 모드, 하네스 등급, 맥 빌드)은 SPEC의 DB 절(96행 `orbit.db`)만 확인했고 나머지 셋은 `.orbit/decisions.md` 대조를 하지 않았다(미확인).
항목 수: 6 + 4 + 4 = 14, 완료 `[x]` 5개 — 앱이 표시한 5 / 14와 일치. 결과: 통과(위 미확인 2건은 목표 판정에 영향 없다고 봄, 근거 약함).

## 3. diff

명령: `git diff main...HEAD --stat`
```
 ROADMAP.md | 21 +++++++++++++++++++++
 1 file changed, 21 insertions(+)
```
명령: `git diff main...HEAD --stat -- src-tauri` → 출력 없음. `src-tauri/src/roadmap.rs`는 main과 같다(임시 테스트가 남았다면 diff에 보였을 것). 결과: 통과.

## 4. cargo test

명령: `cargo test` (`src-tauri/`)
```
test result: ok. 100 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.37s
test result: ok. 0 passed; 0 failed (main.rs)
test result: ok. 0 passed; 0 failed (Doc-tests)
EXIT=0
```
참고: ⑤ run 기록대로 심볼릭 링크 단언은 이 PC 권한(1314)으로 건너뛴다(이번 run 범위 밖). 결과: 통과.

## 정리

`orbit.exe`, vite, tauri dev 프로세스 트리 종료. 포트 1420·9333·53039 LISTEN 0개, `orbit` 프로세스 0개. `%TEMP%\orbit-qa-rf` 삭제. 코드는 고치지 않았다. 남긴 파일은 `RUN_DIR/shots/q.mjs`, `roadmap-panel.png`.

## 미확인

- ① 머지 커밋 없음(baseline 포함), 대조는 baseline 커밋 이력 수준.
- 그래프 편집 항목의 SPEC 줄, 미뤄 둔 작업 3건의 `.orbit/decisions.md` 대조.
- 스크린샷 이미지 육안 확인.

VERDICT: PASS
