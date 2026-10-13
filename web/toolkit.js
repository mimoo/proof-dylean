(function(){
  'use strict';
  const T=window.DYLEAN_TOOLKIT;
  const $=s=>document.querySelector(s);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const tpl=$('#card-template');
  if(!T){ $('#toolkit-body').innerHTML='<p class="muted">toolkit-data.js is missing. Run <code>python3 scripts/toolkit.py</code>.</p>'; return; }
  const curated=new Map(); // declaration id → manifest entry
  T.categories.forEach(c=>c.items.forEach(it=>{ if(!curated.has(it.id)) curated.set(it.id,it); }));
  const short=n=>n.replace(/^DY\.Example\.SignedDH\./,'').replace(/^DY\./,'').replace(/\._@\..*$/,' (hygienic instance)');
  const srcHref=(file,line)=>'source.html#'+new URLSearchParams({file,line:String(line)});
  const KW=/\b(theorem|def|instance|class|structure|inductive|abbrev|where|fun|match|with|let|have|by|intro|apply|exact|simp|simp_all|grind|unfold|step|split|if|then|else|do|return|public|private|protected|variable|namespace|end|open|section|in|at|deriving|macro|syntax|opaque|noncomputable|mutual)\b/g;

  // Turn a declaration's source into HTML, wrapping each reference in a clickable span.
  function renderSource(d){
    const lines=d.t.split('\n');
    const byLine=new Map();
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
      out+=plain(line.slice(pos));
      return out;
    }).join('\n');
  }
  function plain(s){
    const c=s.indexOf('--');
    if(c>=0) return plain(s.slice(0,c))+`<span class="cm">${esc(s.slice(c))}</span>`;
    return esc(s).replace(KW,'<span class="kw">$1</span>');
  }

  function makeCard(id,{closable=false,ancestors=[]}={}){
    const d=T.decls[id];
    const card=tpl.content.firstElementChild.cloneNode(true);
    card.dataset.id=id;
    const m=curated.get(id);
    card.querySelector('.card-name').textContent=m&&m.label?m.label:short(d.n);
    card.querySelector('.card-name').title=d.n;
    card.querySelector('.kind').textContent=d.g?'generated':d.k;
    card.querySelector('.role').textContent=m&&m.role!==(d.g?'generated':d.k)?m.role:'';
    const src=card.querySelector('.src-link'); src.href=srcHref(d.f,d.l); src.textContent=d.f.split('/').pop()+':'+d.l; src.title=d.f;
    if(d.p){ const p=card.querySelector('.proof-link'); p.hidden=false; p.href='proof.html#'+new URLSearchParams({proof:d.n}); }
    if(closable){ const c=card.querySelector('.card-close'); c.hidden=false; c.addEventListener('click',()=>{ const ref=card._opener; if(ref) ref.classList.remove('open'); card.remove(); }); }
    const notes=card.querySelector('.card-notes');
    if(m){
      if(m.must) notes.insertAdjacentHTML('beforeend',`<p class="must"><b>must prove</b>${esc(m.must)}</p>`);
      if(m.get) notes.insertAdjacentHTML('beforeend',`<p class="get"><b>you get</b>${esc(m.get)}</p>`);
      if(m.note) notes.insertAdjacentHTML('beforeend',`<p class="note"><b>note</b>${esc(m.note)}</p>`);
    }
    const body=card.querySelector('.card-body'), pre=card.querySelector('.lean'), toggle=card.querySelector('.card-toggle');
    let rendered=false;
    const open=()=>{ if(!rendered){ pre.innerHTML=renderSource(d); rendered=true; } body.hidden=false; card.classList.add('open'); toggle.textContent='▾'; toggle.setAttribute('aria-expanded','true'); };
    const close=()=>{ body.hidden=true; card.classList.remove('open'); toggle.textContent='▸'; toggle.setAttribute('aria-expanded','false'); };
    const flip=()=>body.hidden?open():close();
    toggle.addEventListener('click',flip);
    card.querySelector('.card-name').addEventListener('click',flip);
    src.addEventListener('click',()=>{ document.querySelector('.source-panel').classList.add('visible'); });
    pre.addEventListener('click',e=>{
      const ref=e.target.closest('.ref'); if(!ref) return;
      const tid=ref.dataset.id;
      if(!T.decls[tid]){ const x=T.ext[tid]; if(x){ $('#source-frame').src=srcHref(x.f,x.l); document.querySelector('.source-panel').classList.add('visible'); } return; }
      const nested=card.querySelector(':scope > .card-body > .nested');
      const existing=[...nested.children].find(c=>c.dataset.id===tid);
      if(existing){ existing.scrollIntoView({block:'nearest',behavior:'smooth'}); existing.classList.add('flash'); setTimeout(()=>existing.classList.remove('flash'),600); return; }
      const chain=[...ancestors,id];
      if(chain.includes(tid)){
        const note=document.createElement('div'); note.className='cycle'; note.textContent=short(T.decls[tid].n)+' is already open above this card (cycle).'; nested.appendChild(note); setTimeout(()=>note.remove(),2500); return;
      }
      const child=makeCard(tid,{closable:true,ancestors:chain});
      child._opener=ref; ref.classList.add('open');
      nested.appendChild(child); child._open();
      child.scrollIntoView({block:'nearest',behavior:'smooth'});
    });
    card._open=open;
    return card;
  }

  // Categories
  const body=$('#toolkit-body'); body.innerHTML='';
  const nav=$('#categories');
  T.categories.forEach((c,i)=>{
    const sec=document.createElement('section'); sec.className='category'; sec.id='cat-'+i;
    sec.innerHTML=`<h2>${esc(c.title)}</h2><p class="cat-intro">${esc(c.intro)}</p>`;
    c.items.forEach(it=>sec.appendChild(makeCard(it.id)));
    body.appendChild(sec);
    nav.insertAdjacentHTML('beforeend',`<a href="#cat-${i}">${esc(c.title)}<small>${c.items.length} declarations</small></a>`);
  });
  nav.addEventListener('click',e=>{ const a=e.target.closest('a'); if(!a) return; e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1)).scrollIntoView({behavior:'smooth'}); });
  $('#build-info').textContent=`${T.meta.declarations.toLocaleString()} repository declarations · source ${T.meta.revision||''}`;

  // Search over every repository declaration; results open in the scratch area.
  const names=Object.entries(T.names).map(([n,id])=>({n,id,s:short(n).toLowerCase(),l:n.toLowerCase()}));
  const scratch=$('#scratch'), scratchBody=$('#scratch-body');
  function openInScratch(id){
    scratch.hidden=false;
    const existing=[...scratchBody.children].find(c=>c.dataset.id===id);
    const card=existing||makeCard(id,{closable:true});
    if(!existing) scratchBody.prepend(card);
    card._open(); card.scrollIntoView({block:'start',behavior:'smooth'});
    history.replaceState(null,'','#decl='+encodeURIComponent(T.decls[id].n));
  }
  $('#clear-scratch').addEventListener('click',()=>{ scratchBody.innerHTML=''; scratch.hidden=true; });
  $('#decl-search').addEventListener('input',e=>{
    const q=e.target.value.trim().toLowerCase(); const box=$('#search-results');
    if(q.length<2){ box.innerHTML=''; return; }
    const hits=names.filter(x=>x.l.includes(q)).sort((a,b)=>(a.s.startsWith(q)?0:1)-(b.s.startsWith(q)?0:1)||a.n.length-b.n.length).slice(0,25);
    box.innerHTML=hits.map(h=>`<button class="search-result" data-id="${esc(h.id)}" title="${esc(h.n)}">${esc(short(h.n))}</button>`).join('')||'<p class="muted">No declaration matches.</p>';
  });
  $('#search-results').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) openInScratch(b.dataset.id); });

  // Source pane toggle, as on the proof page.
  $('#toggle-source').addEventListener('click',()=>{ document.body.classList.toggle('hide-source'); $('#toggle-source').textContent=document.body.classList.contains('hide-source')?'Show source':'Hide source'; document.querySelector('.source-panel').classList.remove('visible'); });

  // Deep link: #decl=Full.Name
  const m=location.hash.match(/decl=([^&]+)/);
  if(m){ const id=T.names[decodeURIComponent(m[1])]; if(id) openInScratch(id); }
})();
