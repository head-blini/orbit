import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(process.env.APPDATA + '/dev.orbit.app/hook-server.json', 'utf8'));
const D = process.env.TEMP + '/orbit-qa4/projects/qa-proj/';
export const SID1 = '3f2a9c1e-5b7d-4e08-9a61-0c4d2b8e7f15';
export const SID2 = '7b1e4d20-8c3a-4f55-b2d9-6a0e5c1f9d33';
export async function hook(o) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/events`, { method: 'POST', headers: { 'X-Orbit-Token': cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
  if (r.status !== 200 && r.status !== 204) console.log('hook status', r.status, o.hook_event_name);
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function log(sid, lines) { fs.appendFileSync(D + sid + '.jsonl', lines.map(l => JSON.stringify(l)).join('\n') + '\n'); }
export const H = (ev, sid, extra = {}) => ({ hook_event_name: ev, session_id: sid, ...extra });
// 서브에이전트 하나(hook 경로). state: run | done | wait
export async function agent(sid, n, type, state, extra = {}) {
  await hook(H('PreToolUse', sid, { tool_name: 'Agent', tool_use_id: 't-' + n, tool_input: { subagent_type: type, description: 'd' } }));
  await hook(H('SubagentStart', sid, { agent_id: 'a-' + n, agent_type: type }));
  if (state === 'wait') await hook(H('PermissionRequest', sid, { agent_id: 'a-' + n, tool_name: 'Bash' }));
  if (state === 'done') {
    await hook(H('SubagentStop', sid, { agent_id: 'a-' + n, agent_type: type }));
    await hook(H('PostToolUse', sid, { tool_name: 'Agent', tool_use_id: 't-' + n, tool_response: { status: 'completed', agentId: 'a-' + n, totalTokens: extra.tokens ?? 41000, totalDurationMs: extra.ms ?? 130000 } }));
  }
}
