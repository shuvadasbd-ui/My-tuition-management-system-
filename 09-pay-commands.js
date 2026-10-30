/* ============ ONE-LINE PAYMENT COMMANDS: "রিমি ১৫০০ বিকাশ", "সাকিব পুরো ফি", "রিমি ২০০ আগের বকেয়া" ============ */
const PAY_WORDS = /টাকা|ফি|পেমেন্ট|জমা|দিয়েছে|দিল|দিলো|পেলাম|পেয়েছি|বেতন|৳|\btk\b|taka/i;
const PAY_METHOD_WORDS = [[/বিকাশ|bkash/i,'বিকাশ'],[/ব্যাংক|bank/i,'ব্যাংক'],[/রকেট|rocket/i,'অন্যান্য'],[/ক্যাশ|cash|নগদ/i,'নগদ']];
const MONTH_NAMES = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
/* ---- Spoken amounts: "এক হাজার পাঁচশো", "দেড় হাজার", "সাড়ে তিন হাজার", "পনেরো শ" -> digits (only used when the text has no digits at all) ---- */
const BN_NUM_WORDS = 'এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আটাশ ঊনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ ঊনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ ঊনপঞ্চাশ পঞ্চাশ একান্ন বায়ান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন ঊনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি ঊনসত্তর সত্তর একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর ঊনআশি আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি অষ্টাশি ঊননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই'.split(' ');
function bnWordsToDigits(text){
  const norm=(w)=>w.normalize('NFD');
  const map={}; BN_NUM_WORDS.forEach((w,i)=>{ map[norm(w)]=i+1; });
  const MULT={[norm('হাজার')]:1000, [norm('লাখ')]:100000, [norm('লক্ষ')]:100000};
  const HUND=[norm('শো'),norm('শত'),norm('শ')];
  const toks=norm(text).split(/\s+/).filter(Boolean), out=[];
  for(let i=0;i<toks.length;){
    let total=0, cur=0, half=0, saw=false, j=i;
    for(; j<toks.length; j++){
      const t=toks[j].replace(/[,।.]+$/,'');
      if(map[t]!==undefined){ cur+=map[t]+half; half=0; saw=true; }
      else if(t===norm('দেড়')||t===norm('দেড')){ cur=1.5; saw=true; }
      else if(t===norm('আড়াই')){ cur=2.5; saw=true; }
      else if(t===norm('সাড়ে')){ half=0.5; }
      else if(MULT[t]!==undefined && saw){ total+=(cur||1)*MULT[t]; cur=0; }
      else if(HUND.includes(t) && saw){ cur=(cur||1)*100; }
      else { const m=HUND.map(h=>t.endsWith(h)?t.slice(0,t.length-h.length):null).find(p=>p && map[p]!==undefined);
        if(m){ cur+=map[m]*100; saw=true; } else break; }
    }
    if(saw && j>i && (total+cur)>0){ out.push(String(Math.round(total+cur))); i=j; } else { out.push(toks[i]); i++; }
  }
  return out.join(' ');
}
function extractAmount(text){
  if(!/[0-9০-৯]/.test(text)) text=bnWordsToDigits(text);
  let t=bnDigitsToLatin(text).replace(/(\d),(?=\d{3})/g,'$1');
  t=t.replace(/\d+(?:\.\d+)?\s*(?:টা(?!কা)|টায়|ঘটিকা|মিনিট|তারিখ)/g,' ');   // clock times / dates are not money
  let m=t.match(/(\d+(?:\.\d+)?)\s*(?:হাজার|k\b)/i); if(m) return Math.round(parseFloat(m[1])*1000);
  m=t.match(/(\d+(?:\.\d+)?)\s*(?:শত|শো|শ)(?![\u0980-\u09FF])/); if(m) return Math.round(parseFloat(m[1])*100);
  m=t.match(/\d+(?:\.\d+)?/); return m ? Math.round(parseFloat(m[0])) : 0;
}
function parsePaymentCommand(text){
  const name=findNameInText(text); if(!name) return null;
  const methodHit=PAY_METHOD_WORDS.find(([re])=>re.test(text));
  const opening = /আগের বকেয়া|পুরোনো বকেয়া|পুরনো বকেয়া|জের/.test(text);
  const strong = !!methodHit || PAY_WORDS.test(text) || (opening && extractAmount(text)>0);   // "রিমি ২০০ আগের বকেয়া" has no other money word
  const full = /পুরো|ফুল|সম্পূর্ণ/.test(text) && /ফি|টাকা|পেমেন্ট|বেতন|বকেয়া/.test(text);
  if(!strong && !full) return null;
  if(/বাতিল|ছুটি/.test(text) && !strong) return null;                 // that is a schedule command, not money
  if(isFinanceHidden()) return {ok:false, msg:'টাকার কমান্ডের জন্য আগে Reports ট্যাবে গিয়ে ফাইন্যান্স আনলক করো।'};
  const cur=currentMonthKey(), now=new Date();
  let monthKey=cur;
  MONTH_NAMES.forEach((mn,idx)=>{ if(text.includes(mn)){ monthKey=`${idx>now.getMonth()?now.getFullYear()-1:now.getFullYear()}-${String(idx+1).padStart(2,'0')}`; } });
  const pay=getStudentPayment(name);
  let amount=extractAmount(text);
  if(full && !amount) amount = opening ? (pay.openingBalance||0) : getStudentDueForMonth(name, monthKey);
  if(!(amount>0)) return {ok:false, msg:full ? `${name}-এর ওই হিসাবে কোনো বকেয়া নেই।` : 'কত টাকা বুঝতে পারিনি। যেমন লেখো: "রিমি ১৫০০ বিকাশ"।'};
  if(amount>1000000) return {ok:false, msg:'টাকার অংকটা অস্বাভাবিক বড় লাগছে — আবার ঠিক করে লেখো।'};
  const method = methodHit ? methodHit[1] : 'নগদ';
  const after = opening ? Math.max(0,(pay.openingBalance||0)-amount) : Math.max(0, getStudentDueForMonth(name, monthKey)-amount);
  return {ok:true, action:'pay', name, amount, method, monthKey, opening, after};
}
function cmdReceiptWA(name,id){ openReceipt(id,name); receiptSendWA(); }
function cmdUndoPay(name,id){ deletePayment(name,id); clearCommandResult(); renderAll(); showSuccessToast('পেমেন্টটা মুছে ফেলা হয়েছে'); }
function executePayCommand(r){
  const before=new Set(getStudentPayment(r.name).payments.map(p=>p.id));
  addPayment(r.name, r.amount, r.monthKey, r.note||'', r.opening, r.method);
  if(r.learnPhone) rememberPayPhone(r.name, r.learnPhone);
  const p=getStudentPayment(r.name).payments.find(x=>!before.has(x.id));
  clearCommandResult();
  document.getElementById('cmdInput').value='';
  renderAll();
  const q=jsq(r.name);
  document.getElementById('cmdResult').innerHTML = p ? `<div class="cmd-msg cmd-confirm">✅ ${escapeHtml(r.name)}-এর ${bnTaka(r.amount)} (${escapeHtml(r.method)}) জমা হয়েছে।</div>
    <div class="cmd-actions"><button class="modal-btn secondary" onclick="cmdUndoPay('${q}','${p.id}')">আন্ডু</button><button class="modal-btn secondary" onclick="openReceipt('${p.id}','${q}')">🧾 রসিদ</button><button class="modal-btn primary" onclick="cmdReceiptWA('${q}','${p.id}')">WhatsApp-এ পাঠাও</button></div>` : '';
}
/* ---- Voice input (Chrome's built-in speech recognition, Bangla). Where it is missing, the phone keyboard's own mic works in every box. ---- */
let voiceRec=null;
function startVoice(inputId, opts){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ showWarningToast('এই ব্রাউজারে ভয়েস ইনপুট নেই — কিবোর্ডের 🎤 বাটন ব্যবহার করো।'); return; }
  if(voiceRec){ try{ voiceRec.stop(); }catch(e){} return; }
  const input=document.getElementById(inputId); if(!input) return;
  const rec=new SR(); rec.lang='bn-BD'; rec.interimResults=false; rec.maxAlternatives=1;
  const btns=document.querySelectorAll(`[data-mic="${inputId}"]`); btns.forEach(b=>b.classList.add('listening'));
  rec.onresult=e=>{
    const t=(e.results[0][0].transcript||'').trim(); if(!t) return;
    input.value = (opts && opts.append && input.value) ? input.value+' '+t : t;
    input.dispatchEvent(new Event('change'));
    if(opts && opts.submit) submitCommand();
  };
  rec.onerror=ev=>showWarningToast(ev.error==='not-allowed' ? 'মাইক ব্যবহারের অনুমতি দাও।' : 'শুনতে পারিনি, আবার চেষ্টা করো।');
  rec.onend=()=>{ voiceRec=null; btns.forEach(b=>b.classList.remove('listening')); };
  voiceRec=rec; try{ rec.start(); }catch(e){ voiceRec=null; btns.forEach(b=>b.classList.remove('listening')); }
}
function parseCommand(text){
  const smsCmd = parseSmsCommand(text); if(smsCmd) return smsCmd;
  const khCmd = parseKhataCommand(text); if(khCmd) return khCmd;
  const payCmd = parsePaymentCommand(text); if(payCmd) return payCmd;
  const noteCmd = parseNoteCommandFull(text); if(noteCmd) return noteCmd;
  const name = findNameInText(text);
  if(!name) return {ok:false, msg:'কোনো চেনা নাম খুঁজে পাইনি। ছাত্রের নাম দিয়ে আবার লেখো।'};
  const {date, label:dateLabel} = parseCommandDate(text);
  const timeSlots = findTimeSlotsInText(text);
  const isCancel = /বাতিল|ছুটি/.test(text) && timeSlots.length===0;

  const dow = DAYS[(date.getDay()+1)%7];
  const currentSlot = SCHEDULE.find(s => getCellText(s,dow).split(',').map(x=>x.trim()).includes(name) && !isOffOn(date,s.num) && !getMoveFrom(date,s.num));
  if(!currentSlot) return {ok:false, msg:`${dateLabel} ${name}-এর কোনো ক্লাস খুঁজে পাইনি।`};

  if(isCancel) return {ok:true, action:'off', name, date, dateLabel, slot:currentSlot};
  if(timeSlots.length===1){
    if(timeSlots[0].num===currentSlot.num) return {ok:false, msg:`${name}-এর ক্লাস তো ইতিমধ্যে ঐ সময়েই আছে।`};
    return {ok:true, action:'move', name, date, dateLabel, fromSlot:currentSlot, toSlot:timeSlots[0]};
  }
  if(timeSlots.length>1) return {ok:false, msg:'কোন সময়ে বোঝাতে চেয়েছ ঠিক বুঝিনি — নিচে থেকে বেছে নাও:', options:timeSlots, name, date, dateLabel, fromSlot:currentSlot};
  return {ok:false, msg:'কী করতে চাইছ ঠিক বুঝিনি। যেমন লিখতে পারো: "সাকিরাকে আজ সাড়ে ৯টায় নাও", "সাকিরাকে দুপুরের স্লটে নাও", বা "সাকিরার আজকের ক্লাস বাতিল"।'};
}

