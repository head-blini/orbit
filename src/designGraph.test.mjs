// node --test src/designGraph.test.mjs  (Node 타입 제거로 .ts를 바로 읽는다)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODELS, LIMITS, NODE_W, NODE_H, COL_X, ROW_Y, emptyGraph, addNode, removeNode, connect, disconnect,
  updateNode, checkName, checkTask, checkModel, checkRetries, checkSchema, layout, step, parseGraph,
} from "./designGraph.ts";

const clone = (x) => JSON.parse(JSON.stringify(x));
const mk = (n, edges = []) => {
  let g = emptyGraph();
  for (let i = 0; i < n; i++) g = addNode(g).graph;
  for (const [a, b] of edges) {
    const r = connect(g, a, b);
    assert.ok(r.ok, `${a}->${b}`);
    g = r.graph;
  }
  return g;
};
const colOf = (g) => Object.fromEntries(Object.entries(layout(g).at).map(([k, v]) => [k, v.col]));

test("constants", () => {
  assert.deepEqual([...MODELS], ["inherit", "sonnet", "opus", "haiku"]);
  assert.deepEqual(LIMITS, { name: 40, task: 4000, schemaBytes: 16384, retriesMax: 5 });
  assert.deepEqual([NODE_W, NODE_H, COL_X, ROW_Y], [168, 60, 216, 72]);
});

// ---- 열
test("columns: straight chain is 0,1,2", () => {
  assert.deepEqual(colOf(mk(3, [["node-1", "node-2"], ["node-2", "node-3"]])), { "node-1": 0, "node-2": 1, "node-3": 2 });
});
test("columns: branch and merge", () => {
  const g = mk(4, [["node-1", "node-2"], ["node-1", "node-3"], ["node-2", "node-4"], ["node-3", "node-4"]]);
  const l = layout(g);
  assert.deepEqual(l.columns, [["node-1"], ["node-2", "node-3"], ["node-4"]]);
  assert.equal(l.at["node-2"].row, 0);
  assert.equal(l.at["node-3"].row, 1);
  assert.equal(l.at["node-4"].col, 2);
});
test("columns: unconnected node is column 0", () => {
  assert.deepEqual(colOf(mk(2)), { "node-1": 0, "node-2": 0 });
});
test("columns: skipping edge uses longest path", () => {
  assert.equal(colOf(mk(3, [["node-1", "node-2"], ["node-2", "node-3"], ["node-1", "node-3"]]))["node-3"], 2);
});
test("columns: removing the middle node keeps the last at column 2", () => {
  const g = mk(4, [["node-1", "node-2"], ["node-1", "node-3"], ["node-2", "node-4"], ["node-3", "node-4"]]);
  const g2 = removeNode(g, "node-2").graph;
  assert.equal(colOf(g2)["node-4"], 2 - 0);
  assert.equal(colOf(g2)["node-3"], 1);
});
test("layout: coordinates, size, edge path", () => {
  const g = mk(3, [["node-1", "node-2"], ["node-1", "node-3"]]);
  const l = layout(g);
  assert.deepEqual(l.at["node-3"], { col: 1, row: 1, x: 216, y: 72 });
  assert.equal(l.width, 2 * 216 - 48);
  assert.equal(l.height, 2 * 72 - 12);
  const e = l.edges.find((x) => x.to === "node-3");
  assert.equal(e.d, `M168 30 H${216 - 12 - 8} V${72 + 30} H216`);
  assert.equal(l.edges.find((x) => x.to === "node-2").d, "M168 30 H204 V30 H216");
});
test("layout: empty graph", () => {
  const l = layout(emptyGraph());
  assert.deepEqual([l.width, l.height, l.columns, l.edges], [0, 0, [], []]);
});

