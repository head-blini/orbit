# Orbit 내장 개발팀 하네스 설계서

> 이 문서는 SPEC.md의 "역할 기반 팀 구조" 섹션을 **대체**한다. 충돌하면 이 문서가 우선.

## 0. 이 하네스의 정체
- 이 하네스는 오르빗을 만들기 위한 개발용 설정이 아니라 **오르빗에 내장되는 제품 기능**이다.
- 사용자가 오르빗에서 **아무 프로젝트**나 열면, 그 프로젝트에 이 개발팀이 투입된다. 웹 서비스, 모바일 앱, 백엔드 API, CLI 도구, 데이터 파이프라인, 보안 점검 대상 등 무엇이든.
- 따라서 역할은 **범용**이어야 하고, 프로젝트 성격에 따라 **필요한 역할만 켜지는** 구조여야 한다.
- 오르빗 자신도 이 하네스로 개발한다 (도그푸딩). 오르빗 전용 규칙은 오르빗 저장소의 CLAUDE.md에만 둔다.

---

## 1. 참고한 프레임워크와 가져올 패턴
| 출처 | 가져올 패턴 |
|---|---|
| gstack (Garry Tan) | 스프린트 순서(Think→Plan→Build→Review→Test→Ship→Reflect), 앞 스킬 산출물을 다음 스킬이 읽는 연쇄, CEO→디자인→엔지니어링 계획 리뷰 체인, 디자인 리뷰, 브라우저 QA, 보안 감사(cso) |
| Superpowers (obra) | 설계 없이 코드 금지 · 실패 테스트 없이 구현 금지 · 원인 조사 없이 수정 금지 · 증거 없이 완료 주장 금지, 태스크마다 새 서브에이전트 + 2단계 리뷰(스펙 준수 → 코드 품질) |
| GSD | 얇은 오케스트레이터 + 새 컨텍스트 에이전트, 리서처 · 코드베이스 매퍼, planner ↔ plan-checker 루프, 병렬 실행 웨이브, 목표 역추적 검증, 역할별 모델 지정 |
| Compound Engineering | diff에 따라 리뷰어 페르소나 자동 선택 · 병렬 실행 · 중복 제거, 데이터 무결성 · 스키마 변경 · 성능 리뷰어, 작업마다 배운 것 기록 |
| BMAD Method | 애자일 역할 분리, 스토리 파일 인계, 규모별 트랙, UX Designer 역할 |
| MetaGPT | 자유 대화 대신 SOP가 관리하는 공유 산출물로 협업 |
| Anthropic frontend-design 스킬 | 템플릿 같은 기본값을 피하는 디자인 방향 가이드 |
| Impeccable (pbakaus) | 보편 바닥(대비·포커스·모션 감소), 앱 화면 원칙, 점검 우선순위 — 규칙 텍스트만 옮김(ui-quality) |
| Hallmark (Nutlope) | 상태 8종·AI 티 금지 목록·스크린샷 리뷰 절차 — 규칙 텍스트만 옮김(ui-quality) |

## 2. 설계 원칙
1. **얇은 리드**: Lead는 조율만, 실제 작업은 새 컨텍스트 서브에이전트.
2. **산출물로 인계**: 역할끼리 대화하지 않고 정해진 파일을 주고받는다.
3. **관문(Gate)**: 단계마다 통과 조건, 훅으로 강제.
4. **증거 우선**: 완료는 실행 결과가 첨부돼야 인정.
5. **필요한 역할만**: 프로젝트 프로필과 작업 내용(diff)에 따라 역할을 켜고 끈다.
6. **배운 것 축적**: 프로젝트별로 실패 · 해결 패턴을 쌓는다.
7. **사용자 프로젝트 존중**: 사용자의 기존 CLAUDE.md · `.claude/` 설정을 덮어쓰지 않는다. 오르빗 하네스는 그 위에 얹힌다.

---

## 3. 프로젝트 프로필 (어떤 역할을 켤지 정하는 근거)
프로젝트를 처음 열면 **Researcher**가 코드베이스를 훑어 `.orbit/profile.json`을 만든다. 사용자가 오르빗 UI에서 수정 가능.

