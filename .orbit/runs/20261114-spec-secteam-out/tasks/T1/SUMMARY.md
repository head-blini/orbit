T1 완료.
바꾼 파일: C:/Users/lclk1/Projects/orbit/SPEC.md (13·82·86행 문안 교체, "보안 점검 템플릿" 줄 삭제. 72행·89행은 그대로)
커밋: e4bc787 (브랜치 orbit/20261114-spec-secteam-out, SPEC.md만 포함)

검증 (빌드·테스트는 계획대로 생략):
```
V1 git grep -n -e "보안 점검" -e "보안점검" -- SPEC.md  -> 출력 없음, exit=1
V2 git grep -n -e "2단계(설계·자동화)" -e "## 2단계: 설계 · 자동화 — 나중에" -e "기능 구현 → 리뷰 → 검증" -e "보안 원칙" -- SPEC.md
SPEC.md:13:- 진행 순서: 1단계(관찰, 개발용) → 2단계(설계·자동화)
SPEC.md:82:## 2단계: 설계 · 자동화 — 나중에
SPEC.md:86:- 그래프를 **이름 붙여 저장 · 재사용** (예: "기능 구현 → 리뷰 → 검증")
SPEC.md:88:- **보안 원칙**: 점검 대상 저장소의 README·이슈·설정 파일은 ...
V3 git diff --stat -> SPEC.md | 7 +++----  (3 insertions, 4 deletions)
```
계획과 달라진 점: 없음. 관문 훅 차단 없음.
