import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Terminal as Xterm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { folderName, type Session } from "./types";
import { HangulIme } from "./hangulIme"; // xterm#5704: 병합 후 삭제
import { termWaiting, staleWaiting, pruneStale } from "./waiting";
import { THEME, MIN_CONTRAST } from "./termTheme";
import { fontStep, loadFont, saveFont, FONT } from "./layout";
import { MAX_TABS, MAC, SAME, rowId, tabKey, tabSessions, folderTab, newTabId, nextActive, canResume, quickExit, type Phase, type LiveTab, type TermCtl } from "./tabs";
import "./Terminal.css";

type TermOut = { t: "data"; d: string } | { t: "exit" };
type Picked = { name: string; tab: number | null }; // term_pick_folder: tab이 있으면 그 폴더는 이미 그 터미널에서 실행 중
type How = "folder" | "new" | "resume";
type TabView = { id: number; base: string; no: number; phase: Phase; cwd: string | null }; // no: 같은 이름 구분 번호. 1이면 붙이지 않는다
// 탭별 런타임(렌더와 무관). state가 아니라 ref 맵에 둔다.
type Rt = {
  t: Xterm | null; fit: FitAddon | null; gen: number; chain: Promise<unknown>; off: (() => void) | null;
  ime: HangulIme; stale: Set<string>; since: number | null; startedAt: number;
};

const END = "\r\n\x1b[90m── 종료됨 ──\x1b[0m\r\n"; // 프론트가 xterm에 쓰는 유일한 글(상수)
const QUICK = "claude가 바로 종료되었습니다 — 터미널 출력을 확인하세요";

// Cmd/Ctrl + = · + · - · 0 → 글자 크기 동작
const fontKey = (e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): "inc" | "dec" | "reset" | null => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  return e.key === "=" || e.key === "+" ? "inc" : e.key === "-" ? "dec" : e.key === "0" ? "reset" : null;
};

const nameOf = (t: { base: string; no: number }) => (t.no > 1 ? `${t.base} ${t.no}` : t.base);
// 같은 기본 이름 탭들이 쓰지 않는 가장 작은 번호(1 = 번호 없음). 만들 때 한 번만 정하고 다시 매기지 않는다.
const pickNo = (list: TabView[], base: string): number => {
  const used = new Set(list.filter((t) => t.base === base).map((t) => t.no));
  let n = 1;
  while (used.has(n)) n++;
  return n;
};
const newRt = (): Rt => ({ t: null, fit: null, gen: 0, chain: Promise.resolve(), off: null, ime: new HangulIme(), stale: new Set(), since: null, startedAt: 0 });

type Props = {
  session: Session | null; sessions: Session[];
  onTabs: (v: { tabs: LiveTab[]; active: number | null }) => void;
  ctl: { current: TermCtl | null };
};

