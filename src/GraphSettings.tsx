import { useEffect, useRef, useState } from "react";
import "./DesignProps.css";
import GraphSave from "./GraphSave";
import type { Msg } from "./DesignView";
import { loopDrafts } from "./graphFile";
import type { DesignGraph, DesignLoop, Opened } from "./types";
import { LOOP_LIMITS, checkBudget, checkMaxIterations, defaultLoop, hasPassed, loopSummary, setLoop } from "./designGraph";

type Props = {
  graph: DesignGraph;
  onChange: (g: DesignGraph) => void;
  say: (text: string, err?: boolean) => void;
  msg: Msg;
  opened: Opened | null;
  onOpened: (o: Opened | null) => void;
};
type Field = "max" | "bud";

function ErrLine({ id, text }: { id: string; text: string }) {
  return (
    <p className="f-err" id={id}>
      <span className="px" aria-hidden="true">✕</span>
      {text}
    </p>
  );
}

export default function GraphSettings({ graph, onChange, say, msg, opened, onOpened }: Props) {
  const loop = graph.loop ?? null;
  const [max, setMax] = useState(() => loopDrafts(loop).max);
  const [bud, setBud] = useState(() => loopDrafts(loop).bud);
  const [errs, setErrs] = useState<Partial<Record<Field, string>>>({});
  const [announce, setAnnounce] = useState("");
  const annTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(annTimer.current), []);

  const setErr = (f: Field, e: string | undefined) => {
    setErrs((p) => ({ ...p, [f]: e }));
    if (e && e !== errs[f]) { setAnnounce(""); window.clearTimeout(annTimer.current); annTimer.current = window.setTimeout(() => setAnnounce(e), 50); } // 같은 오류도 다시 낭독되게 비웠다가 넣는다
  };
  // 불러온 그래프의 루프 값으로 입력 초안을 다시 맞춘다
  const adopt = (g: DesignGraph) => {
    const d = loopDrafts(g.loop ?? null);
    setMax(d.max);
    setBud(d.bud);
    setErrs({});
    window.clearTimeout(annTimer.current);
    setAnnounce("");
    onChange(g);
  };
  const patch = (p: Partial<DesignLoop>) => {
    if (loop) onChange(setLoop(graph, { ...loop, ...p }));
  };

  const turn = (on: boolean) => {
    if (on === (loop !== null)) return;
    if (on) {
      setMax(String(LOOP_LIMITS.iterDefault));
      setBud("");
      setErrs({});
      onChange(setLoop(graph, defaultLoop()));
    } else onChange(setLoop(graph, null));
  };
  const onMax = (v: string) => {
    setMax(v);
    const r = checkMaxIterations(v);
    if (r.ok) {
      setErr("max", undefined);
      patch({ maxIterations: r.value });
    } else setErr("max", r.error);
  };
  const commitBud = (v: string) => {
    const r = checkBudget(v);
    if (r.ok) {
      setErr("bud", undefined);
      patch({ budgetUsd: r.value });
    } else setErr("bud", r.error);
  };

  const untilNode = loop?.until ? graph.nodes.find((n) => n.id === loop.until?.node) : undefined;
  const warn = untilNode !== undefined && !hasPassed(untilNode.schema);

  return (
    <div
      className="props"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          document.getElementById("dg-add")?.focus();
        }
      }}
    >
      <p className="loop-sum">{loopSummary(graph)}</p>
      <div className="f">
        <span className="lb" id="gs-loop">반복</span>
        <div className="modes" role="group" aria-labelledby="gs-loop">
          <button type="button" className="mode" aria-pressed={loop === null} onClick={() => turn(false)}>끔</button>
          <button type="button" className="mode" aria-pressed={loop !== null} onClick={() => turn(true)}>켬</button>
        </div>
      </div>
      {loop && (
        <>
          <div className="f">
            <label htmlFor="gs-until">종료 조건</label>
            <span className="f-sel">
              <select id="gs-until" value={untilNode ? untilNode.id : ""}
                aria-describedby={warn ? "gs-until-n gs-until-w" : "gs-until-n"}
                onChange={(e) => {
                  const n = graph.nodes.find((x) => x.id === e.target.value);
                  patch({ until: n ? { node: n.id } : null });
                }}>
                <option value="">횟수만</option>
                {graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </span>
            <p className="note" id="gs-until-n">
              {untilNode ? `${untilNode.name}의 출력 passed가 true면 끝냅니다` : "최대 반복만큼 돌고 끝냅니다"}
            </p>
            {warn && <p className="f-warn" id="gs-until-w">{untilNode.name} 스키마에 boolean passed가 없습니다</p>}
          </div>
          <div className="f-row num-first">
            <div className="f">
              <label htmlFor="gs-max">최대 반복</label>
              <input id="gs-max" type="number" min={LOOP_LIMITS.iterMin} max={LOOP_LIMITS.iterMax} step={1} value={max}
                onChange={(e) => onMax(e.target.value)}
                aria-invalid={errs.max ? true : undefined}
                aria-describedby={errs.max ? "gs-max-err" : undefined} />
            </div>
            <div className="f">
              <label htmlFor="gs-bud">예산 (USD)</label>
              <input id="gs-bud" type="text" inputMode="decimal" placeholder="없음" value={bud}
                onChange={(e) => {
                  setBud(e.target.value);
                  if (errs.bud) commitBud(e.target.value); // 오류가 떠 있는 동안만 입력마다 재검사
                }}
                onBlur={(e) => commitBud(e.target.value)}
                aria-invalid={errs.bud ? true : undefined}
                aria-describedby={errs.bud ? "gs-bud-err gs-bud-n" : "gs-bud-n"} />
            </div>
          </div>
          {errs.max && <ErrLine id="gs-max-err" text={errs.max} />}
          {errs.bud && <ErrLine id="gs-bud-err" text={errs.bud} />}
          <p className="note" id="gs-bud-n">비용은 추정치라 예산을 넘을 수 있습니다 · 비우면 예산 없음</p>
          <div className="f">
            <span className="lb" id="gs-fail">실패 시</span>
            <div className="modes" role="group" aria-labelledby="gs-fail">
              <button type="button" className="mode" aria-pressed={loop.onFail === "screen"} onClick={() => patch({ onFail: "screen" })}>화면에 표시</button>
              <button type="button" className="mode" aria-pressed={loop.onFail === "none"} onClick={() => patch({ onFail: "none" })}>알리지 않음</button>
            </div>
          </div>
        </>
      )}
      <p className="note">
        {graph.nodes.length === 0
          ? "노드 0개 · 노드 추가로 첫 노드를 만듭니다"
          : `노드 ${graph.nodes.length}개 · 연결 ${graph.edges.length}개 · 노드를 고르면 그 노드의 속성을 고칩니다`}
      </p>
      <GraphSave graph={graph} onChange={adopt} say={say} msg={msg} opened={opened} onOpened={onOpened} />
      <p className="sr" role="status">{announce}</p>
    </div>
  );
}
