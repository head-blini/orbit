import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS, MID_MIN, TOP_MIN, FONT,
  clampSize, loadSizes, saveSizes, gridStyle, keyStep,
  fontStep, loadFont, saveFont,
} from "./layout.ts";

const NONE = { l: null, r: null, b: null };
const store = (v) => () => ({ getItem: () => v, setItem() {} });
const boom = () => ({ getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } });

test("모두 null이면 gridStyle은 App.css 식과 같다", () => {
  assert.deepEqual(gridStyle(NONE), {
    gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 2.6fr) minmax(280px, 1.2fr)",
    gridTemplateRows: "auto minmax(0, 3fr) minmax(0, 2fr)",
  });
});

test("l=300이면 첫 열만 300px", () => {
  const s = gridStyle({ ...NONE, l: 300 });
  assert.equal(s.gridTemplateColumns, "300px minmax(0, 2.6fr) minmax(280px, 1.2fr)");
  assert.equal(s.gridTemplateRows, gridStyle(NONE).gridTemplateRows);
});

test("r·b는 각각 셋째 열·셋째 행만 바꾼다", () => {
  assert.equal(gridStyle({ ...NONE, r: 400 }).gridTemplateColumns, "minmax(220px, 1fr) minmax(0, 2.6fr) 400px");
  assert.equal(gridStyle({ ...NONE, b: 250 }).gridTemplateRows, "auto minmax(0, 3fr) 250px");
});

test("clampSize는 최소·최대·avail을 지킨다", () => {
  assert.equal(MID_MIN, 320);
  assert.equal(TOP_MIN, 160);
  assert.equal(clampSize("l", 100, 1000), LIMITS.l.min);
  assert.equal(clampSize("l", 900, 1000), LIMITS.l.max);
  assert.equal(clampSize("l", 400, 300), 300);
  assert.equal(clampSize("r", 100, 1000), LIMITS.r.min);
  assert.equal(clampSize("r", 900, 1000), LIMITS.r.max);
  assert.equal(clampSize("b", 50, 1000), LIMITS.b.min);
  assert.equal(clampSize("b", 5000, 700), 700);
  assert.equal(clampSize("b", 300, 700), 300);
  assert.equal(clampSize("l", 300, 100), LIMITS.l.min); // avail이 최소보다 작으면 최소
});

test("loadSizes: 정상값", () => {
  assert.deepEqual(loadSizes(store('{"l":300,"r":null,"b":200}')), { l: 300, r: null, b: 200 });
});

test("loadSizes: 깨진 입력은 null", () => {
  for (const raw of ["{bad", null, "[]", '"x"', '{"l":"300","r":null,"b":null}',
    '{"l":null,"r":null,"b":NaN}', '{"l":10,"r":null,"b":null}', '{"l":null,"r":9999,"b":null}',
    '{"l":null,"r":null,"b":10}']) {
    const s = loadSizes(store(raw));
    if (raw === '{"l":"300","r":null,"b":null}') assert.equal(s.l, null);
    assert.ok(s.l === null || typeof s.l === "number");
    assert.deepEqual(s, NONE, String(raw));
  }
  assert.deepEqual(loadSizes(boom), NONE);
});

test("loadSizes: 필드별로 걸러낸다", () => {
  assert.deepEqual(loadSizes(store('{"l":300,"r":9999,"b":null}')), { l: 300, r: null, b: null });
});

test("saveSizes는 쓰고, setItem 예외는 던지지 않는다", () => {
  let k, v;
  saveSizes(() => ({ setItem(a, b) { k = a; v = b; } }), { l: 300, r: null, b: null });
  assert.equal(k, "orbit.layout.v1");
  assert.deepEqual(JSON.parse(v), { l: 300, r: null, b: null });
  assert.doesNotThrow(() => saveSizes(boom, NONE));
});

test("keyStep 방향 표", () => {
  assert.equal(keyStep("l", "ArrowRight", 300), 316);
  assert.equal(keyStep("l", "ArrowLeft", 300), 284);
  assert.equal(keyStep("r", "ArrowLeft", 300), 316);
  assert.equal(keyStep("r", "ArrowRight", 300), 284);
  assert.equal(keyStep("b", "ArrowUp", 300), 316);
  assert.equal(keyStep("b", "ArrowDown", 300), 284);
  assert.equal(keyStep("l", "Home", 300), LIMITS.l.min);
  assert.equal(keyStep("l", "End", 300), LIMITS.l.max);
  assert.equal(keyStep("r", "Home", 300), LIMITS.r.min);
  assert.equal(keyStep("b", "End", 300), LIMITS.b.max);
  assert.equal(keyStep("l", "ArrowUp", 300), null);
  assert.equal(keyStep("l", "a", 300), null);
});

test("fontStep: 9·24에서 멈추고 reset은 13", () => {
  assert.deepEqual(FONT, { min: 9, max: 24, def: 13 });
  assert.equal(fontStep("inc", 13), 14);
  assert.equal(fontStep("dec", 13), 12);
  assert.equal(fontStep("inc", 24), 24);
  assert.equal(fontStep("dec", 9), 9);
  assert.equal(fontStep("reset", 20), 13);
});

test("loadFont: 깨진 값·범위 밖·예외면 13", () => {
  assert.equal(loadFont(store("16")), 16);
  for (const raw of [null, "abc", "8", "25", "13.5", "", "NaN"]) assert.equal(loadFont(store(raw)), 13, String(raw));
  assert.equal(loadFont(boom), 13);
});

test("saveFont", () => {
  let k, v;
  saveFont(() => ({ setItem(a, b) { k = a; v = b; } }), 15);
  assert.equal(k, "orbit.termFont.v1");
  assert.equal(v, "15");
  assert.doesNotThrow(() => saveFont(boom, 15));
});
