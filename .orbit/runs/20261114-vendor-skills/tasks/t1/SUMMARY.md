# SUMMARY t1 — vendor 스킬 3개 가져오기 (engineer 최종 메시지 그대로)

커밋 없음 — 지시대로 git add/commit 안 함.

## 만든/바꾼 파일 (모두 `.claude/` 아래)
- skills/vendor-test-driven-development/SKILL.md, writing-good-tests.md
- skills/vendor-verification-before-completion/SKILL.md
- skills/vendor-systematic-debugging/SKILL.md, condition-based-waiting.md, defense-in-depth.md, root-cause-tracing.md
- skills/VENDOR_SOURCES.md, skills/VENDOR_LICENSE-superpowers.txt (원본 LICENSE 전문 복사)
- agents/engineer.md, qa.md, debugger.md (frontmatter에 `skills:` 추가만, 본문 미변경)

## clone 커밋
v7.0.2 = `22f0b463e7a5e579904dd6211a520321035526f7`
clone 위치: `C:\Users\lclk1\AppData\Local\Temp\claude\264b3b9cca524617\94336efd-5676-4cd7-9491-4ece2fbcfc60\scratchpad\superpowers-src`

## 검토에서 발견한 것
- 가져온 .md 7개를 전문 읽음. 차단급 문제 없음. HTML 주석, 제로폭 문자/BOM, base64 덩어리 없음(grep으로도 확인). `allowed-tools` 없음. `curl|sh`, `rm -rf`, 자격 증명 접근, 자동 업데이트, 텔레메트리 없음.
- 에이전트에게 하는 숨은 지시나 프로젝트 설정을 건드리라는 지시 없음.
- 강제 문구는 있음(권고 수준):
  - 세 스킬 모두 "Iron Law" 형식의 강한 규칙. TDD "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST", "코드를 먼저 썼으면 삭제", "Never fix bugs without a test". verification "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE". debugging "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST".
  - description이 "any feature or bugfix", "any bug" 식으로 넓어서 자동 호출이 잦을 수 있음. 다른 스킬을 무시하라는 문장은 없음.
  - 원문에 "your human partner" 표현이 있음.
  - debugging의 "3번 실패하면 멈추고 아키텍처 논의"는 debugger.md와 일치. TDD "삭제하고 다시 시작"은 engineer.md보다 강하지만 모순은 아님.
  - 제외한 파일(`find-polluter.sh`, `condition-based-waiting-example.ts`)은 열어보지 않음.

## 수정 내용
1. 세 SKILL.md의 `name`을 `vendor-…`로 변경.
2. vendor-systematic-debugging/SKILL.md: `superpowers:` 참조 2개를 `vendor-…` 이름으로.
3. condition-based-waiting.md 82행: 예제 `.ts` 참조 문장을 "(이 프로젝트에는 없음 …)"로 교체.
4. root-cause-tracing.md 101행: `find-polluter.sh` 문장 교체, 그 스크립트를 쓰는 bash 코드블록과 "See script" 줄 삭제.
5. writing-good-tests.md 51행: `superpowers:writing-skills` → "writing-skills 스킬 — 이 프로젝트에는 없음".
6. agents/*.md frontmatter에 `skills:` 리스트 추가.

## 검증 출력
```
$ find .claude/skills/vendor-* -type f
vendor-systematic-debugging/{condition-based-waiting,defense-in-depth,root-cause-tracing,SKILL}.md
vendor-test-driven-development/{SKILL,writing-good-tests}.md
vendor-verification-before-completion/SKILL.md

$ grep -rn 'superpowers:' .claude/skills/vendor-*
(결과 없음, exit=1)
```

## 계획과 달라진 점·못 한 것
- 처음 쓴 PCRE 제로폭 스캔이 오류로 실패 → 다른 패턴으로 재실행해 이상 없음 확인.
- 훅 차단 없음.
- 못 한 것: agent의 `skills:` 필드가 런타임에 실제로 로드되는지, vendor 강제 문구와 에이전트 본문 규칙의 실제 충돌 여부.