// ---- 연결
test("connect: rejects self/dup/cycle/missing and leaves graph unchanged", () => {
  const g = mk(3, [["node-1", "node-2"], ["node-2", "node-3"]]);
  const before = clone(g);
  const cases = [["node-1", "node-1", "self"], ["node-1", "node-2", "dup"], ["node-2", "node-1", "cycle"],
    ["node-3", "node-1", "cycle"], ["node-1", "node-9", "missing"], ["node-9", "node-1", "missing"]];
  for (const [a, b, reason] of cases) {
    const r = connect(g, a, b);
    assert.equal(r.ok, false, `${a}->${b}`);
    assert.equal(r.reason, reason);
    assert.match(r.error, /\S/);
    assert.ok(!r.error.includes("✕"));
  }
  assert.deepEqual(g, before);
});
test("connect: 2-node cycle rejected", () => {
  const g = mk(2, [["node-1", "node-2"]]);
  assert.equal(connect(g, "node-2", "node-1").reason, "cycle");
});
test("connect: messages carry names", () => {
  let g = mk(2, [["node-1", "node-2"]]);
  g = updateNode(g, "node-1", { name: "구현" });
  g = updateNode(g, "node-2", { name: "리뷰" });
  assert.equal(connect(g, "node-1", "node-2").error, "이미 있는 연결입니다: 구현 → 리뷰");
  assert.equal(connect(g, "node-2", "node-1").error, "순환이 생겨 연결할 수 없습니다: 리뷰 → 구현");
  assert.equal(connect(g, "node-1", "node-1").error, "자기 자신에게는 연결할 수 없습니다");
});
test("disconnect removes only that edge", () => {
  const g = mk(3, [["node-1", "node-2"], ["node-2", "node-3"]]);
  const before = clone(g);
  assert.deepEqual(disconnect(g, "node-1", "node-2").edges, [{ from: "node-2", to: "node-3" }]);
  assert.deepEqual(g, before);
});
test("connect: success adds one edge, input unchanged", () => {
  const g = mk(3, [["node-1", "node-2"]]);
  const before = clone(g);
  const r = connect(g, "node-2", "node-3");
  assert.equal(r.ok, true);
  assert.deepEqual(r.graph.edges, [{ from: "node-1", to: "node-2" }, { from: "node-2", to: "node-3" }]);
  assert.deepEqual(g, before);
});

