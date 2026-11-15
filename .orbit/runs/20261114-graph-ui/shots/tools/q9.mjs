import { connect } from './c.mjs';
const c = await connect(9333, '1420'); const sleep = ms => new Promise(r => setTimeout(r, ms));
console.log('list_screens', await c.ev(`window.__TAURI_INTERNALS__.invoke('list_screens').then(s=>JSON.stringify(s))`));
const info = () => c.ev(`(()=>{const i=document.querySelector('.console img, .screen img, img');if(!i)return 'no img';const b=i.getBoundingClientRect();const p=i.parentElement.getBoundingClientRect();return JSON.stringify({src:decodeURIComponent(i.src).split(String.fromCharCode(92)).pop(),nat:[i.naturalWidth,i.naturalHeight],box:[Math.round(b.width),Math.round(b.height)],parent:[Math.round(p.width),Math.round(p.height)],fit:getComputedStyle(i).objectFit})})()`);
console.log('img0', await info());
const seen = new Set();
for (let k = 0; k < 8; k++) { const r = JSON.parse(await c.ev(`(()=>{const b=document.querySelector('.console button');const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`)); await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1}); await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1}); await sleep(500); const i = await info(); console.log('click', k, i); }
c.close();
