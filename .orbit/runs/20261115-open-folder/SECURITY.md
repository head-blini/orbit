# SECURITY — 20261115-open-folder (security-deep)

COMMIT: 32e9d044eb533a1ccc322a7c954c8868b57a15ab

범위: `git diff main...orbit/20261115-open-folder` (ROADMAP.md, Cargo.toml/lock, chat.rs, lib.rs, App.tsx, Chat.tsx). 작업 트리 깨끗(`git status --porcelain --untracked-files=no` 출력 없음).

## 위협 모델 (변경분)

- 자산: 사이드카(Claude Agent SDK)가 도는 cwd = 에이전트가 읽고 쓰는 범위, 사용자 NTLM 해시(UNC 접속 시), 사용자 로컬 경로.
- 진입점: (1) 웹뷰 → `chat_open_folder`(인자 없음), (2) 웹뷰 → `chat_send(session:"", text)`의 picked 분기, (3) OS 폴더 선택 창이 돌려준 경로 → `Chat.picked` → sidecar `start.cwd`, (4) 새 플러그인 `tauri-plugin-dialog`의 IPC 명령·init 스크립트.
- 신뢰 경계: 웹뷰(신뢰 안 함) ↔ Rust 명령, OS 대화상자 결과(사용자 선택, 모양은 신뢰 안 함) ↔ 파일 시스템/사이드카.

## 발견 사항

차단: 없음.

### R1 권고 — 심볼릭 링크/정션을 통한 네트워크 경로
- 위치: `src-tauri/src/chat.rs:133-145` (`check_cwd`), `src-tauri/src/roadmap.rs:127-138`
- 시나리오: 사용자가 로컬 드라이브의 정션·디렉터리 심볼릭 링크(`C:\x` → `\\host\share`)를 고르면 문자열 검사(`local_abs`)는 통과하고 `is_dir()`와 사이드카가 링크를 따라가 SMB 접속(해시 전송)이 생긴다. 공격자가 링크를 미리 심어야 하고 사용자가 직접 골라야 하며, 대화상자 자체가 이미 그 폴더를 열었으므로 이번 변경이 새로 여는 위험은 작다.
- 권장 수정(후속): 필요하면 `std::fs::canonicalize` 결과에 `local_abs`를 다시 적용(verbatim 접두 벗긴 뒤). 이번 run 범위 밖.

