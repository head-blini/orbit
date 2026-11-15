import { connect, sleep } from './d.mjs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-roadmap-panel/shots/';
const c = await connect(9334, 'layout_v4');
for (const [w, h, n] of [[1400, 900, 'ref-1400'], [960, 640, 'ref-960']]) {
  await c.view(w, h); await sleep(800);
  await c.shot(S + n + '.png');
  console.log(n, await c.ev(`innerWidth+'x'+innerHeight`), await c.ev(`(()=>{const t=document.querySelector('.topbar');return t.clientHeight+' '+t.scrollWidth+'/'+t.clientWidth})()`));
}
c.close();
