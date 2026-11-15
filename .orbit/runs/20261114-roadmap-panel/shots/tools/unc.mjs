// 위험한 cwd 모양 세션들. 각각 세션 이름(마지막 폴더)으로 고른다.
import { hook, H, sleep, connect } from './d.mjs';
const cases = { uncx: ['c0000001-0000-4000-8000-000000000001', '\\\\127.0.0.1\\c$\\x'], devx: ['c0000002-0000-4000-8000-000000000002', '\\\\.\\C:\\devx'], relx: ['c0000003-0000-4000-8000-000000000003', 'relx'], nodirx: ['c0000004-0000-4000-8000-000000000004', 'C:\\orbit-qa5-does-not-exist\\nodirx'] };
for (const [, [sid, cwd]] of Object.entries(cases)) await hook(H('UserPromptSubmit', sid, { cwd }));
await sleep(1500);
const c = await connect(9333, '1420');
console.log('sessions:', await c.ev(`JSON.stringify([...document.querySelectorAll('.sess .name')].map(e=>e.textContent.trim()))`));
for (const name of Object.keys(cases)) {
  const r = await c.ev(`(() => { const b=[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()===${JSON.stringify(name)}); if(!b) return 'no session'; b.click(); return 'ok'; })()`);
  await sleep(1200);
  const txt = await c.ev(`(() => { const t=document.body.innerText; const i=t.indexOf('로드맵'); return t.slice(i, t.indexOf('채팅', i)).trim().split('\\n').filter(Boolean).join(' / ') })()`);
  console.log(name, r, '=>', txt);
}
c.close();
