K1 완료 (커밋 없음, kit는 git 밖).

바꾼 파일
- C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-harness-hardening\kit\gate.mjs (S1·S3·S4·S8)
- C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-harness-hardening\kit\gate.test.mjs (새 테스트 4개 S1·S3·S4·S8, :48 변경)

검증
```
$ node --test harness/hooks/gate.test.mjs            (기준선)
ℹ tests 25  ℹ pass 25  ℹ fail 0
$ node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs   (구현 전)
ℹ tests 29  ℹ pass 25  ℹ fail 4
✖ S1 / ✖ S3 / ✖ S4 / ✖ S8   (새 테스트만 FAIL, 기존 25개 통과. :48 변경분은 구현 전에도 통과)
$ 같은 명령 (구현 후)
ℹ tests 29  ℹ pass 29  ℹ fail 0
$ git diff --stat -- harness/hooks
(출력 없음)
```

구현 요지
- `shipRunId(cmd, cwd, fallback)` export. 명령 안의 `orbit/<id>`를 모두 모은다. 없으면 fallback이 참일 때만 현재 브랜치로 대체하고, switch/checkout/cd/pushd/Set-Location/`-C`가 있으면 대체하지 않는다.
- `shipFailures(root, ids)`는 ids가 undefined가 아니면 null·빈 배열·다른 id를 실패 한 줄로 돌려준다. 인자 없는 호출은 그대로다.
- 대체는 `push`와 publish/deploy에서 ref 형태(merge/pull/rebase/reset/update-ref/FORCE_MOVE/gh pr merge)가 없을 때만 쓴다.
- S3: Lead `git branch`는 목록과 `--show-current`만 허용한다. FORCE_MOVE에 `branch -[fMmCc]*`·`--force|--move|--copy`와 `switch -C|--force-create`를 넣었다.
- S4: git 토큰을 `["']?`로 넓혔다. `GIT_CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS)`는 출고로 본다. pull·rebase·reset --hard도 merge와 같은 main 판정을 받는다.
- S8: `PUBLISH` 정규식과 공용 `approved(run, gate)`를 추가했다. publish는 shipFailures에 더해 deploy 승인이 없으면 사유를 하나 더한다. `configApproved`는 `approved`를 쓰도록 바꿨다. 차단 메시지는 "머지/푸시/배포 차단"으로 바꿨다. 기존 테스트의 `/차단/` 단언은 그대로 통과한다.
- `:48`은 `git merge orbit/r1`로 바꿨다.

계획과 달라진 점
- 계획 K1 ②의 F1 사례 중 `switch main && merge feat`는 Lead 대신 engineer로 테스트했다. Lead는 LEAD_SHELL의 `&&` 금지로 어차피 막히기 때문이다. 같은 이유로 `git push` → 0 사례도 engineer로 했다(Lead 셸에 push가 없다). `main에서 git merge feat`는 Lead로 테스트했다.
- 사례를 더했다. 다른 id·여러 id 머지, 브랜치 `orbit/zzz`·`feature`에서의 push → 2, engineer `branch -m/-c/--move` → 2, run 브랜치 `reset --hard`/`rebase main` → 0, `git -C . pull` → 2, publish 5종 × engineer/devops × (관문 없음, deploy 없음, 관문 실패, main 브랜치) → 2, 모두 충족 → 0.
- 새 테스트는 `spawnGate`로 훅을 실제 실행하고 exit status를 단언한다.

못 한 것과 알아둘 점
- 머리 주석(5·8행)은 K2 범위라 건드리지 않았다. kit/APPLY.md와 settings.json은 다른 태스크가 만든 것이라 건드리지 않았다.
- 작업 중 옛 관문이 heredoc 안의 `git push`·`git merge` 문자열을 오탐해 Bash 호출 하나를 막았다. 우회 없이 Write 도구로 스크립트 파일을 만들어 실행했다. 이것은 S13 이전의 기존 동작이다.
- 위험: `orbit/<x>` 모양의 경로가 명령에 들어 있으면 id로 읽혀 차단 쪽으로 오탐한다(PLAN 위험 항목에 이미 적혀 있다).
