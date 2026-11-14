import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type Status = {
  listen_addr: string | null;
  server_error: string | null;
  settings_path: string;
  installed: boolean | null;
  settings_error: string | null;
};

type HookEvent = { id: number; at: string; name: string; session: string; tool: string };

const MAX_EVENTS = 200;

// 페이로드는 신뢰할 수 없는 입력: 문자열일 때만 쓰고 텍스트로만 렌더한다.
const str = (v: unknown) => (typeof v === "string" ? v : "");

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
  const [events, setEvents] = useState<HookEvent[]>([]);
  const nextId = useRef(0);

  const refresh = useCallback(() => {
    invoke<Status>("get_status")
      .then((s) => { setStatus(s); setStatusError(null); })
      .catch((e) => setStatusError(String(e)));
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<unknown>("hook-event", (e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const ev: HookEvent = {
        id: nextId.current++,
        at: new Date().toLocaleTimeString(),
        name: str(p.hook_event_name),
        session: str(p.session_id).slice(0, 8),
        tool: str(p.tool_name),
      };
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
    }).then((fn) => (cancelled ? fn() : (unlisten = fn)));
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const run = (cmd: "install_hooks" | "uninstall_hooks") => {
    invoke<string | null>(cmd)
      .then((backup) =>
        setResult(
          backup
            ? `성공 · 백업: ${backup}`
            : cmd === "install_hooks" ? "성공 (새 파일)" : "제거할 항목 없음",
        ),
      )
      .catch((e) => setResult(`오류: ${String(e)}`))
      .finally(refresh);
  };

  const serverText = statusError
    ? `상태를 읽지 못했습니다: ${statusError}`
    : !status ? "확인 중…"
    : status.listen_addr ? `${status.listen_addr}에서 듣는 중`
    : `훅 서버 시작 실패: ${status.server_error ?? "알 수 없음"}`;

  const installText = !status ? ""
    : status.settings_error ? `확인 실패: ${status.settings_error}`
    : status.installed ? "설치됨" : "설치 안 됨";

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Orbit</h1>
        <span className="status" role="status">{serverText}</span>
      </header>
      <Panel area="sessions" title="세션" hint="아직 세션이 없습니다" />
      <Panel area="graph" title="에이전트 그래프" hint="세션을 선택하면 그래프가 표시됩니다" />
      <Panel area="detail" title="상세 · 하네스" hint="">
        <p>대상 경로: <code>{status?.settings_path ?? "…"}</code></p>
        <p>훅 상태: {installText}</p>
        <div className="actions">
          <button type="button" onClick={() => run("install_hooks")}>설치</button>
          <button type="button" onClick={() => run("uninstall_hooks")}>제거</button>
        </div>
        <p role="status" aria-live="polite">{result}</p>
        <p className="empty">토큰이 settings 파일에 평문으로 저장됩니다.</p>
        <p className="empty">이벤트가 오지 않으면 settings의 allowedHttpHookUrls·disableAllHooks를 확인하세요.</p>
      </Panel>
      <Panel area="timeline" title="타임라인" hint="도구 호출이 시간순으로 표시됩니다">
        {events.length > 0 ? (
          <ul className="events">
            {events.map((e) => (
              <li key={e.id}>{[e.at, e.name, e.session, e.tool].filter(Boolean).join(" · ")}</li>
            ))}
          </ul>
        ) : undefined}
      </Panel>
    </div>
  );
}
