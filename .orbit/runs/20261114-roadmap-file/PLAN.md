# PLAN — 20261114-roadmap-file (quick)

## 목표
저장소 루트에 `ROADMAP.md`를 만들어 로드맵 패널(마일스톤 ⑤)이 이 저장소 세션에서 비어 있지 않게 한다. 내용은 SPEC.md·.orbit/decisions.md의 기존 기록을 옮긴다.

## 설계 요지
- 파서(`src-tauri/src/roadmap.rs` `classify`)는 앞 공백을 지운 뒤 `## `(묶음), `- [ ] `(미완료), `- [x] `/`- [X] `(완료)로 시작하는 줄만 읽고 나머지(`# `, 빈 줄, 본문)는 무시한다. 글이 비면 버린다. 상한: 256KiB, 항목 500개, 줄 2000바이트. 이 파일은 모두 한참 아래다.
- 그래서 `# 제목` 한 줄 + `## 묶음` 3개 + 체크박스 15줄, 중첩 없이, UTF-8(BOM 없음)로 쓴다. 묶음이 아닌 줄을 `## `로 시작하지 않는다.

## 태스크 표

| id | 할 일 | 파일 경로 | 웨이브 | 의존 |
|---|---|---|---|---|
| T1 | 아래 문안 그대로 새 파일을 만들고, 일회성 검증을 한 뒤 되돌리고, `ROADMAP.md`만 한 커밋으로 남긴다 | `C:/Users/lclk1/Projects/orbit/ROADMAP.md` (새 파일) | 1 | 없음 |

스키마·인터페이스 변경 없음. 코드·테스트·설정·capability 변경 없음.

### T1 파일 전체 문안 (`ROADMAP.md`)

```markdown
# 오르빗 로드맵

## 1단계: 관찰 · 실행
- [x] ① 앱 뼈대 + 빈 화면
- [x] ② 훅 서버 + 설치 도우미
- [x] ③ 로그 감시
- [x] ④ 그래프 UI
- [x] ⑤ 로드맵 패널 + 노드 이름
- [ ] ⑥ 프롬프트 입력창 + Agent SDK 사이드카 + UI 권한 승인

## 2단계: 설계 · 자동화
- [ ] 그래프 편집: 노드 추가·연결, 노드별 모델·재시도·스키마
- [ ] 루프 설정: 종료 조건, 최대 반복, 예산 상한, 실패 알림
- [ ] 그래프 이름 붙여 저장 · 재사용
- [ ] 그래프 → Dynamic Workflow / 헤드리스 실행 변환, 스케줄 실행
- [ ] 자동화 에이전트는 최소 권한 + 샌드박스로 실행

## 미뤄 둔 작업
- [ ] DB(orbit.db) 도입 (별도 run)
- [ ] Product 서비스 평가 모드
- [ ] 하네스 파일 등급 나누기
- [ ] 맥용 앱 빌드
```

기대 값: 묶음 3, 항목 15, 완료 5(미완료 10), skipped=false.

### T1 검증 방법

1. 일회성 확인 (실제 파서로, 저장소에 남기지 않음): `src-tauri/src/roadmap.rs`의 `mod tests` 끝(마지막 `}` 앞)에 임시로 붙인다.
   ```rust
   #[test]
   fn tmp_repo_roadmap() {
       let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
       let (lines, skipped) = found(read(repo));
       let n = |m: Mark| lines.iter().filter(|x| x.mark == m).count();
       assert_eq!((n(Mark::Heading), lines.len() - n(Mark::Heading), n(Mark::Done), skipped), (3, 15, 5, false));
   }
   ```
   `src-tauri/`에서 `cargo test tmp_repo_roadmap` → `test roadmap::tests::tmp_repo_roadmap ... ok`, `1 passed`.
2. 되돌리기: `git checkout -- src-tauri/src/roadmap.rs` → `git status --short` 출력이 `?? ROADMAP.md` 한 줄뿐.
3. 회귀: `src-tauri/`에서 `cargo test roadmap` → 기존 roadmap 테스트 전부 pass(임시 테스트 이름 없음).
4. 커밋: `git add ROADMAP.md` 후 `docs: add ROADMAP.md for the roadmap panel` 한 커밋.
5. (선택, qa 몫) `npm run tauri dev`에서 이 저장소 세션을 고르면 패널에 `5 / 15`와 묶음 3개가 보인다.

## 위험·가정
- "맥용 앱 빌드"는 `.orbit/decisions.md`에서 근거 줄을 찾지 못했다(검색어 맥/mac 0건; SPEC.md 9행은 "macOS도 깨지지 않게"뿐). GOAL 지시대로 넣었으나 출처 미확인 — Lead가 확인하거나 빼도 된다.
- ④는 SPEC.md 147행 원문이 "그래프/타임라인 UI"지만 decisions.md 13번에서 타임라인을 삭제했으므로 "그래프 UI"로 줄였다.
- 2단계의 "보안 원칙" 줄은 2단계 목록의 항목이라 실행 가능한 문구로 옮겨 넣었다. 제외 대상(F1~F3, S1, Security 권고, 보안점검팀)과는 다르다고 보았다.
- 하네스 구축(① 다음 별도 단계)은 SPEC 마일스톤 ①~⑥ 번호 밖이라 넣지 않았다.
- 패널은 세션 cwd가 저장소 루트일 때만 읽는다(하위 폴더 세션은 "없음") — 기존 결정, 이 run에서 바꾸지 않는다.
