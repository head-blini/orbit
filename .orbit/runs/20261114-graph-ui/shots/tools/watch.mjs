import { connect } from './c.mjs';
const c = await connect(9333, '1420');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const end = Date.now() + (+process.argv[2] || 90) * 1000; let last = '', sel = false;
while (Date.now() < end) {
  if (true) sel = (await c.ev(`(()=>{const b=document.querySelector('.sess');if(b){b.click();return true}return false})()`));
  const t = await c.ev(`JSON.stringify([...document.querySelectorAll('.graph li')].map(li=>({cls:(li.querySelector('button')||li).className, t:li.innerText.split(String.fromCharCode(10)).join(' | ')})))`);
  if (t !== last) { console.log(new Date().toISOString().slice(11,19), t); last = t; }
  await sleep(700);
}
c.close();
