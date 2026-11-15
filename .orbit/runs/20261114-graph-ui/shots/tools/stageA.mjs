import { hook, H, agent, log, sleep, SID1, SID2 } from './d.mjs';
// 오래된 세션부터: notes(로그, 멈춤), api-server(에러), my-blog(대기), orbit(작업 중)
log(SID2, [{ type: 'user', sessionId: SID2, cwd: 'C:\\qa\\notes', timestamp: '2026-11-12T09:10:00.000Z', message: { role: 'user', content: 'x' } }]);
await sleep(2500);
await hook(H('UserPromptSubmit', 'qa-err', { cwd: 'C:\\qa\\api-server' }));
await hook(H('StopFailure', 'qa-err', { cwd: 'C:\\qa\\api-server', error: 'server_error' }));
await hook(H('UserPromptSubmit', 'qa-blog', { cwd: 'C:\\qa\\my-blog' }));
await hook(H('Notification', 'qa-blog', { cwd: 'C:\\qa\\my-blog', notification_type: 'permission_prompt' }));
await hook(H('UserPromptSubmit', SID1, { cwd: 'C:\\qa\\orbit' }));
await agent(SID1, 1, 'architect', 'done', { ms: 130000, tokens: 41000 });
await agent(SID1, 2, 'engineer', 'run');
// qa: 훅으로 노드를 만들고 실패 시각은 로그 결과 줄(시작+48초)로 넣는다
await hook(H('PreToolUse', SID1, { tool_name: 'Agent', tool_use_id: 't-3', tool_input: { subagent_type: 'qa', description: 'd' } }));
await hook(H('SubagentStart', SID1, { agent_id: 'a-3', agent_type: 'qa' }));
await agent(SID1, 4, 'reviewer', 'wait');
await sleep(300);
const t = Date.now();
log(SID1, [
  { type: 'user', sessionId: SID1, cwd: 'C:\\qa\\orbit', timestamp: new Date(t).toISOString(), message: { role: 'user', content: 'x' } },
  { type: 'user', sessionId: SID1, cwd: 'C:\\qa\\orbit', timestamp: new Date(t + 48000).toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't-3', is_error: true }] } },
  { type: 'assistant', sessionId: SID1, cwd: 'C:\\qa\\orbit', timestamp: new Date(t).toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'u5', name: 'Agent', input: { subagent_type: 'librarian', description: 'd' } }] } },
]);
console.log('stage A sent');
