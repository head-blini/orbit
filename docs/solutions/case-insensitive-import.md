# Flow.tsx와 flow.ts 공존 시 import 모호 (run 20261120-flow-panel)

## 증상
컴포넌트 `Flow.tsx`와 로직 `flow.ts`가 같이 있을 때, 확장자 없는 `import ... from "./flow"`가 어느 파일을 가리키는지 환경마다 달랐다.

## 원인
macOS·Windows 파일 시스템은 대소문자를 구분하지 않아 `Flow`와 `flow`가 같은 이름으로 해석된다. 확장자 없는 import는 `.ts`·`.tsx` 후보 중 모호해진다.

## 해결
확장자를 포함해 import한다(`./flow.ts`, `./Flow.tsx`).

## 다음에 미리 할 것
- 이름이 대소문자만 다른 파일 쌍을 새로 만들지 않는다. 불가피하면 확장자 포함 import를 쓴다.
- 대소문자를 구분하는 CI·리눅스에서도 `npm run build`로 확인한다.
