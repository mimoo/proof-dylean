(function(){
  'use strict';
  const T=window.DYLEAN_TOOLKIT, C=window.DYLEAN_CARDS;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  if(!T||!C){ $$('.cards').forEach(h=>h.innerHTML='<p class="muted">toolkit-data.js is missing. Run <code>python3 scripts/toolkit.py</code>.</p>'); return; }
  const esc=C.esc;

  // Editorial notes for the declarations this page embeds.
  const NOTES={
    'DY.Meta.CombineMacro.combineExplicit':{role:'helper',get:'Two declarations: X.internal : Fin n → … with one match arm per source, and X := X.combine X.internal.'},
    'DY.Meta.CombineMacro.combineTypeclass':{role:'helper',get:'Two instances: one over Fin n dispatching to each source\'s instance, and one for the combination obtained by inferInstanceAs.'},
    'DY.Meta.CombineMacro.mkHasStep':{role:'helper',get:'One HasStep instance per source, from the source\'s X to the combined X, via the generic HasStep instance for combine at index i.'},
    'DY.Meta.CombineMacro.mkHasCombine':{role:'helper',get:'A bridge instance: Has (X.combine X.internal) from Has X. Only emitted with +toplevel; a workaround for lean4#13571.'},
    'DY.Meta.CombineMacro.explicitNameOfBracketedBinder':{role:'helper',note:'Turns the explicit binders of the #combine command into the identifiers passed along to every generated declaration.'},
    'DY.Meta.CombineMacro.parseOptions':{role:'helper',note:'Currently a single flag: +toplevel.'},
    'DY.Meta.CombineMacro.CombineExplicitConfig':{role:'config',note:'The names and output types combineExplicit needs. makeSimple fills it from four names.'},
    'DY.Meta.CombineMacro.CombineTypeclassConfig':{role:'config',note:'Four syntax builders: the instance type at index id, at a named source, at the combination, and at the final X.'},
    'DY.Meta.CombineMacro.HasStepConfig':{role:'config'},
    'DY.Meta.CombineMacro.HasCombineConfig':{role:'config'},
    'DY.ExecTraceTypes.combine':{role:'combinator',note:'A dependent pair: which entry type (a Fin n index) and an entry of that type.'},
    'DY.ProofTraceTypes.combine':{role:'combinator',note:'Same shape as ExecTraceTypes.combine, for proof-trace entries.'},
    'DY.BytesFunctor.combine':{role:'combinator',note:'The à-la-carte FunctorUnion over a Fin n family of functors; Bytes is the fixpoint of the resulting functor.'},
    'DY.ReachabilityConfig.combine':{role:'combinator',note:'Inputs become a dependent pair of a config index and that config\'s input; PreCond and step dispatch on it.'},
    'DY.instExecTraceTypesCombineHasStep':{role:'generic instance',get:'For every index id: HasStep (Types id) (combine Types). This is what each generated HasStep instance is inferInstanceAs of.'},
    'DY.instExecTraceTypesHasStep':{role:'generic instance',get:'HasStep T U and Has U together give Has T. Composition is how a local entry type reaches the global entry type.'},
    'DY.ExecTraceTypes.HasStep':{role:'class',note:'One step of inclusion: inject into, and partially project out of, a larger entry type.'},
    'DY.ExecTraceTypes.Has':{role:'class',note:'Inclusion into the global execution entry type, i.e. what the trace actually stores.'},
    'DY.ALaCarte.SubFunctor':{role:'class',note:'One step of inclusion between functors, with inj, proj and the laws relating them.'},
    'DY.ALaCarte.SubFunctorTC':{role:'class',note:'The transitive closure of SubFunctor, resolved by typeclass search.'},
    'DY.ALaCarte.Representable':{role:'class',note:'A functor with a representation that passes Lean\'s positivity checker, so its fixpoint ContainerFor can be formed.'},
    'DY.SubTraceInvariant.combine':{role:'generic instance',get:'The entry invariant of a combined entry is the invariant of its component, found by its index.'}
  };
  C.init({data:T, notesFor:id=>NOTES[T.decls[id].n], onExternal:(f,l,el)=>{ if(el&&el.tagName==='A') return; window.open(C.srcHref(f,l),'_blank'); }});

  const atLine=(file,line,pred)=>{
    const ids=C.find((d)=>d.f===file&&d.l===line&&(!pred||pred(d)));
    ids.sort((a,b)=>{ const da=T.decls[a], db=T.decls[b]; return (da.k==='generated declaration')-(db.k==='generated declaration') || da.n.length-db.n.length; });
    return ids[0];
  };
  const ruleAt=(file,line)=>atLine(file,line,d=>d.k==='generated declaration'&&d.n.includes('macroRules'));

  // Fill every card holder: data-card="Full.Name" or data-card-at="file:line" (optionally data-rule for macro rules).
  $$('[data-card],[data-card-at]').forEach(h=>{
    let id;
    if(h.dataset.card) id=C.idOf(h.dataset.card);
    else { const [f,l]=h.dataset.cardAt.split(':'); id=h.hasAttribute('data-rule')?ruleAt(f,+l):atLine(f,+l); }
    if(!id){ h.insertAdjacentHTML('beforeend',`<p class="muted">Not in the export: <code>${esc(h.dataset.card||h.dataset.cardAt)}</code></p>`); return; }
    h.appendChild(C.makeCard(id,{open:h.hasAttribute('data-open'),label:h.dataset.label}));
  });

  // Invocation panels: list what the compiler attributes to the #combine span, grouped by the helper that wrote it.
  const classify=n=>{
    const tail=n.replace(/^DY\.Example\.SignedDH\./,'');  // hygienic names end in ._@.<module>…, so test the head
    if(/^wfInstInternal(\.|$)/.test(tail)) return ['typeclass','combineTypeclass: per-index instance'];
    if(/^wfInst(\.|$)/.test(tail)) return ['typeclass','combineTypeclass: instance for the combination'];
    if(/^inst(\._@|$)/.test(tail)) return ['anon','mkHasStep / mkHasCombine: anonymous instances'];
    if(/^inst[A-Z]/.test(tail)) return ['toplevel','+toplevel: named global instances'];
    if(/\.internal$/.test(n)) return ['explicit','combineExplicit: the Fin-indexed family'];
    return ['explicit','combineExplicit: the combined X'];
  };
  $$('[data-invocation]').forEach(panel=>{
    const [file,line]=panel.dataset.invocation.split(':');
    const ids=C.find(d=>d.k==='generated declaration'&&d.f===file&&d.l===+line);
    const groups=new Map();
    ids.map(id=>T.decls[id]).sort((a,b)=>a.n.localeCompare(b.n)).forEach(d=>{
      const [cls,title]=classify(d.n);
      (groups.get(title)||groups.set(title,{cls,items:[]}).get(title)).items.push(d);
    });
    const order=['combineExplicit: the Fin-indexed family','combineExplicit: the combined X','combineTypeclass: per-index instance','combineTypeclass: instance for the combination','mkHasStep / mkHasCombine: anonymous instances','+toplevel: named global instances'];
    const html=order.filter(t=>groups.has(t)).map(t=>{
      const g=groups.get(t);
      const chips=g.items.map(d=>{
        const label=C.short(d.n);
        return g.cls==='anon'?`<span class="anon" title="${esc(d.n)}">inst (hygienic)</span>`:`<a href="${C.srcHref(d.f,d.l)}" target="_blank" rel="noopener" title="${esc(d.n)}">${esc(label)}</a>`;
      });
      const anonCount=g.cls==='anon'?`<span class="count">${g.items.length} instances</span>`:'';
      const shown=g.cls==='anon'?chips.slice(0,1):chips;
      return `<h5>${esc(t)}</h5><div class="gen-list">${shown.join('')}${anonCount}</div>`;
    }).join('');
    panel.querySelector('.generated').innerHTML=`<p class="muted" style="font-size:13px;margin:10px 0 0">The compiler attributes <b>${ids.length}</b> declarations to this command. Grouped by the helper that produced them:</p>`+html;
  });

  // Mechanism table: open the macro_rules declaration as a card below the table.
  const ruleHolder=$('#rule-cards');
  $$('[data-open-rule]').forEach(btn=>btn.addEventListener('click',()=>{
    const [f,l]=btn.dataset.openRule.split(':'); const id=ruleAt(f,+l); if(!id) return;
    let card=[...ruleHolder.children].find(c=>c.dataset.id===id);
    if(!card){ card=C.makeCard(id,{closable:true,open:true,label:btn.closest('tr').querySelector('td code').textContent+' rule'}); ruleHolder.prepend(card); }
    card._open(); card.scrollIntoView({block:'start',behavior:'smooth'});
  }));

  // Static Lean blocks: keyword highlighting only.
  const KW=/\b(theorem|def|instance|class|structure|abbrev|where|fun|match|with|by|public|private|macro_rules|syntax|declare_syntax_cat|do|let|for|in|if|then|else|return|mut|open|namespace|end|import|inferInstanceAs|inferInstance)\b/g;
  $$('pre.lean-static:not([data-raw])').forEach(pre=>{
    pre.innerHTML=pre.innerHTML.replace(/(^|\n)([^\n]*?)(--[^\n]*)/g,(m,a,b,c)=>a+b+`<span class="cm">${c}</span>`).replace(KW,'<span class="kw">$1</span>');
  });

  // Table of contents highlighting.
  const links=$$('.toc a'), heads=links.map(a=>document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const io=new IntersectionObserver(entries=>{
    entries.forEach(e=>{ if(e.isIntersecting){ links.forEach(l=>l.classList.toggle('active',l.getAttribute('href')==='#'+e.target.id)); } });
  },{rootMargin:'-80px 0px -70% 0px',threshold:0});
  heads.forEach(h=>io.observe(h));
})();
