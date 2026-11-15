# REVIEW — 20261114-harness-plugin (1회차)

리뷰어 4명(correctness, tests, maintainability, rules — 모두 sonnet)의 최종 메시지를 Lead가 병합. 대상: `git diff main...HEAD`(커밋 11개)와 `cutover/` 전환 키트.

## 계획 준수 (correctness, rules)
- T1~T9 산출물 모두 있음, 계획에 없는 파일 없음. 에이전트 21개, `name`이 gate의 역할 이름과 일치. 플러그인·마켓플레이스 이름과 경로가 plugin.json·marketplace.json·settings.step1/2에서 일치. 테스트 17/17 통과(두 리뷰어가 각각 실행).
- HARNESS.md 4절 역할 전부 있음, 승인된 차이 외에 권한이 넓어진 역할 없음, 관문 약화 없음, 외부 스킬은 승인된 3개뿐.
- 편차(승인됨): settings.step2.json에 `agent` 키 없음 — 사용자 결정(CLAUDE.md 방식).

## 차단
| # | 위치 | 문제 | 시나리오 | 리뷰어 · confidence |
|---|---|---|---|---|
| B1 | harness/hooks/gate.mjs:31-39, :198, :202, :206 | 산출물 소유자 표(`OWNERS`) 정규식에 `i` 플래그가 없다. NTFS는 대소문자를 구분하지 않는데, 아직 없는 파일은 경로 정규화가 대소문자를 바로잡지 못한다 | engineer가 `.orbit/runs/r1/Review.md`를 `VERDICT: PASS`로 쓰면 허용(재현, exit 0). NTFS에서 그 파일이 곧 `REVIEW.md`라 리뷰 관문이 통과한다. PLAN_CHECK·VERIFY·SECURITY·STATE.json·current·profile.json도 같다 | correctness · 중간(허용 동작 재현, NTFS 효과는 코드 확인) |

