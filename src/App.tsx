import "./App.css";

function Panel({ area, title, hint }: { area: string; title: string; hint: string }) {
  return (
    <section className="panel" style={{ gridArea: area }} aria-label={title}>
      <h2>{title}</h2>
      <p className="empty">{hint}</p>
    </section>
  );
}

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <h1>Orbit</h1>
        <span className="status">훅 서버 미연결</span>
      </header>
      <Panel area="sessions" title="세션" hint="아직 세션이 없습니다" />
      <Panel area="graph" title="에이전트 그래프" hint="세션을 선택하면 그래프가 표시됩니다" />
      <Panel area="detail" title="상세 · 하네스" hint="노드를 선택하세요" />
      <Panel area="timeline" title="타임라인" hint="도구 호출이 시간순으로 표시됩니다" />
    </div>
  );
}
