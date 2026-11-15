T1 완료. ROADMAP.md를 만들고 커밋했다. 임시 테스트로 기대 값 (3, 14, 5, false)을 확인했고 roadmap.rs는 되돌렸다.

바꾼 파일: C:/Users/lclk1/Projects/orbit/ROADMAP.md (새 파일, 이것만 커밋)
커밋: 68de7b6 "docs: add ROADMAP.md for the roadmap panel" (브랜치 orbit/20261114-roadmap-file, 메시지는 -F 파일로 작성)

검증:
```
임시 tmp_repo_roadmap 추가 후 (cd src-tauri; cargo test tmp_repo_roadmap)
 -> test result: ok. 1 passed; 0 failed   # (묶음 3, 항목 14, 완료 5, skipped=false) 단언 통과
되돌림 후: git status --short -> "?? ROADMAP.md" 한 줄, git diff 비어 있음 (커밋 후 status 깨끗)
cargo test roadmap -> test result: ok. 11 passed; 0 failed (기존 roadmap 테스트 11개, tmp 이름 없음)
```

계획과 달라진 점:
- Lead 조정대로 "자동화 에이전트는 최소 권한 + 샌드박스로 실행" 줄을 뺐다. 항목은 14개다. 그 밖의 문안은 PLAN 그대로다("맥용 앱 빌드" 포함, ④는 "그래프 UI").
- 관문 훅이 `git restore -- src-tauri/src/roadmap.rs`를 막았다. 사유는 "[orbit gate] main/master 위에서는 git 읽기·다른 브랜치로 가기·관문을 통과한 merge만 허용 (N2-b): restore"였다. 우회하지 않고 편집으로 임시 테스트를 지웠고 `git diff`가 비었음을 확인했다.
- 커밋 때 "LF will be replaced by CRLF" 경고가 떴다(autocrlf). 파서는 CRLF를 처리하므로 무해하다.
- 위 훅 사유에는 "main/master 위에서는"이라고 되어 있다. 이 체크아웃은 run 브랜치인데도 막혔으니, 관문이 브랜치를 잘못 판정하는지 Lead가 확인하는 게 좋겠다.
- 검증하지 못한 것: 앱 화면에서 `5 / 14` 표시(qa 몫, npm run tauri dev).

ROADMAP.md 전체 내용:
```
# 오르빗 로드맵

## 1단계: 관찰 · 실행
- [x] ① 앱 뼈대 + 빈 화면
- [x] ② 훅 서버 + 설치 도우미
- [x] ③ 로그 감시
- [x] ④ 그래프 UI
- [x] ⑤ 로드맵 패널 + 노드 이름
- [ ] ⑥ 프롬프트 입력창 + Agent SDK 사이드카 + UI 권한 승인

## 2단계: 설계 · 자동화
- [ ] 그래프 편집: 노드 추가·연결, 노드별 모델·재시도·스키마
- [ ] 루프 설정: 종료 조건, 최대 반복, 예산 상한, 실패 알림
- [ ] 그래프 이름 붙여 저장 · 재사용
- [ ] 그래프 → Dynamic Workflow / 헤드리스 실행 변환, 스케줄 실행

## 미뤄 둔 작업
- [ ] DB(orbit.db) 도입 (별도 run)
- [ ] Product 서비스 평가 모드
- [ ] 하네스 파일 등급 나누기
- [ ] 맥용 앱 빌드
```
