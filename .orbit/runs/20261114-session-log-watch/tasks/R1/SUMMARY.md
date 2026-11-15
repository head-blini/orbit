R1 완료. 커밋 83cc9fa (브랜치 orbit/20261114-session-log-watch).

바꾼 파일: src-tauri/src/watch.rs, src-tauri/src/sessions.rs, src/App.tsx

지적별 처리:
- W1 (watch.rs): read_new가 consume 전후 offset을 비교한다. 전진했으면 같은 poll 안에서 계속 읽고, 전진이 없으면(빈 읽기·미완결 꼬리) 종료한다. 버퍼는 매 회 clear하고 16 MiB+1 읽기로 제한되어 한 번에 쥐는 양이 그 이하다. `\n` 없는 꼬리는 다음 읽기에서 offset이 안 움직여 끝나므로 무한 루프가 없다. consume의 bool 반환값은 이제 쓰이지 않는다(시그니처는 그대로 둠).
- W2: found를 HashSet<&PathBuf>로 만들어 retain.
- W3: 키 문자열을 한 번 만들고 rfind로 찾는다.
- W4: `format!("{phase}:{id}")`.
- W5: 테스트 k(10 MiB 줄 3개를 poll 한 번에 3건)와 l(상한 초과 유효 JSON 줄, 숫자만으로 된 상한 초과 줄, 숫자만으로 된 자라는 꼬리는 0건이고 이어지는 `{"ok":true}`만 1건)을 추가했다.
- W6: events가 빈 배열이면 "기록 없음" 문구를 보인다.
- W8: Event 타입을 ToolEvent로 바꿨다.

테스트 먼저 실행한 결과(수정 전):
- k: FAIL (left 1, right 3). 16 MiB 덩어리 경계에서 poll이 끝나는 W1이 재현됐다.
- l: 수정 전에도 통과. 상한 검사가 이미 동작하고 있었고, 이 테스트는 상한 검사를 지키는 회귀 방지용이다. 다만 상한 검사를 코드에서 빼면 실패하는지는 직접 시험하지 않았다.

검증:
```
cargo test (src-tauri): test result: ok. 54 passed; 0 failed (나머지 두 묶음 0 passed), 종료 코드 0
npm run build: built in 91ms, 종료 코드 0
```
비테스트 코드에 unwrap·expect·출력문·[ ] 인덱싱을 새로 넣지 않았다. 테스트는 임시 폴더만 쓰고 앱은 띄우지 않았다.

계획과 달라진 점: 없음. W7과 참고 항목은 하지 않았다. 브라우저에서 "기록 없음" 화면은 직접 보지 못했다(npm run build의 타입 검사만 통과). 테스트 k·l은 각각 약 30~50 MiB를 쓰며 전체 테스트는 0.34초에 끝났다.
