# SUMMARY T2 — 매니페스트·마켓플레이스·vendor 사본 (engineer 최종 메시지 요지)

커밋 `1510b01` (orbit/20261114-harness-plugin). 옛 `.claude/`는 미변경.

## 만든 파일
- harness/.claude-plugin/plugin.json (name orbit, 0.1.0, skills `["./skills/orbit","./skills/vendor"]` = L1)
- .claude-plugin/marketplace.json (계획 2.1 그대로)
- harness/skills/vendor/{test-driven-development,verification-before-completion,systematic-debugging}/
- harness/skills/vendor/SOURCES.md, LICENSE-superpowers.txt

## 수정
- 폴더·frontmatter `name`을 upstream 이름으로 되돌림.
- systematic-debugging/SKILL.md의 `vendor-…` 참조 2곳 → `orbit:…`.
- SOURCES.md 제목·파일명·수정 기록 갱신.

## 검증
```
claude plugin validate harness   -> rc=1  ✘ skills[0]: Path not found: ./skills/orbit
claude plugin validate .         -> rc=1  (같은 오류)
(임시로 빈 harness/skills/orbit/ 를 만든 뒤) 둘 다 "Validation passed with warnings", rc=0 → 임시 폴더 삭제
diff: name 줄과 orbit: 참조 줄만 다름(SOURCES.md 기록과 일치)
cmp LICENSE -> SAME
```
- validate 실패 원인은 T5·T6 산출물(`harness/skills/orbit/`) 부재. `hooks/hooks.json` 부재는 오류 아님.
- 경고: author 없음, marketplace description 없음.

## 계획과 달라진 점 / 미검증
- plugin.json에 `description` 추가.
- 마켓플레이스·settings 경로 형식은 S2 결과에 따라 바뀔 수 있음.
- 미검증: `skills/orbit`이 채워진 뒤의 validate(T5·T6 이후 재실행), 실제 로드와 `orbit:<스킬>` 이름 해석.
