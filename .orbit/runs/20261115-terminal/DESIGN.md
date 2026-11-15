# DESIGN — 20261115-terminal (채팅 칸 → 앱 내장 터미널)

기준: `.orbit/decisions.md` 117행(채팅 → 터미널), 118행(layout_v4 확정), run DECISIONS 2번(버튼 3개 + 종료), BRIEF 12번.
방향: **새 시안이 아니다.** 칸 위치·크기·패널 이중 테두리·버튼 모양은 layout_v4 그대로이고, 칸 안쪽만 바꾼다. 이번 설계에서 "구분되는 한 가지"는 **터미널까지 4명암으로 칠한다**는 것 하나다(밝은 paper 바탕의 터미널 = 다른 패널과 같은 종이 위에 찍힌 글자).

갱신한 디자인 파일
- `design/tokens.json`: `"chat"` 키 삭제 → `"terminal"` 키(글꼴·여백·xterm 테마). 색 값은 모두 `{color.*}` 참조, 새 색 0개.
- `design/reference/layout_v4.html`: 채팅 CSS·마크업·상태 변형 9개를 터미널 CSS·마크업·상태 변형 6개로 교체. 다른 칸은 손대지 않음.

## 1. 사용자 흐름

1. **새 폴더에서 시작**: `폴더 열기` → OS 폴더 선택 창(Rust) → 취소면 아무 변화 없음 / 고르면 곧바로 그 폴더에서 `claude` 실행 → 실행 중.
2. **고른 세션의 폴더에서 새로 시작**: 왼쪽 세션 목록에서 세션을 누른다(이것만으로는 아무것도 실행하지 않음) → `새로 시작` → 그 세션 cwd에서 `claude`(인자 없음).
3. **이어 가기**: 세션을 누른다 → `이어 가기` → 그 세션 cwd에서 `claude --resume <id>`.
4. **실행 중**: 터미널에 포커스가 가고 사용자는 claude TUI를 직접 쓴다. 시작 버튼 3개는 비활성, `종료`만 활성. 왼쪽에서 다른 세션을 눌러도 터미널은 그대로다(그래프만 바뀐다).
5. **끝**: claude에서 `/exit` 하거나 `종료`를 누르면 → 터미널에 `── 종료됨 ──` 한 줄, 머리 상태 `<폴더> · 종료됨`, 시작 버튼 다시 활성. 화면 내용은 남는다(스크롤해 읽을 수 있음).
6. **다시 시작**: 종료됨 상태에서 시작 버튼을 누르면 xterm을 `reset()`해 비우고 새로 실행한다. 오류 줄도 지운다.

## 2. 화면과 상태

### 칸 안 배치 (위에서 아래)

