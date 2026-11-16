import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jobOf, JOB_LABEL, monsterOf, MONSTER_LABEL, progress, hp, fallen, shields, healing,
  bubble, heroAct, leadAct, heroLabel, summary, TRACK_STAGES, TRACK_GATES,
} from "./raid.ts";

const gates = (o = {}) => ({ plan: "missing", review: "missing", verify: "missing", security: "missing", ...o });
const run = (track, stage, o = {}) => ({ kind: "run", track, stage, loops: 0, gates: gates(), ...o });
const ag = (kind, state) => ({ kind, state, tool: null, description: null });

test("① jobOf 표와 대체", () => {
  const t = { architect: "wizard", engineer: "warrior", reviewer: "archer", "reviewer-correctness": "archer", "plan-checker": "archer",
    security: "rogue", "security-x": "rogue", debugger: "healer", qa: "paladin", "qa-x": "paladin" };
  for (const [k, v] of Object.entries(t)) assert.equal(jobOf(k), v, k);
  assert.equal(jobOf(null), "warrior");
  assert.equal(jobOf("designer"), "warrior");
  assert.deepEqual(Object.values(JOB_LABEL), ["기사단장", "마법사", "전사", "궁수", "도적", "힐러", "성기사"]);
  assert.equal(JOB_LABEL.commander, "기사단장");
});

test("② monsterOf", () => {
  assert.equal(monsterOf(run("quick", "plan")), "goblin");
  assert.equal(monsterOf(run("standard", "plan")), "orc");
  assert.equal(monsterOf(run("full", "plan")), "dragon");
  assert.equal(monsterOf({ kind: "none" }), "slime");
  assert.equal(monsterOf(null), "slime");
  assert.deepEqual(MONSTER_LABEL, { slime: "슬라임", goblin: "고블린", orc: "오크", dragon: "드래곤" });
});

test("③ progress·hp", () => {
  assert.equal(hp(run("standard", "plan"), [], "working"), 100);
  assert.equal(hp(run("standard", "build"), [ag("engineer", "done"), ag("engineer", "running")], "working"), 70);
  assert.equal(hp(run("standard", "build"), [], "working"), 80);
  assert.equal(hp(run("standard", "build"), [ag("engineer", "failed")], "working"), 80);
  assert.equal(hp(run("quick", "review"), [], "working"), 50);
  assert.equal(hp(run("standard", null), [], "working"), 100);
  assert.equal(hp(run("standard", "done"), [], "done"), 0);
  assert.equal(progress(run("standard", "done"), [], "done"), 1);
  assert.equal(hp(run("full", "release"), [], "working"), 14);
  assert.deepEqual(TRACK_STAGES.quick, ["plan", "build", "verify", "release"]);
});

test("④ 슬라임 hp", () => {
  assert.equal(hp({ kind: "none" }, [], "working"), 100);
  assert.equal(hp({ kind: "none" }, [], "done"), 0);
  assert.equal(fallen({ kind: "none" }, "done"), true);
  assert.equal(fallen({ kind: "none" }, "working"), false);
  assert.equal(fallen(run("standard", "done"), "working"), true);
  assert.equal(fallen(run("standard", "build"), "done"), false);
});

test("⑤ shields·healing", () => {
  assert.deepEqual(TRACK_GATES, { quick: ["verify"], standard: ["plan", "review", "verify"], full: ["plan", "review", "verify", "security"] });
  assert.deepEqual(shields(run("quick", "plan")), [{ gate: "verify", look: "closed" }]);
  assert.deepEqual(shields(run("standard", "plan", { gates: gates({ plan: "pass", review: "pending", verify: "fail" }) })),
    [{ gate: "plan", look: "broken" }, { gate: "review", look: "closed" }, { gate: "verify", look: "failed" }]);
  assert.equal(shields(run("full", "plan")).length, 4);
  const f = run("standard", "build", { gates: gates({ plan: "fail" }) });
  assert.equal(healing(f, "working"), true);
  assert.equal(healing(run("standard", "build"), "working"), false);
  assert.equal(healing(run("standard", "done", { gates: gates({ plan: "fail" }) }), "working"), false);
  assert.equal(healing({ kind: "none" }, "working"), false);
});

test("⑥ bubble", () => {
  const t = { commander: "지휘 중", wizard: "설계 중", warrior: "구현 중", archer: "리뷰 중", rogue: "보안 점검 중", healer: "디버깅 중", paladin: "검증 중" };
  for (const [k, v] of Object.entries(t)) assert.equal(bubble(k), v, k);
  assert.equal(bubble("nope"), "일하는 중");
});

test("⑦ heroAct·leadAct", () => {
  assert.deepEqual(["running", "waiting", "failed", "done", "unknown"].map(heroAct), ["attack", "wait", "ko", "idle", "idle"]);
  assert.deepEqual(["working", "waiting", "error", "stalled", "done"].map(leadAct), ["attack", "wait", "ko", "sleep", "idle"]);
});

test("⑧ heroLabel", () => {
  assert.equal(heroLabel("warrior", "engineer", null, "실행 중", "attack"), "전사(engineer) · 실행 중 · 지금 하는 일: 구현 중");
  assert.equal(heroLabel("warrior", "engineer", null, "끝남", "idle"), "전사(engineer) · 끝남");
  assert.equal(heroLabel("warrior", "engineer", null, "실행 중", "attack"), "전사(engineer) · 실행 중 · 지금 하는 일: 구현 중");
  assert.equal(heroLabel("warrior", "<b>x</b>", null, "끝남", "idle"), "전사(<b>x</b>) · 끝남");
  assert.equal(heroLabel("warrior", null, "설명", "끝남", "idle"), "전사(설명) · 끝남");
  assert.equal(heroLabel("warrior", null, null, "끝남", "idle"), "전사(—) · 끝남");
});

test("⑨ summary", () => {
  const r = run("standard", "build", { loops: 1, gates: gates({ plan: "pass" }) });
  const agents = [ag("engineer", "running"), ag("engineer", "done"), ag("qa", "done")];
  assert.equal(summary(r, agents, "working"), "오크 HP 70%, 용사 4명 중 2명 공격 중, 되돌림 1회");
  const hr = run("standard", "build", { loops: 1, gates: gates({ plan: "fail" }) });
  assert.equal(summary(hr, agents, "working"), "오크 HP 70%, 용사 4명 중 2명 공격 중, 되돌림 1회, 몬스터 회복 중");
  assert.equal(summary(run("standard", "done"), agents, "done"), "오크 쓰러짐");
  assert.equal(summary({ kind: "none" }, [], "working"), "슬라임 HP 100%, 용사 1명 중 1명 공격 중");
  assert.equal(summary({ kind: "none" }, [], "done"), "슬라임 쓰러짐");
});

test("⑩ run인데 track null은 슬라임 규칙", () => {
  const r = run(null, "build", { loops: 2, gates: gates({ plan: "fail" }) });
  assert.equal(monsterOf(r), "slime");
  assert.equal(progress(r, [], "working"), 0);
  assert.equal(hp(r, [], "working"), 100);
  assert.equal(fallen(r, "working"), false);
  assert.equal(progress(r, [], "done"), 1);
  assert.equal(hp(r, [], "done"), 0);
  assert.equal(fallen(r, "done"), true);
  assert.deepEqual(shields(r), []);
  assert.equal(healing(r, "working"), false);
});
