import type { Agent, NodeState, Raid, SessionState, Track, Verdict } from "./types";
import { NODE_LABEL, LEAD_LABEL } from "./types.ts";

export type Job = "commander" | "wizard" | "warrior" | "archer" | "rogue" | "healer" | "paladin";
export type Monster = "slime" | "goblin" | "orc" | "dragon";
export type Act = "attack" | "wait" | "ko" | "idle" | "sleep";
export type GateName = "plan" | "review" | "verify" | "security";
export type Look = "closed" | "broken" | "failed";
export type Shield = { gate: GateName; look: Look };
export type Shown = SessionState | "stalled";

export const JOB_LABEL: Record<Job, string> = { commander: "기사단장", wizard: "마법사", warrior: "전사", archer: "궁수", rogue: "도적", healer: "힐러", paladin: "성기사" };
export const MONSTER_LABEL: Record<Monster, string> = { slime: "슬라임", goblin: "고블린", orc: "오크", dragon: "드래곤" };
export const STAGE_LABEL: Record<string, string> = { brief: "요구 정리", plan: "계획", build: "구현", review: "리뷰", verify: "검증", security: "보안", release: "머지", done: "끝" };
export const GATE_LABEL: Record<GateName, string> = { plan: "계획 점검", review: "리뷰", verify: "검증", security: "보안" };

const ORDER = ["brief", "plan", "build", "review", "verify", "security", "release", "done"];
export const TRACK_STAGES: Record<Track, string[]> = {
  quick: ["plan", "build", "verify", "release"],
  standard: ["plan", "build", "review", "verify", "release"],
  full: ["brief", "plan", "build", "review", "verify", "security", "release"],
};
// harness/hooks/gate.mjs SHIP 표와 같은 값(바뀌면 같이 고친다)
export const TRACK_GATES: Record<Track, GateName[]> = {
  quick: ["verify"],
  standard: ["plan", "review", "verify"],
  full: ["plan", "review", "verify", "security"],
};

export const jobOf = (kind: string | null): Job => {
  if (!kind) return "warrior";
  if (kind === "architect") return "wizard";
  if (kind === "engineer") return "warrior";
  if (kind.startsWith("reviewer") || kind === "plan-checker") return "archer";
  if (kind.startsWith("security")) return "rogue";
  if (kind === "debugger") return "healer";
  if (kind.startsWith("qa")) return "paladin";
  return "warrior";
};

const trackOf = (raid: Raid | null): Track | null => (raid && raid.kind === "run" ? raid.track : null);

export const monsterOf = (raid: Raid | null): Monster => {
  const t = trackOf(raid);
  return t === "quick" ? "goblin" : t === "standard" ? "orc" : t === "full" ? "dragon" : "slime";
};

export const fallen = (raid: Raid | null, state: Shown): boolean =>
  raid && raid.kind === "run" && raid.track ? raid.stage === "done" : state === "done";

export const progress = (raid: Raid | null, agents: Agent[], state: Shown): number => {
  const track = trackOf(raid);
  if (!raid || raid.kind !== "run" || !track) return state === "done" ? 1 : 0;
  if (raid.stage === "done") return 1;
  const list = TRACK_STAGES[track];
  let i = 0;
  if (raid.stage) {
    const at = ORDER.indexOf(raid.stage);
    i = list.findIndex((s) => ORDER.indexOf(s) >= at);
    if (i < 0) i = list.length - 1;
  }
  let f = 0;
  if (raid.stage === "build") {
    const eng = agents.filter((a) => a.kind === "engineer");
    if (eng.length) f = eng.filter((a) => a.state === "done").length / eng.length;
  }
  return Math.min(1, Math.max(0, (i + f) / list.length));
};

export const hp = (raid: Raid | null, agents: Agent[], state: Shown): number =>
  Math.round(100 * (1 - progress(raid, agents, state)));

const VERDICT_LOOK: Record<Verdict, Look> = { missing: "closed", pending: "closed", pass: "broken", fail: "failed" };
export const shields = (raid: Raid | null): Shield[] => {
  const track = trackOf(raid);
  if (!raid || raid.kind !== "run" || !track) return [];
  return TRACK_GATES[track].map((gate) => ({ gate, look: VERDICT_LOOK[raid.gates[gate]] }));
};

export const healing = (raid: Raid | null, state: Shown): boolean =>
  !fallen(raid, state) && shields(raid).some((s) => s.look === "failed");

const BUBBLE: Record<string, string> = {
  Read: "파일 읽는 중", NotebookRead: "파일 읽는 중", Grep: "찾는 중", Glob: "찾는 중",
  Edit: "고치는 중", MultiEdit: "고치는 중", Write: "고치는 중", NotebookEdit: "고치는 중",
  Bash: "명령 실행 중", WebFetch: "웹 찾는 중", WebSearch: "웹 찾는 중",
  Agent: "지시하는 중", Task: "지시하는 중", TodoWrite: "할 일 정리 중",
};
export const bubble = (tool: string | null): string | null => {
  if (tool == null) return null;
  if (Object.prototype.hasOwnProperty.call(BUBBLE, tool)) return BUBBLE[tool];
  return tool.startsWith("mcp__") ? "외부 도구 쓰는 중" : "일하는 중";
};

export const heroAct = (s: NodeState): Act => (s === "running" ? "attack" : s === "waiting" ? "wait" : s === "failed" ? "ko" : "idle");
export const leadAct = (s: Shown): Act =>
  s === "working" ? "attack" : s === "waiting" ? "wait" : s === "error" ? "ko" : s === "stalled" ? "sleep" : "idle";

// 역할 텍스트는 kind → description → "—". 문자열은 그대로 담는다(HTML로 넣지 않는 것은 호출부 몫).
export const heroLabel = (job: Job, kind: string | null, description: string | null, stateText: string, act: Act, tool: string | null): string => {
  const base = `${JOB_LABEL[job]}(${kind ?? description ?? "—"}) · ${stateText}`;
  const b = act === "attack" ? bubble(tool) : null;
  return b ? `${base} · 지금 하는 일(추정): ${b}` : base;
};

export const summary = (raid: Raid | null, agents: Agent[], state: Shown): string => {
  const name = MONSTER_LABEL[monsterOf(raid)];
  if (fallen(raid, state)) return `${name} 쓰러짐`;
  const track = trackOf(raid);
  const parts = [`${track ? `${name}(${track})` : name} HP ${hp(raid, agents, state)}%`];
  if (raid && raid.kind === "run" && track && raid.stage) parts.push(`${STAGE_LABEL[raid.stage] ?? raid.stage} 단계`);
  const acting = (leadAct(state) === "attack" ? 1 : 0) + agents.filter((a) => heroAct(a.state) === "attack").length;
  parts.push(`용사 ${agents.length + 1}명 중 ${acting}명 공격 중`);
  const sh = shields(raid);
  if (sh.length) parts.push(`방어막 ${sh.length}개 중 ${sh.filter((s) => s.look === "broken").length}개 깨짐`);
  if (raid && raid.kind === "run" && raid.loops >= 1) parts.push(`되돌림 ${raid.loops}회`);
  if (healing(raid, state)) parts.push("몬스터 회복 중");
  return parts.join(", ");
};

export { NODE_LABEL, LEAD_LABEL };
