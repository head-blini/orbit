// 그래프 저장 순수 로직 — React·DOM 없음. node --test src/graphFile.test.mjs 가 Node 타입 제거로 바로 읽는다.
// 불러온 값은 parseGraph 를 통과한 새 객체만 돌려주고, 기존 객체에 병합하지 않는다.
import { LOOP_LIMITS, parseGraph, type Check } from "./designGraph.ts";
import type { DesignGraph, DesignLoop, Opened } from "./types.ts";

export const GRAPH_LIMITS = { graphBytes: 25165824, fileBytes: 26214400, count: 100 }; // Rust graphs.rs 상수와 같은 값
export const GRAPH_CAP_ERROR = "그래프는 100개까지입니다 — 저장하지 않았습니다";

const E_UNREAD = "읽을 수 없는 파일입니다";
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function checkGraphName(s: string): Check<string> {
  const t = s.trim();
  if (t === "") return fail("이름을 입력하세요");
  if (t.length > 40) return fail("이름은 40자까지입니다");
  if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(t)) return fail("이름에 쓸 수 없는 문자가 있습니다");
  return { ok: true, value: t };
}

export function graphKey(g: DesignGraph): string {
  try {
    return JSON.stringify(g);
  } catch {
    return "";
  }
}

export function serializeGraph(g: DesignGraph): Check<string> {
  const p = parseGraph(g);
  if (!p.ok) return p;
  let s: string;
  try {
    s = JSON.stringify(p.value);
  } catch {
    return fail("그래프를 직렬화할 수 없습니다");
  }
  // 도달 불가 방어 코드: 최대 그래프 ≈19.7 MiB < 24 MiB. 실제 상한은 Rust가 막는다
  if (new TextEncoder().encode(s).length > GRAPH_LIMITS.graphBytes) return fail("너무 큽니다");
  return { ok: true, value: s };
}

export function parseGraphFile(raw: unknown): Check<{ name: string; savedAt: number; graph: DesignGraph }> {
  if (typeof raw !== "string") return fail(E_UNREAD);
  if (raw.length > GRAPH_LIMITS.fileBytes) return fail("너무 큽니다");
  let env: unknown;
  try {
    env = JSON.parse(raw);
  } catch {
    return fail(E_UNREAD);
  }
  if (!isPlain(env)) return fail(E_UNREAD);
  if (env.format !== 1) return fail("이 버전에서 열 수 없습니다");
  if (typeof env.name !== "string") return fail(E_UNREAD);
  const name = checkGraphName(env.name);
  if (!name.ok) return fail(E_UNREAD);
  if (typeof env.savedAt !== "number" || !Number.isFinite(env.savedAt)) return fail(E_UNREAD);
  const p = parseGraph(env.graph);
  if (!p.ok) return p;
  return { ok: true, value: { name: name.value, savedAt: env.savedAt, graph: p.value } };
}

// key: 호출자가 이미 구한 graphKey(g). 넘기면 전체 stringify를 다시 하지 않는다
export function isDirty(opened: Opened | null, g: DesignGraph, key?: string): boolean {
  if (!opened) return !(g.nodes.length === 0 && g.edges.length === 0 && !g.loop);
  if (opened.id === null) return true;
  const k = key ?? graphKey(g);
  return k === "" || k !== opened.base;
}

export function saveStatus(opened: Opened | null, g: DesignGraph, key?: string): string {
  if (!opened) return isDirty(null, g) ? "이름 없음 · 저장 안 됨" : "이름 없음";
  if (opened.id === null) return `${opened.name} · 저장 안 됨`;
  return `${opened.name} · ${isDirty(opened, g, key) ? "저장 안 한 변경 있음" : "저장됨"}`;
}

export function loopDrafts(l: DesignLoop | null): { max: string; bud: string } {
  return { max: String(l?.maxIterations ?? LOOP_LIMITS.iterDefault), bud: l?.budgetUsd == null ? "" : String(l.budgetUsd) };
}
