import { test } from "node:test";
import assert from "node:assert/strict";
import { termWaiting } from "./waiting.ts";

const s = (state, last_ms) => ({ id: "x", cwd: null, started_ms: null, last_ms, source: "hook", ver: 1, state, agents: [], stalled: false });

test("since가 null이면 false", () => assert.equal(termWaiting([s("waiting", 100)], null), false));
test("waiting이고 last_ms >= since면 true", () => {
  assert.equal(termWaiting([s("waiting", 100)], 100), true);
  assert.equal(termWaiting([s("waiting", 101)], 100), true);
});
test("waiting이지만 last_ms < since면 false", () => assert.equal(termWaiting([s("waiting", 99)], 100), false));
test("working·done·error는 false", () => {
  for (const st of ["working", "done", "error"]) assert.equal(termWaiting([s(st, 200)], 100), false);
});
test("여러 세션 중 하나만 맞아도 true", () => {
  assert.equal(termWaiting([s("done", 200), s("waiting", 50), s("waiting", 300)], 100), true);
});
test("빈 목록은 false", () => assert.equal(termWaiting([], 100), false));
