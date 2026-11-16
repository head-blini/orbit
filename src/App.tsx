import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Graph from "./Graph";
import Screen from "./Screen";
import Terminal from "./Terminal";
import { MAC, MAX_TABS, liveRow, pushedOut, rowId, splitSessions, tabKey, tabSid, type LiveTab, type TermCtl } from "./tabs";
import { createGate } from "./roadmapGate";
import { LIMITS, MID_MIN, TOP_MIN, clampSize, gridStyle, keyStep, loadSizes, saveSizes, type Kind, type Sizes } from "./layout";
import { CHIP_AT, fmtTime, folderName, shownState, type Roadmap, type RoadmapLine, type Session } from "./types";
import "./App.css";

type Status = {
  listen_addr: string | null;
  server_error: string | null;
  installed: boolean | null;
  settings_error: string | null;
  projects_error: string | null;
  node_missing: boolean;
  hooks_disabled: boolean;
};

const NODE_MISSING = "✕ 쓸 수 있는 node(16.9 이상)가 없어 체크포인트가 꺼집니다 — node를 설치·업데이트하거나 nvm·Homebrew 경로를 확인하세요";
const HOOKS_DISABLED = "✕ settings에 disableAllHooks가 켜져 있어 체크포인트가 꺼집니다 — 그 설정을 지우거나 false로 바꾸세요";
const HINT = "프로젝트 폴더 맨 위에 두면 여기 보입니다 — ## 묶음, - [ ] 할 일, - [x] 끝난 일";
const STATE_LABEL = { working: "작업 중", waiting: "대기", done: "완료", error: "에러", stalled: "멈춤(추정)" } as const;

function Sym({ state }: { state: keyof typeof STATE_LABEL }) {
  return (
    <span className="sym">
      {state === "working" ? <span className="bar-mini" aria-hidden="true"><i /></span>
        : state === "waiting" ? <span className="blink" aria-hidden="true">!</span>
        : state === "error" ? <span aria-hidden="true">✕</span>
        : state === "stalled" ? <span aria-hidden="true">?</span> : null}
      <span className="sr">{STATE_LABEL[state]}</span>
    </span>
  );
}

function LiveSym({ sym }: { sym: NonNullable<ReturnType<typeof liveRow>["sym"]> }) {
  return (
    <span className="sym" aria-hidden="true">
      {sym === "working" ? <span className="bar-mini"><i /></span>
        : sym === "!" ? <span className="blink">!</span>
        : sym === "error" ? "✕" : sym === "stalled" ? "?" : sym}
    </span>
  );
}

