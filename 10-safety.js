/* ============ DATA SAFETY: persistent storage, daily on-device snapshots (time machine), wipe detection, restore ============ */
/* pure helpers (unit-tested) */
function safetyHasData(read){
  return ['tr_khata','tr_daily','tr_payments','tr_notes','tr_attendance','tr_students','tr_progress','tr_khataPeople','tr_khataNotes'].some(k=>{
    const v=read(k); if(!v) return false;
    try{ const o=JSON.parse(v); return Array.isArray(o)?o.length>0:(o&&typeof o==='object'?Object.keys(o).length>0:!!o); }catch(e){ return false; }
  });
}
function safetySummary(read){
  const n=k=>{ try{ const o=JSON.parse(read(k)||'null'); return Array.isArray(o)?o.length:(o&&typeof o==='object'?Object.keys(o).length:0); }catch(e){ return 0; } };
  return {khata:n('tr_khata'), daily:n('tr_daily'), att:n('tr_attendance'), notes:n('tr_notes')};
}
function safetyPrune(snaps, keepAuto, keepOther){            // -> ids to delete: newest 7 automatic + newest 5 others are kept
  keepAuto=keepAuto||7; keepOther=keepOther||5;
  const byNew=[...snaps].sort((a,b)=>b.ts-a.ts), auto=byNew.filter(s=>s.reason==='auto'), other=byNew.filter(s=>s.reason!=='auto');
  return [...auto.slice(keepAuto),...other.slice(keepOther)].map(s=>s.id);
}
function safetyPickRestore(snaps, dismissedTs){              // newest snapshot that really holds data and is newer than anything the person already declined
  return [...snaps].sort((a,b)=>b.ts-a.ts).find(s=>s.hasData && s.ts>(dismissedTs||0))||null;
}
/* IndexedDB plumbing (every call is wrapped: if the browser has no IndexedDB, the app simply runs without snapshots) */
function safeOpen(){ return new Promise((res,rej)=>{ if(!window.indexedDB) return rej(new Error('no-idb')); const r=indexedDB.open('tr_safety',1); r.onupgradeneeded=()=>r.result.createObjectStore('snaps',{keyPath:'id'}); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function safeAll(){ const db=await safeOpen(); return new Promise((res,rej)=>{ const q=db.transaction('snaps').objectStore('snaps').getAll(); q.onsuccess=()=>{ db.close(); res(q.result||[]); }; q.onerror=()=>{ db.close(); rej(q.error); }; }); }
async function safePut(rec){ const db=await safeOpen(); return new Promise((res,rej)=>{ const tx=db.transaction('snaps','readwrite'); tx.objectStore('snaps').put(rec); tx.oncomplete=()=>{ db.close(); res(); }; tx.onerror=()=>{ db.close(); rej(tx.error); }; }); }
async function safeDelete(ids){ if(!ids.length) return; const db=await safeOpen(); return new Promise((res,rej)=>{ const tx=db.transaction('snaps','readwrite'), st=tx.objectStore('snaps'); ids.forEach(i=>st.delete(i)); tx.oncomplete=()=>{ db.close(); res(); }; tx.onerror=()=>{ db.close(); rej(tx.error); }; }); }
async function safetySnapshot(reason){
  try{
    const read=k=>localStorage.getItem(k); if(!safetyHasData(read)) return null;
    const data={}; BACKUP_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!==null) data[k]=v; });   // captured synchronously, before any destructive step that follows
    const json=JSON.stringify(data), now=Date.now(), rec={id:reason==='auto'?'auto-'+dateKeyStr(todayDateOnly()):reason+'-'+now, ts:now, reason, hasData:true, size:json.length, sum:safetySummary(read), json};
    await safePut(rec); await safeDelete(safetyPrune(await safeAll())); return rec;
  }catch(e){ return null; }
}
async function safetyEnsurePersist(){ try{ if(!(navigator.storage && navigator.storage.persist)) return null; if(await navigator.storage.persisted()) return true; return await navigator.storage.persist(); }catch(e){ return null; } }
async function safetyRestore(id, skipConfirm){
  let rec; try{ rec=(await safeAll()).find(r=>r.id===id); }catch(e){}
  if(!rec){ showWarningToast('কপিটা পাওয়া যায়নি।'); return; }
  if(!skipConfirm && !confirm('এই কপি থেকে ডেটা ফেরত আনবে? এখনকার ডেটা এর জায়গায় বসে যাবে (আগে একটা কপি রেখে দেওয়া হবে)।')) return;
  await safetySnapshot('before-restore');
  const data=JSON.parse(rec.json);
  BACKUP_KEYS.forEach(k=>{ if(Object.prototype.hasOwnProperty.call(data,k)) localStorage.setItem(k,data[k]); else localStorage.removeItem(k); });
  location.reload();
}
function safetyWhen(ts){ const d=new Date(ts), h=d.getHours()%12||12, m=String(d.getMinutes()).padStart(2,'0'); return `${bnDateLabel(d)}, ${toBn(h)}:${toBn(m)} ${d.getHours()>=12?'PM':'AM'}`; }
function safetySumText(s){ const x=s||{}; return `${toBn(x.khata||0)} লেনদেন · ${toBn(x.att||0)} হাজিরা · ${toBn(x.notes||0)} নোট`; }
function safetyShowRestorePrompt(rec){
  if(document.getElementById('safetyPrompt')) return;
  const d=document.createElement('div'); d.id='safetyPrompt'; d.className='safety-prompt';
  d.innerHTML=`<div class="sp-box"><div style="font-size:34px">🛟</div><div class="sp-t">ডেটা হারিয়ে গেছে মনে হচ্ছে</div><div class="sp-s">অ্যাপে এখন কোনো হিসাব নেই, কিন্তু ${safetyWhen(rec.ts)}-এর সংরক্ষিত কপিতে আছে:<br><b>${safetySumText(rec.sum)}</b><br>ফেরত আনবো?</div>
    <button class="kh-fab" id="spYes">✅ হ্যাঁ, ফেরত আনো</button><button class="settings-btn" style="margin-top:8px;" id="spNo">এখন না</button></div>`;
  document.body.appendChild(d);
  document.getElementById('spYes').onclick=()=>safetyRestore(rec.id,true);
  document.getElementById('spNo').onclick=()=>{ lsSet('tr_restoreDismissed',rec.ts); d.remove(); };
}
async function safetyBoot(){
  try{
    safetyEnsurePersist();
    const read=k=>localStorage.getItem(k), snaps=await safeAll();
    if(!safetyHasData(read)){ const rec=safetyPickRestore(snaps, lsGet('tr_restoreDismissed',0)); if(rec) safetyShowRestorePrompt(rec); return; }
    const lastAuto=snaps.filter(s=>s.reason==='auto').sort((a,b)=>b.ts-a.ts)[0];
    if(!lastAuto || Date.now()-lastAuto.ts>12*3600*1000) safetySnapshot('auto');
  }catch(e){}
}
setTimeout(safetyBoot,2500);
function safetyCardHtml(){ return `<div id="safetyCard"><span class="spin"></span>লোড হচ্ছে…</div>`; }
async function safetyRefreshCard(){
  const el=document.getElementById('safetyCard'); if(!el) return;
  let persisted=null, est=null, snaps=[], idbOk=true;
  try{ persisted=navigator.storage&&navigator.storage.persisted?await navigator.storage.persisted():null; }catch(e){}
  try{ est=navigator.storage&&navigator.storage.estimate?await navigator.storage.estimate():null; }catch(e){}
  try{ snaps=(await safeAll()).sort((a,b)=>b.ts-a.ts); }catch(e){ idbOk=false; }
  let ls=0; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); ls+=(k.length+(localStorage.getItem(k)||'').length)*2; }
  const pct=Math.min(100,Math.round(ls/(5*1024*1024)*100)), mb=n=>toBn((n/1048576).toFixed(2)), last=lsGet('tr_lastBackupAt',null);
  const label={auto:'স্বয়ংক্রিয়',manual:'হাতে নেওয়া','before-restore':'ফেরত আনার আগে','before-erase':'মোছার আগে','before-import':'ইমপোর্টের আগে'};
  el.innerHTML=`<div class="sf-row"><span>স্থায়ী স্টোরেজ</span><b class="${persisted?'sf-ok':'sf-warn'}">${persisted===null?'এই ব্রাউজারে নেই':(persisted?'✅ চালু':'⚠️ বন্ধ')}</b></div>
    ${persisted===false?`<div class="sf-note">বন্ধ থাকলে ব্রাউজার জায়গা কমলে বা ক্লিন করলে তোমার ডেটা মুছে ফেলতে পারে। অ্যাপটা হোম স্ক্রিনে ইনস্টল করলে সাধারণত নিজে চালু হয়।</div><button class="settings-btn" onclick="safetyAskPersist()">স্থায়ী স্টোরেজ চালুর অনুরোধ করো</button>`:''}
    <div class="sf-row"><span>অ্যাপের ডেটা</span><b>${mb(ls)} MB / প্রায় ৫ MB</b></div><div class="kh-bar"><i class="${pct>=85?'over':(pct>=65?'warn':'')}" style="width:${Math.max(pct,2)}%"></i></div>
    ${pct>=65?`<div class="sf-note sf-warn">জায়গা প্রায় ভরে এসেছে — ব্যাকআপ নিয়ে পুরোনো সেশন আর্কাইভ/মুছে ফেলো।</div>`:''}
    ${est&&est.quota?`<div class="sf-row"><span>ফোনে মোট ব্যবহার</span><b>${mb(est.usage||0)} MB</b></div>`:''}
    <div class="sf-row"><span>শেষ ব্যাকআপ ফাইল</span><b>${last?safetyWhen(new Date(last).getTime()):'কখনো নেওয়া হয়নি'}</b></div>
    <button class="settings-btn" onclick="exportBackup()">💾 ব্যাকআপ ফাইল নাও (WhatsApp/Drive-এ রেখো)</button>
    <div class="settings-section-title" style="margin-top:14px;">🕰️ স্ন্যাপশট (টাইম-মেশিন)</div>
    ${idbOk?'':'<div class="sf-note sf-warn">এই ব্রাউজারে স্ন্যাপশট চালু নেই।</div>'}
    ${snaps.length?snaps.map(s=>`<div class="sf-snap"><div><b>${safetyWhen(s.ts)}</b><small>${label[s.reason]||s.reason} · ${safetySumText(s.sum)}</small></div><button class="pct-chip" onclick="safetyRestore('${s.id}')">ফেরত আনো</button></div>`).join(''):(idbOk?'<div class="sf-note">এখনো কোনো স্ন্যাপশট নেই — হিসাব লেখা শুরু করলে রোজ নিজে নিজে হবে।</div>':'')}
    <button class="settings-btn" style="margin-top:8px;" onclick="safetyManual()">📸 এখনই স্ন্যাপশট নাও</button>
    <div class="sf-note">স্ন্যাপশট এই ফোনের ব্রাউজারেই থাকে — ফোন বা ব্রাউজারের সব ডেটা মুছলে এগুলোও যাবে। তাই মাঝে মাঝে ব্যাকআপ ফাইলটা আলাদা জায়গায় রেখো।</div>`;
}
async function safetyAskPersist(){ const ok=await safetyEnsurePersist(); showSuccessToast(ok?'স্থায়ী স্টোরেজ চালু হয়েছে ✅':'ব্রাউজার এখনই অনুমতি দেয়নি — অ্যাপ ইনস্টল করে নিয়মিত ব্যবহার করলে দেবে।'); safetyRefreshCard(); }
async function safetyManual(){ const r=await safetySnapshot('manual'); showSuccessToast(r?'স্ন্যাপশট নেওয়া হয়েছে ✅':'এখনো কোনো ডেটা নেই, তাই স্ন্যাপশট হয়নি'); safetyRefreshCard(); }

