/* ============ V72 — নোট, প্রশ্ন ও প্রশ্নপত্র জেনারেটর ============ */
/* প্রবাহ: শ্রেণি/বিষয়/অধ্যায় বাছো → (AI দিয়ে বা হাতে) খসড়া → প্রতিটা প্রশ্ন সম্পাদনা/বাদ/আবার তৈরি/অনুমোদন → যাচাই (নম্বর, MCQ) → প্রিন্ট/ডাউনলোড (প্রশ্নপত্র আর উত্তরমালা আলাদা)। */
/* নিয়ম: AI-কে ছাত্রের নাম/ফোন কখনো পাঠানো হয় না; অনিশ্চিত হলে AI "unsure" চিহ্ন দেয়; শিক্ষক অনুমোদন ছাড়া প্রিন্ট/ডাউনলোড বন্ধ। */

const QP_KIND_LABEL = {mcq:'বহুনির্বাচনি (MCQ)', short:'সংক্ষিপ্ত প্রশ্ন', creative:'সৃজনশীল', note:'সহজ নোট'};
const QP_BATCH = {mcq:3, short:3, creative:1, note:1};          // এক অনুরোধে কতগুলো — সার্ভারের ছোট সীমার মধ্যে থাকতে
const QP_LABELS = ['ক','খ','গ','ঘ'];
const QP_PART_KIND = ['জ্ঞানমূলক','অনুধাবনমূলক','প্রয়োগমূলক','উচ্চতর দক্ষতা'];
const QP_PART_MARKS = [1,2,3,4];
const QP_BOARDS = {nctb:'জাতীয় কারিকুলাম (NCTB)', madrasa:'মাদ্রাসা (দাখিল/আলিম)', english:'ইংলিশ মিডিয়াম', other:'অন্যান্য'};
const QP_LANGS = {bn:'বাংলা', en:'English', both:'বাংলা + English'};
const QP_LEVELS = {weak:'দুর্বল', mid:'মাঝারি', good:'ভালো'};
const QP_DIFFS = {easy:'সহজ', mid:'মাঝারি', hard:'কঠিন'};
const QP_TYPES = {note:'শুধু সহজ নোট', mcq:'শুধু MCQ', short:'শুধু সংক্ষিপ্ত প্রশ্ন', creative:'শুধু সৃজনশীল', model:'মডেল টেস্ট (MCQ + সংক্ষিপ্ত + সৃজনশীল)'};

