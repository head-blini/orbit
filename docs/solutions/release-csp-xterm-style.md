# 배포 CSP가 xterm 런타임 style을 막는다

## 증상
- 배포(번들) 앱의 내장 터미널에서 한글이 "조 사 범 위"처럼 벌어지고, 오른쪽 칸 내용이 본문에 붙고, 표 열과 선택 메뉴가 어긋난다.
- `npm run tauri dev`에서는 보이지 않는다.

## 원인
- 배포 CSP `style-src 'self'`가 xterm DOM 렌더러의 런타임 `<style>`을 막는다. `.xterm-rows`에 monospace 글꼴과 `white-space: pre`가 적용되지 않아 비례폭 글꼴과 공백 접힘이 된다. 버퍼는 정상이고 그리기만 틀린다.
- dev CSP(`devCsp`)에는 `'unsafe-inline'`이 있어 재현되지 않는다.
- Tauri는 style-src에 nonce/hash를 더하고, 그러면 `'unsafe-inline'`은 무시된다.

## 해결
- `style-src 'self' 'unsafe-inline'`으로 바꾸고 `dangerousDisableAssetCspModification`에 `style-src`를 넣는다(`dist/index.html`에 `<style>`이 없어 잃는 것이 없다). script-src 보호는 그대로다.

## 다음에 미리 할 것
- 화면 라이브러리를 더하거나 CSP를 바꿀 때는 dev가 아니라 릴리스 빌드(`npm run tauri build`)로 확인한다. dev와 배포 CSP가 다르다.
- 한글·정렬·선택 메뉴는 번들 앱에서 `.xterm-rows`의 computed `white-space`(pre)와 font-family를 확인한다.
