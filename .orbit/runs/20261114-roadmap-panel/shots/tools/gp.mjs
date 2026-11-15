// 두 번째 세션 "gp": general-purpose·Plan 노드(접두사 없는 종류) + a:b:c 같은 다른 접두사
import { hook, H, agent, GP } from './d.mjs';
const S = '7b1e4d20-8c3a-4f55-b2d9-6a0e5c1f9d33';
await hook(H('UserPromptSubmit', S, { cwd: GP }));
await agent(S, GP, 11, 'general-purpose', 'run');
await agent(S, GP, 12, 'other-plugin:reviewer', 'run');
console.log('gp staged');
