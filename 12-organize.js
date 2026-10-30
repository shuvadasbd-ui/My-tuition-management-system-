/* ============ গুছানো (v49): Home-এ সতর্কতা এক জায়গায় + "আরও" ভাঁজ, Settings ৫ গ্রুপে ============ */
const ORG_KEY='tr_orgState';
function orgGet(){ return lsGet(ORG_KEY,{}) || {}; }
function orgSet(patch){ lsSet(ORG_KEY,Object.assign(orgGet(),patch)); }

/* ---------- Home: তিনটা সতর্কতা বক্স → একটা স্ট্যাক (প্রথমটা দেখায়, বাকিগুলো "আরও N টি") ---------- */
let orgAlertsOpen=false;
function orgAlertSync(){
  const stack=document.getElementById('alertStack'); if(!stack) return;
  const cards=['backupNagBox','dueReminderBox','absenceRiskBox'].flatMap(id=>[...(document.getElementById(id)||{children:[]}).children]);
  const live=cards.filter(c=>(c.textContent||'').trim());
  live.forEach((c,i)=>c.classList.toggle('as-hide', !orgAlertsOpen && i>0));
  let chip=document.getElementById('alertMore');
  if(live.length<2){ if(chip) chip.remove(); return; }
  if(!chip){ chip=document.createElement('button'); chip.type='button'; chip.id='alertMore'; chip.className='as-more'; chip.onclick=()=>{ orgAlertsOpen=!orgAlertsOpen; orgAlertSync(); }; stack.appendChild(chip); }
  chip.setAttribute('aria-expanded',String(orgAlertsOpen));
  chip.textContent=orgAlertsOpen?'ভাঁজ করো ▴':`আরও ${enNum(live.length-1)}টি সতর্কতা ▾`;
}
/* ---------- Home: ডেকোরেটিভ আর্ক + বুস্টার "আরও" অংশে ---------- */
function orgMoreApply(){
  const open=!!orgGet().homeMore, box=document.getElementById('homeMore'), btn=document.getElementById('homeMoreBtn'); if(!box||!btn) return;
  box.hidden=!open; btn.setAttribute('aria-expanded',String(open)); btn.querySelector('.hm-ch').textContent=open?'▴':'▾';
  if(open){ try{ renderAll(); }catch(e){} }   // draws the arc + booster now that they are visible
}
function orgToggleMore(){ orgSet({homeMore:!orgGet().homeMore}); orgMoreApply(); }
function orgSetupHome(){
  const home=document.getElementById('pageHome'); if(!home || document.getElementById('alertStack')) return;
  const first=document.getElementById('backupNagBox'), hero=home.querySelector('.hero'), focus=document.getElementById('focusCard');
  if(first){
    const stack=document.createElement('div'); stack.id='alertStack'; stack.className='alert-stack'; first.parentNode.insertBefore(stack,first);
    ['backupNagBox','dueReminderBox','absenceRiskBox'].forEach(id=>{ const b=document.getElementById(id); if(b){ stack.appendChild(b); new MutationObserver(orgAlertSync).observe(b,{childList:true}); } });
    orgAlertSync();
  }
  if(hero && focus){
    const btn=document.createElement('button'); btn.type='button'; btn.id='homeMoreBtn'; btn.className='home-more-btn'; btn.onclick=orgToggleMore;
    btn.innerHTML='<span>'+ico('spark')+' আরও দেখো <small>দিনের আর্ক · আজকের বুস্টার</small></span><b class="hm-ch">▾</b>';
    const box=document.createElement('div'); box.id='homeMore'; box.hidden=true;
    hero.parentNode.insertBefore(btn,hero); hero.parentNode.insertBefore(box,hero); box.appendChild(hero); box.appendChild(focus);
    orgMoreApply();
  }
}

