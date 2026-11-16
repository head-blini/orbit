import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const conf = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const sec = conf.app.security;
const parse = (csp) => Object.fromEntries(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...vals] = d.split(/\s+/);
  return [name, vals];
}));
const csp = parse(sec.csp);

test("배포 CSP: style-src에 'unsafe-inline' (xterm 런타임 <style>)", () => {
  assert.deepEqual(csp["style-src"], ["'self'", "'unsafe-inline'"]);
});

test("Tauri의 style-src nonce/hash 주입을 끈다(켜져 있으면 unsafe-inline이 무시됨)", () => {
  assert.deepEqual(sec.dangerousDisableAssetCspModification, ["style-src"]);
});

test("script-src는 따로 열지 않고 unsafe-eval·unsafe-inline이 없다", () => {
  assert.equal(csp["script-src"], undefined);
  assert.ok(!/unsafe-eval/.test(sec.csp));
  assert.ok(!(csp["default-src"] ?? []).includes("'unsafe-inline'"));
});

test("다른 지시어는 넓어지지 않았다", () => {
  assert.deepEqual(csp["default-src"], ["'self'", "ipc:", "http://ipc.localhost"]);
  assert.deepEqual(csp["img-src"], ["'self'", "asset:", "http://asset.localhost"]);
  assert.deepEqual(csp["font-src"], ["'self'"]);
  assert.deepEqual(csp["object-src"], ["'none'"]);
  assert.deepEqual(csp["base-uri"], ["'none'"]);
  assert.deepEqual(csp["form-action"], ["'none'"]);
  assert.equal(csp["connect-src"], undefined);
});

test("배포 CSP에 'unsafe-inline'은 style-src에만 있다", () => {
  for (const [k, v] of Object.entries(csp)) if (k !== "style-src") assert.ok(!v.includes("'unsafe-inline'"), k);
});
