import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type Status = {
  listen_addr: string | null;
  server_error: string | null;
  settings_path: string;
  installed: boolean | null;
  settings_error: string | null;
  projects_dir: string;
  projects_error: string | null;
};

type ToolEvent = {
  tool_use_id: string | null;
  phase: "call" | "result";
  tool: string;
  at_ms: number;
  source: "hook" | "log" | "both";
};

type Session = {
  id: string;
  cwd: string | null;
  started_ms: number | null;
  last_ms: number;
  source: "hook" | "log" | "both";
  ver: number;
  events: ToolEvent[];
};

const SOURCE_LABEL = { hook: "훅", log: "로그", both: "둘 다" } as const;

function Panel({ area, title, hint, children }: { area: string; title: string; hint: string; children?: ReactNode }) {
  return (
    <section className="panel" style={{ gridArea: area }} aria-label={title}>
      <h2>{title}</h2>
      {children ?? <p className="empty">{hint}</p>}
    </section>
  );
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(() => {
    invoke<Status>("get_status")
      .then((s) => { setStatus(s); setStatusError(null); })
      .catch((e) => setStatusError(String(e)));
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    // 들고 있는 것보다 ver가 작은 스냅숏은 버린다.
    const merge = (list: Session[]) =>
      setSessions((prev) => {
        const next = { ...prev };
        for (const x of list) if (!(next[x.id] && x.ver < next[x.id].ver)) next[x.id] = x;
        return next;
      });
    listen<Session[]>("session-update", (e) => merge(e.payload ?? [])).then((fn) => (cancelled ? fn() : (unlisten = fn)));
    invoke<Session[]>("get_sessions").then(merge).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const run = (cmd: "install_hooks" | "uninstall_hooks") => {
    setBusy(true);
    setResult("처리 중…");
    invoke<string | null>(cmd)
      .then((backup) =>
        setResult(
          backup
            ? `성공 · 백업: ${backup}`
            : cmd === "install_hooks" ? "성공 (백업 없음: 새 파일이거나 변경 없음)" : "제거할 항목 없음",
        ),
      )
      .catch((e) => setResult(`오류: ${String(e)}`))
      .finally(() => { setBusy(false); refresh(); });
  };

  const serverText = statusError
    ? `상태를 읽지 못했습니다: ${statusError}`
    : !status ? "확인 중…"
    : status.listen_addr ? `${status.listen_addr}에서 듣는 중`
    : `훅 서버 시작 실패: ${status.server_error ?? "알 수 없음"}`;

  const installText = !status ? ""
    : status.settings_error ? `확인 실패: ${status.settings_error}`
    : status.installed ? "설치됨" : "설치 안 됨";

  const list = Object.values(sessions).sort((a, b) => b.last_ms - a.last_ms);
  const events = selected && sessions[selected] ? [...sessions[selected].events].sort((a, b) => a.at_ms - b.at_ms) : null;

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Orbit</h1>
        <span className="status" role="status">{serverText}</span>
      </header>
      <Panel area="sessions" title="세션" hint="">
        <p>
          {status?.projects_dir
            ? <>로그 폴더: <code>{status.projects_dir}</code></>
            : status ? `로그 폴더를 정하지 못했습니다: ${status.projects_error ?? "알 수 없음"}` : "…"}
        </p>
        {list.length > 0 ? (
          <ul className="sessions">
            {list.map((x) => (
              <li key={x.id}>
                <button type="button" aria-pressed={x.id === selected} onClick={() => setSelected(x.id)}>
                  {[
                    x.id.slice(0, 8),
                    x.cwd ?? "—",
                    x.started_ms == null ? "—" : new Date(x.started_ms).toLocaleString(),
                    new Date(x.last_ms).toLocaleString(),
                    SOURCE_LABEL[x.source] ?? "",
                  ].join(" · ")}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="empty">아직 세션이 없습니다</p>}
      </Panel>
      <Panel area="graph" title="에이전트 그래프" hint="세션을 선택하면 그래프가 표시됩니다" />
      <Panel area="detail" title="상세 · 하네스" hint="">
        <p>대상 경로: <code>{status?.settings_path ?? "…"}</code></p>
        <p>훅 상태: {installText}</p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => run("install_hooks")}>설치</button>
          <button type="button" disabled={busy} onClick={() => run("uninstall_hooks")}>제거</button>
        </div>
        <p role="status" aria-live="polite">{result}</p>
        <p className="empty">토큰이 settings 파일에 평문으로 저장됩니다.</p>
        <p className="empty">이벤트가 오지 않으면 settings의 allowedHttpHookUrls·disableAllHooks를 확인하세요.</p>
      </Panel>
      <Panel area="timeline" title="타임라인" hint="세션을 고르면 도구 호출이 시간순으로 표시됩니다">
        {events && events.length === 0 ? <p className="empty">기록 없음</p> : events ? (
          <ul className="events">
            {events.map((e, i) => (
              <li key={i}>
                {[new Date(e.at_ms).toLocaleTimeString(), e.tool, e.phase === "call" ? "호출" : "결과", SOURCE_LABEL[e.source] ?? ""]
                  .filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        ) : undefined}
      </Panel>
    </div>
  );
}
