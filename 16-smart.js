/* ============ ✨ স্মার্ট সহকারী: ১) সিলেবাস পূর্বাভাস  ২) ছাত্র হারানোর আগাম সতর্কতা  ৩) ক্লাস শেষে ভয়েস রিপোর্ট ============ */

/* ======================= ১) 🧭 সিলেবাস পূর্বাভাস ======================= */
/* ইনপুট: অধ্যায়ের % + ডেডলাইন + শিডিউলের বাকি ক্লাস + এখন পর্যন্ত গড় গতি। আউটপুট: ডেডলাইনের আগে শেষ হবে কি না। */
/* pure (unit-tested): chapters:[{pct,targetDate}], sessions: আজের পরের নির্ধারিত ক্লাসের তারিখ (sorted), pace:{pace: অধ্যায়/ক্লাস}|null */
function sfForecast(o){
  const today=o.today, ch=(o.chapters||[]).filter(c=>c.targetDate), pace=(o.pace&&o.pace.pace>0)?o.pace.pace:0, S=o.sessions||[];
  const targets=[...new Set(ch.map(c=>c.targetDate))].sort(), items=[];
  targets.forEach(T=>{
    const need=ch.filter(c=>c.targetDate<=T).reduce((t,c)=>t+Math.max(0,100-(Number(c.pct)||0))/100,0);
    if(need<=0.0001) return;                                       // এই ডেডলাইন পর্যন্ত কাজ আগেই শেষ
    const overdue=T<today, left=overdue?0:S.filter(d=>d<=T).length, cap=pace*left;
    const status=overdue?'overdue':(!pace?'unknown':(cap>=need?'ok':(cap>=need*0.75?'risk':'behind')));
    const extra=pace>0?Math.ceil(Math.max(0,need-cap)/pace-1e-9):0;
    const projected=pace>0?(S[Math.ceil(need/pace-1e-9)-1]||''):'';
    items.push({T, need, left, status, extra, projected, speedUp:(pace>0&&cap>0)?need/cap:0, perClass:left>0?need/left:0});
  });
  const rank={overdue:4,behind:3,risk:2,unknown:1,ok:0};
  return {items, hasTargets:targets.length>0, status:items.length?items.reduce((w,i)=>rank[i.status]>rank[w]?i.status:w,'ok'):'done'};
}
/* pure: গতি = লগ থেকে (কমপক্ষে ৭ দিনের ব্যবধান), না হলে এ পর্যন্ত শেষ করা অংশ ÷ উপস্থিত ক্লাস */
function sfPaceFrom(log, classesIn, doneUnits, presentCount){
  const l=(log||[]).slice().sort((a,b)=>a.d<b.d?-1:1);
  if(l.length>=2){
    const a=l[0], b=l[l.length-1], days=Math.round((new Date(b.d+'T00:00:00')-new Date(a.d+'T00:00:00'))/86400000), n=classesIn(a.d,b.d);
    if(days>=7 && n>=2 && b.u-a.u>0) return {pace:(b.u-a.u)/n, src:'log'};
  }
  if(presentCount>=6 && doneUnits>0.1) return {pace:doneUnits/presentCount, src:'life'};
  return null;
}
function sfLogSnapshot(name){
  const d=getProgressData()[name]; if(!d) return;
  let u=0; Object.keys(d).forEach(s=>(d[s]||[]).forEach(c=>{ u+=(Number(c.pct)||0)/100; }));
  const all=lsGet('tr_progLog',{}), arr=all[name]||[], T=dateKeyStr(todayDateOnly());
  if(arr.length&&arr[arr.length-1].d===T) arr[arr.length-1].u=u; else arr.push({d:T,u});
  all[name]=arr.slice(-90); lsSet('tr_progLog',all);
}
function sfSnapAll(){ try{ Object.keys(getProgressData()).forEach(sfLogSnapshot); }catch(e){} }
function sfSessionDates(name, days){
  const out=[], base=todayDateOnly();
  for(let i=1;i<=days;i++){ const d=new Date(base); d.setDate(base.getDate()+i); const dow=DAYS[(d.getDay()+1)%7];
    if(SCHEDULE.some(s=>getCellText(s,dow).split(',').map(x=>x.trim()).includes(name))) out.push(dateKeyStr(d)); }
  return out;
}
function sfAll(){
  const prog=getProgressData(), ix=smIndex(), logs=lsGet('tr_progLog',{}), T=dateKeyStr(todayDateOnly()), res=[];
  Object.keys(prog).forEach(name=>{
    const chapters=[]; Object.keys(prog[name]||{}).forEach(s=>(prog[name][s]||[]).forEach(c=>chapters.push({subject:s, chapter:c.chapter, pct:c.pct, targetDate:c.targetDate||''})));
    if(!chapters.length) return;
    const present=(ix.att[name]||[]).filter(x=>x[1]==='present'||x[1]==='late').map(x=>x[0]);
    const classesIn=(a,b)=>present.filter(d=>d>=a&&d<=b).length;
    const done=chapters.reduce((t,c)=>t+(Number(c.pct)||0)/100,0);
    const pace=sfPaceFrom(logs[name], classesIn, done, present.length);
    const f=sfForecast({today:T, chapters, sessions:sfSessionDates(name,400), pace});
    res.push(Object.assign({name, pace, done, chapters}, f));
  });
  return res;
}
const SF_RANK={overdue:4,behind:3,risk:2,unknown:1,ok:0,done:-1};
const SF_CHIP={overdue:['🔴','ডেডলাইন পেরিয়েছে'],behind:['🔴','পিছিয়ে'],risk:['🟡','ঝুঁকিতে'],unknown:['⚪','গতি জানা নেই'],ok:['🟢','ঠিক পথে'],done:['✅','সব শেষ']};
function sfDateBn(ds){ return bnDateLabel(new Date(ds+'T00:00:00')); }
function sfItemText(it){
  const need=toBn(it.need.toFixed(1)), head=`<b>${sfDateBn(it.T)}</b>-এর মধ্যে বাকি ${need} অধ্যায়`;
  if(it.status==='overdue') return `${head} — ডেডলাইন পেরিয়ে গেছে।`;
  if(it.status==='unknown') return `${head}, ক্লাস আছে ${toBn(it.left)} টি → প্রতি ক্লাসে ${toBn(it.perClass.toFixed(2))} অধ্যায় করতে হবে।`;
  if(it.status==='ok') return `${head}, ক্লাস আছে ${toBn(it.left)} টি → এই গতিতে হয়ে যাবে ✅`;
  if(it.extra>Math.max(it.left,8)) return `${head}, ক্লাস আছে ${toBn(it.left)} টি → <b>এই গতিতে হবে না</b>, গতি অনেক কম। ডেডলাইন সরাও বা অধ্যায় কমাও — নয়তো প্রতি ক্লাসে অন্তত ${toBn(it.perClass.toFixed(2))} অধ্যায় করতে হবে।`;
  return `${head}, ক্লাস আছে ${toBn(it.left)} টি → এই গতিতে <b>${toBn(it.extra)} টি ক্লাস কম পড়বে</b>। ${it.projected?`শেষ হবে প্রায় ${sfDateBn(it.projected)}-তে।`:''} সমাধান: ডেডলাইনের আগে ${toBn(it.extra)} টি বাড়তি ক্লাস, অথবা গতি ${toBn(it.speedUp.toFixed(1))} গুণ বাড়াও।`;
}
function sfBody(){
  const all=sfAll(); sfSnapAll();
  const withT=all.filter(s=>s.hasTargets).sort((a,b)=>(SF_RANK[b.status]-SF_RANK[a.status])||a.name.localeCompare(b.name)), noT=all.filter(s=>!s.hasTargets);
  if(!all.length) return `<div id="sfBox">${emptyState({icon:'chart',title:'কোনো অধ্যায় যোগ করা নেই',body:'শিক্ষার্থীর প্রোফাইলে বিষয় ও অধ্যায় দাও, সঙ্গে ডেডলাইন — তাহলে এখানে পরীক্ষার আগে সিলেবাস শেষ হবে কি না বলে দেব।'})}</div>`;
  const cnt=k=>withT.filter(s=>s.status===k||(k==='behind'&&s.status==='overdue')).length;
  return `<div id="sfBox"><div class="sm-sum"><div><b>${toBn(cnt('behind'))}</b><span>পিছিয়ে</span></div><div><b>${toBn(cnt('risk'))}</b><span>ঝুঁকিতে</span></div><div><b>${toBn(cnt('ok'))}</b><span>ঠিক পথে</span></div></div>
    ${withT.map(s=>{ const c=SF_CHIP[s.status]||SF_CHIP.ok;
      return `<div class="sm-card ${s.status}"><div class="sm-card-h"><span>${escapeHtml(s.name)}</span><em>${c[0]} ${c[1]}</em></div>
        ${s.items.slice(0,3).map(it=>`<div class="sm-line">${sfItemText(it)}</div>`).join('')||'<div class="sm-line">সব ডেডলাইনের কাজ শেষ 🎉</div>'}
        <div class="sm-meta">${s.pace?`গতি ≈ ${toBn(s.pace.pace.toFixed(2))} অধ্যায়/ক্লাস (${s.pace.src==='log'?'আগের সপ্তাহগুলোর অগ্রগতি থেকে':'এ পর্যন্ত শেষ করা ÷ উপস্থিত ক্লাস, আনুমানিক'})`:'গতি বের করার মতো যথেষ্ট তথ্য নেই — কয়েক সপ্তাহ অধ্যায়ের % আপডেট করলে নির্ভুল হবে'}</div></div>`; }).join('')}
    ${noT.length?`<div class="sm-hint">⏳ ডেডলাইন দেওয়া নেই: ${noT.map(s=>escapeHtml(s.name)).join(', ')} — অধ্যায়ে "লক্ষ্য তারিখ" দিলে এদের পূর্বাভাসও পাবে।</div>`:''}
    <div class="rd-foot">ক্লাস গোনা হয়েছে সাপ্তাহিক শিডিউল ধরে (ছুটি/বাতিল ধরা হয়নি)। গতি প্রতিদিন নিজে থেকে জমা হয়, তাই সময়ের সঙ্গে আরও নির্ভুল হবে।</div></div>`;
}
function sfOpen(){ showKhataModal('🧭 সিলেবাস পূর্বাভাস', sfBody()); }

