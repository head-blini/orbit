# VERIFY — 20261114-spec-doc

COMMIT: 70acb64115427f94ba5679810d6e2df3d6217975

작업 트리 깨끗: `git status --porcelain --untracked-files=no` 출력 없음. 문서만 바뀌어 앱 실행·빌드는 생략(런타임 영향 없음).

## 1. 다크 테마 -> 게임보이 RPG 밝은 테마
명령: `rg -n "다크 테마" SPEC.md` (rc=1, 출력 없음) / `sed -n 39,40p SPEC.md`
```
### 화면 (초창기 휴대용 게임기 RPG 느낌, 밝은 테마)
방향: 4명암 밝은 팔레트, RPG 대화창식 패널, 픽셀 글꼴. 상세는 마일스톤 ④에서 Designer가 DESIGN.md·design/tokens.json에 쓴다(근거: .orbit/decisions.md '화면 디자인 방향 확정').
```
근거 참조 확인: `.orbit/decisions.md:23` 에 "화면 디자인 방향 확정" 존재. 결과: 통과

## 2. settingSources -> 플러그인 로드 (HARNESS 8절)
명령: `rg -n "settingSources" SPEC.md` (rc=1, 출력 없음) / `sed -n 66p SPEC.md`
```
- 프로젝트의 하네스(CLAUDE.md, .claude/ 설정)를 터미널과 같게 불러오고, 오르빗 내장 하네스는 Agent SDK의 플러그인 로드로 사용자 저장소에 파일을 쓰지 않고 붙인다(...). 방식은 HARNESS.md 8절, ...
```
HARNESS.md:124 `## 8. 오르빗에 내장 · 적용하는 방식`, 126행에 "Agent SDK의 플러그인 · 에이전트 옵션으로 사용자 저장소에 파일을 쓰지 않고 로드" 있음. 결과: 통과

## 3. 보안 점검 템플릿 -> HARNESS 11절 참조
명령: `rg -n "보안 점검 템플릿 예" SPEC.md` (rc=1) / `sed -n 87p SPEC.md`
```
- 보안 점검 템플릿: HARNESS.md 11절(보안점검팀 템플릿) 참조.
```
HARNESS.md:165 `## 11. 보안점검팀 템플릿 (2단계)`, 166행에 Recon -> Scanner -> Triage -> Verifier -> Reporter 흐름 있음. 결과: 통과

## 4. 범위 밖 무변경 / 마크다운 구조
명령: `git diff main...HEAD --stat` / `-U0`
```
 SPEC.md | 7 ++++---
 1 file changed, 4 insertions(+), 3 deletions(-)
hunks: @@ -39 +39,2 @@ , @@ -65 +66 @@ , @@ -86 +87 @@  (세 곳뿐)
```
SPEC.md만 변경, 변경 hunk는 위 세 곳뿐. 39행 `###` 제목 유지, 66·87행 `- ` 목록 형식 유지, 인접 행(1. 세션 목록, 권한 줄, 보안 원칙 줄) 정상. 결과: 통과

## 실패 경로
금지어 grep(다크 테마, settingSources, 템플릿 예)이 모두 0건임을 확인. 참조 대상 절 번호가 어긋나면(8절/11절) 헤딩 grep으로 잡히는데 둘 다 일치.

## 미검증/참고
- HARNESS 8절의 SDK 플러그인 옵션 자체는 SDK 문서 미확인(PLAN 위험 항목 그대로).
- SPEC 45행 노드 색, 48행 "실패는 빨간색"은 밝은 4명암 팔레트와 어긋날 수 있으나 범위 밖(decisions 열린 문제 1).

VERDICT: PASS
