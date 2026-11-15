import { connect } from './c.mjs';
const c = await connect(9333, '1420');
console.log(await c.ev(`window.__TAURI_INTERNALS__.invoke('get_status').then(s=>JSON.stringify(s))`));
console.log(await c.ev(`location.href + ' ' + innerWidth + 'x' + innerHeight`));
c.close();
