import fs from 'node:fs';
export async function connect(port, match) {
  let list;
  for (let i = 0; i < 40; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find(t => t.type === 'page' && t.url.includes(match))) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  const t = list.find(t => t.type === 'page' && t.url.includes(match));
  if (!t) throw new Error('no target ' + JSON.stringify(list.map(x => x.url)));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const p = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; p.set(i, m => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const view = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const shot = async (file, clip) => { const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: clip.scale || 1 } } : {}) }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); };
  return { send, ev, view, shot, close: () => ws.close() };
}
export const MEASURE = `(() => {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return {x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1)}; };
  const cs = e => { if (!e) return null; const c = getComputedStyle(e); return {ff:c.fontFamily, fs:c.fontSize, border:c.borderTopWidth+' '+c.borderTopStyle+' '+c.borderTopColor, bg:c.backgroundColor, color:c.color}; };
  const g = document.querySelector('section.graph, [class*=graph]');
  const canvas = document.querySelector('.canvas, [class*=canvas]');
  const nodes = [...document.querySelectorAll('.nodes li, .graph li, .chips li')].map(li => { const b = li.querySelector('button')||li; return {text: li.innerText.replace(/\\n/g,' | '), li: r(li), btn: r(b), css: cs(b), cls: b.className, nameCss: cs(b.querySelector('.n-name')), metaCss: cs(b.querySelector('.n-meta')) }; });
  return JSON.stringify({vp:[innerWidth,innerHeight], graph: r(g), graphCls: g&&g.className, canvas: r(canvas), svg: r(document.querySelector('.edges, svg')), nodes, edges:[...document.querySelectorAll('.edge, path')].map(p=>p.getAttribute('d')+' '+p.getAttribute('class')) }, null, 1);
})()`;
