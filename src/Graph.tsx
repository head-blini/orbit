import { CHIP_AT, LEAD_LABEL, NODE_LABEL, fmtDur, fmtTokens, nodeKey, shownState, type NodeState, type Session } from "./types";
import "./Graph.css";

const W = 168, H = 60, CHIP_H = 24, GAP = 10, X1 = 248, XM = 208;

type Kind = "run" | "wait" | "fail" | "none";
const SYMBOL: Record<NodeState, string> = { running: "", waiting: "!", done: "", failed: "✕", unknown: "—" };

type Box = { key: string; name: string; label: string; cls: Kind; sym: string; blink: boolean; meta: string; flow: boolean; y: number; h: number; chip: boolean };

export default function Graph({ session, selected, onSelect }: { session: Session | null; selected: string | null; onSelect: (key: string) => void }) {
  if (!session) return <p className="empty">세션을 고르면 에이전트 흐름이 보입니다</p>;

  const agents = session.agents;
  const many = agents.length >= CHIP_AT;
  // 서브에이전트를 x=248 열에 위에서 아래로 쌓는다.
  let y = 0;
  const kids: Box[] = agents.map((a) => {
    const key = nodeKey(a);
    const chip = many && key !== selected;
    const h = chip ? CHIP_H : H;
    const cls: Kind = a.state === "running" ? "run" : a.state === "waiting" ? "wait" : a.state === "failed" ? "fail" : "none";
    const box: Box = {
      key, name: a.kind ?? a.description ?? "—", label: NODE_LABEL[a.state] ?? "알 수 없음", cls, sym: SYMBOL[a.state] ?? "",
      blink: a.state === "waiting", meta: `${fmtDur(a.duration_ms)} · ${fmtTokens(a.tokens)}`, flow: a.state === "running", y, h, chip,
    };
    y += h + GAP;
    return box;
  });
  const total = Math.max(kids.length ? y - GAP : 0, H);
  const leadMid = kids.length ? Math.max(H / 2, Math.round(total / 2)) : H / 2;

  const st = shownState(session);
  const lead: Box = {
    key: "lead", name: "Lead", label: LEAD_LABEL[st], flow: false, meta: "", chip: false, y: leadMid - H / 2, h: H,
    cls: st === "working" ? "run" : st === "waiting" ? "wait" : st === "error" ? "fail" : "none",
    sym: st === "waiting" ? "!" : st === "error" ? "✕" : st === "stalled" ? "?" : "", blink: st === "waiting",
  };

  const render = (b: Box, x: number) => (
    <li key={b.key || `i${b.y}`} style={{ left: x, top: b.y, height: b.h }}>
      <button type="button" aria-current={b.key === selected ? "true" : undefined} onClick={() => onSelect(b.key)}
        className={`node${b.cls === "none" ? "" : ` is-${b.cls}`}${b.chip ? " chip" : ""}`}>
        <span className="n-name px"><span className="mark" aria-hidden="true">▶ </span>{b.name}</span>
        {b.chip ? <span className="sr">{b.label}</span> : <span className="n-state px">{b.label}</span>}
        {b.sym && <span className={`sym${b.blink ? " blink" : ""}`} aria-hidden="true">{b.sym}</span>}
        {!b.chip && (b.cls === "run" ? <span className="pbar" aria-hidden="true"><i /></span> : b.meta && <span className="n-meta">{b.meta}</span>)}
      </button>
    </li>
  );

  return (
    <div className="canvas" style={{ width: X1 + W, height: total }}>
      <svg className="edges" width={X1 + W} height={total} viewBox={`0 0 ${X1 + W} ${total}`} shapeRendering="crispEdges" aria-hidden="true">
        {kids.map((k) => {
          const mid = k.y + k.h / 2;
          return <path key={k.key || `e${k.y}`} className={k.flow ? "edge flow" : "edge"}
            d={mid === leadMid ? `M${W} ${leadMid} H${X1}` : `M${W} ${leadMid} H${XM} V${mid} H${X1}`} />;
        })}
      </svg>
      <ol className="nodes" aria-label="에이전트">
        {render(lead, 0)}
        {kids.map((k) => render(k, X1))}
      </ol>
      {kids.length === 0 && <p className="side-note" style={{ left: X1, top: leadMid - 9 }}>서브에이전트 없음</p>}
    </div>
  );
}