// ---- 삭제 · 추가
test("removeNode: drops touching edges, counts them, keeps others", () => {
  const g = mk(4, [["node-1", "node-2"], ["node-2", "node-3"], ["node-1", "node-4"]]);
  const before = clone(g);
  const r = removeNode(g, "node-2");
  assert.equal(r.removed, 2);
  assert.deepEqual(r.graph.edges, [{ from: "node-1", to: "node-4" }]);
  assert.deepEqual(r.graph.nodes.map((n) => n.id), ["node-1", "node-3", "node-4"]);
  assert.deepEqual(g, before);
});
test("addNode: ids node-1, node-2, no reuse after delete, defaults", () => {
  let g = emptyGraph();
  const a = addNode(g);
  assert.equal(a.id, "node-1");
  const b = addNode(a.graph);
  assert.equal(b.id, "node-2");
  assert.deepEqual(b.graph.nodes[1], { id: "node-2", name: "노드 2", task: "", model: "inherit", retries: 0, schema: null });
  const c = addNode(removeNode(b.graph, "node-2").graph);
  assert.equal(c.id, "node-2"); // 가장 큰 번호가 1이므로 2
  const d = addNode(removeNode(addNode(addNode(emptyGraph()).graph).graph, "node-1").graph);
  assert.equal(d.id, "node-3");
  assert.match(d.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.deepEqual(g, emptyGraph());
});

// ---- 검증
test("checkName", () => {
  assert.equal(checkName("").ok, false);
  assert.equal(checkName("   ").ok, false);
  assert.equal(checkName("가".repeat(41)).ok, false);
  assert.equal(checkName("가".repeat(41)).error, "이름은 40자까지입니다");
  assert.equal(checkName("").error, "이름을 입력하세요");
  assert.equal(checkName("가".repeat(40)).ok, true);
  const xss = "<img src=x onerror=alert(1)>";
  assert.deepEqual(checkName(xss), { ok: true, value: xss });
});
test("checkTask", () => {
  assert.equal(checkTask("a".repeat(4000)).ok, true);
  assert.equal(checkTask("a".repeat(4001)).ok, false);
  assert.equal(checkTask("").ok, true);
});
test("checkModel", () => {
  for (const m of MODELS) assert.deepEqual(checkModel(m), { ok: true, value: m });
  for (const v of ["gpt", "", null, undefined, 3]) assert.equal(checkModel(v).ok, false);
});
test("checkRetries", () => {
  for (const s of ["-1", "9", "1.5", "", "2 "]) {
    const r = checkRetries(s);
    assert.equal(r.ok, false, s);
    assert.equal(r.error, "재시도는 0~5 사이 정수입니다");
  }
  assert.deepEqual(checkRetries("0"), { ok: true, value: 0 });
  assert.deepEqual(checkRetries("5"), { ok: true, value: 5 });
});
const objOfBytes = (n) => {
  const base = JSON.stringify({ a: "" }).length; // {"a":""}
  return { a: "x".repeat(n - base) };
};
test("checkSchema: valid, empty, invalid", () => {
  assert.deepEqual(checkSchema("  \n "), { ok: true, value: null });
  const brief = '{"type":"object","properties":{"ok":{"type":"boolean"}}}';
  assert.deepEqual(checkSchema(brief), { ok: true, value: JSON.parse(brief) });
  assert.equal(checkSchema('{"type":"object"').error, "JSON으로 읽을 수 없습니다 — 반영하지 않았습니다");
  for (const t of ["[]", "null", "1", '"s"']) assert.equal(checkSchema(t).error, "스키마는 JSON 객체({ … })여야 합니다", t);
});
test("checkSchema: 16384 UTF-8 bytes of compact JSON boundary", () => {
  const ok = objOfBytes(16384);
  assert.equal(new TextEncoder().encode(JSON.stringify(ok)).length, 16384);
  assert.equal(checkSchema(JSON.stringify(ok, null, 2)).ok, true); // 서식과 무관
  const bad = objOfBytes(16385);
  const r = checkSchema(JSON.stringify(bad));
  assert.equal(r.ok, false);
  assert.equal(r.error, "스키마가 16KB를 넘습니다");
  // 멀티바이트: 글자 수는 적어도 바이트로 잰다
  const mb = { a: "가".repeat(5462) }; // 5462*3 + 8 = 16394
  assert.equal(checkSchema(JSON.stringify(mb)).ok, false);
});
test("checkSchema: >65536 chars rejected without JSON.parse", () => {
  const orig = JSON.parse;
  let calls = 0;
  JSON.parse = (...a) => { calls++; return orig.apply(JSON, a); };
  try {
    const r = checkSchema("{" + " ".repeat(65535) + "}"); // 65,537자
    assert.equal(r.ok, false);
    assert.equal(r.error, "스키마가 16KB를 넘습니다");
    assert.equal(calls, 0);
    assert.equal(checkSchema(" ".repeat(65536)).ok, true); // 상한 이하 공백은 빈 칸
  } finally {
    JSON.parse = orig;
  }
});
test("updateNode patches one node, input unchanged", () => {
  const g = mk(2);
  const before = clone(g);
  const g2 = updateNode(g, "node-2", { model: "opus", retries: 2 });
  assert.equal(g2.nodes[1].model, "opus");
  assert.equal(g2.nodes[1].retries, 2);
  assert.equal(g2.nodes[0].model, "inherit");
  assert.deepEqual(g, before);
});

// ---- 직렬화
test("JSON roundtrip", () => {
  let g = mk(3, [["node-1", "node-2"], ["node-2", "node-3"]]);
  g = updateNode(g, "node-2", { schema: { type: "object" }, model: "haiku", retries: 3, task: "일" });
  assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
  const r = parseGraph(JSON.parse(JSON.stringify(g)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, g);
});
test("parseGraph ignores unknown fields", () => {
  const g = mk(2, [["node-1", "node-2"]]);
  const raw = clone(g);
  raw.extra = 1; raw.nodes[0].foo = "x"; raw.edges[0].kind = "k";
  const r = parseGraph(raw);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, g);
  assert.ok(!("extra" in r.value) && !("foo" in r.value.nodes[0]) && !("kind" in r.value.edges[0]));
});
test("parseGraph rejects bad input without throwing", () => {
  const g = mk(3, [["node-1", "node-2"]]);
  const bad = (f) => { const x = clone(g); f(x); return x; };
  const inputs = [
    bad((x) => { x.version = 2; }),
    bad((x) => { x.nodes[0].id = "Bad_Id"; }),
    bad((x) => { x.edges = []; x.nodes[0].id = "a".repeat(65); }),
    bad((x) => { x.edges = []; x.nodes[1].id = "node-1"; }),
    bad((x) => { x.edges.push({ from: "node-1", to: "node-9" }); }),
    bad((x) => { x.edges.push({ from: "node-2", to: "node-1" }); }),
    bad((x) => { x.edges.push({ from: "node-1", to: "node-1" }); }),
    bad((x) => { x.edges.push({ from: "node-1", to: "node-2" }); }),
    bad((x) => { x.nodes[0].name = ""; }),
    bad((x) => { x.nodes[0].model = "gpt"; }),
    bad((x) => { x.nodes[0].retries = "2"; }),
    bad((x) => { x.nodes[0].retries = 6; }),
    bad((x) => { x.nodes[0].retries = -1; }),
    bad((x) => { x.nodes[0].retries = 1.5; }),
    bad((x) => { x.nodes[0].task = 5; }),
    "문자열", null, undefined, 3, [], {}, { version: 1, nodes: "x", edges: [] },
  ];
  for (const i of inputs) {
    let r;
    assert.doesNotThrow(() => { r = parseGraph(i); });
    assert.equal(r.ok, false, JSON.stringify(i));
    assert.match(r.error, /\S/);
  }
});
test("parseGraph schema values", () => {
  const withSchema = (s) => { const x = clone(mk(1)); x.nodes[0].schema = s; return x; };
  assert.equal(parseGraph(withSchema([])).ok, false);
  assert.equal(parseGraph(withSchema("{}")).ok, false);
  assert.equal(parseGraph(withSchema(objOfBytes(16385))).ok, false);
  assert.equal(parseGraph(withSchema(null)).ok, true);
  assert.equal(parseGraph(withSchema({ type: "object" })).ok, true);
  assert.equal(parseGraph(withSchema(objOfBytes(16384))).ok, true);
});

// ---- step
test("step: arrows over columns", () => {
  const g = mk(4, [["node-1", "node-2"], ["node-1", "node-3"], ["node-3", "node-4"]]);
  const c = layout(g).columns; // [[1],[2,3],[4]]
  assert.deepEqual(c, [["node-1"], ["node-2", "node-3"], ["node-4"]]);
  assert.equal(step(c, "node-2", "ArrowDown"), "node-3");
  assert.equal(step(c, "node-3", "ArrowUp"), "node-2");
  assert.equal(step(c, "node-2", "ArrowUp"), null);
  assert.equal(step(c, "node-3", "ArrowDown"), null);
  assert.equal(step(c, "node-3", "ArrowRight"), "node-4"); // 옆 열 짧음 → 마지막 행
  assert.equal(step(c, "node-3", "ArrowLeft"), "node-1");
  assert.equal(step(c, "node-2", "ArrowRight"), "node-4");
  assert.equal(step(c, "node-1", "ArrowLeft"), null);
  assert.equal(step(c, "node-4", "ArrowRight"), null);
  assert.equal(step(c, "node-1", "ArrowRight"), "node-2");
  assert.equal(step(c, "nope", "ArrowRight"), null);
  // 옆 열이 충분히 길면 같은 행
  const c2 = [["a", "b", "c"], ["d", "e", "f"]];
  assert.equal(step(c2, "b", "ArrowRight"), "e");
  assert.equal(step(c2, "e", "ArrowLeft"), "b");
  assert.equal(step(c2, "c", "ArrowRight"), "f");
});

test("layout: ids named like Object.prototype keys", () => {
  const ids = ["constructor", "tostring", "valueof", "hasownproperty"];
  const g = { nodes: ids.map((id) => ({ id, name: id, task: "", model: "inherit", retries: 0, schema: null })), edges: [{ from: "constructor", to: "tostring" }] };
  const p = parseGraph({ version: 1, ...g });
  assert.ok(p.ok, JSON.stringify(p));
  const l = layout(p.value);
  assert.equal(l.at["constructor"].col, 0);
  assert.deepEqual(l.columns.map((c) => c.length), [3, 1]);
});

// ================= 루프 설정 · 상한 · 반복 layout (import * as m: 없는 export는 undefined라 개별 테스트만 실패한다)
import * as m from "./designGraph.ts";

const rawNode = (i) => ({ id: `node-${i}`, name: `노드 ${i}`, task: "", model: "inherit", retries: 0, schema: null });
const rawNodes = (n) => Array.from({ length: n }, (_, i) => rawNode(i + 1));
// 64노드 DAG의 i<j 쌍 2,016개 중 앞에서 k개
const pairs = (k) => {
  const out = [];
  for (let i = 1; i <= 64 && out.length < k; i++) for (let j = i + 1; j <= 64 && out.length < k; j++) out.push({ from: `node-${i}`, to: `node-${j}` });
  return out;
};
const rawEdges = (k) => ({ version: 1, nodes: rawNodes(64), edges: pairs(k) });
const L = (o = {}) => ({ until: null, maxIterations: 3, budgetUsd: null, onFail: "screen", ...o });
const withLoop = (n, loop) => {
  let g = mk(n, n >= 3 ? [["node-1", "node-2"], ["node-2", "node-3"]] : []);
  const names = ["구현", "리뷰", "검증"];
  g = { ...g, nodes: g.nodes.map((x, i) => ({ ...x, name: names[i] ?? x.name })) };
  return m.setLoop(g, loop);
};
const E = (why) => `설계 그래프를 읽을 수 없습니다: ${why}`;

test("loop: constants", () => {
  assert.deepEqual(m.CAPS, { nodes: 500, edges: 2000 });
  assert.deepEqual(m.LOOP_LIMITS, { iterMin: 1, iterMax: 50, iterDefault: 3, budgetMin: 0.01, budgetMax: 1000 });
  assert.deepEqual([...m.ON_FAIL], ["screen", "none"]);
  assert.deepEqual(m.CAP_ERROR, {
    nodes: "노드는 500개까지입니다 — 추가하지 않았습니다",
    edges: "연결은 2,000개까지입니다 — 연결하지 않았습니다",
  });
  const a = m.defaultLoop();
  const b = m.defaultLoop();
  assert.notEqual(a, b);
  assert.deepEqual(a, { until: null, maxIterations: 3, budgetUsd: null, onFail: "screen" });
});

test("loop: compat — missing key stays missing, null stays null", () => {
  const g = clone(mk(2));
  const r = m.parseGraph(g);
  assert.ok(r.ok);
  assert.equal("loop" in r.value, false);
  const r2 = m.parseGraph({ ...g, loop: null });
  assert.ok(r2.ok);
  assert.equal("loop" in r2.value, true);
  assert.equal(r2.value.loop, null);
});

test("loop: JSON round trip and parseGraph round trip", () => {
  for (const loop of [L({ budgetUsd: 2.5, until: { node: "node-3" } }), L({ budgetUsd: 0.29 }), L({ until: null, budgetUsd: null })]) {
    const g = withLoop(3, loop);
    assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
    const r = m.parseGraph(clone(g));
    assert.ok(r.ok);
    assert.deepEqual(r.value, g);
  }
});

test("loop: parseGraph rejects bad values with exact reasons", () => {
  const base = clone(withLoop(3, L({ until: { node: "node-3" }, budgetUsd: 2.5 })));
  assert.ok(m.parseGraph(clone(base)).ok);
  const run = (patch, why) => {
    const x = clone(base);
    patch(x);
    let r;
    assert.doesNotThrow(() => { r = m.parseGraph(x); });
    assert.equal(r.ok, false);
    assert.equal(r.error, E(why));
  };
  for (const v of [0, 51, 2.5, "3", NaN, Infinity]) run((x) => { x.loop.maxIterations = v; }, "반복 최대 횟수가 올바르지 않습니다");
  for (const v of [0, -1, 1000.01, 0.001, 2.555, 1.005, NaN, Infinity, "5"]) run((x) => { x.loop.budgetUsd = v; }, "반복 예산이 올바르지 않습니다");
  run((x) => { delete x.loop.budgetUsd; }, "반복 예산이 올바르지 않습니다");
  for (const v of ["os", ""]) run((x) => { x.loop.onFail = v; }, "반복 실패 시 값이 올바르지 않습니다");
  run((x) => { x.loop.until.node = "node-9"; }, "반복 종료 조건 노드가 없습니다");
  for (const v of ["../x", "A:b", "a".repeat(65), 5]) run((x) => { x.loop.until.node = v; }, "반복 종료 조건 노드 id가 올바르지 않습니다");
  run((x) => { delete x.loop.until; }, "반복 종료 조건이 올바르지 않습니다");
  for (const v of ["node-1", []]) run((x) => { x.loop.until = v; }, "반복 종료 조건이 올바르지 않습니다");
  for (const v of ["x", [], 3]) run((x) => { x.loop = v; }, "반복 설정이 객체가 아닙니다");
});

test("loop: parseGraph accepts boundary values and keeps them", () => {
  const base = clone(withLoop(3, L()));
  for (const patch of [{ budgetUsd: null }, { budgetUsd: 0.01 }, { budgetUsd: 1000 }, { maxIterations: 1 }, { maxIterations: 50 }, { until: null }, { until: { node: "node-2" } }, { onFail: "none" }]) {
    const x = clone(base);
    x.loop = { ...x.loop, ...patch };
    const r = m.parseGraph(x);
    assert.ok(r.ok, JSON.stringify(patch));
    assert.deepEqual(r.value.loop, x.loop);
  }
});

test("loop: unknown fields inside loop are dropped", () => {
  const x = clone(withLoop(3, L({ until: { node: "node-3" } })));
  x.loop.extra = 1;
  x.loop.until.field = 2;
  const r = m.parseGraph(x);
  assert.ok(r.ok);
  assert.equal("extra" in r.value.loop, false);
  assert.equal("field" in r.value.loop.until, false);
  assert.deepEqual(r.value.loop, L({ until: { node: "node-3" } }));
});

test("loop: removeNode clears until only for the until node", () => {
  const g = withLoop(3, L({ until: { node: "node-3" }, maxIterations: 7, budgetUsd: 2.5, onFail: "none" }));
  const before = clone(g);
  const r = m.removeNode(g, "node-3");
  assert.deepEqual(g, before);
  assert.equal(r.untilCleared, true);
  assert.deepEqual(r.graph.loop, { until: null, maxIterations: 7, budgetUsd: 2.5, onFail: "none" });
  const r2 = m.removeNode(g, "node-1");
  assert.deepEqual(g, before);
  assert.equal(r2.untilCleared, false);
  assert.deepEqual(r2.graph.loop, g.loop);
  const plain = mk(2);
  const r3 = m.removeNode(plain, "node-1");
  assert.equal(r3.untilCleared, false);
  assert.equal("loop" in r3.graph, false);
});

test("loop: other operations keep loop and never mutate input", () => {
  const loop = L({ until: { node: "node-3" }, budgetUsd: 2.5 });
  const g = withLoop(3, loop);
  const before = clone(g);
  const a = m.addNode(g);
  assert.ok(a.ok);
  assert.deepEqual(a.graph.loop, loop);
  assert.deepEqual(g, before);
  const c = m.connect(g, "node-1", "node-3");
  assert.ok(c.ok);
  assert.deepEqual(c.graph.loop, loop);
  assert.deepEqual(g, before);
  assert.deepEqual(m.disconnect(g, "node-1", "node-2").loop, loop);
  assert.deepEqual(g, before);
  assert.deepEqual(m.updateNode(g, "node-1", { name: "x" }).loop, loop);
  assert.deepEqual(g, before);
  const next = L({ maxIterations: 9 });
  const s = m.setLoop(g, next);
  assert.deepEqual(s.loop, next);
  assert.deepEqual(m.setLoop(g, null).loop, null);
  assert.deepEqual(g, before);
});

test("caps: addNode at 499 ok, at 500 rejected", () => {
  const g499 = { version: 1, nodes: rawNodes(499), edges: [] };
  const b499 = clone(g499);
  const r = m.addNode(g499);
  assert.ok(r.ok);
  assert.equal(r.id, "node-500");
  assert.equal(r.graph.nodes.length, 500);
  assert.deepEqual(g499, b499);
  const g500 = { version: 1, nodes: rawNodes(500), edges: [] };
  const b500 = clone(g500);
  const r2 = m.addNode(g500);
  assert.deepEqual(r2, { ok: false, error: m.CAP_ERROR.nodes });
  assert.deepEqual(g500, b500);
});

test("caps: connect at 1999 edges ok, at 2000 rejected as limit (not dup/cycle)", () => {
  const g1 = rawEdges(1999);
  const last = pairs(2000)[1999];
  const b1 = clone(g1);
  const r = m.connect(g1, last.from, last.to);
  assert.ok(r.ok);
  assert.equal(r.graph.edges.length, 2000);
  assert.deepEqual(g1, b1);
  const g2 = rawEdges(2000);
  const b2 = clone(g2);
  const r2 = m.connect(g2, last.from, last.to);
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, "limit");
  assert.equal(r2.error, m.CAP_ERROR.edges);
  assert.deepEqual(g2, b2);
});

