import type { Session } from "./types";

// 스텁: F2가 실제 그래프로 덮어쓴다.
export default function Graph(_: { session: Session | null; selected: string | null; onSelect: (key: string) => void }) {
  return <p className="empty">세션을 고르면 에이전트 흐름이 보입니다</p>;
}
