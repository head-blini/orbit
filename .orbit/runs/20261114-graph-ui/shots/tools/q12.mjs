import { connect } from './c.mjs';
const c = await connect(9333, '1420');
await c.view(1400, 900);
console.log(await c.ev(`(()=>{
 const t=document.body.innerText; const words=['관문','타임라인','중계','Read','Bash'].map(w=>[w,t.includes(w)]);
 const cols=new Set(); document.querySelectorAll('body *').forEach(e=>{const s=getComputedStyle(e); if(e.closest('.lcd'))return; ['color','backgroundColor','borderTopColor','borderLeftColor','outlineColor'].forEach(k=>{const v=s[k]; if(v&&v!=='rgba(0, 0, 0, 0)')cols.add(v)})});
 const fonts=[...document.fonts].map(f=>[f.family,f.status]);
 const panel=getComputedStyle(document.querySelector('.graph')); 
 const h=document.querySelector('h1'); const hs=getComputedStyle(h);
 const chat=document.querySelector('.chat').getBoundingClientRect(), con=document.querySelector('.console').getBoundingClientRect();
 const input=[...document.querySelectorAll('.chat input, .chat textarea, .chat button, .chat [aria-disabled]')].map(e=>[e.tagName,e.disabled,e.getAttribute('aria-disabled'),(e.innerText||e.placeholder||'').slice(0,20)]);
 return JSON.stringify({words, colors:[...cols], fonts, graphBorder:[panel.borderTopWidth,panel.borderTopStyle,panel.outlineStyle,panel.boxShadow], h1font:hs.fontFamily, chatBox:[chat.y,chat.height], consoleBox:[con.y,con.height], chatInputs:input})
})()`));
c.close();
