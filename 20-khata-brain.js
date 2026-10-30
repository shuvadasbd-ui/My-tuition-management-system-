/* ============ 🧠 খাতা-বুদ্ধি: বিশ্বাস-স্কোর · তাগাদা-পরিকল্পনা · ক্যাশ-রানওয়ে ============ */
/* ১) প্রতিটা দেনাদারের শোধের ইতিহাস (কত দিনে ফেরত দেয়, কত % ফেরত দিয়েছে, কতদিন ধরে বকেয়া) থেকে বিশ্বাস-স্কোর */
/* ২) কাকে আজ তাগাদা দিলে সবচেয়ে বেশি টাকা আসার সম্ভাবনা — স্কোর অনুযায়ী সুর বদলানো মেসেজসহ */
/* ৩) আগামী ৩০/৬০/৯০ দিনে ক্যাশ কোথায় যেতে পারে — তোমার আসল খরচ-আয়, রিপিট বিল আর আদায়ের সম্ভাবনা নিয়ে ১,২০০টা সিমুলেশন */

/* ---- pure (unit-tested) ---- */
function kzDays(a,b){ return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000); }
/* txs: এই ব্যক্তির লেনদেন। "ধার দিলাম" (gave) বনাম "ফেরত পেলাম" (got_back) — পুরনো ধার আগে শোধ হয় ধরে (FIFO) */
function kzRepayStats(txs, today){
  const g=[], p=[]; (txs||[]).slice().sort((a,b)=>a.date<b.date?-1:(a.date>b.date?1:0)).forEach(t=>{ if(t.type==='gave') g.push({d:t.date,left:t.amount,orig:t.amount}); else if(t.type==='got_back') p.push({d:t.date,amt:t.amount}); });
  let gi=0, delaySum=0, delayAmt=0, matched=0; const total=g.reduce((s,x)=>s+x.left,0);
  p.forEach(r=>{ let rem=r.amt; while(rem>0&&gi<g.length){ const q=g[gi], use=Math.min(rem,q.left); delaySum+=Math.max(0,kzDays(q.d,r.d))*use; delayAmt+=use; matched+=use; q.left-=use; rem-=use; if(q.left<=0) gi++; } });
  const open=g.find(x=>x.left>0), lastPay=p.length?p[p.length-1].d:null;
  /* "কত % ফেরত দিয়েছে" মাপা হয় শুধু ৩০ দিনের বেশি পুরনো ধারে — সদ্য নেওয়া ধার শোধের সময় পায়নি, তাকে দোষ দেওয়া অন্যায় */
  const mature=g.filter(x=>kzDays(x.d,today)>30), mTot=mature.reduce((t,x)=>t+x.orig,0), mPaid=mature.reduce((t,x)=>t+(x.orig-x.left),0);
  return {n:g.length, total, matched, repaidShare:mTot>0?mPaid/mTot:(total>0?matched/total:null), avgDelay:delayAmt>0?delaySum/delayAmt:null, openAge:open?Math.max(0,kzDays(open.d,today)):0, lastPayDays:lastPay?Math.max(0,kzDays(lastPay,today)):null};
}
/* বিশ্বাস-স্কোর ০–১০০; যথেষ্ট ইতিহাস না থাকলে score:null */
function kzTrust(s, o){
  if(!s||s.n===0) return {score:null};
  if(s.matched<=0 && s.openAge<=30) return {score:null};
  let sc=55; if(s.repaidShare!=null) sc+=(s.repaidShare-0.5)*50;
  if(s.avgDelay!=null) sc+=s.avgDelay<=7?15:(s.avgDelay<=21?8:(s.avgDelay<=45?0:(s.avgDelay<=90?-12:-22)));
  sc-=Math.min(30,Math.max(0,s.openAge-30)*0.25); if(o&&o.due&&o.due<o.today&&o.net>0) sc-=10;
  return {score:Math.max(0,Math.min(100,Math.round(sc)))};
}
function kzBand(score){ return score==null?'new':(score>=70?'good':(score>=40?'mid':'bad')); }
/* ৩০ দিনের মধ্যে কিছু শোধ করার মোটা সম্ভাবনা */
function kzPayProb(t, s){
  if(!t||t.score==null) return 0.45;
  let p=0.1+0.75*t.score/100; if(s.lastPayDays!=null&&s.lastPayDays<=14) p+=0.1; if(s.openAge>120) p-=0.15;
  return Math.max(0.05,Math.min(0.95,p));
}
/* rows: khataDebtRows-এর ফল; txs: সব লেনদেন */
function kzPlan(rows, txs, today){
  const by={}; (txs||[]).forEach(t=>{ (by[t.person]=by[t.person]||[]).push(t); });
  const items=(rows||[]).filter(r=>r.net>0).map(r=>{
    const s=kzRepayStats(by[r.name],today), t=kzTrust(s,{due:r.due,today,net:r.net}), p=kzPayProb(t,s), band=kzBand(t.score);
    const urg=(r.overdue?1.35:1)*(1+Math.min(0.5,s.openAge/180)), expected=r.net*p, why=[];
    if(s.avgDelay!=null) why.push(`গড়ে ${Math.round(s.avgDelay)} দিনে শোধ করে`); if(s.repaidShare!=null&&s.n>0) why.push(`দেওয়া টাকার ${Math.round(s.repaidShare*100)}% ফেরত দিয়েছে`);
    if(s.openAge>45) why.push(`${s.openAge} দিন ধরে বকেয়া`); if(r.overdue) why.push('তাগাদার তারিখ পেরিয়েছে'); if(s.lastPayDays!=null&&s.lastPayDays<=30) why.push(`${s.lastPayDays} দিন আগে কিছু দিয়েছে`);
    if(t.score==null) why.push('আগের লেনদেন কম — পূর্বাভাস অনিশ্চিত');
    return {name:r.name, net:r.net, score:t.score, band, p, expected, priority:expected*urg+r.net*0.05, tone:band==='good'?'soft':(band==='mid'?'firm':(band==='bad'?'direct':'neutral')), openAge:s.openAge, why};
  }).sort((a,b)=>b.priority-a.priority);
  return {items, expectedAll:items.reduce((t,x)=>t+x.expected,0)};
}
/* সুর বদলানো ভদ্র মেসেজ: ভালো দেনাদারকে হালকা মনে করানো, দুর্বলকে সরাসরি তারিখ চাওয়া */
function kzMessage(o){
  const hi=`আসসালামু আলাইকুম ${o.name}।`, bye=o.teacher?`\n— ${o.teacher}`:'', amt=o.amount;
  if(o.tone==='soft') return `${hi} কেমন আছেন? আমার হিসাবে ${amt} বাকি আছে — সুবিধামতো সময়ে দিয়ে দিলে ভালো হয়। ধন্যবাদ।${bye}`;
  if(o.tone==='firm') return `${hi} ${amt} বাকি আছে অনেকদিন হলো। কবে নাগাদ দিতে পারবেন জানালে আমার হিসাব রাখতে সুবিধা হয়।${bye}`;
  if(o.tone==='direct') return `${hi} ${amt} টাকা ${o.openAge||'অনেক'} দিন ধরে বকেয়া। আমারও টাকার দরকার আছে — আগামী ৩ দিনের মধ্যে একটা নির্দিষ্ট তারিখ জানাবেন, অথবা আগে কিছু অংশ পাঠিয়ে দিন।${bye}`;
  return `${hi} আমার হিসাবে ${amt} বাকি আছে। সুবিধামতো সময়ে দিয়ে দিলে ভালো হয়।${bye}`;
}
/* গত win দিনের দৈনিক খরচ/আয় (রিপিট এন্ট্রি বাদ — ওগুলো আলাদা ধরা হয়); খাতা ব্যবহার শুরুর আগের দিনগুলো শূন্য ধরা হয় না */
function kzHistory(daily, today, win){
  const f=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'), t=new Date(today+'T00:00:00'), dates=[];
  for(let i=win-1;i>=0;i--){ const d=new Date(t); d.setDate(t.getDate()-i); dates.push(f(d)); }
  const O={}, I={}; (daily||[]).forEach(e=>{ if(/রিপিট/.test(e.note||'')) return; const m=e.kind==='in'?I:O; m[e.date]=(m[e.date]||0)+(e.amount||0); });
  const first=(daily||[]).map(e=>e.date).filter(d=>d<=today).sort()[0]; let si=first?dates.findIndex(d=>d>=first):0; if(si<0) si=0;
  const use=dates.slice(si); return {out:use.map(d=>O[d]||0), inn:use.map(d=>I[d]||0), days:use.length};
}
/* ক্যাশ-রানওয়ে সিমুলেশন। o:{cash,days,runs,seed,hist:{out,inn},recur:[{kind,amount,day}],recvs:[{net,p30}],today,outMul}
   প্রতিটা দিনের খরচ/আয় আসল ইতিহাস থেকে র‍্যান্ডম দিন তুলে নেওয়া; দেনাদার ১ বার (কখনো অর্ধেক) শোধ করে */
