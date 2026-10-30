/* ============ NATURAL-LANGUAGE QUICK COMMAND ============ */
const DAY_KEYWORDS = {'শনিবার':'Sat','শনি':'Sat','রবিবার':'Sun','রবি':'Sun','সোমবার':'Mon','সোম':'Mon','মঙ্গলবার':'Tue','মঙ্গল':'Tue','বুধবার':'Wed','বুধ':'Wed','বৃহস্পতিবার':'Thu','বৃহস্পতি':'Thu','শুক্রবার':'Fri','শুক্র':'Fri'};
function bnDigitsToLatin(s){ const map={'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'}; return s.replace(/[০-৯]/g, ch=>map[ch]); }
function parseCommandDate(text){
  const tokens = text.split(/\s+/).filter(Boolean);
  if(tokens.some(t=>t==='আজ'||t==='আজকে'||t.startsWith('আজকে'))) return {date: todayDateOnly(), label:'আজ'};
  if(tokens.some(t=>t==='কাল'||t==='আগামীকাল'||t.startsWith('আগামীকাল'))) return {date: addDaysToDate(todayDateOnly(),1), label:'আগামীকাল'};
  const keys = Object.keys(DAY_KEYWORDS).sort((a,b)=>b.length-a.length);
  for(const key of keys){ if(tokens.some(t=>t.startsWith(key))){ const day=DAY_KEYWORDS[key]; return {date: resolvedDateForDay(day), label: DAY_BN_FULL[day]}; } }
  return {date: todayDateOnly(), label:'আজ'};
}
function findNameInText(text){
  const names = getAllKnownNames().sort((a,b)=>b.length-a.length);
  for(const n of names){ if(text.includes(n)) return n; }
  return null;
}
const PERIOD_WORD_TO_KEY = {'ভোর':'dawn','সকাল':'morn','দুপুর':'noon','বিকাল':'dusk','সন্ধ্যা':'eve','রাত':'night'};

