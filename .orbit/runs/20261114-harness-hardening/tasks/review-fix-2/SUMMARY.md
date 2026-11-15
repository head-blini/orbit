SUMMARY review-fix-2 (20261114-harness-hardening)
커밋: 8c1fd59 (harness/skills/orbit/gate/SKILL.md만). kit/gate.mjs, kit/gate.test.mjs는 git 밖. 메시지 파일 RUN_DIR\COMMIT_FIX2.txt.

바꾼 것
- N1 kit/gate.mjs foreignMerge: 검사 전에 cmd 전체에서 `-m`·`-F` 값(따옴표 포함)을 걷어낸다. `-m "x ; orbit/r1" feat`가 막힌다.
- N2 isShip: `rebase <비옵션 인자> main|master`(`rebase orbit/r1 main`)와 `fetch`의 `:main|:refs/heads/main` 대상(`fetch . HEAD:main`)을 브랜치와 상관없이 출고로 판정. `rebase main`, `rebase -i main`, `fetch origin`은 run 브랜치에서 그대로 허용.
- N7 shipRunId의 lookbehind를 `(?<![\w./-])`로 바꿨다. `feat-orbit/r1`, `origin/orbit/r1`은 id로 쳐지지 않아 `pull . feat-orbit/r1`이 차단된다. N6의 코드 쪽도 같다.
- N4 일부: `-F <파일>`과 따옴표 친 `"orbit/<id>"`는 허용. 나머지 과차단(`--message`, `-s`, `-X`, `rebase --continue`에 `-c`·`2>&1`)은 고치지 않았다.
- N5·N6 테스트: `merge orbit/r1 -m x feat`, `feat-orbit/r1`, `origin/orbit/r1` 사례 추가. 새 테스트 3개(N1·N5 / N6·N7 / N2).
- N3·N4·N8 문서(SKILL.md): 셸 공통에 "`disableAllHooks`·`ORBIT_GATE`는 읽기 형태여도 항상 차단(`git log --grep=orbit_gate` 포함)" 추가. 잔여 목록에 닫힌 쪽 과차단 형태와 rebase 면제 4개 목록(넓히면 main의 `rebase --root` 등이 열리는데 잡는 테스트 없음)을 적었다.

검증
- 구현 전: 새 테스트 3개 모두 FAIL (N1·N5, N6·N7, N2 `rebase orbit/r1 main` 0 !== 2).
- 구현 뒤 `node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs`:
```
ℹ tests 46
ℹ pass 46
ℹ fail 0
```
- `node --test harness/hooks/gate.test.mjs` → pass 25, fail 0. `git diff --stat -- harness/hooks .claude` 출력 없음.
- 원본 대비 gate.test.mjs 삭제 줄: `git diff --no-index -U0`로 3줄(유지).
- `claude plugin validate harness` → exit 0 ("Validation passed with warnings": author 없음, LICENSE·icon 디렉터리 항목).

지시와 달라진 점
- N2의 rebase 판정은 정규식이라 `rebase --onto x main`, `rebase -X theirs main`처럼 값 있는 옵션도 출고로 본다(닫힌 쪽 과차단).
- fetch 차단은 회귀가 아니라 새로 추가한 것이다. 원본에서도 열려 있었다.
- Edit 도구가 아닌 Bash 편집 스크립트 한 번은 `\1` 이스케이프 오류로 실패했다. 아무것도 적용되지 않았고 Edit 도구로 다시 했다.

못 한 것
- 새 정규식 변이(예: `-m` 제거를 넓히기, lookbehind를 되돌리기)를 코드에 적용해 테스트가 잡는지 확인하지 못했다.
- 실제 세션 훅·APPLY.md 적용 검증도 못 했다.
