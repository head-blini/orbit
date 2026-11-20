// 로드맵 호출의 진행 중 판정: 같은 세션 id의 호출이 겹쳐 나가지 않게 한다.
// 읽는 중에 거절된 id는 기억해 두었다가 end가 true로 알려, 그 사이 들어온 변경을 놓치지 않게 한다.
export function createGate() {
  let busy: string | null = null;
  let again: string | null = null;
  return {
    begin(id: string): boolean {
      if (busy === id) { again = id; return false; }
      busy = id;
      return true;
    },
    end(id: string): boolean {
      if (busy === id) busy = null;
      if (again === id) { again = null; return true; }
      return false;
    },
  };
}

// roadmap-changed 이벤트가 지금 고른 세션의 것일 때만 다시 읽는다.
export function shouldReload(payload: unknown, current: string | null): boolean {
  return typeof payload === "string" && current !== null && payload === current;
}
