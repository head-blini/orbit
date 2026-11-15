# PLAN_CHECK — 20261114-chat-sidecar

대상: PLAN.md 0차. 기준: BRIEF 성공 기준 1~19, DECISIONS 1~11, DESIGN, CLAUDE.md 체크리스트.

## 차단 이슈

없음.

## 항목별 판정

1. 목표 덮기 — 통과. 기준 1~19가 "성공 기준 대응" 표에서 모두 태스크에 걸린다. 기준 2의 6종(text_delta·allow/deny·세션 규칙·answers·모르는 타입·깨진 줄)은 S1 (a)~(g)에 있다. D10(상단 바)은 F2. 기준 19는 L1.
2. 검증 가능성 — 통과. 모든 태스크에 명령과 기대 결과가 있다. S1·R1은 "구현 전 실패 → 후 통과"를 요구한다. 실행 확인 필요(읽기만 함): `node --test sidecar/core.test.mjs`, `cargo test`, `npm.cmd run build`, `tsc --noEmit`, QA 절차 전체.
3. 경로 실재 — 통과. 직접 열어 확인한 것: `lib.rs`(AppState 15행, `.run(generate_context!())` 191행, generate_handler 182~190행, `get_roadmap`의 락 후 cwd 복제 72~75행), `roadmap.rs::for_cwd`(127~144행, 드라이브 절대 경로 검사가 그 안에 있어 `local_abs` 분리가 맞다), `App.tsx`(`액정 폴더` 189행, `제거` 버튼 187행, 채팅 칸 229~238행, `run`의 "제거할 항목 없음" 152행), `App.css` 79·150~163행, `types.ts`의 `folderName`(36행 export, F1이 import 가능), ROADMAP.md 9행 `- [ ] ⑥`. 새 파일(`sidecar/*`, `chat.rs`, `Chat.tsx/css`)은 "(새)"로 표시돼 있고 `sidecar/`는 현재 없다. `.credentials`·`ANTHROPIC_API_KEY` 읽기 코드는 계획에 없다.
4. 빠진 연결 — 통과. 호출부(`for_cwd`, `run()`), 테스트(`core.test.mjs`, `chat::`, 기존 `roadmap::`), 설정(Cargo·capability·CSP 불변과 R2·V1 diff 검사), export(`mod chat`, `pub fn run`), 폐기 CSS(App.css 옛 채팅 규칙)까지 있다. 프로토콜 표(stdin 6종·stdout 9종·명령 5종)가 S1·S2·R1·R2·F1에 같은 이름으로 쓰인다: `permit`(Rust가 `decision` 포함 JSON으로 중계)·`answer`·`interrupt`·`close`·`exit`(Rust 생성)·`closed`·`stopped` 모두 양끝에서 맞는다. `session` 이벤트는 프론트가 무시해도 된다고 명시.
5. 웨이브 충돌 — 통과. W1(D1 design/, N1 package*, S1 sidecar/core*, R1 chat.rs·roadmap.rs·lib.rs 한 줄, F1 types.ts·Chat.*)과 W2(S2 chat.mjs, R2 lib.rs, F2 App.*, L1 SPEC·ROADMAP) 모두 겹침 없음. R1(lib.rs `mod`) → R2(lib.rs)는 웨이브가 달라 순서가 맞다. S2는 N1·S1에 의존, F2는 F1, R2는 R1. V1은 전부에 의존.
6. 범위 — 통과. 모델 선택·resume·추가 지시·plugins·DB·자동 승인·bypass/acceptEdits는 계획에 없고, S2 grep이 `settingSources`·`plugins`·`bypassPermissions`·`acceptEdits`가 chat.mjs에 없음을 검사한다. D10의 상단 바 변경은 DECISIONS 10으로 승인된 것이다. D1(디자인 커밋)은 이미 작업 트리에 있는 Designer 산출물을 커밋하는 것이라 범위 안.
7. 프로젝트 규칙 — 통과.
   - 127.0.0.1·토큰: 사이드카는 포트를 열지 않고(grep `listen(`·`createServer`), 훅 서버 코드는 불변(기준 16).
   - 인증 정보: 읽지 않음(grep), `redact`를 error·SDK stderr·진단 줄에 적용, 진단은 id만, Rust는 io 오류를 `kind()` 문구로만 노출, `dev.log`·`app_data_dir` 검사(V1-5). 근거는 충분하다.
   - settings.json: 건드리지 않음, `updatedPermissions`를 절대 넣지 않고 `settings.local.json` 부재를 V1에서 확인, 해시 전후 비교.
   - HTML: JSX 텍스트만, grep으로 `dangerouslySetInnerHTML` 등 부재 확인.
   - capability·CSP: 변경 없음, diff로 확인. cwd는 Rust Store에서만 나오고 `local_abs`+`is_dir` 검사.
   - 앱 종료 정리: `RunEvent::Exit` → `stop()`(close → 3초 → `taskkill /T /F`), 사이드카 stdin EOF 경로, 기준 12를 V1-7.7에서 PID 단위로 확인. 강제 종료 시에는 EOF 경로에만 의존한다고 W1에 적혀 있다.
   - 가장 작은 변경: cargo 의존성·플러그인·프론트 테스트 러너 추가 없음, peer는 기본적으로 package.json에 넣지 않음.
   - Orbit이 꺼져 있어도 Claude Code에 영향 없음: 훅·서버 코드 불변.

grep 직접 실행: 계획의 검증 grep은 모두 아직 없는 파일(`sidecar/`, `chat.rs`, `Chat.tsx`) 대상이라 지금은 실행할 수 없다. 기존 파일 대상 `Select-String`은 위 경로 확인으로 대신했다. `claude plugin validate`는 해당 없음(하네스 무변경).

## 참고 이슈 (실패 아님)

- R1 `pump`: "MAX_LINE 초과 줄 버림"을 `read_until`로 구현하면 읽는 동안 메모리가 상한을 넘을 수 있다. 줄을 읽는 중에도 상한에서 끊고 나머지는 흘려 보내는 방식이어야 의미가 있다. 테스트 `MAX_LINE+1`바이트 줄이 이것을 부분적으로만 잡는다.
- S1의 `Select-String sidecar\*.mjs` grep은 `core.test.mjs`도 훑는다. 테스트 본문에 `credentials`나 `updatedPermissions:` 글자가 들어가면 오탐이 난다(테스트에서 `localSettings` 제안 모양을 쓰므로 `credentials`는 피할 것).
- W2(interrupt 뒤 result 미확인)·W14(Tauri `RunEvent::Exit` 이름 미확인)·W3·W6은 계획이 미확인으로 표시하고 확인 단계(S2 d.ts, R2 cargo build, V1)를 두었다. 충분하다.
- W13: SPEC 112행 "API 키는 ⑥에서 OS 키체인"이 실제와 어긋난 채 남는다. BRIEF 9가 다른 절을 막아 의도된 것이며 다음 문서 run 후보로 적혀 있다.
- `node --test sidecar/core.test.mjs`가 CLAUDE.md 명령 목록에 없는 것은 사용자 몫으로 적혀 있다(관문이 막음). 출고 때 사용자에게 다시 알릴 것.

VERDICT: PASS
