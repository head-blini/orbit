import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLine, redact, target, fromSdk, markInterrupt, createPermits } from "./core.mjs";

const se = (event, extra = {}) => ({ type: "stream_event", event, parent_tool_use_id: null, ...extra });
const td = (text, extra) => se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, extra);

test("(a) text_delta 이어 붙이기", () => {
  const st = { interrupting: false };
  const msgs = [
    se({ type: "message_start", message: {} }),
    se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    td("Hel"),
    td("lo"),
    { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] }, parent_tool_use_id: null },
    se({ type: "content_block_stop", index: 0 }),
    { type: "result", subtype: "success", is_error: false },
  ];
  const out = msgs.flatMap((m) => fromSdk(m, st));
  assert.equal(out.filter((o) => o.t === "delta").map((o) => o.text).join(""), "Hello");
  assert.equal(fromSdk(msgs[4], st).length, 0);
  assert.deepEqual(fromSdk(td("x", { parent_tool_use_id: "toolu_1" }), st), []);
  assert.deepEqual(fromSdk(se({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{" } }), st), []);
});

test("(b) init, result, 중단", () => {
  const st = { interrupting: false };
  assert.deepEqual(fromSdk({ type: "system", subtype: "init", session_id: "s1" }, st), [{ t: "session", id: "s1" }]);
  assert.deepEqual(fromSdk({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0.0123 }, st), [{ t: "done", cost: 0.0123 }]);
  assert.deepEqual(fromSdk({ type: "result", subtype: "success", is_error: false }, st), [{ t: "done", cost: null }]);
  const e1 = fromSdk({ type: "result", subtype: "success", is_error: true, result: "boom" }, st);
  assert.equal(e1[0].t, "error");
  assert.equal(fromSdk({ type: "result", subtype: "error_during_execution", is_error: true }, st)[0].t, "error");
  st.interrupting = true;
  assert.deepEqual(fromSdk(td("x"), st), []);
  assert.deepEqual(fromSdk({ type: "result", subtype: "success", is_error: false }, st), [{ t: "stopped" }]);
  assert.equal(st.interrupting, false);
});

test("(b2) 턴 밖의 중단은 플래그를 남기지 않는다", () => {
  const st = { interrupting: false, turns: 0 };
  markInterrupt(st); // idle
  assert.equal(st.interrupting, false);
  st.turns = 1; // 턴 시작
  markInterrupt(st);
  assert.equal(st.interrupting, true);
  assert.deepEqual(fromSdk({ type: "result", subtype: "success", is_error: false }, st), [{ t: "stopped" }]);
  assert.equal(st.turns, 0);
  markInterrupt(st); // 턴 직후
  assert.equal(st.interrupting, false);
  assert.deepEqual(fromSdk(td("다음 턴"), st), [{ t: "delta", text: "다음 턴" }]);
});

test("(b3) result 오류 메시지의 키는 가려진다", () => {
  const r = fromSdk({ type: "result", subtype: "success", is_error: true, result: "bad key sk-ant-abc123-XYZ here" }, { interrupting: false });
  assert.equal(r[0].t, "error");
  assert.ok(!r[0].message.includes("sk-ant-"));
});

test("(c0) Bash command가 문자열이 아니면 session 규칙이 안 생긴다", async () => {
  const { out, p } = mk();
  const r1 = p.canUseTool("Bash", { command: 5 }, { signal: sig() });
  p.permit(out[0].id, "session");
  await r1;
  p.canUseTool("Bash", { command: 5 }, { signal: sig() });
  assert.equal(out.filter((m) => m.t === "permit").length, 2);
});

const mk = () => {
  const out = [];
  return { out, p: createPermits((m) => out.push(m)) };
};
const sig = () => new AbortController().signal;
const sugg = [{ type: "addRules", destination: "localSettings", rules: [{ toolName: "Bash" }], behavior: "allow" }];

test("(c) 권한 allow/deny", async () => {
  const { out, p } = mk();
  const input = { command: "echo hi > a.txt" };
  const r = p.canUseTool("Bash", input, { signal: sig(), suggestions: sugg });
  assert.deepEqual(out, [{ t: "permit", id: "p1", tool: "Bash", target: "echo hi > a.txt" }]);
  p.permit("p1", "allow");
  const res = await r;
  assert.deepEqual(res, { behavior: "allow", updatedInput: input });
  assert.ok(!("updatedPermissions" in res));
  const r2 = p.canUseTool("Bash", input, { signal: sig() });
  p.permit("p2", "deny");
  const d = await r2;
  assert.equal(d.behavior, "deny");
  assert.ok(typeof d.message === "string" && d.message.length > 0);
});

test("(d) 이 세션 동안", async () => {
  const { out, p } = mk();
  const a = { command: "echo hi > a.txt" };
  const r = p.canUseTool("Bash", a, { signal: sig(), suggestions: sugg });
  p.permit("p1", "session");
  const res = await r;
  assert.equal(res.behavior, "allow");
  assert.ok(!("updatedPermissions" in res));
  out.length = 0;
  assert.equal((await p.canUseTool("Bash", a, { signal: sig() })).behavior, "allow");
  assert.equal(out.length, 0);
  const r2 = p.canUseTool("Bash", { command: "echo bye > b.txt" }, { signal: sig() });
  assert.equal(out.length, 1);
  p.permit(out[0].id, "deny");
  await r2;

  out.length = 0;
  const e = p.canUseTool("Edit", { file_path: "/a" }, { signal: sig() });
  p.permit(out[0].id, "session");
  await e;
  out.length = 0;
  assert.equal((await p.canUseTool("Edit", { file_path: "/b" }, { signal: sig() })).behavior, "allow");
  assert.equal(out.length, 0);
  const w = p.canUseTool("Write", { file_path: "/b" }, { signal: sig() });
  assert.equal(out.length, 1);
  p.permit(out[0].id, "deny");
  await w;

  const fresh = mk();
  const f = fresh.p.canUseTool("Bash", a, { signal: sig() });
  assert.equal(fresh.out.length, 1);
  fresh.p.permit("p1", "deny");
  await f;
});

test("(e) AskUserQuestion", async () => {
  const { out, p } = mk();
  const questions = [{ question: "과일?", header: "과일", multiSelect: false, options: [{ label: "사과", description: "a", preview: "<b>x</b>" }, { label: "배", description: "b" }] }];
  const r = p.canUseTool("AskUserQuestion", { questions }, { signal: sig() });
  assert.equal(out[0].t, "ask");
  assert.ok(!JSON.stringify(out[0]).includes("preview"));
  p.answer("p1", { "과일?": "배" });
  assert.deepEqual(await r, { behavior: "allow", updatedInput: { questions, answers: { "과일?": "배" } } });

  const r2 = p.canUseTool("AskUserQuestion", { questions }, { signal: sig() });
  p.answer("p2", { "과일?": "사과, 배", n: 3 });
  assert.deepEqual((await r2).updatedInput.answers, { "과일?": "사과, 배" });

  const r3 = p.canUseTool("AskUserQuestion", { questions }, { signal: sig() });
  p.permit("p3", "session"); // 질문에는 규칙도 결정도 없다
  p.answer("p3", {});
  await r3;
  out.length = 0;
  const r4 = p.canUseTool("AskUserQuestion", { questions }, { signal: sig() });
  assert.equal(out.length, 1);
  p.answer("p4", {});
  await r4;
});

test("(f) abort, denyAll, 모르는 id", async () => {
  const { out, p } = mk();
  const ac = new AbortController();
  const r = p.canUseTool("Bash", { command: "x" }, { signal: ac.signal });
  ac.abort();
  assert.equal((await r).behavior, "deny");
  assert.deepEqual(out[1], { t: "closed", id: "p1" });

  out.length = 0;
  const r1 = p.canUseTool("Bash", { command: "a" }, { signal: sig() });
  const r2 = p.canUseTool("Write", { file_path: "b" }, { signal: sig() });
  p.denyAll("중단");
  assert.equal((await r1).behavior, "deny");
  assert.equal((await r2).behavior, "deny");
  assert.equal(out.filter((o) => o.t === "closed").length, 2);

  p.permit("p1", "allow");
  p.permit("zzz", "allow");
  p.answer("zzz", {});
});

test("(g) 모르는 입력", () => {
  const st = { interrupting: false };
  for (const m of [{ type: "zzz" }, {}, null, 5]) assert.deepEqual(fromSdk(m, st), []);
  for (const l of ["{bad", "[]", "", "5"]) assert.equal(parseLine(l), null);
  assert.deepEqual(parseLine('{"t":"close"}'), { t: "close" });
});

test("(h) target", () => {
  assert.equal(target("Bash", { command: "ls" }), "ls");
  assert.equal(target("Edit", { file_path: "/e" }), "/e");
  assert.equal(target("Write", { file_path: "/w" }), "/w");
  assert.equal(target("Read", { file_path: "/r" }), "/r");
  assert.equal(target("NotebookEdit", { notebook_path: "/n" }), "/n");
  assert.equal(target("NotebookEdit", { file_path: "/f" }), "/f");
  assert.equal(target("WebFetch", { url: "http://x" }), "http://x");
  const long = target("Other", { a: "y".repeat(500) });
  assert.equal(long.length, 301);
  assert.ok(long.endsWith("…"));
  assert.equal(target("Bash", { command: 5 }), '{"command":5}');
});

test("(i) redact", () => {
  assert.ok(!redact("x sk-ant-oat01-AbC_d-1 y").includes("sk-ant"));
  assert.ok(!redact("Bearer abc.def").includes("abc"));
  assert.ok(!redact("a".repeat(45)).includes("aaaa"));
  assert.equal(redact("C:\\Users\\a\\proj"), "C:\\Users\\a\\proj");
  const u = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(redact(u), u);
});
