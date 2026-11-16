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
import { MAX_TABS, tabKey, tabSessions, tabSid, newTabId, nextActive, canResume, quickExit } from "./tabs";
import "./Terminal.css";

type TermOut = { t: "data"; d: string } | { t: "exit" };
type Phase = "starting" | "running" | "stopping" | "ended";
type How = "folder" | "new" | "resume";
type TabView = { id: number; base: string; no: number; phase: Phase }; // no: 같은 이름 구분 번호. 1이면 붙이지 않는다
// 탭별 런타임(렌더와 무관). state가 아니라 ref 맵에 둔다.
type Rt = {
  t: Xterm | null; fit: FitAddon | null; gen: number; chain: Promise<unknown>; off: (() => void) | null;
  ime: HangulIme; stale: Set<string>; since: number | null; startedAt: number;
};

const END = "\r\n\x1b[90m── 종료됨 ──\x1b[0m\r\n"; // 프론트가 xterm에 쓰는 유일한 글(상수)
const QUICK = "claude가 바로 종료되었습니다 — 터미널 출력을 확인하세요";
const MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

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

export default function Terminal({ session, sessions, onPick }: { session: Session | null; sessions: Session[]; onPick: (id: string) => void }) {
  const [tabs, setTabs] = useState<TabView[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false); // 마운트 때 term_stop_all이 끝나야 시작할 수 있다(B1)
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [font, setFont] = useState(() => loadFont(() => localStorage));
  const [pickBusy, setPickBusy] = useState(false); // 폴더 선택 창이 떠 있는 동안
  const tabsRef = useRef<TabView[]>([]);
  const activeRef = useRef<number | null>(null);
  const rts = useRef(new Map<number, Rt>());
  const boxes = useRef(new Map<number, HTMLDivElement>());
  const headRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const pend = useRef<"tab" | "xterm" | "head" | null>(null); // 다음 렌더 뒤 포커스를 보낼 곳
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

  // 고른 탭이 바뀌면 탭 버튼을 보이게 하고, 요청된 곳으로 포커스를 보낸다(E5)
  useEffect(() => {
    const a = active === null ? null : document.getElementById(`term-t-${active}`);
    a?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const p = pend.current;
    pend.current = null;
    if (p === "tab") a?.focus();
    else if (p === "xterm" && active !== null) rts.current.get(active)?.t?.focus();
    else if (p === "head") (headRef.current?.querySelector<HTMLElement>("button:not(:disabled):not([aria-disabled=true])") ?? headRef.current?.querySelector<HTMLElement>("#h-term"))?.focus();
  }, [active, tabs.length]);

  const select = (id: number, to: "tab" | "xterm" | null) => {
    if (!tabsRef.current.some((t) => t.id === id)) return;
    if (id === activeRef.current) { // 이미 고른 탭이면 effect가 돌지 않으므로 바로 처리
      if (to === "xterm") rts.current.get(id)?.t?.focus();
      else if (to === "tab") document.getElementById(`term-t-${id}`)?.focus();
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
    t.onRender(() => { if (rt.ime.active) preview(); }); // xterm#5704: 병합 후 삭제. 앞 음절 에코로 커서가 옮겨 가면 따라간다
    t.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && rt.ime.active) {
        // xterm#5704: 병합 후 삭제. 229 = IME가 처리 중인 키: xterm의 textarea 비교 전송(CompositionHelper._handleAnyTextareaChanges)이 자모를 보내지 않게 막는다
        if (e.keyCode === 229) return false;
        send(rt.ime.flush()); preview(); // xterm#5704: 병합 후 삭제. Enter·방향키·F6 등: 조합 중인 음절을 먼저 보낸다
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

  // 이어 가기가 이미 실행 중인 탭으로의 전환인가
  const switchTarget = (s: Session | null): TabView | null => {
    if (!s || s.tab === null) return null;
    const t = tabs.find((x) => x.id === s.tab);
    return t && (t.phase === "starting" || t.phase === "running") && tabSid(sessions, t.id) === s.id ? t : null;
  };

  const sess = session ? folderName(session) : "";
  const swt = switchTarget(session);
  // 꺼진 이유: 위에서부터 처음 걸리는 하나(DESIGN 6절)
  const why = (how: How): string =>
    !ready ? "터미널 준비 중"
    : pickBusy ? "폴더 선택 창이 열려 있습니다"
    : how !== "folder" && !session ? "세션을 먼저 고르세요"
    : how === "resume" && session && !canResume(session) ? "보낸 메시지가 없어 이어 갈 대화가 없습니다 — 새로 시작하세요"
    : tabs.length >= MAX_TABS && !(how === "resume" && swt) ? "탭은 8개까지 — 탭을 닫고 여세요"
    : "";

  // 시작 세 가지(폴더 열기·새로 시작·이어 가기)는 모두 새 탭을 만든다. 웹뷰가 넘기는 값은 세션 id뿐이다.
  const begin = async (how: How) => {
    if (why(how)) return;
    if (how === "resume" && swt) { select(swt.id, "xterm"); return; }
    let picked = "";
    if (how === "folder") {
      // 고르는 동안 탭은 건드리지 않는다: 취소하면 아무 일도 없다
      setPickBusy(true);
      try {
        const n = await invoke<string | null>("term_pick_folder");
        if (n === null) return;
        picked = n;
      } catch (e) {
        const msg = String(e);
        setErr(msg); say(`✕ 오류: ${msg}`);
        return;
      } finally { setPickBusy(false); }
    }
    if (tabsRef.current.length >= MAX_TABS) return;
    const base = how === "folder" ? picked : sess;
    const id = newTabId(new Set(tabsRef.current.map((t) => t.id)), Math.random);
    const view: TabView = { id, base, no: pickNo(tabsRef.current, base), phase: "starting" };
    const name = nameOf(view);
    const prev = activeRef.current;
    const rt = newRt();
    rt.since = Date.now();
    rt.startedAt = rt.since;
    rt.stale = staleWaiting(sessions); // 종료 뒤 남은 Waiting을 이 탭의 대기로 오표시하지 않는다
    rts.current.set(id, rt);
    refocus.current = inPanel();
    setErr("");
    flushSync(() => { upd((l) => [...l, view]); go(id); });
    const g = ++rt.gen;
    const box = boxes.current.get(id);
    if (!box) { teardown(id); upd((l) => l.filter((t) => t.id !== id)); go(prev); return; }
    try {
      const t = ensureTerm(id, rt, box, name);
      try { rt.fit?.fit(); } catch { /* 기본 크기 */ }
      let begun = false, ended = false;
      const start = () => { if (begun) return; begun = true; t.options.disableStdin = false; };
      const ch = new Channel<TermOut>();
      ch.onmessage = (m) => {
        if (g !== rt.gen) return; // 닫힌 탭·이전 시작의 메시지는 버린다
        start();
        if (m.t === "data") { t.write(m.d); return; }
        t.write(END);
        t.options.disableStdin = true;
        const cur = tabsRef.current.find((x) => x.id === id);
        const stopping = cur?.phase === "stopping";
        ended = true;
        setPhase(id, "ended");
        if (!stopping && quickExit(rt.startedAt, Date.now())) { setErr(QUICK); say(QUICK); }
        else say(activeRef.current === id ? "claude가 종료되었습니다" : `${nameById(id)} 탭의 claude가 종료되었습니다`);
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

  const closeTab = (id: number, to: "tab" | "xterm") => {
    const l = tabsRef.current;
    if (!l.some((t) => t.id === id)) return;
    const name = nameById(id);
    const next = nextActive(l.map((t) => t.id), id, activeRef.current);
    teardown(id); // gen++ 로 남은 메시지를 무시하고 xterm을 버린다
    boxes.current.delete(id);
    waited.current.delete(id);
    invoke("term_stop", { tab: id }).catch(() => {});
    if (activeRef.current === id) pend.current = next === null ? "head" : to;
    upd((x) => x.filter((t) => t.id !== id));
    go(next);
    say(`${name} 탭을 닫았습니다`);
  };

  const actTab = tabs.find((t) => t.id === active) ?? null;
  const actName = actTab ? nameOf(actTab) : "";
  const stateText = actTab ? (() => {
    const p = actTab.phase;
    return p === "starting" ? `${actName} · 시작하는 중…` : p === "running" ? `${actName} · 실행 중`
      : p === "stopping" ? `${actName} · 종료하는 중…` : `${actName} · 종료됨`;
  })() : sess;
  const waitOf = (t: TabView) => { const rt = rts.current.get(t.id); return t.phase === "running" && !!rt && termWaiting(tabSessions(sessions, t.id), rt.since, rt.stale); };
  const waitKey = tabs.map((t) => (waitOf(t) ? t.id : "")).join(",");
  const waiting = actTab ? waitOf(actTab) : false;
  useEffect(() => { for (const rt of rts.current.values()) pruneStale(rt.stale, sessions); }, [sessions]);
  // 거짓 → 참으로 바뀐 탭만 한 번 알린다
  useEffect(() => {
    const next = new Map<number, boolean>();
    for (const t of tabsRef.current) {
      const w = waitOf(t);
      next.set(t.id, w);
      if (w && !waited.current.get(t.id)) say(activeRef.current === t.id ? "claude가 답을 기다립니다" : `${nameOf(t)} 탭에서 claude가 답을 기다립니다`);
    }
    waited.current = next;
  }, [waitKey]);

  // 그래프·로드맵: 탭을 고를 때와 고른 탭의 최신 세션이 바뀔 때 세션 선택이 따라온다
  const sid = active !== null ? tabSid(sessions, active) : null;
  useEffect(() => { if (sid) onPick(sid); }, [active, sid]);

  // 종료·취소로 버튼이 disabled 됐다가 돌아올 때, 포커스가 이 패널에 있었다면 머리 줄 첫 활성 버튼으로 옮긴다 (W6·W7)
  const actPhase = actTab?.phase;
  useEffect(() => {
    if ((actPhase !== "ended" && actPhase !== undefined) || !refocus.current) return;
    refocus.current = false;
    headRef.current?.querySelector<HTMLElement>("button:not(:disabled):not([aria-disabled=true])")?.focus();
  }, [actPhase]);

  const full = tabs.length >= MAX_TABS;
  const stopOff = actTab?.phase !== "running";
  const stopWhy = actTab?.phase === "stopping" ? "종료하는 중" : "실행 중인 탭이 없습니다";
  const startBtn = (how: How, label: string, on: string) => {
    const r = why(how);
    return (
      <button type="button" className="btn" aria-disabled={r ? "true" : undefined} title={r || on}
        aria-label={r ? `${label} — ${r}` : on} onClick={() => begin(how)}>{label}</button>
    );
  };
  const tabKeys = (e: React.KeyboardEvent, i: number) => {
    const ids = tabs.map((t) => t.id);
    const to = (j: number) => { e.preventDefault(); select(ids[(j + ids.length) % ids.length], "tab"); };
    if (e.key === "ArrowRight") to(i + 1);
    else if (e.key === "ArrowLeft") to(i - 1);
    else if (e.key === "Home") to(0);
    else if (e.key === "End") to(ids.length - 1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(ids[i], "xterm"); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); closeTab(ids[i], "tab"); }
  };

  return (
    <section className="panel terminal" aria-labelledby="h-term" onKeyDown={(e) => {
      const a = fontKey(e);
      if (a) { e.preventDefault(); bump(a); return; }
      const n = tabKey(e, MAC);
      if (n !== null) {
        e.preventDefault();
        const t = tabs[n];
        if (t) { select(t.id, "xterm"); say(`${nameOf(t)} 탭`); }
      }
    }}>
      <div className="term-head" ref={headRef}>
        <h2 id="h-term" className="px" tabIndex={-1}>터미널</h2>
        <span className="term-state px" title={stateText}>{stateText}</span>
        {waiting && <span className="term-wait px"><span className="blink" aria-hidden="true">!</span> 답을 기다리는 중</span>}
        <div className="term-btns">
          {startBtn("folder", "폴더 열기", "폴더 열기 (새 탭)")}
          {startBtn("new", "새로 시작", `새 탭에서 새로 시작: ${sess}`)}
          {startBtn("resume", "이어 가기", swt ? `이어 가기: ${nameOf(swt)} 탭으로 전환` : `새 탭에서 이어 가기: ${sess}`)}
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
      {tabs.length > 0 && (
        <div className="term-tabbar">
          <div className="term-tabs" role="tablist" aria-label={`터미널 탭 ${tabs.length}/${MAX_TABS}`}>
            {tabs.map((t, i) => {
              const sel = t.id === active, nm = nameOf(t), w = !sel && waitOf(t);
              const sym = t.phase === "starting" || t.phase === "stopping" ? "…" : t.phase === "ended" ? "—" : w ? "!" : "";
              const stTxt = t.phase === "starting" ? "시작하는 중" : t.phase === "stopping" ? "종료하는 중" : t.phase === "ended" ? "종료됨" : w ? "답을 기다리는 중" : "";
              const ttl = `${nm} — ${t.phase === "ended" ? "종료됨" : stTxt || "실행 중"}`;
              return (
                <div className="ttab" role="presentation" key={t.id} data-phase={t.phase}>
                  <button type="button" role="tab" id={`term-t-${t.id}`} aria-selected={sel} aria-controls={`term-p-${t.id}`}
                    tabIndex={sel ? 0 : -1} className="ttab-name px" title={ttl}
                    aria-keyshortcuts={MAC && i < MAX_TABS ? `Meta+${i + 1} Delete` : "Delete"}
                    onClick={() => select(t.id, "xterm")} onKeyDown={(e) => tabKeys(e, i)}>
                    <span className="nm-base">{t.base}</span>{t.no > 1 && <span className="nm-no"> {t.no}</span>}
                    {sym && <span className={w ? "sym blink" : "sym"} aria-hidden="true">{sym}</span>}
                    {stTxt && !(sel && t.phase === "running") && <span className="sr">, {stTxt}</span>}
                  </button>
                  <button type="button" className="ttab-x px" tabIndex={-1} aria-label={`탭 닫기: ${nm}`}
                    title={t.phase === "ended" ? "탭 닫기" : "탭 닫기 — claude도 종료됩니다"} onClick={() => closeTab(t.id, "xterm")}>×</button>
                </div>
              );
            })}
          </div>
          {full && <span className="term-tabs-full note">탭 8개까지 — 닫으면 새로 열 수 있습니다</span>}
        </div>
      )}
      {err && <p className="term-err"><span className="px" aria-hidden="true">✕ 오류:</span>{err}</p>}
      {tabs.length === 0 && (
        <div className="term-body">
          <p className="empty">{session ? `${sess} — 새로 시작하거나 지난 대화를 이어 갑니다` : "폴더를 열거나, 세션을 고른 뒤 새로 시작·이어 가기를 누르세요"}</p>
          <p className="note">터미널 안에서 F6을 누르면 버튼으로 나옵니다</p>
        </div>
      )}
      {tabs.map((t) => (
        <div className="term" role="tabpanel" id={`term-p-${t.id}`} aria-labelledby={`term-t-${t.id}`} key={t.id}
          hidden={t.id !== active} ref={(el) => { if (el) boxes.current.set(t.id, el); }} />
      ))}
      <p className="sr" role="status">{note}</p>
    </section>
  );
}