function findTimeSlotsInText(text){
  const norm = bnDigitsToLatin(text);
  let candidates=[]; // {hour12, minute|null}
  let m;

  // Priority cascade: once a more specific pattern has matched something, don't let a
  // weaker pattern (e.g. plain "৪টা" inside "পৌনে ৪টা") also add a diluting hour-only candidate.
  const tryPattern = (re, mapFn) => {
    if(candidates.length>0) return;
    const found=[];
    let mm;
    while((mm=re.exec(norm))) found.push(mapFn(mm));
    if(found.length) candidates=found;
  };

  tryPattern(/সাড়ে\s*(\d{1,2})/g, mm=>({hour:parseInt(mm[1],10), minute:30})); // "সাড়ে ৩টা" -> 3:30
  tryPattern(/পৌনে\s*(\d{1,2})/g, mm=>{ let h=parseInt(mm[1],10)-1; if(h<1) h=12; return {hour:h, minute:45}; }); // "পৌনে ৪টা" -> 3:45
  tryPattern(/(\d{1,2})\s*টা\s*(\d{1,2})\s*মিনিট/g, mm=>({hour:parseInt(mm[1],10), minute:parseInt(mm[2],10)})); // "১১টা ১০ মিনিটে"
  tryPattern(/(\d{1,2})[:.](\d{2})/g, mm=>({hour:parseInt(mm[1],10), minute:parseInt(mm[2],10)})); // "১১:০০" / "১১.০০"
  tryPattern(/(\d{1,2})\s*টা/g, mm=>({hour:parseInt(mm[1],10), minute:null})); // "১১টা" / "৫টায়"
  tryPattern(/\b(\d{1,2})\b/g, mm=>({hour:parseInt(mm[1],10), minute:null})); // bare number, last resort

  const matched=new Set();
  candidates.forEach(c=>{
    if(c.hour<1 || c.hour>12) return;
    SCHEDULE.forEach(slot=>{
      let h=Math.floor(slot.start/60)%12; if(h===0) h=12;
      const mnt=slot.start%60;
      if(c.hour===h && (c.minute===null || Math.abs(c.minute-mnt)<=5)) matched.add(slot);
    });
  });

  // No number anywhere in the text at all -> try "প্রথম/শেষ ক্লাস" or a bare period name ("দুপুরের ক্লাসে")
  if(matched.size===0 && candidates.length===0){
    if(/প্রথম/.test(text)) matched.add(SCHEDULE[0]);
    if(/শেষ/.test(text)) matched.add(SCHEDULE[SCHEDULE.length-1]);
    if(matched.size===0){
      Object.keys(PERIOD_WORD_TO_KEY).forEach(word=>{
        if(text.includes(word)){
          const key=PERIOD_WORD_TO_KEY[word];
          SCHEDULE.forEach(slot=>{ if(slot.period===key && !slot.activity) matched.add(slot); });
        }
      });
    }
  }

  let matches=Array.from(matched);
  if(matches.length>1){
    if(/সকাল/.test(norm)) matches=matches.filter(s=>s.start<720);
    else if(/বিকাল|সন্ধ্যা|রাত|দুপুর/.test(norm)) matches=matches.filter(s=>s.start>=720);
  }
  return matches;
}
/* ============ SMART HELPERS: "where did we stop?" + "was last homework done?" + sentence -> structured note ============ */
function lastEntryFor(name, subject){
  const notes=getNotes(), keys=Object.keys(notes).sort().reverse(), todayK=dateKeyStr(todayDateOnly())+'|';
  for(const k of keys){
    if(k.startsWith(todayK)) continue;                       // only earlier classes
    const n=notes[k]; if(!n || !Array.isArray(n.entries)) continue;
    for(let i=n.entries.length-1;i>=0;i--){ const e=n.entries[i]; if(e.student===name && (!subject || e.subject===subject)) return {key:k, idx:i, entry:e}; }
  }
  return null;
}
/* Suggest today's topic: last class's own "next plan" first, else the chapter after the one taught, else the first unfinished chapter. */
function smartSuggestion(name, subject){
  const last=lastEntryFor(name, subject);
  if(last && last.entry.nextPlan) return {label:'গতবারের পরিকল্পনা', text:last.entry.nextPlan};
  const all=(getStudentSubjects(name)[subject]||[]);
  if(last && last.entry.taught){
    const i=all.findIndex(c=>last.entry.taught.includes(c.chapter));
    if(i>=0 && all[i+1]) return {label:'পরের অধ্যায়', text:all[i+1].chapter};
  }
  const open=all.find(c=>(c.pct||0)<100);
  return open ? {label:'অসম্পূর্ণ অধ্যায়', text:open.chapter} : null;
}
const NOTE_MARK = [['hw', /(?:হোমওয়ার্ক|হোম ওয়ার্ক|বাড়ির কাজ|বাড়ীর কাজ|\bhw\b|homework)\s*[:\-–]?\s*/i], ['next', /(?:পরের ক্লাসে|পরের ক্লাস|নেক্সট|\bnext\b)\s*[:\-–]?\s*/i]];
const TEACH_WORDS = /পড়ালাম|পড়িয়েছি|পড়ানো হয়েছে|পড়ানো|করালাম|শেখালাম|শেষ করলাম|শেষ করেছি|বোঝালাম/g;
const COMMON_SUBJECTS = ['গণিত','ইংরেজি','বাংলা','বিজ্ঞান','পদার্থবিজ্ঞান','রসায়ন','জীববিজ্ঞান','ইতিহাস','ভূগোল','ধর্ম','আইসিটি','ICT','অংক','ফিজিক্স','কেমিস্ট্রি','বায়োলজি'];
/* One sentence -> {name, subject, taught, homework, nextPlan}. Order of parts does not matter; subject falls back to the last one used. */
function parseNoteCommand(text){
  const name=findNameInText(text); if(!name) return null;
  if(/বাতিল|ছুটি|নাও(?![\u0980-\u09FF])/.test(text)) return null;      // schedule commands are handled elsewhere
  const hasMark = NOTE_MARK.some(([,re])=>re.test(text));
  const subs=[...new Set([...Object.keys(getStudentSubjects(name)), ...COMMON_SUBJECTS])];
  const subjectHit=subs.find(x=>text.includes(x));
  const teach=new RegExp(TEACH_WORDS.source).test(text);
  if(!hasMark && !teach && !subjectHit) return null;
  let rest=text.replace(name,' ').replace(/^\s*(?:-?এর|র|কে|-?কে)(?![\u0980-\u09FF])/,'').trim();
  const marks=[];
  NOTE_MARK.forEach(([key,re])=>{ const m=re.exec(rest); if(m) marks.push({key, start:m.index, end:m.index+m[0].length}); });
  marks.sort((a,b)=>a.start-b.start);
  const parts={taught:rest.slice(0, marks.length?marks[0].start:rest.length), hw:'', next:''};
  marks.forEach((m,i)=>{ parts[m.key]=rest.slice(m.end, i+1<marks.length?marks[i+1].start:rest.length); });
  const clean=(t)=>(t||'').replace(TEACH_WORDS,' ').replace(/^[\s,،।:\-–]+|[\s,،।:\-–]+$/g,'').replace(/\s{2,}/g,' ').trim();
  let subject = subjectHit || '';
  let taught=parts.taught; if(subject) taught=taught.replace(subject,' ');
  taught=clean(taught); const homework=clean(parts.hw), nextPlan=clean(parts.next);
  if(!taught && !homework && !nextPlan) return null;
  if(!subject) subject=lastSubjectFor(name);
  return {name, subject, taught, homework, nextPlan, finished:/শেষ/.test(text)};
}
function chapterIndexFor(name, subject, taught){
  const list=getStudentSubjects(name)[subject]||[], tt=(taught||'').trim(); if(!tt) return -1;
  return list.findIndex(c=>c.chapter && (tt.includes(c.chapter) || c.chapter.includes(tt)));
}
function parseNoteCommandFull(text){
  const n=parseNoteCommand(text); if(!n) return null;
  const today=todayKey(), d=todayDateOnly(), nm=nowMinutes();
  const mine=SCHEDULE.filter(sl=>effectiveContentForDate(sl,today,d).split(',').map(x=>x.trim()).includes(n.name));
  if(!mine.length) return {ok:false, msg:`আজ ${n.name}-এর কোনো ক্লাস নেই — তাই নোট কোথায় রাখব বুঝতে পারছি না।`};
  const done=mine.filter(sl=>sl.end<=nm), slot=done.length ? done[done.length-1] : (mine.find(sl=>sl.start<=nm) || mine[0]);
  const ci=n.finished ? chapterIndexFor(n.name, n.subject, n.taught) : -1;
  return {ok:true, action:'note', ...n, slot, slotNum:slot.num, finishIdx:ci, finishName: ci>=0 ? getStudentSubjects(n.name)[n.subject][ci].chapter : ''};
}
let lastNoteUndo=null;
function executeNoteCommand(r){
  const d=todayDateOnly();
  lastNoteUndo={att:JSON.stringify(getAttendanceMap()), notes:JSON.stringify(getNotes()), prog:JSON.stringify(getProgressData())};
  if(!getAttendance(d,r.slotNum,r.name)) setAttendance(d,r.slotNum,r.name,'present');
  setNoteEntries(d, r.slotNum, mergeWrapEntry(getNoteEntries(d,r.slotNum), r.name, r.subject, r.taught, r.homework, r.nextPlan));
  if(r.subject) addSubject(r.name, r.subject);
  if(r.finishIdx>=0) updateChapterPct(r.name, r.subject, r.finishIdx, 100);
  clearCommandResult(); document.getElementById('cmdInput').value='';
  renderAll();
  const q=jsq(r.name);
  document.getElementById('cmdResult').innerHTML=`<div class="cmd-msg cmd-confirm">✅ ${escapeHtml(r.name)}-এর ${escapeHtml(r.subject||'')} নোট সেভ হয়েছে।</div>
    <div class="cmd-actions"><button class="modal-btn secondary" onclick="undoNoteCommand()">আন্ডু</button><button class="modal-btn secondary" onclick="shareNoteCommand('${q}','${r.slotNum}',0)">📋 কপি</button><button class="modal-btn primary" onclick="shareNoteCommand('${q}','${r.slotNum}',1)">অভিভাবককে পাঠাও</button></div>`;
}
function undoNoteCommand(){ if(!lastNoteUndo) return; lsSet('tr_attendance',JSON.parse(lastNoteUndo.att)); lsSet('tr_notes',JSON.parse(lastNoteUndo.notes)); if(lastNoteUndo.prog) lsSet('tr_progress',JSON.parse(lastNoteUndo.prog)); lastNoteUndo=null; clearCommandResult(); renderAll(); showSuccessToast('নোটটা মুছে আগের অবস্থায় ফেরানো হয়েছে'); }
function shareNoteCommand(name, slotNum, send){
  const d=todayDateOnly(), slot=SCHEDULE.find(x=>x.num===slotNum); if(!slot) return;
  const es=getNoteEntries(d,slotNum).filter(e=>e.student===name).map(e=>({...e, date:d, slot}));
  if(!es.length) return;
  const text=formatNoteGroupText(es);
  if(send) openWhatsApp(getStudentProfile(name).guardianPhone, text); else copyTextSmart(text, 'নোট কপি হয়েছে — WhatsApp-এ পেস্ট করে পাঠাও।');
}
/* Homework follow-through per student (from the "was last homework done?" taps). */
function homeworkStats(){
  const by={};
  const scan=(notes)=>Object.values(notes||{}).forEach(n=>{ if(n && Array.isArray(n.entries)) n.entries.forEach(e=>{ if(e.hwStatus){ const b=by[e.student]=by[e.student]||{done:0,partial:0,none:0}; b[e.hwStatus]++; } }); });
  scan(getNotes()); getArchives().forEach(a=>scan(a.data && a.data.notes));
  return Object.keys(by).map(name=>{ const b=by[name], t=b.done+b.partial+b.none; return {name, ...b, total:t, pct:Math.round((b.done+b.partial*0.5)/t*100)}; }).filter(x=>x.total>=3).sort((a,b)=>a.pct-b.pct);
}

