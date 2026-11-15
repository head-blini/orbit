# S1 SUMMARY
구현 전: `node --test sidecar/core.test.mjs` -> ERR_MODULE_NOT_FOUND (core.mjs 없음), 실패.
구현 후: tests 9, pass 9, fail 0.
grep credentials/ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/updatedPermissions: (core.mjs) -> 결과 없음.
