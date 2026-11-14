export type Source = "hook" | "log" | "both";
export type SessionState = "working" | "waiting" | "done" | "error";
export type NodeState = "running" | "waiting" | "done" | "failed" | "unknown";
export type Agent = { tool_use_id: string | null; agent_id: string | null; kind: string | null; description: string | null;
  state: NodeState; started_ms: number | null; duration_ms: number | null; tokens: number | null };
export type Session = { id: string; cwd: string | null; started_ms: number | null; last_ms: number; source: Source;
  ver: number; state: SessionState; agents: Agent[]; stalled: boolean };

export const shownState = (s: Session) => (s.stalled ? "stalled" : s.state); // 판정은 Rust snapshot이 한다
export const nodeKey = (a: Agent) => a.tool_use_id ?? a.agent_id ?? "";

const p2 = (n: number) => String(n).padStart(2, "0");

// null·0 → "—", 오늘 HH:MM, 아니면 MM/DD HH:MM
export const fmtTime = (ms: number | null, now: number): string => {
  if (!ms) return "—";
  const d = new Date(ms);
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return d.toDateString() === new Date(now).toDateString() ? hm : `${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${hm}`;
};

// cwd 마지막 조각(/, \ 기준), 없으면 id 앞 8자
export const folderName = (s: Session): string =>
  s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? s.id.slice(0, 8);