/* ============ PASTE A bKash / Nagad / Rocket SMS -> payment (no typing, no AI: pattern matching only) ============ */
/* The sender's number is matched to a student's saved guardian number. An unknown number is asked ONCE;   */
/* the answer is remembered (profile.payPhones) so next month it is matched automatically. TrxID stops double entry. */
const phone10 = (v)=>String(v||'').replace(/[^0-9০-৯]/g,'').replace(/[০-৯]/g,c=>'০১২৩৪৫৬৭৮৯'.indexOf(c)).slice(-10);
function parseSmsPayment(text){
  const t=bnDigitsToLatin(text).replace(/\s+/g,' ');
  if(!/trx\s?id|txn\s?id|transaction id|received|পেয়েছেন|রিসিভ|প্রাপ্ত/i.test(t)) return null;
  const num='([\\d,]+(?:\\.\\d+)?)';
  const pats=[new RegExp('received\\s*(?:Tk\\.?|৳|BDT)?\\s*'+num,'i'), new RegExp('Amount:?\\s*(?:Tk\\.?|৳|BDT)?\\s*'+num,'i'),
              new RegExp('(?:Tk\\.?|৳|BDT)\\s*'+num+'\\s*(?:received|from)','i'), new RegExp(num+'\\s*টাকা\\s*(?:পেয়েছেন|রিসিভ|প্রাপ্ত)'),
              new RegExp('(?:Tk\\.?|৳|BDT)\\s*'+num,'i')];       // last resort: first amount (never the "Balance" one if an earlier pattern hits)
  let amount=0;
  for(const re of pats){ const m=re.exec(t); if(m){ amount=Math.round(parseFloat(m[1].replace(/,/g,''))); if(amount>0) break; } }
  const ph=(t.replace(/(\d)-(?=\d)/g,'$1').match(/(?:\+?88)?(01\d{9})/)||[])[1] || '';
  if(!(amount>0) || !ph) return null;
  const trx=((t.match(/(?:trx\s?id|txn\s?id|transaction id)\s*[:\-]?\s*([A-Z0-9]{6,})/i)||[])[1]||'').toUpperCase();
  const method = /nagad|নগদ|txn\s?id/i.test(t) ? 'অন্যান্য' : (/bkash|বিকাশ|trx\s?id/i.test(t) ? 'বিকাশ' : (/rocket|রকেট/i.test(t) ? 'অন্যান্য' : 'বিকাশ'));
  return {amount, phone:ph, trx, method, wallet: /nagad|txn\s?id/i.test(t)?'Nagad':(/rocket|রকেট/i.test(t)?'Rocket':'bKash')};
}
function matchPhoneToStudent(profiles, phone){
  const p=phone10(phone); if(!p) return null;
  for(const [name,pr] of Object.entries(profiles||{})){
    if([pr.guardianPhone, ...(pr.payPhones||[])].some(x=>x && phone10(x)===p)) return name;
  }
  return null;
}
function findPaymentByTrx(allPayments, trx){
  if(!trx) return null;
  for(const [name,rec] of Object.entries(allPayments||{})) if((rec.payments||[]).some(p=>(p.note||'').toUpperCase().includes(trx))) return name;
  return null;
}
let smsPending=null;
function smsPayResult(name, sms, learnPhone){
  const mk=currentMonthKey();
  return {ok:true, action:'pay', name, amount:sms.amount, method:sms.method, monthKey:mk, opening:false,
    after:Math.max(0,getStudentDueForMonth(name,mk)-sms.amount), note:sms.trx?`${sms.wallet} TrxID ${sms.trx}`:sms.wallet, learnPhone:learnPhone||''};
}
function parseSmsCommand(text){
  const sms=parseSmsPayment(text); if(!sms) return null;
  if(isFinanceHidden()) return {ok:false, msg:'পেমেন্টের মেসেজ নিতে আগে Reports ট্যাবে ফাইন্যান্স আনলক করো।'};
  const dup=findPaymentByTrx(getPaymentsData(), sms.trx);
  if(dup) return {ok:false, msg:`এই TrxID (${sms.trx}) আগেই ${dup}-এর নামে জমা করা আছে — দ্বিতীয়বার নিইনি।`};
  const name=matchPhoneToStudent(getStudentProfiles(), sms.phone);
  if(name) return smsPayResult(name, sms, '');
  smsPending=sms;
  return {ok:true, action:'smsPick', sms};
}
function smsChoose(name){ if(smsPending) renderCommandResult(smsPayResult(name, smsPending, smsPending.phone)); }
function rememberPayPhone(name, phone){
  const all=getStudentProfiles(); const pr={...(all[name]||{})}; const list=pr.payPhones||[];
  if(phone10(pr.guardianPhone)===phone10(phone) || list.some(x=>phone10(x)===phone10(phone))) return;
  if(!(pr.guardianPhone||'').trim()) pr.guardianPhone=phone; else pr.payPhones=[...list, phone];
  saveStudentProfile(name, pr);
}

