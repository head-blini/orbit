# T8 SUMMARY (engineer 최종 메시지에서 Lead가 옮김 — engineer의 Write가 막혀 직접 쓰지 못함)

바꾼 파일 없음, 커밋 없음. 스크린샷: 이 폴더의 dev-initial.png, dev-lcd.png, dev-graph.png, build-graph.png.
방법: 환경변수로 %TEMP%\orbit-qa4를 가리킴, WebView2 CDP 127.0.0.1:9333. dev와 디버그 exe 모두 `get_status`의 settings_path·projects_dir이 $d 아래. 릴리스 exe 미실행. 토큰은 셸 변수로만.

1. 확인됨 — `$APPDATA` == `app_data_dir`. screens_dir = …\AppData\Roaming\dev.orbit.app\screens, 그림 로드(naturalWidth>0, scope 메시지 없음).
   - 첫 실행은 모든 asset URL이 403. 원인: 에이전트 셸이 Claude 데스크톱 MSIX 컨테이너 안이라, 거기서 만든 screens 폴더가 …\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\… 로 리다이렉트되고 Tauri가 그 경로로 canonicalize해 scope와 안 맞음(glob 크레이트로 재현). 실제 Roaming\screens가 있으면(사용자가 4.png와 함께 만들어 둠) 같은 설정으로 동작. conf 변경 없음.
2. 확인됨 — img.src = `http://asset.localhost/C%3A%5CUsers%5C…%5Cscreens%5C4.png`. R3 불필요.
3. 다 보지 못함 — "폴더 열기" 클릭 시 오류 문구 없음, 폴더 생성됨, Rust는 Ok 반환. 탐색기 창은 관찰하지 못함(컨테이너 밖 실행은 권한 시스템이 거부, 재시도 안 함).
4. 확인됨 — devCsp에서 invoke 동작(get_status, list_screens). 콘솔은 vite 메시지와 favicon 404뿐. Galmuri11이 h1·h2·한글 상태 줄에 렌더(CSS.getPlatformFontsForNode, isCustomFont true).
   - 그래프(curl, 세션 qa-graph): Lead 왼쪽(x=328), 서브에이전트 열 오른쪽(x=576), 간선 `M168 131 H208 V.. H248`, `.flow`는 실행 중 노드에만, is-wait, is-fail, 칩 8개. `<b>x</b>`는 글자 그대로. 칩 클릭 시 상세의 노드 줄이 채워짐.
5. 확인됨 — `npm.cmd run tauri build -- --debug --no-bundle` 0 종료. 디버그 exe 응답 헤더: `img-src 'self' asset: http://asset.localhost; script-src 'self' 'sha256-…'; default-src 'self' ipc: http://ipc.localhost; style-src 'self'; font-src 'self'`. ws://localhost:1420·'unsafe-inline' 없음 → prod csp 적용, R13 해당 없음. 재로드 시 CSP 위반 없음, 글꼴·16px GIF·노드 위치 정상.
   - `style` prop(li의 left/top)은 `style-src 'self'`에서 적용됨. 대조: `setAttribute("style")`은 막히고 기록됨, `el.style.left`는 동작.
6. 일부 — 액정 클릭으로 그림 순환(4.png → t8a.png → t8b.gif → 4.png). t8c.svg는 `list_screens`에 없음.
   - 안 함: "폴더 비움 → 재시작 → 빈 액정". 사용자의 그림을 옮겨야 해서 건너뜀. T2 단위 테스트는 빈 목록만 다룸.

정리: orbit/vite/cargo 프로세스 종료, 1420·9333 포트 비움, 시험 파일 t8a/t8b/t8c 삭제(사용자의 4.png와 gif는 그대로), %TEMP%\orbit-qa4 삭제. 첫 실행이 남긴 LocalCache\Roaming\dev.orbit.app(hook-server.json, MSIX 리다이렉트 저장소)은 그대로 둠. `git status` 깨끗.
멈춰서 보고할 항목: 없음(R2 B, R5 플래그, R13, CSP 추가, capability, 새 의존성).
실행 안 함: `cargo test`, `npm.cmd run build`(파일 변경 없음. 디버그 빌드가 beforeBuildCommand로 `npm run build`를 거침).
위험: MSIX 컨테이너 안의 프로세스에서 Orbit을 띄우면 그림이 403. 여기서 재현했으나 일반 설치에서는 확인하지 않음.
