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
  assert.deepEqual(disconnect(g, "node-1", "node-2").edges, [{ from: "node-2", to: "node-3" }]);
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
    const r = checkSchema("{" + " ".repeat(65536) + "}");
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
    bad((x) => { x.nodes[0].id = "a".repeat(65); }),
    bad((x) => { x.nodes[1].id = "node-1"; }),
    bad((x) => { x.edges.push({ from: "node-1", to: "node-9" }); }),
    bad((x) => { x.edges.push({ from: "node-2", to: "node-1" }); }),
    bad((x) => { x.edges.push({ from: "node-1", to: "node-1" }); }),
    bad((x) => { x.edges.push({ from: "node-1", to: "node-2" }); }),
    bad((x) => { x.nodes[0].name = ""; }),
    bad((x) => { x.nodes[0].model = "gpt"; }),
    bad((x) => { x.nodes[0].retries = "2"; }),
    bad((x) => { x.nodes[0].retries = 6; }),
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
});
