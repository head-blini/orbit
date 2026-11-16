import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jobOf, JOB_LABEL, monsterOf, MONSTER_LABEL, progress, hp, fallen, shields, healing,
  bubble, heroAct, leadAct, heroLabel, summary, TRACK_STAGES, TRACK_GATES, STAGE_LABEL,
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
  assert.deepEqual(STAGE_LABEL, { brief: "요구 정리", plan: "계획", build: "구현", review: "리뷰", verify: "검증", security: "보안", release: "머지", done: "끝" });
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
  const t = { Read: "파일 읽는 중", NotebookRead: "파일 읽는 중", Grep: "찾는 중", Glob: "찾는 중", Edit: "고치는 중",
    MultiEdit: "고치는 중", Write: "고치는 중", NotebookEdit: "고치는 중", Bash: "명령 실행 중", WebFetch: "웹 찾는 중",
    WebSearch: "웹 찾는 중", Agent: "지시하는 중", Task: "지시하는 중", TodoWrite: "할 일 정리 중" };
  for (const [k, v] of Object.entries(t)) assert.equal(bubble(k), v, k);
  assert.equal(bubble("mcp__x"), "외부 도구 쓰는 중");
  assert.equal(bubble("Whatever"), "일하는 중");
  assert.equal(bubble("toString"), "일하는 중");
  assert.equal(bubble(null), null);
});

test("⑦ heroAct·leadAct", () => {
  assert.deepEqual(["running", "waiting", "failed", "done", "unknown"].map(heroAct), ["attack", "wait", "ko", "idle", "idle"]);
  assert.deepEqual(["working", "waiting", "error", "stalled", "done"].map(leadAct), ["attack", "wait", "ko", "sleep", "idle"]);
});

test("⑧ heroLabel", () => {
  assert.equal(heroLabel("warrior", "engineer", null, "실행 중", "attack", "Edit"), "전사(engineer) · 실행 중 · 지금 하는 일(추정): 고치는 중");
  assert.equal(heroLabel("warrior", "engineer", null, "끝남", "idle", "Edit"), "전사(engineer) · 끝남");
  assert.equal(heroLabel("warrior", "engineer", null, "실행 중", "attack", null), "전사(engineer) · 실행 중");
  assert.equal(heroLabel("warrior", "<b>x</b>", null, "끝남", "idle", null), "전사(<b>x</b>) · 끝남");
  assert.equal(heroLabel("warrior", null, "설명", "끝남", "idle", null), "전사(설명) · 끝남");
  assert.equal(heroLabel("warrior", null, null, "끝남", "idle", null), "전사(—) · 끝남");
});

test("⑨ summary", () => {
  const r = run("standard", "build", { loops: 1, gates: gates({ plan: "pass" }) });
  const agents = [ag("engineer", "running"), ag("engineer", "done"), ag("qa", "done")];
  assert.equal(summary(r, agents, "working"), "오크(standard) HP 70%, 구현 단계, 용사 4명 중 2명 공격 중, 방어막 3개 중 1개 깨짐, 되돌림 1회");
  const hr = run("standard", "build", { loops: 1, gates: gates({ plan: "fail" }) });
  assert.equal(summary(hr, agents, "working"), "오크(standard) HP 70%, 구현 단계, 용사 4명 중 2명 공격 중, 방어막 3개 중 0개 깨짐, 되돌림 1회, 몬스터 회복 중");
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
