import type { Session, WaitReason } from "./types";

export const MAX_TABS = 8;
export const QUICK_EXIT_MS = 2000;

type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

// 맥에서 ⌘+1~8만 탭 0~7. 다른 수식키가 하나라도 있으면 null(claude 입력을 가로채지 않는다).
export const tabKey = (e: KeyLike, mac: boolean): number | null => {
  if (!mac || !e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const n = /^[1-8]$/.test(e.key) ? Number(e.key) : 0;
  return n ? n - 1 : null;
};

// 맥에서 ⌘+J만(⌃J는 claude 줄바꿈이라 가로채지 않는다). 한글 자판은 key가 ㅓ라 code도 본다.
export const nextKey = (e: KeyLike & { code?: string }, mac: boolean): boolean =>
  mac && e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (e.code === "KeyJ" || e.key.toLowerCase() === "j");

export const tabSessions = (list: Session[], tab: number): Session[] => list.filter((s) => s.tab === tab);

// 그 탭 세션 중 last_ms가 가장 최신인 id
export const tabSid = (list: Session[], tab: number): string | null =>
  tabSessions(list, tab).reduce<Session | null>((a, s) => (a && a.last_ms >= s.last_ms ? a : s), null)?.id ?? null;

// 1~0xffffffff, used와 겹치면 다시 뽑는다
export const newTabId = (used: ReadonlySet<number>, rand: () => number): number => {
  for (;;) {
    const id = Math.floor(rand() * 0xffffffff) + 1;
    if (id >= 1 && id <= 0xffffffff && !used.has(id)) return id;
  }
};

// 탭 closing을 닫은 뒤의 active. 오른쪽 이웃, 없으면 왼쪽, 없으면 null. 다른 탭을 닫으면 active 유지.
export const nextActive = (ids: number[], closing: number, active: number | null): number | null => {
  if (active !== closing) return active;
  const i = ids.indexOf(closing);
  return ids[i + 1] ?? ids[i - 1] ?? null;
};

export const canResume = (s: Pick<Session, "source">): boolean => s.source !== "hook";

export const quickExit = (startedAt: number, now: number): boolean => now - startedAt <= QUICK_EXIT_MS;

export type Phase = "starting" | "running" | "stopping" | "ended";
export type LiveTab = { id: number; name: string; phase: Phase; wait: boolean; cwd: string | null };
export type TermCtl = {
  pick: (id: number | null) => void;
  close: (id: number, from: "row" | "x") => void;
  jump: (n: number, err?: boolean) => void;
  send: (id: number, text: string) => boolean; // 실행 중 터미널의 claude 입력 줄에 text를 넣고 Enter. 보냈으면 true
  settle: () => void; // App이 줄을 다시 그린 뒤 부른다: 스크롤·포커스 이동
};

export const MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
export const SAME = "이 폴더는 이미 터미널에서 실행 중입니다 — 실행 중 줄을 고르세요";
export const rowId = (tab: number): string => `live-${tab}`;

// 실행 중 묶음 = views 순서(각자의 지금 세션), 지난 묶음 = 어느 터미널의 지금 세션도 아닌 것(list 순서)
export const splitSessions = (
  views: LiveTab[],
  list: Session[],
): { live: { view: LiveTab; sid: string | null }[]; past: Session[] } => {
  const live = views.map((view) => ({ view, sid: tabSid(list, view.id) }));
  const sids = new Set(live.map((x) => x.sid));
  return { live, past: list.filter((s) => !sids.has(s.id)) };
};

// /clear로 밀려난 옛 세션: 열린 터미널을 가리키지만 그 터미널의 지금 세션이 아님
export const pushedOut = (s: Session, views: LiveTab[], liveSids: ReadonlySet<string>): boolean =>
  s.tab !== null && views.some((v) => v.id === s.tab) && !liveSids.has(s.id);

const trimEnd = (p: string): string => p.replace(/[/\\]+$/, "");

// 같은 폴더에서 ended 아닌 터미널 id
export const folderTab = (views: LiveTab[], list: Session[], cwd: string | null): number | null => {
  if (cwd === null) return null;
  const want = trimEnd(cwd);
  for (const v of views) {
    if (v.phase === "ended") continue;
    const sid = tabSid(list, v.id);
    const c = v.cwd ?? list.find((s) => s.id === sid)?.cwd ?? null;
    if (c !== null && trimEnd(c) === want) return v.id;
  }
  return null;
};

export type Sym = "…" | "—" | "!" | "working" | "error" | "stalled";

export const attention = (syms: (Sym | null)[]): { wait: number; error: number } => ({
  wait: syms.filter((x) => x === "!").length,
  error: syms.filter((x) => x === "error").length,
});

// 대기(!)가 있으면 대기들, 없으면 에러들 중에서 active 다음부터 순환해 첫 index
export const nextAttention = (syms: (Sym | null)[], activeIdx: number | null): number | null => {
  const want = syms.includes("!") ? "!" : syms.includes("error") ? "error" : null;
  if (want === null) return null;
  const n = syms.length;
  const from = activeIdx === null ? 0 : activeIdx + 1;
  for (let i = 0; i < n; i++) {
    const j = (from + i) % n;
    if (syms[j] === want) return j;
  }
  return null;
};

export const waitText = (w: WaitReason | null | undefined): string => {
  if (w?.kind === "permission") return w.tool ? `권한 요청: ${w.tool}` : "권한 요청";
  if (w?.kind === "question") return "질문에 답을 기다림";
  return "답을 기다리는 중";
};

export const ctxShort = (n: number): string =>
  n < 1000 ? `${n}` : n < 999_500 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`;

// 지난 세션을 cwd별로. 순서는 처음 나온 순서
export const groupPast = (past: Session[]): { key: string; cwd: string | null; items: Session[] }[] => {
  const out: { key: string; cwd: string | null; items: Session[] }[] = [];
  const at = new Map<string, number>();
  for (const s of past) {
    const key = s.cwd ? "p:" + trimEnd(s.cwd) : "";
    let i = at.get(key);
    if (i === undefined) { i = out.length; at.set(key, i); out.push({ key, cwd: s.cwd || null, items: [] }); }
    out[i].items.push(s);
  }
  return out;
};

// shownState와 같은 판정(types.ts 값 import 불가)
export const liveRow = (
  v: LiveTab,
  s: Session | null,
): { sym: Sym | null; status: string; sr: string; title: string; time: boolean; ctx: string | null; ctxSr: string } => {
  let sym: Sym | null = null;
  let status: string;
  let sr: string;
  let tt: string;
  if (v.phase === "starting") {
    sym = "…"; status = "시작하는 중…"; sr = ", 시작하는 중"; tt = "시작하는 중";
  } else if (v.phase === "stopping") {
    sym = "…"; status = "종료하는 중…"; sr = ", 종료하는 중"; tt = "종료하는 중";
  } else if (v.phase === "ended") {
    sym = "—"; status = "종료됨"; sr = ", 종료됨"; tt = "종료됨";
  } else if (v.wait) {
    sym = "!"; status = waitText(s?.wait); sr = ", " + status; tt = status;
  } else if (!s) {
    status = "실행 중 · 세션 연결 전"; sr = ", 실행 중, 세션 연결 전"; tt = "세션 연결 전";
  } else {
    status = "실행 중"; sr = ", 터미널 실행 중"; tt = "실행 중";
  }
  if (sym === null && v.phase === "running" && !v.wait && s) {
    const st = s.stalled ? "stalled" : s.state;
    if (st === "working" || st === "error" || st === "stalled") sym = st;
  }
  const n = s?.ctx_tokens;
  const ok = v.phase === "running" && typeof n === "number" && Number.isFinite(n) && n >= 0;
  return {
    ctx: ok ? ctxShort(n) : null,
    ctxSr: ok ? `, 컨텍스트 ${n.toLocaleString("ko-KR")} 토큰` : "",
    sym, status, sr, title: `${v.name} — ${tt}`,
    time: s !== null && v.phase !== "starting" && v.phase !== "stopping",
  };
};

// 로드맵 만들기 버튼이 보내는 고정 문장(한 줄, 사용자·로그 문자열 없음)
export const ASK_ROADMAP =
  "이 프로젝트 폴더 맨 위에 ROADMAP.md를 만들어 줘. 형식은 '## 묶음 이름' 줄 아래에 '- [ ] 할 일', 끝난 일은 '- [x] 할 일'만 쓰고, 지금 코드와 문서를 보고 채워 줘.";

// 로드맵 만들기 버튼: 켜면 null, 끄면 이유
export const makeOff = (tab: LiveTab | undefined): string | null => {
  if (!tab || tab.phase !== "running") return "실행 중인 터미널을 고르면 켜집니다";
  if (tab.wait) return "claude가 답을 기다리는 중이라 보낼 수 없습니다";
  return null;
};
