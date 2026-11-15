# SUMMARY 웨이브 4 (T3~T6) — engineer 최종 메시지 요지

| 태스크 | 커밋 | 산출물 | 검증 |
|---|---|---|---|
| T3 | `cef3666` | harness/agents: lead, researcher, product, architect, plan-checker, engineer, debugger | V-T3 `CLEAN`×3, `OK`, BAD/MISSING 없음, validate exit 0 |
| T4 | `2e89c61` | harness/agents: reviewer-{correctness,tests,maintainability,rules,performance,accessibility,data,idiom}, qa, security, librarian | V-T4 `CLEAN`×3, BAD/MISSING 없음, validate exit 0. 마지막 줄(qa 와일드카드)은 B안이라 CLEAN 아님 |
| T5 | `685c1c3`, `1788015`, `bc2f5dc` | skills/orbit: design-system-guard, data-migration-safety, devops-release / agents: designer, data, devops | V-T5 `CLEAN`, BAD 없음, validate exit 0, `claude -p --model haiku`로 `orbit:` 스킬 3개 + vendor 3개 로드 확인 |
| T6 | `6d2379a` | skills/orbit: router, handoff, gate, threat-model, agent-config-audit / templates/dev-team.yaml | V-T6 `CLEAN`, MISSING 없음, `YAML OK`, validate exit 0 |

V-W4: `harness/agents/*.md` 21개 (Lead가 Glob으로 확인).

## Lead의 인계 실수와 정정
- T5 인계의 WRITE 범위를 스킬로만 적어 designer·data·devops 역할 파일이 빠졌다 → 후속 지시로 `1788015`.
- data에 Write가 없어 DATA.md를 못 쓰는 문제 → `bc2f5dc`. designer는 Bash 없이 QA가 띄운 화면으로 시각 리뷰.

## 후속 태스크에 넘길 것
- **T7**: gate 스킬(T6)이 적은 강제 범위와 gate.mjs를 대조. designer의 쓰기 범위가 `design/**`와 `.orbit/`(DESIGN.md) 둘 다 열려야 한다. researcher의 `.orbit/profile.json`, data의 DATA.md, devops의 RELEASE.md도 같은 관점으로 확인.
- **T8**: gate 스킬의 "디자인 토큰 경고" 절이 `design-warn` 훅 구현과 맞아야 한다.
- **S2 뒤(H7 A안)**: `harness/agents/qa.md` 5행 `mcp__Claude_Browser__*`, `harness/agents/designer.md` 5행 `mcp__playwright__*`(서버 이름은 가정값)를 확인된 도구 이름으로 교체.
- T4 engineer 보고: 옛 gate가 heredoc 안의 `git merge` 문구를 머지로 오탐(H4의 알려진 오탐).

## 미검증
- 실제 세션에서 `orbit:` 역할이 호출되고 본문 "스킬" 줄의 이름이 풀리는지, Lead 메인 스레드 동작, Q10(모델 덮어쓰기의 실제 전환).