function onEraseStudentData(){ safetySnapshot('before-erase');
  const name = studentModalName; if(!name) return;
  if(!confirm(`"${name}"-এর সব সেভ করা তথ্য (প্রোফাইল, অ্যাটেন্ডেন্স, প্রোগ্রেস, পেমেন্ট) স্থায়ীভাবে মুছে যাবে — এটা আর ফিরিয়ে আনা যাবে না।\n\nএগিয়ে যাবে?`)) return;
  const profiles=getStudentProfiles(); const profileSnap=profiles[name]; delete profiles[name]; lsSet('tr_students', profiles);
  const payments=getPaymentsData(); const paySnap=payments[name]; delete payments[name]; lsSet('tr_payments', payments);
  const progress=getProgressData(); const progSnap=progress[name]; delete progress[name]; lsSet('tr_progress', progress);
  const att=getAttendanceMap(); const attSnap={};
  Object.keys(att).forEach(k=>{ if(k.split('|')[2]===name){ attSnap[k]=att[k]; delete att[k]; } });
  lsSet('tr_attendance', att);
  const removed = removeStudentFromScheduleOnly(name);
  closeStudentModal();
  renderStudentsTab(); renderWeekTable(); renderDayView(); renderTodayList();
  showUndoToast(`"${name}"-এর সব তথ্য মুছে ফেলা হয়েছে।`, ()=>{
    restoreScheduleRemoval(removed);
    if(profileSnap!==undefined){ const p=getStudentProfiles(); p[name]=profileSnap; lsSet('tr_students', p); }
    if(paySnap!==undefined){ const p=getPaymentsData(); p[name]=paySnap; lsSet('tr_payments', p); }
    if(progSnap!==undefined){ const p=getProgressData(); p[name]=progSnap; lsSet('tr_progress', p); }
    const a=getAttendanceMap(); Object.assign(a, attSnap); lsSet('tr_attendance', a);
    renderStudentsTab(); renderWeekTable(); renderDayView(); renderTodayList();
  });
}
function openMoveModal(fromSlotNum){
  const date = resolvedDateForDay(activeDay);
  const fromSlot = SCHEDULE.find(s=>s.num===fromSlotNum);
  const name = getCellText(fromSlot, activeDay).trim();
  moveModalCtx = {fromSlotNum, date, name};
  document.getElementById('moveModalTitle').innerHTML = `<span class="ic">${ICN.swap}</span> ${escapeHtml(name)} — আজ কোন সময়ে নেবে?`;
  const optsWrap = document.getElementById('moveOptions');
  optsWrap.innerHTML = SCHEDULE.filter(s=>s.num!==fromSlotNum && !s.activity).map(s=>{
    const existing = effectiveContentForDate(s, activeDay, date);
    return `<button class="move-opt-btn" onclick="confirmMove('${s.num}')"><span class="mo-time">${s.label}</span><span class="mo-hint">${existing?('এখন: '+existing):'ফাঁকা আছে'}</span></button>`;
  }).join('');
  document.getElementById('moveModal').style.display='flex';
}
function closeMoveModal(){ document.getElementById('moveModal').style.display='none'; moveModalCtx=null; }
function confirmMove(toSlotNum){
  if(!moveModalCtx) return;
  const chk = typeof routineCheckMove==='function' ? routineCheckMove(moveModalCtx.date, toSlotNum, moveModalCtx.name) : null;
  if(chk && chk.level==='block'){ showWarningToast(chk.reasons.join(' ')); return; }
  if(chk && chk.level==='warn' && !confirm(chk.reasons.join('\n')+'\n\nতবুও এই সময়ে সরাতে চাও?')) return;
  createMove(moveModalCtx.date, moveModalCtx.fromSlotNum, toSlotNum, moveModalCtx.name);
  closeMoveModal();
  renderDayView(); renderNextPanel(); renderFocusCard(); renderInsights();
}

