import { test } from "node:test";
import assert from "node:assert/strict";
import { createGate } from "./roadmapGate.ts";

test("같은 id가 진행 중이면 begin은 false, end 뒤 true", () => {
  const g = createGate();
  assert.equal(g.begin("a"), true);
  assert.equal(g.begin("a"), false);
  g.end("a");
  assert.equal(g.begin("a"), true);
});

test("세션 전환은 막지 않고, 늦은 end(a)가 b를 지우지 않는다", () => {
  const g = createGate();
  assert.equal(g.begin("a"), true);
  assert.equal(g.begin("b"), true);
  g.end("a");
  assert.equal(g.begin("b"), false);
  g.end("b");
  assert.equal(g.begin("b"), true);
});
