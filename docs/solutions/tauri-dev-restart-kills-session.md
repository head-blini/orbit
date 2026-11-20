# `npm run tauri dev` 창 안에서 Claude 세션을 돌리면 세션이 끊긴다

## 증상
작업 중 Claude 세션과 서브에이전트가 갑자기 끊기고 앱이 다시 뜬다.

## 원인
`npm run tauri dev`로 띄운 Orbit 창의 내장 터미널에서 Claude 세션을 돌리면, 그 세션이 Rust 파일(`src-tauri/`)을 고칠 때마다 dev 서버가 앱을 다시 빌드·재시작한다. 앱이 죽으면 그 안의 PTY와 자식 프로세스(세션, 서브에이전트)도 같이 끝난다.

## 해결
Rust 코드를 바꾸는 run은 Orbit 창 밖의 별도 터미널에서 Claude 세션을 돌린다. 앱 확인은 변경이 끝난 뒤 따로 `npm run tauri dev`로 띄운다.

## 다음에 미리 할 것
- Rust를 건드리는 run을 시작할 때 세션이 어디서 도는지 확인한다. dev 앱 안이면 밖으로 옮기라고 사용자에게 알린다.
- 프론트(`src/`)만 바뀌는 run은 핫 리로드라 영향이 작다.
