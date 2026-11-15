// 설계 그래프 순수 로직 — React·DOM 없음. node --test src/designGraph.test.mjs 가 Node 타입 제거로 바로 읽는다.
// 다른 모듈은 import type 만 쓴다. ES2020 범위 API만 쓴다. 모든 조작은 새 객체를 돌려준다.
import type { DesignEdge, DesignGraph, DesignLoop, DesignModel, DesignNode } from "./types";

export const MODELS = ["inherit", "sonnet", "opus", "haiku"] as const;
export const LIMITS = { name: 40, task: 4000, schemaBytes: 16384, retriesMax: 5 };
export const CAPS = { nodes: 500, edges: 2000 };
export const CAP_ERROR = {
  nodes: "노드는 500개까지입니다 — 추가하지 않았습니다",
  edges: "연결은 2,000개까지입니다 — 연결하지 않았습니다",
};
export const LOOP_LIMITS = { iterMin: 1, iterMax: 50, iterDefault: 3, budgetMin: 0.01, budgetMax: 1000 };
export const ON_FAIL = ["screen", "none"] as const;
export const NODE_W = 168;
export const NODE_H = 60;
export const COL_X = 216;
export const ROW_Y = 72;

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };
type Schema = Record<string, unknown> | null;

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SCHEMA_INPUT_MAX = LIMITS.schemaBytes * 4;
const E_SCHEMA_BIG = "스키마가 16KB를 넘습니다";
const E_SCHEMA_OBJ = "스키마는 JSON 객체({ … })여야 합니다";
const E_RETRIES = "재시도는 0~5 사이 정수입니다";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const emptyGraph = (): DesignGraph => ({ version: 1, nodes: [], edges: [] });

const E_ITER = "최대 반복은 1~50 사이 정수입니다";
const E_BUDGET = "예산은 0.01~1000달러, 소수 둘째 자리까지입니다";
const isBudget = (v: number) =>
  Number.isFinite(v) && v >= LOOP_LIMITS.budgetMin && v <= LOOP_LIMITS.budgetMax && Math.round(v * 100) / 100 === v;

export const defaultLoop = (): DesignLoop => ({
  until: null,
  maxIterations: LOOP_LIMITS.iterDefault,
  budgetUsd: null,
  onFail: "screen",
});

export const setLoop = (g: DesignGraph, loop: DesignLoop | null): DesignGraph => ({
  ...g,
  nodes: [...g.nodes],
  edges: [...g.edges],
  loop,
});

export function checkMaxIterations(raw: string): Check<number> {
  if (!/^\d+$/.test(raw)) return fail(E_ITER);
  const n = Number(raw);
  return n >= LOOP_LIMITS.iterMin && n <= LOOP_LIMITS.iterMax ? { ok: true, value: n } : fail(E_ITER);
}

export function checkBudget(raw: string): Check<number | null> {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return fail(E_BUDGET);
  const n = Number(t);
  return isBudget(n) ? { ok: true, value: n } : fail(E_BUDGET);
}

export function hasPassed(schema: unknown): boolean {
  if (!isPlain(schema) || !isPlain(schema.properties)) return false;
  const p = schema.properties.passed;
  return isPlain(p) && p.type === "boolean";
}

// 받침 있는 한글 음절이면 withFinal, 아니면 without
export function josa(word: string, withFinal: string, without: string): string {
  const c = word.charCodeAt(word.length - 1);
  return word + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? withFinal : without);
}

const nameOf = (g: DesignGraph, id: string) => g.nodes.find((n) => n.id === id)?.name ?? id;

export function loopSummary(g: DesignGraph): string {
  const l = g.loop;
  if (!l) return "반복 없음 · 한 번 실행합니다";
  const until = l.until ? nameOf(g, l.until.node) : "횟수만";
  const budget = l.budgetUsd === null ? "예산 없음" : `예산 $${l.budgetUsd.toFixed(2)}`;
  return `반복 최대 ${l.maxIterations} · 종료: ${until} · ${budget}`;
}

