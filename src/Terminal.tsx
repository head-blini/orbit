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
import "./Terminal.css";

type TermOut = { t: "data"; d: string } | { t: "exit" };
type Phase = "idle" | "picking" | "running" | "stopping" | "ended";

const END = "\r\n\x1b[90m── 종료됨 ──\x1b[0m\r\n"; // 프론트가 xterm에 쓰는 유일한 글(상수)

// Cmd/Ctrl + = · + · - · 0 → 글자 크기 동작
const fontKey = (e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): "inc" | "dec" | "reset" | null => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  return e.key === "=" || e.key === "+" ? "inc" : e.key === "-" ? "dec" : e.key === "0" ? "reset" : null;
};

export default function Terminal({ session, sessions }: { session: Session | null; sessions: Session[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [ready, setReady] = useState(false); // 마운트 때 term_stop이 끝나야 시작할 수 있다(B1)
  const [shown, setShown] = useState(false);
  const [ran, setRan] = useState(""); // 터미널이 돌고 있는(돌았던) 폴더 이름
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [font, setFont] = useState(() => loadFont(() => localStorage));
  const [pickBusy, setPickBusy] = useState(false); // 폴더 선택 창이 떠 있는 동안
  const stale = useRef<Set<string>>(new Set());
  const [since, setSince] = useState<number | null>(null); // 마지막 시작 시각. 이 뒤에 대기로 바뀐 세션만 "이 터미널의 답 대기"로 본다
  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const gen = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const refocus = useRef(false);
  const off = useRef<(() => void) | null>(null); // ensureTerm이 단 리스너·ResizeObserver를 걷는 함수 (W4)
  // 한 번이라도 시작에 성공했는지. 취소·오류 뒤 화면을 시작 전(idle)으로 돌릴지 종료됨(ended)으로 둘지 정한다.
  // state가 아니라 ref인 이유: begin의 비동기 구간에서 최신 값을 읽어야 하고 렌더를 일으킬 필요가 없다.
  const ranRef = useRef(false);
  const noteTimer = useRef<number | undefined>(undefined);
  const ime = useRef(new HangulIme()); // xterm#5704: 병합 후 삭제. 맥 WKWebView 한글 조합 보정 (hangulIme.ts)

  const fontShown = useRef(font); // 마지막으로 반영한 크기(첫 렌더에는 알리지 않는다)
  const sess = session ? folderName(session) : "";

  // 같은 문구도 다시 낭독되게 비웠다가 넣는다
  const say = (s: string) => { clearTimeout(noteTimer.current); setNote(""); noteTimer.current = window.setTimeout(() => setNote(s), 50); };

  // B1: 웹뷰 재로드·HMR 뒤 Rust에 남은 claude를 먼저 정리하고, 끝나야 시작 버튼을 켠다. 최신 마운트의 promise만 켠다.
  useEffect(() => {
    let cancelled = false;
    // W1: HMR은 state를 보존하는데 xterm·세대는 cleanup에서 버려진다. 시작 전 상태로 되돌려 다시 시작할 수 있게 한다.
    ranRef.current = false;
    setPhase("idle"); setShown(false); setRan("");
    invoke("term_stop").catch(() => {}).finally(() => { if (!cancelled) setReady(true); });
    return () => {
      cancelled = true;
      gen.current++;
      invoke("term_stop").catch(() => {});
      off.current?.(); off.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      clearTimeout(noteTimer.current);
    };
  }, []);

  // 종료·취소·오류로 버튼이 disabled 됐다가 돌아올 때, 포커스가 이 패널에 있었다면 머리 줄 첫 활성 버튼으로 옮긴다 (W6·W7)
  useEffect(() => {
    if ((phase !== "ended" && phase !== "idle") || !refocus.current) return;
    refocus.current = false;
    headRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, [phase]);

  // 글자 크기가 바뀌면 xterm에 적용하고 저장한다. xterm이 아직 없으면 첫 시작 때 ensureTerm이 font를 읽는다.
  const fontRef = useRef(font);
  fontRef.current = font;
  useEffect(() => {
    saveFont(() => localStorage, font);
    const t = termRef.current;
    if (t) { t.options.fontSize = font; try { fitRef.current?.fit(); } catch { /* 숨김 상태 */ } }
    if (fontShown.current !== font) { fontShown.current = font; say(`글자 크기 ${font}`); }
  }, [font]);
  const bump = (a: "inc" | "dec" | "reset") => setFont((f) => fontStep(a, f));

  const inPanel = () => !!(headRef.current?.contains(document.activeElement) || boxRef.current?.contains(document.activeElement));

  const ensureTerm = (box: HTMLDivElement) => {
    if (termRef.current) return termRef.current;
    const t = new Xterm({
      fontFamily: 'Menlo, "Cascadia Mono", Consolas, monospace', fontSize: fontRef.current, lineHeight: 1,
      cursorStyle: "block", cursorBlink: false, drawBoldTextInBrightColors: false,
      minimumContrastRatio: MIN_CONTRAST, allowTransparency: false, theme: THEME,
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(box);
    t.textarea?.setAttribute("aria-label", "claude 터미널. F6: 버튼으로 나가기");
    const send = (data: string) => {
      if (!data || t.options.disableStdin) return;
      chain.current = chain.current.then(() => invoke("term_write", { data })).catch(() => {});
    };
    // 조합 중인 음절 미리보기: xterm의 composition-view를 커서 칸에 띄운다(WKWebView는 compositionstart가 없어 xterm이 안 띄움)
    const preview = () => { // xterm#5704: 병합 후 삭제
      const v = box.querySelector<HTMLElement>(".composition-view"), scr = box.querySelector<HTMLElement>(".xterm-screen");
      if (!v || !scr) return;
      const s = ime.current.pending;
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
      const r = ime.current.input(ev.inputType, ev.data);
      send(r.send);
      preview();
      if (r.handled) ev.stopPropagation();
    }, { capture: true, signal: ac.signal });
    t.textarea?.addEventListener("blur", () => { send(ime.current.flush()); preview(); }, { signal: ac.signal }); // xterm#5704: 병합 후 삭제
    t.onRender(() => { if (ime.current.active) preview(); }); // xterm#5704: 병합 후 삭제. 앞 음절 에코로 커서가 옮겨 가면 따라간다
    t.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && ime.current.active) {
        // xterm#5704: 병합 후 삭제. 229 = IME가 처리 중인 키: xterm의 textarea 비교 전송(CompositionHelper._handleAnyTextareaChanges)이 자모를 보내지 않게 막는다
        if (e.keyCode === 229) return false;
        send(ime.current.flush()); preview(); // xterm#5704: 병합 후 삭제. Enter·방향키·F6 등: 조합 중인 음절을 먼저 보낸다
      }
      if (fontKey(e)) return false; // 글자 크기 단축키는 xterm이 먹지 않는다. section onKeyDown이 처리한다
      if (e.key !== "F6") return true;
      if (e.type === "keydown") {
        const h = headRef.current;
        (h?.querySelector<HTMLElement>("button:not(:disabled)") ?? h?.querySelector<HTMLElement>("#h-term"))?.focus();
      }
      return false;
    });
    t.onData(send);
    // W5: 크기 변경도 입력과 같은 chain에 태워 순서가 뒤바뀌지 않게 한다
    t.onResize(({ cols, rows }) => { chain.current = chain.current.then(() => invoke("term_resize", { cols, rows })).catch(() => {}); });
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* 숨김 상태 */ } });
    ro.observe(box);
    off.current = () => { ac.abort(); ro.disconnect(); };
    termRef.current = t; fitRef.current = fit;
    return t;
  };

  // 시작 세 가지(폴더 열기·새로 시작·이어 가기)가 같은 경로를 쓴다. 웹뷰가 넘기는 값은 세션 id뿐이다.
  const begin = async (how: "folder" | "new" | "resume") => {
    const box = boxRef.current;
    if (!box || !ready) return;
    if (how !== "folder" && !session) return;
    let picked = "";
    if (how === "folder") {
      // 고르는 동안 gen·phase·shown은 건드리지 않는다: 취소하면 지금 터미널이 그대로 이어진다
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
    const g = ++gen.current;
    setSince(Date.now());
    stale.current = staleWaiting(sessions); // 종료 뒤 남은 Waiting을 이 터미널의 대기로 오표시하지 않는다
    refocus.current = inPanel(); // 시작 버튼이 disabled 되므로 취소·오류로 돌아오면 포커스를 되돌린다 (W7)
    setErr(""); setPhase("picking");
    try {
      flushSync(() => setShown(true));
      const t = ensureTerm(box);
      try { fitRef.current?.fit(); } catch { /* 기본 크기 */ }
      await invoke("term_resize", { cols: t.cols, rows: t.rows });
      // B2: 폴더 창 취소·시작 오류에는 이전 화면을 건드리지 않는다. 시작이 확인되는 첫 순간(첫 출력 또는 시작 성공)에 한 번만 비운다.
      let started = false, ended = false;
      const begun = () => {
        if (started) return;
        started = true;
        t.reset(); t.options.disableStdin = false; ime.current.flush(); // 이전 실행에서 남은 조합은 버린다
      };
      const ch = new Channel<TermOut>();
      ch.onmessage = (m) => {
        if (g !== gen.current) return; // 이전 시작의 메시지는 버린다
        begun();
        if (m.t === "data") t.write(m.d);
        else {
          t.write(END);
          t.options.disableStdin = true;
          refocus.current = refocus.current && inPanel(); ended = true;
          setPhase("ended");
          say("claude가 종료되었습니다");
        }
      };
      const name = how === "folder" ? await invoke("term_open_folder", { onOut: ch }).then(() => picked)
        : how === "new" ? await invoke("term_new", { id: session!.id, onOut: ch }).then(() => sess)
        : await invoke("term_resume", { id: session!.id, onOut: ch }).then(() => sess);
      if (g !== gen.current) return;
      begun();
      ranRef.current = true;
      setRan(name);
      setPhase((p) => (p === "ended" ? p : "running"));
      if (!ended) t.focus(); // 즉시 종료로 Exit가 먼저 왔으면 stdin 꺼진 xterm으로 포커스를 가져가지 않는다
      refocus.current = false;
      say(`${name} 폴더에서 claude 실행 중`);
    } catch (e) {
      if (g !== gen.current) return;
      const msg = String(e);
      setErr(msg); say(`✕ 오류: ${msg}`);
      if (how === "folder" && termRef.current) termRef.current.options.disableStdin = true; // Rust가 이전 claude를 이미 끝냈을 수 있다
      setShown(!!ranRef.current); setPhase(ranRef.current ? "ended" : "idle");
    }
  };

  const stop = () => {
    if (phase !== "running") return;
    refocus.current = inPanel(); // 끝나면 종료 버튼이 disabled 되므로 (W6)
    setPhase("stopping");
    invoke("term_stop").catch((e) => {
      const msg = String(e);
      refocus.current = false;
      setErr(msg); say(`✕ 오류: ${msg}`); setPhase("running");
    });
  };

  const folder = phase === "idle" ? sess : ran;
  const stateText = !folder ? ""
    : phase === "picking" ? `${folder} · 시작하는 중…`
    : phase === "running" ? `${folder} · 실행 중`
    : phase === "stopping" ? `${folder} · 종료하는 중…`
    : phase === "ended" ? `${folder} · 종료됨` : folder;
  const waiting = phase === "running" && termWaiting(sessions, since, stale.current);
  useEffect(() => { pruneStale(stale.current, sessions); }, [sessions]);
  useEffect(() => { if (waiting) say("claude가 답을 기다립니다"); }, [waiting]);
  const canOpen = ready && !pickBusy && (phase === "idle" || phase === "ended" || phase === "running");
  const canStart = ready && (phase === "idle" || phase === "ended");

  return (
    <section className="panel terminal" aria-labelledby="h-term" onKeyDown={(e) => {
      const a = fontKey(e);
      if (a) { e.preventDefault(); bump(a); }
    }}>
      <div className="term-head" ref={headRef}>
        <h2 id="h-term" className="px" tabIndex={-1}>터미널</h2>
        <span className="term-state px" title={stateText}>{stateText}</span>
        {waiting && <span className="term-wait px"><span className="blink" aria-hidden="true">!</span> 답을 기다리는 중</span>}
        <div className="term-btns">
          <button type="button" className="btn" disabled={!canOpen} onClick={() => begin("folder")}>폴더 열기</button>
          <button type="button" className="btn" disabled={!canStart || !session} onClick={() => begin("new")}
            aria-label={session ? `새로 시작: ${sess} 폴더` : undefined}>새로 시작</button>
          <button type="button" className="btn" disabled={!canStart || !session} onClick={() => begin("resume")}
            aria-label={session ? `이어 가기: ${sess} 세션` : undefined}>이어 가기</button>
          <button type="button" className="btn" disabled={phase !== "running" && phase !== "stopping"}
            aria-disabled={phase === "stopping" ? "true" : undefined} onClick={stop}>종료</button>
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
      {!shown && (
        <div className="term-body">
          <p className="empty">{session ? `${sess} — 새로 시작하거나 지난 대화를 이어 갑니다` : "폴더를 열거나, 세션을 고른 뒤 새로 시작·이어 가기를 누르세요"}</p>
          <p className="note">터미널 안에서 F6을 누르면 버튼으로 나옵니다</p>
        </div>
      )}
      <div className="term" ref={boxRef} hidden={!shown} />
      <p className="sr" role="status">{note}</p>
    </section>
  );
}
