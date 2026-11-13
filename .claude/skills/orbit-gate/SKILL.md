---
name: orbit-gate
description: 단계 사이의 관문(Gate) 통과 조건과 판정 방법. Lead가 다음 단계로 넘기기 전, 리뷰 결과를 REVIEW.md로 병합할 때, 머지·푸시 전에 쓴다.
---

# orbit-gate — 관문

관문은 훅(`.claude/hooks/gate.mjs`)이 강제한다. 이 스킬은 그 규칙의 설명서다.

## 확인 방법

```
node .claude/hooks/gate.mjs check plan      # PLAN_CHECK.md
node .claude/hooks/gate.mjs check review    # REVIEW.md
node .claude/hooks/gate.mjs check verify    # VERIFY.md (증거 코드 블록 필수)
node .claude/hooks/gate.mjs check security  # SECURITY.md
node .claude/hooks/gate.mjs check ship      # 현재 트랙의 필수 관문 전부
```

FAIL이 나오면 다음 단계로 가지 않는다. 산출물의 VERDICT 줄을 Lead가 고쳐서 통과시키지 않는다 — 판정은 그 역할만 내린다.

## 트랙별 출고(ship) 조건

| 트랙 | 필수 관문 |
|---|---|
| quick | verify |
| standard | plan, review, verify |
| full | plan, review, verify, security |

## 훅이 막는 것

- `git push` 전부, 그리고 main/master로 들어가는 `git merge` — ship 조건 미통과 시. run 브랜치(`orbit/<run-id>`) 안의 머지는 자유.
- Lead(메인 세션)의 `.orbit/` 밖 파일 편집, 허용 목록 밖 셸 명령.
- 모든 에이전트의 `.claude/hooks/`, `.claude/settings*.json` 편집.

막혔을 때 우회로를 찾지 않는다. 사유를 읽고 빠진 단계를 수행하거나 사용자에게 보고한다.

## REVIEW.md 병합 규칙 (Lead)

리뷰어들의 최종 메시지를 받아 다음 순서로 합친다.

1. 같은 파일·같은 줄·같은 원인의 지적은 하나로 합치고, 지적한 리뷰어를 모두 적는다.
2. 신뢰도 필터: 리뷰어가 `confidence`를 낮음으로 표시했고 재현 방법이 없는 지적은 "참고"로 내린다.
3. 심각도: **차단**(버그·데이터 손실·보안·계획 미준수) / **수정 권고** / **참고**.
4. 차단이 하나라도 있으면 `VERDICT: FAIL`, 없으면 `VERDICT: PASS`.

2단계 순서를 지킨다: 계획 준수(reviewer-correctness의 spec 항목)가 FAIL이면 품질 지적은 미루고 바로 engineer에게 되돌린다.

## 증거 규칙

"완료"는 명령과 그 출력이 붙어 있을 때만 인정한다. "테스트 통과했습니다"라는 문장은 증거가 아니다. 출력이 길면 마지막 20줄과 종료 코드를 붙인다.
