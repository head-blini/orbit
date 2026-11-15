import { connect } from './c.mjs';
const c = await connect(9333, '1420');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NL = String.fromCharCode(10);
console.log('sessions:', await c.ev(`JSON.stringify([...document.querySelectorAll('.sess')].map(b=>b.innerText.split(String.fromCharCode(10)).join(' | ')))`));
const n = await c.ev(`document.querySelectorAll('.sess').length`);
for (let i = 0; i < n; i++) {
  await c.ev(`document.querySelectorAll('.sess')[${i}].click()`); await sleep(800);
  console.log(i, await c.ev(`JSON.stringify([...document.querySelectorAll('.graph li')].map(li=>li.innerText.split(String.fromCharCode(10)).join(' | ')))`));
}
await c.ev(`document.querySelectorAll('.sess')[0].click()`); await sleep(500);
console.log('detail:', (await c.ev(`document.querySelector('.detail').innerText`)).split(NL).join(' | '));
c.close();
