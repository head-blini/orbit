import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Msg } from "./DesignView";
import { josa } from "./designGraph";
import { GRAPH_CAP_ERROR, GRAPH_LIMITS, checkGraphName, graphKey, isDirty, parseGraphFile, saveStatus, serializeGraph } from "./graphFile";
import { fmtTime, type DesignGraph, type GraphEntry, type Opened } from "./types";

type Props = {
  graph: DesignGraph;
  onChange: (g: DesignGraph) => void;
  say: (text: string, err?: boolean) => void;
  msg: Msg;
  opened: Opened | null;
  onOpened: (o: Opened | null) => void;
};
type Pending = { kind: "save" | "load" | "del"; id: string; prompt: string };

const P_SAVE = "같은 이름이 있습니다 · 한 번 더 누르면 덮어씁니다";
const P_LOAD = "저장 안 한 변경이 사라집니다 · 한 번 더 누르면 불러옵니다";
const P_BUSY = "다른 작업이 끝난 뒤에 다시 누르세요";
const P_DEL = "한 번 더 누르면 지웁니다 · 되돌릴 수 없습니다";

// 동기 throw와 비동기 거부를 모두 문자열 사유로 바꾼다. 원문 오류 객체는 화면에 내지 않는다
const call = <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  Promise.resolve()
    .then(() => invoke<T>(cmd, args))
    .catch((e) => {
      throw typeof e === "string" ? e : isTauri() ? "앱이 요청을 처리하지 못했습니다" : "데스크톱 앱에서만 됩니다";
    });