test("caps: parseGraph 500/501 nodes, 2000/2001 edges", () => {
  assert.ok(m.parseGraph({ version: 1, nodes: rawNodes(500), edges: [] }).ok);
  const r = m.parseGraph({ version: 1, nodes: rawNodes(501), edges: [] });
  assert.equal(r.ok, false);
  assert.equal(r.error, E("노드는 500개까지입니다"));
  const t0 = performance.now();
  const ok = m.parseGraph(rawEdges(2000));
  console.log(`parseGraph 2000 edges: ${(performance.now() - t0).toFixed(1)}ms`);
  assert.ok(ok.ok);
  assert.equal(ok.value.edges.length, 2000);
  const over = rawEdges(2000);
  over.edges.push(pairs(2001)[2000]);
  const r2 = m.parseGraph(over);
  assert.equal(r2.ok, false);
  assert.equal(r2.error, E("연결은 2,000개까지입니다"));
});

test("caps: count check comes before node validation", () => {
  const nodes = rawNodes(501);
  nodes[0] = 5;
  assert.equal(m.parseGraph({ version: 1, nodes, edges: [] }).error, E("노드는 500개까지입니다"));
});

const reverseChain = (n) => {
  const nodes = [];
  const edges = [];
  for (let i = n; i >= 1; i--) nodes.push(rawNode(i));
  for (let i = 1; i < n; i++) edges.push({ from: `node-${i}`, to: `node-${i + 1}` });
  return { version: 1, nodes, edges };
};

