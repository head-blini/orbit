# SUMMARY — K1 (engineer 최종 메시지 그대로)

K1 완료. 커밋 없음(kit은 git 밖).

바뀐 파일: kit\gate.mjs (원본 복사), kit\gate.test.mjs (shipProject/gitIn/advance/rebind 헬퍼, cb 테스트 19개, 범주 1·2 반영). 헬퍼 shipProject·gitIn은 project() 바로 아래에 둬 새 줄만 추가했다.

검증:
```
node --test harness/hooks/gate.test.mjs         -> tests 46, pass 46, fail 0
git diff --no-index --stat harness/hooks/gate.mjs kit/gate.mjs -> 출력 없음
node --test kit/gate.test.mjs                   -> tests 65, pass 46, fail 19
```
실패 19개 = 범주 2 테스트 4개 + cb 15개.
- 범주 2: `머지/푸시는 관문 통과 전까지`(:52), `S2/R11`, `R2: 떼어진 HEAD…`, `BRIEF 기준 5 그대로`
- cb 15개: N1 기준4·5, 6, 7, 8, 9, 10, 태그·ref 보강 / N2-b 12 / N2-a 13 / N2-c 16 / N3 17, 18, 20 / N4 22, 23
- cb 4개(N2-b 기준14, 기준15, N3 기준19, P5)는 옛 gate에서도 통과한다. 모두 허용 대조라 K2 뒤에도 통과해야 하는 회귀 보호다. 범주 1 픽스처 변경은 옛 gate에서 통과한다.

`--unified=0` `-` 줄 표 (원본 줄 | 범주 | 이유):
- 50 open | 1 | merge ALLOW에 COMMIT 필요
- 52 `commit -m "merge notes"` null | 2 | main 위 쓰기 git 차단(N2-b), notEqual null로. run 브랜치 ALLOW는 cb 기준15
- 109 root, 296 ok | 1 | check ship에 commit 줄
- 356, 361 S1 | 1 | merge 0, push 0(HEAD 대조)
- 395 S8 ok | 1 | publish 0
- 424, 425 librarian commit/add | 2 | main에서 0 -> 2
- 470, 478 R1 | 1 | merge 0
- 484 정당한 흐름 | 1 | librarian merge 0
- 490 R2 제목 | 제목 | "떼어진 HEAD(진행 중 rebase 없음)는 main"
- 493 주석 | 2 | R2 주석 문구(계획 표에 없던 줄)
- 494 R2 continue/abort/skip/quit | 2 | 0 -> 2 (N2-c, REBASE_RESUME 삭제)
- 526 R8 | 1 | push 0
- 533 제목 | 제목 | reset --soft는 main에서 N2-b 차단
- 536 reset --soft | 2 | 0 -> 2
- 541 N1·N5 | 1 | merge 0
- 551 N6·N7 quick | 1 | COMMIT 픽스처
- 553 `pull . orbit/r1` | 2 | main에서 pull 차단. R-a대로 `merge orbit/r1`로 대조 유지

PLAN_CHECK 반영: R-a(553 대조 merge), R-b(기준9는 src/b.ts를 바꾸는 커밋), R-c(기준14의 rev-parse는 engineer만), R-e(run 브랜치 `commit -m "add CD workflow"` ALLOW, 기준15), R-f(`config core.fsmonitor "x --list "` BLOCK, 기준23). R-d(`--absolute-git-dir`)는 K2 몫이라 테스트(기준16, 실제 충돌 rebase)가 잡는다.

계획과 달라진 점:
- 기준20의 worktree 브랜치는 `orbit/r1-t1`이다. `orbit/r1`이 있으면 git이 `orbit/r1/t1`을 만들 수 없다. root는 main에 두고 worktree만 run 브랜치로 둬 -C·cd의 위치 판정이 구분되게 했다.
- 기준17의 `$env:GIT_DIR` 사례는 PowerShell 도구 payload(exitP)로 실행한다.
- 기준17에서 merge 사례는 gate 미통과 상태라 옛 gate도 막는다(BRIEF 지정 상태). 구분력은 commit·cherry-pick 사례가 낸다.
- 실행 시간은 약 40초다(각 cb 테스트가 실제 git 저장소를 만든다).

못 한 것: SUMMARY.md 파일 쓰기는 훅이 막아 이 메시지로 대신했다. kit 테스트의 cb 통과 여부는 K2 구현 뒤에야 확인된다.

---
K4: kit\APPLY.md 신규, `grep -n COMMIT` 2줄(:75, :79), `grep -c settings.json` 0. 커밋 없음.
A1: 커밋 885cf98 (qa.md +2, security.md +2, librarian.md +2/−2). grep 3개 일치, `claude plugin validate harness` exit 0(경고: author·LICENSE·ICON, 변경과 무관). 첫 셸 편집 시도가 본문의 merge 문구로 관문에 막혀 Edit 도구로 바꿈.
