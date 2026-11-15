# SUMMARY S1 — 검증 스파이크 (engineer 최종 메시지 요지, 상세는 ../../SPIKE.md)

커밋 없음, 저장소 파일 미변경. 모든 `claude -p`는 `--model haiku`. 실험 폴더: `%TEMP%\orbit-spike\`.

| Q | 결론 | 분기 |
|---|---|---|
| 0단계 | 조상 CLAUDE.md 없음. `--setting-sources project,local`로 ponytail 영향 배제. `--plugin-dir`은 값 하나(반복 사용) | — |
| Q0 | 성공(validate exit 0, 경고만). templates 경고 없음. 훅 명령의 `${CLAUDE_PLUGIN_ROOT}`는 따옴표 또는 exec 형식 권고 | 설계대로 |
| Q0b | 성공. 스킬 그룹 폴더 둘 다 로드 | L1 |
| Q1·Q4 | 성공. `subagent_type`과 훅 `agent_type` 모두 범위 이름(`plugin:name`). 서브에이전트 줄에 `agent_id` 있음 | T1(d) B형 |
| Q2 | 부분. 서브에이전트의 `skills:`는 맨 이름·범위 이름 모두 동작. `--agent` 메인 스레드 에이전트는 프리로드 스킬을 못 봄(원인 미구분) | Lead에 Skill 도구 유지 |
| Q3·Q7 | 부분. `Agent(plugin:name)` 동작, 맨 이름은 not found. `--agent`와 settings `agent` 둘 다 동작. 메인 스레드 줄에는 `agent_type`만 있고 `agent_id` 없음. Agent() 목록의 차단 효과는 대조군 미실행 | 2.3 A |
| Q6a~d | **성공**. 플러그인 PreToolUse exit 2가 메인·서브에이전트의 Write를 차단, 대조군은 써짐 | 관문 설계 유지 |
| Q8 | 성공. 플러그인 `bin`이 PATH에 들어옴. Bash 도구 env에는 CLAUDE_* 없음(훅 프로세스에는 있음) | (a) bin |
| Q9 | 성공. additionalContext 등 세 방식 모두 전달 | T8은 a |
| Q10 | 부분. Agent `model` 인자는 전달됨. 실제 모델 전환은 미확인(메인도 haiku였음) | 실행 중 확인 |
| Q12 | 성공(d.ts 읽기만). SDK 0.3.325에 `agent`, `agents`, `plugins` 옵션 | SDK A |
| Q5a | 미실행 → S2(사람). `claude plugin list`에 `--settings` 없음. S2용 파일은 만들어 둠 | S2 |

M1을 멈추게 하는 결과 없음. 계획 명령 중 고쳐 쓴 것 5건(표는 SPIKE.md 끝).

계획 반영점: 이름은 모두 범위 이름(`orbit:…`), 맨 이름 `Agent()`는 실패, gate는 bin 명령으로 호출, 서브에이전트 구분은 `agent_id` 유무.