test("layout: 2000-node reverse chain", () => {
  let l;
  assert.doesNotThrow(() => { l = m.layout(reverseChain(2000)); });
  assert.equal(l.at["node-2000"].col, 1999);
  assert.equal(l.columns.length, 2000);
});
test("layout: 100000-node reverse chain does not overflow the stack", () => {
  let l;
  assert.doesNotThrow(() => { l = m.layout(reverseChain(100000)); });
  assert.equal(l.at["node-100000"].col, 99999);
});
test("layout: 500-node chain through parseGraph", () => {
  const r = m.parseGraph(reverseChain(500));
  assert.ok(r.ok);
  assert.equal(m.layout(r.value).columns.length, 500);
});
test("layout: longest path when predecessor depth is not yet computed", () => {
  // 노드 순서 [c,a,x,b]: c=node-1, a=node-2, x=node-3, b=node-4
  const g = { version: 1, nodes: rawNodes(4), edges: [{ from: "node-3", to: "node-2" }, { from: "node-2", to: "node-1" }, { from: "node-4", to: "node-1" }] };
  assert.equal(m.layout(g).at["node-1"].col, 2);
});
test("layout: cycle input does not throw", () => {
  const g = { version: 1, nodes: rawNodes(2), edges: [{ from: "node-1", to: "node-2" }, { from: "node-2", to: "node-1" }] };
  assert.doesNotThrow(() => m.layout(g));
});
test("layout: dangling edge does not throw", () => {
  const g = { version: 1, nodes: rawNodes(2), edges: [{ from: "node-1", to: "zzz" }, { from: "zzz", to: "node-2" }] };
  const l = m.layout(g);
  assert.equal(l.edges.length, 0);
});

