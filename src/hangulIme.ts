// 맥 WKWebView 한글 조합 보정 (run 20261115-terminal DEBUG.md).
// WKWebView는 한글 2벌식에 composition 이벤트를 쏘지 않고 input 이벤트만 쏜다:
// 음절의 첫 자모(또는 받침이 넘어온 새 음절)는 insertText, 조합 갱신은 insertReplacementText.
// xterm 6.0.0은 insertText만 PTY로 보내고 insertReplacementText는 버려서 "ㅇㄴㅎ세"처럼 자모가 들어간다
// (xterm PR #5704, 미병합). 여기서는 조합 중인 음절을 들고 있다가 다음 음절·다른 입력·키에서 보낸다.
//
// xterm#5704: 병합 후 삭제. 삭제 조건 = PR #5704가 든 xterm 릴리스로 올린 뒤 맥에서 한글이 정상 입력됨을 확인했을 때.
// 이 파일·hangulIme.test.mjs와 Terminal.tsx의 "xterm#5704" 표식 줄을 모두 지운다.
// package.json이 @xterm/xterm을 6.0.0으로 고정한 이유: 6.x로 조용히 올라가면 xterm과 이 보정이 둘 다 처리해 글자가 겹친다.

const RANGES: [number, number][] = [
  [0x1100, 0x11ff], [0x3130, 0x318f], [0xa960, 0xa97f], [0xac00, 0xd7af], [0xd7b0, 0xd7ff],
];

export function isHangul(s: string): boolean {
  const cp = s.codePointAt(0);
  return cp !== undefined && RANGES.some(([a, b]) => cp >= a && cp <= b);
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

export type ImeStep = { handled: boolean; send: string };

export class HangulIme {
  pending = "";
  private last = ""; // 방금 flush한 음절: IME가 같은 음절 replacement를 다시 쏘면 버린다

  get active(): boolean { return this.pending !== ""; }

  /** 들고 있던 음절을 돌려주고 비운다 */
  flush(): string {
    const s = this.pending;
    this.pending = "";
    if (s) this.last = s;
    return s;
  }

  /** 조합 중 keydown 하나. block이면 xterm에 넘기지 않는다. send는 지금 PTY로 보낼 글 */
  keydown(keyCode: number, key: string): { block: boolean; send: string } {
    if (!this.active) return { block: false, send: "" };
    // 수정키만 누른 keydown은 IME를 거치지 않아 229가 아니다. 2벌식 ㅆ·ㄲ·ㅒ·ㅖ 등은 Shift를 누르니
    // 여기서 보내면 반쯤 된 음절("이")이 먼저 나가고 이어 오는 "있"이 또 나가 "이있"이 된다 (run 20261116-ime-dup)
    if (MODIFIERS.has(key)) return { block: false, send: "" };
    // 229 = IME가 처리 중인 키: xterm의 textarea 비교 전송(CompositionHelper._handleAnyTextareaChanges)이 자모를 보내지 않게 막는다
    if (keyCode === 229) return { block: true, send: "" };
    return { block: false, send: this.flush() }; // Enter·방향키·F6 등: 조합 중인 음절을 먼저 보낸다
  }

  /** input 이벤트 하나. handled면 xterm에 넘기지 않는다. send는 지금 PTY로 보낼 글 */
  input(type: string, data: string | null): ImeStep {
    if (type === "insertReplacementText") {
      if (!data) { // 빈 글: 조합 중이던 자모를 지운 것 — 보내지 않고 버린다
        if (!this.active) return { handled: false, send: "" };
        this.pending = "";
        return { handled: true, send: "" };
      }
      if (isHangul(data)) {
        if (!this.active && data === this.last) return { handled: true, send: "" }; // flush 직후 재전송
        this.pending = data;
        return { handled: true, send: "" };
      }
    } else if (type === "insertText" && data && isHangul(data)) {
      const send = this.flush();
      this.last = "";
      this.pending = data;
      return { handled: true, send };
    } else if (type === "deleteContentBackward" && this.active) {
      this.pending = ""; // 조합 중 남은 자모를 지움: 아직 안 보냈으니 보낼 것도 없다
      this.last = "";
      return { handled: true, send: "" };
    }
    const send = this.flush();
    this.last = "";
    return { handled: false, send };
  }
}
