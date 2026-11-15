RV1 완료. W1, W2, W3만 반영했다.

바꾼 파일:
- C:\Users\lclk1\Projects\orbit\src-tauri\src\roadmap.rs
  - W1: canonicalize 범위 검사와 열린 핸들 재확인 위에 "왜" 한 줄 주석을 넣었다. 코드 구조는 그대로다.
  - W2: `parse_long_line_is_skipped`에 정확히 MAX_LINE바이트인 줄 단언을 추가했다. 줄 길이가 MAX_LINE이고, 항목 2개가 남고, skipped가 false임을 확인한다.
- C:\Users\lclk1\Projects\orbit\src\App.tsx
  - W3: `.tb-srv` 요소에 `title={serverText}`를 추가했다.

커밋: 3a45ced16382416dde7dcaaada6518aa6c7d95ad (브랜치 orbit/20261114-roadmap-panel)

검증:
```
cargo test (src-tauri): exit 0
test result: ok. 100 passed; 0 failed (나머지 두 묶음은 0개)
npm.cmd run build: exit 0 (✓ built in 170ms)
```
```
git show --stat HEAD
 src-tauri/src/roadmap.rs | 7 +++++++
 src/App.tsx              | 2 +-
 2 files changed, 8 insertions(+), 1 deletion(-)
```

계획과 달라진 점: 없다.
- W2 테스트를 먼저 실패시켜 보지는 않았다. 기존 동작을 고정하는 경계 단언이라 처음부터 통과한다.
- W3의 title은 브라우저나 앱에서 직접 확인하지 못했다. 빌드 통과까지만 봤다.
- CRLF 변환 경고가 떴지만 내용에는 영향이 없다.
