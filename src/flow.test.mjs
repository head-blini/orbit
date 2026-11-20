import { test } from "node:test";
import assert from "node:assert/strict";
import { STEPS, steps, loopsText, agentRows, doneText } from "./flow.ts";
import { TRACK_STAGES, TRACK_GATES } from "./raid.ts";

const gates = (o = {}) => ({ plan: "missing", review: "missing", verify: "missing", security: "missing", ...o });
const run = (track, stage, o = {}) => ({ kind: "run", track, stage, loops: 0, loops_by: { plan: 0, review: 0, debug: 0, security: 0 }, tasks: null, gates: gates(), ...o });
const marks = (r) => steps(r).steps.map((s) => s.mark).join(",");
const labels = (r) => steps(r).steps.map((s) => s.label).join(",");

test("트랙별 단계 라벨", () => {
  assert.equal(labels(run("quick", "plan")), "계획,구현,점검,기록");
  assert.equal(labels(run("standard", "plan")), "계획,계획검토,구현,리뷰,점검,기록");
  assert.equal(labels(run("full", "brief")), "요약,계획,계획검토,구현,리뷰,점검,보안,기록");
});

test("quick: stage별 mark", () => {
  assert.equal(marks(run("quick", "plan")), "now,todo,todo,todo");
  assert.equal(marks(run("quick", "build")), "done,now,todo,todo");
  assert.equal(marks(run("quick", "verify")), "done,done,now,todo");
  assert.equal(marks(run("quick", "review")), "done,done,now,todo"); // 트랙에 없는 stage는 뒤 첫 단계
});

test("standard: 계획검토는 ▶가 되지 않는다", () => {
  assert.equal(marks(run("standard", "plan")), "now,todo,todo,todo,todo,todo");
  assert.equal(marks(run("standard", "brief")), "now,todo,todo,todo,todo,todo");
  assert.equal(marks(run("standard", "plan", { gates: gates({ plan: "pending" }) })), "now,todo,todo,todo,todo,todo");
  assert.equal(marks(run("standard", "plan", { gates: gates({ plan: "pass" }) })), "now,done,todo,todo,todo,todo");
  assert.equal(marks(run("standard", "build", { gates: gates({ plan: "pass" }) })), "done,done,now,todo,todo,todo");
  assert.equal(marks(run("standard", "review")), "done,todo,done,now,todo,todo");
  assert.equal(marks(run("standard", "verify")), "done,todo,done,todo,now,todo"); // pass 아닌 앞 체크는 todo
});

test("체크 칸: 되돌아간 뒤 옛 pass는 todo, fail은 앞이어도 fail", () => {
  assert.equal(marks(run("standard", "build", { gates: gates({ plan: "pass", review: "pass" }) })), "done,done,now,todo,todo,todo");
  assert.equal(marks(run("standard", "build", { gates: gates({ plan: "pass", review: "fail" }) })), "done,done,now,fail,todo,todo");
  assert.equal(marks(run("full", "security", { gates: gates({ plan: "pass", review: "pass", verify: "pass" }) })), "done,done,done,done,done,done,now,todo");
  assert.equal(marks(run("full", "security", { gates: gates({ plan: "pass", review: "pass", verify: "pass", security: "pending" }) })), "done,done,done,done,done,done,now,todo");
});

test("done: 체크 pass/fail/pending/missing", () => {
  const r = run("full", "done", { gates: gates({ plan: "pass", review: "fail", verify: "pending", security: "missing" }) });
  assert.equal(marks(r), "done,done,done,done,fail,todo,skip,done");
  assert.equal(steps(r).ended, true);
  assert.equal(steps(run("quick", "build")).ended, false);
  assert.equal(marks(run("quick", "done")), "done,done,skip,done");
});

