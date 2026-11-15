K2 완료 (커밋 없음, kit는 git 밖).

바꾼 파일
- C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-harness-hardening\kit\gate.mjs (S5·S7·S10·S11·S2/R11·S13, 머리 주석 5·8행)
- C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-harness-hardening\kit\gate.test.mjs (새 테스트 6개: S5, S2/R11, S13, S7, S10, S11, 그리고 :136 변경)

검증 (K1 결과 29 + 6 = 35, 계획의 "+4"를 충족)
```
$ node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs   (구현 전, tap)
not ok 10 - SECURITY.md 6) 우회 재현 22사례: 22 BLOCK (S13 이후)   <- :136 의도적 변경
not ok 30 S5 / 31 S2/R11 / 32 S13 / 33 S7 / 34 S10 / 35 S11
# tests 35  # pass 28  # fail 7   (새 테스트와 :136만 fail, 기존 통과)
$ 같은 명령 (구현 후)
# tests 35  # pass 35  # fail 0
$ grep -n "FREE_SHELL =" kit/gate.mjs
29:const FREE_SHELL = ['engineer', 'debugger', 'devops', 'qa', 'security', 'reviewer-correctness', 'reviewer-tests', 'data'];   (librarian 없음)
$ node --test harness/hooks/gate.test.mjs     -> pass 25, fail 0 (원본 무변경)
$ git diff --stat -- harness/hooks            -> (출력 없음)
$ git diff --no-index -U0 harness/hooks/gate.test.mjs kit/gate.test.mjs | grep "^-[^-]"
-  assert.equal(decide(bash('git merge feat', 'agent-1'), open), null);        (:48, K1에서 변경)
-test('SECURITY.md 6) 우회 재현 22사례: 21 BLOCK + 1 ALLOW(미룸 H1)', () => {    (:123 제목)
-    ['qa Bash write hooks (미룸 H1)', ..., 'ALLOW'],                             (:136)
```
`git diff --no-index --stat`: 126 insertions(+), 3 deletions(-). 삭제 3줄은 :48과 :136 두 의도적 변경이고, :123은 :136에 맞춘 제목 문구다(사례 수 22 유지, 21 BLOCK + 1 ALLOW가 22 BLOCK이 됨).

구현 요지
- `export memorySlug`는 영숫자 외 문자를 `-`로 바꾸고 200자를 넘으면 null을 돌려준다. 메모리 분기는 Lead이고 `canon(join(homedir(),'.claude','projects',slug,'memory'))` 안일 때만 허용한다. 그 밖은 사유를 돌려준다.
- S7은 보호 경로에 `.claude.json`, `.git/hooks/`, `.git/config`를 더했다. S10은 `.orbit/wt/`를 CODERS만 쓸 수 있게 했다. S11은 값 20개 + ` 외 N개`다.
- `LIBRARIAN_SHELL`을 새로 두고 librarian을 FREE_SHELL에서 뺐다.
- S13은 Bash/PowerShell 분기의 마지막에 둔다. `disableAllHooks|ORBIT_GATE`는 항상 차단한다. 관문·설정 파일 문자열은 `INSPECT_SHELL`(git status/log/diff/show, `node --test` 경로만, `node SELF check`, grep/cat/Get-Content/Select-String)에 해당하지 않으면 차단한다.

계획과 달라진 점
- :123 테스트 제목 문구를 바꿨다(위 설명).
- S5·S7·S10 테스트는 `spawnGate`로 훅을 실제 실행해 exit 2/0을 단언한다. S5는 실제 `homedir()` 아래 경로를 쓴다(파일은 만들지 않음).
- S5 테스트는 `memorySlug`를 `import * as`로 가져온다. 구현 전에도 파일이 로드되어 새 테스트만 실패한다.
- 차단 메시지 문구는 계획에 없던 것이라 새로 썼다.

못 한 것
- 실제 Claude Code 세션에서의 S5 슬러그 동작(비ASCII, worktree 등)은 확인하지 못했다. 단위 테스트만 했다.
- S13은 문자열 검사라 우회 가능하다(PLAN에 적힌 한계).
