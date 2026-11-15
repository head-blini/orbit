// env: OUT(필수) SESS NODE PRE VW VH SCROLLLEFT0(1이면 .gscroll을 맨 왼쪽으로) WAIT(ms) KEEPFOCUS
import { connect } from './c.mjs';
import { M3 } from './m3.mjs';
import fs from 'node:fs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v4/';
const c = await connect(9333, '1420');
await c.view(+(process.env.VW || 1400), +(process.env.VH || 900));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { SESS, NODE, PRE, OUT, KEEPFOCUS, SCROLLLEFT0 } = process.env;
if (SESS) console.log('sess', await c.ev(`(() => { const b=[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()===${JSON.stringify(SESS)}); if(!b) return 'none'; b.click(); return 'ok'; })()`));
await sleep(+(process.env.WAIT || 1800));
if (NODE) { console.log('node', await c.ev(`(() => { const b=[...document.querySelectorAll('.graph button')].find(e=>e.innerText.includes(${JSON.stringify(NODE)})); if(!b) return 'none'; b.click(); return 'ok'; })()`)); await sleep(1200); }
if (PRE) { console.log('pre', await c.ev(PRE)); await sleep(1200); }
if (SCROLLLEFT0) { await c.ev(`document.querySelector('.gscroll').scrollTo({left:0,behavior:'auto'})`); await sleep(400); }
if (!KEEPFOCUS) await c.ev(`document.activeElement && document.activeElement.blur()`);
await sleep(300);
await c.shot(S + OUT + '.png');
const m = JSON.parse(await c.ev(M3));
fs.writeFileSync(S + OUT + '-measure.json', JSON.stringify(m, null, 1));
const g = m.graph;
await c.shot(S + OUT + '-graph.png', { x: g.x, y: g.y, width: g.w, height: g.h });
console.log(OUT, 'canvas', JSON.stringify(m.canvas), 'gscroll', JSON.stringify(m.gscroll), JSON.stringify(m.gscrollScroll), 'graphScroll', JSON.stringify(m.graphScroll), 'page', JSON.stringify(m.page));
console.log('nodes', JSON.stringify(m.nodes.map(n => [n.text.split(' | ')[0], n.left, n.top, n.li.w, n.li.h])));
console.log('edges', JSON.stringify(m.edges));
c.close();
