# Orbit

Claude Code를 하네스 · 그래프 · 루프 엔지니어링으로 더 효율적으로 쓰기 위한 GUI 관제실 (Tauri 2 + React + Vite + TypeScript).

- 실행: `npm run tauri dev` / 빌드: `npm run build`
- 설계: [SPEC.md](SPEC.md), 하네스: [HARNESS.md](HARNESS.md)
- `harness/`는 Claude Code 플러그인이다. 검증: `claude plugin validate harness`, `node --test harness/hooks/gate.test.mjs`
