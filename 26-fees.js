/* ============ V74 — ফি সমন্বয়, বাতিল-যোগ্য পেমেন্ট, হিসাব-মেলানো, রুটিনের সংঘর্ষ ও অনুপস্থিতির ধারা ============ */
/* নিয়ম (পরিকল্পনা §৫): বকেয়া = নির্ধারিত ফি + অনুমোদিত অতিরিক্ত চার্জ − ছাড়/সমন্বয় − সফল পেমেন্ট। হিসাবের সূত্র একটাই (feeEffective, js/02-payments.js)। */
/* চার্জ/ছাড় আর পেমেন্ট আলাদা রেকর্ড; মোছার বদলে বাতিল (void) — ইতিহাস থাকে, ফিরিয়ে আনা যায়। tr_adjust: [{id,student,monthKey,kind:'charge'|'discount',amount,reason,date,at,voided?}] */

/* ---------- pure (unit-tested) ---------- */
function feeStatementPure(fee, adjs, paid){
  fee=Number(fee)||0; paid=Number(paid)||0; let charges=0, discounts=0;
  (adjs||[]).forEach(a=>{ if(!a||a.voided) return; const x=Number(a.amount)||0; if(a.kind==='discount') discounts+=x; else charges+=x; });
  const gross=fee+charges-discounts, eff=Math.max(0,gross);
  return {scheduled:fee, charges, discounts, effective:eff, paid, due:Math.max(0,eff-paid), overpaid:Math.max(0,paid-eff), clamped:gross<0};
}
function feeAdjValidate(a){
  if(!a.student) return 'শিক্ষার্থী বাছো।'; if(!/^\d{4}-\d{2}$/.test(a.monthKey||'')) return 'মাস ঠিক নেই।';
  if(a.kind!=='charge' && a.kind!=='discount') return 'ছাড় না অতিরিক্ত চার্জ — বাছো।';
  if(!(Number(a.amount)>0)) return 'টাকার পরিমাণ ০-এর বেশি লেখো।'; if(Number(a.amount)>1000000) return 'টাকার অংকটা অস্বাভাবিক বড়।';
  if(!String(a.reason||'').trim()) return 'কারণ লেখো (পরে হিসাব মেলাতে লাগবে)।'; return '';
}
/* পরপর কতগুলো ক্লাস অনুপস্থিত (সর্বশেষ থেকে পিছনে)। বাতিল/পিছানো/ছুটি-নেওয়া এবং বন্ধের দিন গোনা হয় না, ধারাও ভাঙে না। isOff(dateKey, slotNum) ঐচ্ছিক। */
function absenceStreakOf(att, name, isOff){
  const rows=[]; Object.keys(att||{}).forEach(k=>{ const p=k.split('|'); if(p.slice(2).join('|')!==name) return; rows.push({date:p[0], slot:Number(p[1])||0, st:att[k]}); });
  rows.sort((a,b)=> a.date<b.date?1:a.date>b.date?-1:(b.slot-a.slot));
  let n=0;
  for(const r of rows){
    if(r.st==='cancelled'||r.st==='resched'||r.st==='excused') continue;
    if(isOff && isOff(r.date, r.slot)) continue;
    if(r.st==='absent'){ n++; continue; }
    break;
  }
  return n;
}
/* সরানো/মেকআপের সময়ের সংঘর্ষ: info={name, slotLabel, here:[নাম…], slotOff, dayOff} → {level:'ok'|'warn'|'block', reasons[]} */
function routineConflictFrom(info){
  const reasons=[]; let level='ok'; const here=(info.here||[]), others=here.filter(n=>n!==info.name);
  if(here.includes(info.name)){ level='block'; reasons.push(`${info.name}-এর ওই সময়ে (${info.slotLabel||''}) আগে থেকেই ক্লাস আছে — একই ছাত্রের দুটো ক্লাস একই সময়ে রাখা যায় না।`); }
  if(info.dayOff){ if(level==='ok') level='warn'; reasons.push('ওই দিনটা পুরো বন্ধ/ছুটি হিসেবে চিহ্নিত।'); }
  else if(info.slotOff){ if(level==='ok') level='warn'; reasons.push('ওই দিনে এই সময়টা বন্ধ চিহ্নিত।'); }
  if(others.length && level!=='block'){ level='warn'; reasons.push(`ওই সময়ে আরও ${others.length} জনের ক্লাস আছে: ${others.slice(0,4).join(', ')}${others.length>4?'…':''}।`); }
  return {level, reasons};
}

