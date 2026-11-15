import { connect } from './c.mjs';
const c = await connect(9333, '1420');
const sleep = ms => new Promise(r => setTimeout(r, ms));
await c.ev(`document.querySelectorAll('.sess')[0].click()`); await sleep(500);
await c.ev(`[...document.querySelectorAll('.graph button')].find(b=>b.innerText.includes('Explore')).click()`); await sleep(600);
console.log((await c.ev(`document.querySelector('.detail').innerText`)).split(String.fromCharCode(10)).slice(0,22).join(' | '));
c.close();
