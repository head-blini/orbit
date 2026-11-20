import { test } from "node:test";
import assert from "node:assert/strict";
import { tabKey, tabSessions, tabSid, newTabId, nextActive, canResume, quickExit, MAX_TABS, QUICK_EXIT_MS,
  rowId, SAME, splitSessions, pushedOut, folderTab, liveRow, makeOff, ASK_ROADMAP,
  nextKey, attention, nextAttention, waitText, ctxShort, groupPast } from "./tabs.ts";

const k = (key, o = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });
const s = (id, tab, last_ms, source = "hook") => ({ id, tab, last_ms, source });

test("상수", () => { assert.equal(MAX_TABS, 8); assert.equal(QUICK_EXIT_MS, 2000); });

test("tabKey: 맥 ⌘1~8", () => {
  assert.equal(tabKey(k("1", { metaKey: true }), true), 0);
  assert.equal(tabKey(k("8", { metaKey: true }), true), 7);
  for (const key of ["9", "0"]) assert.equal(tabKey(k(key, { metaKey: true }), true), null);
});
test("tabKey: 다른 수식키·맥 아님은 null", () => {
  assert.equal(tabKey(k("1", { metaKey: true, shiftKey: true }), true), null);
  assert.equal(tabKey(k("1", { metaKey: true, altKey: true }), true), null);
  assert.equal(tabKey(k("1", { ctrlKey: true }), true), null);
  assert.equal(tabKey(k("1", { metaKey: true, ctrlKey: true }), true), null);
  assert.equal(tabKey(k("1", { metaKey: true }), false), null);
  assert.equal(tabKey(k("a", { metaKey: true }), true), null);
});

test("tabSessions·tabSid", () => {
  const l = [s("a", 1, 10), s("b", 1, 30), s("c", 2, 99), s("d", null, 100)];
  assert.deepEqual(tabSessions(l, 1).map((x) => x.id), ["a", "b"]);
  assert.equal(tabSid(l, 1), "b");
  assert.equal(tabSid(l, 2), "c");
  assert.equal(tabSid(l, 3), null);
  assert.equal(tabSid([], 1), null);
});

test("newTabId", () => {
  const at = (id) => (id - 0.5) / 0xffffffff; // 이 rand가 id를 낸다
  const seq = [at(1), at(5), at(7)];
  let i = 0;
  assert.equal(newTabId(new Set([1, 5]), () => seq[i++]), 7);
  assert.equal(i, 3);
  for (let n = 0; n < 200; n++) {
    const id = newTabId(new Set(), Math.random);
    assert.ok(Number.isInteger(id) && id >= 1 && id <= 0xffffffff);
  }
  assert.equal(newTabId(new Set(), () => 0), 1);
  assert.equal(newTabId(new Set(), () => 0.9999999999999999), 0xffffffff);
});

test("nextActive", () => {
  assert.equal(nextActive([1, 2, 3], 2, 2), 3);
  assert.equal(nextActive([1, 2, 3], 3, 3), 2);
  assert.equal(nextActive([1], 1, 1), null);
  assert.equal(nextActive([1, 2, 3], 1, 3), 3);
  assert.equal(nextActive([1, 2, 3], 1, 1), 2);
  assert.equal(nextActive([1, 2], 1, null), null);
});

test("canResume", () => {
  assert.equal(canResume({ source: "hook" }), false);
  assert.equal(canResume({ source: "log" }), true);
  assert.equal(canResume({ source: "both" }), true);
});

test("quickExit", () => {
  assert.equal(quickExit(1000, 1000), true);
  assert.equal(quickExit(1000, 3000), true);
  assert.equal(quickExit(1000, 3001), false);
});

const v = (id, o = {}) => ({ id, name: `t${id}`, phase: "running", wait: false, cwd: null, ...o });

test("rowId·SAME", () => {
  assert.equal(rowId(5), "live-5");
  assert.ok(SAME.includes("이미 터미널에서 실행 중"));
});

test("splitSessions", () => {
  const l = [s("b", 1, 200), s("c", null, 150), s("a", 1, 100)];
  const r = splitSessions([v(1), v(2)], l);
  assert.deepEqual(r.live.map((x) => [x.view.id, x.sid]), [[1, "b"], [2, null]]);
  assert.deepEqual(r.past.map((x) => x.id), ["c", "a"]);
  assert.deepEqual(splitSessions([], l).past.length, 3);
});

