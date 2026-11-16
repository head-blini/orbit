import type { Session } from "./types";

export const MAX_TABS = 8;
export const QUICK_EXIT_MS = 2000;

type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

// 맥에서 ⌘+1~8만 탭 0~7. 다른 수식키가 하나라도 있으면 null(claude 입력을 가로채지 않는다).
export const tabKey = (e: KeyLike, mac: boolean): number | null => {
  if (!mac || !e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const n = /^[1-8]$/.test(e.key) ? Number(e.key) : 0;
  return n ? n - 1 : null;
};

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
