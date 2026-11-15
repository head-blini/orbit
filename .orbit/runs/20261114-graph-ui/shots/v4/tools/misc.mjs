import fs from 'node:fs';
import { connect } from './c.mjs';
import { hook, H, sleep } from './d.mjs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v4/';
const cfg = JSON.parse(fs.readFileSync(process.env.APPDATA + '/dev.orbit.app/hook-server.json', 'utf8'));
const c = await connect(9333, '1420');
await c.view(1400, 900);
// 기준 13: XSS 문자열
await hook(H('UserPromptSubmit', 'qa-xss', { cwd: 'C:\\qa\\<img src=x>' }));
await hook(H('PreToolUse', 'qa-xss', { cwd: 'C:\\qa\\<img src=x>', tool_name: 'Agent', tool_use_id: 'x1', tool_input: { subagent_type: '<b>x</b>', description: 'd' } }));
await hook(H('SubagentStart', 'qa-xss', { cwd: 'C:\\qa\\<img src=x>', agent_id: 'qa1', agent_type: '<b>x</b>' }));
await sleep(1500);
await c.ev(`[...document.querySelectorAll('.sess')].find(e=>e.innerText.includes('<img')).click()`);
await sleep(800);
console.log('xss graph', await c.ev(`JSON.stringify([...document.querySelectorAll('.nodes li')].map(li=>li.innerText.split(String.fromCharCode(10)).join('|')))`));
console.log('xss counts .graph b / .sessions b / img[src=x]', await c.ev(`[document.querySelectorAll('.graph b').length, document.querySelectorAll('.sessions b').length, document.querySelectorAll('img[src="x"]').length].join(' / ')`));
console.log('session rows', await c.ev(`JSON.stringify([...document.querySelectorAll('.sess')].map(e=>e.innerText.split(String.fromCharCode(10)).join('|')))`));
// 기준 7: 에러 / 대기 / 완료
await hook(H('UserPromptSubmit', 'qa-done', { cwd: 'C:\\qa\\done-one' })); await hook(H('Stop', 'qa-done', { cwd: 'C:\\qa\\done-one' }));
await sleep(1500);
console.log('rows2', await c.ev(`JSON.stringify([...document.querySelectorAll('.sess')].map(e=>e.innerText.split(String.fromCharCode(10)).join('|')).filter(t=>/done-one|api-server|my-blog/.test(t)))`));
// 기준 4: 배치·색·글꼴
const lay = await c.ev(`(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const colors = new Set(); for (const e of document.querySelectorAll('body *')) { if (e.tagName === 'IMG') continue; const s = getComputedStyle(e); for (const p of ['color','backgroundColor','borderTopColor','borderLeftColor','outlineColor']) { const v = s[p]; if (v && !/rgba\\(0, 0, 0, 0\\)/.test(v)) colors.add(v); } }
  const shadowColors = new Set(); for (const e of document.querySelectorAll('body *')) { const m = getComputedStyle(e).boxShadow.match(/rgba?\\([^)]*\\)/g); if (m) m.forEach(x => shadowColors.add(x)); }
  return JSON.stringify({ topbar: r('.topbar'), sessions: r('.sessions'), graph: r('section.graph'), detail: r('.detail'), chat: r('.chat'), console: r('.console'), colors: [...colors], shadowColors: [...shadowColors], h1: getComputedStyle(document.querySelector('h1')).fontFamily, fonts: [...document.fonts].map(f => [f.family, f.status]), doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], panelBorder: getComputedStyle(document.querySelector('section.graph')).border + ' | ' + getComputedStyle(document.querySelector('section.graph')).boxShadow }); })()`);
console.log('layout', lay);
// 기준 10·11
console.log('forbidden', await c.ev(`JSON.stringify(['관문','타임라인','중계','Read','Bash','Timeline'].map(w=>[w, document.body.innerText.includes(w)]))`));
console.log('chat input', await c.ev(`JSON.stringify([...document.querySelectorAll('.chat input, .chat textarea, .chat button')].map(e=>[e.tagName, e.disabled, e.placeholder||e.innerText])) + ' | ' + document.querySelector('.chat').innerText.split(String.fromCharCode(10)).join('|')`));
console.log('font src', await c.ev(`JSON.stringify([...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.type===5).map(r=>r.cssText.slice(0,200)))`));
await c.shot(S + 'app-full-1400.png');
// 실패 경로: 잘못된 토큰 / 브라우저 Origin
const post = (headers, body) => fetch(`http://127.0.0.1:${cfg.port}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }).then(r => r.status).catch(e => 'ERR ' + e.message);
console.log('bad token', await post({ 'X-Orbit-Token': 'wrong' }, '{"hook_event_name":"Stop","session_id":"x"}'));
console.log('no token', await post({}, '{"hook_event_name":"Stop","session_id":"x"}'));
console.log('browser Origin + good token', await post({ 'X-Orbit-Token': cfg.token, Origin: 'http://evil.example' }, '{"hook_event_name":"Stop","session_id":"x"}'));
console.log('garbage body', await post({ 'X-Orbit-Token': cfg.token }, '{not json'));
console.log('oversize body', await post({ 'X-Orbit-Token': cfg.token }, JSON.stringify({ hook_event_name: 'Stop', session_id: 'x', pad: 'a'.repeat(3 * 1024 * 1024) })));
c.close();
