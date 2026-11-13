# Vendor skills

외부에서 가져온 스킬의 출처 기록. **자동 업데이트 없음. 갱신은 사용자 승인 후 수동.**
가져온 날짜: 2026-11-14. 가져오기 전 `orbit-agent-config-audit`의 skills 항목 기준으로 전문 검토함.

공통 출처
- 저장소: https://github.com/obra/superpowers
- 태그: v7.0.2
- 커밋 SHA: 22f0b463e7a5e579904dd6211a520321035526f7
- 라이선스: MIT — `Copyright (c) 2025 Jesse Vincent` (전문: `VENDOR_LICENSE-superpowers.txt`)

공통 수정: SKILL.md frontmatter의 `name`을 폴더 이름(`vendor-…`)과 같게 바꿈. 그 외 원문 그대로.

## vendor-test-driven-development
- 원본 경로: `skills/test-driven-development/`
- 가져온 파일: `SKILL.md`, `writing-good-tests.md`
- 제외한 파일: 없음
- 추가 수정: `writing-good-tests.md` 51행 `superpowers:writing-skills` 참조를 "writing-skills 스킬 — 이 프로젝트에는 없음"으로 바꿈.

## vendor-verification-before-completion
- 원본 경로: `skills/verification-before-completion/`
- 가져온 파일: `SKILL.md`
- 제외한 파일: 없음
- 추가 수정: 없음.

## vendor-systematic-debugging
- 원본 경로: `skills/systematic-debugging/`
- 가져온 파일: `SKILL.md`, `condition-based-waiting.md`, `defense-in-depth.md`, `root-cause-tracing.md`
- 제외한 파일(실행 파일·예제 코드): `find-polluter.sh`, `condition-based-waiting-example.ts`
- 추가 수정:
  - `SKILL.md`: `superpowers:test-driven-development` → `vendor-test-driven-development`, `superpowers:verification-before-completion` → `vendor-verification-before-completion`.
  - `condition-based-waiting.md` 82행: 예제 `.ts` 참조를 "(이 프로젝트에는 없음)" 문장으로 교체.
  - `root-cause-tracing.md` 101행: `find-polluter.sh` 참조를 "(이 프로젝트에는 없음)" 문장으로 교체하고 사용 예 코드블록·"See script" 줄 삭제.