let pendingCommand=null, lastCommandResult=null;
function submitCommand(){
  const input=document.getElementById('cmdInput');
  const text=input.value.trim();
  if(!text) return;
  renderCommandResult(parseCommand(text));
}
function renderCommandResult(result){
  const box=document.getElementById('cmdResult');
  pendingCommand=null; lastCommandResult=null;
  if(!result.ok){
    let extra='';
    if(result.options){
      pendingCommand=result;
      extra='<div class="cmd-opts">'+result.options.map(s=>`<button class="move-opt-btn" onclick="resolveAmbiguousCommand('${s.num}')"><span class="mo-time">${s.label}</span></button>`).join('')+'</div>';
    }
    box.innerHTML = `<div class="cmd-msg cmd-error">❓ ${escapeHtml(result.msg)}</div>${extra}`;
    return;
  }
  lastCommandResult=result;
  if(result.action==='khata'){
    lastCommandResult=result;
    const line = result.mode==='daily' ? `${result.kind==='in'?'💰 আয়':'🧾 খরচ'}: <b>${enTaka(result.amount)}</b> · ${escapeHtml(result.cat)}${result.note?' · '+escapeHtml(result.note):''}` : `📒 <b>${escapeHtml(result.person)}</b> — ${KH_TYPES[result.type].label} <b>${enTaka(result.amount)}</b>`;
    box.innerHTML=`<div class="cmd-msg cmd-confirm">${line} — খাতায় লিখব?</div><div class="cmd-actions"><button class="modal-btn secondary" onclick="clearCommandResult()">বাতিল</button><button class="modal-btn primary" onclick="executeCommandFromLast()">হ্যাঁ, লেখো</button></div>`;
    return;
  }
  if(result.action==='smsPick'){
    const sm=result.sms;
    box.innerHTML=`<div class="cmd-msg cmd-confirm">📩 ${escapeHtml(sm.wallet)} থেকে <b>${bnTaka(sm.amount)}</b> এসেছে (${escapeHtml(sm.phone)}) — এই নম্বর কার? একবার বেছে দিলে পরের বার থেকে নিজে চিনবে।</div>
      <div class="cmd-opts">${getAllKnownNames().map(n=>`<button class="move-opt-btn" onclick="smsChoose('${jsq(n)}')"><span class="mo-time">${escapeHtml(n)}</span></button>`).join('')}</div>`;
    return;
  }
  if(result.action==='note'){
    lastCommandResult=result;
    box.innerHTML=`<div class="cmd-msg cmd-confirm">📝 <b>${escapeHtml(result.name)}</b> · ${escapeHtml(result.subject||'বিষয় ঠিক করা নেই')} · ${result.slot.label}
      ${result.taught?`<div>📚 ${escapeHtml(result.taught)}</div>`:''}${result.homework?`<div>📌 ${escapeHtml(result.homework)}</div>`:''}${result.nextPlan?`<div>🎯 ${escapeHtml(result.nextPlan)}</div>`:''}
      ${result.finishName?`<div>🏁 "${escapeHtml(result.finishName)}" অধ্যায় ১০০% শেষ হিসেবে চিহ্নিত হবে</div>`:''}
      <div style="opacity:.7;font-size:11.5px;margin-top:4px;">উপস্থিত ধরে সেভ হবে — ঠিক আছে?</div></div>
      <div class="cmd-actions"><button class="modal-btn secondary" onclick="clearCommandResult()">বাতিল</button><button class="modal-btn primary" onclick="executeCommandFromLast()">হ্যাঁ, সেভ করো</button></div>`;
    return;
  }
  const desc = result.action==='pay'
    ? `<b>${escapeHtml(result.name)}</b>-এর <b>${bnTaka(result.amount)}</b> (${escapeHtml(result.method)}${result.note?' · '+escapeHtml(result.note):''}) — ${result.opening?'আগের বকেয়া':escapeHtml(monthKeyLabel(result.monthKey))+'-এর ফি'} হিসেবে জমা করব। জমার পর ${result.opening?'আগের বকেয়া':'ওই মাসের'} বাকি থাকবে ${bnTaka(result.after)}`
    : result.action==='off'
    ? `${result.dateLabel} <b>${escapeHtml(result.name)}</b>-এর <b>${result.slot.label}</b> ক্লাস বাতিল করব`
    : `${result.dateLabel} <b>${escapeHtml(result.name)}</b>-কে <b>${result.fromSlot.label}</b> থেকে <b>${result.toSlot.label}</b>-এ নেব`;
  box.innerHTML = `<div class="cmd-msg cmd-confirm">✅ ${desc} — ঠিক আছে?</div>
    <div class="cmd-actions"><button class="modal-btn secondary" onclick="clearCommandResult()">বাতিল</button><button class="modal-btn primary" onclick="executeCommandFromLast()">হ্যাঁ, করো</button></div>`;
}
function resolveAmbiguousCommand(slotNum){
  if(!pendingCommand) return;
  const toSlot=SCHEDULE.find(s=>s.num===slotNum);
  renderCommandResult({ok:true, action:'move', name:pendingCommand.name, date:pendingCommand.date, dateLabel:pendingCommand.dateLabel, fromSlot:pendingCommand.fromSlot, toSlot});
}
function executeCommandFromLast(){
  if(!lastCommandResult) return;
  const r=lastCommandResult;
  if(r.action==='pay'){ executePayCommand(r); return; }
  if(r.action==='khata'){ executeKhataCommand(r); return; }
  if(r.action==='note'){ executeNoteCommand(r); return; }
  if(r.action==='off'){
    toggleSlotOff(r.date, r.slot.num);
    if(confirm(`"${r.name}"-এর এই ক্লাসটা কি পরে পুষিয়ে দিতে হবে?`)) addMakeup(r.date, r.slot.num, r.name);
  } else if(r.action==='move'){
    createMove(r.date, r.fromSlot.num, r.toSlot.num, r.name);
  }
  clearCommandResult();
  document.getElementById('cmdInput').value='';
  renderDayView(); renderNextPanel(); renderFocusCard(); renderInsights(); renderWeekLoad();
}
function clearCommandResult(){ const box=document.getElementById('cmdResult'); if(box) box.innerHTML=''; pendingCommand=null; lastCommandResult=null; }

