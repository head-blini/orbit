import { connect, sleep } from './d.mjs';
const c = await connect(9333, '1420');
const src = () => c.ev(`(document.querySelector('.lcd img')||{}).src ? decodeURIComponent(document.querySelector('.lcd img').src).split(/[\\\\/]/).pop().slice(-40) : 'no img'`);
const natural = () => c.ev(`(()=>{const i=document.querySelector('.lcd img'); return i? i.naturalWidth+'x'+i.naturalHeight : 'no img'})()`);
console.log('lcd before', await src(), await natural());
const seen = new Set([await src()]);
for (let i = 0; i < 6; i++) { await c.ev(`document.querySelector('.lcd').click()`); await sleep(500); seen.add(await src()); }
console.log('distinct images after 6 clicks:', seen.size, JSON.stringify([...seen]), await natural());
console.log('lcd disabled?', await c.ev(`document.querySelector('.lcd').disabled`));
c.close();