test("checkMaxIterations", () => {
  const msg = "최대 반복은 1~50 사이 정수입니다";
  for (const s of ["0", "51", "2.5", "abc", "", "-1", " 5", "00"]) assert.deepEqual(m.checkMaxIterations(s), { ok: false, error: msg }, JSON.stringify(s));
  for (const [s, v] of [["1", 1], ["50", 50], ["5", 5], ["05", 5]]) assert.deepEqual(m.checkMaxIterations(s), { ok: true, value: v });
});

test("checkBudget", () => {
  const msg = "예산은 0.01~1000달러, 소수 둘째 자리까지입니다";
  for (const s of ["", "  "]) assert.deepEqual(m.checkBudget(s), { ok: true, value: null });
  for (const [s, v] of [["0.01", 0.01], ["1000", 1000], ["2.5", 2.5], [" 2.5 ", 2.5], ["00.50", 0.5], ["05", 5]]) assert.deepEqual(m.checkBudget(s), { ok: true, value: v }, s);
  for (const s of ["0", "-1", "1000.01", "0.001", "abc", "$2.5", "1e2", ".5"]) assert.deepEqual(m.checkBudget(s), { ok: false, error: msg }, s);
});

test("hasPassed", () => {
  for (const s of [null, {}, { properties: { passed: { type: "string" } } }, { properties: [] }, { properties: { passed: true } }]) assert.equal(m.hasPassed(s), false, JSON.stringify(s));
  assert.equal(m.hasPassed({ type: "object", properties: { passed: { type: "boolean" } } }), true);
});

