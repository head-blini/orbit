import fs from 'node:fs';
const B = String.fromCharCode(92);
const D = process.env.TEMP + '/orbit-qa4/projects/qa-proj/';
const L = [{type:'user',sessionId:'9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',cwd:'C:'+B+'qa'+B+'stall',timestamp:'2000-03-01T00:00:00.000Z',message:{role:'user',content:'x'}},
{type:'assistant',sessionId:'9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',timestamp:'2000-03-01T00:00:01.000Z',message:{role:'assistant',content:[{type:'tool_use',id:'u1',name:'Agent',input:{subagent_type:'qa-u',description:'d'}}]}}];
fs.writeFileSync(D + '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f.jsonl', L.map(x => JSON.stringify(x)).join('\n') + '\n');
