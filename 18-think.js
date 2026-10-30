/* ============ 🧠 সিদ্ধান্ত-সহকারী (শিক্ষকের জন্য) + 💭 চিন্তা-শক্তি (ছাত্রদের জন্য) ============ */

/* ======================= 🧠 সিদ্ধান্ত-সহকারী ======================= */
/* "কেন?" — একটাই ব্যাখ্যায় ঝাঁপ না দিয়ে কয়েকটা সম্ভাব্য কারণ, প্রতিটার প্রমাণ + বিপরীত দিক + কী যাচাই করবে; দলের সঙ্গে তুলনা করে */
/* pure (unit-tested). f: {recentMarked,recentAbsent,cohortAbsRate,hwN,hwNone,hwPartial,sessions,cohortSessions,syllabusBad(0|1|2),perClass,dueMonths,daysSinceSeen} */
function dcWhy(f){
  const F=[], pct=x=>Math.round(x*100), my=f.recentMarked>=3?f.recentAbsent/f.recentMarked:null;
  if(my!=null && my>0){
    const coh=(f.cohortAbsRate==null)?null:f.cohortAbsRate, higher=coh==null||my>coh*1.3+0.02;
    F.push({key:'abs', score:Math.min(1,my/0.5)*(higher?1:0.55), evidence:`গত ৪ সপ্তাহে ${f.recentMarked} ক্লাসের ${f.recentAbsent}টায় অনুপস্থিত (${pct(my)}%)${coh!=null?` — দলের মাঝামাঝি ${pct(coh)}%`:''}`,
      counter:higher?'':'দলের বাকিদেরও অনুপস্থিতি কাছাকাছি — এটা একা এই ছাত্রের সমস্যা নাও হতে পারে (ঋতু, পরীক্ষা, উৎসব?)', check:'শেষ কয়দিন কেন আসেনি, সরাসরি জিজ্ঞেস করেছ?'});
  }
  if(f.hwN>=3){ const r=(f.hwNone+0.5*f.hwPartial)/f.hwN;
    if(r>0) F.push({key:'hw', score:Math.min(1,r/0.6)*(f.hwN>=5?1:0.7), evidence:`শেষ ${f.hwN} ক্লাসের ${f.hwNone}টায় হোমওয়ার্ক করেনি${f.hwPartial?`, ${f.hwPartial}টায় অর্ধেক`:''}`,
      counter:f.hwN<5?`নমুনা মাত্র ${f.hwN}টা — এখনই জোর দিয়ে বলা যায় না`:'', check:'হোমওয়ার্কটা কি তার জন্য বেশি কঠিন বা বেশি লম্বা?'}); }
  if(f.sessions!=null && f.cohortSessions!=null && f.sessions<f.cohortSessions){
    const gap=(f.cohortSessions-f.sessions)/f.cohortSessions;
    F.push({key:'load', score:Math.min(1,gap*1.2)*(f.syllabusBad?1:0.5), evidence:`সপ্তাহে ${f.sessions}টা ক্লাস, দলের মাঝামাঝি ${f.cohortSessions}টা`,
      counter:f.syllabusBad?'':'সিলেবাস তো পিছিয়ে নেই — কম ক্লাস এখনো সমস্যা হয়নি', check:'ক্লাস বাড়ানো কি সম্ভব, নাকি ক্লাসের মান বাড়ালেই হবে?'});
  }
  if(f.syllabusBad) F.push({key:'syl', score:f.syllabusBad>=2?0.9:0.6, evidence:`ডেডলাইনের কাজ সময়ের তুলনায় বেশি${f.perClass?` (প্রতি ক্লাসে ${f.perClass} অধ্যায় লাগবে)`:''}`,
      counter:'হতে পারে ডেডলাইনটাই বেশি আঁটসাঁট ছিল — ছাত্রের দোষ নয়', check:'ডেডলাইনটা কি আদৌ বাস্তবসম্মত ছিল?'});
  if(f.dueMonths>=1) F.push({key:'pay', score:Math.min(1,0.4+0.25*f.dueMonths), evidence:`${f.dueMonths} মাসের ফি বাকি`, counter:'ফি দেরি মানেই অনাগ্রহ নয় — পরিবারের আর্থিক চাপও হতে পারে', check:'ফির কথা ভদ্রভাবে তুলেছ, নাকি এড়িয়ে গেছ?'});
  if(f.daysSinceSeen!=null && f.daysSinceSeen>=14) F.push({key:'silent', score:Math.min(1,f.daysSinceSeen/30), evidence:`${f.daysSinceSeen} দিন ধরে ক্লাস হয়নি`, counter:'ছুটি, পরীক্ষা বা অসুস্থতা হতে পারে', check:'শেষবার কবে যোগাযোগ হয়েছে?'});
  F.sort((a,b)=>b.score-a.score);
  const causes=F.filter(x=>x.score>=0.25).slice(0,3), points=(f.recentMarked||0)+(f.hwN||0);
  const confidence=points<6?'low':((causes[0]&&causes[0].score>=0.6&&(!causes[1]||causes[0].score-causes[1].score>=0.2))?'high':'medium');
  return {causes:causes.map(c=>Object.assign({},c,{score:Math.round(c.score*100)/100})), confidence, points};
}
/* pure: মোটা অনুমান — আগে থেকেই ঝুঁকিতে থাকা ছাত্রের ফি বাড়ালে ছাড়ার সম্ভাবনা বেশি */
function dcLeaveProb(score, raisePct){ return Math.min(0.9, Math.max(0,score)/100*0.4 + Math.min(0.5, Math.max(0,raisePct)/100*0.8)); }
/* pure: "কী হলে কী?" — radarCompute দুবার (আগে/পরে) চালিয়ে তফাত।
   act: {type:'raise',name,by} | {type:'drop',name} | {type:'add',fee,slots} */
