import { hook, H, sleep, log } from './d.mjs';
const which = process.argv[2];
if (which === 'tall') {
  const SID = 'c0222222-5b7d-4e08-9a61-0c4d2b8e7f15', cwd = 'C:\\qa\\qa-tall';
  await hook(H('UserPromptSubmit', SID, { cwd }));
  for (let n = 1; n <= 8; n++) await hook(H('PreToolUse', SID, { cwd, tool_name: 'Agent', tool_use_id: 't-' + n, tool_input: { subagent_type: 'worker' + n, description: 'd' } }));
}
if (which === 'states') {
  const SID = 'c0333333-5b7d-4e08-9a61-0c4d2b8e7f15', cwd = 'C:\\qa\\qa-states';
  await hook(H('UserPromptSubmit', SID, { cwd }));
  const pre = (n, t) => hook(H('PreToolUse', SID, { cwd, tool_name: 'Agent', tool_use_id: 't-' + n, tool_input: { subagent_type: t, description: 'd' } }));
  await pre(1, 'architect');
  await hook(H('SubagentStart', SID, { cwd, agent_id: 'a-1', agent_type: 'architect' }));
  await hook(H('SubagentStop', SID, { cwd, agent_id: 'a-1', agent_type: 'architect' }));
  await hook(H('PostToolUse', SID, { cwd, tool_name: 'Agent', tool_use_id: 't-1', tool_response: { status: 'completed', agentId: 'a-1', totalTokens: 41000, totalDurationMs: 130000 } }));
  await pre(2, 'qa');
  await hook(H('PostToolUseFailure', SID, { cwd, tool_name: 'Agent', tool_use_id: 't-2', error: 'boom' }));
  // 알 수 없음: 로그에 tool_use만(결과 없음)
  const D = process.env.TEMP + '/orbit-qa4/projects/qa-proj/';
  log(SID, [{ type: 'assistant', sessionId: SID, cwd, timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'u9', name: 'Agent', input: { subagent_type: 'librarian', description: 'd' } }] } }]);
}
console.log('sent', which);
