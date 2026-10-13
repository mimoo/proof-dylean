'use strict';
(() => {
  const P = window.DYLEAN_PROOFS, C = window.DYLEAN_PROOF_CHUNKS;
  const $ = (s, parent = document) => parent.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pending = new Map(), entries = new Map();
  let nextEntry = 0, revision = 0, current;
  const trail = [
    {name:'DY.Example.SignedDH.client_secrecy', title:'1 · The secrecy claim', subtitle:'Arbitrary trace, attacker knowledge, client completion.', description:'If the client finishes and the attacker knows its key, then the server’s signing key or one of the ephemeral states was compromised. Introduce the arbitrary inputs, then open the lemmas beneath the final claim.'},
    {name:'DY.Trace.Reachable_implies_Invariant', title:'2 · All reachable traces', subtitle:'The induction that connects executions to invariants.', description:'Induction over reachability proves that every permitted execution has a proof trace satisfying the invariant. The induction hypothesis covers the earlier trace; it does not enumerate all possible trace lengths.'},
    {name:'DY.Bytes.AttackerKnows_implies_Publishable', title:'3 · All attacker computations', subtitle:'The closure argument replaces an endless search.', description:'Choose “publishable” as the property preserved by every attacker operation. The least-fixpoint theorem then covers arbitrarily many operations. This proof separates operation closure from the attacker’s base knowledge.'},
    {name:'DY.Hash.instSubAttackerKnowledgeTheoremSubFAttackerKnowledge', title:'4 · The hash rule', subtitle:'One operation preserves publishability.', description:'For the hash attacker rule, the hypothesis already says its input is publishable. Hashing inherits the input’s invariant and label, which establishes publishability of the output. This is one component of the closure proof.'},
    {name:'DY.DiffieHellman.instSubAttackerKnowledgeTheoremSubFAttackerKnowledge_1', title:'5 · The DH rule', subtitle:'Explore the premises and labels of a DH computation.', description:'This is a compiled component of the attacker-knowledge theorem for Diffie–Hellman. Open its constructors and generated helper proofs to see how the premises imply publishability; click the instance name to read the exact rule it proves.'},
    {name:'DY.Example.SignedDH.Client.finish.spec', title:'6 · The protocol step', subtitle:'Where client completion establishes its event invariant.', description:'The client finish step proves the Hoare triple used by the reachability argument. Its compiled proof contains the obligations discharged by step, simp and grind. Follow the signature and DH lemmas here to connect the protocol implementation to the secrecy claim.'}
  ];
  const binderName = name => name.replace(/\._@.*$/, '') || '_';
  function freshName(name,ctx) {
    const base=binderName(name), used=new Set(ctx.map(b=>binderName(b.name)));
    let candidate=base, i=1; while(used.has(candidate)) candidate=base+'_'+i++;
    return candidate;
  }
  const short = name => name.replace(/^_private\..*?\.\d+\./, '').replace(/^DY\.Example\.SignedDH\./, 'SignedDH.').replace(/^DY\./, '');
  const node = id => C[Math.floor(id/P.chunkSize)]?.[id%P.chunkSize];
  function loadChunk(index) {
    if (C[index]) return Promise.resolve();
    if (pending.has(index)) return pending.get(index);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = `proofs/${index}.js`;
      script.onload = () => {script.remove(); C[index] ? resolve() : reject(new Error('Empty proof chunk'));};
      script.onerror = () => {script.remove(); reject(new Error('Unable to load a proof chunk.'));};
      document.head.append(script);
    }).finally(() => pending.delete(index));
    pending.set(index, promise); return promise;
  }
  async function get(id) {
    if (!Number.isInteger(id) || id < 0 || id >= P.nodeCount) throw new Error('Invalid expression ID');
    if (!node(id)) await loadChunk(Math.floor(id/P.chunkSize));
    return node(id);
  }
  function sourceURL(name) {
    const source = P.declarations[name]?.source;
    return source ? 'source.html#'+new URLSearchParams({file:source.file,line:String(source.line),symbol:source.symbol}) : null;
  }
  function nameHTML(name, full = false, label = null) {
    const url = sourceURL(name), d = P.declarations[name];
    const title = url ? `${name} · ${d.source.kind} · ${d.source.file}:${d.source.line}` : `${name} · no compiler source range`;
    const display = label ?? (full ? name : short(name));
    return url ? `<a class="constant" href="${esc(url)}" target="source-frame" title="${esc(title)}">${esc(display)}</a>` : `<span title="${esc(title)}">${esc(display)}</span>`;
  }
  function boundHTML(binding, index) {
    if (!binding) return `<span title="Unbound variable">#${index}</span>`;
    return `<button class="bound" data-jump="${binding.owner}" title="Jump to the introduction of ${esc(binderName(binding.name))}">${esc(binderName(binding.name))}</button>`;
  }
  const ref = (id, ctx = []) => ({id, ctx});
  // Display the expression with Lean syntax. Infer binder visibility only
  // from the exported function type; the expanded tree retains all arguments.
  async function format(r, budget = {left:180}, depth = 0) {
    if (!r) return 'Type not available at this position.';
    if (budget.left-- <= 0 || depth > 50) return '<span title="Expand the tree to see the rest">…</span>';
    const n = await get(r.id), f = id => format(ref(id,r.ctx),budget,depth+1);
    if (budget.shallow && depth > 0 && n[0] === 'lam') {
      const name = freshName(n[1],r.ctx);
      const type = await format(ref(n[2],r.ctx),{left:50});
      return `fun ${binderHTML(name,type,n[4])} =&gt; …`;
    }
    switch (n[0]) {
      case 'const': return nameHTML(n[1],true);
      case 'bvar': {
        const b = r.ctx[n[1]];
        return b?.valueRef ? format(b.valueRef,budget,depth+1) : boundHTML(b,n[1]);
      }
      case 'sort': return n[1] === '0' ? 'Prop' : `Sort ${esc(binderName(n[1]))}`;
      case 'nat': return esc(n[1]);
      case 'string': return esc(JSON.stringify(n[1]));
      case 'app': {
        const head = await f(n[1]);
        const args = [];
        const arguments_ = await applicationArguments(r,n);
        if (budget.shallow && depth > 0) return arguments_.some(arg=>arg.info === 'explicit') ? `(${head} …)` : head;
        for (const arg of arguments_) {
          if (arg.info !== 'explicit') continue;
          if (budget.left <= 0) {args.push('…'); break;}
          args.push(await format(arg.ref,budget,depth+1));
        }
        return args.length ? `(${head} ${args.join(' ')})` : head;
      }
      case 'lam': case 'forall': {
        const t = await f(n[2]);
        const b = {name:freshName(n[1],r.ctx),type:ref(n[2],r.ctx),owner:0};
        const body = await format(ref(n[3],[b,...r.ctx]),budget,depth+1);
        return `${n[0] === 'lam' ? 'fun' : '∀'} ${binderHTML(b.name,t,n[4])} ${n[0] === 'lam' ? '=>' : ','} ${body}`;
      }
      case 'let': {
        const t = await f(n[2]), v = await f(n[3]);
        const b = {name:freshName(n[1],r.ctx),type:ref(n[2],r.ctx),owner:0};
        return `let ${esc(b.name)} : ${t} := ${v}; ${await format(ref(n[4],[b,...r.ctx]),budget,depth+1)}`;
      }
      case 'proj': {
        const field = P.declarations[n[1]]?.fields?.[n[2]];
        return field ? `(${await f(n[3])}).${nameHTML(n[1],true,field.split('.').at(-1))}` : `(${await f(n[3])}).${nameHTML(n[1],true,String(n[2]+1))}`;
      }
      default: return 'Unknown expression';
    }
  }
  function binderHTML(name,type,info) {
    const brackets = info === 'instance' ? ['[',']'] : info === 'implicit' ? ['{','}'] : info === 'strict implicit' ? ['⦃','⦄'] : ['(',')'];
    return `${brackets[0]}${esc(binderName(name))} : ${type}${brackets[1]}`;
  }
  async function bindingEnglish(b) {
    const name = await headName(b.type);
    const noun = name === 'DY.Participant' ? 'a participant' : name === 'DY.Bytes' ? 'a byte value' : name === 'Nat' ? 'a natural number' : null;
    if (noun) return `Take any <strong>${esc(b.name)}</strong>, ${noun}.`;
    const t = await get(b.type.id);
    if (t[0] === 'sort' && t[1] === '0') return `Let <strong>${esc(b.name)}</strong> be any proposition.`;
    let result = name && P.declarations[name] ? ref(P.declarations[name].type) : t[0] === 'bvar' ? b.type.ctx[t[1]]?.type : null;
    while (result) {
      const type = await get(result.id);
      if (type[0] !== 'forall') {
        if (type[0] === 'sort' && type[1] === '0') return `Assume the claim below; call this assumption <strong>${esc(b.name)}</strong>.`;
        break;
      }
      result = ref(type[3],result.ctx);
    }
    return b.info === 'instance' ? `Use the supplied <strong>${esc(b.name)}</strong> configuration below.` : `Take an arbitrary <strong>${esc(b.name)}</strong> of the type below.`;
  }
  function notice(message) {
    $('#notice').textContent = message; $('#notice').style.display = 'block';
    clearTimeout(notice.timer); notice.timer = setTimeout(() => $('#notice').style.display = 'none',3000);
  }
  function createEntry(r, role = '', expected = null, ancestry = [], definition = null) {
    const id = ++nextEntry;
    const entry = {key:id, ref:r, role, expected, ancestry, definition}; entries.set(id,entry);
    return entry;
  }
  async function headName(r) {
    const n = await get(r.id);
    if (n[0] === 'const') return n[1];
    if (n[0] === 'app') {const h = await get(n[1]); return h[0] === 'const' ? h[1] : null;}
    return n[0] === 'proj' ? n[1] : null;
  }
  function operation(name) {
    if (/\.(casesOn|rec|recOn|elim)$/.test(name) || /\.match_\d+$/.test(name)) return 'Consider the possible cases';
    if (name === 'And.intro') return 'Prove both';
    if (name === 'Or.inl') return 'Prove the left alternative';
    if (name === 'Or.inr') return 'Prove the right alternative';
    if (name === 'Exists.intro') return 'Provide a witness';
    if (name === 'False.elim') return 'Close by contradiction';
    if (name === 'Eq.mp' || name === 'Eq.mpr' || name === 'Eq.ndrec' || name === 'Eq.rec') return 'Transport / rewrite';
    if (/\._proof_/.test(name)) return 'Use a proof generated by Lean';
    return P.declarations[name]?.kind === 'theorem' ? 'Use the lemma' : 'Apply the function';
  }
  // Consecutive lambdas are one introduction group, retaining their exact
  // binder types and order. The body is still the unchanged expression.
  async function introductions(e) {
    let r = e.ref, expected = e.expected;
    const bindings = [];
    while (true) {
      const n = await get(r.id); if (n[0] !== 'lam') break;
      const b = {name:freshName(n[1],r.ctx),type:ref(n[2],r.ctx),owner:e.key,info:n[4]};
      bindings.push(b);
      if (expected) {
        const t = await get(expected.id);
        expected = t[0] === 'forall' ? ref(t[3],[b,...expected.ctx]) : null;
      }
      r = ref(n[3],[b,...r.ctx]);
    }
    return {bindings,body:r,expected};
  }
  async function row(e) {
    const n = await get(e.ref.id), name = await headName(e.ref);
    let label, leanLabel, subtitle = '', bindingsHTML = '', expandable = true;
    if (e.definition) {
      label = `<span class="operation">${esc(P.declarations[e.definition].kind)} body</span>${nameHTML(e.definition)}`;
      leanLabel = `${nameHTML(e.definition,true)} := …`;
    } else if (n[0] === 'lam') {
      const intro = await introductions(e);
      label = '<span class="operation">Start with these names and assumptions</span>';
      const binders = [];
      for (const b of intro.bindings) {
        const type = await format(b.type,{left:100});
        const lean = binderHTML(b.name,type,b.info);
        const english = await bindingEnglish(b);
        binders.push(`<div class="visible-binding"><div class="english-only binding-explanation">${english}</div><code>${lean}</code></div>`);
      }
      leanLabel = '<span class="kw">fun</span>';
      bindingsHTML = `<div class="visible-bindings">${binders.join('')}</div><div class="lean-only lean-code"><span class="kw">=&gt;</span> …</div>`;
    } else if (n[0] === 'let') {
      const b = freshName(n[1],e.ref.ctx);
      label = `<span class="operation">Name an intermediate result</span> ${esc(b)}`;
      leanLabel = `<span class="kw">let</span> ${esc(b)} : ${await format(ref(n[2],e.ref.ctx),{left:100})} := …; …`;
    }
    else if (n[0] === 'app') {
      const h = await get(n[1]);
      label = name ? `<span class="operation">${esc(operation(name))}</span>${nameHTML(name)}` : h[0] === 'bvar' ? `<span class="operation">Apply</span>${boundHTML(e.ref.ctx[h[1]],h[1])}` : '<span class="operation">Apply a function</span>';
      leanLabel = await format(e.ref,{left:65,shallow:true});
      subtitle = `${n[2].length} arguments — expand ▸ to see what is supplied to this step.`;
    } else if (n[0] === 'const') {
      const d = P.declarations[n[1]];
      label = `<span class="operation">${esc(d?.kind || 'constant')}</span>${nameHTML(n[1])}`;
      leanLabel = nameHTML(n[1],true);
      expandable = d?.body != null;
      if (!expandable) subtitle = d?.kind === 'axiom' ? 'Axiom · no proof body' : `${d?.kind || 'Primitive'} · no definition body to expand`;
    } else if (n[0] === 'bvar') {
      label = `<span class="operation">Use local</span>${boundHTML(e.ref.ctx[n[1]],n[1])}`; expandable = false;
      leanLabel = boundHTML(e.ref.ctx[n[1]],n[1]);
    } else if (n[0] === 'forall') {
      label = `<span class="operation">For any</span> ${esc(binderName(n[1]))}`;
      leanLabel = `∀ ${binderHTML(n[1],await format(ref(n[2],e.ref.ctx),{left:100}),n[4])}, …`;
    } else if (n[0] === 'proj') {
      label = `<span class="operation">Read a field from</span> ${nameHTML(n[1])}`;
      leanLabel = await format(e.ref,{left:65,shallow:true});
    }
    else {label = await format(e.ref,{left:8}); expandable = false;}
    const labels = leanLabel ? `<div class="row-label english-only">${label}</div><div class="row-label lean-only lean-code">${leanLabel}</div>` : `<div class="row-label">${label}</div>`;
    return `<li data-entry="${e.key}"><div class="term-row" id="term-${e.key}"><button class="expand" data-expand="${e.key}" aria-expanded="false" aria-label="Expand ${esc(e.role || 'term')}" ${expandable ? '' : 'disabled'}>${expandable ? '▸' : '·'}</button><div class="row-content">${e.role ? `<span class="role">${esc(e.role)}</span>` : ''}${labels}${bindingsHTML}${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div><button class="inspect" data-inspect="${e.key}">Details</button></div></li>`;
  }
  async function rows(items) {return '<ul class="tree">'+(await Promise.all(items.map(row))).join('')+'</ul>';}
  // Recover argument binder names/visibility/types directly from a named
  // function's forall type. Keep dependent types tied to the applied arguments.
  async function applicationArguments(r, n) {
    const h = await get(n[1]);
    let t = h[0] === 'const' && P.declarations[h[1]] ? ref(P.declarations[h[1]].type) : h[0] === 'bvar' ? r.ctx[h[1]]?.type : null;
    const args = [];
    for (let i = 0; i < n[2].length; i++) {
      const arg = ref(n[2][i],r.ctx);
      const binder = t ? await get(t.id) : null;
      const name = binder?.[0] === 'forall' ? binder[1] : `argument ${i+1}`;
      const info = binder?.[0] === 'forall' ? binder[4] : 'explicit';
      const expected = binder?.[0] === 'forall' ? ref(binder[2],t.ctx) : null;
      args.push({ref:arg,name:binderName(name),info,expected});
      t = binder?.[0] === 'forall' ? ref(binder[3],[{name,valueRef:arg,owner:0},...t.ctx]) : null;
    }
    return args;
  }
  async function argumentsFor(e,n) {
    const items = [], hidden = [];
    for (const arg of await applicationArguments(e.ref,n)) {
      const role = arg.info === 'explicit' ? arg.name : `${arg.name} — filled in by Lean (${arg.info})`;
      const item = createEntry(arg.ref,role,arg.expected,e.ancestry);
      (arg.info === 'explicit' ? items : hidden).push(item);
    }
    return {items,hidden};
  }
  function declarationButton(name,e) {
    const d = P.declarations[name];
    if (!d) return '';
    if (d.body == null) return `<p class="terminal">${esc(d.kind)}: no body. ${nameHTML(name)} ${d.kind === 'axiom' ? 'is an axiom used by the proof.' : 'is a primitive at this boundary.'}</p>`;
    if (e.ancestry.includes(name)) return `<p class="terminal">↻ ${nameHTML(name)} already occurs on this declaration path. Cycle stops here.</p>`;
    return `<button class="open-body" data-body="${esc(name)}" data-parent="${e.key}">▸ Open ${esc(short(name))} — ${esc(d.kind)} body with its own parameters</button>`;
  }
  async function expand(e,li,button) {
    if (button.getAttribute('aria-expanded') === 'true') {
      li.querySelector(':scope > .children')?.remove(); button.setAttribute('aria-expanded','false'); button.textContent = '▸'; return;
    }
    button.disabled = true;
    const box = document.createElement('div'); box.className='children'; box.innerHTML='<p class="tree-loading">Loading terms…</p>'; li.append(box);
    try {
      const n = await get(e.ref.id), items = [];
      let after = '', before = '';
      if (e.definition) {
        items.push(createEntry(e.ref,'compiled body',e.expected,[...e.ancestry,e.definition]));
      } else if (n[0] === 'lam') {
        const intro = await introductions(e);
        items.push(createEntry(intro.body,'continue using the names above',intro.expected,e.ancestry));
      } else if (n[0] === 'let') {
        const b = {name:freshName(n[1],e.ref.ctx),type:ref(n[2],e.ref.ctx),owner:e.key};
        items.push(createEntry(ref(n[3],e.ref.ctx),`proof / value of ${n[1]}`,b.type,e.ancestry));
        items.push(createEntry(ref(n[4],[b,...e.ref.ctx]),`continue with ${n[1]}`,e.expected,e.ancestry));
      } else if (n[0] === 'app') {
        const {items:args,hidden} = await argumentsFor(e,n); items.push(...args);
        const name = await headName(e.ref);
        if (name) before = declarationButton(name,e);
        else items.unshift(createEntry(ref(n[1],e.ref.ctx),'function being applied',null,e.ancestry));
        if (hidden.length) after = `<details class="arguments"><summary>${hidden.length} extra arguments Lean fills in automatically (implicit)</summary>${await rows(hidden)}</details>`;
      } else if (n[0] === 'const') before = declarationButton(n[1],e);
      else if (n[0] === 'forall') {
        const b = {name:freshName(n[1],e.ref.ctx),type:ref(n[2],e.ref.ctx),owner:e.key};
        items.push(createEntry(b.type,`type of ${n[1]}`,null,e.ancestry));
        items.push(createEntry(ref(n[3],[b,...e.ref.ctx]),'conclusion',null,e.ancestry));
      } else if (n[0] === 'proj') {
        before = declarationButton(n[1],e);
        items.push(createEntry(ref(n[3],e.ref.ctx),'structure whose field is selected',null,e.ancestry));
      }
      if (!li.isConnected) return;
      box.innerHTML = before+(items.length ? await rows(items) : '')+after;
      button.setAttribute('aria-expanded','true'); button.textContent='▾';
    } catch(error) {box.innerHTML=`<p class="terminal">${esc(error.message)} Collapse and open again to retry.</p>`; button.setAttribute('aria-expanded','true');}
    finally {button.disabled=false;}
  }
  async function openBody(button) {
    button.disabled=true;
    const e = entries.get(Number(button.dataset.parent)), name=button.dataset.body, d=P.declarations[name];
    try {
      const item=createEntry(ref(d.body),`helper: ${short(name)}`,ref(d.type),e.ancestry,name);
      const shell=document.createElement('div'); shell.innerHTML=await rows([item]);
      button.after(shell); button.remove();
      const li=shell.querySelector('li'), toggle=li.querySelector('.expand');
      await expand(item,li,toggle);
    } catch(error) {notice(error.message); button.disabled=false;}
  }
  async function inspect(e) {
    const epoch=revision;
    const n=await get(e.ref.id);
    let expected=e.expected;
    if (!expected && n[0] === 'bvar') expected=e.ref.ctx[n[1]]?.type;
    if (!expected && n[0] === 'const') expected=ref(P.declarations[n[1]].type);
    const term=await format(e.ref,{left:700}), type=expected ? await format(expected,{left:900}) : 'Open the parent step to see what this part must produce.';
    const contexts=[];
    for (const b of [...e.ref.ctx].reverse()) {
      contexts.push(`<div class="context-binding"><button data-jump="${b.owner}">${esc(binderName(b.name))}</button><pre>${b.type ? await format(b.type,{left:200}) : b.valueRef ? await format(b.valueRef,{left:120}) : ''}</pre></div>`);
    }
    if(epoch!==revision) return;
    document.querySelectorAll('.term-row.selected').forEach(el=>el.classList.remove('selected'));
    document.getElementById('term-'+e.key)?.classList.add('selected');
    $('#selected-term').innerHTML=term; $('#selected-type').innerHTML=type;
    $('#selected-context').innerHTML=contexts.join('') || '<p class="muted">No local hypotheses at this position.</p>';
    $('#term-details').hidden=false;
    $('#term-details').scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
  function jump(key) {
    const target=document.getElementById('term-'+key);
    if (!target) {notice('This binder is displayed inside the type preview. Open the corresponding introduction in the tree.'); return;}
    target.scrollIntoView?.({block:'center',behavior:'smooth'}); target.classList.add('flash'); setTimeout(()=>target.classList.remove('flash'),1800);
  }
  async function render() {
    const epoch=++revision;
    const name=new URLSearchParams(location.hash.slice(1)).get('proof') || trail[0].name;
    const d=P.declarations[name];
    if (!d) {$('#proof-tree').innerHTML='<p class="terminal">Declaration not found. Choose a proof from the reading trail.</p>';return;}
    current=name; entries.clear(); nextEntry=0; $('#term-details').hidden=true;
    document.title=short(name)+' · DyLean proof';
    $('#proof-title').textContent=short(name);
    $('#proof-description').textContent=trail.find(t=>t.name===name)?.description || `${d.kind} from ${d.module}. Open its actual compiled body and follow any referenced helper.`;
    document.querySelectorAll('.landmark').forEach(b=>{b.classList.toggle('active',b.dataset.proof===name);b.setAttribute('aria-current',b.dataset.proof===name?'page':'false');});
    const source=sourceURL(name); $('#theorem-source').hidden=!source;
    if(source) {$('#theorem-source').href=source;$('#source-frame').src=source;}
    $('#printed-proof').hidden=!P.seeds.includes(name);
    $('#printed-proof').href='proofs/'+encodeURIComponent(name)+'.txt';
    $('#proof-tree').innerHTML='<p class="tree-loading">Loading the compiled expression…</p>';
    try {
      const statement=await format(ref(d.type),{left:2200});
      if(epoch!==revision) return;
      $('#statement').innerHTML=statement;
      if(d.body==null) {$('#proof-tree').innerHTML=`<p class="terminal">${esc(d.kind)} · this declaration has no definition body.</p>`;return;}
      const root=createEntry(ref(d.body),'the compiled proof / definition',ref(d.type),[name]);
      const html=await rows([root]); if(epoch!==revision) return;
      $('#proof-tree').innerHTML=html;
      const li=$('li',$('#proof-tree')), toggle=$('.expand',li); if(!toggle.disabled) await expand(root,li,toggle);
    } catch(error) {if(epoch===revision) $('#proof-tree').innerHTML=`<p class="terminal">${esc(error.message)} <button id="retry">Retry</button></p>`;}
  }
  function select(name) {
    if(current===name) render();
    else location.hash=new URLSearchParams({proof:name}).toString();
  }
  function search() {
    const q=$('#proof-search').value.toLowerCase().trim();
    if(!q) {$('#search-results').innerHTML='';return;}
    const tokens=q.split(/\s+/);
    const result=Object.values(P.declarations).filter(d=>tokens.every(t=>(d.name+' '+d.module).toLowerCase().includes(t))).sort((a,b)=>Number(a.name.startsWith('_private'))-Number(b.name.startsWith('_private')) || a.name.localeCompare(b.name));
    $('#search-results').innerHTML=result.slice(0,16).map(d=>`<button class="search-result" data-proof="${esc(d.name)}">${esc(short(d.name))}<br><small>${esc(d.kind)}</small></button>`).join('')+`<p class="muted">${result.length} matches${result.length>16?' · refine to see more':''}</p>`;
  }
  $('#landmarks').innerHTML=trail.map(t=>`<button class="landmark" data-proof="${esc(t.name)}"><b>${esc(t.title)}</b><small>${esc(t.subtitle)}</small></button>`).join('');
  $('#build-info').textContent=`${P.meta.proofDeclarations.toLocaleString()} declarations · ${P.nodeCount.toLocaleString()} exact expression nodes · ${P.meta.toolchain} · source ${P.meta.revision}`;
  document.addEventListener('click',async event=>{
    const proof=event.target.closest('[data-proof]'); if(proof) {select(proof.dataset.proof);return;}
    const jumpButton=event.target.closest('[data-jump]');if(jumpButton){jump(Number(jumpButton.dataset.jump));return;}
    const inspectButton=event.target.closest('[data-inspect]');if(inspectButton){try{await inspect(entries.get(Number(inspectButton.dataset.inspect)));}catch(error){notice(error.message);}return;}
    const body=event.target.closest('[data-body]');if(body){await openBody(body);return;}
    const toggle=event.target.closest('[data-expand]');if(toggle&&!toggle.disabled){const e=entries.get(Number(toggle.dataset.expand));await expand(e,toggle.closest('li'),toggle);return;}
    const source=event.target.closest('a[target="source-frame"]');if(source){document.body.classList.remove('hide-source');$('.source-panel').classList.add('visible');$('#toggle-source').textContent=matchMedia('(max-width:950px)').matches?'Close source':'Hide source';}
    if(event.target.closest('#retry')) render();
  });
  $('#proof-search').addEventListener('input',search);
  function setLanguage(language) {
    if (!['lean','english'].includes(language)) return;
    document.body.dataset.language = language;
    document.querySelectorAll('[data-language-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.languageChoice===language)));
    try {localStorage.setItem('dylean-proof-language',language);} catch {}
  }
  document.querySelectorAll('[data-language-choice]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.languageChoice)));
  try {setLanguage(localStorage.getItem('dylean-proof-language') || 'lean');} catch {setLanguage('lean');}
  $('#collapse').addEventListener('click',render);
  $('#close-details').addEventListener('click',()=>$('#term-details').hidden=true);
  $('#toggle-source').addEventListener('click',()=>{
    if(matchMedia('(max-width:950px)').matches){$('.source-panel').classList.remove('visible');return;}
    const hidden=document.body.classList.toggle('hide-source');$('#toggle-source').textContent=hidden?'Show source':'Hide source';
  });
  $('#copy-proof-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);notice('Proof link copied');}catch{window.prompt('Copy this proof link:',location.href);}});
  $('#about-button').addEventListener('click',()=>$('#about').showModal());
  $('#close-about').addEventListener('click',()=>$('#about').close());
  window.addEventListener('hashchange',render);
  if(!location.hash) {
    const initial = '#'+new URLSearchParams({proof:trail[0].name});
    if(location.protocol === 'file:') location.replace(initial);
    else history.replaceState(null,'',initial);
  }
  render();
})();