/* ======================= ২) 📉 ছাত্র হারানোর আগাম সতর্কতা ======================= */
/* pure (unit-tested). f: {recentMarked, recentAbsent, recentLate, prevMarked, prevAbsent, hwN, hwNone, hwPartial, dueMonths, curUnpaidLate, daysSinceSeen, makeups} */
function churnScore(f){
  const R=[]; let total=0; const add=(key,pts,text)=>{ if(pts>0){ total+=pts; R.push({key,pts:Math.round(pts),text}); } };
  const rate=f.recentMarked>=3?f.recentAbsent/f.recentMarked:0, prevRate=f.prevMarked>=3?f.prevAbsent/f.prevMarked:0;
  add('abs', Math.min(40, rate*100*0.8), `গত ৪ সপ্তাহে ${f.recentMarked} ক্লাসের মধ্যে ${f.recentAbsent} দিন অনুপস্থিত`);
  if(f.prevMarked>=3 && f.recentMarked>=3 && rate-prevRate>=0.15) add('trend',10,'আগের মাসের চেয়ে অনুপস্থিতি বাড়ছে');
  if(f.recentMarked>=3) add('late', Math.min(10, f.recentLate/f.recentMarked*20), `${f.recentLate} দিন দেরিতে এসেছে`);
  if(f.hwN>=3) add('hw', Math.min(15, (f.hwNone+f.hwPartial*0.5)/f.hwN*15), `শেষ ${f.hwN} ক্লাসের মধ্যে ${f.hwNone} দিন হোমওয়ার্ক করেনি`);
  let pay=0, ptxt=''; if(f.dueMonths>=2){ pay=25; ptxt=`${f.dueMonths} মাসের ফি বাকি`; } else if(f.dueMonths===1){ pay=15; ptxt='গত মাসের ফি বাকি'; }
  if(f.curUnpaidLate){ pay=Math.min(25,pay+8); ptxt=ptxt||'এই মাসের ফি এখনো আসেনি'; }
  add('pay', pay, ptxt);
  if(f.daysSinceSeen!=null && f.daysSinceSeen>=21) add('silent',15,`${f.daysSinceSeen} দিন ধরে ক্লাস হয়নি`);
  if(f.makeups>=2) add('makeup',5,`${f.makeups} টা মেকআপ ক্লাস বাকি`);
  const score=Math.min(100,Math.round(total)), enough=f.recentMarked>=3||f.hwN>=3||f.dueMonths>0||f.curUnpaidLate||(f.daysSinceSeen!=null&&f.daysSinceSeen>=21);
  R.sort((a,b)=>b.pts-a.pts);
  return {score, band:!enough?'nodata':(score>=55?'high':(score>=30?'medium':'low')), reasons:R};
}
/* pure: অভিভাবককে ভদ্র, দোষারোপহীন মেসেজ */
function churnMessage(o){
  const hi=`আসসালামু আলাইকুম${o.guardian?', '+o.guardian:''}।`, bye=o.teacher?`\n— ${o.teacher}`:'', n=o.name, k=o.key;
  if(k==='pay') return `${hi} ${n}-এর মাসিক ফি${o.amount?' '+o.amount:''} বাকি আছে। সুবিধামতো সময়ে পাঠিয়ে দিলে ভালো হয়। ধন্যবাদ।${bye}`;
  if(k==='hw') return `${hi} ${n} ইদানীং হোমওয়ার্ক কম করছে। বাসায় একটু খেয়াল রাখলে পড়াটা দ্রুত এগিয়ে যাবে। আমিও ক্লাসে নজর রাখছি।${bye}`;
  if(k==='silent') return `${hi} অনেকদিন ${n}-এর ক্লাস হয়নি। পড়াশোনা চালিয়ে যেতে চাইলে একটা সময় ঠিক করে নিই?${bye}`;
  if(k==='trend') return `${hi} ইদানীং ${n}-কে ক্লাসে একটু কম পাচ্ছি। সব ঠিক আছে তো? কোনো অসুবিধা থাকলে জানাবেন, ক্লাসের সময় বদলে নেওয়া যাবে।${bye}`;
  return `${hi} ${n}-কে কয়েকদিন ক্লাসে পাচ্ছি না। সব ঠিক আছে তো? কোনো অসুবিধা থাকলে জানাবেন, ক্লাসের সময় বদলে নিতে পারি।${bye}`;
}
/* attendance + homework grouped by student in ONE pass (so many students × a long history stays fast) */
function smIndex(){
  const att=getAttendanceMap(), notes=getNotes(), A={}, H={};
  Object.keys(att).forEach(k=>{ const p=k.split('|'), n=p.slice(2).join('|'); (A[n]=A[n]||[]).push([p[0],att[k]]); });
  Object.keys(notes).forEach(k=>{ const raw=notes[k]; if(!raw||!Array.isArray(raw.entries)) return; const d=k.split('|')[0]; raw.entries.forEach(e=>{ if(e.student&&e.hwStatus) (H[e.student]=H[e.student]||[]).push({d,s:e.hwStatus}); }); });
  return {att:A, hw:H};
}
function churnFeatures(name, ix){
  ix=ix||smIndex(); const base=todayDateOnly(), T=dateKeyStr(base);
  const back=n=>{ const d=new Date(base); d.setDate(base.getDate()-n); return dateKeyStr(d); }, c28=back(28), c84=back(84);
  const f={recentMarked:0,recentAbsent:0,recentLate:0,prevMarked:0,prevAbsent:0,hwN:0,hwNone:0,hwPartial:0,dueMonths:0,curUnpaidLate:false,daysSinceSeen:null,makeups:0};
  let latest=null;
  const mine=ix.att[name]||[];
  mine.forEach(([d,st])=>{
    if(st==='present'||st==='late'){ if(!latest||d>latest) latest=d; }
    if(st==='excused'||st==='cancelled'||st==='resched') return;
    if(d>c28&&d<=T){ f.recentMarked++; if(st==='absent') f.recentAbsent++; if(st==='late') f.recentLate++; }
    else if(d>c84&&d<=c28){ f.prevMarked++; if(st==='absent') f.prevAbsent++; }
  });
  (ix.hw[name]||[]).slice().sort((a,b)=>a.d<b.d?1:-1).slice(0,8).forEach(x=>{ f.hwN++; if(x.s==='none') f.hwNone++; else if(x.s==='partial') f.hwPartial++; });
  const fee=getStudentPayment(name).monthlyFee||0;
  if(fee>0){
    const d0=new Date(base.getFullYear(),base.getMonth(),1), first=mine.map(x=>x[0]).sort()[0]||T;
    for(let i=1;i<=2;i++){ const d=new Date(d0.getFullYear(),d0.getMonth()-i,1), mk=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(mk>=first.slice(0,7) && getStudentPaidForMonth(name,mk)<fee) f.dueMonths++; }
    if(base.getDate()>=15 && getStudentPaidForMonth(name,currentMonthKey())<fee) f.curUnpaidLate=true;
  }
  if(latest) f.daysSinceSeen=Math.round((base-new Date(latest+'T00:00:00'))/86400000);
  f.makeups=getMakeups().filter(m=>m.name===name).length;
  return f;
}
function churnAll(){
  const ix=smIndex();
  return getAllKnownNames().map(n=>{ const f=churnFeatures(n,ix), r=churnScore(f); return Object.assign({name:n,f},r); }).filter(x=>x.band!=='nodata').sort((a,b)=>b.score-a.score);
}
function smBn(s){ return String(s).replace(/\d+/g,m=>toBn(m)); }
const CH_CHIP={high:['🔴','উচ্চ ঝুঁকি'],medium:['🟡','মাঝারি'],low:['🟢','নিরাপদ']};
function churnBody(){
  const all=churnAll();
  if(!all.length) return `<div id="chBox">${emptyState({icon:'chart',title:'এখনো যথেষ্ট তথ্য নেই',body:'কয়েকটা ক্লাসের উপস্থিতি নিলে (আর হোমওয়ার্ক/ফি লিখলে) এখানে কে ছেড়ে দিতে পারে আগাম বলে দেব।'})}</div>`;
  const hi=all.filter(x=>x.band==='high').length, me=all.filter(x=>x.band==='medium').length, lo=all.filter(x=>x.band==='low').length;
  return `<div id="chBox"><div class="sm-sum"><div><b>${toBn(hi)}</b><span>উচ্চ ঝুঁকি</span></div><div><b>${toBn(me)}</b><span>মাঝারি</span></div><div><b>${toBn(lo)}</b><span>নিরাপদ</span></div></div>
    ${all.map(x=>{ const c=CH_CHIP[x.band], q=jsq(x.name);
      return `<div class="sm-card ${x.band}"><div class="sm-card-h"><span>${escapeHtml(x.name)}</span><em>${c[0]} ${c[1]} · ${toBn(x.score)}</em></div>
        <div class="rd-bar"><i style="width:${Math.max(3,x.score)}%"></i></div>
        ${x.reasons.slice(0,3).map(r=>`<div class="sm-line">• ${escapeHtml(isFinanceHidden()&&r.key==='pay'?'আর্থিক কারণ (আনলক করলে দেখা যাবে)':smBn(r.text))}</div>`).join('')||'<div class="sm-line">কোনো সতর্ক সংকেত নেই 👍</div>'}
        ${x.reasons.length?`<button type="button" class="pct-chip active" style="margin-top:8px;" onclick="churnMsgOpen('${q}')">📩 অভিভাবককে মেসেজ বানাও</button>`:''}</div>`; }).join('')}
    <div class="rd-foot">স্কোর = উপস্থিতি, দেরি, হোমওয়ার্ক, ফি, কতদিন ক্লাস হয়নি আর মেকআপ — সব মিলিয়ে ০–১০০। এটা ইঙ্গিত মাত্র, রায় নয়; আগে ছাত্র/অভিভাবকের সঙ্গে কথা বলো।</div></div>`;
}
function churnOpen(){ showKhataModal('📉 ছাত্র ঝুঁকি', churnBody()); }
function churnMsgOpen(name){
  const f=churnFeatures(name), r=churnScore(f), pr=getStudentProfile(name), top=(r.reasons[0]||{}).key||'abs';
  const due=(typeof getStudentTotalDue==='function')?getStudentTotalDue(name):0;
  smMsgPage(name, churnMessage({name, key:top, teacher:getTeacherName(false), guardian:(pr.guardianName||'').trim(), amount:(due>0&&!isFinanceHidden())?bnTakaOpen(due):''}));
}

