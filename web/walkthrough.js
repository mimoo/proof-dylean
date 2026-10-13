(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const steps=[...document.querySelectorAll('.step')];
  const ids=steps.map(s=>s.dataset.step);
  const narration=window.DYLEAN_NARRATION||{};
  const audio=$('#audio'), transcript=$('#transcript'), dots=$('#dots');
  const prefs=(()=>{try{return JSON.parse(localStorage.getItem('dylean-walkthrough')||'{}')}catch(e){return {}}})();
  const save=()=>{try{localStorage.setItem('dylean-walkthrough',JSON.stringify({autoplay:$('#autoplay').checked,voice:$('#voice').checked}))}catch(e){}};
  // Set explicitly so a reload's form-state restoration cannot override the stored preference.
  $('#autoplay').checked=prefs.autoplay!==false;
  $('#voice').checked=prefs.voice!==false;

  let current=-1, words=[], wordEls=[], armed=false, timer=null, cues=[], cueEls=[], lastCue=null;
  const norm=w=>w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  // Each element's data-cue holds narration phrases ("a|b"); a cue fires when its first word is spoken.
  function resolveCues(step){
    cueEls=[...step.querySelectorAll('[data-cue]')];
    const toks=words.map(w=>norm(w[0]));
    cues=[];
    cueEls.forEach(el=>{
      el.classList.remove('focus','dim');
      el.dataset.cue.split('|').forEach(phrase=>{
        const ph=phrase.trim().split(/\s+/).map(norm).filter(Boolean);
        if(!ph.length)return;
        for(let i=0;i+ph.length<=toks.length;i++){
          if(ph.every((t,j)=>toks[i+j]===t)){cues.push({t:words[i][1],el});return}
        }
        if(window.console&&location.hostname==='127.0.0.1')console.warn('cue not found in narration:',step.dataset.step,phrase);
      });
    });
    cues.sort((a,b)=>a.t-b.t);
    lastCue=null; step.classList.remove('cueing');
  }
  function paintCues(t){
    if(!cues.length)return;
    let at=null;
    for(const c of cues){ if(c.t<=t+0.05) at=c.t; else break; }
    if(at===lastCue)return;
    lastCue=at;
    const step=steps[current];
    const active=at===null?[]:cues.filter(c=>c.t===at).map(c=>c.el); // several elements may share one phrase
    step.classList.toggle('cueing',active.length>0);
    cueEls.forEach(el=>{const related=active.some(a=>a===el||a.contains(el)||el.contains(a));el.classList.toggle('focus',active.includes(el));el.classList.toggle('dim',active.length>0&&!related)});
    if(active.length){
      const r=active[0].getBoundingClientRect(), box=step.getBoundingClientRect();
      if(r.top<box.top||r.bottom>box.bottom) active[0].scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }
  function clearCues(){ lastCue=null; steps[current]?.classList.remove('cueing'); cueEls.forEach(el=>el.classList.remove('focus','dim')); }
  const fmt=t=>{t=Math.max(0,Math.round(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
  const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  dots.innerHTML=ids.map((id,i)=>`<button role="tab" data-i="${i}" aria-label="Step ${i+1}: ${esc(steps[i].dataset.title)}" title="${esc(steps[i].dataset.title)}"></button>`).join('');
  dots.addEventListener('click',e=>{const b=e.target.closest('button');if(b)go(+b.dataset.i,true)});

  function renderTranscript(id){
    const n=narration[id];
    words=n?n.words:[];
    if(!n){transcript.innerHTML='<em>No narration for this step.</em>';wordEls=[];return}
    transcript.innerHTML=n.words.map((w,i)=>`<span class="w" data-i="${i}">${esc(w[0])}</span>`).join(' ');
    wordEls=[...transcript.children];
    transcript.scrollTop=0;
  }
  transcript.addEventListener('click',e=>{
    const w=e.target.closest('.w');if(!w||!words.length)return;
    audio.currentTime=words[+w.dataset.i][1]; armed=true; play();
  });

  function paint(){
    const t=audio.currentTime;
    paintCues(t);
    let now=-1;
    for(let i=0;i<words.length;i++){ if(words[i][1]<=t+0.02) now=i; else break; }
    wordEls.forEach((el,i)=>{
      const said=i<now, isNow=i===now && t<words[i][2]+0.35;
      el.classList.toggle('said',said||i===now);
      el.classList.toggle('now',isNow);
    });
    if(now>=0){
      const el=wordEls[now], box=transcript;
      const top=el.offsetTop-box.offsetTop;
      if(top<box.scrollTop||top>box.scrollTop+box.clientHeight-40) box.scrollTo({top:Math.max(0,top-box.clientHeight/2),behavior:'smooth'});
    }
    $('#time').textContent=words.length?fmt(t)+' / '+fmt(audio.duration||narration[ids[current]].duration):'';
  }

  // Seeking needs HTTP range support, which simple static servers lack; a blob URL always seeks.
  const blobs=new Map(); let loadToken=0;
  function loadAudio(src){
    const token=++loadToken;
    const direct=()=>{ if(token===loadToken){ audio.src=src; audio.load(); if(armed) play(); } };
    if(blobs.has(src)){ audio.src=blobs.get(src); audio.load(); return; }
    if(location.protocol==='file:'||typeof fetch!=='function'){ direct(); return; }
    fetch(src).then(r=>{ if(!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b=>{ const url=URL.createObjectURL(b); blobs.set(src,url); if(token===loadToken){ audio.src=url; audio.load(); if(armed) play(); } })
      .catch(direct);
  }
  function prefetch(src){ if(blobs.has(src)||location.protocol==='file:'||typeof fetch!=='function') return; fetch(src).then(r=>r.ok?r.blob():null).then(b=>{ if(b&&!blobs.has(src)) blobs.set(src,URL.createObjectURL(b)); }).catch(()=>{}); }
  function setPlayIcon(){const p=$('#play');const playing=!audio.paused&&!audio.ended;p.textContent=playing?'❚❚':'▶';p.setAttribute('aria-label',playing?'Pause narration':'Play narration')}
  function play(){ if(!$('#voice').checked||!audio.src)return; audio.play().then(()=>{armed=true;setPlayIcon()}).catch(()=>setPlayIcon()); }
  function pause(){audio.pause();setPlayIcon()}

  function go(i,user){
    i=Math.max(0,Math.min(steps.length-1,i));
    if(i===current)return;
    clearTimeout(timer);
    current=i;
    const s=steps[i], id=ids[i];
    steps.forEach((el,j)=>el.classList.toggle('active',j===i));
    s.scrollTop=0;
    $('#eyebrow').textContent=s.dataset.eyebrow;
    $('#title').textContent=s.dataset.title;
    $('#counter').textContent=(i+1)+' / '+steps.length;
    $('#source-link').href='source.html#file='+s.dataset.source;
    [...dots.children].forEach((d,j)=>{d.classList.toggle('active',j===i);d.classList.toggle('done',j<i);d.setAttribute('aria-selected',j===i)});
    document.querySelectorAll('.script-line').forEach(l=>l.classList.toggle('active',l.dataset.lines.split(' ').includes(id)));
    $('#prev').disabled=i===0; $('#next').disabled=i===steps.length-1;
    renderTranscript(id);
    resolveCues(s);
    audio.pause();
    const n=narration[id];
    if(n){ loadAudio(n.src); if(armed && blobs.has(n.src)) play(); } else { audio.removeAttribute('src'); }
    paint(); setPlayIcon();
    if(history.replaceState) history.replaceState(null,'','#step='+id);
    if(user) document.title='DyLean · '+s.dataset.title;
    const next=narration[ids[i+1]]; if(next) prefetch(next.src);
  }

  audio.addEventListener('timeupdate',paint);
  audio.addEventListener('play',setPlayIcon); audio.addEventListener('pause',setPlayIcon);
  audio.addEventListener('ended',()=>{
    paint(); setPlayIcon(); clearCues();
    if($('#autoplay').checked && current<steps.length-1) timer=setTimeout(()=>go(current+1,true),900);
  });
  let raf; (function tick(){ if(!audio.paused) paint(); raf=requestAnimationFrame(tick); })();

  $('#prev').addEventListener('click',()=>go(current-1,true));
  $('#next').addEventListener('click',()=>go(current+1,true));
  $('#play').addEventListener('click',()=>{ if(audio.paused){ if(audio.ended) audio.currentTime=0; armed=true; play(); } else pause(); });
  $('#autoplay').addEventListener('change',save);
  $('#voice').addEventListener('change',()=>{ save(); if(!$('#voice').checked) pause(); else play(); });
  document.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea'))return;
    if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();go(current+1,true)}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();go(current-1,true)}
    else if(e.key===' '||e.key==='k'){e.preventDefault();$('#play').click()}
    else if(e.key==='Home'){go(0,true)} else if(e.key==='End'){go(steps.length-1,true)}
  });
  window.addEventListener('hashchange',()=>{const m=location.hash.match(/step=([\w-]+)/);if(m&&ids.includes(m[1]))go(ids.indexOf(m[1]),true)});

  const m=location.hash.match(/step=([\w-]+)/);
  go(m&&ids.includes(m[1])?ids.indexOf(m[1]):0,false);
})();
