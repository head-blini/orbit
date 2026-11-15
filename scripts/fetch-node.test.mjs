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
