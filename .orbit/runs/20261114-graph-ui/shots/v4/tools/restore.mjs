import { connect } from './c.mjs';
const c = await connect(9333, '1420');
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(3000);
const n = await c.ev(`document.querySelectorAll('.sess').length`);
for (let i = 0; i < n; i++) {
  await c.ev(`document.querySelectorAll('.sess')[${i}].click()`);
  await sleep(700);
  console.log(i, await c.ev(`JSON.stringify([...document.querySelectorAll('.nodes li')].map(li=>[li.innerText.split(String.fromCharCode(10)).join('/'), li.style.left, li.style.top]))`));
}
await c.ev(`document.querySelectorAll('.sess')[0].click()`);
await sleep(500);
await c.shot('C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v4/restore-session0.png');
c.close();
