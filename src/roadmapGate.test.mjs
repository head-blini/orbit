import { test } from "node:test";
import assert from "node:assert/strict";
import { createGate, shouldReload } from "./roadmapGate.ts";

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

test("begin 거절 뒤 end는 true를 한 번만 돌려준다", () => {
  const g = createGate();
  assert.equal(g.begin("a"), true);
  assert.equal(g.begin("a"), false);
  assert.equal(g.end("a"), true);
  assert.equal(g.begin("a"), true);
  assert.equal(g.end("a"), false);
});

test("다른 id 거절은 again이 아니다", () => {
  const g = createGate();
  assert.equal(g.begin("a"), true);
  assert.equal(g.begin("b"), true);
  assert.equal(g.end("a"), false);
});

test("shouldReload는 지금 고른 세션의 문자열 payload만 true", () => {
  assert.equal(shouldReload("a", "a"), true);
  assert.equal(shouldReload("b", "a"), false);
  assert.equal(shouldReload("a", null), false);
  assert.equal(shouldReload(1, "1"), false);
  assert.equal(shouldReload({}, "a"), false);
});
