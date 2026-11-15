import { test } from "node:test";
import assert from "node:assert/strict";
import { shaFromShasums } from "./fetch-node.mjs";

const TXT = [
  "1111111111111111111111111111111111111111111111111111111111111111  node-v1.0.0-darwin-arm64.tar.xz",
  "2222222222222222222222222222222222222222222222222222222222222222  node-v1.0.0-darwin-x64.tar.gz",
  "3333333333333333333333333333333333333333333333333333333333333333  node-v1.0.0-darwin-arm64.tar.gz",
  "",
].join("\n");

test("맞는 파일 이름의 해시를 찾는다", () => {
  assert.equal(shaFromShasums(TXT, "node-v1.0.0-darwin-arm64.tar.gz"), "3".repeat(64));
});

test("비슷한 이름은 고르지 않는다", () => {
  const only = TXT.split("\n").slice(0, 2).join("\n");
  assert.equal(shaFromShasums(only, "node-v1.0.0-darwin-arm64.tar.gz"), null);
});

test("없으면 null", () => {
  assert.equal(shaFromShasums("", "node-v1.0.0-darwin-arm64.tar.gz"), null);
});

import { allowedUrl, cacheValid } from "./fetch-node.mjs";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("nodejs.org https만 허용", () => {
  assert.equal(allowedUrl("https://nodejs.org/dist/x"), true);
  assert.equal(allowedUrl("http://nodejs.org/dist/x"), false);
  assert.equal(allowedUrl("https://evil.example/nodejs.org"), false);
  assert.equal(allowedUrl("https://nodejs.org.evil.example/"), false);
  assert.equal(allowedUrl("nope"), false);
});

test("캐시: LICENSE·bin/node 해시까지 맞아야 유효", () => {
  const d = mkdtempSync(join(tmpdir(), "fn-test-"));
  try {
    mkdirSync(join(d, "bin"));
    writeFileSync(join(d, "bin", "node"), "BIN");
    const h = createHash("sha256").update("BIN").digest("hex");
    writeFileSync(join(d, "VERSION"), `1.0 abc ${h}\n`);
    assert.equal(cacheValid(d, "1.0 abc"), false, "LICENSE 없음");
    writeFileSync(join(d, "LICENSE"), "L");
    assert.equal(cacheValid(d, "1.0 abc"), true);
    assert.equal(cacheValid(d, "1.0 zzz"), false);
    writeFileSync(join(d, "bin", "node"), "TAMPERED");
    assert.equal(cacheValid(d, "1.0 abc"), false, "바이너리 변조");
    writeFileSync(join(d, "VERSION"), "1.0 abc\n");
    assert.equal(cacheValid(d, "1.0 abc"), false, "해시 기록 없음");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
