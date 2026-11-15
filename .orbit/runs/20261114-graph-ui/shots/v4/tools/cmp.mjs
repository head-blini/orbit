import fs from 'node:fs';
const [a, b] = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const keys = ['left', 'top', 'cls', 'border', 'radius', 'shadow', 'bg', 'color', 'padding', 'pbar'];
let diffs = 0;
const nodeText = n => n.text.replace(/▶ /, '');
for (const k of ['graph', 'h2', 'gscroll', 'svg']) { const same = JSON.stringify(a[k]) === JSON.stringify(b[k]); if (!same) { diffs++; console.log('DIFF', k, JSON.stringify(a[k]), JSON.stringify(b[k])); } }
for (const k of ['scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight']) if (a.gscrollScroll[k] !== b.gscrollScroll[k]) { diffs++; console.log('DIFF gscroll', k, a.gscrollScroll[k], b.gscrollScroll[k]); }
if (a.gscrollPad !== b.gscrollPad) { diffs++; console.log('DIFF pad'); }
console.log('canvas size', a.canvas.w + 'x' + a.canvas.h, b.canvas.w + 'x' + b.canvas.h);
if (a.nodes.length !== b.nodes.length) { diffs++; console.log('DIFF node count', a.nodes.length, b.nodes.length); }
a.nodes.forEach((n, i) => { const m = b.nodes[i]; if (!m) return; for (const k of keys) if (JSON.stringify(n[k]) !== JSON.stringify(m[k])) { diffs++; console.log('DIFF node', i, k, JSON.stringify(n[k]), JSON.stringify(m[k])); } if (n.li.w !== m.li.w || n.li.h !== m.li.h) { diffs++; console.log('DIFF size', i); } });
console.log('edges equal', JSON.stringify(a.edges) === JSON.stringify(b.edges));
if (JSON.stringify(a.edges) !== JSON.stringify(b.edges)) diffs++;
console.log('texts', JSON.stringify(a.nodes.map(nodeText)), '\n     ', JSON.stringify(b.nodes.map(nodeText)));
console.log('TOTAL DIFFS (excluding scrollLeft/rtl, text)', diffs);
