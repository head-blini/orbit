// 터미널(xterm) 색. ANSI 16칸은 design/tokens.json terminal.theme과 같은 값이다(termTheme.test.mjs가 확인).
// 나머지 10칸은 4명암(App.css --c-*와 같은 hex).
const PAPER = "#f8f8ec", LIGHT = "#b4b8a4", DARK = "#5c6052", INK = "#1c1e18";

export const THEME = {
  background: PAPER, foreground: INK, cursor: INK, cursorAccent: PAPER,
  selectionBackground: LIGHT, selectionForeground: INK, selectionInactiveBackground: LIGHT,
  scrollbarSliderBackground: DARK, scrollbarSliderHoverBackground: INK, scrollbarSliderActiveBackground: INK,
  black: INK, red: "#b3261e", green: "#2e7d32", yellow: "#8a6a00", blue: "#1f5fbf", magenta: "#8e3fa8", cyan: "#00727a", white: LIGHT,
  brightBlack: DARK, brightRed: "#c4311f", brightGreen: "#1e7a46", brightYellow: "#9a5b00", brightBlue: "#3a56d4",
  brightMagenta: "#a8329a", brightCyan: "#00777f", brightWhite: PAPER,
};

// xterm minimumContrastRatio: 글자색 대비가 이 값보다 낮으면 xterm이 글자색을 보정한다 (4.5 = WCAG AA)
export const MIN_CONTRAST = 4.5;
