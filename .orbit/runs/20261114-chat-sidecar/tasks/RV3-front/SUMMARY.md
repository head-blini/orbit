RV3-front 완료. 커밋 6007f52 (orbit/20261114-chat-sidecar).
바꾼 파일: src/App.css (.panel에 position: relative), src/Chat.tsx.
- 종료 문구 3곳을 "(연결 끊김)" / "Claude와 연결이 끊겼습니다"로 바꿈. finish()의 두 번째 인자(기록 텍스트)도 같이 바꿈.
- endRef div에 style={{ marginTop: -8 }}를 줘서 gap 8px 상쇄. 자동 스크롤은 그대로.
검증:
```
npm.cmd run build -> 종료 0, "✓ built in 189ms"
grep 사이드카 src/*.tsx ->
src/Chat.tsx:15: ...// 화면 id: 사이드카가 다시 떠도 겹치지 않게
src/Chat.tsx:80: ...// 대화(사이드카 프로세스)마다 올린다
(주석 2곳만 남음, JSX 문자열 없음)
```
못 한 것: 앱 실행으로 11px 간격·페이지 스크롤 막대 해소 확인. marginTop -8은 gap 8px에 묶임.
