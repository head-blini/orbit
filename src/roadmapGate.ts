// 로드맵 호출의 진행 중 판정: 같은 세션 id의 호출이 겹쳐 나가지 않게 한다.
export function createGate() {
  let busy: string | null = null;
  return {
    begin(id: string): boolean {
      if (busy === id) return false;
      busy = id;
      return true;
    },
    end(id: string): void {
      if (busy === id) busy = null;
    },
  };
}