function RoadmapView({ rm }: { rm: Roadmap | null }) {
  if (!rm) return <p className="empty">불러오는 중…</p>;
  if (rm.kind === "missing") return <><p className="empty">ROADMAP.md가 없습니다</p><p className="note">{HINT}</p></>;
  if (rm.kind === "toobig")
    return <><p className="empty">✕ ROADMAP.md가 너무 커서 읽지 않았습니다</p><p className="note">한도: {Math.round(rm.max_bytes / 1024)} KiB · {rm.max_entries}개</p></>;
  if (rm.kind === "error") return <><p className="empty">✕ 로드맵을 읽지 못했습니다</p><p className="note">{rm.reason}</p></>;
  if (rm.kind === "runs")
    return (
      <>
        <p className="empty">{rm.file ? "ROADMAP.md에 체크 항목이 없습니다" : "ROADMAP.md가 없습니다"}</p>
        <p className="note">{HINT}</p>
        <h3 className="px">최근 run</h3>
        <ul className="rm">
          {rm.runs.map((r) => (
            <li key={r.id}>
              <span className="mk" aria-hidden="true">·</span>
              <span>{r.id} · {r.stage ?? "—"}{r.request && <span className="note">{r.request}</span>}</span>
            </li>
          ))}
        </ul>
      </>
    );
  const items = rm.lines.filter((l) => l.mark !== "heading");
  const done = items.filter((l) => l.mark === "done").length;
  // 줄을 차례로 묶는다: 제목은 h3, 이어지는 항목은 ul
  const out: ReactNode[] = [];
  let group: RoadmapLine[] = [];
  const flush = (k: number) => {
    if (group.length) out.push(
      <ul className="rm" key={`u${k}`}>
        {group.map((l, i) => (
          <li key={i}>
            <span className="mk" aria-hidden="true">{l.mark === "done" ? "✓" : "·"}</span>
            <span><span className="sr">{l.mark === "done" ? "완료: " : "미완료: "}</span>{l.text}</span>
          </li>
        ))}
      </ul>,
    );
    group = [];
  };
  rm.lines.forEach((l, i) => {
    if (l.mark === "heading") { flush(i); out.push(<h3 className="px" key={`h${i}`}>{l.text}</h3>); }
    else group.push(l);
  });
  flush(rm.lines.length);
  return (
    <>
      {items.length === 0 ? <><p className="empty">ROADMAP.md에 체크 항목이 없습니다</p><p className="note">{HINT}</p></> : (
        <>
          <div className="rm-sum">
            <span className="px" aria-hidden="true">{done} / {items.length}</span>
            <div className="rm-bar" role="progressbar" aria-label="로드맵 진행" aria-valuemin={0} aria-valuemax={items.length}
              aria-valuenow={done} aria-valuetext={`${items.length}개 중 ${done}개 완료`}>
              <i style={{ width: `${(done / items.length) * 100}%` }} />
            </div>
          </div>
          {out}
        </>
      )}
      {rm.skipped && <p className="note">읽지 못한 줄을 건너뛰었습니다</p>}
    </>
  );
}

const HANDLES: { k: Kind; label: string; orient: "vertical" | "horizontal" }[] = [
  { k: "l", label: "세션 목록 폭", orient: "vertical" },
  { k: "r", label: "오른쪽 칸 폭", orient: "vertical" },
  { k: "b", label: "터미널 높이", orient: "horizontal" },
];
const GAP = 8;

