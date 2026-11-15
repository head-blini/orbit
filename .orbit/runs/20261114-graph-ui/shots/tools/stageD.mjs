import { hook, H } from './d.mjs';
for (let i = 1; i <= 6; i++) await hook(H('UserPromptSubmit', 'qa-s' + i, { cwd: 'C:\\qa\\s' + i }));
