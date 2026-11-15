import { connect } from './c.mjs';
const c = await connect(9333, '1420'); const sleep = ms => new Promise(r => setTimeout(r, ms));
await c.ev(`[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='폴더 열기').click()`); await sleep(1500);
const t = await c.ev(`document.querySelector('.detail').innerText`);
console.log('error text present:', /오류|실패|error|denied|scope/i.test(t.split(String.fromCharCode(10)).slice(-12).join(' ')));
c.close();
