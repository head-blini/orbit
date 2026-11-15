import { connect } from './c.mjs';
const c = await connect(9333, '1420');
await c.view(1400, 900);
console.log(await c.ev(`document.body.innerText`));
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('button')].map(b=>b.innerText.trim()+(b.disabled?' [disabled]':'')))`));
c.close();
