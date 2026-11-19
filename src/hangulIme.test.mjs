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

// keydown까지 넣은 모형: Terminal.tsx의 attachCustomKeyEventHandler(조합 중 keydown → ime.keydown)와 input capture 리스너 순서.
// 자모 키는 keydown 229 뒤에 input. 2벌식 쌍자음·ㅒ·ㅖ는 Shift를 누른다: 수정키는 IME를 거치지 않아 keydown이 229가 아닌 16("Shift")으로 온다.
const K = ["key", 229, "Process"], SHIFT = ["key", 16, "Shift"];
function type(events) {
  const ime = new HangulIme();
  let out = "";
  for (const [t, a, b] of events) {
    if (t === "key") {
      if (!ime.active) continue;
      const k = ime.keydown(a, b);
      if (!k.block) out += k.send;
    } else out += ime.input(t, a).send;
  }
  return out + ime.flush(); // Enter
}
const ins = (d) => [K, ["insertText", d]], rep = (d) => [K, ["insertReplacementText", d]];

// 사용자 보고(20261116-ime-dup): "있어요" → "이있어요"
test("Shift for ㅆ mid-syllable does not send the half-built syllable (있어요)", () => {
  assert.equal(type([...ins("ㅇ"), ...rep("이"), SHIFT, ...rep("있"), ...ins("ㅇ"), ...rep("어"), ...rep("엉"), ["insertReplacementText", "어"], ["insertText", "요"]]), "있어요");
});

test("same bug family: 했어, 예, 얘기, 이써(ㅆ moves to next syllable), 깎아(ㄲ final)", () => {
  assert.equal(type([...ins("ㅎ"), ...rep("해"), SHIFT, ...rep("했"), ...ins("ㅇ"), ...rep("어")]), "했어");
  assert.equal(type([...ins("ㅇ"), SHIFT, ...rep("예")]), "예");
  assert.equal(type([...ins("ㅇ"), SHIFT, ...rep("얘"), ...ins("ㄱ"), ...rep("기")]), "얘기");
  assert.equal(type([...ins("ㅇ"), ...rep("이"), SHIFT, ...rep("있"), K, ["insertReplacementText", "이"], ["insertText", "써"]]), "이써");
  assert.equal(type([SHIFT, ...ins("ㄲ"), ...rep("까"), SHIFT, ...rep("깎"), ...ins("ㅇ"), ...rep("아")]), "깎아");
});

test("other modifiers alone keep composing; non-modifier keys still flush", () => {
  for (const [code, key] of [[17, "Control"], [18, "Alt"], [91, "Meta"]]) {
    assert.equal(type([...ins("ㅇ"), ...rep("이"), ["key", code, key], ...rep("있")]), "있", key);
  }
  const ime = new HangulIme();
  ime.input("insertText", "ㅎ");
  ime.input("insertReplacementText", "한");
  assert.deepEqual(ime.keydown(13, "Enter"), { block: false, send: "한" });
  assert.deepEqual(ime.keydown(13, "Enter"), { block: false, send: "" });
});

test("double final consonant without Shift (ㄱㅏㅂㅅㅣ → 갑시) and Shift at syllable start (가까) were already fine", () => {
  assert.equal(type([...ins("ㄱ"), ...rep("가"), ...rep("갑"), ...rep("값"), K, ["insertReplacementText", "갑"], ["insertText", "시"]]), "갑시");
  assert.equal(type([...ins("ㄱ"), ...rep("가"), SHIFT, ...ins("ㄲ"), ...rep("까")]), "가까");
});

test("paste while composing: flush on paste sends the pending syllable first, paste input is left to xterm", () => {
  // Terminal.tsx는 paste(capture)에서 flush한다. xterm은 같은 paste 이벤트에서 붙인 글을 보내므로 이 순서가 "아" → "abc"가 된다.
  const ime = new HangulIme();
  ime.input("insertText", "ㅇ");
  ime.input("insertReplacementText", "아");
  assert.equal(ime.flush(), "아");
  assert.deepEqual(ime.input("insertFromPaste", "abc"), { handled: false, send: "" });
  assert.deepEqual(ime.input("insertReplacementText", "아"), { handled: true, send: "" }); // IME가 다시 쏴도 두 번 가지 않는다
});