function kzRunway(o){
  const D=o.days, R=o.runs||1200, H=o.hist, mul=o.outMul==null?1:o.outMul, bal=Array.from({length:D+1},()=>new Float64Array(R)), t0=new Date(o.today+'T00:00:00');
  const fixed=new Float64Array(D+1); for(let d=1;d<=D;d++){ const dt=new Date(t0); dt.setDate(t0.getDate()+d); const dim=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate(); (o.recur||[]).forEach(it=>{ if(Math.min(it.day||1,dim)===dt.getDate()) fixed[d]+=it.kind==='in'?it.amount:-it.amount; }); }
  let neg=0, firstNegSum=0; const hasH=H&&H.out.length>0;
  for(let r=0;r<R;r++){
    const rnd=fxRng((o.seed|0)+r*104729+3), pay=(o.recvs||[]).map(v=>{ const u1=rnd(),u2=rnd(),u3=rnd(), pH=1-Math.pow(1-v.p30,D/30); return u1<pH?{day:1+Math.floor(u2*D),amt:v.net*(u3<0.35?0.5:1)}:null; });
    let b=o.cash, minB=b, firstNeg=0; bal[0][r]=b;
    for(let d=1;d<=D;d++){ const i1=rnd(), i2=rnd(); let net=fixed[d]; if(hasH){ net-=H.out[Math.floor(i1*H.out.length)]*mul; net+=H.inn[Math.floor(i2*H.inn.length)]; } pay.forEach(x=>{ if(x&&x.day===d) net+=x.amt; }); b+=net; bal[d][r]=b; if(b<minB) minB=b; if(b<0&&!firstNeg) firstNeg=d; }
    if(minB<0){ neg++; firstNegSum+=firstNeg; }
  }
  const bands=bal.map(a=>{ const s=Float64Array.from(a).sort(); return {p10:fxPct(s,0.1),p25:fxPct(s,0.25),p50:fxPct(s,0.5),p75:fxPct(s,0.75),p90:fxPct(s,0.9)}; });
  const p10Neg=bands.findIndex(b=>b.p10<0);
  return {days:D, runs:R, bands, pRunout:neg/R, avgFirstNeg:neg?firstNegSum/neg:0, p10NegDay:p10Neg<0?0:p10Neg, hasHist:hasH, histDays:hasH?H.out.length:0};
}
/* কোন পদক্ষেপে রানওয়ে সবচেয়ে ভালো হয় */
function kzRunwayLevers(o){
  const base=kzRunway(o), D=o.days, mk=f=>kzRunway(Object.assign({},o,f)), top=(o.recvs||[]).slice().sort((a,b)=>b.net-a.net).slice(0,3).map(x=>x.id);
  const L=[
    {key:'collect', label:'বড় 3 জন দেনাদারের কাছ থেকে আদায় নিশ্চিত করলে', sim:mk({recvs:(o.recvs||[]).map(v=>top.includes(v.id)?Object.assign({},v,{p30:0.97}):v)})},
    {key:'cut', label:'দৈনিক খরচ 10% কমালে', sim:mk({outMul:(o.outMul==null?1:o.outMul)*0.9})},
    {key:'rise', label:'দৈনিক খরচ 10% বাড়লে', sim:mk({outMul:(o.outMul==null?1:o.outMul)*1.1})}
  ].map(x=>({key:x.key,label:x.label,dEnd:x.sim.bands[D].p10-base.bands[D].p10,dRun:x.sim.pRunout-base.pRunout}));
  L.sort((a,b)=>b.dEnd-a.dEnd); return {base, levers:L};
}

