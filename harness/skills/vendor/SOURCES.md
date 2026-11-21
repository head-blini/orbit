# Vendor skills

외부에서 가져온 스킬의 출처 기록. **자동 업데이트 없음. 갱신은 사용자 승인 후 수동.**
출처별로 절을 나눈다. 가져온 날짜는 절마다 적는다.

## superpowers

가져온 날짜: 2026-11-14. 가져오기 전 `orbit-agent-config-audit`의 skills 항목 기준으로 전문 검토함.

- 저장소: https://github.com/obra/superpowers
- 태그: v7.0.2
- 커밋 SHA: 22f0b463e7a5e579904dd6211a520321035526f7
- 라이선스: MIT — `Copyright (c) 2025 Jesse Vincent` (전문: `LICENSE-superpowers.txt`)

공통 수정(superpowers 스킬에만 해당): SKILL.md frontmatter의 `name`을 원본 이름으로 유지(폴더 이름 = 원본 이름; 플러그인 범위 이름 `orbit:<이름>`이 `vendor-` 접두사를 대신함). 그 외 원문 그대로.

### test-driven-development
- 원본 경로: `skills/test-driven-development/`
- 가져온 파일: `SKILL.md`, `writing-good-tests.md`
- 제외한 파일: 없음
- 추가 수정: `writing-good-tests.md` 51행 `superpowers:writing-skills` 참조를 "writing-skills 스킬 — 이 프로젝트에는 없음"으로 바꿈.

### verification-before-completion
- 원본 경로: `skills/verification-before-completion/`
- 가져온 파일: `SKILL.md`
- 제외한 파일: 없음
- 추가 수정: 없음.

### systematic-debugging
- 원본 경로: `skills/systematic-debugging/`
- 가져온 파일: `SKILL.md`, `condition-based-waiting.md`, `defense-in-depth.md`, `root-cause-tracing.md`
- 제외한 파일(실행 파일·예제 코드): `find-polluter.sh`, `condition-based-waiting-example.ts`
- 추가 수정:
  - `SKILL.md`: `superpowers:test-driven-development` → `orbit:test-driven-development`, `superpowers:verification-before-completion` → `orbit:verification-before-completion`.
  - `condition-based-waiting.md` 82행: 예제 `.ts` 참조를 "(이 프로젝트에는 없음)" 문장으로 교체.
  - `root-cause-tracing.md` 101행: `find-polluter.sh` 참조를 "(이 프로젝트에는 없음)" 문장으로 교체하고 사용 예 코드블록·"See script" 줄 삭제.

## Hallmark

- 저장소: https://github.com/Nutlope/hallmark
- 커밋 SHA: 04977e15f3dfd6ee4b74c887dac3eb52665d6c92
- 가져온 날짜: 2026-11-21
- 라이선스: MIT — `Copyright (c) 2026 Hallmark contributors` (전문: `LICENSE-hallmark.txt`)
- 원본 경로: `skills/hallmark/references/`
- 가져온 파일(규칙 텍스트만):
  - `interaction-and-states.md` → `ui-quality/states.md`(8상태·포커스 링·폼·빈 상태·로딩·Undo), `ui-quality/SKILL.md` 바닥의 상태 항목
  - `gates.md` → `ui-quality/SKILL.md`의 "바닥"(대비·포커스·모션 감소·가짜 정보 금지)과 "AI 티 금지 목록"
  - `review-finish.md` → `ui-quality/SKILL.md`의 "스크린샷 리뷰 절차"
- 제외한 파일(실행 파일 등): `scripts/` 전부(install.mjs, install-hook.mjs, lint-hook.mjs, sloplint*.mjs, capture.mjs, theme.mjs, imagegen.mjs, picture.mjs, refcheck.mjs, photos.json 등), `agents/openai.yaml`, themes·genres·macrostructures.
- 수정 내용: 한국어 번역·축약, 게이트 번호·CSS 면제 주석 문법·없는 명령 참조 제거, 마케팅 전용 규칙 제외, "바닥 / 프로젝트 문서가 우선하는 기본값" 2층 재배치.
- `ui-quality`는 원본 이름을 쓰지 않은 합성 스킬이다. 위 superpowers의 "폴더 이름 = 원본 이름" 규칙은 적용되지 않는다.

## Impeccable

- 저장소: https://github.com/pbakaus/impeccable
- 커밋 SHA: b49177d32788f2dc585c42831d845dacf1ebed2c
- 가져온 날짜: 2026-11-21
- 라이선스: Apache License 2.0 — `Copyright 2025 Paul Bakaus` (전문: `LICENSE-impeccable.txt`, 고정 커밋의 원문 그대로)
- 원본 경로: `.claude/skills/impeccable/reference/`
- 가져온 파일(규칙 텍스트만):
  - `craft-floor.md` → `ui-quality/SKILL.md`의 "바닥"과 "AI 티 금지 목록"·"앱 화면 권고"
  - `mode-operate.md` → `ui-quality/SKILL.md`의 "앱 화면 권고"
  - `polish.md` → `ui-quality/SKILL.md`의 "스크린샷 리뷰 절차"(점검 우선순위)
- 제외한 파일(실행 파일 등): `scripts/` 런처·`.cmd`, live-browser*.js, modern-screenshot.umd.js, engine-checksums.txt, 엔진 바이너리, hooks.md·live*.md·generate.md, ios.md·android.md, 글꼴, consent-rules.js.
- 수정 내용: 한국어 번역·축약, 없는 명령 참조 제거, "바닥 / 프로젝트 문서가 우선하는 기본값" 2층 재배치.
- Apache §4(b) 변경 고지: `ui-quality/SKILL.md` 머리의 출처·변경 고지 줄에 달았다.
- Apache §4(d) NOTICE: 해당 없음(대상: ios.md·android.md·글꼴·consent-rules — 가져오지 않음). 고정 커밋의 `NOTICE.md`는 이 세 가지만 다룬다.
- Apache §6 상표: 이름·상표를 쓰지 않으려고 스킬 폴더 이름을 중립(`ui-quality`)으로 지었다.
