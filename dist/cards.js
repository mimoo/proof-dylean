/* Shared "declaration card" widget over toolkit-data.js: a declaration's Lean source with every
   compiler-resolved reference clickable, opening the referenced declaration nested underneath. */
(function(){
  'use strict';
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const KW=/\b(theorem|def|instance|class|structure|inductive|abbrev|where|fun|match|with|let|have|by|intro|apply|exact|simp|simp_all|grind|unfold|step|split|if|then|else|do|return|public|private|protected|variable|namespace|end|open|section|in|at|deriving|macro|macro_rules|syntax|opaque|noncomputable|mutual|meta|import)\b/g;
  let T=null, notesFor=()=>null, onExternal=null;
  const short=n=>n.replace(/^DY\.Example\.SignedDH\./,'').replace(/^DY\./,'').replace(/\._@\..*$/,' (hygienic instance)').replace(/^Meta\.CombineMacro\.«_aux_(.*?)___macroRules_.*#combine(_one)?__.*?__(\d+)»$/,(m,f,one,i)=>`#combine${one||''} rule ${i} in ${f.replace(/_/g,'/')}.lean`);
  const srcHref=(file,line)=>'source.html#'+new URLSearchParams({file,line:String(line)});
  function plain(s){
    const c=s.indexOf('--');
    if(c>=0) return plain(s.slice(0,c))+`<span class="cm">${esc(s.slice(c))}</span>`;
    return esc(s).replace(KW,'<span class="kw">$1</span>');
  }
  function renderSource(d){
    const lines=d.t.split('\n'), byLine=new Map();
    d.r.forEach(r=>{ if(r[0]===r[2]) (byLine.get(r[0])||byLine.set(r[0],[]).get(r[0])).push(r); });
    return lines.map((line,i)=>{
      const refs=(byLine.get(i)||[]).sort((a,b)=>a[1]-b[1]);
      let out='', pos=0;
      refs.forEach(r=>{
        if(r[1]<pos) return;
        out+=plain(line.slice(pos,r[1]));
        const id=r[4], inRepo=!!T.decls[id], e=T.ext[id];
        const title=inRepo?T.decls[id].n:(e?e.n+' · '+e.f:'');
        out+=`<span class="ref ${inRepo?'':'ext'}" data-id="${esc(id)}" title="${esc(title)}">${esc(line.slice(r[1],r[3]))}</span>`;
        pos=r[3];
      });
      return out+plain(line.slice(pos));
    }).join('\n');
  }
  function makeCard(id,{closable=false,ancestors=[],open=false,label}={}){
    const d=T.decls[id];
    const card=document.getElementById('card-template').content.firstElementChild.cloneNode(true);
    card.dataset.id=id;
    const m=notesFor(id)||{};
    const name=card.querySelector('.card-name');
    name.textContent=label||m.label||short(d.n); name.title=d.n;
    const kind=d.g?'generated':d.k;
    card.querySelector('.kind').textContent=kind;
    card.querySelector('.role').textContent=m.role&&m.role!==kind?m.role:'';
    const src=card.querySelector('.src-link'); src.href=srcHref(d.f,d.l); src.textContent=d.f.split('/').pop()+':'+d.l; src.title=d.f;
    if(d.p){ const p=card.querySelector('.proof-link'); p.hidden=false; p.href='proof.html#'+new URLSearchParams({proof:d.n}); }
    if(closable){ const c=card.querySelector('.card-close'); c.hidden=false; c.addEventListener('click',()=>{ if(card._opener) card._opener.classList.remove('open'); card.remove(); }); }
    const notes=card.querySelector('.card-notes');
    if(m.must) notes.insertAdjacentHTML('beforeend',`<p class="must"><b>must prove</b>${esc(m.must)}</p>`);
    if(m.get) notes.insertAdjacentHTML('beforeend',`<p class="get"><b>you get</b>${esc(m.get)}</p>`);
    if(m.note) notes.insertAdjacentHTML('beforeend',`<p class="note"><b>note</b>${esc(m.note)}</p>`);
    const body=card.querySelector('.card-body'), pre=card.querySelector('.lean'), toggle=card.querySelector('.card-toggle');
    let rendered=false;
    const doOpen=()=>{ if(!rendered){ pre.innerHTML=renderSource(d); rendered=true; } body.hidden=false; card.classList.add('open'); toggle.textContent='▾'; toggle.setAttribute('aria-expanded','true'); };
    const doClose=()=>{ body.hidden=true; card.classList.remove('open'); toggle.textContent='▸'; toggle.setAttribute('aria-expanded','false'); };
    const flip=()=>body.hidden?doOpen():doClose();
    toggle.addEventListener('click',flip); name.addEventListener('click',flip);
    src.addEventListener('click',()=>{ if(onExternal) onExternal(d.f,d.l,src); });
    pre.addEventListener('click',e=>{
      const ref=e.target.closest('.ref'); if(!ref) return;
      const tid=ref.dataset.id;
      if(!T.decls[tid]){ const x=T.ext[tid]; if(x&&onExternal) onExternal(x.f,x.l,ref); else if(x) window.open(srcHref(x.f,x.l),'_blank'); return; }
      const nested=card.querySelector(':scope > .card-body > .nested');
      const existing=[...nested.children].find(c=>c.dataset.id===tid);
      if(existing){ existing.scrollIntoView({block:'nearest',behavior:'smooth'}); return; }
      const chain=[...ancestors,id];
      if(chain.includes(tid)){ const note=document.createElement('div'); note.className='cycle'; note.textContent=short(T.decls[tid].n)+' is already open above this card (cycle).'; nested.appendChild(note); setTimeout(()=>note.remove(),2500); return; }
      const child=makeCard(tid,{closable:true,ancestors:chain,open:true});
      child._opener=ref; ref.classList.add('open');
      nested.appendChild(child); child.scrollIntoView({block:'nearest',behavior:'smooth'});
    });
    card._open=doOpen; card._close=doClose;
    if(open) doOpen();
    return card;
  }
  window.DYLEAN_CARDS={
    init(opts){ T=opts.data; notesFor=opts.notesFor||notesFor; onExternal=opts.onExternal||null; },
    makeCard, short, srcHref, esc,
    idOf:name=>T&&T.names[name],
    data:()=>T,
    find:pred=>Object.entries(T.decls).filter(([id,d])=>pred(d,id)).map(([id])=>id)
  };
})();
