// env: SESS(세션 이름 클릭) VW VH OUT(png) WAIT BTN(버튼 aria-label 클릭)
import { connect, sleep } from './d.mjs';
const c = await connect(9333, '1420');
const { SESS, OUT, BTN } = process.env;
if (process.env.VW) await c.view(+process.env.VW, +process.env.VH);
if (SESS) console.log('sess', await c.ev(`(() => { const b=[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()===${JSON.stringify(SESS)}); if(!b) return 'none'; b.click(); return 'ok'; })()`));
if (BTN) console.log('btn', await c.ev(`(() => { const b=document.querySelector('button[aria-label=${JSON.stringify(BTN)}]'); if(!b) return 'none'; if(b.disabled) return 'disabled'; b.click(); return 'ok'; })()`));
await sleep(+(process.env.WAIT || 1500));
await c.ev(`document.activeElement && document.activeElement.blur()`);
console.log('TEXT>>', await c.ev(`document.body.innerText`));
console.log('TOPBAR>>', await c.ev(`(()=>{const t=document.querySelector('.topbar'); if(!t) return 'none'; const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]}; return JSON.stringify({bar:r(t), scrollW:t.scrollWidth, clientW:t.clientWidth, kids:[...t.querySelectorAll('*')].filter(e=>e.children.length===0).map(e=>[e.className||e.tagName, e.innerText, r(e), e.title||''])})})()`));
console.log('PANEL>>', await c.ev(`(()=>{const d=document.querySelector('.detail'); if(!d) return 'none'; const b=d.querySelector('.rm-bar'); return JSON.stringify({prog: b && [b.getAttribute('aria-valuenow'), b.getAttribute('aria-valuemax'), b.getAttribute('aria-valuetext'), b.querySelector('i').style.width], marks:[...d.querySelectorAll('.mk')].map(e=>e.textContent), items:[...d.querySelectorAll('li')].map(e=>e.innerText), h3:[...d.querySelectorAll('h3')].map(e=>e.innerText)})})()`));
if (OUT) { await c.shot(OUT); console.log('shot', OUT); }
console.log('VP', await c.ev(`innerWidth+'x'+innerHeight+' orbit: in body? '+document.body.innerText.includes('orbit:')+' html has orbit: '+document.documentElement.outerHTML.includes('orbit:')`));
c.close();
