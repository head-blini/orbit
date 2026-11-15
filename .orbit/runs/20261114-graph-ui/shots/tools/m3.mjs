// v3 측정 식. 시안·앱 공용.
export const M3 = `(() => {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return {x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1), right:+b.right.toFixed(1)}; };
  const q = s => document.querySelector(s);
  const gs = q('.gscroll'), cv = q('.canvas'), gp = q('section.graph');
  const sc = e => e && {scrollLeft:e.scrollLeft, scrollTop:e.scrollTop, scrollWidth:e.scrollWidth, clientWidth:e.clientWidth, scrollHeight:e.scrollHeight, clientHeight:e.clientHeight};
  const node = li => { const b = li.querySelector('button')||li; const c = getComputedStyle(b); const p = b.querySelector('.pbar'); const pc = p && getComputedStyle(p); const pi = p && getComputedStyle(p.querySelector('i'));
    return { text: li.innerText.replace(/\\n/g,' | '), li: r(li), left: li.style.left, top: li.style.top, btn: r(b), cls: b.className,
      border: c.borderTopWidth+' '+c.borderTopStyle+' '+c.borderTopColor, radius: c.borderTopLeftRadius, shadow: c.boxShadow, bg: c.backgroundColor, color: c.color, padding: c.padding,
      pbar: p && {radius: pc.borderTopLeftRadius, fillRadius: pi.borderTopLeftRadius, h: pc.height, border: pc.borderTopWidth} }; };
  return JSON.stringify({ vp:[innerWidth,innerHeight],
    page: {docScroll:[document.documentElement.scrollLeft, document.documentElement.scrollTop, document.documentElement.scrollWidth, document.documentElement.scrollHeight], bodyScroll:[document.body.scrollLeft, document.body.scrollTop]},
    graph: r(gp), graphScroll: sc(gp), h2: r(gp&&gp.querySelector('h2')),
    gscroll: r(gs), gscrollScroll: sc(gs), gscrollPad: gs && getComputedStyle(gs).padding, canvas: r(cv), svg: r(q('.edges')),
    others: Object.fromEntries(['.sessions','.detail','.chat','.console'].map(s => [s, sc(q(s))])),
    nodes: [...document.querySelectorAll('.nodes li')].map(node),
    edges: [...document.querySelectorAll('.edges path')].map(p => p.getAttribute('d') + (p.getAttribute('class').includes('flow') ? ' [flow]' : '')),
    sideNote: (e => e && e.innerText)(q('.side-note'))
  }, null, 1);
})()`;
