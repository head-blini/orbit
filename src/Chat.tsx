import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { folderName, type ChatOut, type ChatQuestion, type Session } from "./types";
import "./Chat.css";

type Item =
  | { k: "sep"; name: string }
  | { k: "me"; text: string }
  | { k: "ai"; text: string; live: boolean }
  | { k: "permit"; id: string; tool: string; target: string; result: string | null }
  | { k: "ask"; id: string; questions: ChatQuestion[]; result: string | null; free: boolean }
  | { k: "end"; kind: "done" | "stopped" | "err"; text: string };

const WAIT = "고를 때까지 기다리고 있다…";
const scope = (tool: string) => (tool === "Bash" ? "이 명령만" : `${tool} 전부`);
const targetLabel = (tool: string) =>
  tool === "Bash" ? "명령" : ["Edit", "Write", "Read", "NotebookEdit"].includes(tool) ? "파일" : "대상";
// 진행 중인 말풍선·빈 커서 줄을 정리한다(끝 줄을 붙이기 전)
const settle = (items: Item[]): Item[] =>
  items.flatMap((i): Item[] => (i.k === "ai" ? (i.text ? [{ ...i, live: false }] : []) : [i]));

function AskCard({ item, onAnswer }: { item: Extract<Item, { k: "ask" }>; onAnswer: (a: Record<string, string>, shown: string) => void }) {
  const qs = item.questions;
  const open = item.result === null;
  const immediate = qs.length === 1 && !qs[0].multiSelect; // 하나 고르기: 누르면 바로 보냄
  const [sel, setSel] = useState<string[][]>(() => qs.map(() => []));
  const toggle = (qi: number, label: string) =>
    setSel((p) => p.map((s, i) => (i !== qi ? s
      : qs[qi].multiSelect ? (s.includes(label) ? s.filter((x) => x !== label) : [...s, label]) : [label])));
  const send = (chosen: string[][]) =>
    onAnswer(Object.fromEntries(qs.map((q, i) => [q.question, chosen[i].join(", ")])), chosen.map((c) => c.join(", ")).join(" / "));
  return (
    <div className="card" role="group" aria-labelledby={`q-${item.id}`}>
      {qs.map((q, qi) => (
        <div key={qi} style={{ display: "grid", gap: "var(--s-1)" }}>
          <span className="tag px" style={{ justifySelf: "start" }}>{q.header}</span>
          <p className="q" id={qi === 0 ? `q-${item.id}` : undefined}>{q.question}</p>
          {open && (
            <ul className={immediate ? "choices one" : "choices"}>
              {q.options.map((o) => {
                const on = sel[qi].includes(o.label);
                return (
                  <li key={o.label}>
                    <button type="button" className="choice" aria-pressed={immediate ? undefined : on}
                      onClick={() => (immediate ? send([[o.label]]) : toggle(qi, o.label))}>
                      <span className="mk" aria-hidden="true">{immediate ? "▶" : on ? "[✓]" : "[ ]"}</span>
                      <span className="lb">{o.label}</span>
                      <span className="ds">{o.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      {open && !immediate && (
        <button type="button" className="btn send" disabled={sel.some((s) => s.length === 0)} onClick={() => send(sel)}>보내기</button>
      )}
      {!open && <p className={item.free ? "done free" : "done"}>{item.result}</p>}
    </div>
  );
}

export default function Chat({ session }: { session: Session | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false); // 대화가 있다(다음 보내기는 같은 대화)
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const runRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const run = (v: boolean) => { runRef.current = v; setRunning(v); if (!v) setStopping(false); };
  const finish = (kind: "done" | "stopped" | "err", end: string, say: string) => {
    setItems((p) => [...settle(p), { k: "end", kind, text: end }]);
    setNote(say);
    run(false);
  };
  const fail = (e: unknown) => finish("err", String(e), `✕ 오류: ${String(e)}`);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<ChatOut>("chat", (e) => {
      const m = e.payload;
      switch (m?.t) {
        case "delta":
          setItems((p) => {
            const last = p[p.length - 1];
            return last?.k === "ai" && last.live ? [...p.slice(0, -1), { ...last, text: last.text + String(m.text) }]
              : [...p, { k: "ai", text: String(m.text), live: true }];
          });
          break;
        case "permit":
          setItems((p) => [...settle(p), { k: "permit", id: m.id, tool: String(m.tool), target: String(m.target), result: null }]);
          setNote(`권한 요청: ${m.tool}. 채팅에서 허용, 거부, 이 세션 동안 중 고르세요`);
          break;
        case "ask":
          if (!Array.isArray(m.questions)) break;
          setItems((p) => [...settle(p), { k: "ask", id: m.id, questions: m.questions, result: null, free: false }]);
          setNote(`질문: ${m.questions[0]?.header ?? ""}`);
          break;
        case "closed":
          setItems((p) => p.map((i) => ((i.k === "permit" || i.k === "ask") && i.id === m.id && i.result === null
            ? { ...i, result: i.k === "permit" ? "→ 거부됨 (중단)" : "→ 답하지 않음 (중단)" } : i)));
          break;
        case "done":
          finish("done", typeof m.cost === "number" ? `완료 · 추정 비용 $${m.cost.toFixed(4)}` : "완료",
            typeof m.cost === "number" ? `완료 · 추정 비용 $${m.cost.toFixed(4)}` : "완료");
          break;
        case "stopped": finish("stopped", "중단됨", "중단됨"); break;
        case "error": finish("err", String(m.message), `✕ 오류: ${String(m.message)}`); break;
        case "exit":
          setOpen(false);
          if (runRef.current) finish("err", "사이드카가 끝났습니다", "✕ 오류: 사이드카가 끝났습니다");
          break;
      }
    })
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 카드가 뜨면 위치와 상관없이 보이게 한다
  const last = items[items.length - 1];
  useEffect(() => {
    if (last && (last.k === "permit" || last.k === "ask")) endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [items.length, last?.k]);

  // textarea 1줄 → 3줄(58px)
  useEffect(() => {
    const t = taRef.current;
    if (t) { t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 58)}px`; }
  }, [text]);

  const pend = [...items].reverse().find((i) => (i.k === "permit" || i.k === "ask") && i.result === null);
  const askOne = pend?.k === "ask" && pend.questions.length === 1 ? pend : null;
  const canSend = !running && (open || session !== null);
  const typing = canSend || askOne !== null;

  const answer = (id: string, answers: Record<string, string>, shown: string, free: boolean) => {
    setItems((p) => p.map((i) => (i.k === "ask" && i.id === id ? { ...i, result: `→ ${shown}`, free } : i)));
    invoke("chat_answer", { id, answers }).catch(fail);
  };
  const permit = (id: string, tool: string, decision: "allow" | "deny" | "session") => {
    const shown = decision === "allow" ? "→ 허용함" : decision === "deny" ? "→ 거부함" : `→ 이 세션 동안 허용함 (${scope(tool)})`;
    setItems((p) => p.map((i) => (i.k === "permit" && i.id === id ? { ...i, result: shown } : i)));
    invoke("chat_permit", { id, decision }).catch(fail);
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (askOne) {
      const q = askOne.questions[0];
      answer(askOne.id, { [q.question]: t }, t, true);
      setText("");
    } else if (canSend && (open || session)) {
      setItems((p) => [...(open ? p : [...p, { k: "sep", name: folderName(session!) } as Item]), { k: "me", text: t }, { k: "ai", text: "", live: true }]);
      setOpen(true);
      setNote("Claude가 답하는 중");
      run(true);
      setText("");
      invoke("chat_send", { session: session?.id ?? "", text: t }).catch(fail);
    }
  };

  const interrupt = () => {
    if (stopping) return;
    setStopping(true);
    invoke("chat_interrupt").catch(fail);
  };
  const reset = () => {
    invoke("chat_reset").catch(() => {});
    setItems([]); setOpen(false); setNote(""); run(false);
  };

  const emptyText = session ? `보내면 ${folderName(session)} 폴더에서 새 대화를 시작합니다` : "세션을 고르면 그 폴더에서 대화를 시작합니다";

  return (
    <section className="panel chat" aria-labelledby="h-chat">
      <div className="chat-head">
        <h2 id="h-chat" className="px">채팅</h2>
        {items.length > 0 && <button type="button" className="btn" disabled={running} onClick={reset}>새 대화</button>}
      </div>
      {items.length === 0 ? <div className="chat-body"><p className="empty">{emptyText}</p></div> : (
        <div className="chat-log" role="log" aria-label="대화" tabIndex={0}>
          <div className="chat-items">
            {items.map((i, n) => {
              switch (i.k) {
                case "sep": return <div className="chat-sep px" key={n}><b>새 대화 · 폴더: {i.name}</b></div>;
                case "me": return <div className="msg me" key={n}><span className="who">나</span><p className="txt">{i.text}</p></div>;
                case "ai": return (
                  <div className="msg ai" key={n}><span className="who">Claude</span>
                    <p className="txt">{i.text}{i.live && <span className="caret blink" aria-hidden="true" />}</p></div>
                );
                case "permit": return (
                  <div className="card" role="group" aria-labelledby={`q-${i.id}`} key={n}>
                    <p className="q px" id={`q-${i.id}`}>{i.tool} 실행을 허용할까요?</p>
                    <pre className="cmd" tabIndex={0} aria-label={targetLabel(i.tool)}>{i.target}</pre>
                    {i.result === null ? (
                      <div className="menu">
                        <button type="button" className="opt" onClick={() => permit(i.id, i.tool, "allow")}><span className="cur" aria-hidden="true">▶</span>허용</button>
                        <button type="button" className="opt" onClick={() => permit(i.id, i.tool, "deny")}><span className="cur" aria-hidden="true">▶</span>거부</button>
                        <button type="button" className="opt" onClick={() => permit(i.id, i.tool, "session")}><span className="cur" aria-hidden="true">▶</span>이 세션 동안 ({scope(i.tool)})</button>
                      </div>
                    ) : <p className="done">{i.result}</p>}
                  </div>
                );
                case "ask": return <AskCard key={n} item={i} onAnswer={(a, shown) => answer(i.id, a, shown, false)} />;
                case "end": return i.kind === "err"
                  ? <p className="chat-end err" key={n}><span className="px">✕ 오류:</span>{i.text}</p>
                  : <p className="chat-end" key={n}>{i.text}</p>;
              }
            })}
            <div ref={endRef} />
          </div>
        </div>
      )}
      <div className={typing ? "input-row on" : "input-row"}>
        {typing ? (
          <>
            <span className="tri px" aria-hidden="true">▶</span>
            <textarea ref={taRef} rows={1} value={text} disabled={!typing}
              aria-label={askOne ? "선택지에 없는 답" : "Claude Code에게 보낼 말"}
              placeholder={askOne ? "다른 답은 여기에 쓰고 Enter" : "Claude Code에게 무엇을 시킬까?"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
            {!askOne && <span className="tri px blink" aria-hidden="true">▼</span>}
            <button type="button" className="btn" disabled={!text.trim()} onClick={submit}>보내기</button>
          </>
        ) : running ? (
          <span className="say px">{pend ? WAIT : "Claude가 일하고 있다…"}</span>
        ) : (
          <>
            <span className="tri px" aria-hidden="true">▶</span>
            <textarea ref={taRef} rows={1} disabled aria-label="Claude Code에게 보낼 말" placeholder="Claude Code에게 무엇을 시킬까?" />
            <span className="tri px" aria-hidden="true">▼</span>
            <button type="button" className="btn" disabled>보내기</button>
          </>
        )}
        {running && <button type="button" className="btn" aria-disabled={stopping} onClick={interrupt}>중단</button>}
      </div>
      <p className="sr" role="status">{note}</p>
    </section>
  );
}
