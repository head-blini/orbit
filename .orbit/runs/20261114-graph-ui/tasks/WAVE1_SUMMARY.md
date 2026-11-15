# 웨이브 1 SUMMARY (engineer·librarian 최종 메시지에서 옮김, Lead가 `git log --stat main..HEAD`로 커밋·파일 확인)

| 태스크 | 커밋 | 파일 | 보고된 검증 | 계획과 달라진 점 · 확인 못 한 것 |
|---|---|---|---|---|
| T4 | e1de060 | design/reference/layout_v4.html, design/tokens.json | 커밋 전 `git status --short -uall design/` 두 줄, 커밋 후 빈 출력 | 없음 |
| T5 | 0223f53 | SPEC.md (+8/−7) | hunk 5개 모두 39~78행, `타임라인\|React Flow\|노드 색\|빨간` 검색은 148행 "④ 그래프/타임라인 UI" 한 줄만 | 3번 항목이 한 줄 늘어 아래 줄 번호가 1씩 밀림 |
| T3 | 996dd6c | src/assets/fonts/Galmuri11.woff2(504736 B), OFL.txt, SOURCE.md | package.json·lock 변경 없음, OFL·Copyright·2.40.3·40-hex 있음 | `git ls-remote`가 관문에 막혀 커밋 해시는 npm `gitHead` c53c3038e200c5516c84c66cede840ae1c409b2d (GitHub 태그와 대조 안 함). OFL.txt는 패키지 `dist/LICENSE.txt`라 저작권 줄이 `(c)` 표기. 한글 글리프 포함 여부 미확인(T8). npm integrity sha512-eXflXih1AWy2J+jWeT5sGVj4PUCb1bMK7lnwKDKMzEd3lx+F6myuxqp6c0eZlD7EMXOicUYaM+FH7DAoQ7mWbw== |
| T1 | f2260c4 | src-tauri/src/sessions.rs | 구현 전 컴파일 실패(41 오류) → 구현 후 `cargo test` 65 passed | 보고된 종료 코드는 grep 파이프 값(cargo 종료 코드 미확인). 출력문 금지 grep은 첫 매치만 확인. 새 타입 dead_code 경고(T6·T7에서 사용) |
| T2 | 69e2890 | src-tauri/src/screens.rs, lib.rs(mod 한 줄) | 스텁에서 2개 실패 → 구현 후 `cargo test screens::` 5 passed, `cargo build` 0 | 심볼릭 링크 단언이 실제로 돌았는지 미확인(권한 없으면 건너뜀). 경고 3개 내용 미확인 |
