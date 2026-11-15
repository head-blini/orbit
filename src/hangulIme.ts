// 맥 WKWebView 한글 조합 보정 (run 20261115-terminal DEBUG.md).
// WKWebView는 한글 2벌식에 composition 이벤트를 쏘지 않고 input 이벤트만 쏜다:
// 음절의 첫 자모(또는 받침이 넘어온 새 음절)는 insertText, 조합 갱신은 insertReplacementText.
// xterm 6.0.0은 insertText만 PTY로 보내고 insertReplacementText는 버려서 "ㅇㄴㅎ세"처럼 자모가 들어간다
// (xterm PR #5704, 미병합). 여기서는 조합 중인 음절을 들고 있다가 다음 음절·다른 입력·키에서 보낸다.

const RANGES: [number, number][] = [
  [0x1100, 0x11ff], [0x3130, 0x318f], [0xa960, 0xa97f], [0xac00, 0xd7af], [0xd7b0, 0xd7ff],
];

export function isHangul(s: string): boolean {
  const cp = s.codePointAt(0);
  return cp !== undefined && RANGES.some(([a, b]) => cp >= a && cp <= b);
}

export type ImeStep = { handled: boolean; send: string };

export class HangulIme {
  pending = "";

  get active(): boolean { return this.pending !== ""; }

  /** 들고 있던 음절을 돌려주고 비운다 */
  flush(): string {
    const s = this.pending;
    this.pending = "";
    return s;
  }

  /** input 이벤트 하나. handled면 xterm에 넘기지 않는다. send는 지금 PTY로 보낼 글 */
  input(type: string, data: string | null): ImeStep {
    if (type === "insertReplacementText" && data && (this.active || isHangul(data))) {
      this.pending = data;
      return { handled: true, send: "" };
    }
    if (type === "insertText" && data && isHangul(data)) {
      const send = this.flush();
      this.pending = data;
      return { handled: true, send };
    }
    if (type === "deleteContentBackward" && this.active) {
      this.pending = ""; // 조합 중 남은 자모를 지움: 아직 안 보냈으니 보낼 것도 없다
      return { handled: true, send: "" };
    }
    return { handled: false, send: this.flush() };
  }
}
