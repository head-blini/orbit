import { connect } from './d.mjs';
const c = await connect(9333, '1420');
console.log(await c.ev(`(() => { const b = [...document.querySelectorAll('.graph button')].filter(e => e.innerText.includes('engineer') && e.innerText.includes('실행'))[0]; if (!b) return 'none'; b.click(); return b.innerText.split('\\n').join(' | ') + ' aria-current=' + b.getAttribute('aria-current'); })()`));
c.close();
