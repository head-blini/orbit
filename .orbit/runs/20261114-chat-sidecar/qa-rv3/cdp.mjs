// usage: node cdp.mjs <expr-file-or-js> [shot.png] [WxH]
import fs from "node:fs";
const [, , expr, shot, size] = process.argv;
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
if (size) { const [w, h] = size.split("x").map(Number); await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await new Promise((r) => setTimeout(r, 400)); }
if (expr && expr !== "-") {
  const code = fs.existsSync(expr) ? fs.readFileSync(expr, "utf8") : expr;
  const r = await send("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 1));
}
if (shot) { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(shot, Buffer.from(r.result.data, "base64")); }
if (size === "reset") await send("Emulation.clearDeviceMetricsOverride");
ws.close();
