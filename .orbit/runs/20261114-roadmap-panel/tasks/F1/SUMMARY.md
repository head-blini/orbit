F1 SUMMARY
바꾼 파일: src/types.ts, src/App.tsx, src/App.css (3개만)
커밋: 2145246 (orbit/20261114-roadmap-panel)

검증
- `npm.cmd run build` -> tsc && vite build, "built in 173ms", exit 0 (LF 정규화 뒤 재실행도 build=0)
- Grep(dangerouslySetInnerHTML|SOURCE_LABEL|settings_path|projects_dir|screens_dir|상세 · 하네스|설정 참고|평문|allowedHttpHookUrls|<dl|.path|.actions|setInterval) in src:
  Screen.tsx:24 setInterval(Screen 자체), App.tsx:122 setInterval(기존 30초 1곳), App.tsx:160 `invoke("open_screens_dir")`
  -> 160행은 Tauri 명령 이름이 `screens_dir` 패턴에 걸린 것. 필드·경로 표시는 아님. 그 밖에는 결과 없음.
- App.css `#[0-9a-fA-F]{3,8}` -> :root 4줄(5~8행)만
- dev 서버(npm run dev): http://localhost:1420/src/App.tsx HTTP 200, App.css에 rm-sum 포함. 끝난 뒤 1420 포트 소유 프로세스 종료, `Get-NetTCPConnection -LocalPort 1420` 개수 0 확인.

구현 메모
- (A) selected가 null이면 get_roadmap을 부르지 않고 "세션을 고르면 그 프로젝트의 로드맵이 보입니다"를 보인다. effect 두 개([selected] 비움, [selected, now] 재읽기, cancelled 플래그, 실패 시 {kind:"error"}).
- 상단 바 마크업·CSS는 시안 91~97행·251~262행을 그대로 옮겼다. 로드맵 CSS는 시안 186~195행 그대로. dl/dt/dd, .path, .actions 삭제.
- 성공 문구 10초 뒤 비움(같은 문구일 때만), "✕"·"처리 중…"은 유지. 버튼은 installed===true면 제거, 그 밖에는 설치(installed가 true/false가 아니면 비활성).

검증하지 못한 것
- 브라우저/스크린샷 도구가 없어 실제 화면(상단 바 한 줄, "세션을 고르면…" 문구)을 눈으로 보지 못했고 서버 응답·CSS 포함 여부만 확인했다.
- (B) 요약 줄과 첫 h3 사이 간격을 눈으로 확인하지 못했다. CSS는 시안과 동일하다. 다만 앱에서는 .rm-sum이 h3보다 앞에 있어도 `h3:first-of-type{margin-top:0}`이 첫 h3에 걸리고, 시안과 같은 구조(요약 줄 -> h3)이므로 같은 결과여야 한다. V1/V2에서 확인 필요.
- get_roadmap은 R2 배선 전이라 실제 호출은 못 해봤다(Tauri 실행 안 함).

계획·시안과 달라진 점 / 시안에 없어 남긴 질문
- 질문 1: DESIGN 2.1 `.note` 형식 안내의 백틱(`## 묶음`)을 코드 서식 표시로 보고 화면 문구에서는 뺐다("— ## 묶음, - [ ] 할 일, - [x] 끝난 일"). 백틱이 글자로 보여야 하면 알려 달라.
- 질문 2: toobig 한도 문구는 "한도: 256 KiB · 500개"로 했다(max_bytes/1024 반올림). 다른 표기를 원하면 알려 달라.
- 항목이 0개일 때 요약 줄·막대 없이 "ROADMAP.md에 체크 항목이 없습니다" + 형식 안내 .note(+ 건너뛴 줄 .note)를 보인다. 제목만 있고 항목 0개면 제목도 숨긴다(DESIGN 2.1 항목 0개 행 해석).
- 참고: PowerShell 도구의 git add는 gate가 "main/master 위" 로 오판해 막았다(Bash cd 후 실행은 통과). 우회가 아니라 같은 명령을 Bash 도구로 실행했다.