### R2 권고 — "경로는 웹뷰로 나가지 않는다"의 범위
- 위치: `src-tauri/src/lib.rs:121-134`, `src-tauri/src/chat.rs:39-40`(sidecar 출력 emit)
- 시나리오: `chat_open_folder`는 폴더 이름만 돌려주고(드라이브 루트면 `C:\` 전체, 사용자가 고른 값이라 무해) 오류 문구에 경로를 넣지 않는다. 다만 대화가 시작되면 SDK의 도구 입력·권한 요청에 절대 경로가 실려 `chat` 이벤트로 웹뷰에 간다. 기존 세션 채팅과 같은 동작이며 화면 표시는 텍스트(HTML 아님)다. 웹뷰가 경로를 받아도 cwd로 되돌려 쓸 길은 없다(아래 확인 3).
- 권장 수정: 없음. 문서·주석 표현을 "명령 반환값에 경로가 없다"로 좁히면 오해가 없다.

### R3 권고 — dialog 플러그인 init 스크립트가 `window.alert/confirm`을 덮어씀
- 위치: `src-tauri/src/lib.rs:163` (`.plugin(tauri_plugin_dialog::init())`), 상류 `tauri-plugin-dialog-2.8.4/src/init-iife.js`
- 시나리오: 스크립트가 `alert/confirm`을 `plugin:dialog|message` IPC로 바꾼다. capability에 `dialog:*`가 없어 호출은 ACL에서 거부된다 → 권한 확대 없음. 프론트에 `alert(`/`confirm(` 사용처 없음(grep 0건). 기능 영향만 있음.
- 권장 수정: 없음. 앞으로 `dialog:*`를 capability에 넣지 않는 상태를 유지(넣으면 웹뷰가 임의 경로 대화상자·fs scope 확장 경로를 얻는다).

### R4 권고 — 의존성 audit 미실행
- 위치: `src-tauri/Cargo.lock` (새 crate: `tauri-plugin-dialog 2.8.4`, `tauri-plugin-fs 2.7.1`, `rfd 0.17.2`)
- 시나리오: 알려진 취약점 DB 대조를 못 했다.
- 권장 수정(후속): `cargo audit`(cargo-audit) 설치 후 실행. 설치는 이 역할 범위 밖이라 하지 않았다.

## 확인한 것

1. 비밀값: `git diff main...HEAD | grep -i -E "token|secret|passw|api[_-]?key|lclk1|Users\\"` → 출력 없음. 새 오류 문구("폴더 경로를 읽을 수 없습니다", "로컬 절대 경로가 아닙니다", "폴더가 없습니다")에 경로·토큰 없음. 로그 출력 추가 없음.
2. 프론트 문자열이 cwd로 쓰이지 않음: `chat_open_folder`는 인자가 없다. `chat_send`의 `session==""` 분기는 `state.chat.picked()`만 쓰고, picked는 `chat_open_folder`(OS 대화상자 결과)에서만 `set_picked`된다. picked가 없으면 `None` → `spawn_with`가 "세션 폴더를 알 수 없습니다"로 거부. 웹뷰가 받는 것은 폴더 이름(표시용)뿐이고 다시 Rust로 보내지 않는다(`Chat.tsx`는 `session:""`만 보냄).
3. 경로 검사: 대화상자 경로 → `to_str()`(비 UTF-8 거부) → `strip_verbatim_disk`(`\\?\X:`만 벗김, `\\?\UNC\` 유지) → `check_cwd`(빈 값·`local_abs`=Disk prefix+절대·`is_dir`) → 저장. 사이드카 기동 직전 `spawn_with`에서 `check_cwd` 재실행(TOCTOU 완화). `local_abs`는 `\\server\share`, `\\?\C:\`, `\\.\C:\`, `\\?\UNC\`, `C:rel`, `\rooted`를 거부(roadmap.rs 테스트), chat.rs 새 테스트가 UNC·verbatim UNC 거부와 문구를 고정. 엣지: `\\?\C:`(뒤 없음)는 `C:`가 되어 `local_abs`에서 거부. 네트워크 매핑 드라이브(`Z:\`)는 Disk prefix라 통과하지만 OS가 이미 연결한 세션이라 새 해시 유출 경로가 아님.
4. capability 변경 0: `git diff main...HEAD -- src-tauri/capabilities/` 빈 출력. `src-tauri/capabilities/default.json` = `core:default`, `opener:default`. 생성 스키마 `gen/schemas/capabilities.json`도 동일(추적 안 됨). `tauri.conf.json` CSP 변경 없음.
5. 하위 의존성 권한: `tauri-plugin-dialog-2.8.4/src/lib.rs:203-228` `init()`은 `dialog` 플러그인만 등록(명령 open/save/message), `tauri_plugin_fs::init()`을 부르지 않는다. fs는 `FsExt::try_fs_scope()`로만 쓰이고 fs 플러그인이 등록되지 않아 `None` → scope 변경 없음. `lib.rs`에서 `.plugin(tauri_plugin_fs::init())` 없음. 플러그인 권한은 Tauri 2에서 capability에 적어야만 부여(자동 부여 없음); dialog `default.toml`의 `allow-open/save/message`는 capability에 없어 웹뷰에서 호출 불가. `rfd`는 네이티브 대화상자 라이브러리로 IPC 노출 없음.
6. 새 의존성 하나: `Cargo.toml` 추가 줄 `tauri-plugin-dialog = "2"` 하나. `package.json` 변경 없음(`@tauri-apps/plugin-dialog` 미추가).
7. 의존성 audit: `cargo audit --version` → `error: no such command: \`audit\`` → **미실행**(R4).
8. 웹뷰 → 화면: 폴더 이름은 JSX 텍스트로만 렌더(`emptyText`, sep 항목). `dangerouslySetInnerHTML` 추가 없음.
9. CLAUDE.md 체크리스트: 서버 바인딩·토큰·Origin·본문 크기·settings.json 쓰기 — 이번 diff가 건드리지 않음. HTML 삽입 없음, 경로는 정규화 후 범위 검사, capability·CSP 최소 유지, 신뢰 경계(webview → Rust 명령) 위 3·5로 확인.
10. 에이전트 설정: diff에 `CLAUDE.md`, `.claude/`, `harness/`, `.mcp.json` 변경 없음 → agent-config-audit 대상 없음. 읽은 파일에서 역할에게 하는 지시성 문구 없음.
11. 동시성: `chat_open_folder`가 확정 시 `state.chat.stop()`으로 기존 사이드카를 끝낸 뒤 picked 설정 → 이전 cwd 프로세스에 새 텍스트가 섞이지 않음.

## 후속 목록
- R1 canonicalize 후 재검사(정션/심링크 → UNC)
- R4 cargo-audit 도입 후 실행
- `dialog:*` capability 미추가 유지(R3)

VERDICT: PASS
