import { connect } from '../../v4/tools/c.mjs';
const c = await connect(9333, '1420');
const s = await c.ev(`window.__TAURI_INTERNALS__.invoke('get_status').then(r => JSON.stringify({settings_path:r.settings_path, projects_dir:r.projects_dir, listen:r.listen||r.addr||r.hook_addr, screens_dir:r.screens_dir, keys:Object.keys(r)}))`);
console.log(s);
c.close();
