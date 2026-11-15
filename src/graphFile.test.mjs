// node --test src/graphFile.test.mjs  (import * as: 없는 export는 undefined라 개별 테스트만 실패한다)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as f from "./graphFile.ts";
import * as d from "./designGraph.ts";

const clone = (x) => JSON.parse(JSON.stringify(x));
const withLoop = () => {
  let g = d.emptyGraph();
  for (const n of ["구현", "리뷰", "검증"]) g = d.updateNode(d.addNode(g).graph, `node-${g.nodes.length + 1}`, { name: n });
  for (const [a, b] of [["node-1", "node-2"], ["node-2", "node-3"]]) g = d.connect(g, a, b).graph;
  return d.setLoop(g, { until: { node: "node-3" }, maxIterations: 5, budgetUsd: 2.5, onFail: "screen" });
};
const envOf = (graph, over = {}) =>
  JSON.stringify({ format: 1, id: "g-0123456789abcdef", name: "기능 구현 → 리뷰 → 검증", savedAt: 1700000000000, graph, ...over });
const E_UNREAD = "읽을 수 없는 파일입니다";
const rawNode = (i, over = {}) => ({ id: `node-${i}`, name: `n${i}`, task: "", model: "inherit", retries: 0, schema: null, ...over });
const rawGraph = (n) => ({ version: 1, nodes: Array.from({ length: n }, (_, i) => rawNode(i + 1)), edges: [] });

test("1 constants", () => {
  assert.deepEqual(f.GRAPH_LIMITS, { graphBytes: 25165824, fileBytes: 26214400, count: 100 });
  assert.equal(f.GRAPH_CAP_ERROR, "그래프는 100개까지입니다 — 저장하지 않았습니다");
});

test("2 checkGraphName", () => {
  for (const s of ["", "   "]) assert.deepEqual(f.checkGraphName(s), { ok: false, error: "이름을 입력하세요" });
  for (const s of ["가".repeat(41), "😀".repeat(21)]) assert.deepEqual(f.checkGraphName(s), { ok: false, error: "이름은 40자까지입니다" });
  for (const s of ["가".repeat(40), "😀".repeat(20)]) assert.equal(f.checkGraphName(s).ok, true);
  assert.deepEqual(f.checkGraphName("  a  "), { ok: true, value: "a" });
  for (const s of ["a‮b", "⁦a", "a\u0007", "a\u009f", "a\u007f", "a\nb"])
    assert.deepEqual(f.checkGraphName(s), { ok: false, error: "이름에 쓸 수 없는 문자가 있습니다" }, JSON.stringify(s));
  const x = "<img src=x onerror=alert(1)>";
  assert.deepEqual(f.checkGraphName(x), { ok: true, value: x });
});

test("3 serializeGraph", () => {
  const g = withLoop();
  const before = clone(g);
  const r = f.serializeGraph(g);
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(r.value), g);
  assert.deepEqual(g, before);
  const plain = f.serializeGraph(d.emptyGraph());
  assert.equal(plain.ok, true);
  assert.equal("loop" in JSON.parse(plain.value), false);
  const big = rawGraph(501);
  const e = d.parseGraph(big);
  assert.equal(e.ok, false);
  assert.deepEqual(f.serializeGraph(big), { ok: false, error: e.error });
});

test("4 max graph size", () => {
  const n = 500;
  const schema = { k: "x".repeat(16384 - 8) };
  assert.equal(new TextEncoder().encode(JSON.stringify(schema)).length, 16384);
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: "a".repeat(60) + "-" + String(i).padStart(3, "0"),
    name: "\u0001".repeat(40), task: "\u0001".repeat(4000), model: "inherit", retries: 5, schema,
  }));
  const edges = [];
  for (let i = 0; i < n && edges.length < 2000; i++)
    for (let j = i + 1; j < n && edges.length < 2000; j++) edges.push({ from: nodes[i].id, to: nodes[j].id });
  const g = { version: 1, nodes, edges, loop: { until: { node: nodes[n - 1].id }, maxIterations: 50, budgetUsd: 1000, onFail: "screen" } };
  assert.equal(d.parseGraph(g).ok, true);
  const r = f.serializeGraph(g);
  assert.equal(r.ok, true);
  const bytes = new TextEncoder().encode(r.value).length;
  console.log(`max graph bytes = ${bytes} (plan estimate ~20676200, limit ${f.GRAPH_LIMITS.graphBytes})`);
  assert.ok(bytes <= f.GRAPH_LIMITS.graphBytes);
});