| 감지 신호 (예) | 켜지는 역할 / 페르소나 |
|---|---|
| UI 프레임워크(React, Vue, Svelte, Flutter, SwiftUI, Tauri 프론트 등), CSS/디자인 파일 | Designer, 접근성 리뷰어 |
| DB · ORM · 마이그레이션(SQL 파일, Prisma, Drizzle, SQLAlchemy, Alembic, sqlx, migrations/ 폴더 등) | Data |
| Dockerfile, CI 설정, IaC(Terraform 등), 배포 스크립트, 데스크톱/모바일 패키징 설정 | DevOps |
| 인증 · 결제 · 개인정보 · 외부 입력 처리, MCP 서버 · 훅 · 에이전트 설정 | Security 심화 모드 |
| 성능 민감 코드(핫패스, 대용량 처리), 벤치마크 존재 | 성능 리뷰어 |
| 모바일 앱(iOS/Android) | Mobile QA 페르소나 (QA 확장) |

감지 결과는 신호일 뿐이고, 최종 결정은 Lead가 작업 내용과 함께 판단한다.

---

## 4. 팀 명단

### 핵심 역할 (항상 존재)
| 역할 | 하는 일 | 주요 스킬 (가져옴 / 만듦) | 산출물 | 권장 모델 · 권한 |
|---|---|---|---|---|
| Lead | 요청 분류, 트랙 · 역할 선택, 관문 판정, 사람 승인 요청 | orbit-router, orbit-handoff (만듦) | STATE.json | Opus · 읽기 + 서브에이전트 호출만 |
| Researcher | 프로젝트 프로필 작성, 코드베이스 구조 파악, 최신 공식 문서 · 라이브러리 버전 · API 변경 조사 | GSD codebase-mapper · phase-researcher 방식 / Compound Engineering 리서치 에이전트 방식 | profile.json, RESEARCH.md (출처 링크 포함) | Sonnet · 읽기 + 웹 검색 |
| Product | 문제 재정의, 범위 결정 | gstack office-hours · plan-ceo-review / Superpowers brainstorming | BRIEF.md | Opus · 읽기 전용 |
| Architect | 설계, 태스크 분해, 테스트 매핑, 스키마 · 인터페이스 변경 명시 | gstack plan-eng-review / GSD planner 방식 | PLAN.md | Opus · 읽기 전용 |
| Plan Checker | 계획이 목표를 달성하는지 검사, 실패 시 Architect로 | GSD plan-checker 방식 (만듦) | PLAN_CHECK.md | Sonnet · 읽기 전용 |
| Engineer ×N | 태스크 구현 (병렬, worktree 격리) | Superpowers test-driven-development · using-git-worktrees | 코드 + 태스크별 SUMMARY.md, 원자적 커밋 | Sonnet · 편집 + 실행 |
| Debugger (필요 시) | 원인 분석 후 수정 | Superpowers systematic-debugging / gstack investigate | DEBUG.md | Opus · 편집 + 실행 |
| Reviewer 패널 | 기본 페르소나(정확성 · 테스트 · 유지보수성 · 프로젝트 규칙) + 조건부 페르소나 병렬 리뷰, 결과 병합 | Compound Engineering 리뷰 방식 + Superpowers 2단계 리뷰 | REVIEW.md | Opus · 읽기 전용 |
| QA | 목표 역추적 검증, 브라우저 · 앱 실행 테스트 | gstack qa · browse / Superpowers verification-before-completion | VERIFY.md (증거 포함) | Sonnet · 실행 + 브라우저 |
| Security | 기본: 시크릿 · 의존성 · 권한 점검 / 심화: 위협 모델링, 인증 · 입력 검증, MCP · 훅 · 에이전트 설정 감사 | gstack cso 참고 + threat-model · agent-config-audit (만듦) | SECURITY.md | Opus · 읽기 + 스캐너 |
| Librarian | 문서 갱신, 회고, 배운 것 기록 | gstack document-release · retro / Compound Engineering compound | docs/solutions/*.md, CHANGELOG | Sonnet · 문서만 편집 |

### 전문 역할 (프로젝트 프로필 · 작업 내용에 따라 켜짐)
| 역할 | 하는 일 | 주요 스킬 | 산출물 | 권장 모델 · 권한 |
|---|---|---|---|---|
| Designer (UI/UX) | 사용자 흐름 · 화면 · 상태(빈/로딩/에러) 설계, 디자인 시스템 관리, 구현 후 스크린샷 채점 → 미달이면 Engineer로 돌려보내는 디자인 루프 | gstack plan-design-review · design-consultation · design-review / Anthropic frontend-design / design-system-guard (만듦) / ui-quality (Impeccable·Hallmark에서 옮김) | DESIGN.md, design/tokens.json, 시각 리뷰 결과 | Opus · 읽기 + 브라우저, 디자인 파일만 편집 |
| Data | 스키마 설계 검토, 마이그레이션 작성 · 안전성(되돌리기 가능 여부, 대용량 테이블 잠금), 쿼리 성능, 인덱스, 데이터 무결성, 시드 · 백업 | Compound Engineering 데이터 무결성 · 스키마 변경 감지 방식 / data-migration-safety (만듦) | DATA.md (스키마 변경 · 마이그레이션 계획 · 롤백 방법) | Opus · 읽기 + 로컬/테스트 DB만 실행 (운영 DB 접근 금지) |
| DevOps | CI, 빌드 · 패키징 · 서명, 배포, 환경 변수 · 설정 관리, 컨테이너 · IaC | gstack ship · land-and-deploy · setup-deploy · canary / devops-release (만듦) | RELEASE.md (배포 절차 · 롤백 방법) | Sonnet · 편집 + 실행 (배포 명령은 사람 승인 필수) |

### 조건부 리뷰어 페르소나 (Reviewer 패널에 추가)
- 성능 (성능 민감 코드 변경 시)
- 접근성 (UI 변경 시)
- 데이터 (DB · 마이그레이션 변경 시, Data 역할이 꺼져 있을 때 최소 점검)
- 프레임워크별 관용구 리뷰어 (프로젝트 언어 · 프레임워크에 맞게)

---

## 5. 흐름 (그래프 + 루프)
```
요청 → Lead(트랙 · 역할 선택)
  → Researcher(필요 시)
  → Product
  → Designer (UI 작업)        ┐ 병렬 가능
  → Data (DB 변경 작업)        ┘
  → Architect ⇄ Plan Checker (최대 3회)
  → [사람 승인: 계획 확정]
  → Engineer ×N (병렬 웨이브)
  → (UI 변경이면) QA+Designer 디자인 루프 ──미달──→ Engineer (최대 2회)
  → Reviewer 패널 (+ 조건부 페르소나) ──수정 요청──→ Engineer (최대 3회)
  → QA ──실패──→ Debugger → Engineer
  → Security ──차단 이슈──→ Engineer
  → DevOps (배포가 포함된 작업만) → [사람 승인: 배포]
  → Librarian (배운 것 기록)
```

## 6. 트랙 (규모별)
| 트랙 | 언제 | 쓰는 역할 |
|---|---|---|
| Quick | 버그 하나, 작은 수정 | Architect(간단 계획) → Engineer → QA (+ UI 수정이면 Designer 시각 리뷰·디자인 루프) |
| Standard | 일반 기능 | (Researcher) → Architect → Plan Checker → Engineer ×N → Reviewer → QA → Librarian, 프로필에 따라 Designer · Data · DevOps 추가 |
| Full | 새 프로젝트, 큰 기능, 보안 민감 | 전체 |

## 7. 관문과 사람 승인
**사람 승인 (오르빗 UI 승인 카드로 표시)**
- BRIEF 확정 (Full 트랙)
- DESIGN 확정 (UI 큰 변경)
- PLAN 확정 (Standard 이상)
- DB 마이그레이션 실행 (운영 환경 대상이면 무조건)
- 배포 · 외부 공개 동작
- 외부 스킬 새로 가져오기

**자동 관문 (훅으로 강제)**
- REVIEW.md 승인 없이 머지 금지
- VERIFY.md 증거 없이 완료 처리 금지
- design/tokens.json 밖의 색 · 크기 하드코딩 경고
- **예산 관문**: 실행(run)별 · 일별 토큰/비용 상한, 루프 최대 반복 수를 넘으면 자동 정지 후 사람에게 알림. 이건 에이전트가 아니라 오르빗 엔진과 훅이 처리한다.

---

## 8. 오르빗에 내장 · 적용하는 방식
- 하네스는 **Claude Code 플러그인 형태**(agents · skills · hooks · commands 묶음)로 오르빗 앱 안에 포함하고 버전을 관리한다.
- 오르빗 입력창으로 띄운 세션: Agent SDK의 플러그인 · 에이전트 옵션으로 **사용자 저장소에 파일을 쓰지 않고** 로드하는 것을 기본으로 한다. (정확한 옵션은 최신 SDK 문서로 확인)
- 터미널에서 쓰고 싶은 사용자를 위해 "이 프로젝트에 설치" 버튼도 제공 (플러그인 설치 또는 `.claude/`에 복사). 기존 파일과 겹치면 덮어쓰지 않고 사용자에게 보여준 뒤 선택하게 한다.
- 프로젝트별 조정은 `.orbit/team.yaml`에 저장: 역할 켜기/끄기, 역할별 모델, 트랙 기본값, 예산, 추가 규칙.
- 사용자의 CLAUDE.md는 항상 존중하고, 오르빗 하네스 규칙과 충돌하면 사용자 규칙이 우선.

### 파일 구조
```
오르빗 저장소/
└─ harness/                      ← 내장 하네스 (플러그인)
   ├─ agents/    lead, researcher, product, designer, data, architect, plan-checker,
   │             engineer, debugger, reviewer-*, qa, security, devops, librarian
   ├─ skills/
   │  ├─ vendor/ 외부에서 가져온 스킬 + SOURCES.md (출처 · 커밋 · 라이선스)
   │  └─ orbit/  직접 만든 스킬 (router, handoff, gate, threat-model, agent-config-audit,
   │             design-system-guard, data-migration-safety, devops-release ...)
   ├─ hooks/     관문 강제 + 오르빗 이벤트 전송
   └─ templates/ 팀 템플릿 (개발팀, 보안점검팀 ...)

사용자 프로젝트/ (실행 시 생성)
└─ .orbit/
   ├─ profile.json   프로젝트 프로필
   ├─ team.yaml      프로젝트별 팀 조정
   └─ runs/<run-id>/ BRIEF.md, RESEARCH.md, DESIGN.md, DATA.md, PLAN.md, PLAN_CHECK.md,
                     tasks/*/SUMMARY.md, REVIEW.md, VERIFY.md, SECURITY.md, RELEASE.md, STATE.json
   (docs/solutions/ 는 프로젝트 저장소에 커밋되는 배운 것 기록)
