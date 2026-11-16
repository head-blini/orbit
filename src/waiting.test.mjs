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

import { staleWaiting, pruneStale } from "./waiting.ts";
test("stale 세션은 대기가 풀리기 전엔 false, 풀린 뒤 다시 waiting이면 true", () => {
  const old = { ...s("waiting", 500), id: "a" };
  const stale = staleWaiting([old]);
  assert.equal(termWaiting([old], 100, stale), false);
  pruneStale(stale, [{ ...old, state: "working" }]);
  assert.equal(stale.size, 0);
  assert.equal(termWaiting([{ ...old, last_ms: 600 }], 100, stale), true);
});
test("stale이 아닌 다른 세션은 그대로 true", () => {
  const stale = new Set(["a"]);
  assert.equal(termWaiting([{ ...s("waiting", 500), id: "b" }], 100, stale), true);
});
