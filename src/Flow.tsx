import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createGate } from "./roadmapGate";
import { agentRows, doneText, loopsText, steps, type Row } from "./flow";
import type { Raid, Session } from "./types";
import "./Flow.css";

function Sym({ sym }: { sym: Row["sym"] }) {
  return (
    <span className="sym" aria-hidden="true">
      {sym === "bar" ? <span className="bar-mini"><i /></span> : sym === "!" ? <span className="blink">!</span> : sym}
    </span>
  );
}

function Agents({ session, now }: { session: Session; now: number }) {
  const { rows, live, done, tokens } = agentRows(session, now);
  const subs = session.agents.length;
  const listRef = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setOver(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);
  return (
    <>
      <h3 id="h-agents" className="px">지금 도는 에이전트 {live}</h3>
      <div className="flow-list" ref={listRef} tabIndex={over ? 0 : undefined} aria-label={over ? "에이전트 목록" : undefined}>
        <ul aria-labelledby="h-agents">
          {rows.map((r, i) => (
            <li key={i} className={r.wait ? "flow-row is-wait" : "flow-row"}>
              <span className="fl-name px" title={r.name}>{r.name}</span>
              <span className="fl-desc" title={r.desc || undefined}>{r.desc}</span>
              <span className="fl-meta"><span className="note-inline">{r.meta}</span><Sym sym={r.sym} /></span>
            </li>
          ))}
          {subs === 0 && <li className="flow-sum">서브에이전트 없음</li>}
          {subs > 0 && live === 0 && <li className="flow-sum">지금 도는 에이전트 없음</li>}
          {subs > 0 && <li className="flow-sum">{doneText(done, tokens)}</li>}
        </ul>
      </div>
    </>
  );
}

export default function Flow({ session, now }: { session: Session | null; now: number }) {
  const id = session?.id ?? null;
  const run = session?.run ?? null;
  const ver = session?.ver ?? 0;
  const [got, setGot] = useState<{ id: string; run: string; raid: Raid } | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const cur = useRef({ id, run });
  cur.current = { id, run };
  const gate = useRef(createGate());
  const dirty = useRef(false);

  // Raid.tsx와 같은 방식: 호출 중이면 dirty만 남기고 끝난 뒤 한 번 더 부른다. 응답은 요청 때의 (id, run)이 지금과 같을 때만 반영한다.
  const loadRef = useRef<() => void>(() => {});
  loadRef.current = () => {
    const { id: sid, run: srun } = cur.current;
    if (!sid || !srun) return;
    if (!gate.current.begin(sid)) { dirty.current = true; return; }
    dirty.current = false;
    const same = () => cur.current.id === sid && cur.current.run === srun;
    invoke<Raid>("get_raid", { id: sid })
      .then((raid) => { if (same()) { setGot({ id: sid, run: srun, raid }); setBad(null); } else dirty.current = true; })
      .catch(() => { if (same()) setBad(`${sid}|${srun}`); else dirty.current = true; })
      .finally(() => { gate.current.end(sid); if (dirty.current) { dirty.current = false; loadRef.current(); } });
  };
  // 30초 타이머(now)는 STATE.json 변경을 놓쳤을 때의 안전망
  useEffect(() => { loadRef.current(); }, [id, run, ver, now]);

  if (!session) return <p className="empty">세션을 고르면 진행 상황이 보입니다</p>;

  const raid: Raid | null = !run ? null : got && got.id === id && got.run === run ? got.raid : null;
  let top;
  if (!run) top = <p className="note">run 없음 — 일반 대화</p>;
  else if (!raid) top = bad === `${id}|${run}` ? <p className="empty">✕ run 정보를 읽지 못했습니다</p> : <p className="empty">단계 읽는 중…</p>;
  else if (raid.kind === "none") top = <p className="empty">✕ run {run}의 STATE.json을 찾지 못했습니다</p>;
  else {
    const s = steps(raid);
    const l = loopsText(raid);
    top = (
      <>
        <p className="note">run {run}{raid.track ? ` · ${raid.track}` : ""}</p>
        <ol className="flow-steps" aria-label="단계">
          {s.steps.map((x, i) => (
            <li key={i} className={`fs-${x.mark}`} aria-current={x.mark === "now" ? "step" : undefined}>
              {i > 0 && <span className="fs-arrow px" aria-hidden="true">→ </span>}
              <span className="fs-box px" aria-hidden="true">
                <span>{x.mark === "done" ? "✓" : x.mark === "now" ? "▶" : x.mark === "fail" ? "✕" : x.mark === "skip" ? "—" : "·"}</span>
                {x.label}{x.count ? ` ${x.count}` : ""}
              </span>
              <span className="sr">{x.sr}</span>
            </li>
          ))}
        </ol>
        {(s.ended || s.note) && <p className="note">{[s.ended ? "끝남" : null, s.note].filter(Boolean).join(" · ")}</p>}
        <p className="note"><span aria-hidden="true">{l.text}</span><span className="sr">{l.sr}</span></p>
      </>
    );
  }
  return (
    <>
      {top}
      <Agents session={session} now={now} />
    </>
  );
}
