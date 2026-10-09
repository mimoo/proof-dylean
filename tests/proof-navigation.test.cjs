const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const dist = path.resolve(__dirname,'../dist');
const wait = async predicate => {
  for (let i=0;i<200;i++) {if(predicate())return;await new Promise(r=>setTimeout(r,10));}
  throw new Error('Timed out waiting for proof UI');
};
function setup(protocol='https') {
  const dom = new JSDOM(fs.readFileSync(path.join(dist,'proof.html'),'utf8'),{url:protocol==='file'?'file:///tmp/proof-dylean/proof.html':'https://example.test/subpath/proof.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, $=s=>w.document.querySelector(s);
  w.matchMedia=()=>({matches:false});
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const append=w.document.head.append.bind(w.document.head);
  w.document.head.append=el=>{
    append(el);
    if(el.tagName==='SCRIPT')setTimeout(()=>{
      try {w.eval(fs.readFileSync(path.join(dist,el.getAttribute('src')),'utf8'));el.onload();}
      catch {el.onerror();}
    },0);
  };
  w.eval(fs.readFileSync(path.join(dist,'proof-data.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(dist,'proof.js'),'utf8'));
  return {dom,w,$};
}

test('real secrecy certificate expands, exposes helper bodies, retains context and source links',async()=>{
  const {dom,w,$}=setup();
  try {
    await wait(()=>$('#proof-tree .expand[aria-expanded="true"]'));
    assert.ok($('#proof-title').textContent.includes('client_secrecy'));
    const chunks=Object.keys(w.DYLEAN_PROOF_CHUNKS).length;
    assert.ok(chunks<20,'Only a small fraction of chunks load initially');
    const application=$('#proof-tree .expand[aria-expanded="false"]');application.click();
    await wait(()=>$('#proof-tree .open-body'));
    assert.ok($('#proof-tree .open-body').textContent.includes('apply_Reachable'));
    assert.ok($('#proof-tree .visible-bindings').textContent.includes('client : DY.Participant'));
    assert.equal([...w.document.querySelectorAll('#proof-tree summary')].some(s=>s.textContent.includes('binder')),false);
    assert.ok([...w.document.querySelectorAll('#proof-tree .arguments summary')].some(s=>s.textContent.includes('implicit')));
    const premise=[...w.document.querySelectorAll('#proof-tree .term-row')].find(r=>r.textContent.includes('Start with these names')&&r.textContent.includes('h_trinv'));
    assert.ok(premise);premise.querySelector('[data-expand]').click();
    await wait(()=>[...w.document.querySelectorAll('#proof-tree .term-row')].some(r=>r.textContent.includes('Name an intermediate result')&&r.textContent.includes('this')));
    const continuation=[...w.document.querySelectorAll('#proof-tree .term-row')].find(r=>r.textContent.includes('Name an intermediate result')&&r.textContent.includes('this'));
    continuation.querySelector('[data-expand]').click();
    await wait(()=>$('#proof-tree [data-jump]'));
    continuation.querySelector('[data-inspect]').click();
    await wait(()=>!$('#term-details').hidden);
    assert.ok($('#selected-context').textContent.includes('h_pub'));
    assert.ok($('#selected-context').textContent.includes('h_ev'));
    const source=$('#proof-tree a[target="source-frame"]');
    assert.ok(source.href.includes('symbol='));
    const expanded=w.document.querySelectorAll('[aria-expanded="true"]').length;
    source.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
    assert.equal(w.document.querySelectorAll('[aria-expanded="true"]').length,expanded);
    const helper=$('#proof-tree .open-body');helper.click();
    await wait(()=>$('#proof-tree .role')&&$('#proof-tree').textContent.includes('helper: Trace.apply_Reachable'));
    assert.ok($('#proof-tree').textContent.includes('body'));
  } finally {w.close();}
});

test('offline chunks, proof routes, search, and cycle boundaries remain usable',async()=>{
  const {w,$}=setup('file');
  try {
    await wait(()=>$('#proof-tree .expand[aria-expanded="true"]'));
    $('[data-proof="DY.Bytes.AttackerKnows_implies_Publishable"]').click();
    await wait(()=>$('#proof-title').textContent.includes('AttackerKnows_implies')&&$('#proof-tree .expand[aria-expanded="true"]'));
    assert.ok(w.location.hash.includes('AttackerKnows_implies'));
    $('#proof-search').value='SignedDH.client_secrecy._proof_';$('#proof-search').dispatchEvent(new w.Event('input'));
    assert.ok($('#search-results [data-proof]'));
    $('#search-results [data-proof]').click();
    await wait(()=>$('#proof-title').textContent.includes('_proof_')&&$('#proof-tree .expand[aria-expanded="true"]'));
    assert.ok($('#theorem-source').href.includes('SecurityTheorems'));
    assert.equal($('#printed-proof').hidden,true);
    $('#about-button').click();assert.equal($('#about').open,true);
    $('#close-about').click();assert.equal($('#about').open,false);
    $('#collapse').click();await wait(()=>$('#proof-tree .expand[aria-expanded="true"]'));
    $('#proof-search').value='DY.Hash.hashLength';$('#proof-search').dispatchEvent(new w.Event('input'));
    const literal=[...w.document.querySelectorAll('#search-results [data-proof]')].find(b=>b.dataset.proof==='DY.Hash.hashLength');
    assert.ok(literal);literal.click();await wait(()=>$('#proof-title').textContent==='Hash.hashLength'&&$('#proof-tree').textContent.includes('32'));
    const number=[...w.document.querySelectorAll('#proof-tree .row-label')].find(el=>el.textContent==='32');
    assert.ok(number);assert.ok(number.closest('li').querySelector('[data-expand]').disabled);
  } finally {w.close();}
});


test('Lean and English toggle keeps expanded branches and shows every introduced type openly',async()=>{
  const {w,$}=setup();
  try {
    await wait(()=>$('#proof-tree .expand[aria-expanded="true"]'));
    assert.equal(w.document.body.dataset.language,'lean');
    const root=$('#proof-tree .term-row');
    assert.equal(root.querySelector('.lean-only.row-label').textContent,'fun');
    const binders=[...root.querySelectorAll('.visible-binding code')].map(b=>b.textContent);
    assert.deepEqual(binders,['{time : Nat}','(client : DY.Participant)','(server : DY.Participant)','(xPk : DY.Bytes)','(yPk : DY.Bytes)','(k : DY.Bytes)']);
    assert.ok(root.querySelector('.visible-bindings').closest('details')===null);
    const application=$('#proof-tree .expand[aria-expanded="false"]');application.click();
    await wait(()=>$('#proof-tree .open-body'));
    const expanded=[...w.document.querySelectorAll('#proof-tree .expand[aria-expanded="true"]')];
    $('[data-language-choice="english"]').click();
    assert.equal(w.document.body.dataset.language,'english');
    assert.equal($('[data-language-choice="english"]').getAttribute('aria-pressed'),'true');
    assert.ok(root.querySelector('.binding-explanation').textContent.includes('natural number'));
    assert.ok([...root.querySelectorAll('.binding-explanation')].some(b=>b.textContent==='Take any client, a participant.'));
    assert.ok([...root.querySelectorAll('.binding-explanation')].some(b=>b.textContent==='Take any k, a byte value.'));
    assert.deepEqual([...w.document.querySelectorAll('#proof-tree .expand[aria-expanded="true"]')],expanded);
    $('[data-language-choice="lean"]').click();
    assert.equal(w.document.body.dataset.language,'lean');
    assert.deepEqual([...w.document.querySelectorAll('#proof-tree .expand[aria-expanded="true"]')],expanded);
    assert.equal(w.localStorage.getItem('dylean-proof-language'),'lean');
    const code=$('#proof-tree .children .lean-code');
    assert.ok(code.textContent.includes('DY.Trace.apply_Reachable_implies_Invariant'));
    assert.equal(code.textContent.includes('instTraceInvariant'),false,'Lean previews omit implicit configuration arguments');
    assert.ok($('.statement summary').textContent.includes("statement we're proving"));
    assert.equal($('#proof-tree').textContent.includes('inspect for their types'),false);
  } finally {w.close();}
});