export default function GraphSave({ graph, onChange, say, msg, opened, onOpened }: Props) {
  const [name, setName] = useState(opened?.name ?? "");
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [entries, setEntries] = useState<GraphEntry[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const alive = useRef(true);
  const busy = useRef(false); // 저장·불러오기·삭제가 서로 막는다
  const listRef = useRef<HTMLUListElement>(null);
  const armedRef = useRef<HTMLButtonElement>(null);
  const key = useMemo(() => graphKey(graph), [graph]);
  const dirty = isDirty(opened, graph, key);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const reload = async (): Promise<GraphEntry[] | null> => {
    try {
      const l = await call<GraphEntry[]>("list_graphs");
      if (alive.current) { setEntries(l); setListErr(null); }
      return l;
    } catch (e) {
      if (alive.current) setListErr(String(e));
      return null;
    }
  };
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 삭제 뒤 포커스: reload()로 새 목록이 렌더된 뒤, 새 목록 기준 focusAt번째 삭제 버튼. 없으면 이름 칸(-1 포함)
  useEffect(() => {
    if (focusAt === null) return;
    const btns = listRef.current?.querySelectorAll<HTMLButtonElement>("li > button.btn") ?? [];
    (btns[focusAt] ?? document.getElementById("gs-name"))?.focus();
    setFocusAt(null);
  }, [focusAt, entries]);

  // 확인 대기 취소: 그래프 변경, 다른 알림, 반전된 버튼 밖 누름
  useEffect(() => { setPending(null); }, [graph]);
  useEffect(() => { if (pending && msg && msg.text !== pending.prompt) setPending(null); }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  const armed = pending !== null;
  useEffect(() => {
    if (!armed) return;
    const h = (e: Event) => { if (!armedRef.current?.contains(e.target as Node)) setPending(null); };
    document.addEventListener("pointerdown", h, true);
    return () => document.removeEventListener("pointerdown", h, true);
  }, [armed]);

  const arm = (p: Pending) => { setPending(p); say(p.prompt); };

  const save = async () => {
    if (busy.current) { say(P_BUSY); return; }
    const n = checkGraphName(name);
    if (!n.ok) {
      setNameErr(n.error);
      say(n.error, true);
      document.getElementById("gs-name")?.focus();
      return;
    }
    const s = serializeGraph(graph);
    if (!s.ok) { say(`저장하지 못했습니다 — ${s.error}`, true); return; }
    busy.current = true;
    setSaving(true);
    try {
      const list = entries ?? (await reload());
      if (!alive.current) return;
      let id: string | null = null;
      let over = false;
      if (opened?.id && n.value === opened.name) {
        id = opened.id;
      } else {
        const other = list?.find((e) => e.readable && e.name === n.value && e.id !== opened?.id);
        if (other) {
          if (!(pending?.kind === "save" && pending.id === other.id)) { arm({ kind: "save", id: other.id, prompt: P_SAVE }); return; }
          id = other.id;
          over = true;
        }
      }
      setPending(null);
      try {
        const e = await call<GraphEntry>("save_graph", { id, name: n.value, graph: s.value });
        // 언마운트 뒤에도 App 상태는 갱신한다(저장은 이미 끝났다)
        onOpened({ id: e.id, name: n.value, base: key });
        say(`${josa(n.value, "을", "를")} ${over ? "덮어썼습니다" : "저장했습니다"}`);
        if (alive.current) void reload();
      } catch (err) {
        if (alive.current) say(err === GRAPH_CAP_ERROR ? String(err) : `저장하지 못했습니다 — ${String(err)}`, true);
      }
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const open = async (e: GraphEntry) => {
    if (busy.current) { say(P_BUSY); return; } // 진행 중인 저장·불러오기·삭제와 겹치지 않게
    const nm = e.name ?? "";
    if (!(pending?.kind === "load" && pending.id === e.id)) {
      if (opened?.id === e.id && !dirty) { say(`${josa(nm, "은", "는")} 이미 열려 있습니다`); return; }
      if (dirty) { arm({ kind: "load", id: e.id, prompt: P_LOAD }); return; }
    }
    setPending(null);
    busy.current = true;
    try {
      const raw = await call<string>("load_graph", { id: e.id });
      const r = parseGraphFile(raw);
      if (!alive.current) return;
      if (!r.ok) {
        say(`불러오지 못했습니다 — ${r.error}`, true);
        void reload();
        return;
      }
      onChange(r.value.graph);
      onOpened({ id: e.id, name: r.value.name, base: graphKey(r.value.graph) });
      setName(r.value.name);
      say(`${josa(r.value.name, "을", "를")} 불러왔습니다`);
    } catch (err) {
      if (!alive.current) return;
      say(`불러오지 못했습니다 — ${String(err)}`, true);
      void reload();
    } finally {
      busy.current = false;
    }
  };

  const del = async (e: GraphEntry, i: number) => {
    if (busy.current) { say(P_BUSY); return; }
    if (!(pending?.kind === "del" && pending.id === e.id)) { arm({ kind: "del", id: e.id, prompt: P_DEL }); return; }
    setPending(null);
    busy.current = true;
    try {
      await call("delete_graph", { id: e.id });
      if (!alive.current) return;
      if (opened?.id === e.id) onOpened({ ...opened, id: null });
      say(`${josa(e.name ?? "", "을", "를")} 지웠습니다`);
      const l = await reload();
      if (!alive.current) return;
      const left = (l ?? []).filter((x) => x.readable).length;
      setFocusAt(Math.min(i, left - 1)); // 같은 자리(다음), 마지막이면 이전, 비면 -1(이름 칸)
    } catch (err) {
      if (alive.current) say(`지우지 못했습니다 — ${String(err)}`, true);
    } finally {
      busy.current = false;
    }
  };

  const savePending = pending?.kind === "save";
  const readableIdx = (id: string) => (entries ?? []).filter((x) => x.readable).findIndex((x) => x.id === id);

  return (
    <div
      className="gsave"
      role="group"
      aria-labelledby="gs-sv"
      onKeyDown={(e) => {
        if (e.key === "Escape" && pending) {
          e.preventDefault();
          e.stopPropagation();
          setPending(null);
          say("취소했습니다");
        }
      }}
    >
      <h3 className="px" id="gs-sv">저장</h3>
      <p className="loop-sum">{saveStatus(opened, graph, key)}</p>
      <form className="f-row btn-last" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="f">
          <label htmlFor="gs-name">그래프 이름</label>
          <input id="gs-name" maxLength={40} value={name}
            onChange={(e) => { setName(e.target.value); setPending(null); setNameErr(null); }}
            aria-invalid={nameErr ? true : undefined}
            aria-describedby={nameErr ? "gs-name-err" : undefined} />
        </div>
        <button type="submit" ref={savePending ? armedRef : undefined} className={`btn${savePending ? " armed" : ""}`}
          aria-label={savePending ? `덮어쓰기: ${name.trim()}` : undefined}
          aria-disabled={saving ? true : undefined}>
          {saving ? "저장 중…" : savePending ? "덮어쓰기" : "저장"}
        </button>
      </form>
      {nameErr && (
        <p className="f-err" id="gs-name-err">
          <span className="px" aria-hidden="true">✕</span>
          {nameErr}
        </p>
      )}
      <div className="f">
        <div className="gl-head">
          <span className="lb" id="gs-gl">저장된 그래프</span>
          {entries && !listErr && <span className="note">{entries.length}/{GRAPH_LIMITS.count}</span>}
        </div>
        {listErr ? (
          <p className="f-err">
            <span className="px" aria-hidden="true">✕</span>
            목록을 읽지 못했습니다 — {listErr}
          </p>
        ) : entries === null ? (
          <p className="note">목록을 읽는 중…</p>
        ) : entries.length === 0 ? (
          <p className="note">저장된 그래프 없음 · 이름을 적고 저장을 누릅니다</p>
        ) : (
          <ul className="list glist" aria-labelledby="gs-gl" ref={listRef}>
            {entries.map((e) => {
              if (!e.readable) {
                return (
                  <li key={e.id}>
                    <div className="sess bad">
                      <span className="mk" aria-hidden="true">✕</span>
                      <span className="name">읽을 수 없음</span>
                      <span className="time">{e.id}.json · 이 버전에서 열 수 없습니다</span>
                    </div>
                  </li>
                );
              }
              const nm = e.name ?? "";
              const loadArmed = pending?.kind === "load" && pending.id === e.id;
              const delArmed = pending?.kind === "del" && pending.id === e.id;
              return (
                <li key={e.id}>
                  <button type="button" ref={loadArmed ? armedRef : undefined} className={`sess${loadArmed ? " armed" : ""}`}
                    aria-current={opened?.id === e.id ? true : undefined}
                    aria-label={loadArmed ? `불러오기 확인: ${nm}` : `${nm}, ${fmtTime(e.savedAt, Date.now())}`}
                    onClick={() => void open(e)}>
                    <span className="cur px" aria-hidden="true">▶</span>
                    <span className="name">{nm}</span>
                    <span className="time">{loadArmed ? "한 번 더 누르면 불러옵니다" : delArmed ? "한 번 더 누르면 지웁니다" : fmtTime(e.savedAt, Date.now())}</span>
                  </button>
                  <button type="button" ref={delArmed ? armedRef : undefined} className={`btn${delArmed ? " armed" : ""}`}
                    aria-label={delArmed ? `삭제 확인: ${nm}` : `삭제: ${nm}`}
                    onClick={() => void del(e, readableIdx(e.id))}>
                    {delArmed ? "확인" : "삭제"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
