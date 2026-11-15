import { connect } from './c.mjs';
import fs from 'node:fs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v2/';
const c = await connect(9333, '1420'); const sleep = ms => new Promise(r => setTimeout(r, ms));
await c.view(1400, 900);
const mode = process.argv[2];
if (mode === 'hover') {
  const r = JSON.parse(await c.ev(`(()=>{const l=[...document.querySelectorAll('.sess')].filter(e=>!e.hasAttribute('aria-current'));const b=l[0].getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2,name:l[0].innerText})})()`));
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y }); await sleep(500);
  console.log(r.name, await c.ev(`JSON.stringify([...document.querySelectorAll('.sess')].map(e=>[e.matches(':hover'),getComputedStyle(e).backgroundColor,getComputedStyle(e).color]))`));
  await c.shot(S + '07-hover-session.png');
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
}
if (mode === 'focus') {
  await c.ev(`document.activeElement&&document.activeElement.blur(); window.scrollTo(0,0)`);
  for (let i = 0; i < +process.argv[3]; i++) { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await sleep(150); }
  console.log(await c.ev(`(()=>{const e=document.activeElement;const s=getComputedStyle(e);return JSON.stringify({tag:e.tagName,cls:e.className,text:e.innerText.slice(0,20),fv:e.matches(':focus-visible'),outline:s.outline,off:s.outlineOffset})})()`));
  await c.shot(S + process.argv[4] + '.png');
}
c.close();
