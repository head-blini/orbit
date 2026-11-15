import { connect } from './c.mjs';
const c = await connect(9333, '1420');
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('.sess')].map(b=>b.innerText.split(String.fromCharCode(10)).join('|')))`));
c.close();
