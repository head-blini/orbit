import { connect } from './c.mjs';
const c = await connect(9333, '1420');
console.log(await c.ev(`(() => { const out = []; for (const e of document.querySelectorAll('body *, body')) { const s = getComputedStyle(e); for (const p of ['color','backgroundColor','borderTopColor','borderLeftColor','outlineColor']) { if (s[p] === 'rgb(0, 0, 0)') out.push([e.tagName, e.className, p, s.borderTopStyle, s.borderTopWidth, s.outlineStyle].join(' ')); } } return JSON.stringify([...new Set(out)].slice(0, 20)); })()`));
c.close();