## 수정 권고
| # | 위치 | 문제 | 리뷰어 · confidence |
|---|---|---|---|
| R1 | cutover/settings.step2.json, CLAUDE.step2.md | 전환 2단계가 settings의 PreToolUse 훅을 지우고 플러그인 훅에만 맡긴다. 플러그인이 로드되지 않으면 관문이 통째로 꺼진다(fail-open). 막는 장치는 CLAUDE.md의 문장뿐 | rules · 중간 |
| R2 | gate.mjs:123 FORCE_MOVE | `branch -f`/`switch -C`/`checkout -B` 분기를 꺼도 테스트 통과. 사례가 Lead 기준이라 다른 규칙이 먼저 막는다. `checkout -B` 사례 없음 → engineer의 `git branch -f main HEAD`를 잡는 테스트가 없다 | tests · 높음(변이 재현) |
| R3 | gate.mjs:79-81 config 승인 | `gate === 'config'`나 `result === 'approved'` 검사를 지워도 통과. 거절된 승인·다른 관문의 승인 사례가 없다 | tests · 높음 |
| R4 | gate.mjs:245-255 CLI 종료 코드 | 실패 시 exit 1을 0으로 바꿔도 통과. run 없음, 모르는 관문(64) 미검증 | tests · 높음 |
| R5 | gate.mjs:283-287 훅 모드 | 해석 불가 입력의 차단을 꺼도 통과. 훅을 프로세스로 띄우는 테스트 없음(exit 2·stderr, `ORBIT_GATE=off`, 빈 stdin) | tests · 높음 |
| R6 | gate.mjs:206-209 `.orbit/current` 내용 검사 | 검사를 지워도 통과(읽는 쪽이 한 번 더 거름) | tests · 높음 |
| R7 | gate.mjs:259 design-warn | `#fff` vs `#ffffff` 한계가 주석만 있고 테스트 없음. 오류 경로(JSON 아님, 파일 없음) 미검증 | tests · 높음 |
| R8 | harness/agents/lead.md:15 vs gate.mjs:106, gate/SKILL.md:44 | Lead 허용 명령 목록 불일치: lead.md는 `status\|log\|diff\|show\|branch`만, 훅과 gate 스킬은 `switch`·`merge`·`worktree list`도 허용. router는 `git switch -c`에 의존 | maintainability · 높음 |
| R9 | gate.mjs:24 와 :19-23 | 트랙 목록이 `TRACKS`와 `SHIP` 키로 두 번 정의 | maintainability · 높음 |
| R10 | harness/agents/*.md 약 17곳 + handoff/SKILL.md:28 | "최종 메시지 30줄", 리뷰어 지적 형식 문단이 복붙. 스킬 하나(`orbit:report-format`)로 모으자는 제안 | maintainability · 높음 |
| R11 | gate.mjs FREE_SHELL (reviewer-correctness, reviewer-tests, data, qa, security) | 읽기 전용이어야 할 역할이 셸로는 쓸 수 있다. 옛 gate도 같아 약화는 아니고 PLAN H1 "미룸" | rules · 높음(사실) |

## 참고
- gate.mjs:191의 차단 메시지가 아직 "사람이 ORBIT_GATE=off로 작업"이라고 안내한다. CLAUDE.step2.md는 "Claude 밖에서 고친다"로 바뀜(rules).
- CUTOVER.md:81, 159의 한글 `git commit -m` — PowerShell 5.1에서 깨질 수 있음. 영문으로(correctness, 낮음).
- gate.mjs:247 `check __proto__` 같은 인자에서 예외 종료(관문을 열지는 않음)(correctness).
- `security-deep`·`qa-mobile`이 dev-team.yaml의 roles와 router 목록에 역할처럼 있으나 실제로는 security·qa의 모드(maintainability).
- 역할별 권한이 gate.mjs 상수와 gate 스킬 산문에 이중 — 스킬에 "원본은 gate.mjs"라고 적기(maintainability).
- gate.mjs의 빽빽한 정규식에 의도 주석 부족(maintainability).
- gate.mjs:193 자동 메모리 예외의 허용 쪽 테스트 없음, 8.3 분기·NotebookEdit·unknownGate 미검증(tests).
- 커밋 단위: T5가 3개, 두 커밋에 태스크 번호 없음(rules).
- `ROOT = CLAUDE_PROJECT_DIR ?? process.cwd()` — 환경 변수가 없으면 하위 폴더를 루트로 잡을 수 있음(닫힌 쪽 실패라 위험 낮음)(rules).
- vendor `test-driven-development/SKILL.md:188`의 `cargo test`는 원문 그대로(rules).

## 미확인 (리뷰어들이 밝힌 것)
- 출고 판정(push/merge) 경로를 구체 페이로드로 돌리지 못함(correctness — 테스트 스크립트의 따옴표 오류).
- CUTOVER.md의 명령을 PowerShell 5.1에서 실행해 보지 않음.
- 역할 파일 본문 전체, router/handoff/gate 스킬 본문 전체는 표본만 읽음.

## Lead의 처리 결정
- **이번 수정(engineer에게 되돌림)**: B1, R1(오르빗 저장소의 settings.step2.json에 `${CLAUDE_PROJECT_DIR}/harness/hooks/gate.mjs`를 가리키는 PreToolUse 훅을 남겨 플러그인 로드와 무관하게 관문이 걸리게 한다), R2~R9, 참고 중 차단 메시지 문구·영문 커밋 메시지·`__proto__`·`security-deep`/`qa-mobile` 주석·"원본은 gate.mjs" 한 줄.
- **미룸(후속 run)**: R10(17개 파일을 고치는 리팩터링), R11(PLAN H1에서 이미 미룸), 정규식 주석 보강, 나머지 테스트 공백.

1회차 판정: FAIL (차단 B1)

---

# 2회차 (수정분 한정 재리뷰 — 커밋 `6fbf288`)

리뷰어 2명(correctness, tests — sonnet). 둘 다 첫 줄 판정 "차단 없음".

## 해소 확인
- **B1 해소**(correctness, 직접 실행): `orbit:engineer`의 `runs/r1/Review.md`, `VERIFY.MD`, `state.json`, `Current`, `PROFILE.JSON`, `team.YAML`, `plan_check.MD` Write가 모두 exit 2. Lead와 해당 소유자 역할은 exit 0. 소유자 없는 파일(`tasks/t1/SUMMARY.md`, `review-notes.md`)은 engineer도 exit 0 — 잘못 넓게 막지 않는다. 대소문자 구분 비교는 남아 있지 않다.
- **R2~R6, B1 테스트 공백 해소**(tests, 변이 확인): 사본에 변이 9개를 하나씩 넣어 전부 정확히 1개 테스트가 실패하는 것을 확인. 테스트 24/24 통과.
- **R4**: `check` CLI가 정상 관문 이름에서 동작, `bogus`·`__proto__`는 exit 64.
- **R8**: gate/SKILL.md의 Lead 셸 항목이 gate.mjs의 `LEAD_SHELL`과 같다(`worktree list`만 스킬에 빠짐 — 참고).
- **R1 백스톱**: settings.step2.json의 훅이 exec 형식으로 `${CLAUDE_PROJECT_DIR}/harness/hooks/gate.mjs`를 부르고 matcher가 hooks.json과 같다. 플러그인이 `harness/`에서 그 자리 로드되면 두 번 실행해도 판정이 같다.

## 새 지적
| # | 심각도 | 위치 | 문제 | 리뷰어 · confidence |
|---|---|---|---|---|
| N1 | 수정 권고 | gate.mjs:104-106, gate/SKILL.md:15-19 | Lead가 허용하는 gate 명령이 실행 중인 gate.mjs 자신의 경로에 묶여 있다. 플러그인이 **캐시에서** 로드되면 플러그인 훅과 settings 백스톱이 서로 다른 경로를 자기로 여겨 Lead가 어느 경로로도 `check`를 못 돌린다. directory source의 그 자리 로드(S2에서 확인)에서는 일어나지 않는다 | correctness · 중간 |
| N2 | 참고 | CLAUDE.step2.md:15 | "두 번 실행되지만 판정이 같아 무해하다"는 문장이 캐시 로드에서는 거짓 | correctness · 낮음 |
| N3 | 참고 | gate.mjs:268, gate.test.mjs:316-317 | design-warn의 토큰 대조가 토큰 JSON 전체 텍스트에 대한 부분 문자열(`includes`)이다. `#fff`가 `#ffffff`·`#fff000`에, `16px`이 `116px`에, JSON 키·설명 문구에도 일치해 경고를 놓친다(거짓 음성). 코드 주석과 반대 동작이고, 새 테스트가 이 동작을 "한계"로 고정했다. 경고 훅이라 차단 영향 없음 | correctness, tests · 중간 |
| N4 | 참고 | gate.test.mjs:266 | `spawnGate`가 바깥 환경을 물려받아 `ORBIT_GATE=off`가 설정된 셸에서는 R5 단언이 실패. `spawnSync('node')`에 절대 경로·timeout 없음 | tests · 중간/낮음 |

## Lead의 처리 결정
- 차단 없음 → 리뷰 관문 통과.
- **QA 전에 작은 수정(fix-2)**: N1·N2(전환 문서에 로드 경로 확인 단계, 문장 정정), N3(토큰 값 집합에 대한 정확 일치로 고치고 테스트 기대를 바로잡음), N4(`process.execPath`, timeout, `ORBIT_GATE` 제거). QA가 수정 뒤의 테스트를 다시 실행한다.
- 1회차에서 미룬 R10, R11은 그대로 후속 run.

VERDICT: PASS