/* ---------- app wrappers ---------- */
function feeAdjList(){ const l=lsGet('tr_adjust',[]); return Array.isArray(l)?l:[]; }
function feeStatement(name, mk){ return feeStatementPure(getStudentPayment(name).monthlyFee, feeAdjList().filter(a=>a.student===name&&a.monthKey===mk), getStudentPaidForMonth(name, mk)); }
function feeAdjAdd(a){
  const err=feeAdjValidate(a); if(err) return {ok:false, error:err};
  const list=feeAdjList(), rec={id:Date.now()+'_'+Math.random().toString(36).slice(2,7), student:a.student, monthKey:a.monthKey, kind:a.kind, amount:Math.round(Number(a.amount)*100)/100, reason:String(a.reason).trim(), date:dateKeyStr(todayDateOnly()), at:Date.now()};
  list.push(rec); if(!lsSet('tr_adjust',list)) return {ok:false, error:'সেভ হয়নি — স্টোরেজ ভরা থাকতে পারে।'}; return {ok:true, id:rec.id};
}
function feeAdjSetVoid(id, voided){ const list=feeAdjList(), a=list.find(x=>x.id===id); if(!a) return false; if(voided){ a.voided=true; a.voidedAt=Date.now(); } else { delete a.voided; delete a.voidedAt; } lsSet('tr_adjust',list); return true; }
function routineCheckMove(date, toSlotNum, name){
  const slot=SCHEDULE.find(s=>s.num===toSlotNum); if(!slot) return {level:'ok', reasons:[]};
  const dow=DAYS[(date.getDay()+1)%7], here=(effectiveContentForDate(slot, dow, date)||'').split(',').map(x=>x.trim()).filter(Boolean);
  return routineConflictFrom({name, slotLabel:slot.label, here, slotOff:isOffOn(date,toSlotNum), dayOff:isDayFullyOff(date)});
}
function computeAbsenceStreaks(n){
  const att=getAttendanceMap(), off=getOffMap(), isOff=(d,s)=>{ const i=off[d]; return i==='all'||(Array.isArray(i)&&i.includes(s)); }, out=[];
  getAllKnownNames().forEach(name=>{ const st=absenceStreakOf(att,name,isOff); if(st>=(n||3)) out.push({name, streak:st}); });
  return out.sort((a,b)=>b.streak-a.streak);
}
/* হিসাব মেলানো — প্রতিটা শিক্ষার্থীর হিসাব নতুন করে গুণে, আলাদা জায়গার (রিপোর্টের) মোটের সঙ্গে মেলায়। */
function feeCheck(mk){
  const names=[...new Set([...getAllKnownNames(), ...Object.keys(getPaymentsData())])], adj=feeAdjList(), issues=[], rows=[];
  const T={scheduled:0,charges:0,discounts:0,expected:0,collected:0,due:0,overpaid:0}, known=new Set(getAllKnownNames());
  names.forEach(n=>{
    const st=feeStatementPure(getStudentPayment(n).monthlyFee, adj.filter(a=>a.student===n&&a.monthKey===mk), getStudentPaidForMonth(n,mk));
    rows.push(Object.assign({name:n},st)); T.scheduled+=st.scheduled; T.charges+=st.charges; T.discounts+=st.discounts; T.expected+=st.effective; T.collected+=st.paid; T.due+=st.due; T.overpaid+=st.overpaid;
    if(st.clamped) issues.push({level:'warn', text:`"${n}"-এর ছাড় ফির চেয়ে বেশি — প্রদেয় ০ ধরা হয়েছে।`});
    if(st.overpaid>0) issues.push({level:'info', text:`"${n}" ${bnTaka(st.overpaid)} বেশি দিয়েছেন (অগ্রিম/সমন্বয়ের কথা ভাবো)।`});
    const rec=getStudentPayment(n), seen={}, refs={};
    rec.payments.forEach(p=>{
      if(!(Number(p.amount)>0)) issues.push({level:'error', text:`"${n}"-এর একটা পেমেন্টের অংক ঠিক নেই।`});
      if(p.ref){ if(refs[p.ref]) issues.push({level:'error', text:`"${n}"-এ একই ট্রানজ্যাকশন (${p.ref}) দুবার আছে।`}); refs[p.ref]=1; }
      if(p.monthKey===mk){ const k=[p.amount,p.method||'',p.date||''].join('|'); if(seen[k]) issues.push({level:'warn', text:`"${n}"-এ একই দিনে একই টাকা ও পদ্ধতির পেমেন্ট একাধিক (${bnTaka(p.amount)}) — ডুপ্লিকেট কি না দেখো।`}); seen[k]=1; }
    });
    if(!known.has(n) && rec.payments.length) issues.push({level:'info', text:`"${n}" এখন তালিকায় নেই, কিন্তু পেমেন্ট রেকর্ড আছে।`});
  });
  const stats=computeMonthlyIncomeStats(mk);
  if(Math.round(stats.totalExpected)!==Math.round(T.expected)) issues.push({level:'error', text:`প্রত্যাশিত আয় মিলছে না: রিপোর্টে ${bnTaka(stats.totalExpected)}, নতুন হিসাবে ${bnTaka(T.expected)}।`});
  if(Math.round(stats.totalPaid)!==Math.round(T.collected)) issues.push({level:'error', text:`আদায় মিলছে না: রিপোর্টে ${bnTaka(stats.totalPaid)}, নতুন হিসাবে ${bnTaka(T.collected)}।`});
  return {mk, rows, totals:T, issues, ok:!issues.some(i=>i.level==='error')};
}

