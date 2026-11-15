import { useEffect, useState } from "react";
import "./DesignView.css";
import { addNode, connect, layout, NODE_H, NODE_W, removeNode, step } from "./designGraph";
import type { DesignGraph } from "./types";

export type Msg = { text: string; err: boolean } | null;

type Props = {
  graph: DesignGraph;
  selected: string | null;
  msg: Msg;
  onSelect: (id: string | null) => void;
  onChange: (g: DesignGraph) => void;
  say: (text: string, err?: boolean) => void;
};

// 렌더 뒤에 포커스·스크롤할 DOM id (id는 앱이 만든 [a-z0-9-] 문자열)
type Pending = { dom: string; focus: boolean } | null;

export default function DesignView({ graph, selected, msg, onSelect, onChange, say }: Props) {
  const [src, setSrc] = useState<string | null>(null); // 연결 모드 출발 노드 id
  const [pending, setPending] = useState<Pending>(null);
  const lay = layout(graph);
  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const linking = src !== null;

  useEffect(() => {
    if (!pending) return;
    const el = document.getElementById(pending.dom);
    if (el) {
      if (pending.focus) el.focus();
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: calm ? "auto" : "smooth" });
    }
    setPending(null);
  }, [pending]);

  const cancel = () => {
    if (src === null) return;
    const id = src;
    setSrc(null);
    say("");
    setPending({ dom: `dn-${id}`, focus: true });
  };

  const startLink = () => {
    if (linking) return cancel();
    if (selected === null) return;
    setSrc(selected);
    say(`연결: ${nameOf(selected)} → 이을 노드를 고르고 Enter · Esc 취소`);
    setPending({ dom: `dn-${selected}`, focus: true });
  };

  const add = () => {
    const r = addNode(graph);
    onChange(r.graph);
    onSelect(r.id);
    say(`${r.graph.nodes.find((n) => n.id === r.id)?.name ?? r.id}을 추가했습니다`);
    setPending({ dom: `dn-${r.id}`, focus: false });
  };

  const del = () => {
    if (selected === null) return;
    const name = nameOf(selected);
    const r = removeNode(graph, selected);
    onChange(r.graph);
    onSelect(null);
    say(r.removed > 0 ? `${name}와 연결 ${r.removed}개를 지웠습니다` : `${name}를 지웠습니다`);
    setPending({ dom: "dg-add", focus: true });
  };

  const pick = (id: string) => {
    if (src !== null) {
      const r = connect(graph, src, id);
      if (!r.ok) return say(r.error, true);
      onChange(r.graph);
      onSelect(id);
      say(`${nameOf(src)} → ${nameOf(id)} 연결했습니다`);
      setSrc(null);
      setPending({ dom: `dn-${id}`, focus: true });
      return;
    }
    if (selected === id) {
      const f = document.getElementById("dp-name") as HTMLInputElement | null;
      f?.focus();
      f?.select();
      return;
    }
    onSelect(id);
    setPending({ dom: `dn-${id}`, focus: false });
  };

  const onNodeKey = (e: React.KeyboardEvent, id: string) => {
    if (!e.key.startsWith("Arrow")) return;
    e.preventDefault();
    const to = step(lay.columns, id, e.key);
    if (to) setPending({ dom: `dn-${to}`, focus: true });
  };

  return (
    <div
      className="dg"
      onKeyDown={(e) => {
        if (e.key === "Escape" && linking) {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <div className="dg-tools">
        <button type="button" id="dg-add" className="btn" disabled={linking} onClick={add}>노드 추가</button>
        <button type="button" className="btn" aria-pressed={linking} disabled={!linking && selected === null} onClick={startLink}>연결</button>
        <button type="button" className="btn" disabled={linking || selected === null} onClick={del}>삭제</button>
      </div>
      <p className={`dg-msg${msg?.err ? " err" : ""}`} role="status" title={msg?.text ?? ""}>
        {msg?.err && <span className="px" aria-hidden="true">✕</span>}
        {msg?.text}
      </p>
      <div className="gscroll">
        {graph.nodes.length === 0 ? (
          <div className="dg-empty">
            <p className="empty">빈 설계 그래프입니다</p>
            <p className="note">노드 추가로 첫 노드를 만듭니다</p>
          </div>
        ) : (
          <div className="canvas" style={{ width: lay.width, height: lay.height }}>
            <svg className="edges" width={lay.width} height={lay.height} viewBox={`0 0 ${lay.width} ${lay.height}`} shapeRendering="crispEdges" aria-hidden="true">
              {lay.edges.map((e) => (
                <path key={`${e.from}>${e.to}`} className="edge" d={e.d} />
              ))}
            </svg>
            <ol className="nodes" aria-label="설계 노드">
              {lay.columns.flat().map((id) => {
                const n = graph.nodes.find((x) => x.id === id);
                const p = lay.at[id];
                if (!n || !p) return null;
                return (
                  <li key={id} style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}>
                    <button
                      type="button"
                      id={`dn-${id}`}
                      className={`node${src === id ? " is-src" : ""}`}
                      aria-current={selected === id ? "true" : undefined}
                      onClick={() => pick(id)}
                      onKeyDown={(e) => onNodeKey(e, id)}
                    >
                      <span className="n-name px">
                        <span className="mark" aria-hidden="true">▶ </span>
                        {n.name}
                        {src === id && <span className="sr">연결 출발점</span>}
                      </span>
                      <span className="n-task">{n.task.split("\n")[0] || "할 일 없음"}</span>
                      <span className="n-meta">{`${n.model} · 재시도 ${n.retries}${n.schema ? " · 스키마" : ""}`}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
