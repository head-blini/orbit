import { connect } from './c.mjs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v4/';
const c = await connect(9333, '1420');
const sleep = ms => new Promise(r => setTimeout(r, ms));
await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft' });
await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft' });
for (const [name, nth, file] of [['Lead', 0, 'ring-lead'], ['engineer', 0, 'ring-top-engineer'], ['late-runner2', 0, 'ring-last-col']]) {
  await c.ev(`document.querySelector('.gscroll').scrollTo({left:${name === 'Lead' ? 0 : 99999},behavior:'auto'})`);
  await sleep(300);
  await c.ev(`[...document.querySelectorAll('.graph button')].filter(b=>b.innerText.includes(${JSON.stringify(name)}))[${nth}].focus()`);
  await sleep(300);
  const r = JSON.parse(await c.ev(`(()=>{const a=document.activeElement.getBoundingClientRect(), g=document.querySelector('.gscroll').getBoundingClientRect(); return JSON.stringify({a:[a.x,a.y,a.right,a.bottom], g:[g.x,g.y,g.right,g.bottom], ringRoom:[a.x-g.x-4, a.y-g.y-4, g.right-a.right-4, g.bottom-a.bottom-4], fv:document.activeElement.matches(':focus-visible'), sl:document.querySelector('.gscroll').scrollLeft})})()`));
  console.log(name, JSON.stringify(r));
  await c.shot(S + file + '.png', { x: Math.max(0, r.a[0] - 20), y: Math.max(0, r.a[1] - 20), width: 168 + 40, height: 60 + 40, scale: 3 });
}
c.close();
