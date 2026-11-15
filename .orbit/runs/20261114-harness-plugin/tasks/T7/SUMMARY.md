# SUMMARY T7 — 관문 보강 (engineer 최종 메시지 요지)

커밋 `b8dbc51`. 바꾼 파일: harness/hooks/gate.mjs, gate.test.mjs (hooks.json 미변경).

## 검증
```
node --test harness/hooks/gate.test.mjs  -> tests 15 / pass 15 / fail 0
```
- RED→GREEN: 15개 중 7개 실패 → 전부 통과. 기존 테스트 2곳은 의도된 동작 변경으로 단언 수정.
- SECURITY.md의 22사례: 21 BLOCK + 1 ALLOW(qa Bash로 hooks 쓰기 — H1 미룸).
- 수동 시험: engineer의 `.claude/skills/x.md` 쓰기 exit 2(설정 경로), 깨진 JSON exit 2, engineer의 `src/a.ts` 쓰기 exit 0.

## H1~H9
H1 부분 · H2 고침 · H3 고침 · H4 부분(미룸: pre-push 훅, heredoc 오탐) · H5 고침 · H6 T1 몫(주석만) · H7 T4/T5 몫 · H8 고침(설정 경로 승인 규칙) · H9 T9/C2 몫.

## 역할 범위
designer `design/**` + `.orbit/…/DESIGN.md`, researcher `.orbit/profile.json`, data DATA.md, devops RELEASE.md, engineer·debugger SUMMARY.md·DEBUG.md 허용. engineer의 profile.json, 모든 에이전트의 team.yaml 차단. 계획 2.6과 어긋남 없음. gate 스킬 문서와도 어긋남 없음.

## 구현 판단
1. Lead의 STATE.json·`.orbit/current` 쓰기는 내용이 올바를 때만 허용(내용을 알 수 없으면 차단).
2. READ_SHELL 대상: FREE_SHELL 9개(engineer, debugger, librarian, devops, qa, security, reviewer-correctness, reviewer-tests, data)를 뺀 나머지와 모르는 에이전트.
3. `git … alias.`, `branch -f`, `switch -C`, `checkout -B`, `update-ref`, `gh pr merge`, `git.exe`도 출고로 본다.
4. STATE.json이 있는데 읽을 수 없으면 Lead의 쓰기도 차단(사람이 고쳐야 함).
5. 8.3 짧은 이름은 실제로 없는 이름일 때만 거부.

## 미검증
- 실제 세션에서 훅이 `orbit:*` agent_type으로 호출되는지, Windows 밖 경로 정규화, matcher 밖의 도구(MCP 등).
