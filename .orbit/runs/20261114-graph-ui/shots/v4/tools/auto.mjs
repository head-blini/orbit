import { connect } from './c.mjs';
import { M3 } from './m3.mjs';
import { hook, H, sleep } from './d.mjs';
import fs from 'node:fs';
const S = 'C:/Users/lclk1/Projects/orbit/.orbit/runs/20261114-graph-ui/shots/v4/';
const SID = 'c0444444-5b7d-4e08-9a61-0c4d2b8e7f15', cwd = 'C:\\qa\\qa-wide';
const c = await connect(9333, '1420');
await c.view(1400, 900);
const pre = (n, t) => hook(H('PreToolUse', SID, { cwd, tool_name: 'Agent', tool_use_id: 't-' + n, tool_input: { subagent_type: t, description: 'd' } }));
const post = (n) => hook(H('PostToolUse', SID, { cwd, tool_name: 'Agent', tool_use_id: 't-' + n, tool_response: { status: 'completed', totalTokens: 1000, totalDurationMs: 5000 } }));
const snap = async (label) => {
  await sleep(1500);
  const j = JSON.parse(await c.ev(M3));
  const run = j.nodes.filter(n => /실행 중|대기/.test(n.text) && n.left !== '0px').pop();
  const o = { label, gscrollLeft: j.gscrollScroll.scrollLeft, gscrollTop: j.gscrollScroll.scrollTop, scrollWidth: j.gscrollScroll.scrollWidth, clientWidth: j.gscrollScroll.clientWidth, gscrollRight: j.gscroll.right, h2: j.h2, targetLi: run && [run.text.split(' | ')[0], run.li.x, run.li.right], panelGraphScroll: [j.graphScroll.scrollLeft, j.graphScroll.scrollTop], docScroll: j.page.docScroll.slice(0, 2), others: Object.fromEntries(Object.entries(j.others).map(([k, v]) => [k, v && [v.scrollLeft, v.scrollTop]])) };
  console.log(JSON.stringify(o)); return { j, o };
};
await hook(H('UserPromptSubmit', SID, { cwd }));
await sleep(1500);
await c.ev(`[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()==='qa-wide').click()`);
for (let n = 1; n <= 6; n++) { await pre(n, 'step' + n); if (n < 6) await post(n); }
const a = await snap('1 six columns, step6 running');
await c.shot(S + 'app-wide.png');
// 사용자 조작: 가로 휠로 맨 왼쪽
const gb = a.j.gscroll;
await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: gb.x + 200, y: gb.y + 100, deltaX: -5000, deltaY: 0 });
await sleep(1200);
const b = await snap('2 after user wheel to left');
await c.shot(S + 'app-wide-userleft.png');
console.log('waiting 40s with no events');
await sleep(40000);
const d40 = await snap('3 after 40s idle');
// 다른 노드 상태 바꾸는 Post: step6 완료 → 상태 변화
await post(6);
const e = await snap('4 step6 done (state change, user manual)');
// 새 열 Pre
await pre(7, 'step7');
const f = await snap('5 new column step7 running');
// 다른 세션 갔다 돌아오기
await c.ev(`[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()==='my-blog').click()`);
await sleep(800);
await c.ev(`[...document.querySelectorAll('.sess')].find(e=>e.querySelector('.name').textContent.trim()==='qa-wide').click()`);
const g = await snap('6 back to qa-wide (manual reset)');
await c.shot(S + 'app-wide-back.png');
fs.writeFileSync(S + 'app-wide-measure.json', JSON.stringify({ a: a.o, b: b.o, d40: d40.o, e: e.o, f: f.o, g: g.o }, null, 1));
c.close();
