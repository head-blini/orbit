D1 완료.
바꾼 파일: design/reference/layout_v4.html, design/tokens.json (내용 변경 없이 커밋만)
커밋: 2075c30 (브랜치 orbit/20261114-roadmap-panel)

검증:
```
$ git status --short design/   (커밋 전)
 M design/reference/layout_v4.html
 M design/tokens.json
$ git status --short design/   (커밋 후)
(빈 출력)
$ git show --stat --format=%h HEAD
2075c30
 design/reference/layout_v4.html | 95 +++++++++++++++++++----------------------
 design/tokens.json              | 12 ++++++
 2 files changed, 56 insertions(+), 51 deletions(-)
```
커밋 메시지 파일: .orbit/runs/20261114-roadmap-panel/tasks/D1/COMMIT_MSG.txt (Co-Authored-By 줄 포함).
계획과 달라진 점: 없음. 경로 지정 커밋이라 다른 engineer의 파일은 포함되지 않았다.
