import { test } from "node:test";
import assert from "node:assert/strict";
import { tabKey, tabSessions, tabSid, newTabId, nextActive, canResume, quickExit, MAX_TABS, QUICK_EXIT_MS,
  rowId, SAME, splitSessions, pushedOut, folderTab, liveRow, makeOff, ASK_ROADMAP } from "./tabs.ts";

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
