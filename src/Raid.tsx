import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LEAD_LABEL, NODE_LABEL, nodeKey, shownState, type Raid as RaidData, type Session } from "./types";
import { GATE_LABEL, JOB_LABEL, MONSTER_LABEL, STAGE_LABEL, bubble, fallen, healing, heroAct, heroLabel, hp, jobOf, leadAct, monsterOf, shields, summary, type Act, type Job } from "./raid";
import { SPRITES, type Sprite } from "./sprites";
import { createGate } from "./roadmapGate";
import "./Raid.css";

const S = SPRITES as unknown as Record<string, Sprite | Record<string, Sprite>>;
const NARROW = 480;

function Svg({ s, k }: { s: Sprite; k: number }) {
  return (
    <svg viewBox={`0 0 ${s.w} ${s.h}`} width={s.w * k} height={s.h * k} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {s.layers.map(([shade, d], i) => <path key={i} className={`p${shade}`} d={d} />)}
    </svg>
  );
}

// 프레임 svg를 겹쳐 두고 CSS가 보이는 프레임을 바꾼다(.act일 때만). 줄인 움직임에서는 첫 프레임 고정.
function Stack({ name, frames, k, act, flip }: { name: string; frames: string[]; k: number; act: boolean; flip?: boolean }) {
  const set = S[name] as Record<string, Sprite>;
  return (
    <span className={`stack n${frames.length}${act ? " act" : ""}${flip ? " flip" : ""}`}>
      {frames.map((f, i) => <span key={f} className={`fr fr${i}`}><Svg s={set[f]} k={k} /></span>)}
    </span>
  );
}

const Icon = ({ name }: { name: string }) => <Svg s={S[name] as Sprite} k={2} />;

type Hero = { id: string; job: Job; role: string; act: Act; tool: string | null; label: string };