/* ---- Move-to-another-slot modal ---- */
let moveModalCtx=null;
let renameModalCtx=null;
function openRenameModal(slotNum){
  const slot = SCHEDULE.find(s=>s.num===slotNum);
  if(!slot) return;
  const current = getCellText(slot, activeDay);
  renameModalCtx = {slotNum};
  document.getElementById('renameModalTitle').innerHTML = `<span class="ic">${ICN.pencil}</span> ${escapeHtml(slot.label)} — কে থাকবে?`;
  document.getElementById('renameInput').value = current;
  document.getElementById('renameModal').style.display='flex';
  setTimeout(()=>document.getElementById('renameInput').focus(), 50);
}
function closeRenameModal(){ document.getElementById('renameModal').style.display='none'; renameModalCtx=null; }
function saveRenameModal(){
  if(!renameModalCtx) return;
  const slot = SCHEDULE.find(s=>s.num===renameModalCtx.slotNum);
  if(slot) setCellText(slot, activeDay, document.getElementById('renameInput').value);
  closeRenameModal();
  renderDayView(); renderWeekTable(); renderTodayList();
}

/* ---- Add a brand-new student: pick a name + which day/slot(s) they attend, writes straight into the schedule ---- */
function openAddStudentModal(){
  document.getElementById('newStudentName').value='';
  const rows = DAYS.map(d=>{
    const opts = SCHEDULE.map(s=>`<option value="${s.num}">${s.label}</option>`).join('');
    return `<div class="add-day-row">
      <span class="add-day-lb">${DAY_BN[d]}</span>
      <select class="sm-field-input" id="newStu_${d}">
        <option value="">— কোনো ক্লাস না —</option>
        ${opts}
      </select>
    </div>`;
  }).join('');
  document.getElementById('newStudentDayRows').innerHTML = rows;
  document.getElementById('addStudentModal').style.display='flex';
  setTimeout(()=>document.getElementById('newStudentName').focus(), 50);
}
function closeAddStudentModal(){ document.getElementById('addStudentModal').style.display='none'; }
function saveNewStudent(){
  const name = document.getElementById('newStudentName').value.trim();
  if(!name){ showWarningToast('আগে নামটা লেখো।'); return; }
  if(!validStudentName(name)){ showWarningToast('নামে কমা (,) থাকা যাবে না।'); return; }
  if(getAllKnownNames().includes(name)){
    if(!confirm(`"${name}" নামে ইতিমধ্যে একজন শিক্ষার্থী আছে। তবুও এগিয়ে যাবে?`)) return;
  } else {
    const nearMatch = closestNameIfTypo(name);
    if(nearMatch && !confirm(`"${nearMatch}" নামে প্রায় একই রকম একজন ইতিমধ্যে আছে। এটা কি ভিন্ন কেউ, নাকি বানান ভুল হয়েছে?\n\nসত্যিই নতুন হলে "ঠিক আছে" চাপো, নাহলে "বাতিল" চেপে নামটা ঠিক করো।`)) return;
  }
  let any=false;
  DAYS.forEach(d=>{
    const sel = document.getElementById('newStu_'+d);
    const slotNum = sel ? sel.value : '';
    if(!slotNum) return;
    const slot = SCHEDULE.find(s=>s.num===slotNum);
    if(!slot) return;
    const parts = getCellText(slot, d).split(',').map(s=>s.trim()).filter(Boolean);
    if(!parts.includes(name)){ parts.push(name); setCellText(slot, d, parts.join(', ')); }
    any=true;
  });
  if(!any){ showWarningToast('অন্তত একটা দিনে ক্লাসের সময় বাছাই করো।'); return; }
  closeAddStudentModal();
  renderStudentsTab(); renderWeekTable(); renderDayView(); renderTodayList();
  openStudentModal(name);
}