export default function Terminal({ session, sessions, onTabs, ctl }: Props) {
  const [tabs, setTabs] = useState<TabView[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false); // 마운트 때 term_stop_all이 끝나야 시작할 수 있다(B1)
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [font, setFont] = useState(() => loadFont(() => localStorage));
  const [pickBusy, setPickBusy] = useState(false); // 폴더 선택 창이 떠 있는 동안
  const [resumeBusy, setResumeBusy] = useState<string | null>(null); // 이어 가기를 시작하는 중인 세션 id(S-A3)
  const resumeRef = useRef<string | null>(null);
  const tabsRef = useRef<TabView[]>([]);
  const activeRef = useRef<number | null>(null);
  const rts = useRef(new Map<number, Rt>());
  const boxes = useRef(new Map<number, HTMLDivElement>());
  const headRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const pend = useRef<"row" | "xterm" | "head" | null>(null); // 다음 렌더 뒤 포커스를 보낼 곳
  const rowTo = useRef<{ id: number | null; skip: number | null }>({ id: null, skip: null }); // pend "row": 보낼 줄, 없으면 목록 첫 줄(skip 줄은 곧 사라진다)
  const noteTimer = useRef<number | undefined>(undefined);
  const waited = useRef(new Map<number, boolean>());
  const fontShown = useRef(font); // 마지막으로 반영한 크기(첫 렌더에는 알리지 않는다)

  const upd = (f: (l: TabView[]) => TabView[]) => { tabsRef.current = f(tabsRef.current); setTabs(tabsRef.current); };
  const go = (id: number | null) => { activeRef.current = id; setActive(id); };
  const setPhase = (id: number, phase: Phase) => upd((l) => l.map((t) => (t.id === id ? { ...t, phase } : t)));
  const nameById = (id: number) => { const t = tabsRef.current.find((x) => x.id === id); return t ? nameOf(t) : ""; };

  // 같은 문구도 다시 낭독되게 비웠다가 넣는다
  const say = (s: string) => { clearTimeout(noteTimer.current); setNote(""); noteTimer.current = window.setTimeout(() => setNote(s), 50); };

  const teardown = (id: number) => {
    const rt = rts.current.get(id);
    if (rt) { rt.gen++; rt.off?.(); rt.off = null; rt.t?.dispose(); rt.t = null; }
    rts.current.delete(id);
  };

  // B1: 웹뷰 재로드·HMR 뒤 Rust에 남은 claude를 먼저 모두 정리하고, 끝나야 시작 버튼을 켠다. 최신 마운트의 promise만 켠다.
  useEffect(() => {
    let cancelled = false;
    // W1: HMR은 state를 보존하는데 xterm·세대는 cleanup에서 버려진다. 탭 없는 상태로 되돌린다.
    tabsRef.current = []; setTabs([]); go(null);
    invoke("term_stop_all").catch(() => {}).finally(() => { if (!cancelled) setReady(true); });
    return () => {
      cancelled = true;
      invoke("term_stop_all").catch(() => {});
      for (const id of [...rts.current.keys()]) teardown(id);
      boxes.current.clear();
      clearTimeout(noteTimer.current);
    };
  }, []);

  // 글자 크기가 바뀌면 모든 탭의 xterm에 적용하고 저장한다. 보이는 탭만 fit(숨긴 탭은 다시 보일 때 ResizeObserver가 fit).
  const fontRef = useRef(font);
  fontRef.current = font;
  useEffect(() => {
    saveFont(() => localStorage, font);
    for (const rt of rts.current.values()) if (rt.t) rt.t.options.fontSize = font;
    const a = activeRef.current;
    if (a !== null) { try { rts.current.get(a)?.fit?.fit(); } catch { /* 숨김 상태 */ } }
    if (fontShown.current !== font) { fontShown.current = font; say(`글자 크기 ${font}`); }
  }, [font]);
  const bump = (a: "inc" | "dec" | "reset") => setFont((f) => fontStep(a, f));

  const inPanel = () => !!(headRef.current?.parentElement?.contains(document.activeElement));

  // 고른 터미널이 바뀌면 그 줄을 보이게 하고, 요청된 곳으로 포커스를 보낸다(E5).
  // 줄은 App이 onTabs를 받아 다시 그려야 생기고 사라진다: App이 그린 뒤 ctl.settle로 불린다.
  const scrolled = useRef<number | null>(null);
  const settle = () => {
    const active = activeRef.current;
    if (active !== scrolled.current) {
      scrolled.current = active;
      if (active !== null) document.getElementById(rowId(active))?.scrollIntoView({ block: "nearest" });
    }
    const p = pend.current;
    pend.current = null;
    const head = () => (headRef.current?.querySelector<HTMLElement>("button:not(:disabled):not([aria-disabled=true])") ?? headRef.current?.querySelector<HTMLElement>("#h-term"))?.focus();
    if (p === "row") {
      const { id, skip } = rowTo.current;
      const el = (id !== null ? document.getElementById(rowId(id)) : null)
        ?? document.querySelector<HTMLElement>(`.sessions .sess${skip !== null ? `:not(#${rowId(skip)})` : ""}`);
      if (el) el.focus(); else head();
    }
    else if (p === "xterm" && active !== null) rts.current.get(active)?.t?.focus();
    else if (p === "head") head();
  };

  const select = (id: number, to: "xterm" | null) => {
    if (!tabsRef.current.some((t) => t.id === id)) return;
    if (id === activeRef.current) { // 이미 고른 터미널이면 effect가 돌지 않으므로 바로 처리
      if (to === "xterm") rts.current.get(id)?.t?.focus();
      return;
    }
    pend.current = to;
    go(id);
  };

  const ensureTerm = (id: number, rt: Rt, box: HTMLDivElement, name: string) => {
    if (rt.t) return rt.t;
    const t = new Xterm({
      fontFamily: 'Menlo, "Cascadia Mono", Consolas, monospace', fontSize: fontRef.current, lineHeight: 1,
      cursorStyle: "block", cursorBlink: false, drawBoldTextInBrightColors: false,
      minimumContrastRatio: MIN_CONTRAST, allowTransparency: false, theme: THEME,
      macOptionClickForcesSelection: true, // claude가 마우스를 잡아도 Option+드래그는 xterm 선택(⌘C로 복사). claude 안내 "option+click to native select"와 같다
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(box);
    t.textarea?.setAttribute("aria-label", `claude 터미널 ${name}. F6: 버튼으로 나가기`);
    const send = (data: string) => {
      if (!data || t.options.disableStdin) return;
      rt.chain = rt.chain.then(() => invoke("term_write", { tab: id, data })).catch(() => {});
    };
    // 조합 중인 음절 미리보기: xterm의 composition-view를 커서 칸에 띄운다(WKWebView는 compositionstart가 없어 xterm이 안 띄움)
    const preview = () => { // xterm#5704: 병합 후 삭제
      const v = box.querySelector<HTMLElement>(".composition-view"), scr = box.querySelector<HTMLElement>(".xterm-screen");
      if (!v || !scr) return;
      const s = rt.ime.pending;
      v.textContent = s;
      v.classList.toggle("active", s !== "");
      if (!s) return;
      const b = t.buffer.active, w = scr.clientWidth / t.cols, h = scr.clientHeight / t.rows;
      Object.assign(v.style, {
        left: `${Math.min(b.cursorX, t.cols - 1) * w}px`, top: `${b.cursorY * h}px`, height: `${h}px`, lineHeight: `${h}px`,
        fontFamily: t.options.fontFamily ?? "", fontSize: `${t.options.fontSize}px`,
      });
    };
    // xterm 6.0.0은 insertReplacementText를 버린다. textarea보다 먼저(상위 요소 capture) 받아 한글이면 xterm에 넘기지 않는다
    const ac = new AbortController(); // W4: 리스너는 signal로 한꺼번에 걷는다
    box.addEventListener("input", (e) => { // xterm#5704: 병합 후 삭제
      const ev = e as InputEvent;
      if (ev.target !== t.textarea || t.options.disableStdin) return;
      const r = rt.ime.input(ev.inputType, ev.data);
      send(r.send);
      preview();
      if (r.handled) ev.stopPropagation();
    }, { capture: true, signal: ac.signal });
    t.textarea?.addEventListener("blur", () => { send(rt.ime.flush()); preview(); }, { signal: ac.signal }); // xterm#5704: 병합 후 삭제
    box.addEventListener("paste", () => { send(rt.ime.flush()); preview(); }, { capture: true, signal: ac.signal }); // xterm#5704: 병합 후 삭제. xterm보다 먼저 조합 중 음절을 보낸다
    t.onRender(() => { if (rt.ime.active) preview(); }); // xterm#5704: 병합 후 삭제. 앞 음절 에코로 커서가 옮겨 가면 따라간다
    t.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && rt.ime.active) { // xterm#5704: 병합 후 삭제
        const k = rt.ime.keydown(e.keyCode, e.key);
        if (k.block) return false;
        send(k.send); preview();
      }
      if (fontKey(e)) return false; // 글자 크기 단축키는 xterm이 먹지 않는다. section onKeyDown이 처리한다
      if (tabKey(e, MAC) !== null) return false; // ⌘1~8도 PTY로 보내지 않는다
      if (e.key !== "F6") return true;
      if (e.type === "keydown") {
        const h = headRef.current;
        (h?.querySelector<HTMLElement>("button:not(:disabled):not([aria-disabled=true])") ?? h?.querySelector<HTMLElement>("#h-term"))?.focus();
      }
      return false;
    });
    t.onData(send);
    // W5: 크기 변경도 입력과 같은 chain에 태워 순서가 뒤바뀌지 않게 한다. 없는 탭의 Err는 삼킨다.
    t.onResize(({ cols, rows }) => { rt.chain = rt.chain.then(() => invoke("term_resize", { tab: id, cols, rows })).catch(() => {}); });
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* 숨김 상태 */ } });
    ro.observe(box);
    rt.off = () => { ac.abort(); ro.disconnect(); };
    rt.t = t; rt.fit = fit;
    return t;
  };

  const sess = session ? folderName(session) : "";
  const waitOf = (t: TabView) => { const rt = rts.current.get(t.id); return t.phase === "running" && !!rt && termWaiting(tabSessions(sessions, t.id), rt.since, rt.stale); };
  const waitKey = tabs.map((t) => (waitOf(t) ? t.id : "")).join(",");
  const actTab = tabs.find((t) => t.id === active) ?? null;
  const live: LiveTab[] = tabs.map((t) => ({ id: t.id, name: nameOf(t), phase: t.phase, wait: waitOf(t), cwd: t.cwd }));
  // 꺼진 이유: 위에서부터 처음 걸리는 하나(DESIGN 6절)
  const why = (how: How): string =>
    !ready ? "터미널 준비 중"
    : pickBusy ? "폴더 선택 창이 열려 있습니다"
    : how !== "folder" && !session ? "세션을 먼저 고르세요"
    : how !== "folder" && actTab && actTab.phase !== "ended" ? "이미 아래 터미널에서 실행 중입니다"
    : how === "resume" && session && resumeBusy === session.id ? "이 세션을 시작하는 중입니다"
    : how === "resume" && session && !canResume(session) ? "보낸 메시지가 없어 이어 갈 대화가 없습니다 — 새로 시작하세요"
    : how !== "folder" && folderTab(live, sessions, session?.cwd ?? null) !== null ? SAME
    : tabs.length >= MAX_TABS ? "터미널은 8개까지 — 하나를 닫고 여세요"
    : "";

  // 시작 세 가지(폴더 열기·새로 시작·이어 가기)는 모두 새 터미널을 만든다. 웹뷰가 넘기는 값은 세션 id뿐이다.
  const begin = async (how: How) => {
    if (why(how)) return;
    if (how === "resume" && session && resumeRef.current === session.id) return;
    let picked = "";
    if (how === "folder") {
      // 고르는 동안 터미널은 건드리지 않는다: 취소하면 아무 일도 없다
      setPickBusy(true);
      try {
        const n = await invoke<Picked | null>("term_pick_folder");
        if (n === null) return;
        if (n.tab !== null) { // 이미 그 폴더에서 실행 중: 새 터미널 없이 그 줄로 전환
          if (tabsRef.current.some((t) => t.id === n.tab)) { select(n.tab, "xterm"); say(`${nameById(n.tab)}은 이미 실행 중이라 그 터미널로 옮겼습니다`); }
          else { setErr(SAME); say(`✕ 오류: ${SAME}`); }
          return;
        }
        picked = n.name;
      } catch (e) {
        const msg = String(e);
        setErr(msg); say(`✕ 오류: ${msg}`);
        return;
      } finally { setPickBusy(false); }
    }
    if (tabsRef.current.length >= MAX_TABS) return;
    const base = how === "folder" ? picked : sess;
    const id = newTabId(new Set(tabsRef.current.map((t) => t.id)), Math.random);
    const view: TabView = { id, base, no: pickNo(tabsRef.current, base), phase: "starting", cwd: how === "folder" ? null : session!.cwd };
    const name = nameOf(view);
    const prev = activeRef.current;
    const rt = newRt();
    rt.since = Date.now();
    rt.startedAt = rt.since;
    rt.stale = staleWaiting(sessions); // 종료 뒤 남은 Waiting을 이 터미널의 대기로 오표시하지 않는다
    rts.current.set(id, rt);
    refocus.current = inPanel();
    setErr("");
    flushSync(() => { upd((l) => [...l, view]); go(id); });
    const g = ++rt.gen;
    const rid = how === "resume" ? session!.id : null;
    if (rid) { resumeRef.current = rid; setResumeBusy(rid); }
    const box = boxes.current.get(id);
    if (!box) { if (rid) { resumeRef.current = null; setResumeBusy(null); } teardown(id); upd((l) => l.filter((t) => t.id !== id)); go(prev); return; }
    try {
      const t = ensureTerm(id, rt, box, name);
      try { rt.fit?.fit(); } catch { /* 기본 크기 */ }
      let begun = false, ended = false;
      const start = () => { if (begun) return; begun = true; t.options.disableStdin = false; };
      const ch = new Channel<TermOut>();
      ch.onmessage = (m) => {
        if (g !== rt.gen) return; // 닫힌 터미널·이전 시작의 메시지는 버린다
        start();
        if (m.t === "data") { t.write(m.d); return; }
        t.write(END);
        t.options.disableStdin = true;
        const cur = tabsRef.current.find((x) => x.id === id);
        const stopping = cur?.phase === "stopping";
        ended = true;
        setPhase(id, "ended");
        if (!stopping && quickExit(rt.startedAt, Date.now())) { setErr(QUICK); say(QUICK); }
        else say(activeRef.current === id ? "claude가 종료되었습니다" : `${nameById(id)}의 claude가 종료되었습니다`);
      };
      const args = { tab: id, cols: t.cols, rows: t.rows, onOut: ch };
      if (how === "folder") await invoke("term_open_folder", args);
      else if (how === "new") await invoke("term_new", { ...args, id: session!.id });
      else await invoke("term_resume", { ...args, id: session!.id });
      if (g !== rt.gen) { invoke("term_stop", { tab: id }).catch(() => {}); return; } // 시작 중에 닫힌 탭
      start();
      if (!ended) setPhase(id, "running");
      if (!ended && activeRef.current === id) t.focus(); // 즉시 종료로 Exit가 먼저 왔으면 stdin 꺼진 xterm으로 포커스를 가져가지 않는다
      refocus.current = false;
      say(`${name} 폴더에서 claude 실행 중`);
    } catch (e) {
      if (g !== rt.gen) return;
      const msg = String(e);
      setErr(msg); say(`✕ 오류: ${msg}`);
      // 실패한 탭은 지운다(Rust도 새로 만든 항목을 뺀다). 이전 탭이 다시 골라진다.
      teardown(id);
      boxes.current.delete(id);
      upd((l) => l.filter((t) => t.id !== id));
      const back = prev !== null && tabsRef.current.some((t) => t.id === prev) ? prev : null;
      if (activeRef.current === id) { pend.current = back === null ? "head" : "xterm"; go(back); }
    } finally {
      if (rid) { resumeRef.current = null; setResumeBusy(null); }
    }
  };

  const stop = () => {
    const id = activeRef.current;
    const cur = tabsRef.current.find((t) => t.id === id);
    if (id === null || cur?.phase !== "running") return;
    refocus.current = inPanel(); // 끝나면 종료 버튼이 disabled 되므로 (W6)
    setPhase(id, "stopping");
    invoke("term_stop", { tab: id }).catch((e) => {
      const msg = String(e);
      refocus.current = false;
      setErr(msg); say(`✕ 오류: ${msg}`); setPhase(id, "running");
    });
  };

  // DESIGN 4절: from "row"(Delete) = 이웃 줄로, "x" = 보이던 것을 닫았을 때만 다음 터미널 xterm으로
  const closeTab = (id: number, from: "row" | "x") => {
    const l = tabsRef.current;
    if (!l.some((t) => t.id === id)) return;
    const name = nameById(id);
    const ids = l.map((t) => t.id);
    const was = activeRef.current === id;
    const next = nextActive(ids, id, activeRef.current);
    teardown(id); // gen++ 로 남은 메시지를 무시하고 xterm을 버린다
    boxes.current.delete(id);
    waited.current.delete(id);
    invoke("term_stop", { tab: id }).catch(() => {});
    if (from === "row") { pend.current = "row"; rowTo.current = { id: nextActive(ids, id, id), skip: id }; }
    else if (was) { if (next !== null) pend.current = "xterm"; else { pend.current = "row"; rowTo.current = { id: null, skip: id }; } }
    else if (document.getElementById(rowId(id))?.parentElement?.contains(document.activeElement)) { // 보이지 않던 줄의 ×: 포커스가 그 줄과 함께 사라지므로 Delete와 같이 이웃 줄로
      pend.current = "row"; rowTo.current = { id: nextActive(ids, id, id), skip: id };
    }
    else pend.current = null; // 다른 줄의 ×: 포커스는 그대로
    upd((x) => x.filter((t) => t.id !== id));
    go(next);
    say(`${name} 터미널을 닫았습니다`);
  };
  const jump = (n: number) => {
    const t = tabsRef.current[n];
    if (t) { select(t.id, "xterm"); say(`${nameOf(t)} 터미널${waitOf(t) ? ", 답을 기다리는 중" : ""}`); }
  };
  const sendAsk = (id: number, text: string): boolean => {
    const rt = rts.current.get(id);
    const t = rt?.t;
    if (!rt || !t || t.options.disableStdin) return false;
    if (tabsRef.current.find((x) => x.id === id)?.phase !== "running") return false;
    // 텍스트와 Enter를 따로: 한 번에 넣으면 TUI가 붙여넣기로 보고 Enter를 줄바꿈으로 처리할 수 있다
    rt.chain = rt.chain
      .then(() => invoke("term_write", { tab: id, data: text }))
      .then(() => new Promise((r) => setTimeout(r, 100)))
      .then(() => invoke("term_write", { tab: id, data: "\r" }))
      .catch(() => {});
    select(id, "xterm");
    return true;
  };
  ctl.current = { pick: (id) => { if (id === null) go(null); else select(id, "xterm"); }, close: closeTab, jump, settle, send: sendAsk };

  const actName = actTab ? nameOf(actTab) : "";
  const stateText = actTab ? (() => {
    const p = actTab.phase;
    return p === "starting" ? `${actName} · 시작하는 중…` : p === "running" ? `${actName} · 실행 중`
      : p === "stopping" ? `${actName} · 종료하는 중…` : `${actName} · 종료됨`;
  })() : sess;
  const waiting = actTab ? waitOf(actTab) : false;
  useEffect(() => { for (const rt of rts.current.values()) pruneStale(rt.stale, sessions); }, [sessions]);
  // 거짓 → 참으로 바뀐 탭만 한 번 알린다
  useEffect(() => {
    const next = new Map<number, boolean>();
    for (const t of tabsRef.current) {
      const w = waitOf(t);
      next.set(t.id, w);
      if (w && !waited.current.get(t.id)) say(activeRef.current === t.id ? "claude가 답을 기다립니다" : `${nameOf(t)}에서 claude가 답을 기다립니다`);
    }
    waited.current = next;
  }, [waitKey]);

  // 세션 칸에 보이는 요약(고름 = active)을 올린다
  useEffect(() => { onTabs({ tabs: live, active }); }, [tabs, active, waitKey]);

  // 종료·취소로 버튼이 disabled 됐다가 돌아올 때, 포커스가 이 패널에 있었다면 머리 줄 첫 활성 버튼으로 옮긴다 (W6·W7)
  const actPhase = actTab?.phase;
  useEffect(() => {
    if ((actPhase !== "ended" && actPhase !== undefined) || !refocus.current) return;
    refocus.current = false;
    headRef.current?.querySelector<HTMLElement>("button:not(:disabled):not([aria-disabled=true])")?.focus();
  }, [actPhase]);

  const stopOff = actTab?.phase !== "running";
  const stopWhy = actTab?.phase === "stopping" ? "종료하는 중" : "실행 중인 터미널이 없습니다";
  const startBtn = (how: How, label: string, on: string) => {
    const r = why(how);
    return (
      <button type="button" className="btn" aria-disabled={r ? "true" : undefined} title={r || on}
        aria-label={r ? `${label} — ${r}` : on} onClick={() => begin(how)}>{label}</button>
    );
  };
  return (
    <section className="panel terminal" aria-labelledby="h-term" onKeyDown={(e) => {
      const a = fontKey(e);
      if (a) { e.preventDefault(); bump(a); return; }
      const n = tabKey(e, MAC);
      if (n !== null) { e.preventDefault(); jump(n); }
    }}>
      <div className="term-head" ref={headRef}>
        <h2 id="h-term" className="px" tabIndex={-1}>터미널</h2>
        <span className="term-state px" title={stateText}>{stateText}</span>
        {waiting && <span className="term-wait px"><span className="blink" aria-hidden="true">!</span> 답을 기다리는 중</span>}
        <div className="term-btns">
          {startBtn("folder", "폴더 열기", "폴더 열기 (새 터미널)")}
          {startBtn("new", "새로 시작", `새 터미널에서 새로 시작: ${sess}`)}
          {startBtn("resume", "이어 가기", `새 터미널에서 이어 가기: ${sess}`)}
          <button type="button" className="btn" disabled={stopOff} aria-disabled={actTab?.phase === "stopping" ? "true" : undefined}
            title={stopOff ? stopWhy : `종료: ${actName}`} aria-label={stopOff ? undefined : `종료: ${actName}`} onClick={stop}>종료</button>
        </div>
        <div className="term-font" role="group" aria-label="터미널 글자 크기">
          <button type="button" className="btn" aria-disabled={font <= FONT.min ? "true" : undefined} onClick={() => bump("dec")}
            aria-label="터미널 글자 작게" title="글자 작게 (⌘-)">-</button>
          <span className="px" title={`⌘0: 기본 ${FONT.def}`}>{font}</span>
          <button type="button" className="btn" aria-disabled={font >= FONT.max ? "true" : undefined} onClick={() => bump("inc")}
            aria-label="터미널 글자 크게" title="글자 크게 (⌘=)">+</button>
        </div>
      </div>
      {err && <p className="term-err"><span className="px" aria-hidden="true">✕ 오류:</span>{err}</p>}
      {active === null && (
        <div className="term-body">
          <p className="empty">{session ? `${sess} — 새로 시작하거나 지난 대화를 이어 갑니다` : "폴더를 열거나, 세션을 고른 뒤 새로 시작·이어 가기를 누르세요"}</p>
          <p className="note">터미널 안에서 F6을 누르면 버튼으로 나옵니다</p>
        </div>
      )}
      {tabs.map((t) => (
        <div className="term" key={t.id}
          hidden={t.id !== active} ref={(el) => { if (el) boxes.current.set(t.id, el); }} />
      ))}
      <p className="sr" role="status">{note}</p>
    </section>
  );
}
