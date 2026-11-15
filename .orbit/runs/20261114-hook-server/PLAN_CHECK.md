# PLAN_CHECK: 20261114-hook-server (재검사, PLAN v2)

검사 대상: PLAN.md v2 (BRIEF 성공 기준 1~10, DECISIONS 1~9, CLAUDE.md 코드 규칙·보안 체크리스트).
실행한 명령: 없음. 계획의 검증은 cargo·npm·Select-String·앱 실행이라 읽어서 판단했다(전부 "실행 확인 필요").

## 이전 지적 해소 여부

- B1 (실제 `~/.claude/settings.json`을 읽게 되는 검증): 해소. T5 검증에서 "기본 실행" 항목이 사라졌고, 앱은 항상 `ORBIT_CLAUDE_SETTINGS`를 임시 사본으로 지정한 같은 명령줄에서만 띄운다. 화면 경로가 사본이 아니면 즉시 종료·보고한다. QA 머리말에도 같은 규칙이 있다. 기본 경로 표시는 기준 10(사용자 확인)으로 넘어갔고 대응표 10행과 일치한다.
- R1 (디버그 전용 변수 확인): 반영. T5 검증에 `Select-String ... ORBIT_CLAUDE_SETTINGS` 1건이고 `#[cfg(debug_assertions)]` 블록 안이라는 확인이 있다.
- R2 (listen 가정 조기 확인): 반영. T5 검증에 curl POST 1건 → 타임라인 `T5` 한 줄이 있다.
- R3 (단일 스레드 느린 클라이언트): 반영. 위험 R10으로 추가됐다.

## 7개 항목

1. 목표 덮기: 통과. 대응표가 기준 1~10을 모두 태스크에 연결한다. 결정 1~9도 T0~T6과 설계 요지에 들어 있다.
2. 검증 가능성: 통과. 모든 태스크에 명령과 기대 결과가 있다. T1~T3은 테스트 먼저. T5의 `tauri dev`는 실행 확인 필요.
3. 경로 실재: 통과. lib.rs, Cargo.toml, App.tsx, App.css, SPEC.md는 이전 검사에서 직접 확인했다. server.rs, hooks.rs, config.rs는 T0이 새로 만든다고 명시돼 있다.
4. 빠진 연결: 통과. Cargo.lock(T0), generate_handler(T5), 프론트 API 의존성(기존), capability·CSP 무변경과 그 근거와 후속 대책이 있다.
5. 웨이브 충돌: 통과. W2(server/hooks/config/App) 파일이 서로 다르고 W3(lib.rs/SPEC.md)도 다르다. 순서 T0 → T1~T4 → T5가 맞다.
6. 범위: 통과. 토큰 회전·프로젝트 설치·정책 감지 없음. T6(SPEC 정합)은 결정 7로 정당화된다.
7. 프로젝트 규칙: 통과. 127.0.0.1 바인딩 테스트(k), 상수 시간 비교, Host/Origin 검사, 본문 상한(chunked 포함), 백업 후 병합과 tmp → rename, `dangerouslySetInnerHTML` 금지 grep, 토큰 비노출, 모르는 필드 내성(테스트 j)이 모두 있다.

## 차단 (FAIL)

없음.

## 참고 (차단 아님)

- T5의 "화면 경로가 사본이 아니면 종료"는 앱이 이미 시작 때 `get_status`로 대상 파일을 읽은 뒤에 하는 확인이다. 디버그 빌드에서는 변수가 항상 적용되므로 실제로는 문제가 되지 않고, 변수를 빠뜨리지 않는 것이 1차 방어다. 현재 문구로 충분하다.
- 미확인 가정(capability, getrandom `fill`, tiny_http `server_addr`, `--settings` 동작)은 위험 R1~R3에 대안과 함께 적혀 있어 계획이 무너지지 않는다.

VERDICT: PASS
