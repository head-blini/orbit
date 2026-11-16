import type { Session } from "./types";

// 이 터미널을 시작한 뒤(since 이후) 대기로 바뀐 세션이 있는가. 목록은 Orbit 세션만 온다(T1).
// stale: 시작할 때 이미 waiting이던 세션 id. 대기가 풀리기 전까지는 이 터미널의 대기로 보지 않는다.
export const termWaiting = (sessions: Session[], since: number | null, stale: ReadonlySet<string> = new Set()): boolean =>
  since !== null && sessions.some((s) => s.state === "waiting" && s.last_ms >= since && !stale.has(s.id));

// 시작 때 waiting이던 세션 id 집합. 이미 있던 stale 중 아직 waiting인 것은 유지한다.
export const staleWaiting = (sessions: Session[]): Set<string> =>
  new Set(sessions.filter((s) => s.state === "waiting").map((s) => s.id));

// 대기가 풀린 세션은 stale에서 뺀다(그 뒤의 새 대기는 보인다).
export const pruneStale = (stale: Set<string>, sessions: Session[]): void => {
  for (const id of [...stale]) if (!sessions.some((s) => s.id === id && s.state === "waiting")) stale.delete(id);
};
