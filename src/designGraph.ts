// 설계 그래프 순수 로직 — React·DOM 없음. node --test src/designGraph.test.mjs 가 Node 타입 제거로 바로 읽는다.
// 다른 모듈은 import type 만 쓴다. ES2020 범위 API만 쓴다. 모든 조작은 새 객체를 돌려준다.
import type { DesignEdge, DesignGraph, DesignModel, DesignNode } from "./types";

export const MODELS = ["inherit", "sonnet", "opus", "haiku"] as const;
export const LIMITS = { name: 40, task: 4000, schemaBytes: 16384, retriesMax: 5 };
export const NODE_W = 168;
export const NODE_H = 60;
export const COL_X = 216;
export const ROW_Y = 72;

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };
type Schema = Record<string, unknown> | null;

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SCHEMA_INPUT_MAX = LIMITS.schemaBytes * 4;
const E_SCHEMA_BIG = "스키마가 16KB를 넘습니다";
const E_SCHEMA_OBJ = "스키마는 JSON 객체({ … })여야 합니다";
const E_RETRIES = "재시도는 0~5 사이 정수입니다";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const emptyGraph = (): DesignGraph => ({ version: 1, nodes: [], edges: [] });

const nameOf = (g: DesignGraph, id: string) => g.nodes.find((n) => n.id === id)?.name ?? id;

