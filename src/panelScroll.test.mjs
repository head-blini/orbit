import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 세션 칸: 스크롤 내용이 이중 테두리 안쪽 선(.panel의 inset box-shadow) 위로 그려지지 않아야 한다.
// inset 그림자는 배경이라 내용 아래에 칠해지고, 스크롤 내용은 padding 상자 경계에서만 잘린다.
// 그래서 스크롤은 안쪽 선보다 안쪽에 둔 래퍼(.panel-scroll)가 맡는다.
const css = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const tsx = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

const vars = Object.fromEntries([...css.matchAll(/--(s-\d|gap-panel):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]));
const px = (v) => {
  v = v.trim();
  const neg = v.match(/^calc\(-1 \* var\(--([\w-]+)\)\)$/);
  if (neg) return -vars[neg[1]];
  const pos = v.match(/^var\(--([\w-]+)\)$/);
  if (pos) return vars[pos[1]];
  if (v === "0") return 0;
  throw new Error(`모르는 값: ${v}`);
};
// 같은 선택자의 규칙을 모두 합친다(뒤가 이긴다)
const rule = (sel) => {
  const out = {};
  const re = new RegExp(`(?:^|[}\\s,])${sel.replace(/[.>]/g, (c) => `\\${c}`)}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "gm");
  for (const m of css.matchAll(re)) for (const d of m[1].split(";")) {
    const i = d.indexOf(":");
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).replace(/\/\*.*?\*\//g, "").trim();
  }
  return out;
};
const box = (v) => { const p = v.match(/calc\([^)]*\)\)|\S+/g).map(px); return { block: p[0], inline: p[1] ?? p[0] }; };

test("세션 칸 자체는 스크롤하지 않고, 안의 .panel-scroll이 스크롤한다", () => {
  assert.equal(rule(".sessions").overflow, "hidden");
  assert.equal(rule(".panel-scroll").overflow, "auto");
  const m = tsx.match(/<section className="panel sessions"[\s\S]*?<\/section>/);
  assert.ok(m, "세션 section을 찾지 못함");
  const body = m[0].replace(/^<section[\s\S]*?\}\}>\s*/, "");
  assert.match(body, /^<div className="panel-scroll">/, "section의 첫 자식이 .panel-scroll이어야 함");
  assert.match(body, /<\/div>\s*<\/section>$/, ".panel-scroll이 section 끝까지 감싸야 함");
});

test(".panel-scroll의 잘림 경계가 이중 테두리 안쪽 선(padding 상자에서 4px)보다 안쪽이다", () => {
  const pad = box(rule(".panel").padding);
  const mar = box(rule(".panel-scroll").margin);
  const inner = 4; // --sh-panel: inset 2px paper + 2px ink
  assert.match(css, /--sh-panel: inset 0 0 0 2px var\(--c-paper\), inset 0 0 0 4px var\(--c-ink\)/);
  assert.ok(pad.block + mar.block >= inner, `위아래 잘림 경계 ${pad.block + mar.block}px < ${inner}px`);
  assert.ok(pad.inline + mar.inline >= inner, `좌우 잘림 경계 ${pad.inline + mar.inline}px < ${inner}px`);
});

test("래퍼를 넣어도 내용 위치는 그대로다(음수 margin과 padding이 상쇄)", () => {
  const s = rule(".panel-scroll");
  const mar = box(s.margin), pad = box(s.padding);
  assert.equal(mar.block + pad.block, 0);
  assert.equal(mar.inline + pad.inline, 0);
  assert.match(css, /\.panel > h2, \.panel-scroll > h2 \{/, "제목 여백 규칙이 래퍼 안 h2에도 걸려야 함");
});