/* ---------- Settings: ১৪টা সেকশন → ৫টা গ্রুপ (ভাঁজ করা), খোলা/বন্ধ মনে রাখে ---------- */
const ORG_GROUPS=[
  {id:'backup', ic:'cloud', t:'ব্যাকআপ', s:'ব্যাকআপ নেওয়া ও হেলথ-চেক', keys:['💾','🩺']},
  {id:'safety', ic:'shield', t:'নিরাপত্তা', s:'ডেটা সুরক্ষা ও আর্থিক গোপনীয়তা', keys:['🛡️','🙈']},
  {id:'notif',  ic:'bell', t:'নোটিফিকেশন', s:'নোটিফিকেশন ও রিমাইন্ডার নোট', keys:['🔔','📝']},
  {id:'look',   ic:'palette', t:'চেহারা', s:'থিম ও সংখ্যার ধরন', keys:['🎨','🔢']},
  {id:'data',   ic:'layers', t:'ডেটা ও রিপোর্ট', s:'ক্যালেন্ডার, লেট ফি, রিভিউ, এক্সপোর্ট, সেশন', keys:null},
];
function orgGroupify(){
  const body=document.getElementById('settingsBody'); if(!body) return;
  const secs=[...body.children].filter(e=>e.classList.contains('settings-section')); if(!secs.length) return;
  obs.disconnect();
  const open=orgGet().setOpen||{}, pick=new Map(ORG_GROUPS.map(g=>[g.id,[]]));
  secs.forEach(s=>{ const t=(s.textContent||'').trim(); const g=ORG_GROUPS.find(x=>x.keys&&x.keys.some(k=>t.startsWith(k)))||ORG_GROUPS[ORG_GROUPS.length-1]; pick.get(g.id).push(s); });
  const anchor=secs[0];
  ORG_GROUPS.forEach(g=>{ const items=pick.get(g.id); if(!items.length) return;
    const wrap=document.createElement('div'); wrap.className='set-group'+(open[g.id]?' open':''); wrap.dataset.g=g.id;
    wrap.innerHTML=`<button type="button" class="sg-head" aria-expanded="${!!open[g.id]}" onclick="orgToggleGroup('${g.id}')"><span class="sg-ic">${ico(g.ic)}</span><span class="sg-tx"><b>${g.t}</b><small>${g.s}</small></span><i class="sg-ch">▾</i></button><div class="sg-body"></div>`;
    const inner=wrap.querySelector('.sg-body'); items.forEach(s=>inner.appendChild(s));
    body.insertBefore(wrap,anchor.parentNode===body?anchor:null);
  });
  obs.observe(body,{childList:true});
}
function orgToggleGroup(id){
  const open=Object.assign({},orgGet().setOpen||{}); open[id]=!open[id]; orgSet({setOpen:open});
  const w=document.querySelector(`.set-group[data-g="${id}"]`); if(w){ w.classList.toggle('open',!!open[id]); w.querySelector('.sg-head').setAttribute('aria-expanded',String(!!open[id])); }
}
const obs=new MutationObserver(()=>{ const b=document.getElementById('settingsBody'); if(b && [...b.children].some(e=>e.classList.contains('settings-section'))) orgGroupify(); });
(function init(){
  orgSetupHome();
  const b=document.getElementById('settingsBody'); if(b){ obs.observe(b,{childList:true}); orgGroupify(); }
})();

/* ---------- "সব ইংরেজি" মোডে হাতে-লেখা বাংলা সংখ্যাও (০-৯ → 0-9) বদলে দেয়, পরে আসা লেখাতেও ---------- */
(function numEnDom(){
  if(_numMode!=='en') return;
  document.body.classList.add('num-en');
  const MAP={'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'}, conv=t=>t.replace(/[০-৯]/g,c=>MAP[c]), HAS=/[০-৯]/, SKIP=/^(SCRIPT|STYLE|TEXTAREA)$/, ATTRS=['placeholder','title','aria-label'];
  function fixAttrs(el){ ATTRS.forEach(a=>{ const v=el.getAttribute(a); if(v&&HAS.test(v)) el.setAttribute(a,conv(v)); }); }
  function fix(root){
    if(root.nodeType===3){ if(HAS.test(root.nodeValue)) root.nodeValue=conv(root.nodeValue); return; }
    if(root.nodeType!==1 || SKIP.test(root.tagName)) return;
    fixAttrs(root);
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode:n=>(n.nodeType===1&&SKIP.test(n.tagName))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    let n; while((n=w.nextNode())){ if(n.nodeType===3){ if(HAS.test(n.nodeValue)) n.nodeValue=conv(n.nodeValue); } else fixAttrs(n); }
  }
  const queue=new Set(); let sched=false;
  const flush=()=>{ sched=false; const q=[...queue]; queue.clear(); q.forEach(n=>{ if(n.isConnected) fix(n); }); };
  new MutationObserver(ms=>{ ms.forEach(m=>{ if(m.type==='characterData') queue.add(m.target); else m.addedNodes.forEach(n=>queue.add(n)); }); if(!sched){ sched=true; requestAnimationFrame(flush); } })
    .observe(document.body,{childList:true,subtree:true,characterData:true});
  fix(document.body); document.title=conv(document.title);
})();