```

## 9. 외부 스킬 가져오기 규칙
- 프레임워크를 통째로 설치하지 않고 필요한 스킬만 골라 `harness/skills/vendor/`에 복사.
- 출처 저장소 · 커밋 · 라이선스를 SOURCES.md에 기록. 라이선스가 오르빗 배포와 호환되는지 확인.
- 가져오기 전에 반드시 내용을 읽고 검토 (스킬은 프롬프트라서 숨은 지시 · 위험한 명령이 있을 수 있음). 자동 업데이트 금지.
- 역할 정의 파일에서 어떤 스킬을 쓰는지 명시적으로 연결.

## 10. 오르빗 화면과의 연결
- 팀 명단 뷰: 이 프로젝트에서 켜진 역할 / 꺼진 역할과 **켜진 이유**(프로필 신호), 역할별 모델 · 권한 · 스킬 · 성공률
- 그래프 뷰: 지금 일하는 역할, 산출물 이동, 관문 통과 · 차단, 사람 승인 대기
- 산출물 뷰: `.orbit/runs/` 문서 열람
- 설정: 역할 켜기/끄기, 모델 변경, 예산 (→ team.yaml 저장)

## 11. 보안점검팀 템플릿 (2단계)
Lead → Recon → Scanner ×N(시크릿, 의존성 CVE, MCP · 훅 · 권한 설정, 인젝션 지점) → Triage(중복 · 오탐 제거, 심각도) → Verifier(재현 증거) → Reporter(SECURITY_REPORT.md) → Librarian.
점검 대상 저장소의 내용은 전부 신뢰할 수 없는 입력으로 취급하고, Scanner는 읽기 전용 + 네트워크 차단 샌드박스에서 실행.