test("5 parseGraphFile roundtrip", () => {
  const g = withLoop();
  const r = f.parseGraphFile(envOf(JSON.parse(f.serializeGraph(g).value)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.graph, g);
  assert.equal(r.value.name, "기능 구현 → 리뷰 → 검증");
  assert.equal(r.value.savedAt, 1700000000000);
  const p = f.parseGraphFile(envOf(JSON.parse(f.serializeGraph(d.emptyGraph()).value)));
  assert.equal(p.ok, true);
  assert.deepEqual(p.value.graph, d.emptyGraph());
  assert.equal("loop" in p.value.graph, false);
});

test("6 parseGraphFile rejects", () => {
  const g = JSON.parse(f.serializeGraph(withLoop()).value);
  assert.equal(f.parseGraphFile(envOf(g)).ok, true);
  const no = (raw, error) => {
    let r;
    assert.doesNotThrow(() => (r = f.parseGraphFile(raw)));
    assert.deepEqual(r, { ok: false, error });
  };
  no("x".repeat(26214401), "너무 큽니다");
  no("x", E_UNREAD);
  no("x".repeat(26214400), E_UNREAD);
  no("{", E_UNREAD);
  for (const raw of ["[]", '"s"', "null", "3", undefined, {}]) no(raw, E_UNREAD);
  for (const fm of [2, "1"]) no(envOf(g, { format: fm }), "이 버전에서 열 수 없습니다");
  const nf = JSON.parse(envOf(g));
  delete nf.format;
  no(JSON.stringify(nf), "이 버전에서 열 수 없습니다");
  no(envOf({ ...g, version: 2 }), "설계 그래프를 읽을 수 없습니다: 지원하지 않는 version입니다");
  for (const name of ["", "가".repeat(41), "a‮b"]) no(envOf(g, { name }), E_UNREAD);
  no(envOf(g, { name: 5 }), E_UNREAD);
  no(envOf(g, { savedAt: "x" }), E_UNREAD);
  no(envOf(rawGraph(501)), "설계 그래프를 읽을 수 없습니다: 노드는 500개까지입니다");
});

test("7 S4 file path", () => {
  const deep = '{"a":' + "[".repeat(100000) + "]".repeat(100000) + "}";
  const node = JSON.stringify(rawNode(1)).replace('"schema":null', `"schema":${deep}`);
  const raw = `{"format":1,"name":"a","savedAt":1,"graph":{"version":1,"nodes":[${node}],"edges":[]}}`;
  let r;
  assert.doesNotThrow(() => (r = f.parseGraphFile(raw)));
  assert.equal(r.ok, false);
  console.log("S4 file path error:", r.error);
});

test("8 R2 __proto__ not merged", () => {
  const P = '"__proto__":{"polluted":1}';
  const raw =
    `{${P},"format":1,"name":"a","savedAt":1,"graph":{${P},"version":1,"nodes":[{${P},"id":"node-1","name":"n","task":"","model":"inherit","retries":0,"schema":{${P}}}],"edges":[],"loop":{${P},"until":null,"maxIterations":3,"budgetUsd":null,"onFail":"screen"}}}`;
  const r = f.parseGraphFile(raw);
  assert.equal(r.ok, true);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.deepEqual(Object.keys(r.value.graph.nodes[0]), ["id", "name", "task", "model", "retries", "schema"]);
  assert.deepEqual(Object.keys(r.value.graph.loop), ["until", "maxIterations", "budgetUsd", "onFail"]);
  assert.equal(Object.getPrototypeOf(r.value.graph.nodes[0].schema), Object.prototype);
});

test("9 unknown fields ignored", () => {
  const g = JSON.parse(f.serializeGraph(withLoop()).value);
  const dirty = clone(g);
  dirty.nodes[0].color = "red";
  dirty.edges[0].w = 3;
  const r = f.parseGraphFile(envOf(dirty, { extra: 1 }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.graph, withLoop());
});

test("10 isDirty / saveStatus", () => {
  const e = d.emptyGraph();
  assert.equal(f.isDirty(null, e), false);
  assert.equal(f.saveStatus(null, e), "이름 없음");
  const lp = d.setLoop(e, null);
  assert.equal(f.isDirty(null, lp), false);
  assert.equal(f.saveStatus(null, lp), "이름 없음");
  const one = d.addNode(e).graph;
  assert.equal(f.isDirty(null, one), true);
  assert.equal(f.saveStatus(null, one), "이름 없음 · 저장 안 됨");
  const g = withLoop();
  const o = { id: "g-0123456789abcdef", name: "A", base: f.graphKey(g) };
  assert.equal(f.isDirty(o, g), false);
  assert.equal(f.saveStatus(o, g), "A · 저장됨");
  const h = d.updateNode(g, "node-1", { name: "다름" });
  assert.equal(f.isDirty(o, h), true);
  assert.equal(f.saveStatus(o, h), "A · 저장 안 한 변경 있음");
  const gone = { ...o, id: null };
  assert.equal(f.isDirty(gone, g), true);
  assert.equal(f.saveStatus(gone, g), "A · 저장 안 됨");
});

test("12 loopDrafts", () => {
  assert.deepEqual(f.loopDrafts(null), { max: String(d.LOOP_LIMITS.iterDefault), bud: "" });
  assert.deepEqual(f.loopDrafts(null), { max: "3", bud: "" });
  const L = (o) => ({ until: null, maxIterations: 5, budgetUsd: 2.5, onFail: "screen", ...o });
  assert.deepEqual(f.loopDrafts(L({})), { max: "5", bud: "2.5" });
  assert.deepEqual(f.loopDrafts(L({ budgetUsd: null })).bud, "");
  assert.equal(f.loopDrafts(L({ budgetUsd: 1000 })).bud, "1000");
  assert.equal(f.loopDrafts(L({ budgetUsd: 0.07 })).bud, "0.07");
  for (const l of [L({}), L({ budgetUsd: null }), L({ budgetUsd: 1000 }), L({ budgetUsd: 0.07 })]) {
    const x = f.loopDrafts(l);
    assert.deepEqual(d.checkMaxIterations(x.max), { ok: true, value: l.maxIterations });
    assert.deepEqual(d.checkBudget(x.bud), { ok: true, value: l.budgetUsd });
  }
});