test("pushedOut", () => {
  const l = [s("b", 1, 200), s("c", null, 150), s("a", 1, 100), s("z", 9, 50)];
  const views = [v(1)];
  const live = new Set(["b"]);
  assert.equal(pushedOut(l[2], views, live), true);
  assert.equal(pushedOut(l[1], views, live), false);
  assert.equal(pushedOut(l[3], views, live), false);
  assert.equal(pushedOut(l[0], views, live), false);
});

test("folderTab", () => {
  const l = [{ ...s("a", 2, 10), cwd: "/w/q" }];
  assert.equal(folderTab([v(1, { cwd: "/w/p" })], [], "/w/p/"), 1);
  assert.equal(folderTab([v(1, { cwd: "/w/p/" })], [], "/w/p"), 1);
  assert.equal(folderTab([v(1, { cwd: "/w/p", phase: "ended" })], [], "/w/p"), null);
  assert.equal(folderTab([v(2)], l, "/w/q"), 2);
  assert.equal(folderTab([v(2)], l, "/w/x"), null);
  assert.equal(folderTab([v(1, { cwd: "/w/p" })], [], null), null);
  assert.equal(folderTab([v(1, { cwd: "/w/p", phase: "starting" })], [], "/w/p"), 1);
});

test("liveRow", () => {
  const ss = (state, stalled = false) => ({ ...s("a", 1, 10), state, stalled });
  let r = liveRow(v(1, { phase: "starting" }), null);
  assert.deepEqual([r.sym, r.status, r.time, r.title], ["…", "시작하는 중…", false, "t1 — 시작하는 중"]);
  r = liveRow(v(1), null);
  assert.deepEqual([r.sym, r.status, r.time], [null, "실행 중 · 세션 연결 전", false]);
  r = liveRow(v(1, { wait: true }), ss("waiting"));
  assert.deepEqual([r.sym, r.status, r.time, r.title], ["!", "답을 기다리는 중", true, "t1 — 답을 기다리는 중"]);
  assert.equal(liveRow(v(1), ss("waiting")).sym, null);
  assert.equal(liveRow(v(1), ss("done")).sym, null);
  assert.equal(liveRow(v(1), ss("working")).sym, "working");
  assert.equal(liveRow(v(1), ss("error")).sym, "error");
  assert.equal(liveRow(v(1), ss("working", true)).sym, "stalled");
  r = liveRow(v(1), ss("working"));
  assert.deepEqual([r.status, r.title, r.time], ["실행 중", "t1 — 실행 중", true]);
  r = liveRow(v(1, { phase: "stopping" }), ss("working"));
  assert.deepEqual([r.sym, r.status, r.time], ["…", "종료하는 중…", false]);
  r = liveRow(v(1, { phase: "ended" }), ss("done"));
  assert.deepEqual([r.sym, r.status, r.time, r.title], ["—", "종료됨", true, "t1 — 종료됨"]);
  assert.equal(liveRow(v(1, { phase: "ended" }), null).time, false);
});

test("makeOff", () => {
  const t = (phase, wait = false) => ({ id: 1, name: "a", phase, wait, cwd: null });
  assert.equal(typeof makeOff(undefined), "string");
  for (const ph of ["starting", "stopping", "ended"]) assert.equal(makeOff(t(ph)), makeOff(undefined));
  assert.equal(typeof makeOff(t("running", true)), "string");
  assert.notEqual(makeOff(t("running", true)), makeOff(undefined));
  assert.equal(makeOff(t("running", false)), null);
});

test("ASK_ROADMAP", () => {
  assert.ok(ASK_ROADMAP.length > 0);
  assert.ok(!/[\r\n]/.test(ASK_ROADMAP));
  for (const w of ["ROADMAP.md", "- [ ]", "- [x]", "## "]) assert.ok(ASK_ROADMAP.includes(w), w);
});