/* ---------- মেসেজ পাতা (২ ও ৩ নম্বরে একই): এডিট করো → WhatsApp / কপি ---------- */
let smMsgName='';
function smMsgPage(name, text, extraHtml){
  smMsgName=name;
  showKhataModal('📩 মেসেজ — '+name, `<div style="font-size:11.5px;color:var(--muted);margin-bottom:6px;">পাঠানোর আগে দরকার মতো বদলে নাও:</div>
    <textarea id="sm_msg" class="kh-in" rows="10" style="resize:vertical;line-height:1.7;">${escapeHtml(text)}</textarea>
    <button class="kh-fab" style="margin-top:10px;" onclick="smSend()">📲 WhatsApp-এ পাঠাও</button>
    <button type="button" class="settings-btn" onclick="smCopy()">📋 কপি করো</button>${extraHtml||''}${typeof aiMsgHtml==='function'?aiMsgHtml():''}`);
}
function smSend(){ const pr=getStudentProfile(smMsgName); if(!(pr.guardianPhone||'').trim()) showWarningToast('অভিভাবকের ফোন সেভ করা নেই — WhatsApp-এ নিজে কন্টাক্ট বেছে নাও'); openWhatsApp(pr.guardianPhone, document.getElementById('sm_msg').value); }
function smCopy(){ const v=document.getElementById('sm_msg').value; try{ navigator.clipboard.writeText(v).then(()=>showSuccessToast('কপি হয়েছে'),()=>showWarningToast('কপি হয়নি')); }catch(e){ showWarningToast('কপি হয়নি'); } }

