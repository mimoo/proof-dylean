(function(){
  'use strict';
  const T=window.DYLEAN_TOOLKIT, C=window.DYLEAN_CARDS;
  const $=s=>document.querySelector(s);
  if(!T){ $('#toolkit-body').innerHTML='<p class="muted">toolkit-data.js is missing. Run <code>python3 scripts/toolkit.py</code>.</p>'; return; }
  const esc=C.esc, short=C.short;
  const curated=new Map();
  T.categories.forEach(c=>c.items.forEach(it=>{ if(!curated.has(it.id)) curated.set(it.id,it); }));
  const showSource=(file,line)=>{ $('#source-frame').src=C.srcHref(file,line); document.querySelector('.source-panel').classList.add('visible'); };
  C.init({data:T, notesFor:id=>curated.get(id), onExternal:(f,l,el)=>{ if(el&&el.tagName==='A') return; showSource(f,l); }});

  const body=$('#toolkit-body'); body.innerHTML='';
  const nav=$('#categories');
  T.categories.forEach((c,i)=>{
    const sec=document.createElement('section'); sec.className='category'; sec.id='cat-'+i;
    sec.innerHTML=`<h2>${esc(c.title)}</h2><p class="cat-intro">${esc(c.intro)}</p>`;
    c.items.forEach(it=>sec.appendChild(C.makeCard(it.id)));
    body.appendChild(sec);
    nav.insertAdjacentHTML('beforeend',`<a href="#cat-${i}">${esc(c.title)}<small>${c.items.length} declarations</small></a>`);
  });
  nav.addEventListener('click',e=>{ const a=e.target.closest('a'); if(!a) return; e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1)).scrollIntoView({behavior:'smooth'}); });
  $('#build-info').textContent=`${T.meta.declarations.toLocaleString()} repository declarations · source ${T.meta.revision||''}`;

  const names=Object.entries(T.names).map(([n,id])=>({n,id,s:short(n).toLowerCase(),l:n.toLowerCase()}));
  const scratch=$('#scratch'), scratchBody=$('#scratch-body');
  function openInScratch(id){
    scratch.hidden=false;
    const existing=[...scratchBody.children].find(c=>c.dataset.id===id);
    const card=existing||C.makeCard(id,{closable:true});
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
  $('#toggle-source').addEventListener('click',()=>{ document.body.classList.toggle('hide-source'); $('#toggle-source').textContent=document.body.classList.contains('hide-source')?'Show source':'Hide source'; document.querySelector('.source-panel').classList.remove('visible'); });
  const m=location.hash.match(/decl=([^&]+)/);
  if(m){ const id=T.names[decodeURIComponent(m[1])]; if(id) openInScratch(id); }
})();