/* ============ "ক্লাস শেষ" quick wrap-up: attendance + subject + what was taught + homework, one tap each ============ */
/* After a class's end time, Home shows ONE card for the earliest class that still has un-marked students. */
/* Everyone defaults to present (tap only the exceptions); subject is remembered from the last note; the   */
/* chapter box suggests this student's saved chapters. One Save writes attendance + notes + subject list.  */
const WRAP_HW_PRESETS=['অনুশীলনী','পড়া মুখস্থ','হাতের লেখা','নেই'];
function lastSubjectFor(name){
  const notes=getNotes(), keys=Object.keys(notes).sort().reverse();
  for(const k of keys){
    const n=notes[k];
    if(n && Array.isArray(n.entries)){
      const e=n.entries.slice().reverse().find(x=>x.student===name && x.subject);
      if(e) return e.subject;
    }
  }
  return Object.keys(getStudentSubjects(name))[0] || '';
}
/* Replace this student's entry for the same subject (so re-saving never duplicates), keep everyone else's. */
function mergeWrapEntry(entries, student, subject, taught, homework, nextPlan){
  const prev=(entries||[]).find(e=>e.student===student && e.subject===subject);
  const out=(entries||[]).filter(e=>!(e.student===student && e.subject===subject));
  out.push({student, subject, taught, homework, nextPlan:nextPlan||'', ...(prev && prev.hwStatus ? {hwStatus:prev.hwStatus} : {})});
  return out;
}
function pendingWrapSlots(){
  const today=todayKey(), d=todayDateOnly(), nm=nowMinutes(), skip=lsGet('tr_wrapSkip',{}), out=[];
  SCHEDULE.forEach(slot=>{
    if(slot.end>nm) return;
    const val=effectiveContentForDate(slot,today,d).trim(); if(!val) return;
    if(skip[dateKeyStr(d)+'|'+slot.num]) return;
    const names=val.split(',').map(x=>x.trim()).filter(Boolean);
    if(names.some(n=>!getAttendance(d,slot.num,n))) out.push({slot,names});
  });
  return out;
}
let wrapCtx=null;
function chapterOptions(name, subject){
  const list=(getStudentSubjects(name)[subject]||[]);
  return list.filter(c=>(c.pct||0)<100).slice(0,12).map(c=>`<option value="${escapeHtml(c.chapter)}">`).join('');
}
function renderWrapUpBox(){
  const el=document.getElementById('wrapUpBox'); if(!el) return;
  const list=pendingWrapSlots();
  if(!list.length){ el.innerHTML=''; el.dataset.key=''; wrapCtx=null; return; }
  const {slot,names}=list[0];
  const key=slot.num+'|'+names.join(',');
  if(el.dataset.key===key && el.innerHTML) return;       // keep what the teacher has typed; clock ticks must not wipe it
  el.dataset.key=key; wrapCtx={slotNum:slot.num, names};
  const rows=names.map((n,i)=>{
    const sub=lastSubjectFor(n);
    return `<div class="wu-stu" id="wu_row_${i}" data-status="present">
      <div class="wu-head"><span class="wu-name">${escapeHtml(n)}</span>
        <div class="wu-st">
          <button type="button" class="wu-chip on" data-s="present" onclick="wuStatus(${i},'present')">উপস্থিত</button>
          <button type="button" class="wu-chip" data-s="late" onclick="wuStatus(${i},'late')">দেরি</button>
          <button type="button" class="wu-chip" data-s="absent" onclick="wuStatus(${i},'absent')">অনুপস্থিত</button>
        </div></div>
      <div class="wu-fields">
        <div class="wu-row2">
          <input id="wu_sub_${i}" list="wu_subs_${i}" value="${escapeHtml(sub)}" placeholder="বিষয়" onchange="wuSubjectChanged(${i})">
          <input id="wu_tau_${i}" list="wu_ch_${i}" placeholder="কী পড়ালে? (অধ্যায়/টপিক)">
        </div>
        <div id="wu_smart_${i}">${wuSmartHtml(i,n,sub)}</div>
        <datalist id="wu_subs_${i}">${Object.keys(getStudentSubjects(n)).map(x=>`<option value="${escapeHtml(x)}">`).join('')}</datalist>
        <datalist id="wu_ch_${i}">${chapterOptions(n, sub)}</datalist>
        <input id="wu_hw_${i}" placeholder="হোমওয়ার্ক">
        <div class="wu-presets">${WRAP_HW_PRESETS.map(p=>`<button type="button" class="wu-chip" onclick="wuHw(${i},'${p}')">${p}</button>`).join('')}<button type="button" class="wu-chip wu-mic" data-mic="wu_tau_${i}" onclick="startVoice('wu_tau_${i}',{append:true})">🎤 পড়ানো</button><button type="button" class="wu-chip wu-mic" data-mic="wu_hw_${i}" onclick="startVoice('wu_hw_${i}',{append:true})">🎤 হোমওয়ার্ক</button></div>
        <div id="wu_extra_${i}"></div>
        <button type="button" class="wu-chip wu-addsub" onclick="wuAddSubject(${i})">➕ আরেকটা বিষয় যোগ করো</button>
      </div></div>`;
  }).join('');
  el.innerHTML=`<div class="wu-card collapsed" id="wuCard">
    <div class="wu-title" role="button" tabindex="0" onclick="toggleWrapCard()" onkeydown="if(event.key==='Enter')toggleWrapCard()"><span>✅ ক্লাস শেষ — ${slot.label}<small class="wu-sub">${toBn(names.length)} জন · লিখতে ট্যাপ করো</small></span><span class="wu-right">${list.length>1?`<span class="wu-more">আরও ${toBn(list.length-1)}টা বাকি</span>`:''}<span class="wu-chev">▾</span></span></div>
    ${rows}
    <div class="wu-actions">
      <button type="button" class="wu-save" onclick="wuSave()">সেভ করো</button>
      ${names.length>1?`<button type="button" class="wu-ghost" onclick="wuCopyFirst()">১ম জনের মতো সবাইকে</button>`:''}
      <button type="button" class="wu-ghost" onclick="wuSkip()">বাদ দাও</button>
    </div></div>`;
}
function toggleWrapCard(){ const c=document.getElementById('wuCard'); if(c) c.classList.toggle('collapsed'); }
function wuSmartHtml(i, name, sub){
  let h='';
  const sg=smartSuggestion(name, sub);
  if(sg) h+=`<div class="wu-presets"><button type="button" class="wu-chip" onclick="wuUseSuggestion(${i},this)" data-text="${escapeHtml(sg.text)}">💡 ${sg.label}: ${escapeHtml(sg.text)}</button></div>`;
  const last=lastEntryFor(name, sub);
  if(last && (last.entry.taught||last.entry.homework)){
    h+=`<div class="wu-presets"><button type="button" class="wu-chip" onclick="wuRepeatLast(${i},this)" data-t="${escapeHtml(last.entry.taught||'')}" data-h="${escapeHtml(last.entry.homework||'')}">🔁 গতবারের মতোই</button></div>`;
  }
  if(last && last.entry.homework && !last.entry.hwStatus){
    h+=`<div class="wu-hwq">গতবারের হোমওয়ার্ক "${escapeHtml(last.entry.homework)}" — করেছে?</div><div class="wu-presets">`+
      [['done','✓ করেছে'],['partial','½ আংশিক'],['none','✗ করেনি']].map(([k,l])=>`<button type="button" class="wu-chip wu-hwc" data-k="${k}" onclick="wuHwStatus(${i},'${k}',this)">${l}</button>`).join('')+`</div>`;
  }
  return h;
}
function wuRepeatLast(i,btn){
  const t=document.getElementById('wu_tau_'+i), h=document.getElementById('wu_hw_'+i);
  if(t && btn.dataset.t) t.value=btn.dataset.t;
  if(h && btn.dataset.h) h.value=btn.dataset.h;
}
function wuUseSuggestion(i,btn){ const el=document.getElementById('wu_tau_'+i); if(el) el.value=btn.dataset.text; }
function wuHwStatus(i,k,btn){
  const row=document.getElementById('wu_row_'+i); if(!row) return;
  row.dataset.hw = row.dataset.hw===k ? '' : k;
  row.querySelectorAll('.wu-hwc').forEach(b=>b.classList.toggle('on', b.dataset.k===row.dataset.hw));
}
function wuStatus(i,st){
  const row=document.getElementById('wu_row_'+i); if(!row) return;
  row.dataset.status=st;
  row.querySelectorAll('.wu-st .wu-chip').forEach(b=>b.classList.toggle('on', b.dataset.s===st));
}
function wuSubjectChanged(i){
  if(!wrapCtx) return;
  const dl=document.getElementById('wu_ch_'+i), sub=document.getElementById('wu_sub_'+i).value.trim();
  if(dl) dl.innerHTML=chapterOptions(wrapCtx.names[i], sub);
  const sm=document.getElementById('wu_smart_'+i); if(sm){ sm.innerHTML=wuSmartHtml(i, wrapCtx.names[i], sub); const row=document.getElementById('wu_row_'+i); if(row) row.dataset.hw=''; }
}
function wuHw(i,text){ const el=document.getElementById('wu_hw_'+i); if(el) el.value = text; }
function wuCopyFirst(){
  if(!wrapCtx) return;
  ['sub','tau','hw'].forEach(f=>{
    const v=document.getElementById('wu_'+f+'_0').value;
    wrapCtx.names.forEach((n,i)=>{ if(i>0 && document.getElementById('wu_row_'+i).dataset.status!=='absent') document.getElementById('wu_'+f+'_'+i).value=v; });
  });
}
function wuSkip(){
  if(!wrapCtx) return;
  const skip=lsGet('tr_wrapSkip',{}); skip[dateKeyStr(todayDateOnly())+'|'+wrapCtx.slotNum]=true; lsSet('tr_wrapSkip',skip);
  renderWrapUpBox();
}
/* A student can have several subjects in one class: each extra subject is its own small block. */
/* Two blocks for the SAME subject are joined into one note instead of overwriting each other. */
function joinWrapBlocks(blocks){
  const by={}, order=[];
  blocks.forEach(b=>{
    if(!by[b.sub]){ by[b.sub]={sub:b.sub, taught:b.taught||'', hw:b.hw||''}; order.push(b.sub); }
    else { const x=by[b.sub]; x.taught=[x.taught,b.taught].filter(Boolean).join(', '); x.hw=[x.hw,b.hw].filter(Boolean).join(', '); }
  });
  return order.map(k=>by[k]);
}
let wuXSeq=0;
function wuAddSubject(i){
  const host=document.getElementById('wu_extra_'+i); if(!host) return;
  const b=++wuXSeq, id=(k)=>`wu_x${k}_${i}_${b}`;
  host.insertAdjacentHTML('beforeend', `<div class="wu-xblock" id="wu_x_${i}_${b}" data-b="${b}">
    <div class="wu-xhead"><span>➕ আরেকটা বিষয়</span><button type="button" class="wu-chip" onclick="document.getElementById('wu_x_${i}_${b}').remove()">✕ বাদ</button></div>
    <div class="wu-row2"><input id="${id('sub')}" list="wu_subs_${i}" placeholder="বিষয়"><input id="${id('tau')}" placeholder="কী পড়ালে?"></div>
    <input id="${id('hw')}" placeholder="হোমওয়ার্ক">
    <div class="wu-presets">${WRAP_HW_PRESETS.map(p=>`<button type="button" class="wu-chip" onclick="document.getElementById('${id('hw')}').value='${p}'">${p}</button>`).join('')}<button type="button" class="wu-chip wu-mic" data-mic="${id('tau')}" onclick="startVoice('${id('tau')}',{append:true})">🎤 পড়ানো</button><button type="button" class="wu-chip wu-mic" data-mic="${id('hw')}" onclick="startVoice('${id('hw')}',{append:true})">🎤 হোমওয়ার্ক</button></div>
  </div>`);
  const f=document.getElementById(id('sub')); if(f) f.focus();
}
function wuExtraBlocks(i){
  return Array.from(document.querySelectorAll(`#wu_extra_${i} .wu-xblock`)).map(xb=>{
    const b=xb.dataset.b, v=(k)=>document.getElementById(`wu_x${k}_${i}_${b}`).value.trim();
    return {sub:v('sub'), taught:v('tau'), hw:v('hw')};
  });
}
function wuSave(){
  if(!wrapCtx) return;
  const d=todayDateOnly(), {slotNum,names}=wrapCtx;
  const prevAtt=JSON.stringify(getAttendanceMap()), prevNotes=JSON.stringify(getNotes());
  for(let i=0;i<names.length;i++){
    if(document.getElementById('wu_row_'+i).dataset.status==='absent') continue;
    if(wuExtraBlocks(i).some(b=>(b.taught||b.hw) && !b.sub)){ showWarningToast(`${names[i]}-এর নতুন বিষয়ে বিষয়ের নামটা লেখো।`); return; }
  }
  const wasPending=pendingWrapSlots().length;
  let entries=getNoteEntries(d,slotNum).slice(), saved=0;
  names.forEach((n,i)=>{
    const st=document.getElementById('wu_row_'+i).dataset.status;
    setAttendance(d,slotNum,n,st);
    if(st==='absent') return;
    const sub=document.getElementById('wu_sub_'+i).value.trim(), taught=document.getElementById('wu_tau_'+i).value.trim(), hw=document.getElementById('wu_hw_'+i).value.trim();
    const hwSt=document.getElementById('wu_row_'+i).dataset.hw;
    if(hwSt){ const last=lastEntryFor(n, sub); if(last){ const nts=getNotes(); nts[last.key].entries[last.idx].hwStatus=hwSt; lsSet('tr_notes', nts); } }
    const blocks=[]; if(taught||hw) blocks.push({sub, taught, hw});
    wuExtraBlocks(i).forEach(b=>{ if(b.sub && (b.taught||b.hw)) blocks.push(b); });
    joinWrapBlocks(blocks).forEach(b=>{ entries=mergeWrapEntry(entries, n, b.sub, b.taught, b.hw); saved++; if(b.sub) addSubject(n, b.sub); });
  });
  setNoteEntries(d,slotNum,entries);
  const slot=SCHEDULE.find(x=>x.num===slotNum);
  document.getElementById('wrapUpBox').dataset.key=''; wrapCtx=null;
  renderAll();
  if(wasPending>0 && pendingWrapSlots().length===0) burstConfetti();
  showUndoToast(`${slot?slot.label:''} সেভ হয়েছে${saved?` — ${toBn(saved)}টা নোটসহ`:''}`, ()=>{
    lsSet('tr_attendance', JSON.parse(prevAtt)); lsSet('tr_notes', JSON.parse(prevNotes));
    document.getElementById('wrapUpBox').dataset.key=''; renderAll();
  });
}

