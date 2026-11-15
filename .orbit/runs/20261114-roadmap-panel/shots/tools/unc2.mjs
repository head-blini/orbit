import { connect, sleep } from './d.mjs';
const c = await connect(9333, '1420');
await c.ev(`[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()==='x').click()`);
await sleep(1500);
console.log('x(UNC cwd) =>', await c.ev(`(() => { const t=document.body.innerText; const i=t.indexOf('로드맵'); return t.slice(i, t.indexOf('채팅', i)).trim().split('\\n').filter(Boolean).join(' / ') })()`));
c.close();
