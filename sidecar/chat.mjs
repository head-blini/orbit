// 사이드카: stdin JSON 줄 <-> Agent SDK query() <-> stdout JSON 줄. 프로토콜은 PLAN.md "프로토콜" 절.
import { createInterface } from "node:readline";
import { createPermits, fromSdk, markInterrupt, parseLine, redact } from "./core.mjs";

const out = (obj, done) => process.stdout.write(JSON.stringify(obj) + "\n", done);
const diag = (s) => process.stderr.write(redact(s) + "\n");

// Node 버전은 SDK를 import 하기 전에 본다.
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 18 || (maj === 18 && min < 14)) {
  out({ t: "error", message: `Node.js 18.14 이상이 필요합니다 — 지금 v${process.versions.node}` }, () => process.exit(1));
} else {
  main();
}

function main() {
  const permits = createPermits(out);
  const st = { interrupting: false, turns: 0 };
  const inbox = []; // 아직 SDK가 안 가져간 user 메시지
  let wake = null;
  let closing = false;
  let q = null;

  const userMsg = (text) => ({ type: "user", message: { role: "user", content: String(text) }, parent_tool_use_id: null });
  const push = (text) => {
    st.turns++;
    inbox.push(userMsg(text));
    wake?.();
  };
  async function* prompt() {
    while (!closing) {
      if (!inbox.length) await new Promise((r) => (wake = r));
      wake = null;
      while (inbox.length) yield inbox.shift();
    }
  }

  const shutdown = () => {
    if (closing) return;
    closing = true;
    permits.denyAll("종료");
    try {
      q?.close();
    } catch {}
    wake?.();
    process.exit(0);
  };

  async function start(cwd, text) {
    if (q || typeof cwd !== "string" || typeof text !== "string") return;
    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      push(text);
      q = query({
        prompt: prompt(),
        options: {
          cwd,
          includePartialMessages: true,
          permissionMode: "default",
          systemPrompt: { type: "preset", preset: "claude_code" },
          env: { ...process.env },
          canUseTool: permits.canUseTool,
          stderr: (d) => process.stderr.write(redact(d)),
        },
      });
      for await (const m of q) {
        if (m?.type === "system" && m.subtype === "init") diag(`orbit-sidecar: session ${m.session_id}`);
        for (const o of fromSdk(m, st)) out(o);
      }
    } catch (e) {
      permits.denyAll("오류"); // 열린 카드에 closed를 먼저 보낸다
      if (closing) return;
      out({ t: "error", message: redact(String(e?.message ?? e)) }, () => process.exit(1));
    }
  }

  async function interrupt() {
    permits.denyAll("중단됨");
    markInterrupt(st);
    try {
      await q?.interrupt();
    } catch {}
  }

  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const m = parseLine(line);
    if (!m) return;
    switch (m.t) {
      case "start": start(m.cwd, m.text); break;
      case "send": if (q && typeof m.text === "string") push(m.text); break;
      case "permit": permits.permit(m.id, m.decision); break;
      case "answer": permits.answer(m.id, m.answers); break;
      case "interrupt": interrupt(); break;
      case "close": shutdown(); break;
    }
  });
  rl.on("close", shutdown); // stdin EOF = Rust가 끝남
}