export default function App() {
  const [sizes, setSizes] = useState<Sizes>(() => loadSizes(() => localStorage));
  const [meas, setMeas] = useState<Sizes>({ l: null, r: null, b: null });
  const [dragging, setDragging] = useState<Kind | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ k: Kind; pos: number; start: number; avail: number } | null>(null);
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  // 지금 칸 크기(px)와 늘릴 수 있는 한계. 반대편 칸·가운데 최소를 남긴다.
  const measure = (k: Kind) => {
    const shell = shellRef.current;
    if (!shell) return null;
    const q = (c: string) => shell.querySelector(c)?.getBoundingClientRect();
    const cs = getComputedStyle(shell);
    const w = shell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = shell.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const sess = q(".sessions"), det = q(".detail"), term = q(".terminal"), top = q(".topbar");
    if (!sess || !det || !term || !top) return null;
    return k === "l" ? { cur: sess.width, avail: w - 2 * GAP - det.width - MID_MIN }
      : k === "r" ? { cur: det.width, avail: w - 2 * GAP - sess.width - MID_MIN }
      : { cur: term.height, avail: h - top.height - 2 * GAP - TOP_MIN };
  };
  const commit = (next: Sizes) => { setSizes(next); sizesRef.current = next; saveSizes(() => localStorage, next); };
  const refreshMeas = (k: Kind) => { const m = measure(k); if (m) setMeas((p) => ({ ...p, [k]: Math.round(m.cur) })); };
  const onDown = (k: Kind) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const m = measure(k);
    if (!m) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { k, pos: k === "b" ? e.clientY : e.clientX, start: m.cur, avail: m.avail };
    setDragging(k);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = d.k === "b" ? d.pos - e.clientY : d.k === "r" ? d.pos - e.clientX : e.clientX - d.pos;
    const v = Math.round(clampSize(d.k, d.start + delta, d.avail));
    setSizes((p) => { const n = { ...p, [d.k]: v }; sizesRef.current = n; return n; });
  };
  const onUp = () => {
    if (!drag.current) return;
    const k = drag.current.k;
    drag.current = null;
    setDragging(null);
    saveSizes(() => localStorage, sizesRef.current);
    refreshMeas(k);
  };
  const onKey = (k: Kind) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const m = measure(k);
    if (!m) return;
    const v = keyStep(k, e.key, sizes[k] ?? m.cur);
    if (v === null) return;
    e.preventDefault();
    const n = Math.round(clampSize(k, v, m.avail));
    commit({ ...sizes, [k]: n });
    setMeas((p) => ({ ...p, [k]: n }));
  };
  const onReset = (k: Kind) => () => { commit({ ...sizes, [k]: null }); setTimeout(() => refreshMeas(k), 0); };

  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [live, setLive] = useState<{ tabs: LiveTab[]; active: number | null }>({ tabs: [], active: null });
  const ctl = useRef<TermCtl | null>(null);
  useEffect(() => { ctl.current?.settle(); }, [live]); // 줄 DOM이 바뀐 뒤 포커스·스크롤

  // 화면이 쓰는 지금 세션: 터미널을 골랐으면 그 터미널의 세션(임시 줄이면 null), 아니면 마지막으로 고른 지난 세션
  const pickId = live.active !== null
    ? tabSid([...sessions.values()], live.active)
    : selected;

  const refresh = useCallback(() => {
    invoke<Status>("get_status")
      .then((s) => { setStatus(s); setStatusError(null); })
      .catch((e) => setStatusError(String(e)));
  }, []);

  useEffect(refresh, [refresh, now]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    // 들고 있는 것보다 ver가 작은 스냅숏은 버린다. 같은 ver는 교체한다(멈춤 판정만 바뀐 스냅숏).
    const merge = (list: Session[]) =>
      setSessions((prev) => {
        const next = new Map(prev);
        for (const x of list) { const old = next.get(x.id); if (!old || x.ver >= old.ver) next.set(x.id, x); }
        return next;
      });
    const load = (first: boolean) =>
      invoke<Session[]>("get_sessions")
        .then((l) => { merge(l); setSessionsError(false); })
        .catch(() => { if (first) setSessionsError(true); })
        .finally(() => setLoaded(true));
    // listen이 끝난 뒤에 get_sessions를 부른다(그 사이 온 이벤트를 놓치지 않게).
    listen<Session[]>("session-update", (e) => merge(e.payload ?? []))
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch(() => {})
      .then(() => load(true));
    // 하나의 타이머: 시각 갱신 + 조용한 세션의 멈춤 판정 갱신
    const timer = setInterval(() => { setNow(Date.now()); load(false); }, 30000);
    return () => { cancelled = true; unlisten?.(); clearInterval(timer); };
  }, []);

  // 세션을 새로 고르면 비우고(불러오는 중…), 30초 타이머(now)마다 이전 내용을 둔 채 다시 읽는다. 세션 미선택이면 부르지 않는다.
  useEffect(() => { setRoadmap(null); setNode(null); }, [pickId]);
  const gate = useRef(createGate());
  const selRef = useRef(pickId);
  selRef.current = pickId;
  useEffect(() => {
    if (!pickId || !gate.current.begin(pickId)) return;
    const id = pickId;
    invoke<Roadmap>("get_roadmap", { id })
      .then((r) => { if (selRef.current === id) setRoadmap(r); })
      .catch((e) => { if (selRef.current === id) setRoadmap({ kind: "error", reason: String(e) }); })
      .finally(() => gate.current.end(id));
  }, [pickId, now]);

  // 성공 문구는 10초 뒤 같은 문구일 때만 비운다. "✕"와 "처리 중…"은 남긴다.
  useEffect(() => {
    if (!result || result.startsWith("✕") || result === "처리 중…") return;
    const t = setTimeout(() => setResult((r) => (r === result ? "" : r)), 10000);
    return () => clearTimeout(t);
  }, [result]);

  const run = (cmd: "install_hooks") => {
    setBusy(true);
    setResult("처리 중…");
    invoke<string | null>(cmd)
      .then((backup) =>
        setResult(backup ? `성공 · 백업: ${backup}` : "성공 (백업 없음: 새 파일이거나 변경 없음)"),
      )
      .catch((e) => setResult(`✕ 오류: ${String(e)}`))
      .finally(() => { setBusy(false); refresh(); });
  };

  const openScreens = () => {
    invoke("open_screens_dir").catch((e) => setResult(`✕ 오류: ${String(e)}`));
  };

  const serverText = statusError
    ? `✕ 상태를 읽지 못했습니다: ${statusError}`
    : !status ? "확인 중…"
    : status.listen_addr ? `${status.listen_addr}에서 듣는 중`
    : `✕ 훅 서버 시작 실패: ${status.server_error ?? "알 수 없음"}`;

  const hookText = !status ? "훅 확인 중…"
    : status.settings_error ? "훅 ✕ 확인 실패"
    : status.installed ? "훅 설치됨" : "훅 설치 안 됨";
  const shownResult = result
    || (status?.settings_error ? `✕ 확인 실패: ${status.settings_error}` : "")
    || (status?.hooks_disabled ? HOOKS_DISABLED : "")
    || (status?.node_missing ? NODE_MISSING : "");

  const list = [...sessions.values()].sort((a, b) => b.last_ms - a.last_ms);
  const { live: liveRows, past } = splitSessions(live.tabs, list);
  const liveSids = new Set(liveRows.flatMap((x) => (x.sid ? [x.sid] : [])));
  const cur = pickId ? sessions.get(pickId) ?? null : null;

  // 손잡이는 각 경계 근처에 둔다(Tab 순서가 화면 위치를 따르도록). 위치는 CSS grid가 정한다.
  const handle = (k: Kind) => {
    const { label, orient } = HANDLES.find((h) => h.k === k)!;
    const px = sizes[k] ?? meas[k] ?? undefined;
    return (
      <div className={`resizer rz-${k}`} role="separator" tabIndex={0} aria-label={label} aria-orientation={orient}
        aria-valuenow={px} aria-valuetext={px === undefined ? undefined : `${px}px`} aria-valuemin={LIMITS[k].min}
        aria-valuemax={Number.isFinite(LIMITS[k].max) ? LIMITS[k].max : undefined}
        onPointerDown={onDown(k)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onKeyDown={onKey(k)} onFocus={() => refreshMeas(k)} onDoubleClick={onReset(k)} />
    );
  };

  return (
    <div className={dragging ? `shell dragging drag-${dragging}` : "shell"} ref={shellRef} style={gridStyle(sizes)}>
      <header className="panel topbar">
        <h1>ORBIT</h1>
        <span className="tb-result" role="status" title={shownResult}>{shownResult}</span>
        <div className="tb-right">
          <span className="tb-srv px" role="status" title={serverText}>{serverText}</span>
          <span className="sep px" aria-hidden="true">·</span>
          <span className="px">{hookText}</span>
          {status?.installed !== true &&
            <button type="button" className="btn" aria-label="훅 설치" disabled={busy || status?.installed !== false} onClick={() => run("install_hooks")}>설치</button>}
          <button type="button" className="btn" aria-label="게임보이 화면 폴더 열기" onClick={openScreens}>게임보이 화면</button>
        </div>
      </header>

      <section className="panel sessions" aria-labelledby="h-sessions" onKeyDown={(e) => {
        const n = tabKey(e, MAC);
        if (n === null) return;
        e.preventDefault();
        ctl.current?.jump(n);
      }}>
        <h2 id="h-sessions" className="px">세션</h2>
        {liveRows.length > 0 && (
          <>
            <h3 id="h-live" className="px">실행 중 {liveRows.length}/{MAX_TABS}</h3>
            <ul className="list live" aria-labelledby="h-live">
              {liveRows.map(({ view: v, sid }, i) => {
                const s = sid ? sessions.get(sid) ?? null : null;
                const r = liveRow(v, s);
                const hm = r.time && s ? fmtTime(s.last_ms, now) : "";
                const st = r.sym === "working" || r.sym === "error" || r.sym === "stalled" ? ` ${STATE_LABEL[r.sym]}` : "";
                const x = v.phase === "ended" ? "화면 닫기" : "터미널 닫기";
                return (
                  <li key={`t${v.id}`} className="row">
                    <button type="button" id={rowId(v.id)} className="sess" data-phase={v.phase} title={r.title}
                      aria-current={v.id === live.active ? "true" : undefined}
                      aria-keyshortcuts={MAC && i < 8 ? `Meta+${i + 1} Delete` : "Delete"}
                      onClick={() => ctl.current?.pick(v.id)}
                      onKeyDown={(e) => {
                        if (e.key !== "Delete" && e.key !== "Backspace") return;
                        e.preventDefault();
                        ctl.current?.close(v.id, "row");
                      }}>
                      <span className="cur px" aria-hidden="true">▶</span>
                      <span className="name px">{v.name}</span>
                      {r.sym ? <LiveSym sym={r.sym} /> : <span className="sym" />}
                      <span className="sr">{st}{r.sr}{hm && `, ${hm}`}</span>
                      <span className="time" aria-hidden="true">{hm ? `${r.status} · ${hm}` : r.status}</span>
                    </button>
                    <button type="button" className="btn sess-x" tabIndex={-1}
                      aria-label={`${x}: ${v.name}`} title={v.phase === "ended" ? x : "터미널 닫기 — claude도 종료됩니다"}
                      onClick={() => ctl.current?.close(v.id, "x")}>×</button>
                  </li>
                );
              })}
            </ul>
            {liveRows.length >= MAX_TABS && <p className="note">터미널 8개까지 — 닫으면 새로 열 수 있습니다</p>}
          </>
        )}
        {liveRows.length > 0 && (sessionsError || status?.projects_error || !loaded || past.length > 0) &&
          <h3 id="h-past" className="px">지난 세션</h3>}
        {sessionsError || status?.projects_error ? <><p className="empty">✕ 로그 폴더를 읽지 못했습니다</p>{status?.projects_error && <p className="note">{status.projects_error}</p>}</>
          : !loaded ? <p className="empty">불러오는 중…</p>
          : list.length === 0 && liveRows.length === 0 ? <><p className="empty">아직 Orbit에서 시작한 세션이 없습니다</p><p className="note">아래 터미널의 [폴더 열기]로 시작하면 여기에 나옵니다. Orbit 밖에서 연 세션과 예전 기록은 지우지 않고 숨깁니다.</p></>
          : past.length === 0 ? null
          : (
            <ul className="list" aria-labelledby={liveRows.length > 0 ? "h-past" : undefined}>
              {past.map((x) => {
                const cu = live.active === null && x.id === selected;
                const out = pushedOut(x, live.tabs, liveSids);
                const st = shownState(x);
                return (
                  <li key={x.id}>
                    <button type="button" className={past.length >= CHIP_AT && !cu ? "sess chip" : "sess"}
                      aria-current={cu ? "true" : undefined}
                      onClick={() => { setSelected(x.id); setNode(null); ctl.current?.pick(null); }}>
                      <span className="cur px" aria-hidden="true">▶</span>
                      <span className="name px">{folderName(x)}</span>
                      {out ? <span className="sym"><span className="sr">, 끝남</span></span> : <Sym state={st} />}
                      <span className="time">{fmtTime(x.last_ms, now)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </section>

      {handle("l")}

      <section className="panel graph" aria-labelledby="h-graph">
        <h2 id="h-graph" className="px">에이전트 그래프</h2>
        <Graph session={cur} selected={node} onSelect={setNode} />
      </section>

      {handle("r")}

      <section className="panel detail" aria-labelledby="h-roadmap">
        <h2 id="h-roadmap" className="px">로드맵</h2>
        {pickId ? <RoadmapView rm={roadmap} /> : <p className="empty">세션을 고르면 그 프로젝트의 로드맵이 보입니다</p>}
      </section>

      {handle("b")}

      <Terminal session={cur} sessions={list} onTabs={setLive} ctl={ctl} />

      <div className="console"><Screen /></div>

    </div>
  );
}
