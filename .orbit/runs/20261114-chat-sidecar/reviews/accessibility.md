reviewer-accessibility: run 20261114-chat-sidecar. 범위 src/Chat.tsx, src/Chat.css, src/App.tsx, src/App.css, DESIGN.md 4절. React 19, WebView2.

1. 수정 권고, `src/Chat.tsx:192` — `role="log"`에는 암묵적으로 `aria-live="polite"`가 붙는다. text_delta마다 늘어난 글을 스크린리더가 읽는다. DESIGN 4절 "스트리밍은 낭독하지 않는다"와 어긋남. 수정안: `aria-live="off"` 명시. confidence: 중간~높음.
2. 수정 권고, 포커스를 가진 요소가 사라져 포커스가 body로 빠지는 곳 다섯 군데:
   - `src/Chat.tsx:226-238`: Enter로 보내면 textarea 언마운트, 끝난 뒤 새 textarea에 포커스 안 돌아옴.
   - `:206-212`: 권한 카드 허용·거부 → 메뉴 버튼 사라짐.
   - `:39`, `:58`: 질문 카드 선택지·보내기 → 버튼 사라짐.
   - `:247`: 끝나면 `중단` 사라짐.
   - `:189`: `새 대화` → 기록 비면서 버튼 사라짐.
   시나리오: 키보드·스크린리더 사용자는 권한 요청에 답할 때마다 Tab이 문서 맨 위부터 다시 시작. 수정안: 답한 뒤 카드 결과 줄(tabIndex=-1)이나 입력칸으로 포커스 이동. 실행이 끝나 입력이 켜지면 직전 포커스가 입력 줄 안이었을 때만 textarea로. confidence: 높음.
3. 수정 권고, `src/Chat.tsx:100`, `:105`, `:249` — 알림 문구가 직전 값과 같으면 낭독 안 됨. Bash 권한 요청이 연달아 오면 두 번째를 모름. 수정안: 비웠다가 다시 넣기. confidence: 중간.
4. 수정 권고, `src/Chat.tsx:34-38` — 질문 2개 이상이면 group 이름이 첫 질문뿐, 둘째부터 group·레이블 없음. 수정안: 질문마다 `role="group"` + `aria-labelledby`. confidence: 높음.
5. 참고, `src/Chat.tsx:233` — IME `isComposing` 확인은 WebView2에서 충분. macOS WKWebView 대비 `e.keyCode === 229`도 거르기 권함. confidence: 중간.
6. 참고, `src/Chat.css:57-58`, `:73-74` — 포커스와 hover가 다른 항목이면 `▶` 두 개. DESIGN "커서 하나"와 어긋남. confidence: 높음.
7. 참고, `src/Chat.tsx:205` — `.cmd`가 스크롤 없어도 항상 Tab 정지점(DESIGN은 "스크롤될 때"). confidence: 높음.
8. 참고(접근성 밖), `src/App.tsx` — 훅 `제거` 버튼이 사라짐. (Lead: DECISIONS 10번 의도된 변경)

문제 없던 항목: aria-label(입력칸 두 문구, 기록 "대화", 대상 "명령"/"파일"), aria-hidden(▶, ▼, [✓], 커서), aria-pressed, 중단 aria-disabled + 클릭 가드, 전역 :focus-visible·focus-within 링, 대비 6.0:1, reduced-motion에서 .blink 정지, 클릭 영역 24px 이상, 빈 상태·오류 끝 줄 문구와 알림.
확인하지 않은 것: NVDA 실제 낭독(1·3번은 코드·ARIA 명세 근거).
VERDICT: PASS