/* ---------- screen ---------- */
let fee={student:'', mk:'', kind:'discount', check:null};
function feeOpen(){
  if(isFinanceHidden()){ showWarningToast('আগে আর্থিক হিসাব আনলক করো (রিপোর্ট ট্যাবের উপরে "দেখাও")।'); return; }
  if(!fee.mk) fee.mk=currentMonthKey(); const names=getAllKnownNames(); if(!fee.student||!names.includes(fee.student)) fee.student=names[0]||''; fee.check=null;
  showKhataModal('🧾 ফি ও হাজিরা','<div id="feeBox"></div>'); feeRender();
}
function feeSet(k,v){ fee[k]=v; fee.check=null; feeRender(); }
function feeRender(){
  const box=document.getElementById('feeBox'); if(!box) return; if(!fee.student){ box.innerHTML=emptyState({icon:'chart',title:'কোনো শিক্ষার্থী নেই',body:'আগে শিক্ষার্থী যোগ করো।'}); return; }
  const E=escapeHtml, n=fee.student, mk=fee.mk, st=feeStatement(n,mk), adj=feeAdjList().filter(a=>a.student===n&&a.monthKey===mk), pays=getStudentPayment(n).payments.filter(p=>p.monthKey===mk), voided=(getStudentPayment(n).voided||[]).filter(p=>p.monthKey===mk||true).slice(-6).reverse();
  const row=(l,v,cls)=>`<div class="makeup-row"><span>${l}</span><span class="pay-history-amt" ${cls?`style="color:${cls}"`:''}>${bnTaka(v)}</span></div>`;
  box.innerHTML=`<div class="qp-grid"><div><label class="sm-field-label">শিক্ষার্থী</label><select class="sm-field-input" onchange="feeSet('student',this.value)">${getAllKnownNames().map(x=>`<option value="${E(x)}"${x===n?' selected':''}>${E(studentDisplayName(x))}</option>`).join('')}</select></div>
   <div><label class="sm-field-label">মাস</label><select class="sm-field-input" onchange="feeSet('mk',this.value)">${resMonthOpts().map(m=>`<option value="${m}"${m===mk?' selected':''}>${E(monthKeyLabel(m))}</option>`).join('')}</select></div></div>
  <div class="settings-section-title" style="margin-top:12px;">হিসাব</div>
  ${row('নির্ধারিত ফি',st.scheduled)}${st.charges?row('+ অতিরিক্ত চার্জ',st.charges):''}${st.discounts?row('− ছাড়/সমন্বয়',st.discounts):''}${row('= এই মাসে প্রদেয়',st.effective)}${row('পরিশোধ',st.paid,'#5ef2c8')}${row('বকেয়া',st.due,st.due>0?'#ff9d8a':'#5ef2c8')}${st.overpaid?row('অতিরিক্ত জমা',st.overpaid):''}
  <div class="settings-section-title" style="margin-top:12px;">ছাড় / অতিরিক্ত চার্জ যোগ</div>
  <div class="pct-chip-row">${[['discount','ছাড়/সমন্বয়'],['charge','অতিরিক্ত চার্জ']].map(([k,l])=>`<button type="button" class="pct-chip${fee.kind===k?' active':''}" onclick="fee.kind='${k}';feeRender()">${l}</button>`).join('')}</div>
  <div class="qp-grid"><div><label class="sm-field-label">টাকা</label><input type="number" min="1" class="sm-field-input" id="fa_amt"></div><div><label class="sm-field-label">কারণ (বাধ্যতামূলক)</label><input class="sm-field-input" id="fa_reason" placeholder="যেমন ভাই-বোন ছাড়"></div></div>
  <div class="qp-actions"><button type="button" class="modal-btn primary" onclick="feeAddAdj()">যোগ করো</button></div>
  ${adj.length?adj.map(a=>`<div class="makeup-row" ${a.voided?'style="opacity:.55;text-decoration:line-through;"':''}><span>${a.kind==='discount'?'− ছাড়':'+ চার্জ'} · ${E(a.reason)}</span><span class="pay-history-amt">${bnTaka(a.amount)} <button class="makeup-done" onclick="feeVoidAdj('${a.id}',${a.voided?'false':'true'})">${a.voided?'↩ ফিরিয়ে আনো':'বাতিল'}</button></span></div>`).join(''):''}
  <div class="settings-section-title" style="margin-top:12px;">এই মাসের পেমেন্ট</div>
  ${pays.length?pays.map(p=>`<div class="makeup-row"><span>${p.no?'রসিদ #'+toBn(p.no)+' · ':''}${E(p.method||'নগদ')} · ${bnDateLabel(new Date((p.date||dateKeyStr(todayDateOnly()))+'T00:00:00'))}${p.ref?' · '+E(p.ref):''}</span><span class="pay-history-amt">${bnTaka(p.amount)} <button class="makeup-done" onclick="feeRevPay('${p.id}')">রিভার্স</button></span></div>`).join(''):'<div class="ins-empty">এই মাসে কোনো পেমেন্ট নেই।</div>'}
  ${voided.length?`<div class="qp-note-small">বাতিল হওয়া পেমেন্ট (হিসাবে ধরা হয় না):</div>${voided.map(p=>`<div class="makeup-row" style="opacity:.7;"><span>${E(monthKeyLabel(p.monthKey==='opening'?currentMonthKey():p.monthKey))} · ${E(p.voidReason||'কারণ লেখা নেই')}</span><span class="pay-history-amt">${bnTaka(p.amount)} <button class="makeup-done" onclick="feeRestorePay('${p.id}')">↩ ফিরিয়ে আনো</button></span></div>`).join('')}`:''}
  <div class="settings-section-title" style="margin-top:14px;">🔍 হিসাব মিলিয়ে দেখো (${E(monthKeyLabel(mk))})</div>
  <div class="qp-actions"><button type="button" class="modal-btn secondary" onclick="feeRunCheck()">সব শিক্ষার্থীর হিসাব যাচাই</button></div>${fee.check?feeCheckHtml(fee.check):''}
  <div class="settings-section-title" style="margin-top:14px;">📅 রুটিন ও হাজিরা</div>${feeRoutineHtml()}`;
}
function feeAddAdj(){
  const r=feeAdjAdd({student:fee.student, monthKey:fee.mk, kind:fee.kind, amount:document.getElementById('fa_amt').value, reason:document.getElementById('fa_reason').value});
  if(!r.ok){ showWarningToast(r.error); return; } showSuccessToast('যোগ হয়েছে'); fee.check=null; feeRender(); if(typeof refreshFinanceViews==='function') refreshFinanceViews();
}
function feeVoidAdj(id, v){ feeAdjSetVoid(id, v); fee.check=null; feeRender(); if(typeof refreshFinanceViews==='function') refreshFinanceViews(); showUndoToast(v?'বাতিল করা হয়েছে':'ফিরিয়ে আনা হয়েছে', ()=>{ feeAdjSetVoid(id, !v); feeRender(); if(typeof refreshFinanceViews==='function') refreshFinanceViews(); }); }
function feeRevPay(id){ const reason=prompt('রিভার্সের কারণ (যেমন: ভুল এন্ট্রি / ফেরত দেওয়া হয়েছে):',''); if(reason===null) return; deletePayment(fee.student, id, reason); fee.check=null; feeRender(); if(typeof refreshFinanceViews==='function') refreshFinanceViews(); showUndoToast('পেমেন্ট রিভার্স হয়েছে', ()=>{ restorePayment(fee.student,id); feeRender(); if(typeof refreshFinanceViews==='function') refreshFinanceViews(); }); }
function feeRestorePay(id){ if(restorePayment(fee.student,id)){ showSuccessToast('পেমেন্ট ফিরে এসেছে'); fee.check=null; feeRender(); if(typeof refreshFinanceViews==='function') refreshFinanceViews(); } }
function feeRunCheck(){ fee.check=feeCheck(fee.mk); feeRender(); }
function feeCheckHtml(c){
  const T=c.totals, E=escapeHtml;
  return `<div class="qp-gate ${c.ok?'ok':'bad'}">${c.ok?'✅ হিসাব মিলেছে':'⛔ অমিল পাওয়া গেছে'} — প্রত্যাশিত ${bnTaka(T.expected)} · আদায় ${bnTaka(T.collected)} · বকেয়া ${bnTaka(T.due)}${T.discounts?` · ছাড় ${bnTaka(T.discounts)}`:''}${T.charges?` · অতিরিক্ত চার্জ ${bnTaka(T.charges)}`:''}</div>`
   + c.issues.map(i=>`<div class="qp-iss ${i.level==='error'?'error':'warn'}">${i.level==='error'?'⛔':i.level==='warn'?'⚠️':'ℹ️'} ${E(i.text)}</div>`).join('');
}
function feeRoutineHtml(){
  const E=escapeHtml, st=computeAbsenceStreaks(3), pend=getMakeups(), hist=getMakeupHistory().slice(-5).reverse();
  return (st.length?st.map(x=>`<div class="makeup-row"><span>🔴 ${E(studentDisplayName(x.name))}</span><span class="pay-history-amt">পরপর ${toBn(x.streak)}টা ক্লাস অনুপস্থিত</span></div>`).join(''):'<div class="ins-empty">কেউ পরপর ৩টা ক্লাস অনুপস্থিত নয় ✅ (বাতিল/ছুটি/পিছানো গোনা হয় না)</div>')
   + `<div class="qp-note-small" style="margin-top:8px;">বাকি মেকআপ: ${toBn(pend.length)}টা · হয়ে গেছে (ইতিহাস): ${toBn(getMakeupHistory().length)}টা</div>`
   + hist.map(m=>`<div class="makeup-row" style="opacity:.75;"><span>✓ ${E(m.name)} — ${E(m.slotLabel||'')}</span><span class="pay-history-amt">${bnDateLabel(new Date(m.date+'T00:00:00'))}</span></div>`).join('');
}
