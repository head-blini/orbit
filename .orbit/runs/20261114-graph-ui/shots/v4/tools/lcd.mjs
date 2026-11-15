import fs from 'node:fs';
import { connect } from './c.mjs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v4/';
const dir = process.env.APPDATA + '/dev.orbit.app/screens/';
const c = await connect(9333, '1420');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const before = fs.readdirSync(dir).sort();
const png = before.find(f => /\.png$/i.test(f)), gif = before.find(f => /\.gif$/i.test(f));
const mine = ['qa-t1.png', 'qa-t2.gif', 'qa-t3.svg', 'qa-t4.txt'];
try {
  fs.copyFileSync(dir + png, dir + 'qa-t1.png'); fs.copyFileSync(dir + gif, dir + 'qa-t2.gif');
  fs.writeFileSync(dir + 'qa-t3.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'); fs.writeFileSync(dir + 'qa-t4.txt', 'x');
  const list = await c.ev(`window.__TAURI_INTERNALS__.invoke('list_screens').then(l=>JSON.stringify(l.map(p=>String(p).split(/[\\\\/]/).pop())))`);
  console.log('before', JSON.stringify(before));
  console.log('list_screens', list);
  const img = () => c.ev(`(() => { const i=document.querySelector('.lcd img'), b=document.querySelector('.lcd'); if(!i) return 'no img'; const r=i.getBoundingClientRect(), p=b.getBoundingClientRect(); return JSON.stringify({src:decodeURIComponent(i.src).split(/[\\\\/]/).pop(), nat:[i.naturalWidth,i.naturalHeight], box:[Math.round(r.width),Math.round(r.height)], parent:[Math.round(p.width),Math.round(p.height)], fit:getComputedStyle(i).objectFit, ir:getComputedStyle(i).imageRendering, parentH_chat:Math.round(document.querySelector('.chat').getBoundingClientRect().height)+'/'+Math.round(document.querySelector('.console').getBoundingClientRect().height)}); })()`);
  console.log('img0', await img());
  const seen = [];
  for (let k = 0; k < 10; k++) { await c.ev(`document.querySelector('.lcd').click()`); await sleep(700); seen.push(JSON.parse(await img()).src); }
  console.log('click cycle', JSON.stringify(seen));
  await c.shot(S + 'lcd.png');
  // 폴더 열기
  console.log('open btn', await c.ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='폴더 열기'); b.click(); return 'clicked'})()`));
  await sleep(1500);
  console.log('detail error text', await c.ev(`/오류|✕ /.test(document.querySelector('.detail').innerText)`));
} finally {
  for (const f of mine) try { fs.unlinkSync(dir + f); } catch {}
  console.log('after cleanup', JSON.stringify(fs.readdirSync(dir).sort()), 'same as before:', JSON.stringify(fs.readdirSync(dir).sort()) === JSON.stringify(before));
  c.close();
}