export function addNode(g: DesignGraph): { graph: DesignGraph; id: string } {
  let max = 0;
  for (const n of g.nodes) {
    const m = /^node-(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = `node-${max + 1}`;
  const node: DesignNode = { id, name: `노드 ${max + 1}`, task: "", model: "inherit", retries: 0, schema: null };
  return { graph: { ...g, nodes: [...g.nodes, node], edges: [...g.edges] }, id };
}

export function removeNode(g: DesignGraph, id: string): { graph: DesignGraph; removed: number } {
  const edges = g.edges.filter((e) => e.from !== id && e.to !== id);
  return {
    graph: { ...g, nodes: g.nodes.filter((n) => n.id !== id), edges },
    removed: g.edges.length - edges.length,
  };
}

// from에서 to로 갈 수 있는가
const reaches = (edges: DesignEdge[], from: string, to: string): boolean => {
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === to) return true;
    for (const e of edges) {
      if (e.from === cur && !seen.has(e.to)) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return false;
};

export type ConnectResult =
  | { ok: true; graph: DesignGraph }
  | { ok: false; reason: "self" | "dup" | "cycle" | "missing"; error: string };

export function connect(g: DesignGraph, from: string, to: string): ConnectResult {
  const has = (id: string) => g.nodes.some((n) => n.id === id);
  if (!has(from) || !has(to)) return { ok: false, reason: "missing", error: "없는 노드입니다" };
  if (from === to) return { ok: false, reason: "self", error: "자기 자신에게는 연결할 수 없습니다" };
  const label = `${nameOf(g, from)} → ${nameOf(g, to)}`;
  if (g.edges.some((e) => e.from === from && e.to === to))
    return { ok: false, reason: "dup", error: `이미 있는 연결입니다: ${label}` };
  if (reaches(g.edges, to, from))
    return { ok: false, reason: "cycle", error: `순환이 생겨 연결할 수 없습니다: ${label}` };
  return { ok: true, graph: { ...g, nodes: [...g.nodes], edges: [...g.edges, { from, to }] } };
}

export const disconnect = (g: DesignGraph, from: string, to: string): DesignGraph => ({
  ...g,
  nodes: [...g.nodes],
  edges: g.edges.filter((e) => !(e.from === from && e.to === to)),
});

export const updateNode = (g: DesignGraph, id: string, patch: Partial<Omit<DesignNode, "id">>): DesignGraph => ({
  ...g,
  nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  edges: [...g.edges],
});

export function checkName(s: string): Check<string> {
  if (s.trim() === "") return fail("이름을 입력하세요");
  if (s.length > LIMITS.name) return fail("이름은 40자까지입니다");
  return { ok: true, value: s };
}

export function checkTask(s: string): Check<string> {
  if (s.length > LIMITS.task) return fail("할 일은 4000자까지입니다");
  return { ok: true, value: s };
}

export function checkModel(v: unknown): Check<DesignModel> {
  return (MODELS as readonly unknown[]).includes(v) ? { ok: true, value: v as DesignModel } : fail("모델을 고르세요");
}

export function checkRetries(raw: string): Check<number> {
  if (!/^\d+$/.test(raw)) return fail(E_RETRIES);
  const n = Number(raw);
  return n <= LIMITS.retriesMax ? { ok: true, value: n } : fail(E_RETRIES);
}

// 파싱된 값 검사: 일반 객체 + 압축 직렬화 UTF-8 바이트 상한. checkSchema·parseGraph 공용.
function checkSchemaValue(v: unknown): Check<Record<string, unknown>> {
  if (!isPlain(v)) return fail(E_SCHEMA_OBJ);
  if (new TextEncoder().encode(JSON.stringify(v)).length > LIMITS.schemaBytes) return fail(E_SCHEMA_BIG);
  return { ok: true, value: v };
}

export function checkSchema(text: string): Check<Schema> {
  if (text.length > SCHEMA_INPUT_MAX) return fail(E_SCHEMA_BIG);
  if (text.trim() === "") return { ok: true, value: null };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return fail("JSON으로 읽을 수 없습니다 — 반영하지 않았습니다");
  }
  return checkSchemaValue(v);
}

export type Layout = {
  columns: string[][];
  at: Record<string, { col: number; row: number; x: number; y: number }>;
  width: number;
  height: number;
  edges: { from: string; to: string; d: string }[];
};

export function layout(g: DesignGraph): Layout {
  // 열 = 들어오는 간선 기준 최장 경로 깊이 (그래프는 비순환)
  const depth: Record<string, number> = {};
  const incoming: Record<string, string[]> = {};
  for (const n of g.nodes) incoming[n.id] = [];
  for (const e of g.edges) if (incoming[e.to]) incoming[e.to].push(e.from);
  const calc = (id: string, guard: Set<string>): number => {
    if (id in depth) return depth[id];
    if (guard.has(id)) return 0; // 방어: 순환이면 끊는다
    guard.add(id);
    let d = 0;
    for (const p of incoming[id] ?? []) d = Math.max(d, calc(p, guard) + 1);
    guard.delete(id);
    depth[id] = d;
    return d;
  };
  const columns: string[][] = [];
  for (const n of g.nodes) {
    const c = calc(n.id, new Set());
    while (columns.length <= c) columns.push([]);
    columns[c].push(n.id);
  }
  const at: Layout["at"] = {};
  columns.forEach((ids, col) =>
    ids.forEach((id, row) => {
      at[id] = { col, row, x: col * COL_X, y: row * ROW_Y };
    }),
  );
  const rows = columns.reduce((m, c) => Math.max(m, c.length), 0);
  const edges = g.edges
    .filter((e) => at[e.from] && at[e.to])
    .map((e) => {
      const a = at[e.from];
      const b = at[e.to];
      const bx = b.x - 12 - 8 * (b.row % 4);
      return { from: e.from, to: e.to, d: `M${a.x + NODE_W} ${a.y + 30} H${bx} V${b.y + 30} H${b.x}` };
    });
  return {
    columns,
    at,
    width: columns.length ? columns.length * COL_X - 48 : 0,
    height: rows ? rows * ROW_Y - 12 : 0,
    edges,
  };
}

export function step(columns: string[][], id: string, key: string): string | null {
  let col = -1;
  let row = -1;
  columns.forEach((ids, c) => {
    const r = ids.indexOf(id);
    if (r >= 0) {
      col = c;
      row = r;
    }
  });
  if (col < 0) return null;
  if (key === "ArrowUp") return row > 0 ? columns[col][row - 1] : null;
  if (key === "ArrowDown") return row < columns[col].length - 1 ? columns[col][row + 1] : null;
  const nc = key === "ArrowLeft" ? col - 1 : key === "ArrowRight" ? col + 1 : -1;
  if (nc < 0 || nc >= columns.length) return null;
  const ids = columns[nc];
  return ids[Math.min(row, ids.length - 1)] ?? null;
}

export function parseGraph(v: unknown): Check<DesignGraph> {
  const bad = (why: string) => fail(`설계 그래프를 읽을 수 없습니다: ${why}`);
  if (!isPlain(v)) return bad("객체가 아닙니다");
  if (v.version !== 1) return bad("지원하지 않는 version입니다");
  if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) return bad("nodes·edges가 배열이 아닙니다");
  const nodes: DesignNode[] = [];
  const ids = new Set<string>();
  for (const raw of v.nodes as unknown[]) {
    if (!isPlain(raw)) return bad("노드가 객체가 아닙니다");
    const { id, name, task, model, retries, schema } = raw;
    if (typeof id !== "string" || id.length > 64 || !ID_RE.test(id)) return bad("노드 id가 올바르지 않습니다");
    if (ids.has(id)) return bad("노드 id가 겹칩니다");
    if (typeof name !== "string" || !checkName(name).ok) return bad("노드 이름이 올바르지 않습니다");
    if (typeof task !== "string" || !checkTask(task).ok) return bad("노드 할 일이 올바르지 않습니다");
    const m = checkModel(model);
    if (!m.ok) return bad("노드 모델이 올바르지 않습니다");
    if (typeof retries !== "number" || !Number.isInteger(retries) || retries < 0 || retries > LIMITS.retriesMax)
      return bad("노드 재시도가 올바르지 않습니다");
    let s: Schema = null;
    if (schema !== null) {
      const sv = checkSchemaValue(schema);
      if (!sv.ok) return bad(sv.error);
      s = sv.value;
    }
    ids.add(id);
    nodes.push({ id, name, task, model: m.value, retries, schema: s });
  }
  let g: DesignGraph = { version: 1, nodes, edges: [] };
  for (const raw of v.edges as unknown[]) {
    if (!isPlain(raw) || typeof raw.from !== "string" || typeof raw.to !== "string") return bad("간선이 올바르지 않습니다");
    const r = connect(g, raw.from, raw.to);
    if (!r.ok) return bad(`간선이 올바르지 않습니다(${r.reason})`);
    g = r.graph;
  }
  return { ok: true, value: g };
}
