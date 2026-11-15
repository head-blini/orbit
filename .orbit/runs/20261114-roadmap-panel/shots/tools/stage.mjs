// 시안과 같은 노드: Lead + architect/plan-checker 끝남 + engineer 끝남 2·실행 1 + reviewer 대기. 접두사 orbit: 를 붙여 보낸다.
import { hook, H, agent, sleep, SID1, PW } from './d.mjs';
const S = SID1, cwd = PW;
await hook(H('UserPromptSubmit', S, { cwd }));
await agent(S, cwd, 1, 'orbit:architect', 'done', { ms: 130000, tokens: 41000 });
await sleep(300);
await agent(S, cwd, 2, 'orbit:plan-checker', 'done', { ms: 40000, tokens: 12000 });
await sleep(300);
for (const n of [3, 4, 5]) await agent(S, cwd, n, 'orbit:engineer', 'run');
const post = async (n, ms, tokens) => {
  await hook(H('SubagentStop', S, { cwd, agent_id: 'a-' + n, agent_type: 'orbit:engineer' }));
  await hook(H('PostToolUse', S, { cwd, tool_name: 'Agent', tool_use_id: 't-' + n, tool_response: { status: 'completed', agentId: 'a-' + n, totalTokens: tokens, totalDurationMs: ms } }));
};
await post(3, 302000, 88000);
await post(4, 271000, 70000);
await sleep(300);
await agent(S, cwd, 6, 'orbit:reviewer', 'wait');
await hook(H('PreToolUse', S, { cwd, tool_name: 'Read', tool_use_id: 'r-1' }));
console.log('staged');
