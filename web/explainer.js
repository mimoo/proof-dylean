/* Shared behaviour for long-form explainer pages: embedded declaration cards, Lean
   keyword highlighting in static blocks, and the table-of-contents highlight.
   Per-page editorial notes for cards come from <script type="application/json" id="card-notes">. */
(function(){
  'use strict';
  const T=window.DYLEAN_TOOLKIT, C=window.DYLEAN_CARDS;
  const $$=s=>[...document.querySelectorAll(s)];
  let NOTES={};
  try{ const el=document.getElementById('card-notes'); if(el) NOTES=JSON.parse(el.textContent); }catch(e){}

  // Static Lean blocks: keyword and comment highlighting, applied before cards so card text is untouched.
  const KW=/\b(theorem|def|instance|class|structure|abbrev|inductive|where|fun|match|with|by|public|private|macro_rules|syntax|do|let|for|in|if|then|else|return|mut|open|namespace|end|import|extends|deriving)\b/g;
  $$('pre.lean-static:not([data-raw])').forEach(pre=>{
    pre.innerHTML=pre.innerHTML.split('\n').map(line=>{
      const c=line.indexOf('--');
      const code=c>=0?line.slice(0,c):line, cm=c>=0?line.slice(c):'';
      return code.replace(KW,'<span class="kw">$1</span>')+(cm?`<span class="cm">${cm}</span>`:'');
    }).join('\n');
  });

  if(T&&C){
    C.init({data:T, notesFor:id=>NOTES[T.decls[id].n], onExternal:(f,l,el)=>{ if(el&&el.tagName==='A') return; window.open(C.srcHref(f,l),'_blank'); }});
    const atLine=(file,line)=>{
      const ids=C.find(d=>d.f===file&&d.l===line);
      ids.sort((a,b)=>{ const da=T.decls[a], db=T.decls[b]; return (da.k!=='instance'&&da.k!=='theorem'&&da.k!=='def')-(db.k!=='instance'&&db.k!=='theorem'&&db.k!=='def') || da.n.length-db.n.length; });
      return ids[0];
    };
    $$('[data-card],[data-card-at]').forEach(h=>{
      let id;
      if(h.dataset.card) id=C.idOf(h.dataset.card);
      else { const [f,l]=h.dataset.cardAt.split(':'); id=atLine(f,+l); }
      if(!id){ h.insertAdjacentHTML('beforeend',`<p class="muted">Not in the export: <code>${C.esc(h.dataset.card||h.dataset.cardAt)}</code></p>`); return; }
      h.appendChild(C.makeCard(id,{open:h.hasAttribute('data-open'),label:h.dataset.label}));
    });
  }

  // Table of contents highlighting.
  const links=$$('.toc a'), heads=links.map(a=>document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{ if(e.isIntersecting) links.forEach(l=>l.classList.toggle('active',l.getAttribute('href')==='#'+e.target.id)); }),{rootMargin:'-80px 0px -70% 0px'});
    heads.forEach(h=>io.observe(h));
  }
})();