/* ---- data from the app ---- */
function kzTrustMap(list, people, today, rows){
  const by={}; (list||[]).forEach(t=>{ (by[t.person]=by[t.person]||[]).push(t); }), m={};
  (rows||[]).forEach(r=>{ if(r.net>0){ const s=kzRepayStats(by[r.name],today), t=kzTrust(s,{due:r.due,today,net:r.net}); m[r.name]={score:t.score, band:kzBand(t.score)}; } });
  return m;
}
function kzPill(x){ if(!x) return ''; const ic={good:'🟢',mid:'🟡',bad:'🔴',new:'⚪'}[x.band]; return `<span class="kz-pill ${x.band}" title="বিশ্বাস-স্কোর">${ic} ${x.score==null?'নতুন':enNum(x.score)}</span>`; }
function kzInputs(days){
  const T=dateKeyStr(todayDateOnly()), list=getKhata(), people=getLs('tr_khataPeople'), rows=khataDebtRows(list,people,'all','',T), plan=kzPlan(rows,list,T);
  const hist=kzHistory(getDaily(),T,90), recur=(lsGet(KH_REC_KEY,[])||[]).map(r=>({kind:r.kind,amount:Number(r.amount)||0,day:r.day||1}));
  return {cash:khataCashInfo().cash, days, runs:1200, seed:glxHash(T+':'+list.length+':'+getDaily().length), hist, recur, recvs:plan.items.map((x,i)=>({id:i,net:x.net,p30:x.p})), today:T, plan};
}
function kzBannerHtml(list, people, T, rows){
  let plan; try{ plan=kzPlan(rows,list,T); }catch(e){ return ''; }
  const topN=plan.items.slice(0,3), exp=topN.reduce((t,x)=>t+x.expected,0), parts=[];
  if(topN.length) parts.push(`আজ শীর্ষ ${enNum(topN.length)} জনকে তাগাদা দিলে ≈ <b>${enTaka(exp)}</b> আদায়ের সম্ভাবনা`);
  try{ const h=kzHistory(getDaily(),T,90), c=khataCashInfo().cash; if(h.days>=7){ const burn=h.out.reduce((a,b)=>a+b,0)/h.days-h.inn.reduce((a,b)=>a+b,0)/h.days; parts.push(burn>0?(c>0?`ক্যাশ গড় হারে ≈ ${enNum(Math.floor(c/burn))} দিন চলবে`:'ক্যাশ ঋণাত্মক'):'আয় ≥ খরচ — ক্যাশ নিরাপদ'); } }catch(e){}
  if(!parts.length) return '';
  return `<button type="button" class="kz-banner" onclick="kzOpen()"><div class="kz-b-t">🧠 খাতা-বুদ্ধি <i>নতুন</i></div><div class="kz-b-s">${parts.join(' · ')}</div><div class="kz-b-go">বিশ্বাস-স্কোর · তাগাদা-পরিকল্পনা · ক্যাশ-রানওয়ে ›</div></button>`;
}

