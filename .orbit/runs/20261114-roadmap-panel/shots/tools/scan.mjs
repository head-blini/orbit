import { connect, sleep } from './d.mjs';
const c = await connect(9333, '1420');
await c.view(1400, 900);
const sel = n => c.ev(`[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()===${JSON.stringify(n)}).click()`);
await sel('proj'); await sleep(1500);
await c.ev(`[...document.querySelectorAll('.graph button')][0].click()`); await sleep(500); // Lead 노드 클릭
const t = await c.ev(`document.body.innerText + '\\n' + [...document.querySelectorAll('[title],[aria-label]')].map(e=>(e.title||'')+' '+(e.getAttribute('aria-label')||'')).join('\\n')`);
const bad = ['출처', 'settings.json', 'projects', 'AppData', 'Users', 'screens', '3f2a9c1e', '3f2a', '종류', '시작', 'orbit:', '로그', '대상', '폴더 열기', '평문', '토큰 ', 'allowedHttpHookUrls', '상세'];
for (const w of bad) console.log(w.padEnd(20), t.includes(w) ? 'FOUND' : '-');
console.log('buttons:', await c.ev(`JSON.stringify([...document.querySelectorAll('button')].map(b=>(b.getAttribute('aria-label')||b.innerText.split('\\n').join(' ')).trim()))`));
console.log('h2:', await c.ev(`JSON.stringify([...document.querySelectorAll('h2')].map(e=>e.innerText))`));
console.log('aria-current nodes:', await c.ev(`[...document.querySelectorAll('.graph button[aria-current=true]')].map(b=>b.innerText.split('\\n')[0]).join(',')`));
c.close();