/* ---- Safe student rename. Every record is keyed by the student's name, so a rename must move ALL of ---- */
/* it together (profile, payments, progress, attendance, notes, make-ups, moves, archives, schedule) or */
/* history gets left behind under the old name. Refuses duplicates/commas; undo = rename back. */
function validStudentName(n){ n=(n||'').trim(); return !!n && n.length<=60 && !/[,،，]/.test(n); }
function hasStudentData(name){
  return [lsGet('tr_students',{}), lsGet('tr_payments',{}), lsGet('tr_progress',{})].some(o=>o && Object.prototype.hasOwnProperty.call(o,name));
}
function renameStudent(oldName, newName){
  oldName=(oldName||'').trim(); newName=(newName||'').trim();
  if(!validStudentName(newName)) return {ok:false, reason:'invalid'};
  if(newName===oldName) return {ok:false, reason:'same'};
  if(getAllKnownNames().includes(newName) || hasStudentData(newName)) return {ok:false, reason:'exists'};
  const has=(o,k)=>o && Object.prototype.hasOwnProperty.call(o,k);
  const moveKey=(o)=>{ if(has(o,oldName)){ o[newName]=o[oldName]; delete o[oldName]; return true; } return false; };
  const fixAtt=(att)=>{ let ch=false; Object.keys(att||{}).forEach(k=>{ const p=k.split('|'); if(p[2]===oldName){ att[p[0]+'|'+p[1]+'|'+newName]=att[k]; delete att[k]; ch=true; } }); return ch; };
  const fixNotes=(notes)=>{ Object.values(notes||{}).forEach(n=>{ if(n && Array.isArray(n.entries)) n.entries.forEach(e=>{ if(e.student===oldName) e.student=newName; }); }); };
  ['tr_students','tr_payments','tr_progress'].forEach(key=>{ const o=lsGet(key,{}); if(moveKey(o)) lsSet(key,o); });
  const att=lsGet('tr_attendance',{}); if(fixAtt(att)) lsSet('tr_attendance',att);
  const notes=lsGet('tr_notes',{}); fixNotes(notes); lsSet('tr_notes',notes);
  const makeups=lsGet('tr_makeups',[]); makeups.forEach(m=>{ if(m.name===oldName) m.name=newName; }); lsSet('tr_makeups',makeups);
  const moves=lsGet('tr_moves',{}); Object.values(moves).forEach(m=>{ if(m && m.name===oldName) m.name=newName; }); lsSet('tr_moves',moves);
  const archives=lsGet('tr_archives',[]);
  archives.forEach(a=>{ const d=a.data||{}; moveKey(d.payments); moveKey(d.progress); fixAtt(d.attendance); fixNotes(d.notes); });
  lsSet('tr_archives',archives);
  DAYS.forEach(day=>SCHEDULE.forEach(slot=>{
    const parts=getCellText(slot,day).split(',').map(x=>x.trim()).filter(Boolean);
    if(parts.includes(oldName)) setCellText(slot,day,parts.map(x=>x===oldName?newName:x).join(', '));
  }));
  return {ok:true};
}
function onRenameStudent(){
  const oldName=studentModalName; if(!oldName) return;
  const v=prompt(`"${oldName}"-এর নতুন নাম:`, oldName); if(v===null) return;
  const newName=v.trim();
  const r=renameStudent(oldName,newName);
  if(!r.ok){
    if(r.reason==='same') return;
    showWarningToast(r.reason==='exists' ? 'এই নামে আরেকজনের তথ্য আছে — আলাদা নাম দাও (যেমন নামের সাথে ক্লাস লেখো)।' : 'নামে কমা (,) থাকা যাবে না, আর খালি রাখা যাবে না।');
    return;
  }
  closeStudentModal();
  renderStudentsTab(); renderWeekTable(); renderDayView(); renderTodayList();
  openStudentModal(newName);
  showUndoToast(`"${oldName}" → "${newName}" নাম বদলানো হয়েছে।`, ()=>{
    renameStudent(newName, oldName);
    closeStudentModal(); renderStudentsTab(); renderWeekTable(); renderDayView(); renderTodayList();
  });
}

