// 칸 크기 조절과 터미널 글자 크기의 순수 로직. TS 전용 문법은 쓰지 않는다(node 타입 제거로 테스트).
export type Kind = "l" | "r" | "b";
export type Sizes = { l: number | null; r: number | null; b: number | null };
type Store = { getItem?(k: string): string | null; setItem?(k: string, v: string): void };
type GetStorage = () => Store;

export const LIMITS = {
  l: { min: 220, max: 480 },
  r: { min: 280, max: 560 },
  b: { min: 160, max: Infinity },
};
export const MID_MIN = 320; // 가운데 열이 남겨야 할 최소 폭
export const TOP_MIN = 160; // 그래프 행이 남겨야 할 최소 높이
export const FONT = { min: 9, max: 24, def: 13 };

const LAYOUT_KEY = "orbit.layout.v1";
const FONT_KEY = "orbit.termFont.v1";
const STEP = 16;

export function clampSize(kind: Kind, v: number, avail: number): number {
  const { min, max } = LIMITS[kind];
  return Math.max(min, Math.min(v, max, avail));
}

function validSize(kind: Kind, v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const { min, max } = LIMITS[kind];
  return v >= min && v <= max ? v : null;
}

export function loadSizes(getStorage: GetStorage): Sizes {
  const none: Sizes = { l: null, r: null, b: null };
  try {
    const raw = getStorage().getItem!(LAYOUT_KEY);
    if (raw == null) return none;
    const o = JSON.parse(raw);
    if (o === null || typeof o !== "object") return none;
    return { l: validSize("l", o.l), r: validSize("r", o.r), b: validSize("b", o.b) };
  } catch {
    return none;
  }
}

export function saveSizes(getStorage: GetStorage, s: Sizes): void {
  try {
    getStorage().setItem!(LAYOUT_KEY, JSON.stringify({ l: s.l, r: s.r, b: s.b }));
  } catch {
    // 편의 기능이라 실패해도 앱은 돈다
  }
}

export function gridStyle(s: Sizes): { gridTemplateColumns: string; gridTemplateRows: string } {
  const px = (v: number | null, d: string) => (v === null ? d : `${v}px`);
  return {
    gridTemplateColumns: `${px(s.l, "minmax(220px, 1fr)")} minmax(0, 2.6fr) ${px(s.r, "minmax(280px, 1.2fr)")}`,
    gridTemplateRows: `auto minmax(0, 3fr) ${px(s.b, "minmax(0, 2fr)")}`,
  };
}

// 경계가 화살표 방향으로 움직인다: L은 →가 커짐, R은 ←가 커짐, B는 ↑가 커짐.
export function keyStep(kind: Kind, key: string, cur: number): number | null {
  const { min, max } = LIMITS[kind];
  if (key === "Home") return min;
  if (key === "End") return max;
  const grow = kind === "l" ? "ArrowRight" : kind === "r" ? "ArrowLeft" : "ArrowUp";
  const shrink = kind === "l" ? "ArrowLeft" : kind === "r" ? "ArrowRight" : "ArrowDown";
  if (key === grow) return cur + STEP;
  if (key === shrink) return cur - STEP;
  return null;
}

export function fontStep(action: "inc" | "dec" | "reset", cur: number): number {
  if (action === "reset") return FONT.def;
  const n = cur + (action === "inc" ? 1 : -1);
  return Math.max(FONT.min, Math.min(FONT.max, n));
}

export function loadFont(getStorage: GetStorage): number {
  try {
    const raw = getStorage().getItem!(FONT_KEY);
    if (raw == null || !/^\d+$/.test(raw)) return FONT.def;
    const n = Number(raw);
    return n >= FONT.min && n <= FONT.max ? n : FONT.def;
  } catch {
    return FONT.def;
  }
}

export function saveFont(getStorage: GetStorage, n: number): void {
  try {
    getStorage().setItem!(FONT_KEY, String(n));
  } catch {
    // 편의 기능이라 실패해도 앱은 돈다
  }
}
