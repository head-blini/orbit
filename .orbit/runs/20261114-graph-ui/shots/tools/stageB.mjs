import { agent, hook, H, SID1 } from './d.mjs';
await agent(SID1, 6, 'designer', 'done', { ms: 95000, tokens: 22000 });
await agent(SID1, 7, 'security', 'run');
await agent(SID1, 8, 'debugger', 'done', { ms: 61000, tokens: 9500 });
await hook(H('PreToolUse', SID1, { cwd: 'C:\\qa\\orbit', tool_name: 'Read', tool_use_id: 'r-2' }));