/* ---------- ট্যাপে হালকা টিক (ভাইব্রেশন) ---------- */
document.addEventListener('pointerdown',e=>{ if(e.target.closest&&e.target.closest('.nav-btn,.pct-chip,.kq button,.sg-head,.tm-sheet button,.home-more-btn,.as-more')) haptic('tick'); },{passive:true});

/* ---------- শিডিউল: "লিখে বলো" বক্সে উদাহরণ ও আইকনের মানে — দরকার হলে খোলে ---------- */
function orgCmdApply(){
  const st=orgGet(), ex=document.getElementById('cmdExamples'), lg=document.querySelector('.icon-legend');
  if(ex) ex.hidden=!st.cmdEx; if(lg) lg.hidden=!st.cmdLg;
  document.querySelectorAll('#cmdToggles button').forEach(b=>{ const on=!!st[b.dataset.k==='ex'?'cmdEx':'cmdLg']; b.classList.toggle('on',on); b.setAttribute('aria-expanded',String(on)); b.querySelector('i').textContent=on?'▴':'▾'; });
}
function orgCmdToggle(k){ const key=k==='ex'?'cmdEx':'cmdLg'; orgSet({[key]:!orgGet()[key]}); orgCmdApply(); }
(function setupSchedule(){
  const wrap=document.querySelector('.cmd-wrap'), ex=document.getElementById('cmdExamples'), lg=document.querySelector('.icon-legend');
  if(!wrap||!ex||!lg||document.getElementById('cmdToggles')) return;
  const row=document.createElement('div'); row.id='cmdToggles'; row.className='cmd-toggles';
  row.innerHTML='<button type="button" data-k="ex" onclick="orgCmdToggle(\'ex\')">উদাহরণ <i>▾</i></button><button type="button" data-k="lg" onclick="orgCmdToggle(\'lg\')">আইকনের মানে <i>▾</i></button>';
  ex.parentNode.insertBefore(row,ex);
  wrap.insertBefore(lg,document.getElementById('cmdResult'));
  orgCmdApply();
})();

/* ---------- রিপোর্ট: প্রতিটা অংশ ভাঁজ করা যায়; তথ্য না থাকা অংশ নিজে থেকে ভাঁজ থাকে ---------- */
function orgReportsGroup(){
  const body=document.getElementById('reportsBody'); if(!body) return;
  const st=(orgGet().rpOpen)||{};
  [...body.querySelectorAll(':scope > .settings-section-title')].forEach(t=>{
    const row=t.nextElementSibling; if(!row||!row.classList.contains('settings-row')) return;
    const txt=row.innerText||'', empty=!row.querySelector('input,canvas,.kh-bar') && (!!row.querySelector('.ins-empty') || (/এখনো|নেই/.test(txt) && txt.length<140));
    const key=t.textContent.replace(/[০-৯0-9()]/g,'').trim(), open=key in st ? !!st[key] : !empty;
    const sec=document.createElement('div'); sec.className='rp-sec'+(open?' open':'')+(empty?' empty':''); sec.dataset.k=key;
    sec.innerHTML=`<button type="button" class="rp-head" aria-expanded="${open}" onclick="orgReportToggle(this)"><span>${t.innerHTML}</span><i>▾</i></button><div class="rp-body"></div>`;
    t.parentNode.insertBefore(sec,t); sec.querySelector('.rp-body').appendChild(row); t.remove();
  });
}
function orgReportToggle(btn){
  const sec=btn.closest('.rp-sec'), open=!sec.classList.contains('open'); sec.classList.toggle('open',open); btn.setAttribute('aria-expanded',String(open));
  const st=Object.assign({},orgGet().rpOpen||{}); st[sec.dataset.k]=open; orgSet({rpOpen:st});
}
(function wrapInsights(){ if(typeof renderInsights!=='function') return; const orig=renderInsights; renderInsights=function(){ orig.apply(this,arguments); try{ orgReportsGroup(); }catch(e){} }; })();
try{ orgReportsGroup(); }catch(e){}
