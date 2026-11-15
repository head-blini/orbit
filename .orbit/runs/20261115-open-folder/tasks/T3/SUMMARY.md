T3 완료 (RUN 20261115-open-folder, 브랜치 orbit/20261115-open-folder)

바꾼 파일
- ROADMAP.md: "미뤄 둔 작업" 맨 아래(`- [ ] 맥용 앱 빌드` 다음)에 `- [ ] 폴더 열기: 처음 쓰는 폴더에서 채팅 시작` 한 줄 추가

커밋 해시
- 2c3db153559551409252857bf669eb023df3a9a3 (docs: add open-folder item to roadmap)
- git add ROADMAP.md 로만 올렸다. 커밋 메시지는 -F 파일(scratchpad)로 썼고 Co-Authored-By 줄을 넣었다.

실행한 검증 명령과 출력
$ git diff main -- ROADMAP.md
@@ -19,3 +19,4 @@
 - [ ] Product 서비스 평가 모드
 - [ ] 하네스 파일 등급 나누기
 - [ ] 맥용 앱 빌드
+- [ ] 폴더 열기: 처음 쓰는 폴더에서 채팅 시작

$ git diff main -- ROADMAP.md | grep -c '^+[^+]'
1

$ git log -1 --stat
1 file changed, 1 insertion(+)

계획과 달라진 점
- 없음. 추가 줄은 PLAN T3 문구와 같다.
- 다른 파일(T1·T2 영역 포함)은 건드리지 않았다. 스테이징 충돌·index.lock 문제는 없었다.
- push, main 머지, [x] 처리는 하지 않았다(PLAN대로 머지 커밋에서 처리).
- 이 태스크는 문서 변경이라 TDD 대상이 아니다. 별도 테스트는 돌리지 않았다.
