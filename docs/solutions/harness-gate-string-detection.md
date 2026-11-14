# 관문의 문자열 검사는 끝이 없다

- 증상: 출고(main 머지·push) 감지를 고칠 때마다 리뷰·보안 회차에서 새 우회가 나왔다. 따옴표 친 `"git"`, 붙여 쓴 `-m"…"`, `--git-dir`, `GIT_DIR`, `Push-Location`, `rebase --onto X --root main`, main 위 `cherry-pick`·`commit` 등.
- 원인: gate는 명령 문자열을 정규식으로 보는 1차 감지다. 의미가 다른 정상 옵션과 문자열 변형을 모두 잡을 수 없다. 또 "관문 통과"가 run 단위라서 그 브랜치에 지금 있는 커밋이 검토받은 커밋인지는 보지 않는다(N1).
- 해결: 이번 run은 S1~S13 중 9개를 닫고 4개를 부분으로 남겼다. 남은 우회는 `harness/skills/orbit/gate/SKILL.md`에 적었다. 3회차부터는 코드로 더 쫓지 않고 문서화했다.
- 다음에 미리 할 것: 우회가 문자열 변형이면 정규식을 늘리지 말고 git 쪽 강제(reference-transaction)와 검토 커밋 해시 대조로 간다. gate.mjs·gate.test.mjs는 에이전트가 못 고치므로 키트(`kit/`)로 만들고 사람이 적용하게 일정에 넣는다. 테스트가 늘 때 기존 테스트의 지워진 줄을 diff로 확인한다.
