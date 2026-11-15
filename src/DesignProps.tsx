import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./DesignProps.css";
import GraphSettings from "./GraphSettings";
import type { Msg } from "./DesignView";
import type { DesignGraph, Opened } from "./types";
import { LIMITS, MODELS, SCHEMA_INPUT_MAX, checkModel, checkName, checkRetries, checkSchema, checkTask, disconnect, hasPassed, updateNode } from "./designGraph";

type Props = {
  graph: DesignGraph;
  selected: string | null;
  onChange: (g: DesignGraph) => void;
  say: (text: string, err?: boolean) => void;
  msg: Msg;
  opened: Opened | null;
  onOpened: (o: Opened | null) => void;
};
type Field = "name" | "task" | "retries" | "schema";
type Errs = Partial<Record<Field, string>>;

function ErrLine({ id, text }: { id: string; text: string }) {
  return (
    <p className="f-err" id={id}>
      <span className="px" aria-hidden="true">✕</span>
      {text}
    </p>
  );
}

export default function DesignProps({ graph, selected, onChange, say, msg, opened, onOpened }: Props) {
  const node = selected ? graph.nodes.find((n) => n.id === selected) : undefined;
  // 초안은 지역 상태. App이 key={선택 id}로 다시 마운트하므로 노드를 바꾸면 버려진다.
  const [name, setName] = useState(node?.name ?? "");
  const [task, setTask] = useState(node?.task ?? "");
  const [retries, setRetries] = useState(String(node?.retries ?? 0));
  const [schema, setSchema] = useState(node?.schema ? JSON.stringify(node.schema, null, 2) : "");
  const [errs, setErrs] = useState<Errs>({});
  const [announce, setAnnounce] = useState("");
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const linksRef = useRef<HTMLUListElement>(null);
  const annTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(annTimer.current), []);

  // 끊기 뒤 포커스: 줄이 사라진 다음 렌더에서 다음 → 이전 끊기 → 이름
  useEffect(() => {
    if (focusAt === null) return;
    const btns = linksRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [];
    const t = btns[focusAt] ?? btns[focusAt - 1] ?? document.getElementById("dp-name");
    t?.focus();
    setFocusAt(null);
  }, [focusAt, graph]);

  if (!node) return <GraphSettings graph={graph} onChange={onChange} say={say} msg={msg} opened={opened} onOpened={onOpened} />;

  const setErr = (f: Field, e: string | undefined) => {
    setErrs((p) => ({ ...p, [f]: e }));
    if (e && e !== errs[f]) { setAnnounce(""); window.clearTimeout(annTimer.current); annTimer.current = window.setTimeout(() => setAnnounce(e), 50); } // 같은 오류도 다시 낭독되게 비웠다가 넣는다
  };
  const apply = (f: Field, r: { ok: true } | { ok: false; error: string }, patch: () => DesignGraph) => {
    if (r.ok) {
      setErr(f, undefined);
      onChange(patch());
    } else setErr(f, r.error);
  };

  const onName = (v: string) => {
    setName(v);
    const r = checkName(v);
    apply("name", r, () => updateNode(graph, node.id, { name: v }));
  };
  const onTask = (v: string) => {
    setTask(v);
    const r = checkTask(v);
    apply("task", r, () => updateNode(graph, node.id, { task: v }));
  };
  const onModel = (v: string) => {
    const r = checkModel(v);
    if (r.ok) onChange(updateNode(graph, node.id, { model: r.value }));
  };
  const onRetries = (v: string) => {
    setRetries(v);
    const r = checkRetries(v);
    apply("retries", r, () => updateNode(graph, node.id, { retries: r.ok ? r.value : 0 }));
  };
  const commitSchema = (v: string) => {
    const r = checkSchema(v);
    apply("schema", r, () => updateNode(graph, node.id, { schema: r.ok ? r.value : null }));
  };

  const nm = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const links = [
    ...graph.edges.filter((e) => e.to === node.id).map((e) => ({ dir: "←", sr: "들어옴: ", other: e.from, from: e.from, to: e.to })),
    ...graph.edges.filter((e) => e.from === node.id).map((e) => ({ dir: "→", sr: "나감: ", other: e.to, from: e.from, to: e.to })),
  ];

  const isUntil = graph.loop?.until?.node === node.id;
  const schemaDesc = [errs.schema && "dp-schema-err", isUntil && "dp-schema-loop", isUntil && !hasPassed(node.schema) && "dp-schema-w"].filter(Boolean).join(" ");
  const field = (f: Field, id: string, label: string, control: ReactNode) => (
    <div className="f">
      <label htmlFor={id}>{label}</label>
      {control}
      {errs[f] && <ErrLine id={`${id}-err`} text={errs[f] as string} />}
    </div>
  );
  const inv = (f: Field, id: string) => ({
    "aria-invalid": errs[f] ? (true as const) : undefined,
    "aria-describedby": errs[f] ? `${id}-err` : undefined,
  });

  return (
    <div
      className="props"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          document.getElementById(`dn-${node.id}`)?.focus();
        }
      }}
    >
      {field("name", "dp-name", "이름",
        <input id="dp-name" value={name} maxLength={LIMITS.name} onChange={(e) => onName(e.target.value)} {...inv("name", "dp-name")} />)}
      {field("task", "dp-task", "할 일",
        <textarea id="dp-task" rows={3} value={task} maxLength={LIMITS.task} onChange={(e) => onTask(e.target.value)} {...inv("task", "dp-task")} />)}
      <div className="f-row">
        <div className="f">
          <label htmlFor="dp-model">모델</label>
          <span className="f-sel">
            <select id="dp-model" value={node.model} onChange={(e) => onModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m} value={m}>{m === "inherit" ? "inherit (기본)" : m}</option>
              ))}
            </select>
          </span>
        </div>
        <div className="f">
          <label htmlFor="dp-retries">재시도</label>
          <input id="dp-retries" type="number" min={0} max={LIMITS.retriesMax} step={1} value={retries}
            onChange={(e) => onRetries(e.target.value)} {...inv("retries", "dp-retries")} />
        </div>
      </div>
      {errs.retries && <ErrLine id="dp-retries-err" text={errs.retries} />}
      <div className="f">
        <label htmlFor="dp-schema">스키마</label>
        <textarea id="dp-schema" className="mono" rows={4} value={schema} maxLength={SCHEMA_INPUT_MAX}
          placeholder="비워 두면 스키마 없음"
          onChange={(e) => {
            setSchema(e.target.value);
            if (errs.schema) commitSchema(e.target.value); // 오류가 떠 있는 동안만 입력마다 재검사
          }}
          onBlur={(e) => commitSchema(e.target.value)}
          aria-invalid={errs.schema ? true : undefined}
          aria-describedby={schemaDesc || undefined} />
        {errs.schema && <ErrLine id="dp-schema-err" text={errs.schema} />}
        {isUntil && <p className="note" id="dp-schema-loop">반복 종료 조건 노드 · 출력 passed가 true면 반복을 끝냅니다</p>}
        {isUntil && !hasPassed(node.schema) && <p className="f-warn" id="dp-schema-w">스키마에 boolean passed가 없습니다</p>}
      </div>
      <div className="f">
        <span className="lb">연결</span>
        {links.length === 0 ? (
          <p className="note">연결 없음 — 노드를 고르고 연결을 누릅니다</p>
        ) : (
          <ul className="links" ref={linksRef}>
            {links.map((l, i) => (
              <li key={`${l.from}>${l.to}`}>
                <span className="dir" aria-hidden="true">{l.dir}</span>
                <span className="nm"><span className="sr">{l.sr}</span>{nm(l.other)}</span>
                <button type="button" className="btn" aria-label={`끊기: ${nm(l.from)} → ${nm(l.to)}`}
                  onClick={() => {
                    onChange(disconnect(graph, l.from, l.to));
                    say(`${nm(l.from)} → ${nm(l.to)} 연결을 끊었습니다`);
                    setFocusAt(i);
                  }}>끊기</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="note">id: {node.id} · 그래프로 돌아가기: Esc · 그래프 설정: Esc 한 번 더</p>
      <p className="sr" role="status">{announce}</p>
    </div>
  );
}
