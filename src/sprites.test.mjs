import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPRITES } from "./sprites.ts";

// 시트 경로는 SHEET 환경변수로 바꿀 수 있다(⑥이 실패하는지 사본으로 확인할 때만 쓴다).
const SHEET = process.env.SPRITES_SHEET ?? new URL("../design/raid/sprites.svg", import.meta.url);
const svg = readFileSync(SHEET, "utf8");

const SHADE = { "#1c1e18": 0, "#5c6052": 1, "#b4b8a4": 2, "#f8f8ec": 3 };
const CARD = {
  기사단장: "commander", 마법사: "wizard", 전사: "warrior", 궁수: "archer",
  도적: "rogue", 힐러: "healer", 성기사: "paladin",
  슬라임: "slime", 고블린: "goblin", 오크: "orc", 드래곤: "dragon",
};
const FRAME = { 대기: "idle", 공격: "attack", "공격 · 물기": "bite", "공격 · 불뿜기": "fire" };
const ICON = {
  "답 대기": "bang", 졸음: "zz", 쓰러짐: "ko", "방어막 닫힘": "shieldClosed", "방어막 깨짐": "shieldBroken",
};

// 문서 순서로 걸으며 (카드, 프레임) → 층 목록 표를 만든다.
const groups = []; // { key, layers }
{
  let card = null;
  let pending = null;
  const re = /<text [^>]*class="t"[^>]*>([^<]*)<\/text>|<g transform="translate\([^)]*\) scale\(4\)">(.*?)<\/g>|<text [^>]*text-anchor="middle"[^>]*>([^<]*)<\/text>/g;
  for (const m of svg.matchAll(re)) {
    if (m[1] !== undefined) {
      card = m[1].split("·")[0].trim();
    } else if (m[2] !== undefined) {
      const layers = [...m[2].matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]*)"\/>/g)].map((p) => [SHADE[p[1]], p[2]]);
      assert.ok(layers.length > 0 && layers.every((l) => l[0] !== undefined), "층 파싱");
      assert.equal(pending, null, "프레임 이름 없는 그룹");
      pending = layers;
    } else {
      assert.ok(pending, "그룹 없는 프레임 이름");
      const name = m[3].trim();
      let key;
      if (card === "상태 아이콘") key = ICON[name];
      else key = `${CARD[card]}.${FRAME[name]}`;
      assert.ok(key && !key.includes("undefined"), `매핑 없음: ${card} / ${name}`);
      groups.push({ key, layers: pending });
      pending = null;
    }
  }
  assert.equal(pending, null);
}

function lookup(key) {
  const [a, b] = key.split(".");
  return b ? SPRITES[a]?.[b] : SPRITES[a];
}

const EXPECT_KEYS = [
  ...["commander", "wizard", "warrior", "archer", "rogue", "healer", "paladin", "slime", "goblin", "orc"].flatMap((j) => [`${j}.idle`, `${j}.attack`]),
  "dragon.idle", "dragon.bite", "dragon.fire",
  "bang", "zz", "ko", "shieldClosed", "shieldBroken",
];
const SIZE = (key) => {
  const n = key.split(".")[0];
  if (["commander", "wizard", "warrior", "archer", "rogue", "healer", "paladin", "goblin"].includes(n)) return [32, 32];
  if (n === "slime") return [24, 24];
  if (n === "orc") return [40, 40];
  if (n === "dragon") return [64, 48];
  return [16, 16];
};

test("② 키가 정해진 목록과 정확히 같다", () => {
  const top = Object.keys(SPRITES).sort();
  const want = [...new Set(EXPECT_KEYS.map((k) => k.split(".")[0]))].sort();
  assert.deepEqual(top, want);
  const got = [];
  for (const [k, v] of Object.entries(SPRITES)) {
    if (v.layers) got.push(k);
    else for (const f of Object.keys(v)) got.push(`${k}.${f}`);
  }
  assert.deepEqual(got.sort(), [...EXPECT_KEYS].sort());
});

test("⑥ 이름 매핑: 시트의 (카드, 프레임)과 같은 그룹이다 — 모든 키가 한 번씩, 남는 그룹 없음", () => {
  assert.deepEqual(groups.map((g) => g.key).sort(), [...EXPECT_KEYS].sort());
  for (const g of groups) {
    const s = lookup(g.key);
    assert.ok(s, g.key);
    assert.deepEqual(s.layers.map(([sh, d]) => [sh, d]), g.layers, g.key);
  }
});

test("① 모든 프레임 층이 시트 그룹 하나의 층과 순서·명암까지 같다", () => {
  const sheet = groups.map((g) => JSON.stringify(g.layers));
  for (const key of EXPECT_KEYS) {
    assert.ok(sheet.includes(JSON.stringify(lookup(key).layers)), key);
  }
});

test("③ w·h가 README 그리드 값이다", () => {
  for (const key of EXPECT_KEYS) {
    const s = lookup(key);
    assert.deepEqual([s.w, s.h], SIZE(key), key);
  }
});

test("⑤ shade가 0~3이다", () => {
  for (const key of EXPECT_KEYS) for (const [sh] of lookup(key).layers) assert.ok([0, 1, 2, 3].includes(sh), key);
});

test("④ 모든 path 좌표가 0..w, 0..h 안이다", () => {
  for (const key of EXPECT_KEYS) {
    const { w, h, layers } = lookup(key);
    for (const [, d] of layers) {
      let x = 0, y = 0, sx = 0, sy = 0;
      const check = (px, py) => assert.ok(px >= 0 && px <= w && py >= 0 && py <= h, `${key}: ${px},${py}`);
      for (const [, cmd, args] of d.matchAll(/([MhvHVzZ])([^MhvHVzZ]*)/g)) {
        const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
        assert.ok(n.every(Number.isFinite), `${key}: ${cmd}`);
        if (cmd === "M") [x, y] = n, sx = x, sy = y;
        else if (cmd === "h") x += n[0];
        else if (cmd === "v") y += n[0];
        else if (cmd === "H") x = n[0];
        else if (cmd === "V") y = n[0];
        else { x = sx; y = sy; }
        check(x, y);
      }
      assert.ok(!/[^MhvHVzZ\d\s.,-]/.test(d), `${key}: 모르는 명령`);
    }
  }
});
