import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEME, MIN_CONTRAST } from "./termTheme.ts";

const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"];
const TEXT = ANSI.filter((k) => k !== "white" && k !== "brightWhite");
const FOUR = ["#f8f8ec", "#b4b8a4", "#5c6052", "#1c1e18"];

test("white·brightWhite 외 ANSI 14칸은 배경 대비 4.5 이상", () => {
  for (const k of TEXT) assert.ok(ratio(THEME[k], THEME.background) >= 4.5, `${k} ${ratio(THEME[k], THEME.background)}`);
});
test("foreground 대비 7 이상", () => assert.ok(ratio(THEME.foreground, THEME.background) >= 7));
test("색상 6칸이 서로 다르고 bright 6칸도 서로 다르다", () => {
  const six = ["red", "green", "yellow", "blue", "magenta", "cyan"];
  assert.equal(new Set(six.map((k) => THEME[k])).size, 6);
  assert.equal(new Set(six.map((k) => THEME["bright" + k[0].toUpperCase() + k.slice(1)])).size, 6);
});
test("ANSI 밖 10칸은 4명암 hex", () => {
  for (const k of ["background", "foreground", "cursor", "cursorAccent", "selectionBackground", "selectionForeground",
    "selectionInactiveBackground", "scrollbarSliderBackground", "scrollbarSliderHoverBackground", "scrollbarSliderActiveBackground"])
    assert.ok(FOUR.includes(THEME[k]), k);
});
test("MIN_CONTRAST >= 4.5", () => assert.ok(MIN_CONTRAST >= 4.5));
test("THEME가 design/tokens.json terminal.theme과 같다", () => {
  const tok = JSON.parse(readFileSync(new URL("../design/tokens.json", import.meta.url), "utf8"));
  const res = (v) => v.replace(/^\{color\.(\w+)\}$/, (_, n) => tok.color[n]);
  for (const k of ANSI) assert.equal(THEME[k], res(tok.terminal.theme[k]), k);
});
