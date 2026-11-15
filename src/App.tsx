import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Graph from "./Graph";
import Screen from "./Screen";
import Terminal from "./Terminal";
import { createGate } from "./roadmapGate";
import { CHIP_AT, fmtTime, folderName, shownState, type Roadmap, type RoadmapLine, type Session } from "./types";
import "./App.css";

type Status = {
  listen_addr: string | null;
  server_error: string | null;
  installed: boolean | null;
  settings_error: string | null;
  projects_error: string | null;
  node_missing: boolean;
};

const NODE_MISSING = "✕ node를 찾지 못해 체크포인트가 꺼집니다 — node를 설치하거나 nvm·Homebrew 경로를 확인하세요";
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

function RoadmapView({ rm }: { rm: Roadmap | null }) {
  if (!rm) return <p className="empty">불러오는 중…</p>;
  if (rm.kind === "missing") return <><p className="empty">ROADMAP.md가 없습니다</p><p className="note">{HINT}</p></>;
  if (rm.kind === "toobig")
    return <><p className="empty">✕ ROADMAP.md가 너무 커서 읽지 않았습니다</p><p className="note">한도: {Math.round(rm.max_bytes / 1024)} KiB · {rm.max_entries}개</p></>;
  if (rm.kind === "error") return <><p className="empty">✕ 로드맵을 읽지 못했습니다</p><p className="note">{rm.reason}</p></>;
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

export default function App() {
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

  const refresh = useCallback(() => {
    invoke<Status>("get_status")
      .then((s) => { setStatus(s); setStatusError(null); })
      .catch((e) => setStatusError(String(e)));
  }, []);

  useEffect(refresh, [refresh]);

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
  useEffect(() => setRoadmap(null), [selected]);
  const gate = useRef(createGate());
  const selRef = useRef(selected);
  selRef.current = selected;
  useEffect(() => {
    if (!selected || !gate.current.begin(selected)) return;
    const id = selected;
    invoke<Roadmap>("get_roadmap", { id })
      .then((r) => { if (selRef.current === id) setRoadmap(r); })
      .catch((e) => { if (selRef.current === id) setRoadmap({ kind: "error", reason: String(e) }); })
      .finally(() => gate.current.end(id));
  }, [selected, now]);

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
    || (status?.node_missing ? NODE_MISSING : "");

  const list = [...sessions.values()].sort((a, b) => b.last_ms - a.last_ms);
  const cur = selected ? sessions.get(selected) ?? null : null;

  return (
    <div className="shell">
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

      <section className="panel sessions" aria-labelledby="h-sessions">
        <h2 id="h-sessions" className="px">세션</h2>
        {sessionsError || status?.projects_error ? <><p className="empty">✕ 로그 폴더를 읽지 못했습니다</p>{status?.projects_error && <p className="note">{status.projects_error}</p>}</>
          : !loaded ? <p className="empty">불러오는 중…</p>
          : list.length === 0 ? <p className="empty">아직 세션이 없습니다</p>
          : (
            <ul className="list">
              {list.map((x) => {
                const st = shownState(x);
                return (
                  <li key={x.id}>
                    <button type="button" className={list.length >= CHIP_AT && x.id !== selected ? "sess chip" : "sess"}
                      aria-current={x.id === selected ? "true" : undefined}
                      onClick={() => { setSelected(x.id); setNode(null); }}>
                      <span className="cur px" aria-hidden="true">▶</span>
                      <span className="name px">{folderName(x)}</span>
                      <Sym state={st} />
                      <span className="time">{fmtTime(x.last_ms, now)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </section>

      <section className="panel graph" aria-labelledby="h-graph">
        <h2 id="h-graph" className="px">에이전트 그래프</h2>
        <Graph session={cur} selected={node} onSelect={setNode} />
      </section>

      <section className="panel detail" aria-labelledby="h-roadmap">
        <h2 id="h-roadmap" className="px">로드맵</h2>
        {selected ? <RoadmapView rm={roadmap} /> : <p className="empty">세션을 고르면 그 프로젝트의 로드맵이 보입니다</p>}
      </section>

      <Terminal session={cur} />

      <div className="console"><Screen /></div>
    </div>
  );
}
