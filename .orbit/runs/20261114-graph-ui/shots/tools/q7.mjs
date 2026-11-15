import { hook, H, sleep } from './d.mjs';
import { connect } from './c.mjs';
const c = await connect(9333, '1420');
await hook(H('UserPromptSubmit', '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f', { cwd: 'C:' + String.fromCharCode(92) + 'qa' + String.fromCharCode(92) + 'stall' }));
await sleep(1500);
console.log(await c.ev(`JSON.stringify([...document.querySelectorAll('.graph li')].map(li=>[(li.querySelector('button')||li).className, li.innerText.split(String.fromCharCode(10)).join(' | ')]))`));
c.close();
