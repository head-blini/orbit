# Orbit 디자인 문서

이 문서는 Orbit 프로젝트의 디자인 규칙이다. 새로 정한 것은 없고, 이미 확정된 결정만 출처와 함께 옮겼다.

- `orbit:ui-quality` 스킬의 "프로젝트 디자인 문서가 우선하는 기본값"과 다르면 이 문서가 이긴다.
- 그 스킬의 "프로젝트 문서가 덮을 수 없는 바닥"은 그대로 적용된다.
- 값의 기계 판독본은 `design/tokens.json`이다.

## 1. 팔레트: 4명암

| 이름 | 값 | 역할 |
|---|---|---|
| paper | `#f8f8ec` | 바탕(패널 배경) |
| light | `#b4b8a4` | 연회색. 앱 배경·비활성 |
| dark | `#5c6052` | 진회색. 보조 글자·막대 채움 |
| ink | `#1c1e18` | 글자·테두리 |

출처: `.orbit/decisions.md` "화면 디자인 방향 확정"의 팔레트 줄, `design/tokens.json` `color`·`role`.

## 2. 색 없음

상태 색 표식을 쓰지 않는다. 4명암 + 기호(`✕`, `!`, 진행 막대, 반전)로만 상태를 구분한다.

출처: `.orbit/decisions.md` "최종 확정 (2026-11-14 …)"의 "색 없음" 줄.

유일한 예외: 내장 터미널 칸 안에서만 Claude Code의 ANSI 16색을 종이색 위 대비 4.5:1 이상 값으로 그대로 보인다. 터미널 밖 화면(세션 목록·그래프·패널·버튼)은 4명암 그대로다.

출처: `.orbit/decisions.md` "터미널 칸 안 색 예외", `design/tokens.json` `terminal`.

## 3. 글꼴

- 제목·메뉴·노드 이름·버튼·상태 문구: 픽셀 글꼴(시안은 Galmuri11, 한글 지원 필요).
- 긴 글: 일반 글꼴. 명령어·터미널: 고정폭.
- 크기: 픽셀 글꼴 12px, 본문 13px.

출처: `.orbit/decisions.md` "열린 문제 결정"의 ② 글꼴 줄, "화면 디자인 방향 확정"의 글꼴 줄, "기준 시안 파일화 · DESIGN 승인"의 "픽셀 글꼴 12px·본문 13px", `design/tokens.json` `font`.

## 4. 패널

- RPG 대화창식 이중 테두리: `border: 3px solid #1c1e18; border-radius: 6px; box-shadow: inset 0 0 0 2px #f8f8ec, inset 0 0 0 4px #1c1e18`.
- 패널 사이 간격 8px, 앱 배경 `#b4b8a4`.

출처: `.orbit/decisions.md` "화면 디자인 방향 확정"의 패널 줄, `SPEC.md` 40행("방향: 4명암 밝은 팔레트, RPG 대화창식 패널, 픽셀 글꼴"), `design/tokens.json` `border.panel`·`space.panel-gap`.

## 5. 배치

기준 시안은 `design/reference/layout_v4.html`이다. 시안·UI 작업은 위젯 이름이 아니라 이 파일과 대조한다.

- 기본 비율은 열 1 : 2.6 : 1.2, 행 3 : 2이다.
- 패널 경계를 드래그해 크기를 조절할 수 있다. 칸 위치·이중 테두리·4명암은 그대로다.

출처: `.orbit/decisions.md` "화면 배치 확정", "기준 시안 파일화 · DESIGN 승인", 21번 "패널 경계 드래그 크기 조절", `design/tokens.json` `layout`.

## 6. 그 밖의 화면별 확정 사항

위에 없는 화면별 확정 사항(로드맵 패널, 세션 칸, 터미널, 레이드 등)은 `.orbit/decisions.md`의 해당 결정 원문과 그 run의 DESIGN.md를 따른다. `.orbit/`은 git 밖이라 다른 체크아웃에는 없을 수 있다. 그 경우 `SPEC.md`와 `design/tokens.json`이 이 저장소 안의 근거다.
