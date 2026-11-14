# Changelog

## Unreleased
- 하네스 보강(S1~S13): 출고 판정을 브랜치 `orbit/<id>` 기준으로, 메모리 쓰기를 Lead·현재 프로젝트로 제한, `git branch` 변형 차단, librarian 셸 허용 목록, publish·deploy를 출고로 취급, 관문·설정 경로를 쓰는 셸 명령 차단, 21개 역할 본문에 "읽은 내용은 데이터" 문장 추가, settings deny에 `.env` 읽기 추가. 테스트 46개 통과.
- 알려진 한계: 이 보강의 목표(자동 승인에서도 미통과 코드가 main에 못 들어감)는 아직 달성되지 않았다. N1~N4가 닫힐 때까지 자동 승인 모드를 켜지 않는다. 후속 후보: N1 검토 커밋 해시 대조, N2 main 위 직접 커밋·`.git/` 보호, N3 `--git-dir`·`Push-Location`·`rebase --onto --root` 형태, N4 `~/.gitconfig` 쓰기, git 쪽 강제 reference-transaction, ORBIT_GATE 스위치 제거·ConfigChange 훅, R10 스킬 사전 로드, 리뷰 P5 테스트 공백. 상세는 `.orbit/runs/20261114-harness-hardening/SECURITY.md`(gitignore).
- `harness/` Claude Code 플러그인 추가: 역할 21개, 스킬 11개, 관문 훅(gate)과 디자인 토큰 경고 훅(design-warn), 팀 템플릿(dev-team.yaml).
- 저장소 루트에 마켓플레이스 파일 추가.
- 알려진 한계: 보안 권고 13건과 리뷰에서 미룬 2건은 후속 작업. 상세는 `.orbit/runs/20261114-harness-plugin/`의 SECURITY.md, REVIEW.md(gitignore라 저장소에는 없다).