/* ======================= ৩) 🎙️ ক্লাস শেষে ভয়েস রিপোর্ট ======================= */
/* pure (unit-tested): মুখে বলা/লেখা এক টুকরো কথা → পড়ানো / হোমওয়ার্ক / পরের ক্লাস / মন্তব্য */
function vrParse(text){
  const out={taught:[],homework:[],next:[],remark:[]};
  String(text||'').split(/[।.!?\n]+/).map(s=>s.trim()).filter(Boolean).forEach(sen=>{
    if(/পরের ক্লাস|আগামী ক্লাস|পরবর্তী ক্লাস|পরের দিন|পরের বার|পরেরবার|পরের সপ্তাহ|আগামীকাল|কাল ক্লাসে/.test(sen)) out.next.push(sen);
    else if(/হোমওয়ার্ক|হোম ওয়ার্ক|বাড়ির কাজ|বাড়ীর কাজ|করে আসবে|করে আনবে|লিখে আনবে|শিখে আসবে|পড়ে আসবে|মুখস্থ/.test(sen)) out.homework.push(sen);
    else if(/ভালো করেছে|ভালো করেছ|ভালো বুঝেছে|মনোযোগ|দুর্বল|বেশি ভুল|অমনোযোগ|দেরিতে|দেরি করে|খেয়াল রাখ|উন্নতি|সমস্যা/.test(sen)) out.remark.push(sen);
    else out.taught.push(sen);
  });
  const j=a=>a.join('। ')+(a.length?'।':'');
  return {taught:j(out.taught), homework:j(out.homework), next:j(out.next), remark:j(out.remark)};
}
/* pure: অভিভাবকের জন্য রিপোর্ট; খালি অংশ বাদ */
function vrMessage(o){
  const L=['আসসালামু আলাইকুম'+(o.guardian?', '+o.guardian:'')+'।', `${o.name}-এর আজকের ক্লাসের সংক্ষিপ্ত রিপোর্ট${o.dateLabel?' ('+o.dateLabel+')':''}:`];
  const taught=String(o.taught||'').replace(/^আজ\s+/,''), next=String(o.next||'').replace(/^(পরের|আগামী|পরবর্তী)\s+ক্লাসে?,?\s*/,'');
  if(taught) L.push('📖 আজ যা পড়ানো হয়েছে: '+taught);
  if(o.homework) L.push('📝 বাড়ির কাজ: '+o.homework);
  if(next) L.push('🔜 পরের ক্লাসে: '+next);
  if(o.remark) L.push('💬 মন্তব্য: '+o.remark);
  L.push('ধন্যবাদ।'+(o.teacher?'\n— '+o.teacher:''));
  return L.join('\n');
}
function vrTodayNames(){
  const dow=DAYS[(todayDateOnly().getDay()+1)%7], set=[];
  SCHEDULE.forEach(s=>getCellText(s,dow).split(',').map(x=>x.trim()).filter(Boolean).forEach(n=>{ if(!set.includes(n)) set.push(n); }));
  const rest=getAllKnownNames().filter(n=>!set.includes(n)).sort((a,b)=>a.localeCompare(b));
  return {today:set, rest};
}
function vrOpen(){
  const {today,rest}=vrTodayNames(), opt=n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`;
  showKhataModal('🎙️ ক্লাস রিপোর্ট', `<div id="vrBox"><div style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:8px;">ক্লাস শেষে ১০ সেকেন্ড বলো বা লেখো — যেমন: <i>"আজ ভগ্নাংশ যোগ করালাম। হোমওয়ার্ক পাতা ১২ করে আসবে। পরের ক্লাসে বিয়োগ ধরব। ভালো বুঝেছে।"</i> আমি গুছিয়ে অভিভাবকের মেসেজ বানিয়ে দেব।</div>
    <select id="vr_name" class="kh-in">${today.length?`<optgroup label="আজকের ক্লাসের ছাত্র">${today.map(opt).join('')}</optgroup>`:''}<optgroup label="সব ছাত্র">${rest.map(opt).join('')}</optgroup></select>
    <div style="position:relative;"><textarea id="vr_text" class="kh-in" rows="5" placeholder="এখানে লেখো বা 🎤 চেপে বলো…" style="padding-right:52px;"></textarea>
      <button type="button" class="mic-btn" data-mic="vr_text" aria-label="বলে লেখো" onclick="startVoice('vr_text',{append:true})" style="position:absolute;right:8px;top:8px;">${ICN.mic}</button></div>
    <button class="kh-fab" style="margin-top:10px;" onclick="vrMake()">✨ রিপোর্ট বানাও</button>
    <div style="font-size:10.5px;color:var(--muted);margin-top:8px;">🎤 বলে লেখা ইন্টারনেট লাগে (ফোনের স্পিচ সার্ভিস)। অফলাইনে কিবোর্ডের নিজের 🎤 দিয়ে বলো, অথবা টাইপ করো।</div></div>`);
}
function vrMake(){
  const name=(document.getElementById('vr_name')||{}).value, text=((document.getElementById('vr_text')||{}).value||'').trim();
  if(!name){ showWarningToast('আগে ছাত্র বেছে নাও।'); return; }
  if(!text){ showWarningToast('কিছু বলো বা লেখো।'); return; }
  const p=vrParse(text), pr=getStudentProfile(name), msg=vrMessage({name, guardian:(pr.guardianName||'').trim(), teacher:getTeacherName(false), dateLabel:bnDateLabel(todayDateOnly()), taught:p.taught, homework:p.homework, next:p.next, remark:p.remark});
  vrParsed={name, taught:p.taught, homework:p.homework, next:p.next};
  smMsgPage(name, msg, `<button type="button" class="settings-btn" onclick="vrSaveNote()">📓 ক্লাস-নোটেও সেভ করো (পড়ালাম · হোমওয়ার্ক · পরের পরিকল্পনা)</button>`);
}
let vrParsed=null;
function vrSaveNote(){
  if(!vrParsed) return; const d=todayDateOnly(), dow=DAYS[(d.getDay()+1)%7];
  const slot=SCHEDULE.find(s=>getCellText(s,dow).split(',').map(x=>x.trim()).includes(vrParsed.name));
  if(!slot){ showWarningToast('আজ এই ছাত্রের ক্লাস শিডিউলে নেই, তাই নোটে রাখা গেল না।'); return; }
  const entries=getNoteEntries(d,slot.num), mine=entries.find(e=>e.student===vrParsed.name&&!e.subject), rest=entries.filter(e=>e!==mine);
  const merged=Object.assign({student:vrParsed.name, subject:'', taught:'', homework:'', nextPlan:''}, mine||{});
  if(vrParsed.taught) merged.taught=vrParsed.taught; if(vrParsed.homework) merged.homework=vrParsed.homework; if(vrParsed.next) merged.nextPlan=vrParsed.next;
  setNoteEntries(d, slot.num, rest.concat([merged])); showSuccessToast('ক্লাস-নোটে সেভ হয়েছে');
}

/* ======================= রিপোর্ট ট্যাবের হাব কার্ড ======================= */
function smartHubHtml(){
  let sfLine='অধ্যায় ও ডেডলাইন দিলে পূর্বাভাস', chLine='উপস্থিতি নিলে ঝুঁকি দেখাবে';
  try{ const a=sfAll().filter(s=>s.hasTargets), bad=a.filter(s=>s.status==='behind'||s.status==='overdue').length, risk=a.filter(s=>s.status==='risk').length; if(a.length) sfLine=(bad||risk)?`${toBn(bad)} জন পিছিয়ে · ${toBn(risk)} জন ঝুঁকিতে`:'সবাই ঠিক পথে 🟢'; }catch(e){}
  try{ const c=churnAll(), hi=c.filter(x=>x.band==='high').length, me=c.filter(x=>x.band==='medium').length; if(c.length) chLine=(hi||me)?`${toBn(hi)} জন উচ্চ · ${toBn(me)} জন মাঝারি ঝুঁকি`:'কারো ঝুঁকি নেই 🟢'; }catch(e){}
  return `<div class="settings-section-title">✨ স্মার্ট সহকারী</div><div class="sm-grid">
    <button type="button" class="sm-tile glx-tile" onclick="aiChatOpen()"><b>🤖 AI জিজ্ঞেস করো</b><span>তোমার টিউশন নিয়ে বাংলায় প্রশ্ন করো — নাম ছাড়া, নিরাপদে</span></button>
    <button type="button" class="sm-tile glx-tile" onclick="fxOpen()"><b>🔮 ভবিষ্যৎ-যন্ত্র</b><span>১,৫০০টা সম্ভাব্য ভবিষ্যৎ চালিয়ে দেখো তোমার আয় কোথায় যেতে পারে</span></button>
    <button type="button" class="sm-tile glx-tile" onclick="glxOpen()"><b>🌌 ছাত্র-গ্যালাক্সি</b><span>তোমার টিউশনের জীবন্ত ত্রিমাত্রিক ব্রহ্মাণ্ড — টেনে ঘোরাও</span></button>
    <button type="button" class="sm-tile" onclick="sfOpen()"><b>🧭 সিলেবাস পূর্বাভাস</b><span>${sfLine}</span></button>
    <button type="button" class="sm-tile" onclick="churnOpen()"><b>📉 ছাত্র ঝুঁকি</b><span>${chLine}</span></button>
    <button type="button" class="sm-tile" onclick="dcOpen()"><b>🧠 সিদ্ধান্ত-সহকারী</b><span>কেন এমন হচ্ছে? · কী হলে কী হবে?</span></button>
    <button type="button" class="sm-tile" onclick="thkOpen()"><b>💭 চিন্তা-শক্তি</b><span>ছাত্রদের জন্য ৬ ধাপের ভাবনার প্রশ্ন</span></button>
    <button type="button" class="sm-tile" onclick="qpOpen()"><b>📝 নোট ও প্রশ্নপত্র</b><span>AI খসড়া → সম্পাদনা → অনুমোদন → A4 প্রিন্ট</span></button>
    <button type="button" class="sm-tile" onclick="resOpen()"><b>📊 ফল ও দুর্বলতা</b><span>কারণসহ দুর্বল অধ্যায় · অভিভাবকের ফল-রিপোর্ট</span></button>
    <button type="button" class="sm-tile" onclick="feeOpen()"><b>🧾 ফি ও হাজিরা</b><span>ছাড়/চার্জ · পেমেন্ট রিভার্স · হিসাব মেলানো</span></button>
    <button type="button" class="sm-tile" onclick="vrOpen()"><b>🎙️ ক্লাস রিপোর্ট</b><span>বলো → অভিভাবকের মেসেজ তৈরি</span></button></div>`;
}
setTimeout(sfSnapAll, 8000);