/* ============ MONTHLY COLLECTION: everyone who still owes this month, one sheet, one tap ============ */
function batchPayRows(){
  const mk=currentMonthKey();
  return getAllKnownNames().map(name=>({name, due:getStudentDueForMonth(name, mk), opening:(getStudentPayment(name).openingBalance||0)})).filter(r=>r.due>0).sort((a,b)=>b.due-a.due);
}
function openBatchPay(){
  if(isFinanceHidden()){ showWarningToast('আগে Reports ট্যাবে গিয়ে ফাইন্যান্স আনলক করো।'); return; }
  const rows=batchPayRows();
  if(!rows.length){ showSuccessToast('🎉 এই মাসে কারো ফি বাকি নেই'); return; }
  const last=lsGet('tr_lastPayMethod','নগদ');
  document.getElementById('batchPayBody').innerHTML=`
    <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">যারা টাকা দিয়েছে তাদের টিক রাখো, অংক বদলাতে পারো। ${monthKeyLabel(currentMonthKey())}-এর ফি হিসেবে জমা হবে।</div>
    <select id="bp_method" class="sm-field-input" style="margin-bottom:10px;" onchange="updateBatchTotal()">${['নগদ','বিকাশ','ব্যাংক','অন্যান্য'].map(m=>`<option${m===last?' selected':''}>${m}</option>`).join('')}</select>
    ${rows.map((r,i)=>`<div class="wu-stu" style="display:flex;align-items:center;gap:10px;">
      <input type="checkbox" id="bp_ck_${i}" data-name="${escapeHtml(r.name)}" onchange="updateBatchTotal()" style="width:20px;height:20px;">
      <div style="flex:1;min-width:0;"><div class="wu-name">${escapeHtml(r.name)}</div>${r.opening>0?`<div style="font-size:10.5px;color:var(--muted);">আগের বকেয়াও আছে ${bnTaka(r.opening)}</div>`:''}</div>
      <input type="number" inputmode="numeric" id="bp_amt_${i}" value="${r.due}" min="1" oninput="updateBatchTotal()" style="width:92px;background:var(--ov005);border:1px solid var(--line);color:var(--paper);border-radius:10px;padding:8px;font-family:'JetBrains Mono';">
    </div>`).join('')}
    <button type="button" class="settings-btn" style="margin-top:10px;" onclick="batchPayAll(true)">সবাইকে টিক দাও</button>
    <button type="button" class="wu-save" id="bp_go" style="width:100%;margin-top:8px;background:var(--paid);color:#06281c;border:none;border-radius:13px;padding:13px;font-family:'Hind Siliguri';font-size:14px;font-weight:700;" onclick="submitBatchPay()">জমা করো</button>`;
  document.getElementById('batchPayModal').style.display='flex';
  window.__bpRows=rows; updateBatchTotal();
}
function batchPayAll(on){ (window.__bpRows||[]).forEach((r,i)=>{ const c=document.getElementById('bp_ck_'+i); if(c) c.checked=on; }); updateBatchTotal(); }
function batchPicked(){
  return (window.__bpRows||[]).map((r,i)=>({name:r.name, amount:Math.round(parseFloat(document.getElementById('bp_amt_'+i).value)||0), on:document.getElementById('bp_ck_'+i).checked})).filter(x=>x.on && x.amount>0);
}
function updateBatchTotal(){
  const p=batchPicked(), go=document.getElementById('bp_go'); if(!go) return;
  go.textContent = p.length ? `জমা করো — ${toBn(p.length)} জন, মোট ${bnTaka(p.reduce((s,x)=>s+x.amount,0))}` : 'কাউকে টিক দাও';
  go.disabled=!p.length; go.style.opacity=p.length?1:.5;
}
function closeBatchPay(){ document.getElementById('batchPayModal').style.display='none'; }
function submitBatchPay(){
  const picked=batchPicked(); if(!picked.length) return;
  const method=document.getElementById('bp_method').value, mk=currentMonthKey();
  const snap={pay:JSON.stringify(getPaymentsData()), seq:lsGet('tr_receiptSeq',0)};
  picked.forEach(x=>addPayment(x.name, x.amount, mk, '', false, method));
  lsSet('tr_lastPayMethod', method);
  closeBatchPay(); renderAll(); renderStudentsTab();
  showUndoToast(`${toBn(picked.length)} জনের মোট ${bnTaka(picked.reduce((s,x)=>s+x.amount,0))} জমা হয়েছে`, ()=>{
    lsSet('tr_payments', JSON.parse(snap.pay)); lsSet('tr_receiptSeq', snap.seq); renderAll(); renderStudentsTab();
  });
}
/* Single-student payment form starts with this month's due and the last method used. */
function applyPayDefaults(){
  if(!studentModalName) return;
  const m=document.getElementById('pp_method'), a=document.getElementById('pp_amount'), last=lsGet('tr_lastPayMethod','');
  if(m && last) m.value=last;
  if(a && !a.value){ const d=getStudentDueForMonth(studentModalName, currentMonthKey()); if(d>0) a.value=d; }
}