/* ---- screen ---- */
function kzT(v){ return v<0?'−'+enTaka(-v):enTaka(v); }
let kz={tab:'plan', days:60, res:null, lv:null, inp:null, t:1, raf:0, last:0, cursor:null, W:0, H:0, dpr:1};
function kzOpen(tab){ kz.tab=tab||'plan'; kz.cursor=null; showKhataModal('🧠 খাতা-বুদ্ধি','<div id="kzBox"></div>'); kzRender(true); }
function kzTab(t){ kz.tab=t; kz.cursor=null; kzRender(true); }
function kzRender(animate){
  const box=document.getElementById('kzBox'); if(!box) return;
  const seg=`<div class="kh-seg kr-seg"><button type="button" class="${kz.tab==='plan'?'on':''}" onclick="kzTab('plan')">🎯 তাগাদা-পরিকল্পনা</button><button type="button" class="${kz.tab==='run'?'on':''}" onclick="kzTab('run')">🌅 ক্যাশ-রানওয়ে</button></div>`;
  if(kz.tab==='plan'){ box.innerHTML=seg+kzPlanHtml(); return; }
  const inp=kzInputs(kz.days), t0=performance.now(); kz.inp=inp; const r=kzRunwayLevers(inp); kz.res=r.base; kz.lv=r.levers; kz.ms=Math.round(performance.now()-t0);
  box.innerHTML=seg+kzRunHtml(); kzSetup(animate);
}
function kzPlanHtml(){
  const T=dateKeyStr(todayDateOnly()), list=getKhata(), rows=khataDebtRows(list,getLs('tr_khataPeople'),'all','',T), plan=kzPlan(rows,list,T);
  if(!plan.items.length) return emptyState({icon:'book',title:'কারো কাছে পাওনা নেই 🎉',body:'কাউকে ধার দিলে এখানে তার বিশ্বাস-স্কোর আর তাগাদার পরিকল্পনা দেখাবে।'});
  const top=plan.items.slice(0,3), expTop=top.reduce((t,x)=>t+x.expected,0), tot=plan.items.reduce((t,x)=>t+x.net,0);
  return `<div class="kz-hero"><small>আজ শীর্ষ ${enNum(top.length)} জনকে তাগাদা দিলে</small><b>≈ ${enTaka(expTop)}</b><span>আদায়ের সম্ভাবনা (মোট পাওনা ${enTaka(tot)}, সবাইকে ধরলে ≈ ${enTaka(plan.expectedAll)} আসতে পারে 30 দিনে)</span></div>
    ${plan.items.map((x,i)=>`<div class="kz-card ${x.band}"><div class="kz-ch"><span class="kz-rank">${enNum(i+1)}</span><div class="kz-cn"><b>${escapeHtml(x.name)}</b><small>পাবো ${enTaka(x.net)}</small></div>${kzPill({band:x.band,score:x.score})}</div>
      <div class="kz-prob"><i><u style="width:${Math.round(x.p*100)}%"></u></i><span>30 দিনে শোধের সম্ভাবনা ${enNum(Math.round(x.p*100))}% · প্রত্যাশিত ${enTaka(x.expected)}</span></div>
      <div class="kz-why">${x.why.map(w=>`<em>${escapeHtml(enBn(w))}</em>`).join('')}</div>
      <div class="kz-act"><button type="button" class="pct-chip active" onclick="kzMsg('${jsq(x.name)}')">📩 ${x.tone==='soft'?'হালকা মনে করাও':(x.tone==='firm'?'ভদ্র তাগাদা':(x.tone==='direct'?'সরাসরি তাগাদা':'তাগাদা পাঠাও'))}</button><button type="button" class="pct-chip" onclick="openKhataPerson('${jsq(x.name)}')">হিসাব দেখো</button></div></div>`).join('')}
    <div class="rd-foot">বিশ্বাস-স্কোর = কত দিনে ফেরত দেয়, দেওয়া টাকার কত % ফেরত দিয়েছে, কতদিন ধরে বকেয়া, তাগাদার তারিখ পেরিয়েছে কি না। সম্ভাবনাগুলো এই ইতিহাস থেকে ধরা মোটা অনুমান — নতুন বা কম-লেনদেনের মানুষের ক্ষেত্রে অনিশ্চিত (⚪)। এটা কাউকে বিচার করার জন্য নয়, কাকে আগে মনে করাবে তা ঠিক করার জন্য।</div>`;
}
function enBn(s){ return String(s).replace(/\d+/g,m=>enNum(Number(m))); }
function kzMsg(name){
  const T=dateKeyStr(todayDateOnly()), list=getKhata(), rows=khataDebtRows(list,getLs('tr_khataPeople'),'all','',T), it=kzPlan(rows,list,T).items.find(x=>x.name===name); if(!it) return;
  smMsgPage(name, kzMessage({name, amount:enTaka(it.net), tone:it.tone, openAge:it.openAge, teacher:getTeacherName(false)}));
  const ph=(getLs('tr_khataPeople')[name]||{}).phone; if(ph){ const p=getStudentProfile(name); }
}
function kzRunHtml(){
  const r=kz.res, D=kz.days, b=r.bands[D], low=Math.min(...r.bands.map(x=>x.p10)), pr=Math.round(r.pRunout*100), col=pr<=10?'#5ef2c8':(pr<=35?'#f2c85e':'#ff6b81'), circ=2*Math.PI*44;
  const chips=[30,60,90].map(d=>`<button type="button" class="pct-chip${d===D?' active':''}" onclick="kzDays_(${d})">${enNum(d)} দিন</button>`).join(''), maxd=Math.max(1,...kz.lv.map(l=>Math.abs(l.dEnd)));
  const recur=kz.inp.recur.filter(x=>x.amount>0);
  return `<div class="fx-tag"><b>CASH RUNWAY</b><span>● ${enNum(r.runs)}টা কল্পিত ভবিষ্যৎ · ${enNum(kz.ms)} মিলিসেকেন্ডে${r.hasHist?` · গত ${enNum(r.histDays)} দিনের আসল খরচ-আয় থেকে`:''}</span></div>
    <div class="fx-chips">${chips}</div><div class="fx-wrap"><canvas id="kzCanvas"></canvas></div><div id="kzRead" class="fx-read">টেনে দেখো — কোন দিনে ক্যাশ কত থাকতে পারে</div>
    <div class="fx-cards"><div class="fx-gauge"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" id="kzRing" style="stroke:${col};stroke-dasharray:${circ.toFixed(1)};stroke-dashoffset:${circ.toFixed(1)}" data-to="${(circ*(1-r.pRunout)).toFixed(1)}"/></svg><div class="fx-gn" style="color:${col}">${enNum(pr)}%</div></div>
      <div class="fx-gl"><b>${enNum(D)} দিনের মধ্যে ক্যাশ ফুরিয়ে যাওয়ার (0-র নিচে নামার) সম্ভাবনা</b><span>এখন ক্যাশ <em>${kzT(kz.inp.cash)}</em> → ${enNum(D)} দিন পরে মাঝারি <em>${kzT(b.p50)}</em></span><span>খারাপ দিনে (10%) <em class="${b.p10<0?'dn':''}">${kzT(b.p10)}</em> · ভালো দিনে (90%) <em class="up">${kzT(b.p90)}</em></span>${r.p10NegDay?`<span class="dn">⚠️ খারাপ পরিস্থিতিতে প্রায় ${enNum(r.p10NegDay)} দিনের মাথায় ক্যাশ ফুরোতে পারে</span>`:''}</div></div>
    ${!r.hasHist||r.histDays<14?`<div class="sm-hint">ℹ️ ক্যাশবক্সে ${r.hasHist?'মাত্র '+enNum(r.histDays)+' দিনের':'কোনো'} এন্ট্রি আছে। কমপক্ষে 2 সপ্তাহ এন্ট্রি দিলে এই পূর্বাভাস অনেক নির্ভুল হবে।</div>`:''}
    <div class="rd-sec">⚡ কোন পদক্ষেপে ক্যাশ সবচেয়ে বেশি নিরাপদ?</div>
    ${kz.lv.map(l=>`<div class="fx-lev"><div class="fx-lt"><span>${escapeHtml(l.label)}</span><b class="${l.dEnd>=0?'up':'dn'}">${l.dEnd>=0?'+':'−'}${enTaka(Math.abs(l.dEnd))}</b></div><div class="rd-bar"><i style="width:${Math.max(3,Math.abs(l.dEnd)/maxd*100)}%;background:${l.dEnd>=0?'var(--paid)':'var(--due)'}"></i></div><div class="fx-ls">${enNum(D)} দিন পরে খারাপ-দিনের ক্যাশে · ফুরোনোর সম্ভাবনা ${l.dRun<=0?'−':'+'}${enNum(Math.round(Math.abs(l.dRun)*100))}%</div></div>`).join('')}
    ${recur.length?`<div class="rd-sec">🔁 হিসাবে ধরা রিপিট বিল/আয়</div>${recur.map(x=>`<div class="fx-risk"><span>${x.kind==='in'?'পাওনা আয়':'রিপিট খরচ'} — মাসের ${enNum(x.day)} তারিখ</span><em>${x.kind==='in'?'+':'−'}${enTaka(x.amount)}</em></div>`).join('')}`:''}
    <div class="fx-asm"><b>🧪 অনুমান (সৎভাবে):</b><div>• দৈনিক খরচ-আয় তোমার গত ${enNum(Math.min(90,r.histDays||0))} দিনের আসল দিনগুলো থেকে র‍্যান্ডম তুলে নেওয়া (রিপিট এন্ট্রি আলাদা ধরা)।</div><div>• প্রতিটা দেনাদার 30 দিনে শোধের সম্ভাবনা বিশ্বাস-স্কোর থেকে; শোধ করলে একবারে, কখনো অর্ধেক।</div><div>• "আমি দেব" (যাদের কাছে ধার) এখানে ধরা হয়নি; উৎসব/পরীক্ষার মতো বিশেষ খরচও না। এটা <b>সম্ভাবনার পরিসর</b>, ভবিষ্যদ্বাণী নয়।</div></div>`;
}
function kzDays_(d){ kz.days=d; kz.cursor=null; kzRender(true); }
function kzSetup(animate){
  const cv=document.getElementById('kzCanvas'); if(!cv) return; const W=cv.parentElement.clientWidth||340, H=250, dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px'; kz.W=W; kz.H=H; kz.dpr=dpr;
  const at=e=>{ const r=cv.getBoundingClientRect(), x=(e.clientX-r.left-44)/(W-44-14); kz.cursor=Math.max(0,Math.min(kz.days,Math.round(x*kz.days))); if(!kz.raf) kzDraw(1); kzReadout(); };
  cv.onpointerdown=e=>{ cv.setPointerCapture(e.pointerId); at(e); }; cv.onpointermove=e=>{ if(e.buttons||e.pointerType==='touch') at(e); };
  const reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  setTimeout(()=>{ const ring=document.getElementById('kzRing'); if(ring) ring.style.strokeDashoffset=ring.dataset.to; },60);
  if(animate&&!reduce){ kz.t=0; kz.last=performance.now(); if(kz.raf) cancelAnimationFrame(kz.raf); kz.raf=requestAnimationFrame(kzFrame); } else { kz.t=1; kzDraw(1); }
}
function kzFrame(ts){
  const cv=document.getElementById('kzCanvas'); if(!cv||!cv.offsetParent||document.hidden){ kz.raf=0; return; }
  kz.t=Math.min(1,kz.t+Math.min(0.05,(ts-kz.last)/1000)/2); kz.last=ts; kzDraw(kz.t); kz.raf=kz.t<1?requestAnimationFrame(kzFrame):0;
}
function kzReadout(){ const el=document.getElementById('kzRead'); if(!el||kz.cursor==null||!kz.res) return; const b=kz.res.bands[kz.cursor]; el.innerHTML=`<b>${kz.cursor===0?'আজ':enNum(kz.cursor)+' দিন পরে'}</b> — খারাপ <span class="${b.p10<0?'dn':''}">${kzT(b.p10)}</span> · মাঝারি <span style="color:#f2c85e">${kzT(b.p50)}</span> · ভালো <span class="up">${kzT(b.p90)}</span>`; }
function kzDraw(t){
  const cv=document.getElementById('kzCanvas'); if(!cv||!kz.res) return; const ctx=cv.getContext('2d'), W=kz.W, H=kz.H, r=kz.res, D=r.days;
  ctx.setTransform(kz.dpr,0,0,kz.dpr,0,0); const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#0a1230'); bg.addColorStop(1,'#03040c'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  const padL=44, padR=14, padT=14, padB=24, x=d=>padL+(W-padL-padR)*d/D;
  let hi=Math.max(...r.bands.map(b=>b.p90),1)*1.08, lo=Math.min(...r.bands.map(b=>b.p10),0)*1.1; if(hi-lo<1) hi=lo+1; const y=v=>padT+(H-padT-padB)*(hi-v)/(hi-lo);
  ctx.font='10px sans-serif'; ctx.lineWidth=1; ctx.strokeStyle='rgba(120,190,255,0.12)'; ctx.fillStyle='rgba(180,210,255,0.55)'; ctx.textAlign='right';
  for(let k=0;k<=4;k++){ const v=lo+(hi-lo)*k/4, yy=y(v); ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(W-padR,yy); ctx.stroke(); ctx.fillText(Math.abs(v)>=1000?(v<0?'−':'')+enNum(Math.round(Math.abs(v)/1000))+'k':enNum(Math.round(v)),padL-6,yy+3); }
  ctx.textAlign='center'; [0,0.25,0.5,0.75,1].forEach(f=>{ const d=Math.round(D*f); ctx.fillText(enNum(d),x(d),H-8); });
  const zero=y(0); ctx.strokeStyle='rgba(255,100,120,0.7)'; ctx.setLineDash([5,4]); ctx.lineWidth=1.3; ctx.beginPath(); ctx.moveTo(padL,zero); ctx.lineTo(W-padR,zero); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='rgba(255,140,160,0.9)'; ctx.textAlign='left'; ctx.fillText('0 = ক্যাশ শেষ',padL+4,zero-4);
  const upto=Math.round(t*D), band=(a,b,al)=>{ ctx.beginPath(); for(let d=0;d<=upto;d++){ const yy=y(r.bands[d][b]); d?ctx.lineTo(x(d),yy):ctx.moveTo(x(d),yy); } for(let d=upto;d>=0;d--) ctx.lineTo(x(d),y(r.bands[d][a])); ctx.closePath(); ctx.fillStyle=`rgba(120,200,255,${al})`; ctx.fill(); };
  band('p10','p90',0.13); band('p25','p75',0.22);
  ctx.strokeStyle='#f2c85e'; ctx.lineWidth=2.4; ctx.shadowColor='rgba(242,200,94,0.9)'; ctx.shadowBlur=10; ctx.beginPath(); for(let d=0;d<=upto;d++){ d?ctx.lineTo(x(d),y(r.bands[d].p50)):ctx.moveTo(x(d),y(r.bands[d].p50)); } ctx.stroke(); ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(255,138,154,0.85)'; ctx.lineWidth=1.4; ctx.beginPath(); for(let d=0;d<=upto;d++){ d?ctx.lineTo(x(d),y(r.bands[d].p10)):ctx.moveTo(x(d),y(r.bands[d].p10)); } ctx.stroke();
  if(kz.cursor!=null){ const c=kz.cursor, xc=x(c); ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.moveTo(xc,padT); ctx.lineTo(xc,H-padB); ctx.stroke(); ctx.setLineDash([]); [['p10','#ff8a9a'],['p50','#f2c85e'],['p90','#7dffd8']].forEach(([k,col])=>{ ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=8; ctx.beginPath(); ctx.arc(xc,y(r.bands[c][k]),4,0,6.283); ctx.fill(); ctx.shadowBlur=0; }); }
}