test("count는 구현이 now이고 tasks가 있을 때만", () => {
  const t = { done: 4, total: 6 };
  const counts = (r) => steps(r).steps.map((s) => s.count);
  assert.deepEqual(counts(run("quick", "build", { tasks: t })), [null, "4/6", null, null]);
  assert.deepEqual(counts(run("quick", "verify", { tasks: t })), [null, null, null, null]);
  assert.deepEqual(counts(run("quick", "build", { tasks: null })), [null, null, null, null]);
  assert.deepEqual(counts(run("quick", "build", { tasks: undefined })), [null, null, null, null]);
});

test("sr 문구", () => {
  const sr = (r) => steps(r).steps.map((s) => s.sr);
  assert.deepEqual(sr(run("quick", "build", { tasks: { done: 4, total: 6 } })), ["계획, 끝남", "구현, 지금 단계, 6개 중 4개", "점검, 아직", "기록, 아직"]);
  assert.equal(sr(run("quick", "build"))[1], "구현, 지금 단계");
  assert.equal(sr(run("standard", "build", { gates: gates({ review: "fail" }) }))[3], "리뷰, 실패");
  assert.equal(sr(run("quick", "done"))[2], "점검, 생략");
});

test("트랙·단계 모름", () => {
  const a = steps(run(null, "build"));
  assert.equal(a.steps.length, 1);
  assert.equal(a.steps[0].label, "구현");
  assert.equal(a.steps[0].mark, "now");
  assert.equal(a.note, "트랙 모름");
  const b = steps(run(null, null));
  assert.deepEqual(b.steps, []);
  assert.equal(b.note, "트랙 모름 · 단계 모름");
  const c = steps(run("quick", null));
  assert.equal(marks(run("quick", null)), "todo,todo,todo,todo");
  assert.equal(c.note, "단계 모름");
  assert.equal(steps(run("quick", "build")).note, null);
});

test("STEPS가 raid.ts 표와 같다", () => {
  for (const t of ["quick", "standard", "full"]) {
    const stages = [...new Set(STEPS[t].map(([, s]) => s))];
    assert.deepEqual(stages, TRACK_STAGES[t], t);
    const checks = STEPS[t].filter(([, , c]) => c).map(([, , c]) => c);
    assert.deepEqual(checks, TRACK_GATES[t], t);
  }
});

test("loopsText", () => {
  assert.deepEqual(loopsText(run("quick", "plan")), { text: "되돌림 없음", sr: "되돌림 없음" });
  const l = loopsText(run("quick", "plan", { loops: 3, loops_by: { plan: 1, review: 1, debug: 0, security: 1 } }));
  assert.equal(l.text, "계획 다시 1 · 리뷰→구현 1 · 보안→구현 1");
  assert.equal(l.sr, "계획을 1번 다시 함, 리뷰에서 구현으로 1번 되돌아감, 보안 점검에서 구현으로 1번 되돌아감");
  assert.equal(loopsText(run("quick", "plan", { loops: 2, loops_by: { plan: 0, review: 0, debug: 2, security: 0 } })).text, "점검 실패 2");
  assert.equal(loopsText(run("quick", "plan", { loops: 2 })).text, "되돌림 2");
  assert.equal(loopsText(run("quick", "plan", { loops: 2, loops_by: undefined })).text, "되돌림 2");
  assert.equal(loopsText(run("quick", "plan", { loops: 0, loops_by: undefined })).text, "되돌림 없음");
  assert.equal(loopsText(run("quick", "plan", { loops: 2, loops_by: { plan: 0, review: 0, debug: 0, security: 0 } })).text, "되돌림 2");
});

const NOW = 10_000_000;
const sess = (o = {}, agents = []) => ({ id: "s", state: "working", stalled: false, wait: null, agents, ...o });
const sub = (kind, state, o = {}) => ({ kind, description: kind + " 일", state, started_ms: null, duration_ms: null, tokens: null, tool: null, ...o });