test("nextKey: 맥 ⌘J만", () => {
  assert.equal(nextKey(k("j", { metaKey: true }), true), true);
  assert.equal(nextKey(k("J", { metaKey: true }), true), true);
  assert.equal(nextKey(k("ㅓ", { metaKey: true, code: "KeyJ" }), true), true);
  assert.equal(nextKey(k("j", { ctrlKey: true }), true), false);
  assert.equal(nextKey(k("j", { metaKey: true, shiftKey: true }), true), false);
  assert.equal(nextKey(k("j", { metaKey: true, altKey: true }), true), false);
  assert.equal(nextKey(k("j", { metaKey: true, ctrlKey: true }), true), false);
  assert.equal(nextKey(k("j", { metaKey: true }), false), false);
  assert.equal(nextKey(k("k", { metaKey: true }), true), false);
});

test("attention: 대기·에러만 센다", () => {
  assert.deepEqual(attention(["!", "error", "stalled", "working", null, "…", "—", "!"]), { wait: 2, error: 1 });
  assert.deepEqual(attention([]), { wait: 0, error: 0 });
});

test("nextAttention", () => {
  assert.equal(nextAttention(["!", "working", "!"], 0), 2);
  assert.equal(nextAttention(["!", "working", "!"], 2), 0);
  assert.equal(nextAttention(["!", "working", "!"], 1), 2);
  assert.equal(nextAttention(["working", "error", "error"], 1), 2);
  assert.equal(nextAttention(["error", "!", "error"], 1), 1);
  assert.equal(nextAttention(["working", "!"], 1), 1);
  assert.equal(nextAttention(["working", "stalled", null], 0), null);
  assert.equal(nextAttention([], null), null);
  assert.equal(nextAttention(["working", "!", "!"], null), 1);
});

test("waitText", () => {
  assert.equal(waitText({ kind: "permission", tool: "Bash" }), "권한 요청: Bash");
  assert.equal(waitText({ kind: "permission", tool: null }), "권한 요청");
  assert.equal(waitText({ kind: "question", tool: null }), "질문에 답을 기다림");
  assert.equal(waitText(null), "답을 기다리는 중");
  assert.equal(waitText(undefined), "답을 기다리는 중");
  assert.equal(waitText({ kind: "zzz", tool: null }), "답을 기다리는 중");
});

test("ctxShort", () => {
  assert.equal(ctxShort(999), "999");
  assert.equal(ctxShort(1000), "1k");
  assert.equal(ctxShort(142499), "142k");
  assert.equal(ctxShort(1_500_000), "1.5M");
});

test("liveRow: 대기 이유·토큰", () => {
  const ss = (o) => ({ ...s("a", 1, 10), state: "working", stalled: false, ...o });
  let r = liveRow(v(1, { wait: true }), ss({ wait: { kind: "permission", tool: "Bash" } }));
  assert.deepEqual([r.sym, r.status, r.sr, r.title], ["!", "권한 요청: Bash", ", 권한 요청: Bash", "t1 — 권한 요청: Bash"]);
  assert.equal(liveRow(v(1, { wait: true }), ss({})).status, "답을 기다리는 중");
  assert.equal(liveRow(v(1, { wait: true }), null).status, "답을 기다리는 중");
  r = liveRow(v(1), ss({ ctx_tokens: 142000 }));
  assert.deepEqual([r.ctx, r.ctxSr], ["142k", ", 컨텍스트 142,000 토큰"]);
  for (const bad of [null, "x", -1, undefined, NaN]) {
    r = liveRow(v(1), ss({ ctx_tokens: bad }));
    assert.deepEqual([r.ctx, r.ctxSr], [null, ""]);
  }
  for (const phase of ["starting", "ended"]) assert.equal(liveRow(v(1, { phase }), ss({ ctx_tokens: 5000 })).ctx, null);
  assert.equal(liveRow(v(1), null).ctx, null);
});

test("groupPast", () => {
  const p = (id, cwd) => ({ id, cwd });
  const g = groupPast([p("a", "/w/x"), p("b", "/v/x"), p("c", "/w/x/"), p("d", null), p("e", ""), p("f", "/v/x")]);
  assert.deepEqual(g.map((x) => x.key), ["p:/w/x", "p:/v/x", ""]);
  assert.deepEqual(g.map((x) => x.items.map((i) => i.id)), [["a", "c"], ["b", "f"], ["d", "e"]]);
  assert.equal(g[0].cwd, "/w/x");
  assert.equal(g[2].cwd, null);
  assert.deepEqual(groupPast([]), []);
});