export default function Raid({ session, selected, onSelect }: { session: Session | null; selected: string | null; onSelect: (key: string) => void }) {
  const id = session?.id ?? null;
  const run = session?.run ?? null;
  const ver = session?.ver ?? 0;
  const [got, setGot] = useState<{ id: string; run: string; raid: RaidData } | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const now = useRef({ id, run });
  now.current = { id, run };
  const gate = useRef(createGate());
  const dirty = useRef(false);
  const manual = useRef(false);
  const targetRef = useRef<HTMLLIElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // get_raid: 호출 중이면 dirty만 남기고 끝난 뒤 한 번 더 부른다. 응답은 요청 때의 (세션 id, run)이 지금과 같을 때만 반영한다.
  const loadRef = useRef<() => void>(() => {});
  loadRef.current = () => {
    const { id: sid, run: srun } = now.current;
    if (!sid || !srun) return;
    if (!gate.current.begin(sid)) { dirty.current = true; return; }
    dirty.current = false;
    const same = () => now.current.id === sid && now.current.run === srun;
    invoke<RaidData>("get_raid", { id: sid })
      .then((raid) => { if (same()) { setGot({ id: sid, run: srun, raid }); setBad(null); } else dirty.current = true; })
      .catch(() => { if (same()) setBad(`${sid}|${srun}`); else dirty.current = true; })
      .finally(() => { gate.current.end(sid); if (dirty.current) { dirty.current = false; loadRef.current(); } });
  };
  useEffect(() => { loadRef.current(); }, [id, run, ver]);
  useEffect(() => { manual.current = false; }, [id, run]);

  const agents = session?.agents ?? [];
  const st = session ? shownState(session) : "done";
  const raid: RaidData | null = !session ? null : !run ? { kind: "none" } : got && got.id === id && got.run === run ? got.raid : null;
  const loading = !!session && !!run && !raid && bad !== `${id}|${run}`;

  const heroes: Hero[] = [];
  if (session) {
    const act = leadAct(st);
    heroes.push({ id: "lead", job: "commander", role: "Lead", act, tool: session.tool, label: heroLabel("commander", "Lead", null, LEAD_LABEL[st], act, session.tool) });
    agents.map((a, i) => ({ a, i })).sort((p, q) => p.a.col - q.a.col).forEach(({ a, i }) => {
      const job = jobOf(a.kind);
      const act = heroAct(a.state);
      heroes.push({ id: nodeKey(a) || `i${i}`, job, role: a.kind ?? a.description ?? "—", act, tool: a.tool,
        label: heroLabel(job, a.kind, a.description, NODE_LABEL[a.state] ?? "알 수 없음", act, a.tool) });
    });
  }
  const targetId = heroes.find((h) => h.id !== "lead" && (h.act === "attack" || h.act === "wait"))?.id;
  const moveKey = session ? `${id}|${heroes.map((h) => h.act).join(",")}` : "";

  const follow = (behavior: ScrollBehavior) => {
    if (scrollRef.current?.contains(document.activeElement)) return;
    targetRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
  };
  const followRef = useRef(follow);
  followRef.current = follow;
  useEffect(() => {
    if (!manual.current) followRef.current(matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
  }, [moveKey]);
  const hasSession = !!session;
  useEffect(() => {
    const el = scrollRef.current;
    if (!hasSession || !el) return;
    const measure = () => setNarrow(el.clientWidth < NARROW);
    measure();
    const ro = new ResizeObserver(() => { measure(); if (!manual.current) followRef.current("auto"); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasSession]);

  if (!session) return <p className="empty">세션을 고르면 레이드가 보입니다</p>;

  const mon = monsterOf(raid);
  const name = MONSTER_LABEL[mon];
  const down = fallen(raid, st);
  const heal = healing(raid, st);
  const monAct = !down && st === "working";
  const mk = narrow ? 2 : 3;
  const track = raid && raid.kind === "run" ? raid.track : null;
  const stage = raid && raid.kind === "run" && track && raid.stage ? STAGE_LABEL[raid.stage] ?? null : null;
  const hpv = hp(raid, agents, st);
  const sh = shields(raid);
  const loops = raid && raid.kind === "run" ? raid.loops : 0;
  const touch = () => { manual.current = true; };

  return (
    <>
      <p className="sr">{loading ? "몬스터 확인 중" : !raid && session && run ? "작업 정보를 읽지 못함" : summary(raid, agents, st)}</p>
      {session.run && <p className="note">run {session.run}</p>}
      <div className={`field${narrow ? " narrow" : ""}`} ref={scrollRef} onWheel={touch} onPointerDown={touch} onKeyDown={touch}>
        <div className="partywrap">
          <ol className="party" aria-label="파티">
            {heroes.map((h) => {
              const cls = h.act === "attack" ? " is-run" : h.act === "wait" ? " is-wait" : h.act === "ko" ? " is-fail" : "";
              const b = h.act === "attack" ? bubble(h.tool) : null;
              return (
                <li key={h.id} ref={h.id === targetId ? targetRef : undefined}>
                  <button type="button" className={`hero${cls}`} aria-label={h.label} aria-current={h.id === selected ? "true" : undefined} onClick={() => onSelect(h.id)}>
                    <span className="slot" aria-hidden="true">
                      {b ? <span className="bub">아마 {b}</span>
                        : h.act === "wait" ? <span className="blink"><Icon name="bang" /></span>
                        : h.act === "sleep" ? <Icon name="zz" />
                        : h.act === "ko" ? <Icon name="ko" /> : null}
                    </span>
                    <Stack name={h.job} frames={["idle", "attack"]} k={2} act={h.act === "attack"} />
                    <span className="hname px"><span className="mark" aria-hidden="true">▶ </span>{JOB_LABEL[h.job]}</span>
                    <span className="role">{h.role}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {agents.length === 0 && <p className="note">서브에이전트 없음</p>}
        </div>
        <figure className="mon">
          <span className="slot" aria-hidden="true">
            {down ? <Icon name="ko" /> : heal ? <span className="heal px blink">+회복</span> : null}
          </span>
          {loading ? <p className="note">몬스터 확인 중</p> : (
            <>
              <Stack name={mon} frames={mon === "dragon" ? ["idle", "bite", "fire"] : ["idle", "attack"]} k={mk} act={monAct} flip={down} />
              <figcaption className="px">{down ? `${name} · 쓰러짐` : track ? `${name} · ${track}` : name}</figcaption>
              {raid ? (
                <>
                  <div className="hp">
                    <span className="px">HP</span>
                    <div className="rm-bar" role="progressbar" aria-label={`${name} HP`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpv}
                      aria-valuetext={`HP ${hpv}%${stage ? ` · ${stage} 단계` : ""}`}>
                      <i style={{ width: `${hpv}%` }} />
                    </div>
                    <span className="px">{hpv}</span>
                    <span className="loops">{loops >= 1 ? `되돌림 ${loops}` : ""}</span>
                  </div>
                  {stage && <p className="note stage">{stage} 단계</p>}
                  {sh.length > 0 && (
                    <ul className="shields" aria-label="방어막">
                      {sh.map((s) => (
                        <li key={s.gate} className={s.look === "failed" ? "fail" : undefined}>
                          <Icon name={s.look === "broken" ? "shieldBroken" : "shieldClosed"} />
                          <span className="gl" aria-hidden="true">{GATE_LABEL[s.gate]}{s.look === "failed" ? " ✕" : ""}</span>
                          <span className="sr">{GATE_LABEL[s.gate]} {s.look === "broken" ? "깨짐" : s.look === "failed" ? "실패" : "닫힘"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : <p className="note">작업 정보를 읽지 못함</p>}
            </>
          )}
        </figure>
      </div>
      {session.state === "waiting" && (
        <p className="msgbox">용사들이 답을 기다립니다 — 아래 터미널에서 답하세요 <span className="blink" aria-hidden="true">▼</span></p>
      )}
    </>
  );
}