test("loopSummary", () => {
  assert.equal(m.loopSummary(mk(1)), "반복 없음 · 한 번 실행합니다");
  assert.equal(m.loopSummary(m.setLoop(mk(1), null)), "반복 없음 · 한 번 실행합니다");
  assert.equal(m.loopSummary(withLoop(3, L({ until: { node: "node-3" }, maxIterations: 5, budgetUsd: 2.5 }))), "반복 최대 5 · 종료: 검증 · 예산 $2.50");
  assert.equal(m.loopSummary(withLoop(3, L())), "반복 최대 3 · 종료: 횟수만 · 예산 없음");
  const g = withLoop(3, L({ until: { node: "node-2" } }));
  const xss = "<img src=x onerror=alert(1)>";
  assert.ok(m.loopSummary(m.updateNode(g, "node-2", { name: xss })).includes(xss));
});

test("josa", () => {
  assert.equal(m.josa("검증", "과", "와"), "검증과");
  assert.equal(m.josa("검증", "을", "를"), "검증을");
  assert.equal(m.josa("리뷰", "과", "와"), "리뷰와");
  assert.equal(m.josa("리뷰", "을", "를"), "리뷰를");
  assert.equal(m.josa("abc", "과", "와"), "abc와");
  assert.equal(m.josa("검증😀", "과", "와"), "검증😀와"); // 이모지 끝 글자(U+D7A3 초과)는 받침 없음 쪽
});
