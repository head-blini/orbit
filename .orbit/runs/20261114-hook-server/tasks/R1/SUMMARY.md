SUMMARY R1: A1~A6 처리 완료, 커밋 4c2a2a4 (orbit/20261114-hook-server).

바꾼 파일: src-tauri/src/hooks.rs, config.rs, lib.rs, src/App.tsx

검증 (cargo test는 src-tauri에서 실행)
- 수정 전 (테스트만 추가한 상태): `identical_reinstall_writes_and_backs_up_nothing` FAILED. left: Ok(Some(".../settings.json.orbit-backup-1794634879709")), right: Ok(None). hooks 테스트 11개 중 10개 통과, 1개 실패.
- 수정 후: `cargo test` -> `test result: ok. 27 passed; 0 failed`
- `npm run build` -> `✓ built in 91ms` (tsc 통과)

항목별 처리
- A1: write_atomic이 직렬화 결과와 기존 바이트가 같으면 쓰지도 백업하지도 않고 Ok(None)을 반환한다. App.tsx는 요청 중 두 버튼을 disabled 처리한다 (busy 상태).
- A2: 호출 직전에 결과 줄을 "처리 중…"으로 바꾼다.
- A3: config.rs에서 rename 실패 시 `.tmp`를 지운다. 이 분기를 타는 테스트는 추가하지 않았다.
- A4: 명령 3개를 `#[tauri::command(async)]`로 바꿨다.
- A5: 새 테스트 `mixed_group_keeps_foreign_handlers`. 한 그룹에 사용자 command 훅, Orbit이 아닌 http 훅, Orbit 핸들러를 섞어 두고, 설치·제거 뒤 원본이 그대로인지 본다. 테스트 헬퍼 `orbit_handlers`는 `is_orbit` 대신 헤더 문자열을 직접 본다.
- A6: 백업 이름이 이미 있으면 `-1`, `-2`처럼 번호를 붙여 덮어쓰지 않는다. 새 테스트 `rapid_writes_keep_original_backup`은 연속 5회 설치 뒤 백업이 5개이고 그중 하나가 원본 FIXTURE와 같은지 본다.

계획과 달라진 점 / 못 한 것
- A6 테스트는 수정 전에도 통과했다. 이 환경에서는 설치 사이에 ms가 달라져서 충돌을 재현하지 못했다. 그래서 충돌 방지 코드가 실제로 도는 것은 확인하지 못했고, 회귀 방지용 테스트일 뿐이다.
- A1로 설치 결과가 None이어도 "새 파일"이 아니라 "변경 없음"일 수 있게 됐다. 그래서 UI 문구를 "성공 (백업 없음: 새 파일이거나 변경 없음)"으로 바꿨다. 지시한 범위 밖의 문구 변경이다.
- 앱을 띄우지 않았다. 버튼 disabled와 "처리 중…" 동작은 눈으로 확인하지 못했고 빌드 통과만 확인했다.
- 실제 `~/.claude/settings.json`과 저장소 `.claude/`는 읽거나 쓰지 않았다. 토큰 값도 출력하지 않았다.
