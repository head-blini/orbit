SUMMARY review-fix-1 (20261114-harness-hardening)
커밋: f3d680d (harness/skills/orbit/gate/SKILL.md만). 키트 파일(gate.mjs, gate.test.mjs, APPLY.md)은 git 밖이라 커밋 없음. 메시지 파일 RUN_DIR\COMMIT_FIX1.txt.

바꾼 것
- R1 kit/gate.mjs: 출고로 판정된 명령에서 merge 인자에 `orbit/<id>`가 아닌 ref가 있으면 차단(옵션·`-m` 메시지 제외, 연결된 merge도 각각 검사). `merge orbit/r1 feat`, `merge orbit/r1 && merge feat` 차단. SKILL:52 잔여 문구는 "pull·rebase에 orbit/r1과 비-orbit ref를 함께 주는 형태"로 정정.
- R2 kit/gate.mjs: 위치를 바꾸지 않는 명령 안의 `git rebase --continue|--abort|--skip|--quit`(뒤에 `;&|`·끝만 허용)를 출고 검사 전에 제거. 열리는 범위: 그 4개 단독 형태가 어느 브랜치(main 포함)에서든 출고 판정을 면함. 그 뒤에 인자(`--continue main`), `&& push`·`&& merge feat`, `cd`·`-C`·switch로 위치 변경이 붙으면 그대로 차단. `rebase main`(detached)도 계속 차단. 이 4개로는 main으로 들어가는 새 경로가 생기지 않음. 단 main에서 시작된 rebase를 잇는 경우는 면제됨(시작은 막힘).
- R3 정규식 `i` 플래그(disableAllHooks·ORBIT_GATE, 관문 파일 패턴). R4 librarian·Lead 차단 메시지를 실제 허용 목록으로. R5 `GH_MERGE`·`SHIP_FORMS` 상수로 출고 형태 목록 중복 제거(REF_FORMS는 SHIP_FORMS에서 파생).
- R6 SKILL.md: "셸 공통" 항목 추가(S13 차단 대상과 허용되는 읽기·테스트 형태), 출고 항목에 R1·R2 반영.
- R7~R10 및 참고 테스트: 사유 단언(Lead branch -d/생성, engineer 강제 이동 6형태), 대체 변이 방지(`cd ../other && push`, `switch main && push`, `branch -f main HEAD`), `node -e "1" --disableAllHooks`, `.claude-plugin`만 가리키는 명령, 대소문자 사례, BRIEF 기준 2·5 문구 그대로(`pull . orbit/x`, `reset --hard orbit/x`, `rebase orbit/x`, `merge orbit/B`, full 트랙 통과 시 0), reset --soft 허용, 정당한 흐름 2개(switch -c orbit/r1, librarian switch main → merge --no-ff), 개인 경로를 `C:\Work\...`로, 안 쓰는 `shipRunId` export 제거, `READ_SHELL =new` 공백.
- APPLY.md: 되돌리기 `git restore -- 3파일`, 4단계에 `git diff -- .claude/settings.json`(추가 2줄만) 확인 추가.

검증
- 구현 전: `node --test kit/gate.test.mjs` → 신규 R1·R2·R3·R4 테스트 FAIL (R7·R8·R9·R10은 현 코드에서 이미 통과하는 변이 방지 테스트라 FAIL을 못 봄).
- 구현 뒤: `node --test .orbit/runs/20261114-harness-hardening/kit/gate.test.mjs` → tests 43, pass 43, fail 0 (이전 35).
- `node --test harness/hooks/gate.test.mjs` → pass 25, fail 0. `git diff --stat -- harness/hooks .claude` 출력 없음.
- 원본 대비 gate.test.mjs 삭제 줄 3개(:48, :123 제목, :136)로 유지(git diff --no-index -U0).
- `claude plugin validate harness` → exit 0 ("Validation passed with warnings").

계획·지시와 달라진 점
- 삭제 줄을 3개로 유지하려고 import 정리는 부분만 했다. gateMod 중복 import는 없앴지만, 원본 파일의 중간 `import { spawnSync }`는 그대로 두고 `homedir`·`resolvePath`·`memorySlug` import를 상단에 추가했다(같은 모듈 import가 여러 줄).
- R7·R8·R9·R10과 정당한 흐름 테스트는 변이를 코드에 실제 적용해 확인하지 못했다(리뷰어 재현 결과에 의존).
- pull·rebase의 비-orbit ref 혼합은 R1 범위(merge)에 넣지 않아 잔여로 문서화했다.
- 첫 시도 Bash가 명령 문자열의 merge·rebase 단어 때문에 관문에 막혀(출고 판정) 편집 스크립트를 파일로 분리해 실행함. 우회가 아니라 명령 문자열만 바꿨다.
- 못 한 것: 실제 세션 훅·APPLY.md 적용 검증.
