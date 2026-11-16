import type { Session } from "./types";

// 이 터미널을 시작한 뒤(since 이후) 대기로 바뀐 세션이 있는가. 목록은 Orbit 세션만 온다(T1).
export const termWaiting = (sessions: Session[], since: number | null): boolean =>
  since !== null && sessions.some((s) => s.state === "waiting" && s.last_ms >= since);
