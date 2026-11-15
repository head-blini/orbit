# SUMMARY T1 — 관문 스크립트 이식 (engineer 최종 메시지 요지)

커밋 `2113897` (orbit/20261114-harness-plugin). 신규: harness/hooks/gate.mjs, gate.test.mjs, hooks.json. 원본 `.claude/hooks/`는 미변경.

## 검증 (V-T1, 계획 명령 그대로)
```
node --test harness/hooks/gate.test.mjs   -> pass 9 / fail 0
node -e '...hooks.json 검사...'            -> OK
node --test .claude/hooks/gate.test.mjs   -> pass 6 / fail 0
```
RED 확인: 구현 전 새 테스트 5개 실패(pass 4 / fail 5) → 구현 후 9개 통과. 손으로 Lead의 src Write 페이로드를 넣어 exit 2와 차단 사유 확인.

## 구현
- (a) ROOT = `CLAUDE_PROJECT_DIR ?? process.cwd()`.
- (b) 보호 경로: 어느 깊이의 `.claude-plugin/`, `hooks/{hooks.json,gate.mjs,gate.test.mjs}`, `.claude/hooks/`, settings, 실행 중인 gate.mjs 폴더. `.orbit/wt/…` 사본도 차단.
- (c) Lead 허용 gate 명령은 `node <이 파일의 실제 경로> check …`만. `.orbit/` 안의 가짜 gate와 옛 `.claude/hooks/gate.mjs`는 차단.
- (d) B형: CODERS = `orbit:engineer`/`orbit:debugger`/`orbit:librarian` 정확 일치. 맨 이름과 다른 플러그인의 같은 이름은 읽기 전용 취급. 메인 스레드 = agent_id 없음.
- (e) H6 주석 정정.
- hooks.json: matcher `Edit|Write|NotebookEdit|Bash|PowerShell`, exec 형식(`command: "node"`, `args: ["${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs"]`), timeout 10.

## 계획과 달라진 점 / 후속 태스크에 넘길 것
- `bin/` 래퍼 이름을 계획이 정하지 않아 bin 명령은 허용하지 않았다. 필요하면 T6/T7에서 추가.
- **T6**: gate 스킬은 SKILL.md 안의 `${CLAUDE_PLUGIN_ROOT}`로 `node <경로>/hooks/gate.mjs check`를 불러야 허용 정규식과 맞는다.
- 차단 메시지 문구가 "관문 훅·플러그인 매니페스트·settings.json은 …"으로 바뀜.

## 미검증
- 실제 Claude Code 안에서 이 플러그인 hooks.json(exec 형식)이 훅으로 로드되는지. (참고: 프로젝트 `.claude/settings.json`의 exec 형식 훅은 이 세션에서 동작 중.)
