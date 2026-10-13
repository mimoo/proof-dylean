(function(){
  'use strict';
  const D=window.DYLEAN_TRACE, T=window.DYLEAN_TOOLKIT, C=window.DYLEAN_CARDS;
  const $=s=>document.querySelector(s);
  if(!D){ $('#timeline').innerHTML='<p style="color:var(--muted)">trace/trace-data.js is missing. Run <code>python3 scripts/export_trace.py</code>.</p>'; return; }
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const A=D.annotations, NAMES=A.names;
  // A declaration is named exactly, or by '@file:line' for hygienic instance names.
  function declId(ref){
    if(!T||!ref) return null;
    if(ref[0]!=='@') return T.names[ref]||null;
    const [f,l]=ref.slice(1).split(':');
    const hits=Object.entries(T.decls).filter(([,d])=>d.f===f&&d.l===+l).sort((a,b)=>(a[1].k!=='instance')-(b[1].k!=='instance'));
    return hits.length?hits[0][0]:null;
  }
  const declLabel=ref=>{ const id=declId(ref); return id&&C?C.short(T.decls[id].n):ref; };
  if(T&&C) C.init({data:T, notesFor:()=>null, onExternal:(f,l,el)=>{ if(el&&el.tagName==='A') return; window.open(C.srcHref(f,l),'_blank'); }});

  // ---- terms -------------------------------------------------------------
  // Canonical key of a term, used to attach names: random@ts, dhPk(x), vk(x), hash(x), dh(a,b), sign(a,b,…)
  function key(b){
    switch(b.t){
      case 'random': return 'random@'+b.timestamp;
      case 'literal': return 'lit';
      case 'concat': return 'concat';
      case 'hash': return 'hash('+key(b.input)+')';
      case 'vk': return 'vk('+key(b.sk)+')';
      case 'dhPk': return 'dhPk('+key(b.sk)+')';
      case 'dh': return 'dh('+key(b.pk)+','+key(b.sk)+')';
      case 'sign': return 'sign('+key(b.sk)+','+key(b.nonce)+',…)';
      default: return b.t;
    }
  }
  // Serialised structures are right-nested concats whose literal runs are unary length prefixes: 0x01 × n then 0x00.
  function parts(b){ const out=[]; while(b.t==='concat'){ out.push(b.lhs); b=b.rhs; } out.push(b); return out; }
  function groupLiterals(ps){
    const out=[]; let i=0;
    while(i<ps.length){
      const p=ps[i];
      if(p.t==='literal'&&p.hex==='01'){ let n=0; while(i<ps.length&&ps[i].t==='literal'&&ps[i].hex==='01'){ n++; i++; } if(i<ps.length&&ps[i].t==='literal'&&ps[i].hex==='00'){ i++; out.push({t:'len',n}); } else out.push({t:'lit',hex:'01'.repeat(n)}); continue; }
      if(p.t==='literal'){ out.push(p.text?{t:'text',text:p.text}:{t:'lit',hex:p.hex}); i++; continue; }
      out.push(p); i++;
    }
    return out;
  }
  function chip(cls,text,title){ return `<span class="chip ${cls}" title="${esc(title||'')}">${esc(text)}</span>`; }
  function fn(name,args){ return `<span class="fn">${esc(name)}</span><span class="op">(</span>${args.join('<span class="op">, </span>')}<span class="op">)</span>`; }
  function render(b,depth=0){
    const k=key(b), named=NAMES[k];
    if(named){
      const inner=renderRaw(b,depth+1);
      if(b.t==='random') return chip('named',named.name,named.desc+' · '+k);
      return `<details><summary>${chip('named',named.name,named.desc+' · '+k)}</summary><span class="inner">${inner}</span></details>`;
    }
    return renderRaw(b,depth);
  }
  function renderRaw(b,depth){
    switch(b.t){
      case 'random': return chip('',`rand#${b.timestamp}`,`${b.size} random bytes generated at index ${b.timestamp}`);
      case 'literal': return b.text?chip('text',JSON.stringify(b.text),'literal bytes '+b.hex):chip('lit','0x'+b.hex,'literal bytes');
      case 'concat': return groupLiterals(parts(b)).map(p=>p.t==='len'?chip('len',`⟨${p.n}⟩`,`unary length prefix: ${p.n} bytes follow`):p.t==='text'?chip('text',JSON.stringify(p.text),'literal bytes'):p.t==='lit'?chip('lit','0x'+p.hex,'literal bytes'):render(p,depth+1)).join('<span class="op"> ++ </span>');
      case 'hash': return fn('hash',[render(b.input,depth+1)]);
      case 'vk': return fn('vk',[render(b.sk,depth+1)]);
      case 'dhPk': return fn('dhPk',[render(b.sk,depth+1)]);
      case 'dh': return fn('dh',[render(b.pk,depth+1),render(b.sk,depth+1)]);
      case 'sign': return fn('sign',[render(b.sk,depth+1),render(b.nonce,depth+1),render(b.msg,depth+1)]);
      default: return chip('',b.t,'');
    }
  }
  const term=b=>`<span class="term">${render(b)}</span>`;

  // ---- entry faces ---------------------------------------------------------
  // Lean's JSON objects come out in hash order; show fields in constructor order.
  const FIELD_ORDER=['participant','p','client','server','xPk','xSk','yPk','kS','kC','pk','sk'];
  const ordered=o=>Object.keys(o).sort((a,b)=>{ const ia=FIELD_ORDER.indexOf(a), ib=FIELD_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); });
  const KIND_LABEL={message:'message',random:'random',event:'event',store:'stored state',storeGlobal:'stored state (global)',compromise:'compromise'};
  function execFace(e){
    const d=e.data, rows=[];
    if(e.kind==='message') rows.push(['msg',term(d.msg)]);
    else if(e.kind==='random') rows.push(['length',esc(d.length)+' bytes'],['value','not in the execution trace: a random entry records only its length. The bytes themselves are the term <code>rand#'+e.i+'</code> wherever they are used.']);
    else if(e.kind==='event'){ rows.push(['event',`<code>${esc(d.event)}</code>`]); for(const k of ordered(d)) if(k!=='event') rows.push([k,typeof d[k]==='string'?esc(JSON.stringify(d[k])):term(d[k])]); }
    else { rows.push(['type',`<code>${esc(d.stateType)}</code>`]); for(const k of ordered(d.state)) rows.push([k,typeof d.state[k]==='string'?esc(JSON.stringify(d.state[k])):term(d.state[k])]); }
    return `<div class="face exec"><h4>Execution view · what the attacker can see</h4><div class="fields">${rows.map(([k,v])=>`<span class="k">${esc(k)}</span><span>${v}</span>`).join('')}</div></div>`;
  }
  function proofFace(e,ann){
    const g=ann&&ann.ghost;
    let body;
    if(g) body=`<div class="fields"><span class="k">label</span><span><code>${esc(g.label)}</code></span><span class="k">usage</span><span><code>${esc(g.usage)}</code></span></div><p class="none" style="margin:8px 0 0">The proof entry is {length, label, usage}; erase keeps only the length. The label is a declaration made by the step's spec, not a fact observed.</p>`;
    else body=`<p class="none">No ghost fields: the proof entry for this kind is the execution entry itself. What the proof adds is the invariant below, which must hold on the trace before this index.</p>`;
    return `<div class="face proof"><h4>Proof view · ghost data</h4>${body}</div>`;
  }
  function entryCard(e,ann,action){
    const title=e.kind==='event'?e.data.event:e.kind==='message'?'Network message':e.kind==='random'?'Random bytes':(e.kind==='compromise'?'Compromise of ':'')+(e.data.stateType||'');
    return `<div class="entry kind-${e.kind}" data-i="${e.i}">
      <div class="entry-head"><span class="kind">${esc(KIND_LABEL[e.kind]||e.kind)}</span><span class="title">${esc(title)}</span><button class="toggle" aria-expanded="false">why it could be appended ▸</button></div>
      <div class="faces">${execFace(e)}${proofFace(e,ann)}</div>
      <div class="why">
        ${action&&action.must?`<p class="must"><b>must prove</b>${esc(action.must)}</p>`:''}
        ${action&&action.get?`<p class="get"><b>you get</b>${esc(action.get)}</p>`:''}
        ${ann&&ann.invariant?`<p class="inv"><b>entry invariant</b>${esc(ann.invariant)}</p>`:''}
        ${ann&&ann.attacker?`<p class="att"><b>attacker learns</b>${esc(ann.attacker)}</p>`:''}
        <div class="cards" data-decls="${esc([action&&action.triple].filter(Boolean).join(' '))}"></div>
      </div>
    </div>`;
  }
  const KW=/\b(let|guard|parse|serialize|return)\b/g;
  const leanHtml=s=>esc(s).replace(KW,'<span class="kw">$1</span>');

  // ---- scenarios -------------------------------------------------------------
  function resolve(name){
    const sc=A.scenarios[name]; if(!sc.extends) return sc;
    const base=resolve(sc.extends);
    return {...sc, steps:[...base.steps,...sc.steps], entries:{...base.entries,...sc.entries}};
  }
  const traceOf=name=>D.scenarios.find(s=>s.name===name);
  let knowledge=[];
  function knowledgeStrip(){
    if(!knowledge.length) return '';
    return `<div class="know"><b>attacker base knowledge so far</b>${knowledge.map(k=>k).join('')}</div>`;
  }
  function show(name){
    const sc=resolve(name), tr=traceOf(name);
    document.querySelectorAll('#scenarios button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.name===name));
    $('#scenario-intro').textContent=sc.intro;
    const [sf,sl]=sc.source.split(':'); $('#scenario-src').innerHTML=`Program: <a href="source.html#${new URLSearchParams({file:sf,line:sl})}" target="_blank" rel="noopener">${esc(sc.source)}</a> · ${tr.length} entries · ran to completion: ${tr.succeeded?'yes':'no'}`;
    knowledge=[];
    const byIndex=new Map(tr.entries.map(e=>[e.i,e]));
    const html=sc.steps.map((st,si)=>{
      const rows=st.actions.map(act=>{
        if(act.appends!==undefined){
          const e=byIndex.get(act.appends), ann=sc.entries[String(act.appends)];
          if(e&&e.kind==='message') knowledge.push(term(e.data.msg));
          return `<div class="row appends kind-${e?e.kind:''}" id="e${act.appends}"><div class="idx">${act.appends}</div><div class="act"><div class="lean">${leanHtml(act.lean)}</div><div class="meta">${act.triple?`<span class="triple-link">${esc(declLabel(act.triple))}</span>`:''}${act.note?`<span>${esc(act.note)}</span>`:''}</div>${act.ghost?`<div class="ghost"><b>ghost</b>${esc(act.ghost)}</div>`:''}${e?entryCard(e,ann,act):'<p class="none">entry missing from export</p>'}</div></div>`;
        }
        if(act.reads){
          return `<div class="row reads"><div class="idx read" title="reads from the trace, appends nothing">read</div><div class="act"><div class="lean">${leanHtml(act.lean)}</div><div class="meta"><span class="reads">reads ${act.reads.map(i=>`<a href="#e${i}">#${i}</a>`).join(', ')}</span>${act.triple?`<span class="triple-link">${esc(declLabel(act.triple))}</span>`:''}${act.must?`<span><b style="color:var(--rose);font-size:10.5px;letter-spacing:.08em">MUST</b> ${esc(act.must)}</span>`:''}${act.get?`<span><b style="color:var(--accent);font-size:10.5px;letter-spacing:.08em">GET</b> ${esc(act.get)}</span>`:''}</div><div class="cards" data-decls="${esc(act.triple||'')}" data-inline></div></div></div>`;
        }
        return `<div class="row pure"><div class="idx pure" title="pure computation, appends nothing">·</div><div class="act"><div class="lean">${leanHtml(act.lean)}</div><div class="meta">${act.triple?`<span class="triple-link">${esc(declLabel(act.triple))}</span>`:''}${act.note?`<span>${esc(act.note)}</span>`:''}</div>${act.ghost?`<div class="ghost"><b>ghost</b>${esc(act.ghost)}</div>`:''}<div class="cards" data-decls="${esc(act.triple||'')}" data-inline></div></div></div>`;
      }).join('');
      return `<section class="band" id="step${si}">
        <div class="band-head"><h2>${esc(st.name)}</h2><span class="range">entries ${st.range[0]}–${st.range[1]} · returns ${esc(st.returns)}</span><p>${esc(st.summary)}</p>
          <div class="triple"><span>step triple</span><code>HoareTriple (${esc(st.name.split(' ')[0])} …) (fun _ => True) (fun _ _ => True)</code><span>invariant in, invariant out</span></div>
          <div class="cards" data-decls="${esc([st.decl,st.spec].join(' '))}"></div></div>
        <div class="band-body">${rows}${knowledgeStrip()}</div>
      </section>`;
    }).join('');
    $('#timeline').innerHTML=html;
    // declaration cards, closed by default; inline ones (reads, pure) only on demand
    if(T&&C) document.querySelectorAll('.cards[data-decls]').forEach(h=>{
      const names=h.dataset.decls.split(' ').filter(Boolean);
      if(!names.length) return;
      if(h.hasAttribute('data-inline')){
        const btn=document.createElement('button'); btn.textContent='open '+names.map(declLabel).join(', '); btn.style.cssText='font-size:11.5px;min-height:26px;padding:1px 8px;margin-top:4px';
        btn.addEventListener('click',()=>{ btn.remove(); names.forEach(n=>{ const id=declId(n); if(id) h.appendChild(C.makeCard(id,{open:true})); }); });
        h.appendChild(btn); return;
      }
      names.forEach(n=>{ const id=declId(n); if(id) h.appendChild(C.makeCard(id)); });
    });
    document.querySelectorAll('.entry .toggle').forEach(b=>b.addEventListener('click',()=>{ const e=b.closest('.entry'); const open=e.classList.toggle('open'); b.setAttribute('aria-expanded',open); b.textContent=open?'why it could be appended ▾':'why it could be appended ▸'; }));
    history.replaceState(null,'','#scenario='+name);
  }

  // scenario buttons
  $('#scenarios').innerHTML=Object.entries(A.scenarios).map(([n,s])=>`<button role="tab" data-name="${esc(n)}" aria-pressed="false">${esc(s.title)}</button>`).join('');
  $('#scenarios').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) show(b.dataset.name); });
  document.querySelectorAll('.views button').forEach(b=>b.addEventListener('click',()=>{ document.body.dataset.view=b.dataset.view; document.querySelectorAll('.views button').forEach(x=>x.setAttribute('aria-pressed',x===b)); }));
  document.addEventListener('click',e=>{ const a=e.target.closest('a[href^="#e"]'); if(!a) return; const t=document.getElementById(a.getAttribute('href').slice(1)); if(t){ e.preventDefault(); t.scrollIntoView({block:'center',behavior:'smooth'}); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } });
  $('#glossary').innerHTML=Object.entries(NAMES).map(([k,v])=>`<dt>${esc(v.name)}</dt><dd>${esc(v.desc)} <code style="color:var(--muted)">${esc(k)}</code></dd>`).join('');
  const m=location.hash.match(/scenario=([\w]+)/);
  show(m&&A.scenarios[m[1]]?m[1]:Object.keys(A.scenarios)[0]);
})();