test("agentRows: Lead 줄", () => {
  const r = agentRows(sess(), NOW);
  assert.deepEqual(r.rows[0], { name: "Lead", desc: "", meta: "실행 중", sym: "bar", wait: false });
  assert.equal(agentRows(sess({ state: "waiting", wait: { kind: "permission", tool: "Bash" } }), NOW).rows[0].meta, "권한 요청: Bash");
  assert.equal(agentRows(sess({ state: "waiting", wait: { kind: "permission", tool: "Bash" } }), NOW).rows[0].wait, true);
  assert.equal(agentRows(sess({ state: "waiting", wait: { kind: "permission", tool: "Bash" } }), NOW).rows[0].sym, "!");
  assert.equal(agentRows(sess({ state: "error" }), NOW).rows[0].sym, "✕");
  assert.equal(agentRows(sess({ stalled: true }), NOW).rows[0].sym, "?");
  assert.equal(agentRows(sess({ stalled: true }), NOW).rows[0].meta, "멈춤(추정)");
  assert.equal(agentRows(sess({ state: "done" }), NOW).rows[0].sym, "");
});

test("agentRows: 정렬 대기 → 실패 → 실행 중 → 알 수 없음, 시작 순", () => {
  const agents = [
    sub("u", "unknown"),
    sub("r-late", "running", { started_ms: NOW - 60_000 }),
    sub("r-null", "running"),
    sub("f", "failed", { duration_ms: 75_000 }),
    sub("r-early", "running", { started_ms: NOW - 600_000 }),
    sub("w", "waiting", { tool: "Bash" }),
    sub("d", "done", { tokens: 100 }),
  ];
  const r = agentRows(sess({}, agents), NOW);
  assert.deepEqual(r.rows.slice(1).map((x) => x.name), ["w", "f", "r-early", "r-late", "r-null", "u"]);
  assert.equal(r.live, 6);
  assert.equal(r.done, 1);
});

test("agentRows: meta와 기호", () => {
  const agents = [
    sub("w", "waiting", { tool: "Bash" }), sub("w2", "waiting"), sub("f", "failed", { duration_ms: 75_000 }), sub("f2", "failed"),
    sub("a", "running", { started_ms: NOW - 4 * 60_000 - 5000 }), sub("b", "running", { started_ms: NOW - 30_000 }),
    sub("c", "running", { started_ms: NOW + 5000 }), sub("d", "running"), sub("u", "unknown"),
  ];
  const m = Object.fromEntries(agentRows(sess({}, agents), NOW).rows.slice(1).map((x) => [x.name, x]));
  assert.equal(m.w.meta, "권한 요청: Bash");
  assert.equal(m.w.wait, true);
  assert.equal(m.w.sym, "!");
  assert.equal(m.w2.meta, "권한 요청");
  assert.equal(m.f.meta, "실패 1분 15초");
  assert.equal(m.f.sym, "✕");
  assert.equal(m.f2.meta, "실패");
  assert.equal(m.a.meta, "4분째");
  assert.equal(m.a.sym, "bar");
  assert.equal(m.b.meta, "1분 미만");
  assert.equal(m.c.meta, "1분 미만");
  assert.equal(m.d.meta, "실행 중");
  assert.equal(m.u.meta, "알 수 없음");
  assert.equal(m.u.sym, "—");
  assert.equal(m.a.desc, "a 일");
});

test("agentRows: kind·description 없음은 —", () => {
  const r = agentRows(sess({}, [{ kind: null, description: null, state: "running", started_ms: null, duration_ms: null, tokens: null, tool: null }]), NOW);
  assert.equal(r.rows[1].name, "—");
  assert.equal(r.rows[1].desc, "—");
});

test("끝남 합계", () => {
  const r = agentRows(sess({}, [sub("a", "done", { tokens: 100_000 }), sub("b", "done", { tokens: 212_000 }), sub("c", "done"), sub("d", "running")]), NOW);
  assert.equal(r.done, 3);
  assert.equal(r.tokens, 312_000);
  assert.equal(doneText(r.done, r.tokens), "끝남 3 · 312k 토큰");
  const n = agentRows(sess({}, [sub("a", "done")]), NOW);
  assert.equal(n.tokens, null);
  assert.equal(doneText(n.done, n.tokens), "끝남 1");
  assert.equal(doneText(1, 1_200_000), "끝남 1 · 1200k 토큰");
});
