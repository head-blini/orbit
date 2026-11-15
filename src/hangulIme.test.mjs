// node --test src/hangulIme.test.mjs  (Node 23.6+ 타입 제거로 .ts를 바로 읽는다)
import { test } from "node:test";
import assert from "node:assert/strict";
import { HangulIme, isHangul } from "./hangulIme.ts";

// WKWebView가 2벌식 "안녕하세요"에 쏘는 input 이벤트 (xterm PR #5704 표의 모형). 조합 이벤트는 없다.
const ANNYEONG = [
  ["insertText", "ㅇ"], ["insertReplacementText", "아"], ["insertReplacementText", "안"],
  ["insertText", "ㄴ"], ["insertReplacementText", "녀"], ["insertReplacementText", "녕"],
  ["insertText", "ㅎ"], ["insertReplacementText", "하"], ["insertReplacementText", "핫"],
  ["insertReplacementText", "하"], ["insertText", "세"], ["insertReplacementText", "셍"],
  ["insertReplacementText", "세"], ["insertText", "요"],
];

// xterm 6.0.0 _inputEvent: insertText만 보내고 insertReplacementText는 버린다 (= 증상)
test("xterm 6.0.0 model drops replacements -> decomposed jamo", () => {
  const out = ANNYEONG.filter(([t]) => t === "insertText").map(([, d]) => d).join("");
  assert.equal(out, "ㅇㄴㅎ세요");
});

test("HangulIme sends whole syllables, last one on flush (Enter keydown)", () => {
  const ime = new HangulIme();
  let out = "";
  for (const [t, d] of ANNYEONG) {
    const r = ime.input(t, d);
    assert.equal(r.handled, true);
    out += r.send;
  }
  assert.equal(out, "안녕하세");
  assert.equal(ime.pending, "요");
  out += ime.flush();
  assert.equal(out, "안녕하세요");
  assert.equal(ime.active, false);
});

test("non-Hangul insertText flushes pending and is left to xterm", () => {
  const ime = new HangulIme();
  ime.input("insertText", "ㅎ");
  ime.input("insertReplacementText", "한");
  const r = ime.input("insertText", "1");
  assert.deepEqual(r, { handled: false, send: "한" });
  assert.equal(ime.active, false);
});

test("replacement without pending and non-Hangul is left to xterm", () => {
  const ime = new HangulIme();
  assert.deepEqual(ime.input("insertReplacementText", "abc"), { handled: false, send: "" });
});

test("backspace deleting the last jamo clears pending without sending", () => {
  const ime = new HangulIme();
  ime.input("insertText", "ㅎ");
  assert.deepEqual(ime.input("deleteContentBackward", null), { handled: true, send: "" });
  assert.equal(ime.active, false);
  assert.deepEqual(ime.input("deleteContentBackward", null), { handled: false, send: "" });
});

test("composition text and unknown input types only flush", () => {
  const ime = new HangulIme();
  ime.input("insertText", "가");
  assert.deepEqual(ime.input("insertCompositionText", "か"), { handled: false, send: "가" });
  assert.deepEqual(ime.input("insertText", null), { handled: false, send: "" });
});

test("isHangul ranges", () => {
  for (const s of ["ㄱ", "ㅏ", "가", "힣", "ᄀ"]) assert.equal(isHangul(s), true, s);
  for (const s of ["a", "1", " ", "か", "漢", ""]) assert.equal(isHangul(s), false, s);
});

// REVIEW W2: 조건 `(this.active || isHangul(data))`의 변이 `(this.active)`·`(isHangul(data))`가 살아남던 경우들
test("Hangul replacement with nothing pending is held (kills mutant: this.active only)", () => {
  const ime = new HangulIme();
  assert.deepEqual(ime.input("insertReplacementText", "안"), { handled: true, send: "" });
  assert.equal(ime.pending, "안");
});

test("non-Hangul replacement while composing flushes instead of being swallowed (kills mutant: this.active)", () => {
  const ime = new HangulIme();
  ime.input("insertText", "ㅎ");
  ime.input("insertReplacementText", "한");
  assert.deepEqual(ime.input("insertReplacementText", "abc"), { handled: false, send: "한" });
  assert.equal(ime.active, false);
});

test("same syllable replayed right after flush (Enter/blur) is dropped, not sent twice", () => {
  const ime = new HangulIme();
  ime.input("insertText", "ㅇ");
  ime.input("insertReplacementText", "안");
  assert.equal(ime.flush(), "안");
  assert.deepEqual(ime.input("insertReplacementText", "안"), { handled: true, send: "" });
  assert.equal(ime.active, false);
  // 다른 입력이 끼면 다시 정상 취급
  ime.input("insertText", "1");
  assert.deepEqual(ime.input("insertReplacementText", "안"), { handled: true, send: "" });
  assert.equal(ime.pending, "안");
});

test("empty replacement while composing clears pending without sending", () => {
  const ime = new HangulIme();
  ime.input("insertText", "ㅇ");
  assert.deepEqual(ime.input("insertReplacementText", ""), { handled: true, send: "" });
  assert.equal(ime.active, false);
  assert.deepEqual(ime.input("insertReplacementText", ""), { handled: false, send: "" });
});

test("while composing, a replacement equal to the last flushed syllable still updates pending", () => {
  const ime = new HangulIme();
  ime.input("insertText", "ㅇ");
  ime.input("insertReplacementText", "안");
  ime.flush();
  ime.input("insertReplacementText", "아");
  assert.deepEqual(ime.input("insertReplacementText", "안"), { handled: true, send: "" });
  assert.equal(ime.pending, "안");
});
