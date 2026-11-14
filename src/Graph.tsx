import { useEffect, useRef } from "react";
import { LEAD_LABEL, NODE_LABEL, fmtDur, fmtTokens, nodeKey, shownState, type NodeState, type Session } from "./types";
import "./Graph.css";

const W = 168, H = 60, PX = 216, PY = 72, BUS = 24;

type Kind = "run" | "wait" | "fail" | "none";
const SYMBOL: Record<NodeState, string> = { running: "", waiting: "!", done: "", failed: "✕", unknown: "—" };

type Box = { key: string; name: string; label: string; cls: Kind; sym: string; blink: boolean; meta: string; run: boolean; x: number; y: number; target: boolean };

export default function Graph({ session, selected, onSelect }: { session: Session | null; selected: string | null; onSelect: (key: string) => void }) {
  const agents = session?.agents ?? [];
  const manual = useRef(false);
  const targetRef = useRef<HTMLLIElement>(null);
  const nCols = new Set(agents.map((a) => a.col)).size;
  // 세션·열 수·상태가 안 바뀐 갱신에서는 effect가 돌지 않아 사용자가 옮긴 스크롤을 되돌리지 않는다.
  const moveKey = session ? `${session.id}|${nCols}|${agents.map((a) => a.state).join(",")}` : "";

  useEffect(() => { manual.current = false; }, [session?.id]);
  useEffect(() => {
    targetRef.current?.scrollIntoView({
      inline: manual.current || selected ? "nearest" : "end", block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey]);

  if (!session) return <p className="empty">세션을 고르면 에이전트 흐름이 보입니다</p>;

  // Rust가 준 col을 1..n 촘촘한 순위로 바꾼다. Lead는 0.
  const cols = [...new Set(agents.map((a) => a.col))].sort((p, q) => p - q);
  const columns: Box[][] = cols.map(() => []);
  agents.forEach((a) => {
    const d = cols.indexOf(a.col);
    columns[d].push({
      key: nodeKey(a), name: a.kind ?? a.description ?? "—", label: NODE_LABEL[a.state] ?? "알 수 없음",
      cls: a.state === "running" ? "run" : a.state === "waiting" ? "wait" : a.state === "failed" ? "fail" : "none",
      sym: SYMBOL[a.state] ?? "", blink: a.state === "waiting", run: a.state === "running", x: (d + 1) * PX, y: 0, target: false,
      meta: a.state === "waiting" ? "권한 요청" : `${fmtDur(a.duration_ms)} · ${fmtTokens(a.tokens)}`,
    });
  });
  const ch = Math.max(H, ...columns.map((c) => c.length * PY - (PY - H)));
  columns.forEach((c) => c.forEach((b, i) => { b.y = (ch - (c.length * PY - (PY - H))) / 2 + i * PY; }));
  // 실행 중·대기 노드가 있는 가장 오른쪽 열의 첫 노드가 자동 스크롤 대상이다.
  for (let d = columns.length - 1; d >= 0; d--) {
    const t = columns[d].find((b) => b.cls === "run" || b.cls === "wait");
    if (t) { t.target = true; break; }
  }

  const st = shownState(session);
  const lead: Box = {
    key: "lead", name: "Lead", label: LEAD_LABEL[st], run: false, meta: "", x: 0, y: (ch - H) / 2, target: false,
    cls: st === "working" ? "run" : st === "waiting" ? "wait" : st === "error" ? "fail" : "none",
    sym: st === "waiting" ? "!" : st === "error" ? "✕" : st === "stalled" ? "?" : "", blink: st === "waiting",
  };

  const render = (b: Box) => (
    <li key={b.key || `i${b.x}_${b.y}`} ref={b.target ? targetRef : undefined} style={{ left: b.x, top: b.y, height: H }}>
      <button type="button" aria-current={b.key === selected ? "true" : undefined} onClick={() => onSelect(b.key)}
        className={`node${b.cls === "none" ? "" : ` is-${b.cls}`}`}>
        <span className="n-name px"><span className="mark" aria-hidden="true">▶ </span>{b.name}</span>
        <span className="n-state px">{b.label}</span>
        {b.sym && <span className={`sym${b.blink ? " blink" : ""}`} aria-hidden="true">{b.sym}</span>}
        {b.cls === "run" ? <span className="pbar" aria-hidden="true"><i /></span> : b.meta && <span className="n-meta">{b.meta}</span>}
      </button>
    </li>
  );

  // 열 d-1 -> d 간선. 1:1이면 곧은 선, 아니면 버스 하나로 묶는다. 받는 쪽 실행 중 가지만 flow 경로로 뺀다.
  const all = [[lead], ...columns];
  const edges = columns.map((next, i) => {
    const prev = all[i], d = i + 1, xr = i * PX + W, xb = d * PX - BUS, xe = d * PX;
    const mid = (b: Box) => b.y + H / 2;
    if (prev.length === 1 && next.length === 1 && mid(prev[0]) === mid(next[0]))
      return <path key={d} className={next[0].run ? "edge flow" : "edge"} d={`M${xr} ${mid(prev[0])} H${xe}`} />;
    const ys = [...prev, ...next].map(mid);
    const norm = [
      ...prev.map((b) => `M${xr} ${mid(b)} H${xb}`), `M${xb} ${Math.min(...ys)} V${Math.max(...ys)}`,
      ...next.filter((b) => !b.run).map((b) => `M${xb} ${mid(b)} H${xe}`),
    ].join(" ");
    const flow = next.filter((b) => b.run).map((b) => `M${xb} ${mid(b)} H${xe}`).join(" ");
    return (
      <g key={d}>
        <path className="edge" d={norm} />
        {flow && <path className="edge flow" d={flow} />}
      </g>
    );
  });

  const cw = columns.length ? (columns.length + 1) * PX - (PX - W) : PX + W;
  const touch = () => { manual.current = true; };
  return (
    <div className="gscroll" onWheel={touch} onPointerDown={touch} onKeyDown={touch}>
      <div className="canvas" style={{ width: cw, height: ch }}>
        <svg className="edges" width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} shapeRendering="crispEdges" aria-hidden="true">
          {edges}
        </svg>
        <ol className="nodes" aria-label="에이전트">
          {render(lead)}
          {columns.flat().map(render)}
        </ol>
        {columns.length === 0 && <p className="side-note" style={{ left: PX, top: (ch - H) / 2 + H / 2 - 9 }}>서브에이전트 없음</p>}
      </div>
    </div>
  );
}