/* ---- Per-session modal: attendance (per student) + structured notes ---- */
function openNoteModal(slotNum){
  const date = resolvedDateForDay(activeDay);
  const slot = SCHEDULE.find(s=>s.num===slotNum);
  const names = getCellText(slot, activeDay).split(',').map(s=>s.trim()).filter(Boolean);
  noteModalCtx = {slotNum, date, names};
  document.getElementById('noteModalTitle').innerHTML = `<span class="ic">${ICN.note}</span> ${escapeHtml(names.join(', '))} — ${escapeHtml(slot.label)} (${bnDateLabel(date)})`;

  const attHtml = names.length ? `
    <div class="sm-section-title">🎯 উপস্থিতি</div>
    ${names.length>1?`<button type="button" class="pct-chip" style="margin-bottom:8px;" onclick="markAllPresent()">✅ সবাইকে উপস্থিত মার্ক করো</button>`:''}
    ${names.map(n=>{
      const cur = getAttendance(date, slotNum, n);
      return `<div class="att-row">
        <span class="att-name">${escapeHtml(n)}</span>
        <span class="att-btns">${Object.keys(ATT_STATUS).map(st=>`<button class="att-btn${cur===st?' active-'+st:''}" onclick="setAttendanceUI('${jsq(n)}','${st}')" data-name="${escapeHtml(n)}" data-status="${st}">${ATT_STATUS[st].icon}</button>`).join('')}</span>
      </div>`;
    }).join('')}` : '';

  const existingEntries = getNoteEntries(date, slotNum);
  noteBlockSeq = 0;
  // A student can have more than one entry per day (different subjects) — grouped under their name,
  // with a "+ আরেকটা বিষয়" button to add another block for the same student.
  const studentList = names.length ? names : [''];
  const notesHtml = studentList.map(n=>{
    const existingForStudent = names.length ? existingEntries.filter(e=>e.student===n) : existingEntries.slice(0,1);
    const toRender = existingForStudent.length ? existingForStudent : [{subject:'',taught:'',homework:'',nextPlan:''}];
    const blocksHtml = toRender.map(entry=>renderNoteBlock(n, entry)).join('');
    return `<div class="note-student-group" data-student="${escapeHtml(n)}">
      ${blocksHtml}
      ${n?`<button type="button" class="pct-chip note-add-subject-btn" onclick="addSubjectBlockForStudent('${jsq(n)}')">➕ আরেকটা বিষয় যোগ করো (${escapeHtml(n)})</button>`:''}
      ${n?`<button type="button" class="settings-btn note-copy-student-btn" style="display:none;margin-top:8px;" onclick="copyStudentNotesFromModal('${jsq(n)}')"><span class="ic">${ICN.share}</span> ${escapeHtml(n)}-এর সব বিষয় একসাথে কপি করো</button>`:''}
    </div>`;
  }).join('');

  document.getElementById('noteModalBody').innerHTML = attHtml + (`<button type="button" id="noteCopyAllBtn" class="settings-btn" style="display:none;margin:10px 0;background:rgba(230,194,122,0.1);border-color:rgba(230,194,122,0.3);color:var(--gold);" onclick="copyAllNotesFromModal()"><span class="ic">${ICN.share}</span> সবার নোট একসাথে কপি করো</button>`) + notesHtml;
  document.getElementById('noteModal').style.display='flex';
  refreshNoteShareButtons();
}
let noteBlockSeq=0;
function renderNoteBlock(n, entry){
  const id = 'b'+(noteBlockSeq++);
  const subjectOptions = n ? Object.keys(getStudentSubjects(n)) : [];
  const prevPlan = !entry.taught ? getPreviousPlanForSlot(noteModalCtx.date, noteModalCtx.slotNum, n) : '';
  const prevPlanHtml = prevPlan ? `<button type="button" class="prevplan-chip" data-plan="${escapeHtml(prevPlan)}" onclick="document.getElementById('noteTaught_${id}').value=this.dataset.plan">⬅️ গতবার পরিকল্পনা ছিল: "${escapeHtml(prevPlan)}" — ট্যাপ করে বসাও</button>` : '';
  return `
    <div class="note-student-block" data-block-id="${id}">
      ${n?`<div class="note-student-name"><span>👤 ${escapeHtml(n)}</span> <button type="button" class="ndb-copy-btn" onclick="removeNoteBlock('${id}')" title="এই বিষয়টা সরাও">✕</button></div>`:''}
      <input type="hidden" class="note-student-key" value="${escapeHtml(n)}">
      <div class="sm-field">
        <label class="sm-field-label">বিষয়</label>
        <input type="text" id="noteSubject_${id}" class="sm-field-input" placeholder="যেমন: গণিত" value="${escapeHtml(entry.subject)}" list="noteSubjectList_${id}">
        <datalist id="noteSubjectList_${id}">${subjectOptions.map(s=>`<option value="${escapeHtml(s)}">`).join('')}</datalist>
      </div>
      <div class="sm-section-title" style="margin-top:10px;">📚 পড়ানো হয়েছে <button type="button" class="voice-btn" onclick="startVoiceInput('noteTaught_${id}', this)" title="বলে লেখো"><span class="ic">${ICN.mic}</span></button></div>
      ${prevPlanHtml}
      <textarea id="noteTaught_${id}" class="note-input" rows="2" placeholder="যেমন: Quadratic Equation, Exercise 3.2">${escapeHtml(entry.taught)}</textarea>
      <div class="sm-section-title" style="margin-top:10px;">📌 হোমওয়ার্ক <button type="button" class="voice-btn" onclick="startVoiceInput('noteHomework_${id}', this)" title="বলে লেখো"><span class="ic">${ICN.mic}</span></button></div>
      <textarea id="noteHomework_${id}" class="note-input" rows="2" placeholder="যেমন: Exercise 3.2 → ১১-২০">${escapeHtml(entry.homework)}</textarea>
      <div class="sm-section-title" style="margin-top:10px;">🎯 পরের ক্লাসের পরিকল্পনা <button type="button" class="voice-btn" onclick="startVoiceInput('noteNextPlan_${id}', this)" title="বলে লেখো"><span class="ic">${ICN.mic}</span></button></div>
      <textarea id="noteNextPlan_${id}" class="note-input" rows="2" placeholder="যেমন: Revision + CQ">${escapeHtml(entry.nextPlan)}</textarea>
      <button type="button" class="settings-btn" style="margin-top:10px;" onclick="copyNoteFromModal('${id}')"><span class="ic">${ICN.share}</span> এই নোট কপি করো (WhatsApp)</button>
    </div>`;
}
function addSubjectBlockForStudent(name){
  const group = document.querySelector(`.note-student-group[data-student="${CSS.escape(name)}"]`);
  if(!group) return;
  const addBtn = group.querySelector('.note-add-subject-btn');
  const html = renderNoteBlock(name, {subject:'',taught:'',homework:'',nextPlan:''});
  addBtn.insertAdjacentHTML('beforebegin', html);
  refreshNoteShareButtons();
}
function removeNoteBlock(id){
  const block = document.querySelector(`.note-student-block[data-block-id="${id}"]`);
  if(block) block.remove();
  refreshNoteShareButtons();
}
function setAttendanceUI(name, status){
  if(!noteModalCtx) return;
  const cur = getAttendance(noteModalCtx.date, noteModalCtx.slotNum, name);
  setAttendance(noteModalCtx.date, noteModalCtx.slotNum, name, cur===status ? null : status); // tap again to clear
  updateAttButtonsInPlace(name); // update just this row's buttons — a full re-render would wipe any note text mid-typing
}
function markAllPresent(){
  if(!noteModalCtx) return;
  noteModalCtx.names.forEach(n=>{
    setAttendance(noteModalCtx.date, noteModalCtx.slotNum, n, 'present');
    updateAttButtonsInPlace(n);
  });
}
function updateAttButtonsInPlace(name){
  if(!noteModalCtx) return;
  const cur = getAttendance(noteModalCtx.date, noteModalCtx.slotNum, name);
  document.querySelectorAll(`.att-btn[data-name="${CSS.escape(name)}"]`).forEach(btn=>{
    btn.classList.toggle('active-'+btn.dataset.status, cur===btn.dataset.status);
  });
}
function closeNoteModal(){ document.getElementById('noteModal').style.display='none'; noteModalCtx=null; }
function saveNoteModal(){
  if(!noteModalCtx) return;
  const blocks = document.querySelectorAll('.note-student-block');
  const entries = Array.from(blocks).map(block=>{
    const id = block.dataset.blockId;
    return {
      student: block.querySelector('.note-student-key').value,
      subject: document.getElementById(`noteSubject_${id}`).value,
      taught: document.getElementById(`noteTaught_${id}`).value,
      homework: document.getElementById(`noteHomework_${id}`).value,
      nextPlan: document.getElementById(`noteNextPlan_${id}`).value,
    };
  });
  setNoteEntries(noteModalCtx.date, noteModalCtx.slotNum, entries);
  closeNoteModal();
  renderDayView();
  if(entries.some(e=>e.taught||e.homework||e.nextPlan)) showSuccessToast('নোট সেভ হয়েছে');
}
/* ---- Copy directly from the note-writing modal — no need to save first or hunt through the Notes ---- */
/* Database — so a note can be shared to WhatsApp the moment it's written. */
function readNoteBlockValues(id, block){
  const slot = SCHEDULE.find(s=>s.num===noteModalCtx.slotNum);
  return {
    date: noteModalCtx.date, slot,
    student: block.querySelector('.note-student-key').value,
    subject: document.getElementById(`noteSubject_${id}`).value.trim(),
    taught: document.getElementById(`noteTaught_${id}`).value.trim(),
    homework: document.getElementById(`noteHomework_${id}`).value.trim(),
    nextPlan: document.getElementById(`noteNextPlan_${id}`).value.trim(),
  };
}
function copyNoteFromModal(id){
  if(!noteModalCtx) return;
  const block = document.querySelector(`.note-student-block[data-block-id="${id}"]`);
  if(!block) return;
  const e = readNoteBlockValues(id, block);
  if(!e.taught && !e.homework && !e.nextPlan){ showWarningToast('আগে কিছু লেখো, তারপর কপি করো।'); return; }
  copyTextSmart(formatNoteEntryText(e), 'নোট কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করে পাঠাতে পারো।');
}
function copyAllNotesFromModal(){
  if(!noteModalCtx) return;
  const blocks = document.querySelectorAll('.note-student-block');
  const entries = Array.from(blocks).map(b=>readNoteBlockValues(b.dataset.blockId,b))
    .filter(e=>e.taught||e.homework||e.nextPlan);
  if(!entries.length){ showWarningToast('আগে কিছু লেখো, তারপর কপি করো।'); return; }
  copyTextSmart(formatNotesGrouped(entries), 'সবার নোট কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করে পাঠাতে পারো।');
}
function copyStudentNotesFromModal(name){
  if(!noteModalCtx) return;
  const group = document.querySelector(`.note-student-group[data-student="${CSS.escape(name)}"]`);
  if(!group) return;
  const entries = Array.from(group.querySelectorAll('.note-student-block')).map(b=>readNoteBlockValues(b.dataset.blockId,b))
    .filter(e=>e.taught||e.homework||e.nextPlan);
  if(!entries.length){ showWarningToast('আগে কিছু লেখো, তারপর কপি করো।'); return; }
  copyTextSmart(formatNoteGroupText(entries), `${name}-এর সব বিষয়ের নোট কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করে পাঠাতে পারো।`);
}
/* Show the combined-share buttons only when there is actually more than one note block to combine. */
function refreshNoteShareButtons(){
  const all=document.getElementById('noteCopyAllBtn');
  if(all) all.style.display = document.querySelectorAll('.note-student-block').length>1 ? '' : 'none';
  document.querySelectorAll('.note-student-group').forEach(g=>{
    const b=g.querySelector('.note-copy-student-btn');
    if(b) b.style.display = g.querySelectorAll('.note-student-block').length>1 ? '' : 'none';
  });
}

