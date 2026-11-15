import { connect, MEASURE } from './c.mjs';
import fs from 'node:fs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/';
const [,, scene, ...args] = process.argv;
const c = await connect(9333, '1420');
await c.view(+(process.env.VW || 1400), +(process.env.VH || 900));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = async (js) => { const r = await c.ev(js); await sleep(600); return r; };
// args: session name, node text
const [sess, node] = args;
if (sess) console.log('sess click', await click(`(() => { const b=[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()===${JSON.stringify(sess)}); if(!b) return 'none'; b.click(); return 'ok'; })()`));
if (node) console.log('node click', await click(`(() => { const b=[...document.querySelectorAll('.graph button')].find(e=>e.innerText.includes(${JSON.stringify(node)})); if(!b) return 'none'; b.click(); return 'ok'; })()`));
await c.ev(`document.activeElement && document.activeElement.blur()`);
await c.ev(`window.scrollTo(0,0)`);
await sleep(400);
const file = process.env.OUT;
await c.shot(S + file + '.png');
const m = JSON.parse(await c.ev(MEASURE));
const extra = JSON.parse(await c.ev(`JSON.stringify(Object.fromEntries(['.sessions','.graph','.detail','.chat','.console','.topbar','.sess','.sess .name','.sess .time'].map(s=>{const e=document.querySelector(s);if(!e)return [s,null];const b=e.getBoundingClientRect();const c=getComputedStyle(e);return [s,{x:b.x,y:b.y,w:b.width,h:b.height,ff:c.fontFamily,fs:c.fontSize}]})))`));
fs.writeFileSync(S + file + '-measure.json', JSON.stringify({ m, extra, scrollbars: await c.ev(`JSON.stringify({graphScroll:[document.querySelector('.graph').scrollWidth,document.querySelector('.graph').clientWidth,document.querySelector('.graph').scrollHeight,document.querySelector('.graph').clientHeight]})`) }, null, 1));
if (process.env.CROP) { const g = m.graph; await c.shot(S + process.env.CROP + '.png', { x: g.x, y: g.y, width: g.w, height: g.h }); }
console.log(file, JSON.stringify({ graph: m.graph, canvas: m.canvas, n: m.nodes.length }));
c.close();
