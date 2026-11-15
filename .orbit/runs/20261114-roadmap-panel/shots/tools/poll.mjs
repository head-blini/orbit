// 앱이 켜진 채로 ROADMAP.md를 고치고 패널이 바뀌는 시간을 잰다. env: EDIT(1이면 항목 하나를 [x]로)
import fs from 'node:fs';
import { connect, sleep, P } from './d.mjs';
const c = await connect(9333, '1420');
const f = P + '/ROADMAP.md';
const sum = () => c.ev(`(document.querySelector('.rm-sum')||{}).innerText||document.querySelector('.detail').innerText.split('\\n').slice(1).join(' / ')`);
console.log('before', JSON.stringify(await sum()));
if (process.env.EDIT) {
  const s = fs.readFileSync(f, 'utf8').replace('- [ ] 에이전트 그래프', '- [x] 에이전트 그래프');
  fs.writeFileSync(f, s);
}
const t0 = Date.now();
let prev = '';
while (Date.now() - t0 < 45000) {
  const v = await sum();
  if (v !== prev) { console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(v)); prev = v; if (/^3/.test(v)) break; }
  await sleep(1000);
}
console.log('marks', await c.ev(`JSON.stringify([...document.querySelectorAll('.mk')].map(e=>e.textContent))`), await c.ev(`document.querySelector('.rm-bar i').style.width`));
c.close();
