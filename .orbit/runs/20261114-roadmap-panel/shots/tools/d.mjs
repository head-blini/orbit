import fs from 'node:fs';
export { connect } from 'file:///C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/tools/c.mjs';
const cfg = JSON.parse(fs.readFileSync(process.env.APPDATA + '/dev.orbit.app/hook-server.json', 'utf8'));
export const D = process.env.TEMP + '/orbit-qa5/projects/qa-proj/';
export const P = process.env.TEMP + '/orbit-qa5/proj';
export const PW = P.replace(/\//g, '\\');
export const GP = (process.env.TEMP + '/orbit-qa5/gp').replace(/\//g, '\\');
export const SID1 = '3f2a9c1e-5b7d-4e08-9a61-0c4d2b8e7f15';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function hook(o) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/events`, { method: 'POST', headers: { 'X-Orbit-Token': cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
  if (r.status !== 200 && r.status !== 204) console.log('hook status', r.status, o.hook_event_name);
}
export function log(sid, lines) { fs.appendFileSync(D + sid + '.jsonl', lines.map(l => JSON.stringify(l)).join('\n') + '\n'); }
export const H = (ev, sid, extra = {}) => ({ hook_event_name: ev, session_id: sid, ...extra });
export async function agent(sid, cwd, n, type, state, extra = {}) {
  await hook(H('PreToolUse', sid, { cwd, tool_name: 'Agent', tool_use_id: 't-' + n, tool_input: { subagent_type: type, description: 'd' } }));
  await hook(H('SubagentStart', sid, { cwd, agent_id: 'a-' + n, agent_type: type }));
  if (state === 'wait') await hook(H('PermissionRequest', sid, { cwd, agent_id: 'a-' + n, tool_name: 'Bash' }));
  if (state === 'done') {
    await hook(H('SubagentStop', sid, { cwd, agent_id: 'a-' + n, agent_type: type }));
    await hook(H('PostToolUse', sid, { cwd, tool_name: 'Agent', tool_use_id: 't-' + n, tool_response: { status: 'completed', agentId: 'a-' + n, totalTokens: extra.tokens ?? 41000, totalDurationMs: extra.ms ?? 130000 } }));
  }
}
