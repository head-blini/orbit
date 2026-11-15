// R4 확인: Lead 셋째 줄. 토큰은 d.mjs 안에서만 읽는다(출력 없음).
import { connect } from '../../v4/tools/c.mjs';
import { M3 } from '../../v4/tools/m3.mjs';
import { hook, H, agent, log, sleep, SID1, SID2 } from '../../v4/tools/d.mjs';
import fs from 'node:fs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v5/';
const c = await connect(9333, '1420');
await c.view(1400, 900);
log(SID2, [{ type: 'user', sessionId: SID2, cwd: 'C:\\qa\\notes', timestamp: '2026-11-12T09:10:00.000Z', message: { role: 'user', content: 'x' } }]);
await sleep(2500);
await hook(H('UserPromptSubmit', 'qa-err', { cwd: 'C:\\qa\\api-server' }));
await hook(H('StopFailure', 'qa-err', { cwd: 'C:\\qa\\api-server', error: 'server_error' }));
await hook(H('UserPromptSubmit', 'qa-blog', { cwd: 'C:\\qa\\my-blog' }));
await hook(H('PermissionRequest', 'qa-blog', { cwd: 'C:\\qa\\my-blog', tool_name: 'Bash' }));
await hook(H('UserPromptSubmit', 'qa-done', { cwd: 'C:\\qa\\done-one' }));
await hook(H('Stop', 'qa-done', { cwd: 'C:\\qa\\done-one' }));
await hook(H('UserPromptSubmit', SID1, { cwd: 'C:\\qa\\orbit' }));
await agent(SID1, 1, 'architect', 'done', { ms: 130000, tokens: 41000 });
await agent(SID1, 2, 'plan-checker', 'done', { ms: 40000, tokens: 12000 });
for (const n of [3, 4, 5]) await agent(SID1, n, 'engineer', 'run');
const post = async (n, ms, tokens) => {
  await hook(H('SubagentStop', SID1, { agent_id: 'a-' + n, agent_type: 'engineer' }));
  await hook(H('PostToolUse', SID1, { tool_name: 'Agent', tool_use_id: 't-' + n, tool_response: { status: 'completed', agentId: 'a-' + n, totalTokens: tokens, totalDurationMs: ms } }));
};
await post(3, 302000, 88000);
await post(4, 271000, 70000);
await agent(SID1, 6, 'reviewer', 'wait');
await hook(H('PreToolUse', SID1, { cwd: 'C:\\qa\\orbit', tool_name: 'Read', tool_use_id: 'r-1' }));
await sleep(2500);
const pick = n => c.ev(`(() => { const b=[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()===${JSON.stringify(n)}); if(!b) return 'none'; b.click(); return 'ok'; })()`);
const lead = () => c.ev(`(() => { const li=document.querySelector('.nodes li'); const b=li.querySelector('button')||li; const r=li.getBoundingClientRect(); return JSON.stringify({text:li.innerText.replace(/\\n/g,' | '), cls:b.className, pbar:!!li.querySelector('.pbar'), w:r.width, h:r.height, left:li.style.left, top:li.style.top}); })()`);
for (const [name, file] of [['done-one', 'lead-stop'], ['api-server', 'lead-error'], ['my-blog', 'lead-wait'], ['notes', 'lead-stalled'], ['orbit', 'lead-run']]) {
  const ok = await pick(name); await sleep(1500);
  await c.ev(`document.activeElement && document.activeElement.blur()`);
  console.log(name, ok, await lead());
  const g = JSON.parse(await c.ev(M3)).graph;
  await c.shot(S + file + '-graph.png', { x: g.x, y: g.y, width: g.w, height: g.h });
  if (name === 'orbit') { await c.shot(S + 'app-A.png'); fs.writeFileSync(S + 'app-A-measure.json', await c.ev(M3)); }
}
c.close();