/* ---------- pure (unit-tested) ---------- */
function qpUid(){ return 'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function qpN(n){ return typeof toBn==='function' ? toBn(n) : String(n); }
function qpEsc(s){ return typeof escapeHtml==='function' ? escapeHtml(s) : String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function qpNorm(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase(); }
function qpNewItem(kind){
  const b={id:qpUid(), kind, approved:false, unsure:false};
  if(kind==='mcq') return Object.assign(b,{q:'', options:['','','',''], ans:null, explain:'', marks:1});
  if(kind==='short') return Object.assign(b,{q:'', answer:'', marks:2});
  if(kind==='creative') return Object.assign(b,{stem:'', parts:QP_LABELS.map((l,i)=>({q:'', a:'', marks:QP_PART_MARKS[i]})), marks:10});
  return Object.assign(b,{q:'', answer:'', marks:0});          // note: q = শিরোনাম, answer = নোটের মূল লেখা
}
function qpMarksOf(it){
  if(!it || it.kind==='note') return 0;
  if(it.kind==='creative') return (it.parts||[]).reduce((s,p)=>s+(Number(p.marks)||0),0);
  return Number(it.marks)||0;
}
function qpSumMarks(items){ return (items||[]).reduce((s,it)=>s+qpMarksOf(it),0); }
/* যাচাই: [{level:'error'|'warn', id, text}] — error থাকলে প্রিন্ট/ডাউনলোড আটকায় */
function qpValidate(items, full, opts){
  const out=[], add=(level,id,text)=>out.push({level,id,text}); items=items||[];
  const nonNote=items.filter(i=>i.kind!=='note');
  if(!items.length){ add('error',null,'কোনো প্রশ্ন বা নোট নেই।'); return out; }
  const seen={};
  items.forEach((it,idx)=>{
    const n=idx+1, tag=`প্রশ্ন ${qpN(n)}: `;
    if(it.unsure) add('warn',it.id,tag+'AI নিশ্চিত ছিল না — নিজে যাচাই করে সম্পাদনা/অনুমোদন করো।');
    if(it.kind==='mcq'){
      const o=Array.isArray(it.options)?it.options:[];
      if(!qpNorm(it.q)) add('error',it.id,tag+'প্রশ্ন খালি।');
      if(o.length!==4 || o.some(x=>!qpNorm(x))) add('error',it.id,tag+'চারটা অপশনই লিখতে হবে।');
      else if(new Set(o.map(qpNorm)).size!==4) add('error',it.id,tag+'দুটি অপশন একই — একাধিক সঠিক উত্তর হতে পারে।');
      if(!(Number.isInteger(it.ans) && it.ans>=0 && it.ans<o.length)) add('error',it.id,tag+'সঠিক উত্তর বাছা হয়নি (বা অপশনে নেই)।');
      if(!(qpMarksOf(it)>0)) add('error',it.id,tag+'নম্বর ০।');
    } else if(it.kind==='short'){
      if(!qpNorm(it.q)) add('error',it.id,tag+'প্রশ্ন খালি।');
      if(!(qpMarksOf(it)>0)) add('error',it.id,tag+'নম্বর ০।');
      if(!qpNorm(it.answer)) add('warn',it.id,tag+'নমুনা উত্তর নেই।');
    } else if(it.kind==='creative'){
      const p=Array.isArray(it.parts)?it.parts:[];
      if(!qpNorm(it.stem)) add('error',it.id,tag+'উদ্দীপক খালি।');
      if(p.length!==4 || p.some(x=>!qpNorm(x.q))) add('error',it.id,tag+'ক/খ/গ/ঘ চারটা উপপ্রশ্নই লিখতে হবে।');
      if(p.some(x=>!(Number(x.marks)>0))) add('error',it.id,tag+'কোনো উপপ্রশ্নের নম্বর ০।');
      if(p.some(x=>!qpNorm(x.a))) add('warn',it.id,tag+'কিছু উপপ্রশ্নের নমুনা উত্তর নেই।');
    } else if(it.kind==='note'){
      if(!qpNorm(it.answer)) add('error',it.id,'নোটের লেখা খালি।');
    }
    const key=qpNorm(it.kind==='creative'?it.stem:it.q); if(key){ if(seen[key]) add('warn',it.id,tag+'আগের একটা প্রশ্নের সঙ্গে হুবহু মিলে যাচ্ছে।'); seen[key]=1; }
  });
  if(nonNote.length){
    const sum=qpSumMarks(nonNote), f=Number(full)||0;
    if(!(f>0)) add('error',null,'পূর্ণমান দেওয়া হয়নি।');
    else if(sum!==f) add('error',null,`প্রশ্নের নম্বরের যোগফল ${qpN(sum)}, কিন্তু পূর্ণমান ${qpN(f)} — মেলেনি।`);
  }
  return out;
}
function qpReady(items, full){ const v=qpValidate(items, full); const errs=v.filter(x=>x.level==='error').length, un=(items||[]).filter(i=>!i.approved).length; return {ok: !errs && !un && (items||[]).length>0, errors:errs, unapproved:un, issues:v}; }

/* AI-র উত্তর (JSON) → আইটেম। কাটা পড়া উত্তর থেকেও সম্পূর্ণ অংশগুলো বাঁচায়। */
function qpExtractJson(text){
  let t=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
  const a=t.search(/[\[{]/); if(a<0) return null; const open=t[a], close=open==='['?']':'}';
  const tryParse=s=>{ try{ return JSON.parse(s); }catch(e){ return undefined; } };
  const b=t.lastIndexOf(close); if(b>a){ const v=tryParse(t.slice(a,b+1)); if(v!==undefined) return v; }
  if(open==='['){ let end=t.length; for(let k=0;k<30;k++){ end=t.lastIndexOf('}',end-1); if(end<=a) break; const v=tryParse(t.slice(a,end+1)+']'); if(Array.isArray(v)) return v; } }
  return null;
}
function qpAnsIndex(v, n){
  if(typeof v==='number' && Number.isInteger(v) && v>=0 && v<n) return v;
  const s=String(v==null?'':v).trim(); if(/^[0-3]$/.test(s)) return +s;
  const i=['ক','খ','গ','ঘ'].indexOf(s); if(i>=0) return i; const j='abcd'.indexOf(s.toLowerCase()); if(s.length===1 && j>=0) return j;
  return null;
}
function qpParseAi(text, kind){
  const raw=qpExtractJson(text); if(raw==null) return {items:[], dropped:0, bad:true};
  const arr=Array.isArray(raw)?raw:[raw], items=[]; let dropped=0;
  arr.forEach(r=>{
    if(!r || typeof r!=='object'){ dropped++; return; }
    const it=qpNewItem(kind); it.unsure=r.unsure===true;
    if(kind==='mcq'){ it.q=String(r.q||'').trim(); it.options=(Array.isArray(r.options)?r.options:[]).slice(0,4).map(x=>String(x==null?'':x).trim()); while(it.options.length<4) it.options.push('');
      it.ans=qpAnsIndex(r.ans, 4); it.explain=String(r.explain||'').trim(); if(!it.q) { dropped++; return; } }
    else if(kind==='short'){ it.q=String(r.q||'').trim(); it.answer=String(r.answer||'').trim(); const m=Number(r.marks); if(m>0&&m<=10) it.marks=Math.round(m); if(!it.q){ dropped++; return; } }
    else if(kind==='creative'){ it.stem=String(r.stem||'').trim(); const ps=Array.isArray(r.parts)?r.parts:[]; it.parts=QP_LABELS.map((l,i)=>({q:String((ps[i]||{}).q||'').trim(), a:String((ps[i]||{}).a||'').trim(), marks:QP_PART_MARKS[i]})); it.marks=10; if(!it.stem){ dropped++; return; } }
    else { it.q=String(r.title||r.q||'').trim(); const parts=[]; if(r.objective) parts.push('🎯 শেখার উদ্দেশ্য: '+String(r.objective).trim()); if(r.body) parts.push(String(r.body).trim()); it.answer=parts.join('\n\n'); if(!it.answer){ dropped++; return; } }
    items.push(it);
  });
  return {items, dropped, bad:false};
}
/* প্রম্পট তৈরি। নাম/ফোন নেই; সোর্স লেখা থেকে ফোন নম্বর ছেঁটে ফেলা হয়। */
function qpPrompt(meta, kind, n, existing){
  const lang=QP_LANGS[meta.lang]||'বাংলা', cls=meta.cls?`${meta.cls} শ্রেণি`:'', board=QP_BOARDS[meta.board]||'', lvl=QP_LEVELS[meta.level]||'মাঝারি', diff=QP_DIFFS[meta.diff]||'মাঝারি';
  const system=['তুমি বাংলাদেশের একজন অভিজ্ঞ শিক্ষক-সহকারী। শুধু বৈধ JSON ফেরত দাও — কোনো ভূমিকা, ব্যাখ্যা, মার্কডাউন বা ``` চিহ্ন নয়।',
    'নিয়ম: (১) যা নির্ভুলভাবে জানো না তা বানিয়ে লিখো না; কোনো আইটেমের তথ্য নিয়ে সামান্য সন্দেহ থাকলে সেই আইটেমে "unsure":true দাও। (২) ভাষা: '+lang+'। (৩) কোনো মানুষের নাম বা ফোন নম্বর লিখো না। (৪) শিক্ষার্থীর স্তর ও কঠিনতা অনুযায়ী লেখো। (৫) বাংলা সংখ্যা বা ইংরেজি সংখ্যা — প্রশ্নের ভাষা অনুযায়ী ঠিক রাখো।'].join('\n');
  const head=`${board} ${cls} | বিষয়: ${meta.subject||''} | অধ্যায়/টপিক: ${meta.chapter||''} | শিক্ষার্থীর স্তর: ${lvl} | কঠিনতা: ${diff}`.replace(/\s+/g,' ').trim();
  const src=meta.source?`\nশুধু নিচের পাঠ্যাংশের ভিত্তিতে লেখো (বাইরের তথ্য যোগ কোরো না):\n<<<\n${(typeof aiScrubPhones==='function'?aiScrubPhones(meta.source):meta.source).slice(0,6000)}\n>>>`:'';
  const avoid=(existing&&existing.length)?`\nএই প্রশ্নগুলো আগেই আছে, আবার দিও না:\n${existing.slice(0,12).map(s=>'- '+String(s).slice(0,70)).join('\n')}`:'';
  let spec;
  if(kind==='mcq') spec=`${n}টা বহুনির্বাচনি প্রশ্ন। ফরম্যাট: [{"q":"প্রশ্ন","options":["অপশন১","অপশন২","অপশন৩","অপশন৪"],"ans":0,"explain":"১ বাক্যের ব্যাখ্যা","unsure":false}] — ans হলো ০ থেকে ৩ (সঠিক অপশনের সূচক); ঠিক একটাই সঠিক উত্তর হবে, চারটা অপশন ভিন্ন হবে।`;
  else if(kind==='short') spec=`${n}টা সংক্ষিপ্ত প্রশ্ন (প্রতিটা ২ নম্বরের)। ফরম্যাট: [{"q":"প্রশ্ন","answer":"সংক্ষিপ্ত নমুনা উত্তর","marks":2,"unsure":false}]`;
  else if(kind==='creative') spec=`${n}টা সৃজনশীল প্রশ্ন। ফরম্যাট: [{"stem":"উদ্দীপক (৩-৫ বাক্য)","parts":[{"q":"ক) জ্ঞানমূলক (১)","a":"নমুনা উত্তর"},{"q":"খ) অনুধাবনমূলক (২)","a":""},{"q":"গ) প্রয়োগমূলক (৩)","a":""},{"q":"ঘ) উচ্চতর দক্ষতা (৪)","a":""}],"unsure":false}] — parts-এ ঠিক ৪টা।`;
  else spec=`এই অধ্যায়ের একটা সহজ নোট। ফরম্যাট: {"title":"শিরোনাম","objective":"শেখার উদ্দেশ্য (১-২ বাক্য)","body":"সংজ্ঞা, সহজ ব্যাখ্যা, উদাহরণ, সূত্র (থাকলে), সাধারণ ভুল — ছোট ছোট অনুচ্ছেদে, প্রতিটা অংশের আগে শিরোনাম","unsure":false}`;
  return {system, user:`${head}${src}${avoid}\n\nতৈরি করো: ${spec}`};
}

/* ---------- প্রিন্ট/ডাউনলোড HTML ---------- */
function qpPartLine(p,i){ return `${QP_LABELS[i]}) ${p.q.replace(/^[কখগঘ]\)\s*/,'')}`; }
/* ছাত্রের প্রশ্নপত্র — এতে কখনো উত্তর/ব্যাখ্যা থাকে না */
function qpPaperBody(set){
  const m=set.meta||{}, items=set.items||[], E=qpEsc;
  if(m.type==='note'){
    return `<h1>${E(set.title||'নোট')}</h1><div class="qp-sub">${E([m.cls?m.cls+' শ্রেণি':'', m.subject, m.chapter].filter(Boolean).join(' · '))}</div>`+items.filter(i=>i.kind==='note').map(i=>`<h2>${E(i.q)}</h2><div class="qp-note">${E(i.answer).replace(/\n/g,'<br>')}</div>`).join('');
  }
  const parts=[], mcq=items.filter(i=>i.kind==='mcq'), sh=items.filter(i=>i.kind==='short'), cr=items.filter(i=>i.kind==='creative'); let n=0;
  const head=`<div class="qp-head"><h1>${E(set.title||'প্রশ্নপত্র')}</h1><div class="qp-sub">${E([m.cls?m.cls+' শ্রেণি':'', m.subject, m.chapter].filter(Boolean).join(' · '))}</div><div class="qp-meta"><span>সময়: ${qpN(m.minutes||0)} মিনিট</span><span>পূর্ণমান: ${qpN(set.full||qpSumMarks(items))}</span></div></div><div class="qp-who">নাম: ____________________ &nbsp; রোল: ______ &nbsp; তারিখ: __________</div>`;
  parts.push(head);
  if(mcq.length){ parts.push(`<h2>ক-বিভাগ: বহুনির্বাচনি <small>(প্রতিটি ${qpN(qpMarksOf(mcq[0]))} নম্বর)</small></h2>`);
    mcq.forEach(it=>{ n++; parts.push(`<div class="qp-q"><div class="qp-row"><b>${qpN(n)}.</b> <span>${E(it.q)}</span></div><div class="qp-opts">${it.options.map((o,i)=>`<span>${QP_LABELS[i]}. ${E(o)}</span>`).join('')}</div></div>`); }); }
  if(sh.length){ parts.push(`<h2>খ-বিভাগ: সংক্ষিপ্ত প্রশ্ন</h2>`);
    sh.forEach(it=>{ n++; parts.push(`<div class="qp-q"><div class="qp-row"><b>${qpN(n)}.</b> <span>${E(it.q)}</span><i class="qp-mk">${qpN(qpMarksOf(it))}</i></div></div>`); }); }
  if(cr.length){ parts.push(`<h2>গ-বিভাগ: সৃজনশীল প্রশ্ন</h2>`);
    cr.forEach(it=>{ n++; parts.push(`<div class="qp-q"><div class="qp-row"><b>${qpN(n)}.</b> <span class="qp-stem">${E(it.stem).replace(/\n/g,'<br>')}</span></div>${it.parts.map((p,i)=>`<div class="qp-row qp-part"><span>${E(qpPartLine(p,i))}</span><i class="qp-mk">${qpN(p.marks)}</i></div>`).join('')}</div>`); }); }
  return parts.join('');
}
/* শিক্ষকের উত্তরমালা — আলাদা পাতা/ফাইল */
function qpKeyBody(set){
  const items=(set.items||[]).filter(i=>i.kind!=='note'), E=qpEsc, m=set.meta||{}; let n=0;
  const rows=[];
  const order=['mcq','short','creative'];
  order.forEach(k=>items.filter(i=>i.kind===k).forEach(it=>{ n++;
    if(k==='mcq') rows.push(`<div class="qp-q"><div class="qp-row"><b>${qpN(n)}.</b> <span>উত্তর: <b>${QP_LABELS[it.ans]||'?'}</b> — ${E(it.options[it.ans]||'')}</span></div>${it.explain?`<div class="qp-ex">ব্যাখ্যা: ${E(it.explain)}</div>`:''}</div>`);
    else if(k==='short') rows.push(`<div class="qp-q"><div class="qp-row"><b>${qpN(n)}.</b> <span>${E(it.answer||'—')}</span><i class="qp-mk">${qpN(qpMarksOf(it))}</i></div></div>`);
    else rows.push(`<div class="qp-q"><div class="qp-row"><b>${qpN(n)}.</b> <span>সৃজনশীল — নমুনা উত্তর ও নম্বরবণ্টন</span></div>${it.parts.map((p,i)=>`<div class="qp-row qp-part"><span><b>${QP_LABELS[i]}</b> (${QP_PART_KIND[i]}) ${E(p.a||'—')}</span><i class="qp-mk">${qpN(p.marks)}</i></div>`).join('')}</div>`);
  }));
  return `<div class="qp-head"><h1>উত্তরমালা — ${E(set.title||'')}</h1><div class="qp-sub">${E([m.cls?m.cls+' শ্রেণি':'', m.subject, m.chapter].filter(Boolean).join(' · '))} · <b>শুধু শিক্ষকের জন্য</b></div></div>`+rows.join('');
}
const QP_CSS = `@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:'Hind Siliguri','Noto Sans Bengali','Kalpurush','SolaimanLipi',sans-serif;color:#111;line-height:1.55;font-size:13.5px;margin:0}
h1{font-size:20px;margin:0;text-align:center}h2{font-size:15px;margin:16px 0 6px;border-bottom:1.5px solid #111;padding-bottom:3px}h2 small{font-weight:400;font-size:12px}
.qp-sub{text-align:center;color:#444;font-size:12.5px;margin-top:2px}.qp-meta{display:flex;justify-content:space-between;margin-top:8px;font-weight:600}.qp-who{margin:10px 0 4px;font-size:12.5px}
.qp-q{margin:7px 0;page-break-inside:avoid;break-inside:avoid}.qp-row{display:flex;gap:6px;align-items:flex-start}.qp-row>span{flex:1}.qp-mk{font-style:normal;font-weight:700;min-width:22px;text-align:right}
.qp-opts{display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;margin:3px 0 0 20px}.qp-part{margin-left:20px;margin-top:3px}.qp-stem{font-style:italic}.qp-ex{margin:2px 0 0 20px;color:#333;font-size:12.5px}.qp-note{white-space:normal;margin:4px 0 10px}`;
function qpFullDoc(inner, title){ return `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${qpEsc(title||'প্রশ্নপত্র')}</title><style>${QP_CSS}body{padding:14px;max-width:820px;margin:0 auto}@media print{body{padding:0;max-width:none}}</style></head><body>${inner}</body></html>`; }

/* ---------- screen ---------- */
let qp={meta:null, items:[], title:'', full:0, editing:null, busy:false, msg:'', setId:null, gen:null, planDone:0};
function qpFreshMeta(){ return {cls:'', board:'nctb', subject:'', chapter:'', lang:'bn', level:'mid', diff:'mid', type:'mcq', mcqN:5, shortN:0, creN:0, minutes:30, source:''}; }
function qpGetBank(){ const b=lsGet('tr_qbank',[]); return Array.isArray(b)?b:[]; }
function qpOpen(){ if(!qp.meta) qp.meta=qpFreshMeta(); showKhataModal('📝 নোট ও প্রশ্নপত্র','<div id="qpBox"></div>'); qpRender(); }
function qpSet(k,v){ qp.meta[k]=v; if(k==='type'){ const t=v; qp.meta.mcqN=(t==='mcq'||t==='model')?(qp.meta.mcqN||5):0; qp.meta.shortN=(t==='short'||t==='model')?(qp.meta.shortN||3):0; qp.meta.creN=(t==='creative'||t==='model')?(qp.meta.creN||1):0; qpRender(); } }
function qpSetNum(k,v){ qp.meta[k]=Math.max(0,Math.min(30,parseInt(v,10)||0)); }
function qpSetTitle(v){ qp.title=v; } function qpSetFull(v){ qp.full=Math.max(0,Number(v)||0); qpRender(); }
function qpOpts(map,sel){ return Object.keys(map).map(k=>`<option value="${k}"${k===sel?' selected':''}>${qpEsc(map[k])}</option>`).join(''); }
function qpSubjects(){ const s=new Set(); try{ const pd=getProgressData(); Object.keys(pd).forEach(n=>Object.keys(pd[n]||{}).forEach(x=>s.add(x))); }catch(e){} return [...s]; }
function qpSetupHtml(){
  const m=qp.meta, f=(l,h)=>`<label class="sm-field-label">${l}</label>${h}`, inp=(k,ph,list)=>`<input class="sm-field-input" value="${qpEsc(m[k]||'')}" placeholder="${ph}" ${list?`list="${list}"`:''} onchange="qpSet('${k}',this.value)">`;
  return `<details class="qp-setup" ${qp.items.length?'':'open'}><summary class="settings-btn" style="text-align:left;">⚙️ সেটআপ (শ্রেণি · বিষয় · অধ্যায় · ধরন)</summary>
   <datalist id="qpSubj">${qpSubjects().map(s=>`<option value="${qpEsc(s)}">`).join('')}</datalist>
   <div class="qp-grid">${f('শ্রেণি',inp('cls','যেমন ৮'))}${f('বোর্ড/কারিকুলাম',`<select class="sm-field-input" onchange="qpSet('board',this.value)">${qpOpts(QP_BOARDS,m.board)}</select>`)}
   ${f('বিষয়',inp('subject','যেমন গণিত','qpSubj'))}${f('অধ্যায়/টপিক',inp('chapter','যেমন অনুপাত ও শতকরা'))}
   ${f('ভাষা',`<select class="sm-field-input" onchange="qpSet('lang',this.value)">${qpOpts(QP_LANGS,m.lang)}</select>`)}${f('শিক্ষার্থীর স্তর',`<select class="sm-field-input" onchange="qpSet('level',this.value)">${qpOpts(QP_LEVELS,m.level)}</select>`)}
   ${f('কঠিনতা',`<select class="sm-field-input" onchange="qpSet('diff',this.value)">${qpOpts(QP_DIFFS,m.diff)}</select>`)}${f('আউটপুট',`<select class="sm-field-input" onchange="qpSet('type',this.value)">${qpOpts(QP_TYPES,m.type)}</select>`)}
   ${m.mcqN||m.type==='mcq'||m.type==='model'?f('MCQ সংখ্যা',`<input type="number" class="sm-field-input" min="0" max="30" value="${m.mcqN}" onchange="qpSetNum('mcqN',this.value)">`):''}
   ${m.type==='short'||m.type==='model'?f('সংক্ষিপ্ত প্রশ্ন সংখ্যা',`<input type="number" class="sm-field-input" min="0" max="30" value="${m.shortN}" onchange="qpSetNum('shortN',this.value)">`):''}
   ${m.type==='creative'||m.type==='model'?f('সৃজনশীল সংখ্যা',`<input type="number" class="sm-field-input" min="0" max="10" value="${m.creN}" onchange="qpSetNum('creN',this.value)">`):''}
   ${m.type!=='note'?f('সময় (মিনিট)',`<input type="number" class="sm-field-input" min="0" value="${m.minutes}" onchange="qpSetNum('minutes',this.value)">`):''}</div>
   ${f('বইয়ের পাঠ্যাংশ / নিজের বিষয়বস্তু (ঐচ্ছিক — দিলে AI শুধু এখান থেকে লিখবে)',`<textarea class="sm-field-input" rows="3" placeholder="এখানে পেস্ট করো…" onchange="qpSet('source',this.value)">${qpEsc(m.source||'')}</textarea>`)}
   <div class="qp-actions"><button type="button" class="modal-btn primary" onclick="qpGenerate()" ${qp.busy?'disabled':''}>🤖 AI দিয়ে খসড়া বানাও</button></div>
   <div class="qp-note-small">AI-কে কোনো ছাত্রের নাম/ফোন পাঠানো হয় না। নেট বা AI পাসকোড না থাকলে নিচ থেকে হাতে প্রশ্ন যোগ করো — বাকি সব (যাচাই, প্রিন্ট) একই কাজ করবে।</div></details>`;
}
function qpItemHtml(it, idx){
  const E=qpEsc, iss=qp.issues.filter(x=>x.id===it.id), bad=iss.some(x=>x.level==='error');
  if(qp.editing===it.id) return `<div class="qp-card editing">${qpEditHtml(it)}</div>`;
  let body='';
  if(it.kind==='mcq') body=`<div class="qp-qt">${E(it.q)}</div><div class="qp-op">${it.options.map((o,i)=>`<div class="${it.ans===i?'ok':''}">${QP_LABELS[i]}. ${E(o)}${it.ans===i?' ✓':''}</div>`).join('')}</div>${it.explain?`<div class="qp-ex">💡 ${E(it.explain)}</div>`:''}`;
  else if(it.kind==='short') body=`<div class="qp-qt">${E(it.q)}</div><div class="qp-ex">নমুনা: ${E(it.answer||'—')}</div>`;
  else if(it.kind==='creative') body=`<div class="qp-qt qp-stem">${E(it.stem)}</div>${it.parts.map((p,i)=>`<div class="qp-ex"><b>${QP_LABELS[i]}</b> ${E(p.q)} <i>(${qpN(p.marks)})</i></div>`).join('')}`;
  else body=`<div class="qp-qt"><b>${E(it.q)}</b></div><div class="qp-ex" style="white-space:pre-wrap;">${E(it.answer)}</div>`;
  return `<div class="qp-card${bad?' bad':''}${it.approved?' appr':''}"><div class="qp-ch"><b>${qpN(idx+1)}. ${QP_KIND_LABEL[it.kind]}</b>${it.kind==='note'?'':`<span>${qpN(qpMarksOf(it))} নম্বর</span>`}${it.unsure?'<span class="qp-uns">⚠ অনিশ্চিত</span>':''}${it.approved?'<span class="qp-ap">✔ অনুমোদিত</span>':''}</div>${body}
   ${iss.map(x=>`<div class="qp-iss ${x.level}">${x.level==='error'?'⛔':'⚠️'} ${E(x.text)}</div>`).join('')}
   <div class="qp-btns"><button type="button" onclick="qpEdit('${it.id}')">✎ সম্পাদনা</button><button type="button" onclick="qpApprove('${it.id}')">${it.approved?'↩ অনুমোদন তুলে নাও':'✔ অনুমোদন'}</button><button type="button" onclick="qpRegen('${it.id}')">↻ আবার</button><button type="button" onclick="qpDel('${it.id}')">🗑</button></div></div>`;
}
function qpEditHtml(it){
  const E=qpEsc, ta=(id,v,r)=>`<textarea class="sm-field-input" id="${id}" rows="${r||2}">${E(v||'')}</textarea>`, num=(id,v)=>`<input type="number" min="0" class="sm-field-input" id="${id}" value="${v}" style="width:80px;">`;
  let h='';
  if(it.kind==='mcq') h=`<label class="sm-field-label">প্রশ্ন</label>${ta('qe_q',it.q)}${it.options.map((o,i)=>`<label class="sm-field-label">অপশন ${QP_LABELS[i]}</label><input class="sm-field-input" id="qe_o${i}" value="${E(o)}">`).join('')}
    <label class="sm-field-label">সঠিক উত্তর</label><select class="sm-field-input" id="qe_ans"><option value="">— বাছো —</option>${QP_LABELS.map((l,i)=>`<option value="${i}"${it.ans===i?' selected':''}>${l}</option>`).join('')}</select><label class="sm-field-label">ব্যাখ্যা</label>${ta('qe_exp',it.explain)}<label class="sm-field-label">নম্বর</label>${num('qe_marks',it.marks)}`;
  else if(it.kind==='short') h=`<label class="sm-field-label">প্রশ্ন</label>${ta('qe_q',it.q)}<label class="sm-field-label">নমুনা উত্তর</label>${ta('qe_ans_txt',it.answer,3)}<label class="sm-field-label">নম্বর</label>${num('qe_marks',it.marks)}`;
  else if(it.kind==='creative') h=`<label class="sm-field-label">উদ্দীপক</label>${ta('qe_stem',it.stem,4)}${it.parts.map((p,i)=>`<label class="sm-field-label">${QP_LABELS[i]}) ${QP_PART_KIND[i]}</label>${ta('qe_pq'+i,p.q)}${ta('qe_pa'+i,p.a)}<div>নম্বর ${num('qe_pm'+i,p.marks)}</div>`).join('')}`;
  else h=`<label class="sm-field-label">শিরোনাম</label><input class="sm-field-input" id="qe_q" value="${E(it.q)}"><label class="sm-field-label">নোট</label>${ta('qe_ans_txt',it.answer,10)}`;
  return h+`<div class="qp-btns"><button type="button" onclick="qpEditSave('${it.id}')">💾 ঠিক আছে</button><button type="button" onclick="qpEditCancel()">বাতিল</button></div>`;
}
const qpV=id=>{ const e=document.getElementById(id); return e?e.value:''; };
function qpEdit(id){ qp.editing=id; qpRender(); }
function qpEditCancel(){ qp.editing=null; qpRender(); }
function qpEditSave(id){
  const it=qp.items.find(x=>x.id===id); if(!it) return;
  if(it.kind==='mcq'){ it.q=qpV('qe_q').trim(); it.options=[0,1,2,3].map(i=>qpV('qe_o'+i).trim()); const a=qpV('qe_ans'); it.ans=a===''?null:+a; it.explain=qpV('qe_exp').trim(); it.marks=Number(qpV('qe_marks'))||0; }
  else if(it.kind==='short'){ it.q=qpV('qe_q').trim(); it.answer=qpV('qe_ans_txt').trim(); it.marks=Number(qpV('qe_marks'))||0; }
  else if(it.kind==='creative'){ it.stem=qpV('qe_stem').trim(); it.parts=[0,1,2,3].map(i=>({q:qpV('qe_pq'+i).trim(), a:qpV('qe_pa'+i).trim(), marks:Number(qpV('qe_pm'+i))||0})); it.marks=qpMarksOf(it); }
  else { it.q=qpV('qe_q').trim(); it.answer=qpV('qe_ans_txt').trim(); }
  it.approved=false; it.unsure=false; qp.editing=null; qpRender();      // সম্পাদনার পর আবার অনুমোদন লাগে
}
function qpAdd(kind){ qp.items.push(qpNewItem(kind)); qp.editing=qp.items[qp.items.length-1].id; qpRender(); }
function qpDel(id){ const i=qp.items.findIndex(x=>x.id===id); if(i<0) return; const [rm]=qp.items.splice(i,1); qpRender(); showUndoToast('প্রশ্ন বাদ দেওয়া হয়েছে', ()=>{ qp.items.splice(Math.min(i,qp.items.length),0,rm); qpRender(); }); }
function qpApprove(id){ const it=qp.items.find(x=>x.id===id); if(!it) return; it.approved=!it.approved; qpRender(); }
function qpApproveAll(){ qp.items.forEach(i=>{ i.approved=true; }); qpRender(); showSuccessToast('সব অনুমোদিত — এবার প্রিন্ট/ডাউনলোড করা যাবে (যাচাইয়ে ভুল না থাকলে)।'); }
function qpFixFull(){ qp.full=qpSumMarks(qp.items); qpRender(); }
function qpTotalsHtml(){
  const nn=qp.items.filter(i=>i.kind!=='note'), sum=qpSumMarks(nn), ok=!nn.length||sum===(Number(qp.full)||0);
  return `<div class="qp-tot ${ok?'ok':'bad'}"><span>নম্বরের যোগফল: <b>${qpN(sum)}</b></span><span>পূর্ণমান: <input type="number" min="0" class="sm-field-input" style="width:80px;display:inline-block;padding:4px 8px;" value="${qp.full||''}" onchange="qpSetFull(this.value)"></span>${ok?'':`<button type="button" class="pct-chip" onclick="qpFixFull()">পূর্ণমান = ${qpN(sum)} করো</button>`}</div>`;
}
function qpRender(){
  const box=document.getElementById('qpBox'); if(!box) return;
  qp.issues=qpValidate(qp.items, qp.full); const rd=qpReady(qp.items, qp.full), isNote=qp.meta.type==='note';
  const lib=qpGetBank();
  box.innerHTML=`${qpSetupHtml()}
  <div class="qp-msg" id="qpMsg">${qp.busy?'<span class="spin"></span> ':''}${qpEsc(qp.msg||'')}</div>
  <div class="qp-add"><span>হাতে যোগ:</span>${['mcq','short','creative','note'].map(k=>`<button type="button" class="pct-chip" onclick="qpAdd('${k}')">+ ${QP_KIND_LABEL[k]}</button>`).join('')}</div>
  ${qp.items.length?`<input class="sm-field-input" style="margin:8px 0;" placeholder="শিরোনাম (যেমন: ৮ম শ্রেণি গণিত — মাসিক পরীক্ষা)" value="${qpEsc(qp.title)}" onchange="qpSetTitle(this.value)">${isNote?'':qpTotalsHtml()}
  <div class="qp-list">${qp.items.map((it,i)=>qpItemHtml(it,i)).join('')}</div>
  <div class="qp-gate ${rd.ok?'ok':'bad'}">${rd.ok?'✅ সব যাচাই পাস ও অনুমোদিত — প্রিন্ট করা যাবে।':`⛔ প্রিন্টের আগে: ${rd.errors?qpN(rd.errors)+'টা ভুল ঠিক করো':''}${rd.errors&&rd.unapproved?' · ':''}${rd.unapproved?qpN(rd.unapproved)+'টা আইটেম অনুমোদন করো':''}`}</div>
  <div class="qp-actions"><button type="button" class="modal-btn secondary" onclick="qpApproveAll()">✔ সব অনুমোদন</button><button type="button" class="modal-btn secondary" onclick="qpSave()">💾 সংরক্ষণ</button></div>
  <div class="qp-actions"><button type="button" class="modal-btn primary" onclick="qpPrint('paper')">🖨️ ${isNote?'নোট':'প্রশ্নপত্র'} প্রিন্ট</button>${isNote?'':'<button type="button" class="modal-btn primary" onclick="qpPrint(\'key\')">🔑 উত্তরমালা প্রিন্ট</button>'}</div>
  <div class="qp-actions"><button type="button" class="modal-btn secondary" onclick="qpDownload('paper')">⬇️ HTML ফাইল</button>${isNote?'':'<button type="button" class="modal-btn secondary" onclick="qpDownload(\'key\')">⬇️ উত্তরমালা HTML</button>'}</div>`:`<div class="ins-empty">এখনো কোনো প্রশ্ন নেই — উপরে সেটআপ করে AI-কে বলো, অথবা হাতে যোগ করো।</div>`}
  ${lib.length?`<div class="settings-section-title" style="margin-top:14px;">📚 সংরক্ষিত (${qpN(lib.length)})</div>${lib.slice().reverse().map(s=>`<div class="makeup-row"><span>${qpEsc(s.title||'নামহীন')} <small style="color:var(--muted)">· ${qpEsc((s.meta||{}).subject||'')} ${s.approved?'✔':''}</small></span><span><button class="makeup-done" onclick="qpLoad('${s.id}')">খোলো</button> <button class="makeup-done" onclick="qpDup('${s.id}')">কপি</button> <button class="makeup-done" onclick="qpRemoveSet('${s.id}')">🗑</button></span></div>`).join('')}`:''}`;
}
function qpMsg(t,busy){ qp.msg=t; qp.busy=!!busy; const el=document.getElementById('qpMsg'); if(el) el.innerHTML=(busy?'<span class="spin"></span> ':'')+qpEsc(t); }
async function qpAiBatch(kind, n){
  const existing=qp.items.filter(i=>i.kind===kind).map(i=>kind==='creative'?i.stem:i.q), p=qpPrompt(qp.meta, kind, n, existing);
  const r=await aiCall({system:p.system, messages:[{role:'user',content:p.user}], max_tokens:900});
  if(!r.ok) return {error:r.error};
  const out=aiBlocks(r.data.content).text, parsed=qpParseAi(out, kind);
  if(parsed.bad || !parsed.items.length) return {error:'bad_output'};
  qp.gen={model:'claude-haiku-5-5', at:Date.now()};
  return {items:parsed.items, dropped:parsed.dropped};
}
async function qpGenerate(){
  const m=qp.meta; if(qp.busy) return;
  if(!m.subject.trim() || !m.chapter.trim()){ showWarningToast('বিষয় আর অধ্যায়/টপিক লেখো।'); return; }
  if(!lsGet('tr_aiPass','')){ showWarningToast('AI-র পাসকোড নেই — সেটিংসে দাও, অথবা হাতে প্রশ্ন যোগ করো।'); return; }
  const plan=[]; if(m.type==='note') plan.push(['note',1]); else { if(m.mcqN>0) plan.push(['mcq',m.mcqN]); if(m.shortN>0) plan.push(['short',m.shortN]); if(m.creN>0) plan.push(['creative',m.creN]); }
  if(!plan.length){ showWarningToast('কোন ধরনের কতগুলো প্রশ্ন লাগবে তা দাও।'); return; }
  let added=0, fail=null, want=plan.reduce((s,x)=>s+x[1],0);
  for(const [kind,n] of plan){
    let have=qp.items.filter(i=>i.kind===kind).length, goal=have+n, guard=0;
    while(qp.items.filter(i=>i.kind===kind).length<goal && guard++<12){
      const need=Math.min(QP_BATCH[kind], goal-qp.items.filter(i=>i.kind===kind).length);
      qpMsg(`⏳ ${QP_KIND_LABEL[kind]} তৈরি হচ্ছে… (${qpN(added)}/${qpN(want)})`, true);
      const r=await qpAiBatch(kind, need);
      if(r.error){ fail=r.error; break; }
      r.items.slice(0,need).forEach(it=>{ qp.items.push(it); added++; });
    }
    if(fail) break;
  }
  if(qp.items.some(i=>i.kind!=='note') && !qp.full) qp.full=qpSumMarks(qp.items);
  qpMsg(fail?`⚠️ ${qpN(added)}টা তৈরি হয়েছে। থেমেছে: ${fail==='bad_output'?'AI-র উত্তর পড়া গেল না — আবার চেষ্টা করো':aiErrText(fail)}`:`✅ ${qpN(added)}টা খসড়া তৈরি — এবার প্রতিটা পড়ে সম্পাদনা/অনুমোদন করো।`, false);
  qpRender(); qpMsg(qp.msg,false);
}
async function qpRegen(id){
  const i=qp.items.findIndex(x=>x.id===id); if(i<0) return; const old=qp.items[i];
  if(!lsGet('tr_aiPass','')){ showWarningToast('AI-র পাসকোড নেই — হাতে সম্পাদনা করো।'); return; }
  qpMsg('⏳ আবার তৈরি হচ্ছে…', true);
  const r=await qpAiBatch(old.kind, 1);
  if(r.error){ qpMsg('⚠️ '+(r.error==='bad_output'?'AI-র উত্তর পড়া গেল না':aiErrText(r.error)), false); return; }
  const fresh=r.items[0]; if(old.kind==='mcq'||old.kind==='short') fresh.marks=old.marks; fresh.id=old.id; qp.items[i]=fresh; qpMsg('✅ নতুন প্রশ্ন বসেছে — আবার পড়ে অনুমোদন করো।', false); qpRender();
}
function qpCurrentSet(){ return {id:qp.setId||qpUid(), title:qp.title||'নামহীন', meta:JSON.parse(JSON.stringify(qp.meta)), items:JSON.parse(JSON.stringify(qp.items)), full:qp.full||qpSumMarks(qp.items), approved:qp.items.length>0&&qp.items.every(i=>i.approved), gen:qp.gen||null, updatedAt:Date.now()}; }
function qpSave(){
  if(!qp.items.length){ showWarningToast('সংরক্ষণ করার মতো কিছু নেই।'); return; }
  const s=qpCurrentSet(), bank=qpGetBank(), i=bank.findIndex(x=>x.id===s.id); if(i>=0) bank[i]=Object.assign(bank[i],s); else { s.createdAt=Date.now(); bank.push(s); }
  qp.setId=s.id; if(!lsSet('tr_qbank', bank)) { showWarningToast('সংরক্ষণ হয়নি — স্টোরেজ ভরা থাকতে পারে।'); return; } showSuccessToast('সংরক্ষিত হয়েছে'); qpRender();
}
function qpLoad(id){ const s=qpGetBank().find(x=>x.id===id); if(!s) return; qp.meta=Object.assign(qpFreshMeta(), s.meta); qp.items=JSON.parse(JSON.stringify(s.items)); qp.title=s.title; qp.full=s.full; qp.setId=s.id; qp.editing=null; qp.gen=s.gen||null; qpRender(); }
function qpDup(id){ qpLoad(id); qp.setId=null; qp.title=(qp.title||'')+' (কপি)'; qp.items.forEach(i=>{ i.id=qpUid(); }); qpRender(); showSuccessToast('কপি হয়েছে — পরিবর্তন করে নতুন করে সংরক্ষণ করো।'); }
function qpRemoveSet(id){ const bank=qpGetBank(), rm=bank.find(x=>x.id===id); if(!rm) return; lsSet('tr_qbank', bank.filter(x=>x.id!==id)); if(qp.setId===id) qp.setId=null; qpRender(); showUndoToast('সংরক্ষিত সেট মুছেছে', ()=>{ const b=qpGetBank(); b.push(rm); lsSet('tr_qbank', b); qpRender(); }); }
function qpGate(){ const rd=qpReady(qp.items, qp.full); if(!rd.ok){ showWarningToast(rd.errors?`${qpN(rd.errors)}টা ভুল আগে ঠিক করো`:`${qpN(rd.unapproved)}টা আইটেম অনুমোদন করা বাকি`); return false; } return true; }
function qpInner(which){ const s=qpCurrentSet(); return which==='key' ? qpKeyBody(s) : qpPaperBody(s); }
function qpPrint(which){
  if(!qpGate()) return; const host=document.createElement('div'); host.id='qpPrintHost'; host.innerHTML=`<style>${QP_CSS}</style>`+qpInner(which); document.body.appendChild(host); document.body.classList.add('qp-printing');
  const done=()=>{ document.body.classList.remove('qp-printing'); host.remove(); window.removeEventListener('afterprint',done); }; window.addEventListener('afterprint',done);
  setTimeout(()=>{ try{ window.print(); }catch(e){ done(); showWarningToast('প্রিন্ট খোলা গেল না — "HTML ফাইল" নামিয়ে ব্রাউজার থেকে প্রিন্ট করো।'); } },60);
}
function qpDownload(which){
  if(!qpGate()) return; const s=qpCurrentSet(), html=qpFullDoc(qpInner(which), (s.title||'প্রশ্নপত্র')+(which==='key'?' — উত্তরমালা':''));
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'})); a.download=(which==='key'?'uttormala-':'proshnopotro-')+dateKeyStr(todayDateOnly())+'.html'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
}
