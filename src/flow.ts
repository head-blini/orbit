import type { Agent, Raid, Session, Track, Verdict } from "./types";
import { LEAD_LABEL, NODE_LABEL, fmtDur, fmtTokens, shownState } from "./types.ts";
import { waitText } from "./tabs.ts";

type Run = Extract<Raid, { kind: "run" }>;
type Check = "plan" | "review" | "verify" | "security";
export type Mark = "done" | "now" | "todo" | "fail" | "skip";
export type Step = { label: string; mark: Mark; count: string | null; sr: string };

const ORDER = ["brief", "plan", "build", "review", "verify", "security", "release", "done"];
const LABEL: Record<string, string> = { brief: "요약", plan: "계획", build: "구현", review: "리뷰", verify: "점검", security: "보안", release: "기록", done: "끝남" };

// [라벨, stage, 체크?] — raid.ts TRACK_STAGES·TRACK_GATES와 같아야 한다(flow.test.mjs가 확인)
export const STEPS: Record<Track, [string, string, Check?][]> = {
  quick: [["계획", "plan"], ["구현", "build"], ["점검", "verify", "verify"], ["기록", "release"]],
  standard: [["계획", "plan"], ["계획검토", "plan", "plan"], ["구현", "build"], ["리뷰", "review", "review"], ["점검", "verify", "verify"], ["기록", "release"]],
  full: [["요약", "brief"], ["계획", "plan"], ["계획검토", "plan", "plan"], ["구현", "build"], ["리뷰", "review", "review"], ["점검", "verify", "verify"], ["보안", "security", "security"], ["기록", "release"]],
};

const SR: Record<Mark, string> = { done: "끝남", now: "지금 단계", todo: "아직", fail: "실패", skip: "생략" };

export const steps = (raid: Run): { steps: Step[]; note: string | null; ended: boolean } => {
  const ended = raid.stage === "done";
  const mk = (label: string, mark: Mark, count: string | null = null): Step => ({
    label, mark, count, sr: `${label}, ${SR[mark]}` + (count ? `, ${count.split("/")[1]}개 중 ${count.split("/")[0]}개` : ""),
  });
  if (!raid.track) {
    if (!raid.stage) return { steps: [], note: "트랙 모름 · 단계 모름", ended };
    return { steps: [mk(LABEL[raid.stage] ?? raid.stage, "now")], note: "트랙 모름", ended: false }; // stage done이면 단계 칸이 이미 "끝남"이라 ended로 한 번 더 말하지 않는다
  }
  const list = STEPS[raid.track];
  if (!raid.stage) return { steps: list.map(([l]) => mk(l, "todo")), note: "단계 모름", ended };
  const stages = [...new Set(list.map(([, s]) => s))];
  let cur = "done";
  if (!ended) {
    const at = ORDER.indexOf(raid.stage);
    cur = stages.find((s) => ORDER.indexOf(s) >= at) ?? stages[stages.length - 1];
  }
  const o = ORDER.indexOf(cur);
  const out = list.map(([label, stage, check]) => {
    const so = ORDER.indexOf(stage);
    let mark: Mark;
    if (!check) mark = so < o ? "done" : so === o && !ended ? "now" : so === o ? "done" : "todo";
    else {
      const v: Verdict = raid.gates[check];
      if (v === "fail") mark = "fail";
      else if (ended) mark = v === "pass" ? "done" : v === "pending" ? "todo" : "skip";
      else if (so > o) mark = "todo";
      else if (v === "pass") mark = "done";
      else mark = so === o && !list.some(([, s, c]) => s === stage && !c) ? "now" : "todo";
    }
    const count = stage === "build" && mark === "now" && raid.tasks ? `${raid.tasks.done}/${raid.tasks.total}` : null;
    return mk(label, mark, count);
  });
  return { steps: out, note: null, ended };
};

const LOOPS = [
  ["plan", "계획 다시", (n: number) => `계획을 ${n}번 다시 함`],
  ["review", "리뷰→구현", (n: number) => `리뷰에서 구현으로 ${n}번 되돌아감`],
  ["debug", "점검 실패", (n: number) => `점검 실패로 ${n}번 되돌아감`],
  ["security", "보안→구현", (n: number) => `보안 점검에서 구현으로 ${n}번 되돌아감`],
] as const;

export const loopsText = (raid: Run): { text: string; sr: string } => {
  const by = raid.loops_by;
  const hit = by ? LOOPS.filter(([k]) => by[k] > 0) : [];
  if (hit.length) return { text: hit.map(([k, l]) => `${l} ${by[k]}`).join(" · "), sr: hit.map(([k, , f]) => f(by[k])).join(", ") };
  const t = raid.loops > 0 ? `되돌림 ${raid.loops}` : "되돌림 없음";
  return { text: t, sr: t };
};

export type Sym = "bar" | "!" | "✕" | "?" | "—" | "";
export type Row = { name: string; desc: string; meta: string; sym: Sym; wait: boolean };

const GROUP: Record<string, number> = { waiting: 0, failed: 1, running: 2, unknown: 3 };

const subRow = (a: Agent, now: number): Row => {
  const name = a.kind ?? "—";
  const desc = a.description ?? "—";
  switch (a.state) {
    case "waiting": return { name, desc, meta: waitText({ kind: "permission", tool: a.tool }), sym: "!", wait: true };
    case "failed": return { name, desc, meta: NODE_LABEL.failed + (a.duration_ms != null ? ` ${fmtDur(a.duration_ms)}` : ""), sym: "✕", wait: false };
    case "running": {
      const m = a.started_ms == null ? null : Math.floor((now - a.started_ms) / 60000);
      return { name, desc, meta: m == null ? NODE_LABEL.running : m < 1 ? "1분 미만" : `${m}분째`, sym: "bar", wait: false };
    }
    default: return { name, desc, meta: NODE_LABEL.unknown, sym: "—", wait: false };
  }
};

export const agentRows = (session: Session, now: number): { rows: Row[]; live: number; done: number; tokens: number | null } => {
  const st = shownState(session);
  const lead: Row = {
    name: "Lead", desc: "", wait: st === "waiting",
    meta: st === "waiting" ? waitText(session.wait) : LEAD_LABEL[st],
    sym: st === "working" ? "bar" : st === "waiting" ? "!" : st === "error" ? "✕" : st === "stalled" ? "?" : "",
  };
  const subs = session.agents.map((a, i) => ({ a, i })).filter(({ a }) => a.state !== "done" && a.state in GROUP);
  subs.sort((x, y) =>
    GROUP[x.a.state] - GROUP[y.a.state]
    || (x.a.started_ms == null ? 1 : 0) - (y.a.started_ms == null ? 1 : 0)
    || (x.a.started_ms ?? 0) - (y.a.started_ms ?? 0) || x.i - y.i);
  const finished = session.agents.filter((a) => a.state === "done");
  const known = finished.filter((a) => a.tokens != null);
  return {
    rows: [lead, ...subs.map(({ a }) => subRow(a, now))],
    live: subs.length,
    done: finished.length,
    tokens: known.length ? known.reduce((s, a) => s + (a.tokens as number), 0) : null,
  };
};

export const doneText = (done: number, tokens: number | null): string =>
  `끝남 ${done}` + (tokens != null ? ` · ${fmtTokens(tokens)}` : "");