export function addNode(g: DesignGraph): { ok: true; graph: DesignGraph; id: string } | { ok: false; error: string } {
  if (g.nodes.length >= CAPS.nodes) return { ok: false, error: CAP_ERROR.nodes };
  let max = 0;
  for (const n of g.nodes) {
    const m = /^node-(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = `node-${max + 1}`;
  const node: DesignNode = { id, name: `노드 ${max + 1}`, task: "", model: "inherit", retries: 0, schema: null };
  return { ok: true, graph: { ...g, nodes: [...g.nodes, node], edges: [...g.edges] }, id };
}

export function removeNode(g: DesignGraph, id: string): { graph: DesignGraph; removed: number; untilCleared: boolean } {
  const edges = g.edges.filter((e) => e.from !== id && e.to !== id);
  const untilCleared = g.loop?.until?.node === id;
  const graph: DesignGraph = { ...g, nodes: g.nodes.filter((n) => n.id !== id), edges };
  if (untilCleared && g.loop) graph.loop = { ...g.loop, until: null };
  return { graph, removed: g.edges.length - edges.length, untilCleared };
}

// from에서 to로 갈 수 있는가
const reaches = (edges: DesignEdge[], from: string, to: string): boolean => {
  const next = new Map<string, string[]>();
  for (const e of edges) {
    const list = next.get(e.from);
    if (list) list.push(e.to);
    else next.set(e.from, [e.to]);
  }
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === to) return true;
    for (const t of next.get(cur) ?? []) {
      if (!seen.has(t)) {
        seen.add(t);
        stack.push(t);
      }
    }
  }
  return false;
};

export type ConnectResult =
  | { ok: true; graph: DesignGraph }
  | { ok: false; reason: "self" | "dup" | "cycle" | "missing" | "limit"; error: string };

export function connect(g: DesignGraph, from: string, to: string): ConnectResult {
  if (g.edges.length >= CAPS.edges) return { ok: false, reason: "limit", error: CAP_ERROR.edges };
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
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const n of g.nodes) incoming.set(n.id, []);
  for (const e of g.edges) incoming.get(e.to)?.push(e.from);
  // 명시적 스택 후위 DFS. 순환이면 되돌아온 간선은 깊이 0으로 끊는다.
  const calc = (start: string): number => {
    const memo = depth.get(start);
    if (memo !== undefined) return memo;
    const onPath = new Set<string>([start]);
    const stack: { id: string; i: number; d: number }[] = [{ id: start, i: 0, d: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const ps = incoming.get(top.id) ?? [];
      if (top.i < ps.length) {
        const p = ps[top.i++];
        const known = depth.get(p);
        if (known !== undefined) top.d = Math.max(top.d, known + 1);
        else if (!onPath.has(p)) {
          onPath.add(p);
          stack.push({ id: p, i: 0, d: 0 });
        }
      } else {
        stack.pop();
        onPath.delete(top.id);
        depth.set(top.id, top.d);
        const parent = stack[stack.length - 1];
        if (parent) parent.d = Math.max(parent.d, top.d + 1);
      }
    }
    return depth.get(start) as number;
  };
  const columns: string[][] = [];
  for (const n of g.nodes) {
    const c = calc(n.id);
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
  if (v.nodes.length > CAPS.nodes) return bad("노드는 500개까지입니다");
  if (v.edges.length > CAPS.edges) return bad("연결은 2,000개까지입니다");
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
  if (v.loop === undefined) return { ok: true, value: g };
  if (v.loop === null) return { ok: true, value: { ...g, loop: null } };
  const lp = v.loop;
  if (!isPlain(lp)) return bad("반복 설정이 객체가 아닙니다");
  let until: DesignLoop["until"] = null;
  if (lp.until !== null) {
    if (!isPlain(lp.until)) return bad("반복 종료 조건이 올바르지 않습니다");
    const node = lp.until.node;
    if (typeof node !== "string" || node.length > 64 || !ID_RE.test(node)) return bad("반복 종료 조건 노드 id가 올바르지 않습니다");
    if (!ids.has(node)) return bad("반복 종료 조건 노드가 없습니다");
    until = { node };
  }
  const mi = lp.maxIterations;
  if (typeof mi !== "number" || !Number.isInteger(mi) || mi < LOOP_LIMITS.iterMin || mi > LOOP_LIMITS.iterMax)
    return bad("반복 최대 횟수가 올바르지 않습니다");
  const bu = lp.budgetUsd;
  if (bu !== null && !(typeof bu === "number" && isBudget(bu))) return bad("반복 예산이 올바르지 않습니다");
  const of = lp.onFail;
  if (!(ON_FAIL as readonly unknown[]).includes(of)) return bad("반복 실패 시 값이 올바르지 않습니다");
  return { ok: true, value: { ...g, loop: { until, maxIterations: mi, budgetUsd: bu, onFail: of as DesignLoop["onFail"] } } };
}