```
┌ 패널(layout_v4 .panel 이중 테두리, 칸 = grid-column 1/3, grid-row 3) ───────────────────┐
│ 터미널  proj · 실행 중 ……(남는 폭, 말줄임)……  [폴더 열기][새로 시작][이어 가기][종료] │ ← 머리 줄 .term-head
│ ✕ 오류: claude를 찾을 수 없습니다 — …                                                 │ ← 오류 줄 .term-err (있을 때만)
│ ┌ .term (안쪽 4px) ──────────────────────────────────────────────────────────────┐ │
│ │ xterm 화면 (남는 높이 전부, fit addon으로 cols·rows 계산)                        │ │ ← 또는 시작 전 빈 칸 .term-body
│ └──────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- 머리 줄: 기존 `.chat-head` 문법 그대로(flex, gap 8px, 아래 8px). 제목 `h2.px` "터미널". 상태 `span.term-state.px`(dark, 남는 폭, 넘치면 말줄임 — 상단 바 `.tb-result`와 같은 규칙). 버튼 4개는 기존 `.btn` 그대로, 순서 `폴더 열기 / 새로 시작 / 이어 가기 / 종료`.
- `종료`는 항상 자리에 있다(실행 중이 아니면 disabled). 실행 여부에 따라 버튼이 생기고 사라지면 머리 줄이 흔들린다.
- 960×640 창(칸 656×220, 안쪽 폭 약 618px)에서 제목 + 버튼 4개 ≈ 360px, 상태 글에 약 240px 남는다. 한 줄 고정.
- 섹션 클래스는 `panel terminal`. `App.css:62`의 `.chat` 칸 지정은 `.terminal`로 이름만 바꾼다.

### 상태표

| 상태 | 머리 상태 글(`.term-state`) | 폴더 열기 | 새로 시작 / 이어 가기 | 종료 | 본문 |
|---|---|---|---|---|---|
| 시작 전 · 세션 없음 | (비움) | 활성 | disabled | disabled | 빈 칸: "폴더를 열거나, 세션을 고른 뒤 새로 시작·이어 가기를 누르세요" + 보조 줄 "터미널 안에서 F6을 누르면 버튼으로 나옵니다" |
| 시작 전 · 세션 고름 | `proj` | 활성 | 활성 | disabled | 빈 칸: "proj — 새로 시작하거나 지난 대화를 이어 갑니다" + 같은 보조 줄 |
| 폴더 고르는 중 | 그대로 | disabled | disabled | disabled | 그대로 |
| 시작하는 중 | `proj · 시작하는 중…` | disabled | disabled | disabled | xterm(빈 화면) |
| 실행 중 | `proj · 실행 중` | disabled | disabled | 활성 | xterm |
| 종료하는 중 | `proj · 종료하는 중…` | disabled | disabled | `aria-disabled="true"`(점선, 포커스 유지) | xterm |
| 종료됨 | `proj · 종료됨` | 활성 | 세션 있으면 활성 | disabled | xterm 내용 유지 + 마지막 줄 `── 종료됨 ──`(ANSI 90 = dark) |
| 오류: claude 없음 | 이전 그대로 | 활성 | 세션 있으면 활성 | disabled | 오류 줄 "✕ 오류: claude를 찾을 수 없습니다 — PATH에 claude가 있는지 확인하세요" + 아래는 이전 화면(빈 칸 또는 xterm) |
| 오류: 폴더 검증 실패 | 이전 그대로 | 활성 | 세션 있으면 활성 | disabled | 오류 줄 "✕ 오류: 폴더를 열 수 없습니다 — {Rust check_cwd 사유}" + 이전 화면 |

- 상태 글의 폴더 이름: **실행 중·종료됨이면 터미널이 돌고 있는(돌았던) 폴더**, 시작 전이면 고른 세션의 폴더. 실행 중에 왼쪽에서 다른 세션을 눌러도 상태 글은 바뀌지 않는다.
- 오류 줄은 xterm에 쓰지 않고 DOM 한 줄(`p.term-err`, 글자 ink 13px 일반 글꼴, 머리말 `✕ 오류:`만 픽셀 — 지난 `.chat-end.err`와 같은 모양). 이유: 사유에 로그에서 온 경로가 들어갈 수 있고, xterm `write`는 제어 문자열을 해석하므로 신뢰할 수 없는 글을 넣으면 안 된다. DOM에는 텍스트 노드로만 넣는다(`dangerouslySetInnerHTML` 금지). 다음 시작이 성공하면 지운다.
- xterm에 프론트가 직접 쓰는 글은 상수 `\r\n\x1b[90m── 종료됨 ──\x1b[0m\r\n` 하나뿐이다.
- 성공 상태는 "실행 중"이 곧 성공이다. 별도 성공 문구는 없다.

## 3. 사용하는 디자인 토큰

### 칸·머리 줄 (기존 토큰만)
- 패널: `border.panel`, `border.panel-shadow`, `radius.panel`, `space.panel-pad-y/x`, `role.panel-bg`.
- 머리 줄 간격 `space.2`, 버튼 `.btn`(= `border.box`, `font.size.pixel`, `layout.target-min` 24px), 비활성 `border.input-disabled` 모양(점선 dark).
- 상태 글 `role.text-muted`(dark), `font.family.pixel`. 빈 칸 글 `.empty`(dark 13px), 보조 줄 `.note`(dark 11px).
- 오류 줄 `role.text`(ink), `font.size.body`.

### 터미널 (`tokens.json` → `terminal`, 새 키)
| 키 | 값 | 비고 |
|---|---|---|
| font-family | `{font.family.mono}` = "Cascadia Mono", Consolas, monospace | 고정폭 일반 글꼴. 픽셀 글꼴 아님. 한글은 OS 대체 글꼴(맑은 고딕)로 2칸 폭 |
| font-size | `{font.size.body}` = 13px | 본문과 같은 크기 |
| line-height | `1` (xterm `lineHeight`) | **새 값.** 상자 그리기 문자(╭─│)가 줄 사이에서 끊기지 않게. 본문 1.5를 쓰면 claude 입력 상자 테두리에 틈이 생긴다 |
| pad | 4px (= `space.1`) | `.term` 안쪽 여백. 포커스 링 자리 |
| focus-offset | -2px | **새 값.** 포커스 링을 칸 안쪽에 그려 패널 overflow에 잘리지 않게 |

그 밖의 xterm 옵션(토큰 아님, Engineer 참고): `cursorStyle: "block"`, `cursorBlink: false`(움직임 줄이기 설정을 따로 처리할 필요 없음), `drawBoldTextInBrightColors: false`(굵게가 색을 바꾸지 않게), `minimumContrastRatio: 1`(기본값 유지 — 올리면 xterm이 팔레트 밖 회색을 만든다), `allowTransparency: false`, `fontWeight`·`letterSpacing` 기본.

### xterm 테마 매핑 표 (새 색 0개)

| xterm 키 | 명암 | 근거 |
|---|---|---|
| background | paper `#f8f8ec` | 패널 바탕과 같아 칸 안이 한 장의 종이로 보인다 |
| foreground | ink `#1c1e18` | 본문 글자(대비 15.6:1) |
| cursor / cursorAccent | ink / paper | 블록 커서 = 반전 |
| selectionBackground / selectionInactiveBackground | light `#b4b8a4` | 그 위 ink 글자 8.2:1 |
| selectionForeground | ink | |
| scrollbarSliderBackground | dark | 기존 스크롤바(`ink` on `light`)와 같은 계열 |
| scrollbarSliderHover/ActiveBackground | ink | |
| black (0) | ink | 기본 글자와 같음 |
| red (1), brightRed (9) | ink | 오류 글이 가장 진해야 한다. 색 대신 claude의 기호(✗, ⎿ Error)로 구분 |
| green·yellow·blue·magenta·cyan (2–6) | dark | 강조·보조 글자. paper 위 6.0:1 |
| brightGreen…brightCyan (10–14) | dark | 위와 같음 |
| brightBlack (8) | dark | claude의 흐린 글(힌트, `? for shortcuts`) = `role.text-muted` |
| white (7) | light | 밝은 바탕 강조(배경으로 쓰일 때 ink 글자 8.2:1). 글자색으로 paper 위에 오면 1.9:1 — 일반 밝은 테마 터미널과 같은 한계 |
| brightWhite (15) | paper | 진한 배경 위 글자(paper on dark 6.0:1, on ink 15.6:1) |

알려진 한계(열린 질문 1·2):
- 진한 배경(ANSI 41–46, 100–106 → dark) 위의 기본 글자(ink)는 2.6:1이다. 4명암으로는 "paper 위 글자"와 "ink 글자 아래 배경"을 한 색이 동시에 만족할 수 없어, 글자 쪽을 택했다(TUI 대부분이 글자 색). QA 스크린샷에서 diff 줄 등이 읽기 어려우면 다시 본다.
- 24비트(truecolor) 색 코드는 위 팔레트를 거치지 않고 그대로 그려진다. claude 기본 테마는 truecolor를 쓰므로 이 표만으로는 "4명암 외 색 없음"(성공 기준 10)이 보장되지 않는다.

## 4. 접근성 기준

- **포커스**: 시작이 성공하면 포커스를 xterm으로 옮긴다(`term.focus()`). `.term:focus-within`에 `outline: 2px solid ink; outline-offset: -2px`. 버튼은 전역 `:focus-visible` 링 그대로.
- **키보드 나가기(갇힘 방지, WCAG 2.1.2)**: xterm은 Tab·Shift+Tab을 claude에 넘겨야 한다(claude가 씀). 그래서 **F6 / Shift+F6**을 `attachCustomKeyEventHandler`에서 가로채(`return false`) 머리 줄 첫 활성 버튼(없으면 `h2#h-term`, `tabIndex=-1`)으로 포커스를 옮긴다. 이 안내는 빈 칸 보조 줄과 xterm 입력의 aria 이름에 넣는다. 버튼에서 터미널로는 Tab으로 들어간다.
- **이름**: 섹션 `aria-labelledby="h-term"`("터미널"). xterm 입력 textarea(`term.textarea`)에 `aria-label="claude 터미널. F6: 버튼으로 나가기"`. `새로 시작`·`이어 가기`는 보이는 글을 앞에 둔 `aria-label="새로 시작: proj 폴더"`, `"이어 가기: proj 세션"`(2.5.3 보이는 이름 포함).
- **알림**: `p.sr[role=status]` 하나로 상태 변화만 읽는다 — "proj 폴더에서 claude 실행 중", "claude가 종료되었습니다", 오류 줄 전문. 터미널 출력은 알리지 않는다. 같은 문구 반복은 기존 `say()`처럼 비웠다 넣기.
- **종료 중**: `disabled` 대신 `aria-disabled="true"`(포커스를 잃지 않게, 기존 `중단` 규칙). 이 규칙(`.btn[aria-disabled="true"]`)은 지워질 `Chat.css`에서 `App.css`로 옮긴다.
- **종료 후 포커스**: 포커스가 터미널에 있었으면 머리 줄 첫 활성 시작 버튼으로 옮긴다(xterm에 남으면 입력이 아무 데도 가지 않는다). 종료된 xterm은 `disableStdin = true`.
- **대비**: 위 표의 글자·바탕 조합은 진한 배경 예외를 빼고 모두 4.5:1 이상. 상태 글(dark on paper) 6.0:1.
- **스크린리더 모드**: xterm `screenReaderMode`는 기본 꺼짐 유지(범위 밖). 열린 질문 4.
- **움직임**: 커서 깜빡임 없음. 새 애니메이션 없음.
- **좁은 폭**: 최소 창 960×640에서 머리 줄 한 줄 유지, 상태 글만 말줄임. 오류 줄은 줄바꿈(`overflow-wrap: anywhere`).

## 5. Engineer 요청 (디자인 파일 밖, 직접 고치지 않음)

1. `src/App.css:62` `.chat` → `.terminal`. `App.css:149` 주석과 `.tag`(채팅 전용이면 삭제, `grep tag` 확인).
2. `.btn[aria-disabled="true"]` 규칙을 `Chat.css`에서 `App.css`로 이동.
3. 새 CSS는 `layout_v4.html`의 "터미널" 블록(`.terminal` ~ `.term:focus-within`)을 그대로 옮긴다. `.term-screen`·`.d`·`.k`는 시안 전용이라 옮기지 않는다.
4. xterm 테마 객체는 `tokens.json` `terminal.theme`의 참조를 풀어 hex 4개로만 쓴다(`--c-*` 값과 같음).
5. 오류·폴더 이름은 텍스트 노드로만 표시. xterm에는 상수 종료 줄 외에 프론트 글을 쓰지 않는다.

## 6. 열린 질문

1. **truecolor 색 (성공 기준 10과 충돌 가능)**: claude 기본 테마는 24비트 색을 내보내 4명암 밖 색(주황 등)이 터미널에 보일 수 있다. 선택지: (가) Rust의 실행 환경에 `FORCE_COLOR=1`을 상수로 넣어 16색으로 낮춘다 — claude가 따르는지 미확인, BRIEF가 범위 밖으로 둔 "환경변수 조정"에 해당해 사용자 승인 필요. (나) 사용자가 claude에서 `/theme`을 "Light mode (ANSI colors only)"로 한 번 바꾼다(앱은 설정을 건드리지 않음). (다) truecolor 색은 허용하고 기준 10을 "Orbit이 그리는 부분은 4명암"으로 읽는다. **권고: (나)** — 코드 변경 없음, 사용자 설정을 덮지 않음. 태스크 1 실측 때 QA가 기본 테마 스크린샷으로 실제 색을 먼저 확인.
2. **진한 배경 위 ink 글자 2.6:1**: 태스크 1 스크린샷에서 claude가 ANSI 배경색을 쓰는 곳(diff 등)이 있는지 본다. 있으면 그 쌍만 다시 정한다.
3. **F6 충돌**: claude TUI가 F6을 쓰는지 미확인. 쓰면 다른 키(예: Ctrl+Shift+F6)로 바꾼다.
4. **스크린리더 모드**: 켜면 출력이 낭독되나 성능 비용이 있다. 혼자 쓰는 앱이라 이번엔 끔. 필요하면 별도 run.
5. **lineHeight 1의 한글**: 맑은 고딕 대체 글꼴이 Cascadia보다 키가 커 위아래가 잘리는지 실측. 잘리면 1.1로 올리고(상자 틈과 맞바꿈) 토큰을 고친다.

## 확인 범위

- 시안(`layout_v4.html`)은 브라우저 패널에서 열어 첫 화면과 변형 6개를 스크린샷으로 확인함(800×600 창이라 첫 화면은 960 최소폭보다 좁게 보임). 실제 앱은 아직 없어 보지 못함 — 구현 뒤 시각 리뷰에서 본다.
- `orbit:design-system-guard` 스킬은 이 세션의 도구 목록에 Skill 도구가 없어 불러오지 못했다. 대신 4명암 외 색 0개, 대비 수치, 포커스, 최소 폭을 직접 점검했다.
- 대비 값은 4명암의 상대 휘도로 계산: ink/paper 15.6, ink/light 8.2, paper/dark 6.0, dark/paper 6.0, dark/light 3.2(쓰지 않음), light/paper 1.9(글자로 쓰지 않음), ink/dark 2.6(한계 2).
