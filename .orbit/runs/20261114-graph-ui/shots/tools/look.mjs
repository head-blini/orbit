import { connect } from './c.mjs';
const c = await connect(9333, '1420');
await c.view(1400, 900);
await new Promise(r => setTimeout(r, 500));
console.log(await c.ev(`(() => { const g=document.querySelector('.graph'); return document.querySelector('.sessions').outerHTML.slice(0,2500) + '\\n----\\n' + (g? g.outerHTML.slice(0,4000): 'no .graph'); })()`));
c.close();