/* ---- Remove a student: takes them out of every schedule slot, but keeps saved history unless the ---- */
/* teacher explicitly chooses to erase it too — so an accidental tap can't silently wipe payment records. */
/* Returns what was removed so the action can be undone from the toast that follows. */
function removeStudentFromScheduleOnly(name){
  const removed=[];
  DAYS.forEach(d=>{
    SCHEDULE.forEach(slot=>{
      const current = getCellText(slot, d);
      const parts = current.split(',').map(s=>s.trim()).filter(Boolean);
      if(parts.includes(name)){
        removed.push({slotNum:slot.num, day:d, prevText:current});
        setCellText(slot, d, parts.filter(p=>p!==name).join(', '));
      }
    });
  });
  return removed;
}
function restoreScheduleRemoval(removed){
  removed.forEach(r=>{
    const slot = SCHEDULE.find(s=>s.num===r.slotNum);
    if(slot) setCellText(slot, r.day, r.prevText);
  });
}
function onDeleteStudent(){
  const name = studentModalName; if(!name) return;
  if(!confirm(`"${name}"-কে শিডিউল থেকে বাদ দিতে চাও?\n\nএখন থেকে আর কোনো ক্লাসে দেখাবে না, তবে আগের অ্যাটেন্ডেন্স/প্রোগ্রেস/পেমেন্টের তথ্য সেভ থাকবে (পরে আবার একই নামে যোগ করলে ফিরে পাবে)।`)) return;
  const removed = removeStudentFromScheduleOnly(name);
  closeStudentModal();
  renderStudentsTab(); renderWeekTable(); renderDayView(); renderTodayList();
  showUndoToast(`"${name}"-কে শিডিউল থেকে বাদ দেওয়া হয়েছে।`, ()=>{
    restoreScheduleRemoval(removed);
    renderStudentsTab(); renderWeekTable(); renderDayView(); renderTodayList();
  });
}