/* ---- Edit mode (PIN-gated self-edit of the recurring weekly template) ---- */
function renderLockStrip(){
  const el=document.getElementById('lockStrip');
  if(!el) return;
  el.className='lock-strip is-unlocked';
  el.innerHTML = `<span class="ic">${ICN.pencil}</span> <b>সম্পূর্ণ সপ্তাহ</b> ভিউতে গিয়ে যেকোনো ঘরে চাপ দিয়ে নাম বদলাও।`;
}

/* ---- First-use anchor: streak shouldn't count backward past before this app existed on the device ---- */
function getInstallDate(){
  let d = lsGet('tr_installDate', null);
  if(!d){ d = dateKeyStr(todayDateOnly()); lsSet('tr_installDate', d); }
  return d;
}

/* ---- Monthly insights + streak ---- */
function computeMonthlyInsights(){
  const now=new Date(); const firstOfMonth=new Date(now.getFullYear(), now.getMonth(), 1);
  const todayD=todayDateOnly();
  let totalMin=0;
  for(let d=new Date(firstOfMonth); d<=todayD; d=addDaysToDate(d,1)){
    const dow=DAYS[(d.getDay()+1)%7];
    SCHEDULE.forEach(slot=>{ if(effectiveContentForDate(slot,dow,d)) totalMin += (slot.end-slot.start); });
  }
  const installKey = getInstallDate();
  let streak=0, cursor=new Date(todayD);
  const st=computeStatus();
  const todayStillOngoing = st.mode==='live' || (st.mode==='next' && st.addDays===0);
  if(todayStillOngoing) cursor=addDaysToDate(cursor,-1);
  for(let guard=0; guard<3650; guard++){
    if(dateKeyStr(cursor) < installKey) break; // don't count days from before this device ever ran the app
    const dow=DAYS[(cursor.getDay()+1)%7];
    const hasAny=SCHEDULE.some(slot=>getCellText(slot,dow).trim());
    if(hasAny && !isDayFullyOff(cursor)){ streak++; cursor=addDaysToDate(cursor,-1); } else break;
  }
  let busiestDay=null, busiestMin=-1;
  DAYS.forEach(d=>{ let t=0; SCHEDULE.forEach(s=>{ if(getCellText(s,d).trim()) t+=(s.end-s.start); }); if(t>busiestMin){busiestMin=t;busiestDay=d;} });
  return { monthHrs: Math.round(totalMin/6)/10, streak, busiestDay, busiestHrs: Math.round(busiestMin/6)/10 };
}
/* ---- Pattern alerts: only speaks up when there's enough history for the comparison to mean something ---- */
function computePatternAlerts(){
  const alerts=[];
  const todayD=todayDateOnly();
  const installD = new Date(getInstallDate()+'T00:00:00');
  const daysSinceInstall = Math.round((todayD-installD)/86400000);
  const cutoff = addDaysToDate(todayD,-30) < installD ? installD : addDaysToDate(todayD,-30);

  const offMap = getOffMap();
  const events=[]; // {date, names:[...]}
  Object.keys(offMap).forEach(dateStr=>{
    const d=new Date(dateStr+'T00:00:00');
    if(d<cutoff || d>todayD) return;
    const dow=DAYS[(d.getDay()+1)%7];
    const info=offMap[dateStr];
    if(info==='all'){
      SCHEDULE.forEach(slot=>{ const n=getCellText(slot,dow).trim(); if(n) events.push({date:d, names:n.split(',').map(s=>s.trim())}); });
    } else if(Array.isArray(info)){
      info.forEach(slotNum=>{ const slot=SCHEDULE.find(s=>s.num===slotNum); if(slot){ const n=getCellText(slot,dow).trim(); if(n) events.push({date:d, names:n.split(',').map(s=>s.trim())}); } });
    }
  });

  if(daysSinceInstall>=14){
    const weekStart = addDaysToDate(todayD, -todayKeyIdx());
    const thisWeekCount = events.filter(e=>e.date>=weekStart).length;
    const priorEvents = events.filter(e=>e.date<weekStart);
    const weeksPrior = Math.max(1, Math.round((weekStart-installD)/86400000/7));
    const avgPrior = priorEvents.length/weeksPrior;
    if(thisWeekCount>=2 && thisWeekCount > avgPrior*1.5+0.5){
      alerts.push(`এই সপ্তাহে ${toBn(thisWeekCount)} বার ক্লাস বাতিল হয়েছে — স্বাভাবিকের (গড়ে ${toBn(Math.round(avgPrior*10)/10)}/সপ্তাহ) চেয়ে বেশি।`);
    }
  }

  const tally={};
  events.forEach(e=>e.names.forEach(n=>{ tally[n]=(tally[n]||0)+1; }));
  const entries=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
  if(entries.length && entries[0][1]>=3 && (entries.length===1 || entries[0][1]>=entries[1][1]+2)){
    alerts.push(`গত ৩০ দিনে "${entries[0][0]}"-এর ক্লাস সবচেয়ে বেশি (${toBn(entries[0][1])} বার) বাতিল হয়েছে।`);
  }

  return alerts;
}

/* ---- Reports tab: monthly stats + pattern alerts + makeup tracker (weekly-load chart lives in Schedule tab) ---- */
function renderWeekStatusBar(){
  const s = computeWeekClassStatus();
  if(s.total===0) return `<div class="ins-empty">এই সপ্তাহে কোনো ক্লাস নির্ধারিত নেই।</div>`;
  const pct = (n)=> Math.round((n/s.total)*100);
  return `<div class="wcs-bar">
      <div class="wcs-seg wcs-held" style="width:${pct(s.held)}%;" title="হয়ে গেছে"></div>
      <div class="wcs-seg wcs-cancel" style="width:${pct(s.cancelled)}%;" title="বাতিল"></div>
      <div class="wcs-seg wcs-pending" style="width:${pct(s.pending)}%;" title="বাকি"></div>
    </div>
    <div class="wcs-legend">
      <span><i class="wcs-dot wcs-dot-held"></i> হয়ে গেছে ${toBn(s.held)}</span>
      <span><i class="wcs-dot wcs-dot-cancel"></i> বাতিল ${toBn(s.cancelled)}</span>
      <span><i class="wcs-dot wcs-dot-pending"></i> বাকি ${toBn(s.pending)}</span>
    </div>`;
}