function dcSim(slots, cellOf, feeOf, o, act, leaveScore){
  const base=radarCompute(slots,cellOf,feeOf,o);
  let cell2=cellOf, fee2=feeOf, used=0;
  if(act.type==='raise') fee2=n=>n===act.name?(Number(feeOf(n))||0)+act.by:feeOf(n);
  else if(act.type==='drop') cell2=(s,d)=>String(cellOf(s,d)||'').split(',').map(x=>x.trim()).filter(x=>x&&x!==act.name).join(', ');
  else if(act.type==='add'){ const free=base.free.slice(0,Math.max(1,act.slots||1)); used=free.length; const key=new Set(free.map(x=>x.num+'|'+x.day)); cell2=(s,d)=>key.has(s.num+'|'+d)?'__নতুন':cellOf(s,d); fee2=n=>n==='__নতুন'?act.fee:feeOf(n); }
  const after=radarCompute(slots,cell2,fee2,o), r={before:{income:base.income,hrs:base.busyHrs,avg:base.avg}, after:{income:after.income,hrs:after.busyHrs,avg:after.avg}, dIncome:after.income-base.income, dHours:after.busyHrs-base.busyHrs, dAvg:after.avg-base.avg, used};
  const me=base.rows.find(x=>x.name===act.name);
  if(act.type==='raise'){ const fee0=Number(feeOf(act.name))||0, newFee=fee0+act.by, pct=fee0>0?act.by/fee0*100:0, p=dcLeaveProb(leaveScore||0,pct);
    r.fee0=fee0; r.newFee=newFee; r.raisePct=pct; r.p=p; r.expected=(1-p)*newFee-fee0; r.breakEven=newFee>0?act.by/newFee:0; }
  if(act.type==='drop'){ r.fee0=Number(feeOf(act.name))||0; r.freedHrs=Math.max(0,-r.dHours); r.recover=Math.round(base.avg*r.freedHrs); r.myRate=me?me.rate:0; r.avgRate=base.avg; r.myPct=me?me.pct:0; }
  return r;
}
function dcFeatures(name, cohort){
  const f=churnFeatures(name,cohort.ix), sf=(sfAll().find(x=>x.name===name))||{}, first=(sf.items||[])[0]||{};
  f.syllabusBad=(sf.status==='behind'||sf.status==='overdue')?2:(sf.status==='risk'?1:0); f.perClass=first.perClass?toBn(first.perClass.toFixed(2)):'';
  f.sessions=cohort.sessions[name]||0; f.cohortSessions=cohort.medSess; f.cohortAbsRate=cohort.medAbs; return f;
}
function dcCohort(){
  const names=getAllKnownNames(), sess={}, abs=[], ix=smIndex();
  SCHEDULE.forEach(s=>DAYS.forEach(d=>getCellText(s,d).split(',').map(x=>x.trim()).filter(Boolean).forEach(n=>{ sess[n]=(sess[n]||0)+1; })));
  names.forEach(n=>{ try{ const f=churnFeatures(n,ix); if(f.recentMarked>=3) abs.push(f.recentAbsent/f.recentMarked); }catch(e){} });
  const med=a=>{ if(!a.length) return null; const s=a.slice().sort((x,y)=>x-y), m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
  return {sessions:sess, medSess:med(Object.values(sess)), medAbs:med(abs), ix};
}
let dcSt={name:'', act:''};
const DC_LABEL={abs:'অনুপস্থিতি',hw:'হোমওয়ার্ক',load:'ক্লাসের সংখ্যা',syl:'সিলেবাসের চাপ',pay:'ফি/আর্থিক চাপ',silent:'যোগাযোগ বিচ্ছিন্ন'};
function dcBody(){
  const names=getAllKnownNames().slice().sort((a,b)=>a.localeCompare(b));
  if(!names.length) return `<div id="dcBox">${emptyState({icon:'chart',title:'এখনো কোনো ছাত্র নেই',body:'শিডিউলে ছাত্র বসালে এখানে বিশ্লেষণ পাবে।'})}</div>`;
  const flagged={}; try{ churnAll().forEach(x=>{ if(x.band==='high'||x.band==='medium') flagged[x.name]=x.band; }); sfAll().forEach(s=>{ if(s.status==='behind'||s.status==='overdue') flagged[s.name]=flagged[s.name]||'syl'; }); }catch(e){}
  if(!dcSt.name||!names.includes(dcSt.name)) dcSt.name=Object.keys(flagged)[0]||names[0];
  const cohort=dcCohort(), f=dcFeatures(dcSt.name,cohort), why=dcWhy(f), hid=isFinanceHidden();
  if(hid) why.causes=why.causes.map(c=>c.key==='pay'?Object.assign({},c,{evidence:'আর্থিক কারণ — আনলক করলে দেখা যাবে',counter:'',check:''}):c);
  const conf={high:['🟢','বেশ নিশ্চিত'],medium:['🟡','আংশিক নিশ্চিত'],low:['🔴','তথ্য কম — অনুমান মাত্র']}[why.confidence];
  const opts=names.sort((a,b)=>(flagged[b]?1:0)-(flagged[a]?1:0)||a.localeCompare(b)).map(n=>`<option value="${escapeHtml(n)}"${n===dcSt.name?' selected':''}>${flagged[n]?'⚠️ ':''}${escapeHtml(n)}</option>`).join('');
  const whyHtml=why.causes.length?why.causes.map((c,i)=>`<div class="dc-cause"><div class="dc-ct"><span>${i+1}. ${DC_LABEL[c.key]}</span><i><u style="width:${Math.round(c.score*100)}%"></u></i></div><div class="dc-ev">📊 ${escapeHtml(smBn(c.evidence))}</div>${c.counter?`<div class="dc-co">⚖️ <b>বিপরীত দিক:</b> ${escapeHtml(smBn(c.counter))}</div>`:''}${c.check?`<div class="dc-ck">❓ ${escapeHtml(c.check)}</div>`:''}</div>`).join(''):`<div class="sm-hint">এই ছাত্রের মধ্যে উল্লেখযোগ্য কোনো সতর্ক সংকেত পাওয়া যায়নি 👍</div>`;
  let sim=''; if(hid) sim=`<div class="sm-hint">🙈 আর্থিক হিসাব লুকানো — "কী হলে কী?" দেখতে আনলক করো।</div>`; else sim=dcSimHtml();
  return `<div id="dcBox"><select class="kh-in" onchange="dcPick(this.value)">${opts}</select>
    <div class="rd-sec">🔍 কেন এমন হচ্ছে? <small style="color:var(--muted);font-weight:400">${conf[0]} ${conf[1]}</small></div>${whyHtml}
    <div class="dc-unk">🌫️ <b>অ্যাপ যা জানে না:</b> ছাত্রের নিজের মনের অবস্থা, বাড়ির পরিস্থিতি, স্কুলের চাপ। ওপরের কারণগুলো সম্ভাবনা মাত্র — ছাত্র বা অভিভাবকের সঙ্গে কথা বলে নিশ্চিত হও, তারপর সিদ্ধান্ত নাও।</div>
    <div class="rd-sec">🔮 কী হলে কী হবে?</div>${sim}</div>`;
}
function dcSimHtml(){
  const name=dcSt.name, fee=getStudentPayment(name).monthlyFee||0, chips=[['r100','ফি +৳১০০'],['r500','ফি +৳৫০০'],['r10','ফি +১০%'],['drop','ছেড়ে দিলে'],['add1','নতুন ছাত্র (১ স্লট)'],['add2','নতুন ছাত্র (২ স্লট)']];
  const bar=`<div class="dc-chips">${chips.map(([k,l])=>`<button type="button" class="pct-chip${dcSt.act===k?' active':''}" onclick="dcAct('${k}')">${l}</button>`).join('')}</div>`;
  if(!dcSt.act) return bar+`<div class="sm-hint">একটা বেছে নাও — দেখাব আয়, সময় আর ঘণ্টা-প্রতি আয় কীভাবে বদলায়, সঙ্গে ঝুঁকিটাও।</div>`;
  const rd=radarData(), perSlot=rd.perSlot||0, k=dcSt.act, A=(k==='r100')?{type:'raise',name,by:100}:(k==='r500')?{type:'raise',name,by:500}:(k==='r10')?{type:'raise',name,by:Math.max(50,Math.round(fee*0.1/50)*50)}:(k==='drop')?{type:'drop',name}:{type:'add',fee:perSlot*(k==='add2'?2:1),slots:k==='add2'?2:1};
  if(A.type==='raise' && !(fee>0)) return bar+`<div class="sm-hint">${escapeHtml(name)}-এর মাসিক ফি দেওয়া নেই, তাই ফি বাড়ানোর হিসাব হবে না।</div>`;
  let leave=0; try{ leave=churnScore(churnFeatures(name)).score; }catch(e){}
  const r=dcSim(SCHEDULE,getCellText,n=>getStudentPayment(n).monthlyFee,{travel:radarTravel(),days:DAYS},A,leave), sg=x=>(x>=0?'+':'−')+bnTaka(Math.abs(x)), hh=x=>toBn(Math.abs(x).toFixed(1))+' ঘণ্টা';
  let h=`<div class="dc-res"><div class="dc-grid"><div><small>মাসিক আয়</small><b>${bnTaka(r.before.income)} → ${bnTaka(r.after.income)}</b><em class="${r.dIncome>=0?'up':'dn'}">${sg(r.dIncome)}</em></div><div><small>মাসে কাজের সময়</small><b>${toBn(r.before.hrs.toFixed(0))} → ${toBn(r.after.hrs.toFixed(0))} ঘণ্টা</b><em>${r.dHours>=0?'+':'−'}${hh(r.dHours)}</em></div><div><small>ঘণ্টা-প্রতি আয়</small><b>${bnTaka(r.before.avg)} → ${bnTaka(r.after.avg)}</b><em class="${r.dAvg>=0?'up':'dn'}">${sg(r.dAvg)}</em></div></div>`;
  if(A.type==='raise'){
    h+=`<div class="dc-note">⚖️ <b>ঝুঁকির হিসাব (মোটা অনুমান):</b> ফি ${toBn(Math.round(r.raisePct))}% বাড়ালে ${escapeHtml(name)}-এর ছেড়ে দেওয়ার সম্ভাবনা ≈ ${toBn(Math.round(r.p*100))}%। প্রত্যাশিত ফল: <b class="${r.expected>=0?'up':'dn'}">${sg(r.expected)}</b>। ছাড়ার সম্ভাবনা <b>${toBn(Math.round(r.breakEven*100))}%</b>-এর কম মনে হলে বাড়ানো লাভজনক।</div>
      <div class="dc-note">🔄 <b>বিপরীত যুক্তি:</b> ছেড়ে গেলে শুধু ${bnTaka(r.fee0)} নয়, নতুন ছাত্র পেতে সময়ও লাগে। আবার না বাড়ালে সময়ের তুলনায় এই ছাত্র থেকে আয় কমই থাকবে।</div>`;
  } else if(A.type==='drop'){
    h+=`<div class="dc-note">⚖️ ${escapeHtml(name)}-এর ঘণ্টা-প্রতি আয় ${bnTaka(r.myRate)} (গড় ${bnTaka(r.avgRate)})। ছাড়লে ${hh(r.freedHrs)} ফাঁকা হয়; সেই সময়ে গড় হারে একজন পেলে ≈ ${bnTaka(r.recover)} ফেরত আসে।</div>
      <div class="dc-note">🔄 <b>সাবধান:</b> এটা শুধু টাকা-সময়ের হিসাব। ছাত্রের ভবিষ্যৎ, সম্পর্ক, নতুন ছাত্র পাওয়ার নিশ্চয়তা — কিছুই এতে নেই।</div>`;
  } else {
    h+=`<div class="dc-note">⚖️ ${toBn(r.used)}টা ফাঁকা স্লটে ফি ≈ ${bnTaka(A.fee)} ধরে হিসাব। ${r.dAvg<0?'ঘণ্টা-প্রতি আয় <b class="dn">কমবে</b> — মানে এই ফিতে নতুন ছাত্র নিলে তুমি আগের চেয়ে কম হারে খাটবে; ফি আরেকটু বেশি চাওয়ার কথা ভাবো।':'ঘণ্টা-প্রতি আয় <b class="up">বাড়বে</b> — ভালো সুযোগ।'}</div>
      <div class="dc-note">🔄 <b>বিপরীত যুক্তি:</b> ফাঁকা সময় মানেই বিনামূল্যের সময় নয় — বিশ্রাম, নিজের পড়াশোনা, ছাত্রদের জন্য প্রস্তুতিও লাগে।</div>`;
  }
  return bar+h+`<div class="rd-foot">সংখ্যাগুলো তোমার শিডিউল ও ফি থেকে আসল হিসাব; "ছাড়ার সম্ভাবনা" একটা মোটা অনুমান (ঝুঁকি-স্কোর আর বাড়ানোর হারের ওপর), নিখুঁত ভবিষ্যদ্বাণী নয়।</div></div>`;
}
function dcRefresh(){ const b=document.getElementById('khataModalBody'); if(b&&b.querySelector('#dcBox')){ const y=b.scrollTop; b.innerHTML=dcBody(); b.scrollTop=y; } }
function dcPick(n){ dcSt.name=n; dcSt.act=''; dcRefresh(); }
function dcAct(k){ dcSt.act=(dcSt.act===k)?'':k; dcRefresh(); }
function dcOpen(){ dcSt.act=''; showKhataModal('🧠 সিদ্ধান্ত-সহকারী', dcBody()); }

/* ======================= 💭 চিন্তা-শক্তি (ছাত্রদের জন্য) ======================= */
/* ক্লাসের টপিক থেকে ৬ স্তরের প্রশ্ন (মনে রাখা → বোঝা → প্রয়োগ → বিশ্লেষণ → মূল্যায়ন → সৃষ্টি)। ছাত্রের সাড়া লিখে রাখলে স্তর নিজে ওপরে/নিচে যায়। */
const THK_LEVELS=[{n:1,name:'স্মরণ',icon:'🧠'},{n:2,name:'বোঝা',icon:'💡'},{n:3,name:'প্রয়োগ',icon:'🛠️'},{n:4,name:'বিশ্লেষণ',icon:'🔬'},{n:5,name:'মূল্যায়ন',icon:'⚖️'},{n:6,name:'সৃষ্টি',icon:'🚀'}];
const THK_T={
  1:['"{t}"-এর মূল কথাটা কী — এক লাইনে বলো।','"{t}" থেকে সবচেয়ে জরুরি তিনটা শব্দ বা সূত্র কী কী?','বই না দেখে বলো — "{t}"-এ কোন কোন ধাপ আছে?'],
  2:['"{t}" নিজের ভাষায় বুঝিয়ে বলো, যেন ছোট ভাই-বোন বুঝতে পারে।','"{t}" আর আগের পড়া কোন জায়গায় মেলে?','"{t}"-এর একটা নিজের মতো উদাহরণ বা ছবি বলো।'],
  3:['রোজকার জীবনের একটা সমস্যা "{t}" দিয়ে কীভাবে সমাধান করবে?','"{t}" ব্যবহার করে একটা সম্পূর্ণ নতুন উদাহরণ বানাও।','"{t}" কোন কোন জায়গায় কাজে লাগে — তিনটা বলো।'],
  4:['"{t}" কেন এভাবে কাজ করে? কারণটা ধাপে ধাপে বলো।','"{t}"-এর কোন অংশটা বাদ দিলে পুরোটা ভেঙে পড়ে?','"{t}" আর এর কাছাকাছি একটা বিষয়ের মিল ও অমিল কী?'],
  5:['"{t}" নিয়ে মানুষের একটা সাধারণ ভুল ধারণা কী? কেন ভুল?','কোন অবস্থায় "{t}"-এর পদ্ধতি কাজ করবে না? একটা বিপরীত উদাহরণ দাও।','"{t}" সমাধানের দুটো উপায়ের কোনটা ভালো — যুক্তি দিয়ে বেছে নাও।'],
  6:['"{t}" নিয়ে নিজে একটা কঠিন প্রশ্ন বানাও, আর তার উত্তরও দাও।','"{t}" অন্যকে শেখানোর জন্য ৩ মিনিটের একটা ছোট পাঠ সাজাও।','যদি নিয়মটা বদলে যায়, "{t}" তখন কেমন হবে? নতুন নিয়ম বানিয়ে দেখাও।']
};
const THK_SUBJ=[
  [/গণিত|math|অঙ্ক|হিসাব/i,{4:['এই নিয়মটা কেন সত্যি? একটা প্রমাণ বা যুক্তি দাও।'],5:['একটা সংখ্যা বসিয়ে যাচাই করো — কোন ক্ষেত্রে নিয়মটা ভেঙে যায়?'],3:['একটা শব্দ-সমস্যা বানাও যার সমাধান এই নিয়মে হয়।']}],
  [/বিজ্ঞান|science|পদার্থ|রসায়ন|জীব/i,{4:['এটা না ঘটলে কী হতো?'],5:['কীভাবে পরীক্ষা করে দেখবে দাবিটা ঠিক কি না?'],3:['ঘরে বসে এটা দেখানোর মতো একটা ছোট পরীক্ষা ভাবো।']}],
  [/ইংরেজি|english|বাংলা|ভাষা|ব্যাকরণ/i,{4:['বাক্যটা অন্যভাবে লিখলে মানে কীভাবে বদলায়?'],5:['দুটো শব্দের কোনটা এখানে বেশি মানানসই — কেন?'],6:['এই নিয়ম ব্যবহার করে নিজের একটা ছোট অনুচ্ছেদ লেখো।']}],
  [/সমাজ|ইতিহাস|ভূগোল|history|geography|ধর্ম/i,{4:['এর পেছনের কারণ কী ছিল? ফলাফল কী হলো?'],5:['এর পক্ষে একটা আর বিপক্ষে একটা যুক্তি দাও।'],6:['তুমি সেখানে থাকলে কী সিদ্ধান্ত নিতে?']}]
];
const THK_SOCRATIC=['তুমি কেন এটা মনে করছ?','এর বিপরীত কোনো উদাহরণ আছে?','কীভাবে নিশ্চিত হবে যে এটা ঠিক?','আরেকটু খুলে বলো — "এটা" বলতে কী বোঝাচ্ছ?','এটা না হলে কী হতো?','আর কোনো উপায়ে করা যায় কি?'];
/* pure (unit-tested) */
function thkQuestions(topic, subject, level, seed){
  const t=(String(topic||'').trim())||'আজকের পড়া', lv=Math.max(1,Math.min(6,level|0||1)); let arr=(THK_T[lv]||[]).slice();
  THK_SUBJ.forEach(([re,m])=>{ if(re.test(subject||'') && m[lv]) arr=arr.concat(m[lv]); });
  const rot=arr.length?Math.abs(seed|0)%arr.length:0, rotated=arr.slice(rot).concat(arr.slice(0,rot));
  return rotated.slice(0,3).map(q=>q.replace(/\{t\}/g,t));
}
/* pure: স্তর = অগ্রগতি দেখে শুরু; তারপর শিক্ষকের লেখা সাড়া (১ আটকে গেল · ২ ঠিকঠাক · ৩ দারুণ) দেখে ওঠা-নামা */
function thkNextLevel(log, progress){
  const base=progress>=80?5:(progress>=60?4:(progress>=30?3:2)), L=(log||[]).slice(-6);
  if(!L.length) return {level:base, why:`অগ্রগতি ${Math.round(progress||0)}% দেখে শুরু`};
  const lv=L[L.length-1].level, last2=L.slice(-2).filter(x=>x.level===lv);
  if(last2.length===2 && last2.every(x=>x.rating===3)) return {level:Math.min(6,lv+1), why:'টানা দুবার দারুণ করেছে — এক ধাপ ওপরে'};
  if(last2.length===2 && last2.every(x=>x.rating===1)) return {level:Math.max(1,lv-1), why:'টানা দুবার আটকে গেছে — এক ধাপ নিচে'};
  return {level:lv, why:'এই স্তরে আরও একটু অনুশীলন'};
}
const THK_KEY='tr_thinkLog';
function thkLog(){ return lsGet(THK_KEY,{}); }
function thkProgress(name){ let t=0,c=0; const p=getProgressData()[name]||{}; Object.keys(p).forEach(s=>(p[s]||[]).forEach(x=>{ t+=Number(x.pct)||0; c++; })); return c?t/c:0; }
function thkDefaults(name){
  const p=getProgressData()[name]||{}; let subject='', topic='';
  Object.keys(p).some(s=>{ const ch=(p[s]||[]).find(x=>(Number(x.pct)||0)<100); if(ch){ subject=s; topic=ch.chapter||''; return true; } return false; });
  return {subject, topic};
}
let thkSt={name:'', topic:'', subject:'', level:0, seed:0, touched:false};
function thkBody(){
  const names=getAllKnownNames().slice().sort((a,b)=>a.localeCompare(b));
  if(!names.length) return `<div id="thkBox">${emptyState({icon:'chart',title:'এখনো কোনো ছাত্র নেই',body:'শিডিউলে ছাত্র বসালে এখানে চিন্তা-শক্তির প্রশ্ন বানাতে পারবে।'})}</div>`;
  if(!thkSt.name||!names.includes(thkSt.name)){ thkSt.name=names[0]; thkSt.touched=false; }
  const log=thkLog()[thkSt.name]||[], prog=thkProgress(thkSt.name), sug=thkNextLevel(log,prog), d=thkDefaults(thkSt.name);
  if(!thkSt.touched){ thkSt.topic=d.topic; thkSt.subject=d.subject; }
  const lv=thkSt.level||sug.level, qs=thkQuestions(thkSt.topic,thkSt.subject,lv,thkSt.seed), t=(thkSt.topic||'').trim()||'আজকের পড়া';
  const hist=log.slice(-8).map(x=>`<i class="thk-dot r${x.rating}" title="স্তর ${x.level}"></i>`).join('');
  const ladder=THK_LEVELS.map(L=>`<button type="button" class="thk-step${L.n===lv?' on':''}${L.n===sug.level?' sug':''}" onclick="thkLevel(${L.n})"><span>${L.icon}</span><b>${toBn(L.n)}</b><small>${L.name}</small></button>`).join('');
  const nm=names.map(n=>`<option value="${escapeHtml(n)}"${n===thkSt.name?' selected':''}>${escapeHtml(n)}</option>`).join('');
  const all=names.map(n=>{ const l=thkLog()[n]||[], s=thkNextLevel(l,thkProgress(n)); return `<div class="thk-row" onclick="thkPick('${jsq(n)}')"><span>${escapeHtml(n)}</span><em>${THK_LEVELS[s.level-1].icon} স্তর ${toBn(s.level)} · ${THK_LEVELS[s.level-1].name}</em></div>`; }).join('');
  return `<div id="thkBox"><select class="kh-in" onchange="thkPick(this.value)">${nm}</select>
    <div class="thk-two"><input class="kh-in" id="thk_topic" placeholder="টপিক / অধ্যায়" value="${escapeHtml(thkSt.topic)}" onchange="thkField('topic',this.value)"><input class="kh-in" id="thk_subj" placeholder="বিষয়" value="${escapeHtml(thkSt.subject)}" onchange="thkField('subject',this.value)"></div>
    <div class="rd-sec">🪜 চিন্তা-সিঁড়ি <small style="color:var(--muted);font-weight:400">— ${escapeHtml(sug.why)}</small></div>
    <div class="thk-ladder">${ladder}</div><div class="thk-hist">${hist?`সাম্প্রতিক সাড়া: ${hist}`:''}</div>
    <div class="rd-sec">❓ আজকের প্রশ্ন (স্তর ${toBn(lv)} · ${THK_LEVELS[lv-1].name}) <button type="button" class="pct-chip" onclick="thkShuffle()">🔀 অন্য প্রশ্ন</button></div>
    ${qs.map((q,i)=>`<div class="thk-q"><b>${toBn(i+1)}.</b> ${escapeHtml(q)}</div>`).join('')}
    <div class="thk-tip"><b>🗣️ উত্তর দেওয়ার পর জিজ্ঞেস করো:</b>${THK_SOCRATIC.slice(0,4).map(s=>`<div>• ${s}</div>`).join('')}</div>
    <div class="thk-tip"><b>🕵️ ভুল ধরার খেলা:</b><div>আজ ইচ্ছে করে "${escapeHtml(t)}" নিয়ে একটা ভুল কথা বলো — ও ধরতে পারে কি না দেখো। ধরলে জিজ্ঞেস করো: "তুমি কীভাবে নিশ্চিত হলে?"</div></div>
    <div class="rd-sec">📝 ছাত্র কেমন সাড়া দিল?</div>
    <div class="thk-rate"><button type="button" onclick="thkRate(1)">😕<span>আটকে গেল</span></button><button type="button" onclick="thkRate(2)">🙂<span>ঠিকঠাক</span></button><button type="button" onclick="thkRate(3)">🤩<span>দারুণ যুক্তি দিল</span></button></div>
    <button type="button" class="settings-btn" onclick="thkParentMsg()">📩 অভিভাবককে "আজকের ভাবনার প্রশ্ন" পাঠাও</button>
    <div class="rd-sec">👥 সবার চিন্তা-স্তর</div><div class="thk-all">${all}</div>
    <div class="rd-foot">প্রশ্নগুলো শিক্ষাবিজ্ঞানের ৬ ধাপের (স্মরণ থেকে সৃষ্টি) নিয়মে সাজানো টেমপ্লেট — টপিক বসিয়ে তৈরি হয়। ছাত্রের উত্তর যাচাই তুমিই করবে; অ্যাপ শুধু কোন স্তরে ঠেলতে হবে তা মনে রাখে।</div></div>`;
}
function thkRefresh(){ const b=document.getElementById('khataModalBody'); if(b&&b.querySelector('#thkBox')){ const y=b.scrollTop; b.innerHTML=thkBody(); b.scrollTop=y; } }
function thkPick(n){ thkSt.name=n; thkSt.level=0; thkSt.touched=false; thkSt.seed=0; thkRefresh(); }
function thkField(k,v){ thkSt[k]=v; thkSt.touched=true; thkRefresh(); }
function thkLevel(n){ thkSt.level=n; thkRefresh(); }
function thkShuffle(){ thkSt.seed=(thkSt.seed||0)+1; thkRefresh(); }
function thkCurLevel(){ const l=thkLog()[thkSt.name]||[]; return thkSt.level||thkNextLevel(l,thkProgress(thkSt.name)).level; }
function thkRate(r){
  const all=thkLog(), arr=all[thkSt.name]||[], lv=thkCurLevel();
  arr.push({d:dateKeyStr(todayDateOnly()), topic:(thkSt.topic||'').slice(0,60), level:lv, rating:r}); all[thkSt.name]=arr.slice(-60); lsSet(THK_KEY,all);
  thkSt.level=0; thkSt.seed=0; showSuccessToast(r===3?'দারুণ! এই ধাপ মনে রাখলাম 🚀':(r===1?'ঠিক আছে, পরের বার সহজ ধাপে যাব':'সাড়া লেখা হয়েছে')); thkRefresh();
}
function thkParentMsg(){
  const pr=getStudentProfile(thkSt.name), lv=thkCurLevel(), q=thkQuestions(thkSt.topic,thkSt.subject,lv,thkSt.seed)[0], g=(pr.guardianName||'').trim(), tn=getTeacherName(false);
  smMsgPage(thkSt.name, `আসসালামু আলাইকুম${g?', '+g:''}।\nআজ ${thkSt.name}-কে একটা ভাবনার প্রশ্ন দিয়েছি:\n"${q}"\nবাসায় ওকে নিজের মতো করে উত্তর দিতে দিন, আর মাঝে "কেন?" জিজ্ঞেস করুন — সঠিক উত্তরের চেয়ে ভাবার চেষ্টাটাই আসল।\nধন্যবাদ।${tn?'\n— '+tn:''}`);
}
function thkOpen(){ thkSt.level=0; thkSt.seed=0; thkSt.touched=false; showKhataModal('💭 চিন্তা-শক্তি', thkBody()); }
