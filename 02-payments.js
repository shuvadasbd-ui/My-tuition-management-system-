/* ============ PAYMENTS: monthly fee + payment history per student (Phase 5) ============ */
/* tr_payments: { studentName: { monthlyFee, payments:[{id,amount,date,monthKey,note}] } } */
function currentMonthKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthKeyLabel(mk){
  const months=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const [y,m]=mk.split('-'); return `${months[parseInt(m,10)-1]} ${toBn(y)}`;
}
function getPaymentsData(){ return lsGet('tr_payments', {}); }
/* ---- Expense tracking: simple flat list of {id, date, category, amount, note}, so income minus ---- */
/* expenses can show real net profit rather than just gross income. ---- */
const EXPENSE_CATEGORIES = [
  {key:'travel', label:'যাতায়াত'},
  {key:'materials', label:'বই/মেটেরিয়াল'},
  {key:'other', label:'অন্যান্য'},
];
function getExpenses(){ return lsGet('tr_expenses', []); }
/* ---- Session archives: "নতুন সেশন শুরু করো" snapshots all attendance/notes/payments/progress/expenses ---- */
/* into tr_archives, then clears the live copies — schedule and student profiles are untouched. Nothing ---- */
/* is ever deleted outright; an archive can be restored (which puts it back and removes the archive ---- */
/* entry) at any time from Settings → সেশন ম্যানেজমেন্ট. */
function getArchives(){ return lsGet('tr_archives', []); }
function getCurrentSessionStart(){ return lsGet('tr_currentSessionStart', lsGet('tr_installDate', dateKeyStr(todayDateOnly()))); }
function createSessionArchive(customName, dueCarryForward){
  const attSnap=JSON.parse(JSON.stringify(getAttendanceMap()));
  const notesSnap=JSON.parse(JSON.stringify(getNotes()));
  const paymentsSnap=JSON.parse(JSON.stringify(getPaymentsData()));
  const progressSnap=JSON.parse(JSON.stringify(getProgressData()));
  const expensesSnap=JSON.parse(JSON.stringify(getExpenses()));

  const startDate=getCurrentSessionStart();
  const endDate=dateKeyStr(todayDateOnly());
  const archives=getArchives();
  archives.push({
    id:'archive_'+Date.now(),
    name:(customName||'').trim() || `সেশন (${bnDateLabel(new Date(startDate+'T00:00:00'))} – ${bnDateLabel(new Date(endDate+'T00:00:00'))})`,
    createdAt:new Date().toISOString(),
    startDate, endDate,
    data:{ attendance:attSnap, notes:notesSnap, payments:paymentsSnap, progress:progressSnap, expenses:expensesSnap },
  });
  lsSet('tr_archives', archives);

  lsSet('tr_attendance', {});
  lsSet('tr_notes', {});
  lsSet('tr_progress', {});
  lsSet('tr_expenses', []);
  const newPayments={};
  Object.keys(paymentsSnap).forEach(n=>{
    newPayments[n]={ monthlyFee:paymentsSnap[n].monthlyFee||0, openingBalance:(dueCarryForward&&dueCarryForward[n])||0, payments:[] };
  });
  lsSet('tr_payments', newPayments);
  lsSet('tr_currentSessionStart', endDate);
}
function restoreArchive(archiveId){
  const archives=getArchives();
  const idx=archives.findIndex(a=>a.id===archiveId);
  if(idx<0) return false;
  const a=archives[idx];
  lsSet('tr_attendance', a.data.attendance||{});
  lsSet('tr_notes', a.data.notes||{});
  lsSet('tr_progress', a.data.progress||{});
  lsSet('tr_expenses', a.data.expenses||[]);
  lsSet('tr_payments', a.data.payments||{});
  lsSet('tr_currentSessionStart', a.startDate);
  archives.splice(idx,1);
  lsSet('tr_archives', archives);
  return true;
}
function deleteArchive(archiveId){
  lsSet('tr_archives', getArchives().filter(a=>a.id!==archiveId));
}
/* ---- Reminder notes: a plain personal to-do list (not tied to any student) — for things like ---- */
/* "call Rimi's dad" that don't belong anywhere else in the app. ---- */
function getTodos(){ return lsGet('tr_todos', []); }
function addTodo(text){
  text=(text||'').trim(); if(!text) return;
  const list=getTodos();
  list.push({id:'todo_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), text, done:false});
  lsSet('tr_todos', list);
}
function toggleTodo(id){
  const list=getTodos();
  const t=list.find(x=>x.id===id);
  if(t){ t.done=!t.done; lsSet('tr_todos', list); }
}
function deleteTodo(id){
  lsSet('tr_todos', getTodos().filter(t=>t.id!==id));
}
function renderTodoSection(){
  const todos=getTodos().slice().sort((a,b)=> (a.done===b.done)?0:(a.done?1:-1));
  const rows=todos.length ? todos.map(t=>`
    <div class="todo-row${t.done?' todo-done':''}">
      <label class="todo-check"><input type="checkbox" ${t.done?'checked':''} onchange="toggleTodo('${t.id}')"><span>${escapeHtml(t.text)}</span></label>
      <button class="ndb-copy-btn" onclick="deleteTodo('${t.id}')">✕</button>
    </div>`).join('') : `<div class="ins-empty">কোনো রিমাইন্ডার নোট নেই।</div>`;
  return `${rows}
    <div class="prog-add-form" style="margin-top:10px;">
      <input type="text" id="newTodoInput" class="sm-field-input" placeholder="যেমন: রিমির বাবাকে ফোন করো" onkeydown="if(event.key==='Enter') onAddTodo();">
      <button class="settings-btn" style="margin-top:8px;" onclick="onAddTodo()">➕ যোগ করো</button>
    </div>`;
}
function onAddTodo(){
  const input=document.getElementById('newTodoInput');
  if(!input.value.trim()) return;
  addTodo(input.value);
  input.value='';
  renderSettingsTab();
  showSuccessToast('রিমাইন্ডার যোগ হয়েছে');
}
/* ---- Data health-check: scans for things worth a teacher's attention — missing fees, likely typo'd ---- */
/* duplicate names, orphaned history for removed students — without changing anything automatically. */
function runDataHealthCheck(){
  const issues=[];
  const names=getAllKnownNames();
  const payments=getPaymentsData();
  const progress=getProgressData();
  const profiles=getStudentProfiles();
  const att=getAttendanceMap();

  names.forEach(n=>{
    if(((payments[n]||{}).monthlyFee||0)<=0) issues.push({level:'warn', text:`"${n}"-এর মাসিক ফি সেট করা নেই`});
  });
  for(let i=0;i<names.length;i++){
    for(let j=i+1;j<names.length;j++){
      if(names[i]!==names[j] && editDistance(names[i], names[j])<=1){
        issues.push({level:'warn', text:`"${names[i]}" আর "${names[j]}" নাম প্রায় একই — টাইপো হতে পারে`});
      }
    }
  }
  // Orphaned data: history exists for a name no longer anywhere in the live schedule
  const orphanCheck={};
  Object.keys(payments).forEach(n=>{ if(!names.includes(n) && ((payments[n].payments||[]).length>0 || (payments[n].openingBalance||0)>0)) orphanCheck[n]=true; });
  Object.keys(progress).forEach(n=>{ if(!names.includes(n) && Object.keys(progress[n]).length>0) orphanCheck[n]=true; });
  Object.keys(orphanCheck).forEach(n=>{
    issues.push({level:'info', text:`"${n}" এখন শিডিউলে নেই কিন্তু তার পুরনো তথ্য এখনও সেভ আছে`});
  });
  // Payment sanity: non-positive or absurd amounts (possible manual-entry mistake)
  Object.keys(payments).forEach(n=>{
    (payments[n].payments||[]).forEach(p=>{
      if(!(p.amount>0)) issues.push({level:'warn', text:`"${n}"-এর একটা পেমেন্ট এন্ট্রির পরিমাণ ঠিক নেই (${p.amount})`});
    });
  });
  // Attendance pointing at a slot number that no longer exists in the schedule (e.g. after a schedule redesign)
  const validSlotNums=new Set(SCHEDULE.map(s=>s.num));
  let orphanAttCount=0;
  Object.keys(att).forEach(k=>{ if(!validSlotNums.has(k.split('|')[1])) orphanAttCount++; });
  if(orphanAttCount>0) issues.push({level:'info', text:`${orphanAttCount}টা পুরনো অ্যাটেন্ডেন্স এন্ট্রি এমন একটা সময়ে, যেটা এখনকার শিডিউলে নেই`});
  // Chapter progress out of the normal 0-100 range (shouldn't happen via the UI, but guards against a bad import)
  Object.keys(progress).forEach(n=>{
    Object.keys(progress[n]).forEach(subj=>{
      progress[n][subj].forEach(c=>{
        if(c.pct<0 || c.pct>100) issues.push({level:'warn', text:`"${n}"-এর "${subj}" বিষয়ে "${c.chapter}" অধ্যায়ের অগ্রগতি ঠিক নেই (${c.pct}%)`});
      });
    });
  });
  // Profile date fields not in a parseable format, quietly noted (doesn't block anything, just informational)
  Object.keys(profiles).forEach(n=>{
    ['admissionDate','examDate'].forEach(k=>{
      const v=(profiles[n][k]||'').trim();
      if(v && !/^\d{4}-\d{2}-\d{2}$/.test(v)){
        issues.push({level:'info', text:`"${n}"-এর "${k==='admissionDate'?'ভর্তির তারিখ':'পরীক্ষার তারিখ'}" YYYY-MM-DD ফরম্যাটে নেই, তাই রিমাইন্ডার ফিচার এটা ধরতে পারবে না`});
      }
    });
  });
  // Storage usage estimate
  try{
    let totalBytes=0;
    for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); totalBytes+=(k.length+(localStorage.getItem(k)||'').length)*2; }
    const mb=totalBytes/1024/1024;
    if(mb>3) issues.push({level:'warn', text:`লোকাল স্টোরেজ প্রায় ${mb.toFixed(1)}MB ব্যবহার হচ্ছে — অনেক ছবি যোগ করলে ভবিষ্যতে জায়গা কমে যেতে পারে`});
  }catch(e){}
  // Backup staleness folded in here too
  const lastBackup=lsGet('tr_lastBackupAt', null);
  if(!lastBackup) issues.push({level:'warn', text:'এখনো কোনো ব্যাকআপ নেওয়া হয়নি'});
  else{
    const days=Math.floor((Date.now()-new Date(lastBackup).getTime())/86400000);
    if(days>14) issues.push({level:'warn', text:`সর্বশেষ ব্যাকআপ ${toBn(days)} দিন আগে — নতুন করে একটা নিয়ে রাখো`});
  }
  const dueList=computeDueList();
  if(dueList.length>0) issues.push({level:'info', text:`${dueList.length} জনের পেমেন্ট বাকি আছে (Reports-এ দেখো)`});
  return issues;
}
function showDataHealthCheck(){
  const issues=runDataHealthCheck();
  const html = issues.length ? issues.map(i=>`<div class="makeup-row"><span>${i.level==='warn'?'⚠️':'ℹ️'} ${escapeHtml(i.text)}</span></div>`).join('') : `<div class="ins-empty">কোনো সমস্যা পাওয়া যায়নি — সব ঠিক আছে। 🎉</div>`;
  document.getElementById('yirBody').innerHTML = `
    <div class="modal-title" style="text-align:center;">🩺 ডেটা হেলথ-চেক</div>
    <div style="margin-top:10px;">${html}</div>`;
  document.getElementById('yirModal').style.display='flex';
}
/* ---- End-of-day summary: how many of today's classes actually got logged, how many notes are still ---- */
/* pending, and any payments received today — a quick end-of-day glance. */
function computeDaySummary(date){
  const dayKey=DAYS[(date.getDay()+1)%7];
  const dk=dateKeyStr(date);
  const notes=getNotes(), att=getAttendanceMap();
  let heldCount=0, totalCount=0, notesWritten=0;
  SCHEDULE.forEach(slot=>{
    const content=effectiveContentForDate(slot, dayKey, date);
    if(!content || isOffOn(date, slot.num)) return;
    totalCount++;
    const hasNote=!!notes[dk+'|'+slot.num];
    const hasAtt=Object.keys(att).some(k=>k.startsWith(dk+'|'+slot.num+'|'));
    if(hasNote||hasAtt) heldCount++;
    if(hasNote) notesWritten++;
  });
  let paymentsReceived=0, paymentAmount=0;
  Object.values(getPaymentsData()).forEach(p=>{
    (p.payments||[]).forEach(pay=>{ if(pay.date===dk){ paymentsReceived++; paymentAmount+=pay.amount; } });
  });
  return {heldCount, totalCount, notesWritten, pendingNotes:Math.max(0,totalCount-notesWritten), paymentsReceived, paymentAmount};
}
function showDaySummary(){
  const s=computeDaySummary(todayDateOnly());
  const amtText = isFinanceHidden() ? '৳ ••••' : bnTaka(s.paymentAmount);
  document.getElementById('yirBody').innerHTML = `
    <div class="modal-title" style="text-align:center;">📊 আজকের সারাংশ</div>
    <div class="yir-grid">
      <div class="yir-item"><div class="yir-num">${toBn(s.heldCount)}/${toBn(s.totalCount)}</div><div class="yir-lb">ক্লাস লগ করা হয়েছে</div></div>
      <div class="yir-item"><div class="yir-num" style="color:${s.pendingNotes>0?'var(--gold)':'var(--paid)'};">${toBn(s.pendingNotes)}</div><div class="yir-lb">নোট এখনো বাকি</div></div>
      <div class="yir-item"><div class="yir-num">${toBn(s.paymentsReceived)}</div><div class="yir-lb">আজকের পেমেন্ট সংখ্যা</div></div>
      <div class="yir-item"><div class="yir-num" style="color:var(--paid);">${amtText}</div><div class="yir-lb">আজ যা পেয়েছ</div></div>
    </div>`;
  document.getElementById('yirModal').style.display='flex';
}
/* ---- Session Manager UI: shows current session info + past archives, and walks through the ---- */
/* "start a new session" flow (backup reminder -> per-student due carry-forward -> confirm). ---- */
function openSessionManager(){
  document.getElementById('sessionModal').style.display='flex';
  renderSessionManagerMain();
}
function closeSessionManager(){ document.getElementById('sessionModal').style.display='none'; }
function renderSessionManagerMain(){
  const start=getCurrentSessionStart();
  const stats=computeStatsFromRawData(getAttendanceMap(), getNotes(), getPaymentsData(), getProgressData());
  const archives=getArchives().slice().sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
  const archiveRows = archives.length ? archives.map(a=>{
    const s=computeStatsFromRawData(a.data.attendance||{},a.data.notes||{},a.data.payments||{},a.data.progress||{});
    return `
    <div class="ndb-entry">
      <div class="ndb-entry-top"><span class="ndb-entry-names">${escapeHtml(a.name)}</span></div>
      <div class="ndb-entry-line">${toBn(s.studentNames.size)} জন শিক্ষার্থী · ${toBn(Math.round(s.totalHours))} ঘণ্টা</div>
      <div class="pct-chip-row" style="margin-top:8px;">
        <button type="button" class="pct-chip" onclick="viewArchive('${a.id}')">👁️ দেখো</button>
        <button type="button" class="pct-chip" onclick="confirmRestoreArchive('${a.id}')">↩️ ফিরিয়ে আনো</button>
        <button type="button" class="pct-chip" style="color:var(--due);" onclick="confirmDeleteArchive('${a.id}')">🗑️ মুছো</button>
      </div>
    </div>`;
  }).join('') : `<div class="ins-empty">এখনো কোনো আর্কাইভ নেই।</div>`;

  document.getElementById('sessionModalBody').innerHTML = `
    <div class="ssum-card">
      <div class="ssum-row">
        <div class="ssum-item"><div class="ssum-num" style="font-size:13px;">${bnDateLabel(new Date(start+'T00:00:00'))}</div><div class="ssum-lb">চলতি সেশন শুরু</div></div>
        <div class="ssum-item"><div class="ssum-num">${toBn(stats.studentNames.size)}</div><div class="ssum-lb">সক্রিয় শিক্ষার্থী</div></div>
        <div class="ssum-item"><div class="ssum-num">${toBn(Math.round(stats.totalHours))}</div><div class="ssum-lb">ঘণ্টা পড়ানো</div></div>
      </div>
    </div>
    <button class="settings-btn" style="background:rgba(230,194,122,0.1);border-color:rgba(230,194,122,0.3);color:var(--gold);margin-bottom:16px;" onclick="startNewSessionFlow()">🆕 নতুন সেশন শুরু করো</button>
    <div class="sm-section-title">📚 পুরনো আর্কাইভ</div>
    ${archiveRows}`;
}
function startNewSessionFlow(){
  const dueList = getAllKnownNames().map(n=>({name:n, due:getStudentTotalDue(n)})).filter(x=>x.due>0);
  const dueRows = dueList.map(x=>`
    <label class="toggle-row" style="margin-top:6px;">
      <span>${escapeHtml(x.name)} — ${bnTaka(x.due)}</span>
      <input type="checkbox" class="carry-due-cb" data-name="${escapeHtml(x.name)}" data-amount="${x.due}" checked>
    </label>`).join('');
  document.getElementById('sessionModalBody').innerHTML = `
    <div class="prevplan-chip" style="display:block;">⚠️ এগিয়ে যাওয়ার আগে একটা ব্যাকআপ ডাউনলোড করে নাও, যাতে কোনো ভুল হলেও ফিরিয়ে আনা যায়।</div>
    <button class="settings-btn" onclick="exportBackup()">⬇️ ব্যাকআপ ডাউনলোড করো</button>
    ${dueList.length ? `
      <div class="sm-section-title" style="margin-top:14px;">💰 কার বকেয়া নতুন সেশনে নেবে?</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">টিক দেওয়া থাকলে সেই বকেয়া "আগের বকেয়া" হিসেবে নতুন সেশনে চলে যাবে।</div>
      ${dueRows}
    ` : `<div class="ins-empty" style="margin-top:14px;">কারো বকেয়া নেই — সবাই পরিশোধিত।</div>`}
    <div class="sm-field" style="margin-top:14px;">
      <label class="sm-field-label">এই সেশনের একটা নাম দাও (ঐচ্ছিক)</label>
      <input type="text" id="newSessionName" class="sm-field-input" placeholder="যেমন: জানু–জুন ২০২৬">
    </div>
    <div class="modal-actions">
      <button class="modal-btn secondary" onclick="renderSessionManagerMain()">বাতিল</button>
      <button class="modal-btn primary" onclick="confirmNewSession()">নিশ্চিত করো</button>
    </div>`;
}
function confirmNewSession(){
  if(!confirm('নতুন সেশন শুরু করলে চলতি অ্যাটেন্ডেন্স/নোট/পেমেন্ট/প্রগ্রেস আর্কাইভ হয়ে যাবে (মুছে যাবে না, পরে দেখা/ফিরিয়ে আনা যাবে)। এগিয়ে যাবে?')) return;
  const carryForward={};
  document.querySelectorAll('.carry-due-cb').forEach(cb=>{
    if(cb.checked) carryForward[cb.dataset.name]=parseFloat(cb.dataset.amount)||0;
  });
  const name=document.getElementById('newSessionName').value;
  createSessionArchive(name, carryForward);
  closeSessionManager();
  renderStudentsTab(); renderInsights(); renderSettingsTab();
  showSuccessToast('নতুন সেশন শুরু হয়েছে');
}
function viewArchive(archiveId){
  const a=getArchives().find(x=>x.id===archiveId);
  if(!a) return;
  const stats=computeStatsFromRawData(a.data.attendance||{}, a.data.notes||{}, a.data.payments||{}, a.data.progress||{});
  const totalExp=(a.data.expenses||[]).reduce((s,e)=>s+e.amount,0);
  document.getElementById('sessionModalBody').innerHTML = `
    <div class="modal-title">${escapeHtml(a.name)}</div>
    <div class="ssum-card">
      <div class="ssum-row">
        <div class="ssum-item"><div class="ssum-num">${toBn(stats.studentNames.size)}</div><div class="ssum-lb">শিক্ষার্থী</div></div>
        <div class="ssum-item"><div class="ssum-num">${toBn(Math.round(stats.totalHours))}</div><div class="ssum-lb">ঘণ্টা</div></div>
        <div class="ssum-item"><div class="ssum-num" style="color:var(--paid);">${bnTaka(stats.totalIncome)}</div><div class="ssum-lb">আয়</div></div>
        <div class="ssum-item"><div class="ssum-num" style="color:var(--due);">${bnTaka(totalExp)}</div><div class="ssum-lb">খরচ</div></div>
      </div>
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin-top:10px;">শিক্ষার্থী: ${Array.from(stats.studentNames).map(escapeHtml).join(', ')||'—'}</div>
    <div class="modal-actions" style="margin-top:14px;">
      <button class="modal-btn secondary" onclick="renderSessionManagerMain()">ফিরে যাও</button>
      <button class="modal-btn primary" onclick="confirmRestoreArchive('${a.id}')">↩️ ফিরিয়ে আনো</button>
    </div>`;
}
function confirmRestoreArchive(archiveId){
  if(!confirm('এই আর্কাইভ ফিরিয়ে আনলে চলতি সেশনের অ্যাটেন্ডেন্স/নোট/পেমেন্ট/প্রগ্রেস এই আর্কাইভের ডেটা দিয়ে বদলে যাবে। এগিয়ে যাওয়ার আগে চলতি অবস্থার একটা ব্যাকআপ নিয়ে রাখা ভালো। এগিয়ে যাবে?')) return;
  restoreArchive(archiveId);
  closeSessionManager();
  renderStudentsTab(); renderInsights(); renderSettingsTab();
  showSuccessToast('আর্কাইভ ফিরিয়ে আনা হয়েছে');
}
function confirmDeleteArchive(archiveId){
  if(!confirm('এই আর্কাইভ স্থায়ীভাবে মুছে ফেলবে? এটা আর ফিরিয়ে আনা যাবে না।')) return;
  deleteArchive(archiveId);
  renderSessionManagerMain();
}
function addExpense(date, category, amount, note){
  const list = getExpenses();
  list.push({id:'exp_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), date, category, amount:Math.round(amount), note:(note||'').trim()});
  lsSet('tr_expenses', list);
}
function deleteExpense(id){
  const list = getExpenses().filter(e=>e.id!==id);
  lsSet('tr_expenses', list);
}
function getExpensesForMonth(monthKey){
  return getExpenses().filter(e=>e.date.startsWith(monthKey));
}
function getTotalExpensesForMonth(monthKey){
  return getExpensesForMonth(monthKey).reduce((s,e)=>s+e.amount,0);
}
function getStudentPayment(name){
  const p=getPaymentsData()[name];
  if(!p || typeof p!=='object') return {monthlyFee:0, openingBalance:0, payments:[]};
  // tolerate old/partial records (e.g. restored from an older backup) so one bad entry can't break every screen
  if(!Array.isArray(p.payments)) p.payments=[];
  if(typeof p.monthlyFee!=='number') p.monthlyFee=parseFloat(p.monthlyFee)||0;
  if(typeof p.openingBalance!=='number') p.openingBalance=parseFloat(p.openingBalance)||0;
  return p;
}
/* ---- V74: একটাই জায়গায় "এই মাসে আসলে কত দেয়" = মাসিক ফি + অনুমোদিত অতিরিক্ত চার্জ − ছাড়/সমন্বয় (tr_adjust)। ---- */
/* সব হিসাব (বকেয়া, প্রত্যাশিত, রিপোর্ট) এটাই ব্যবহার করে — আলাদা আলাদা জায়গায় নিজের মতো গুণে না। বাতিল (voided) সমন্বয় ধরা হয় না। */
function feeAdjNet(name, monthKey, list){
  list = list || lsGet('tr_adjust', []); if(!Array.isArray(list)) return 0;
  return list.filter(a=>a && !a.voided && a.student===name && a.monthKey===monthKey).reduce((s,a)=>s+(a.kind==='discount'?-1:1)*(Number(a.amount)||0),0);
}
function feeEffective(name, monthKey){ return Math.max(0, getStudentPayment(name).monthlyFee + feeAdjNet(name, monthKey)); }
function setMonthlyFee(name, fee){
  const data=getPaymentsData();
  data[name]=data[name]||{monthlyFee:0,openingBalance:0,payments:[]};
  data[name].monthlyFee=Math.max(0, parseFloat(fee)||0);
  lsSet('tr_payments', data);
}
/* ---- Opening balance: a manually-set "previous due" figure — for debt that existed before this app ---- */
/* was used, or as a simple running adjustment. Reduced directly when a payment is marked "against ---- */
/* previous due" instead of a specific month, so it never depends on fragile historical reconstruction. */
function setOpeningBalance(name, amount){
  const data=getPaymentsData();
  data[name]=data[name]||{monthlyFee:0,openingBalance:0,payments:[]};
  data[name].openingBalance=Math.max(0, parseFloat(amount)||0);
  lsSet('tr_payments', data);
}
/* ---- V74: পেমেন্টে ঐচ্ছিক ref (যেমন bKash TrxID) — একই ref দ্বিতীয়বার এলে যোগ হয় না (ইমপোর্ট/SMS-এ দ্বিগুণ হওয়া ঠেকায়) ---- */
function payRefExists(rec, ref){ ref=String(ref||'').trim(); if(!ref||!rec) return false; return (rec.payments||[]).some(p=>p.ref===ref) || (rec.voided||[]).some(p=>p.ref===ref); }
/* খুব কাছাকাছি সময়ে একই টাকা/মাস/পদ্ধতির পেমেন্ট আছে কি (ভুলে দুবার চাপা) — শুধু সতর্কতার জন্য */
function payLooksDuplicate(name, amount, monthKey, method, withinMs){
  const lim=Date.now()-(withinMs||120000); amount=parseFloat(amount)||0;
  return getStudentPayment(name).payments.some(p=>p.at && p.at>=lim && p.amount===amount && p.monthKey===(monthKey||currentMonthKey()) && (p.method||'নগদ')===(method||'নগদ'));
}
function addPayment(name, amount, monthKey, note, applyToOpeningBalance, method, ref){
  amount=parseFloat(amount)||0; if(amount<=0) return null;
  const data=getPaymentsData();
  data[name]=data[name]||{monthlyFee:0,openingBalance:0,payments:[]};
  ref=String(ref||'').trim();
  if(ref && payRefExists(data[name], ref)) return null;          // এই লেনদেন আগেই আছে
  method=(method||'নগদ').trim();
  const no=(lsGet('tr_receiptSeq',0)||0)+1; lsSet('tr_receiptSeq', no);
  const id=Date.now()+'_'+Math.random().toString(36).slice(2,7);
  const rec={id, amount, date:dateKeyStr(todayDateOnly()), monthKey: applyToOpeningBalance?'opening':(monthKey||currentMonthKey()), note:(note||'').trim(), method, no, at:Date.now()};
  if(ref) rec.ref=ref;
  if(applyToOpeningBalance) data[name].openingBalance=Math.max(0, (data[name].openingBalance||0)-amount);
  data[name].payments.push(rec);
  lsSet('tr_payments', data);
  return id;
}
/* V74: মুছলে পেমেন্টটা "বাতিল তালিকা"য় (voided) চলে যায় — হিসাব থেকে বাদ, কিন্তু ইতিহাস থাকে এবং ফিরিয়ে আনা যায়। */
function deletePayment(name, paymentId, reason){
  const data=getPaymentsData();
  if(!data[name]) return;
  const removed=data[name].payments.find(p=>p.id===paymentId);
  if(removed && removed.monthKey==='opening'){
    data[name].openingBalance=(data[name].openingBalance||0)+removed.amount;
  }
  data[name].payments=(data[name].payments||[]).filter(p=>p.id!==paymentId);
  if(removed){
    data[name].voided=Array.isArray(data[name].voided)?data[name].voided:[];
    data[name].voided.push(Object.assign({}, removed, {voidedAt:Date.now(), voidReason:String(reason||'').trim()}));
    if(typeof tombAdd==='function') tombAdd('pay', paymentId);
  }
  lsSet('tr_payments', data);
}
function restorePayment(name, paymentId){
  const data=getPaymentsData(); const rec=data[name]; if(!rec || !Array.isArray(rec.voided)) return false;
  const v=rec.voided.find(p=>p.id===paymentId); if(!v) return false;
  const back=Object.assign({}, v); delete back.voidedAt; delete back.voidReason;
  if(back.monthKey==='opening') rec.openingBalance=Math.max(0,(rec.openingBalance||0)-back.amount);
  rec.payments=Array.isArray(rec.payments)?rec.payments:[]; rec.payments.push(back);
  rec.voided=rec.voided.filter(p=>p.id!==paymentId);
  lsSet('tr_payments', data); if(typeof tombClear==='function') tombClear('pay', paymentId); return true;
}
/* ---- Also checks archives for that month's payments, so if a session was reset mid-month, ---- */
/* payments made just before the reset still count toward that month (both in the 6-month trend ---- */
/* chart and in "how much is still due this month" — otherwise it could look double-billed). ---- */
function getStudentPaidForMonth(name, monthKey){
  let total = getStudentPayment(name).payments.filter(p=>p.monthKey===monthKey).reduce((s,p)=>s+p.amount,0);
  getArchives().forEach(a=>{
    const p=(a.data.payments||{})[name];
    if(p && p.payments) total += p.payments.filter(pp=>pp.monthKey===monthKey).reduce((s,pp)=>s+pp.amount,0);
  });
  return total;
}
function getStudentDueForMonth(name, monthKey){
  return Math.max(0, feeEffective(name, monthKey) - getStudentPaidForMonth(name, monthKey));
}
/* ---- Total due: this month's shortfall plus whatever's left of the opening balance — the single ---- */
/* "everything they owe, all together" figure, shown separately from the month-by-month breakdown. */
function getStudentTotalDue(name){
  const pay=getStudentPayment(name);
  return (pay.openingBalance||0) + getStudentDueForMonth(name, currentMonthKey());
}
/* ---- Late fee: an optional flat amount added on top of the due, once the configured day of the ---- */
/* month has passed with the fee still unpaid. Purely a suggested "amount to collect" — it never ---- */
/* changes what's actually recorded as owed unless a payment is logged. */
function getLateFeeConfig(){ return lsGet('tr_lateFee', {enabled:false, amount:100, afterDay:10}); }
function isDueLate(monthKey){
  const cfg=getLateFeeConfig();
  if(!cfg.enabled) return false;
  const cur=currentMonthKey();
  if(monthKey<cur) return true;
  if(monthKey>cur) return false;
  return todayDateOnly().getDate() > cfg.afterDay;
}
function getStudentDueWithLateFee(name, monthKey){
  const base = monthKey===currentMonthKey() ? getStudentTotalDue(name) : getStudentDueForMonth(name, monthKey);
  if(base<=0) return {due:base, late:false};
  const cfg=getLateFeeConfig();
  const late=isDueLate(monthKey);
  return {due: late ? base+cfg.amount : base, late};
}
function computeMonthlyIncomeStats(monthKey){
  let totalExpected=0, totalPaid=0;
  getAllKnownNames().forEach(name=>{
    totalExpected += feeEffective(name, monthKey);
    totalPaid += getStudentPaidForMonth(name, monthKey);
  });
  return {totalExpected, totalPaid, totalDue: Math.max(0, totalExpected-totalPaid)};
}
/* ---- How this month's collection breaks down by payment method (cash/bKash/bank/other). ---- */
function computePaymentMethodBreakdown(monthKey){
  const totals={};
  Object.values(getPaymentsData()).forEach(p=>{
    (p.payments||[]).forEach(pay=>{
      if(pay.monthKey!==monthKey) return;
      const m=pay.method||'নগদ';
      totals[m]=(totals[m]||0)+pay.amount;
    });
  });
  return totals;
}
function renderPaymentMethodBreakdown(mk){
  const totals=computePaymentMethodBreakdown(mk);
  const keys=Object.keys(totals);
  if(keys.length===0) return `<div class="ins-empty">এই মাসে এখনো কোনো পেমেন্ট আসেনি।</div>`;
  return keys.map(m=>`<div class="makeup-row"><span>${escapeHtml(m)}</span><span class="pay-history-amt">${bnTaka(totals[m])}</span></div>`).join('');
}
/* ---- Notification Center: pulls together everything already computed elsewhere (due payments, ---- */
/* absence-risk pattern, upcoming deadlines, pending notes, open reminders) into one scannable list, ---- */
/* instead of it being scattered across Home banners, Reports, and Settings. */
function collectNotificationItems(){
  const items=[];
  const dueList=computeDueList();
  if(dueList.length>0){
    const total=dueList.reduce((s,x)=>s+x.due,0);
    items.push({icon:'💰', text:`${toBn(dueList.length)} জনের পেমেন্ট বাকি — মোট ${isFinanceHidden()?'৳ ••••':bnTaka(total)}`, action:()=>{closeNotificationCenter();switchTab('reports');}});
  }
  computeAbsenceRiskToday().forEach(name=>{
    items.push({icon:'⚠️', text:`"${name}" গত ৩ ক্লাসে অনুপস্থিত ছিল — আজও নাও থাকতে পারে`, action:()=>{closeNotificationCenter();openStudentModal(name);}});
  });
  if(typeof computeAbsenceStreaks==='function'){ try{ const _risk=computeAbsenceRiskToday(); computeAbsenceStreaks(3).filter(x=>!_risk.includes(x.name)).forEach(x=>{ items.push({icon:'🔴', text:`"${x.name}" পরপর ${toBn(x.streak)}টা ক্লাসে অনুপস্থিত — খোঁজ নেওয়া ভালো`, action:()=>{closeNotificationCenter();openStudentModal(x.name);}}); }); }catch(e){} }
  const daySum=computeDaySummary(todayDateOnly());
  if(daySum.pendingNotes>0){
    items.push({icon:'📝', text:`আজ ${toBn(daySum.pendingNotes)}টা ক্লাসের নোট এখনো লেখা হয়নি`, action:()=>{closeNotificationCenter();switchTab('schedule');}});
  }
  collectUpcomingDeadlines().slice(0,8).forEach(it=>{
    const days=Math.round((new Date(it.date+'T00:00:00')-todayDateOnly())/86400000);
    if(days<-7 || days>14) return; // keep the list focused on what's actually near
    const label = it.kind==='exam' ? `"${it.name}"-এর পরীক্ষা` : it.kind==='renewal' ? `"${it.name}"-এর ভর্তির ${toBn(it.years)} বছর পূর্ণ` : `"${it.name}"-এর "${it.chapter}" এর টার্গেট`;
    items.push({icon: it.kind==='exam'?'📝':it.kind==='renewal'?'🔁':'🎯', text:`${label} — ${bnDateLabel(new Date(it.date+'T00:00:00'))}`, action:()=>{closeNotificationCenter();switchTab('students');openStudentModal(it.name);}});
  });
  getTodos().filter(t=>!t.done).forEach(t=>{
    items.push({icon:'📌', text:t.text, action:()=>{closeNotificationCenter();switchTab('settings');}});
  });
  return items;
}
function updateNotifCenterBadge(){
  const badge=document.getElementById('notifCenterBadge');
  if(!badge) return;
  const n=collectNotificationItems().length;
  if(n>0){ badge.textContent=n>99?'99+':toBn(Math.min(n,99)); badge.style.display='flex'; }
  else badge.style.display='none';
}
function openNotificationCenter(){
  const items=collectNotificationItems();
  const body=document.getElementById('notifCenterBody');
  body.innerHTML = items.length ? items.map((it,i)=>`
    <div class="makeup-row" style="cursor:pointer;" onclick="notifCenterItemActions[${i}]()">
      <span>${it.icon} ${escapeHtml(it.text)}</span>
    </div>`).join('') : `<div class="ins-empty">এখন কোনো নোটিফিকেশন নেই — সব ঠিক আছে। 🎉</div>`;
  window.notifCenterItemActions = items.map(it=>it.action);
  document.getElementById('notifCenterModal').style.display='flex';
}
function closeNotificationCenter(){ document.getElementById('notifCenterModal').style.display='none'; }
function renderExpenseSection(mk){
  const stats = computeMonthlyIncomeStats(mk);
  const expenses = getExpensesForMonth(mk).sort((a,b)=> a.date<b.date?1:-1);
  const totalExp = expenses.reduce((s,e)=>s+e.amount,0);
  const net = stats.totalPaid - totalExp;
  const hide = isFinanceHidden();
  const fmt = (n)=> hide ? '৳ ••••' : bnTaka(n);
  const rows = expenses.map(e=>{
    const catLabel = (EXPENSE_CATEGORIES.find(c=>c.key===e.category)||{}).label || e.category;
    return `<div class="makeup-row">
      <span>${bnDateLabel(new Date(e.date+'T00:00:00'))} · ${escapeHtml(catLabel)}${e.note?' · '+escapeHtml(e.note):''}</span>
      <span class="pay-history-amt">${fmt(e.amount)} <button class="ndb-copy-btn" style="margin-left:6px;" onclick="onDeleteExpense('${e.id}')" title="মুছো">✕</button></span>
    </div>`;
  }).join('');
  return `
    <div class="ssum-row" style="margin-bottom:12px;">
      <div class="ssum-item"><div class="ssum-num" style="color:var(--paid);">${fmt(stats.totalPaid)}</div><div class="ssum-lb">আয়</div></div>
      <div class="ssum-item"><div class="ssum-num" style="color:var(--due);">${fmt(totalExp)}</div><div class="ssum-lb">খরচ</div></div>
      <div class="ssum-item"><div class="ssum-num" style="color:${net>=0?'var(--paid)':'var(--due)'};">${fmt(net)}</div><div class="ssum-lb">নিট লাভ</div></div>
    </div>
    ${rows || `<div class="ins-empty">এই মাসে কোনো খরচ যোগ করা হয়নি।</div>`}
    <div class="prog-add-form" style="margin-top:10px;">
      <input type="text" inputmode="none" id="exp_amount" class="sm-field-input" placeholder="টাকার পরিমাণ (যেমন ২৫০+১৩০×২)" autocomplete="off" oninput="calcPreview('exp_amount')">${calcPadHtml('exp_amount')}
      <input type="hidden" id="exp_category" value="${EXPENSE_CATEGORIES[0].key}">
      <div class="pct-chip-row" id="exp_category_chips" style="margin-top:6px;">
        ${EXPENSE_CATEGORIES.map((c,i)=>`<button type="button" class="pct-chip${i===0?' active':''}" onclick="selectPctChip('exp_category_chips','exp_category','${c.key}',this)">${c.label}</button>`).join('')}
      </div>
      <input type="text" id="exp_note" class="sm-field-input" placeholder="নোট (ঐচ্ছিক)" style="margin-top:6px;">
      <button class="settings-btn" style="margin-top:8px;" onclick="onAddExpense()">➕ খরচ যোগ করো</button>
    </div>`;
}
function onAddExpense(){
  const amount = calcAmt('exp_amount');
  if(!amount || amount<=0){ showWarningToast('সঠিক পরিমাণ লেখো।'); return; }
  const category = document.getElementById('exp_category').value;
  const note = document.getElementById('exp_note').value;
  addExpense(dateKeyStr(todayDateOnly()), category, amount, note);
  renderInsights();
  showSuccessToast('খরচ যোগ হয়েছে');
}
function onDeleteExpense(id){
  if(!confirm('এই খরচটা মুছে ফেলবে?')) return;
  deleteExpense(id);
  renderInsights();
}
/* ---- Revenue trend: last 6 months of paid vs. due, built from the same payment records already ---- */
/* tracked in Settings/Reports — no new data entry needed. */
function monthKeyLabelShort(mk){
  const months=['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্ট','অক্টো','নভে','ডিসে'];
  const [,m]=mk.split('-'); return months[parseInt(m,10)-1];
}
function computeLast6MonthsIncome(){
  const out=[]; const now=new Date();
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mk=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    out.push({mk, label:monthKeyLabelShort(mk), ...computeMonthlyIncomeStats(mk)});
  }
  return out;
}
function renderRevenueChart(){
  const data = computeLast6MonthsIncome();
  const maxVal = Math.max(1, ...data.map(d=>Math.max(d.totalExpected, d.totalPaid)));
  const totalPaid6mo = data.reduce((s,d)=>s+d.totalPaid,0);
  if(totalPaid6mo<=0 && data.every(d=>d.totalExpected<=0)){
    return `<div class="ins-empty">এখনো কোনো আয়ের হিসাব নেই — শিক্ষার্থী প্রোফাইলে মাসিক ফি আর পেমেন্ট যোগ করলে এখানে ট্রেন্ড দেখাবে।</div>`;
  }
  const bars = data.map(d=>{
    const paidH = Math.round((d.totalPaid/maxVal)*100);
    const dueH = Math.round((d.totalDue/maxVal)*100);
    return `<div class="rev-col">
      <div class="rev-bar-wrap">
        <div class="rev-bar rev-bar-due" style="height:${dueH}%;bottom:${paidH}%;"></div>
        <div class="rev-bar rev-bar-paid" style="height:${paidH}%;bottom:0;"></div>
      </div>
      <div class="rev-col-lb">${d.label}</div>
    </div>`;
  }).join('');
  return `<div class="rev-chart-wrap">
    <div class="rev-chart">${bars}</div>
    <div class="rev-legend"><span><i class="rev-dot rev-dot-paid"></i> পরিশোধিত</span><span><i class="rev-dot rev-dot-due"></i> বাকি</span></div>
    <div class="rev-total">গত ৬ মাসে সর্বমোট পরিশোধ: <b>${bnTaka(totalPaid6mo)}</b></div>
  </div>`;
}
/* ---- Per-student summary: total classes taken, attendance rate, lifetime paid & current due, ---- */
/* pulled together from data already tracked (attendance + payments), for the student's profile card. */
/* ---- Teaching streak: consecutive days (up to and including today, or yesterday if today hasn't ---- */
/* happened yet) that had at least one attendance mark or note logged — a small motivational nudge. */
function computeTeachingStreak(){
  const att=getAttendanceMap(), notes=getNotes();
  const active=new Set();
  Object.keys(att).forEach(k=>active.add(k.split('|')[0]));
  Object.keys(notes).forEach(k=>active.add(k.split('|')[0]));
  let cursor=todayDateOnly();
  if(!active.has(dateKeyStr(cursor))){ cursor=new Date(cursor); cursor.setDate(cursor.getDate()-1); }
  let streak=0;
  while(active.has(dateKeyStr(cursor))){ streak++; cursor=new Date(cursor); cursor.setDate(cursor.getDate()-1); }
  return streak;
}
/* ---- This week's class status: how many scheduled sessions were actually held (attendance/note ---- */
/* logged) vs. cancelled vs. still pending, using data already tracked — no new entry required. */
function computeWeekClassStatus(){
  const notes=getNotes(), att=getAttendanceMap();
  const weekStart = addDaysToDate(todayDateOnly(), -todayKeyIdx());
  let held=0, cancelled=0, pending=0;
  for(let i=0;i<7;i++){
    const d = addDaysToDate(weekStart, i);
    const dayKey = DAYS[(d.getDay()+1)%7];
    const dk = dateKeyStr(d);
    SCHEDULE.forEach(slot=>{
      const content = effectiveContentForDate(slot, dayKey, d);
      if(!content) return; // nothing scheduled here
      const cancelledHere = isOffOn(d, slot.num);
      if(cancelledHere){ cancelled++; return; }
      const noteKey = dk+'|'+slot.num;
      const hasNote = !!notes[noteKey];
      const hasAttendance = Object.keys(att).some(k=>k.startsWith(dk+'|'+slot.num+'|'));
      if(hasNote || hasAttendance) held++; else pending++;
    });
  }
  return {held, cancelled, pending, total:held+cancelled+pending};
}
/* ---- Merges live data with every archived session for one student, so profile totals (lifetime ---- */
/* paid, since-when, attendance count) stay accurate across a session reset instead of looking reset. */
function computeStudentSummary(name){
  let present=0, absent=0, late=0, resched=0, excused=0, cancelled=0, earliest=null, latest=null, lifetimePaid=0;
  function accumulateAttendance(att){
    Object.keys(att).forEach(k=>{
      const parts=k.split('|');
      if(parts[2]!==name) return;
      const status=att[k];
      if(status==='present') present++;
      else if(status==='absent') absent++;
      else if(status==='late') late++;
      else if(status==='resched') resched++;
      else if(status==='excused') excused++;
      else if(status==='cancelled') cancelled++;
      if(status!=='cancelled'){
        if(!earliest || parts[0]<earliest) earliest=parts[0];
        if(!latest || parts[0]>latest) latest=parts[0];
      }
    });
  }
  function accumulatePayments(paymentsData){
    const p=paymentsData[name];
    if(p && p.payments) lifetimePaid += p.payments.reduce((s,pp)=>s+pp.amount,0);
  }
  accumulateAttendance(getAttendanceMap());
  accumulatePayments(getPaymentsData());
  getArchives().forEach(a=>{
    accumulateAttendance(a.data.attendance||{});
    accumulatePayments(a.data.payments||{});
  });
  const totalMarked = present+absent+late+resched+excused; // cancelled classes aren't part of the student's own record
  const countedTotal = totalMarked-excused;
  const attendedCount = present+late;
  const attendanceRate = countedTotal>0 ? Math.round((attendedCount/countedTotal)*100) : null;
  const pay = getStudentPayment(name);
  const currentDue = getStudentTotalDue(name);
  const daysSinceSeen = latest ? Math.round((todayDateOnly()-new Date(latest+'T00:00:00'))/86400000) : null;
  return {present, absent, late, resched, excused, cancelled, totalMarked, attendanceRate, lifetimePaid, currentDue, monthlyFee:pay.monthlyFee, earliest, latest, daysSinceSeen};
}
function renderStudentSummaryCard(name){
  const s = computeStudentSummary(name);
  const sinceHtml = s.earliest ? `<div class="ssum-since">📅 ${bnDateLabel(new Date(s.earliest+'T00:00:00'))} থেকে পড়াচ্ছ</div>` : '';
  let lastSeenHtml = '';
  if(s.daysSinceSeen!==null){
    const warn = s.daysSinceSeen>=7;
    const text = s.daysSinceSeen<=0 ? 'আজ' : s.daysSinceSeen===1 ? 'গতকাল' : `${toBn(s.daysSinceSeen)} দিন আগে`;
    lastSeenHtml = `<div class="ssum-since"${warn?' style="color:var(--due);"':''}>${warn?'⚠️':'🕐'} সর্বশেষ ক্লাস/নোট: ${text}</div>`;
  }
  return `<div class="ssum-card">
    <div class="ssum-row">
      <div class="ssum-item">
        <div class="ssum-num">${toBn(s.totalMarked)}</div>
        <div class="ssum-lb">মোট ক্লাস</div>
      </div>
      <div class="ssum-item">
        <div class="ssum-num">${s.attendanceRate===null?'—':toBn(s.attendanceRate)+'%'}</div>
        <div class="ssum-lb">উপস্থিতির হার</div>
      </div>
      <div class="ssum-item">
        <div class="ssum-num" style="color:var(--paid);">${bnTaka(s.lifetimePaid)}</div>
        <div class="ssum-lb">সর্বমোট পরিশোধ</div>
      </div>
      <div class="ssum-item">
        <div class="ssum-num" style="color:${s.currentDue>0?'var(--due)':'var(--paid)'};">${bnTaka(s.currentDue)}</div>
        <div class="ssum-lb">সর্বমোট বকেয়া</div>
      </div>
    </div>
    ${sinceHtml}
    ${lastSeenHtml}
  </div>`;
}
function isFinanceHidden(){ return lsGet('tr_hideFinance', true) && !financeUnlocked; }
/* ---- "Hide amounts" privacy mode: when tr_hideFinance is on, every ৳ figure renders masked until ---- */
/* tapped to reveal — resets back to hidden every time the app is (re)opened. No PIN required. */
function unlockFinance(){
  if(typeof bioWants==='function' && bioWants('finance')){ bioUnlockFinance(); return; }   // আঙুলের ছাপ-লক চালু থাকলে যাচাই লাগে
  financeUnlocked=true;
  refreshFinanceViews();
}
function lockFinanceAgain(){
  financeUnlocked=false;
  refreshFinanceViews();
}
/* ---- Payment reminder: a dismissible nudge on Home when students still owe this month — reappears ---- */
/* the next day if dismissed, so it's a gentle reminder rather than a one-time thing you forget about. */
function computeDueList(){
  const mk = currentMonthKey();
  return getAllKnownNames().map(n=>{
    const {due,late}=getStudentDueWithLateFee(n, mk);
    return {name:n, due, late};
  }).filter(x=>x.due>0);
}
function renderDueReminder(){
  const el=document.getElementById('dueReminderBox');
  if(!el) return;
  const dismissedDate = lsGet('tr_dueReminderDismissed', '');
  const todayKeyStr = dateKeyStr(todayDateOnly());
  if(dismissedDate===todayKeyStr){ el.innerHTML=''; return; }
  const dueList = computeDueList();
  if(dueList.length===0){ el.innerHTML=''; return; }
  const totalDue = dueList.reduce((s,x)=>s+x.due,0);
  const amountText = isFinanceHidden() ? '' : ` (মোট ${bnTaka(totalDue)})`;
  el.innerHTML = `<div class="due-reminder">
    <span><span class="ic">${ICN.flag}</span> এই মাসে ${toBn(dueList.length)} জনের পেমেন্ট বাকি${amountText}</span>
    <div class="due-reminder-actions">
      <button class="pct-chip" onclick="switchTab('reports')">দেখাও</button>
      <button class="pct-chip" onclick="dismissDueReminder()">আজকের জন্য বাদ দাও</button>
    </div>
  </div>`;
}
function dismissDueReminder(){
  lsSet('tr_dueReminderDismissed', dateKeyStr(todayDateOnly()));
  renderDueReminder();
}
/* ---- Morning quick-check: flags students on today's schedule whose last 3 recorded attendance ---- */
/* marks were all "absent" — a pattern worth a quick check-in before assuming today goes as usual. */
function computeAbsenceRiskToday(){
  const today=todayKey(), todayDate=todayDateOnly();
  const namesToday=new Set();
  SCHEDULE.forEach(slot=>{
    const val=effectiveContentForDate(slot, today, todayDate);
    if(val) val.split(',').map(s=>s.trim()).filter(Boolean).forEach(n=>namesToday.add(n));
  });
  const att=getAttendanceMap();
  const byName={};
  Object.keys(att).forEach(k=>{
    const parts=k.split('|'); const name=parts.slice(2).join('|');
    if(!namesToday.has(name)) return;
    (byName[name]=byName[name]||[]).push({date:parts[0], status:att[k]});
  });
  const risky=[];
  namesToday.forEach(name=>{
    const records=(byName[name]||[])
      .filter(r=>r.status!=='cancelled' && r.status!=='excused' && r.status!=='resched') // cancelled/excused/rescheduled isn't a real attendance data point
      .sort((a,b)=> a.date<b.date?1:-1).slice(0,3);
    if(records.length>=3 && records.every(r=>r.status==='absent')) risky.push(name);
  });
  return risky;
}
function renderAbsenceRiskBox(){
  const el=document.getElementById('absenceRiskBox');
  if(!el) return;
  const dismissedDate = lsGet('tr_absenceRiskDismissed', '');
  const todayKeyStr = dateKeyStr(todayDateOnly());
  if(dismissedDate===todayKeyStr){ el.innerHTML=''; return; }
  const risky = computeAbsenceRiskToday();
  if(risky.length===0){ el.innerHTML=''; return; }
  el.innerHTML = `<div class="due-reminder" style="background:rgba(255,176,32,0.07);border-color:rgba(255,176,32,0.28);">
    <span>⚠️ গত ৩ ক্লাসে অনুপস্থিত ছিল: <b>${risky.map(escapeHtml).join(', ')}</b> — আজও নাও থাকতে পারে</span>
    <div class="due-reminder-actions"><button class="pct-chip" onclick="dismissAbsenceRisk()">আজকের জন্য বাদ দাও</button></div>
  </div>`;
}
function dismissAbsenceRisk(){
  lsSet('tr_absenceRiskDismissed', dateKeyStr(todayDateOnly()));
  renderAbsenceRiskBox();
}
/* ---- Year in Review: an all-time summary pulled together from data already tracked (attendance, ---- */
/* notes, payments, progress) — no separate tracking needed, just aggregated across everything saved. */
function computeStatsFromRawData(att, notes, payments, progress){
  const namesSet = new Set();
  Object.keys(payments).forEach(n=>namesSet.add(n));
  Object.keys(progress).forEach(n=>namesSet.add(n));
  Object.keys(att).forEach(k=>namesSet.add(k.split('|')[2]));

  const sessionKeys = new Set();
  Object.keys(att).forEach(k=>{ const p=k.split('|'); sessionKeys.add(p[0]+'|'+p[1]); });
  Object.keys(notes).forEach(k=>sessionKeys.add(k));
  let totalMinutes=0;
  sessionKeys.forEach(k=>{
    const slotNum=k.split('|')[1];
    const slot=SCHEDULE.find(s=>s.num===slotNum);
    if(slot) totalMinutes += (slot.end-slot.start);
  });

  let totalIncome=0;
  Object.values(payments).forEach(p=>{ (p.payments||[]).forEach(pay=>totalIncome+=pay.amount); });

  const subjectCount={};
  Object.values(progress).forEach(subjMap=>{
    Object.keys(subjMap).forEach(subj=>{ subjectCount[subj]=(subjectCount[subj]||0)+subjMap[subj].length; });
  });

  let present=0, totalMarked=0;
  Object.values(att).forEach(status=>{ totalMarked++; if(status==='present'||status==='late') present++; });

  return { studentNames:namesSet, totalSessions:sessionKeys.size, totalHours:totalMinutes/60, totalIncome, subjectCount, present, totalMarked };
}
/* ---- Year in Review now merges live data with every archived session, so switching sessions ---- */
/* (see Session Management) never makes the lifetime totals look smaller than reality. */
function computeYearInReview(){
  const live = computeStatsFromRawData(getAttendanceMap(), getNotes(), getPaymentsData(), getProgressData());
  const allNames = new Set(live.studentNames);
  getAllKnownNames().forEach(n=>allNames.add(n));
  let totalSessions=live.totalSessions, totalHours=live.totalHours, totalIncome=live.totalIncome;
  let present=live.present, totalMarked=live.totalMarked;
  const subjectCount = {...live.subjectCount};

  getArchives().forEach(a=>{
    const s = computeStatsFromRawData(a.data.attendance||{}, a.data.notes||{}, a.data.payments||{}, a.data.progress||{});
    s.studentNames.forEach(n=>allNames.add(n));
    totalSessions+=s.totalSessions; totalHours+=s.totalHours; totalIncome+=s.totalIncome;
    present+=s.present; totalMarked+=s.totalMarked;
    Object.keys(s.subjectCount).forEach(subj=>{ subjectCount[subj]=(subjectCount[subj]||0)+s.subjectCount[subj]; });
  });

  let topSubject=null, topCount=0;
  Object.keys(subjectCount).forEach(s=>{ if(subjectCount[s]>topCount){ topCount=subjectCount[s]; topSubject=s; } });
  const attRate = totalMarked>0 ? Math.round((present/totalMarked)*100) : null;

  return { totalStudents:allNames.size, totalSessions, totalHours:Math.round(totalHours*10)/10, totalIncome, topSubject, attRate };
}
function showYearInReview(){
  const r = computeYearInReview();
  const incomeText = isFinanceHidden() ? '৳ ••••' : bnTaka(r.totalIncome);
  document.getElementById('yirBody').innerHTML = `
    <div class="modal-title" style="text-align:center;">✨ এখন পর্যন্তকার সামারি</div>
    <div class="yir-grid">
      <div class="yir-item"><div class="yir-num">${toBn(r.totalStudents)}</div><div class="yir-lb">মোট শিক্ষার্থী</div></div>
      <div class="yir-item"><div class="yir-num">${toBn(r.totalSessions)}</div><div class="yir-lb">মোট ক্লাস</div></div>
      <div class="yir-item"><div class="yir-num">${toBn(r.totalHours)}</div><div class="yir-lb">মোট ঘণ্টা</div></div>
      <div class="yir-item"><div class="yir-num" style="color:var(--paid);">${incomeText}</div><div class="yir-lb">মোট আয়</div></div>
      ${r.attRate!==null?`<div class="yir-item"><div class="yir-num">${toBn(r.attRate)}%</div><div class="yir-lb">গড় উপস্থিতি</div></div>`:''}
      ${r.topSubject?`<div class="yir-item"><div class="yir-num" style="font-size:13.5px;">${escapeHtml(r.topSubject)}</div><div class="yir-lb">সবচেয়ে বেশি পড়ানো বিষয়</div></div>`:''}
    </div>`;
  document.getElementById('yirModal').style.display='flex';
}
function closeYearInReview(){ document.getElementById('yirModal').style.display='none'; }

/* ---- Global search: looks across student names and every taught/homework/next-plan note for a ---- */
/* match, so nothing needs a separate "which tab was this in" hunt. */
function openSearchModal(){
  document.getElementById('searchInput').value='';
  document.getElementById('searchResults').innerHTML='';
  document.getElementById('searchModal').style.display='flex';
  setTimeout(()=>document.getElementById('searchInput').focus(), 50);
}
function closeSearchModal(){ document.getElementById('searchModal').style.display='none'; }
/* ---- PDF export: builds a clean printable report (income + attendance) into a hidden container, ---- */
/* then uses the browser's native print-to-PDF — no external library needed for a single-file app. */
function exportReportPDF(){
  const mk = currentMonthKey();
  const names = getAllKnownNames();
  const attSummary = computeAttendanceSummary();
  const hideAmt = isFinanceHidden();

  let totalFee=0, totalPaid=0, totalDue=0, totalOpening=0;
  const incomeRows = names.map(n=>{
    const pay = getStudentPayment(n);
    const paidAmt = getStudentPaidForMonth(n, mk);
    const due = getStudentDueForMonth(n, mk);
    const opening = pay.openingBalance||0;
    const effFee=feeEffective(n, mk); totalFee+=effFee; totalPaid+=paidAmt; totalDue+=due; totalOpening+=opening;
    return `<tr><td>${escapeHtml(n)}</td><td>${hideAmt?'••••':bnTaka(effFee)}</td><td>${hideAmt?'••••':bnTaka(paidAmt)}</td><td>${hideAmt?'••••':bnTaka(due)}</td><td>${hideAmt?'••••':bnTaka(opening)}</td></tr>`;
  }).join('');

  const attRows = names.map(n=>{
    const s = attSummary[n];
    if(!s) return `<tr><td>${escapeHtml(n)}</td><td colspan="2">কোনো রেকর্ড নেই</td></tr>`;
    return `<tr><td>${escapeHtml(n)}</td><td>${toBn(s.total)}</td><td>${toBn(s.pct)}%</td></tr>`;
  }).join('');

  const expenses = getExpensesForMonth(mk);
  const totalExp = expenses.reduce((s,e)=>s+e.amount,0);
  const expRows = expenses.map(e=>{
    const catLabel=(EXPENSE_CATEGORIES.find(c=>c.key===e.category)||{}).label||e.category;
    return `<tr><td>${bnDateLabel(new Date(e.date+'T00:00:00'))}</td><td>${escapeHtml(catLabel)}</td><td>${escapeHtml(e.note||'')}</td><td>${hideAmt?'••••':bnTaka(e.amount)}</td></tr>`;
  }).join('');
  const net = totalPaid - totalExp;

  document.getElementById('printReportArea').innerHTML = `
    <div class="pr-title">আমার টিউশন রুটিন — রিপোর্ট</div>
    <div class="pr-sub">${monthKeyLabel(mk)} · তৈরি হয়েছে ${bnDateLabel(todayDateOnly())}</div>

    <div class="pr-section-title">💰 আয় ও পেমেন্ট (${monthKeyLabel(mk)})</div>
    <table class="pr-table">
      <tr><th>শিক্ষার্থী</th><th>মাসিক ফি</th><th>পরিশোধ</th><th>এই মাসের বকেয়া</th><th>আগের বকেয়া</th></tr>
      ${incomeRows}
      <tr><th>সর্বমোট</th><th>${hideAmt?'••••':bnTaka(totalFee)}</th><th>${hideAmt?'••••':bnTaka(totalPaid)}</th><th>${hideAmt?'••••':bnTaka(totalDue)}</th><th>${hideAmt?'••••':bnTaka(totalOpening)}</th></tr>
    </table>

    <div class="pr-section-title">🧾 খরচ ও নিট লাভ (${monthKeyLabel(mk)})</div>
    <table class="pr-table">
      <tr><th>তারিখ</th><th>ধরন</th><th>নোট</th><th>পরিমাণ</th></tr>
      ${expRows || '<tr><td colspan="4">কোনো খরচ যোগ করা হয়নি</td></tr>'}
      <tr><th colspan="3">মোট খরচ</th><th>${hideAmt?'••••':bnTaka(totalExp)}</th></tr>
      <tr><th colspan="3">নিট লাভ (আয় − খরচ)</th><th>${hideAmt?'••••':bnTaka(net)}</th></tr>
    </table>

    <div class="pr-section-title">✅ উপস্থিতি (সর্বমোট রেকর্ড)</div>
    <table class="pr-table">
      <tr><th>শিক্ষার্থী</th><th>মোট ক্লাস</th><th>উপস্থিতির হার</th></tr>
      ${attRows}
    </table>`;

  document.body.classList.add('printing-report');
  const cleanup = ()=>{ document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
function runSearch(query){
  const q = query.trim().toLowerCase();
  const box = document.getElementById('searchResults');
  if(q.length<2){ box.innerHTML = q.length===0?'':'<div class="ins-empty">অন্তত ২টা অক্ষর লেখো।</div>'; return; }

  const studentMatches = getAllKnownNames().filter(n=>n.toLowerCase().includes(q));

  const notes = getNotes();
  const noteMatches = [];
  Object.keys(notes).forEach(k=>{
    const [dk, slotNum] = k.split('|');
    const slot = SCHEDULE.find(s=>s.num===slotNum);
    if(!slot) return;
    getNoteEntries(new Date(dk+'T00:00:00'), slotNum).forEach(e=>{
      const hay = [e.subject||'', e.taught||'', e.homework||'', e.nextPlan||''].join(' ').toLowerCase();
      if(hay.includes(q)) noteMatches.push({dk, slot, ...e});
    });
  });
  noteMatches.sort((a,b)=> a.dk<b.dk?1:-1);

  if(studentMatches.length===0 && noteMatches.length===0){
    box.innerHTML = `<div class="ins-empty">কিছু পাওয়া যায়নি।</div>`;
    return;
  }
  let html='';
  if(studentMatches.length){
    html += `<div class="ndb-date-hdr">শিক্ষার্থী</div>`;
    html += studentMatches.map(n=>`<div class="ndb-entry" style="cursor:pointer;" onclick="closeSearchModal();openStudentModal('${jsq(n)}')">
      <div class="ndb-entry-top"><span class="ndb-entry-names">${escapeHtml(n)}</span><span class="ic">${ICN.person}</span></div>
    </div>`).join('');
  }
  if(noteMatches.length){
    html += `<div class="ndb-date-hdr">নোট</div>`;
    html += noteMatches.slice(0,30).map(e=>{
      const d=new Date(e.dk+'T00:00:00');
      return `<div class="ndb-entry">
        <div class="ndb-entry-top"><span class="ndb-entry-time">${bnDateLabel(d)} · ${e.slot.label}${e.student?' · '+escapeHtml(e.student):''}${e.subject?` <span class="ndb-subject-tag">${escapeHtml(e.subject)}</span>`:''}</span></div>
        ${e.taught?`<div class="ndb-entry-line"><b>পড়ানো:</b> ${escapeHtml(e.taught)}</div>`:''}
        ${e.homework?`<div class="ndb-entry-line"><b>হোমওয়ার্ক:</b> ${escapeHtml(e.homework)}</div>`:''}
        ${e.nextPlan?`<div class="ndb-entry-line"><b>পরের পরিকল্পনা:</b> ${escapeHtml(e.nextPlan)}</div>`:''}
      </div>`;
    }).join('');
  }
  box.innerHTML = html;
}

/* ---- Notes database: browse everything taught/homework-assigned by day, week, or month, and copy ---- */
/* a WhatsApp-ready text summary for any period with one tap. Reads the same tr_notes data already ---- */
/* captured from the regular note modal — nothing new to track. */
let ndbMode='daily', ndbAnchorDate=null;
let ndbStudent='';
function onNdbStudentFilter(v){ ndbStudent=v; renderNotesDb(); }
function getNdbItems(){
  const {start,end}=getNotesDbRange();
  const all=collectNotesInRange(start,end);
  const sel=document.getElementById('ndbStudentFilter');
  const names=[...new Set(all.map(e=>e.student))];
  if(ndbStudent && !names.includes(ndbStudent)) ndbStudent='';
  if(sel){
    sel.style.display = names.length>1 ? '' : 'none';
    sel.innerHTML = `<option value="">সব শিক্ষার্থী</option>`+names.map(n=>`<option value="${escapeHtml(n)}"${n===ndbStudent?' selected':''}>${escapeHtml(n)}</option>`).join('');
  }
  return ndbStudent ? all.filter(e=>e.student===ndbStudent) : all;
}
function openNotesDatabase(){
  ndbStudent='';
  ndbMode='daily';
  ndbAnchorDate=todayDateOnly();
  document.getElementById('notesDbModal').style.display='flex';
  renderNotesDb();
}
function closeNotesDatabase(){ document.getElementById('notesDbModal').style.display='none'; }
function setNotesDbMode(mode){
  ndbMode=mode;
  ['daily','weekly','monthly'].forEach(m=>{
    document.getElementById('ndbMode'+m.charAt(0).toUpperCase()+m.slice(1)).classList.toggle('active', m===mode);
  });
  renderNotesDb();
}
function navigateNotesDb(dir){
  if(ndbMode==='daily') ndbAnchorDate=addDaysToDate(ndbAnchorDate, dir);
  else if(ndbMode==='weekly') ndbAnchorDate=addDaysToDate(ndbAnchorDate, dir*7);
  else ndbAnchorDate=new Date(ndbAnchorDate.getFullYear(), ndbAnchorDate.getMonth()+dir, 1);
  renderNotesDb();
}
function getNotesDbRange(){
  if(ndbMode==='daily') return {start:ndbAnchorDate, end:ndbAnchorDate};
  if(ndbMode==='weekly'){
    const dayIdx=(ndbAnchorDate.getDay()+1)%7;
    const start=addDaysToDate(ndbAnchorDate, -dayIdx);
    return {start, end:addDaysToDate(start, 6)};
  }
  const start=new Date(ndbAnchorDate.getFullYear(), ndbAnchorDate.getMonth(), 1);
  const end=new Date(ndbAnchorDate.getFullYear(), ndbAnchorDate.getMonth()+1, 0);
  return {start, end};
}
function getNotesDbPeriodLabel(){
  const {start,end}=getNotesDbRange();
  if(ndbMode==='daily') return `${DAY_BN_FULL[DAYS[(start.getDay()+1)%7]]}, ${bnDateLabel(start)}`;
  if(ndbMode==='weekly') return `${bnDateLabel(start)} – ${bnDateLabel(end)}`;
  const mk=`${ndbAnchorDate.getFullYear()}-${String(ndbAnchorDate.getMonth()+1).padStart(2,'0')}`;
  return monthKeyLabel(mk);
}
function collectNotesInRange(start, end){
  const notes=getNotes();
  const items=[];
  let cursor=new Date(start);
  while(cursor<=end){
    const dk=dateKeyStr(cursor);
    SCHEDULE.forEach(slot=>{
      if(!notes[dk+'|'+slot.num]) return;
      getNoteEntries(new Date(cursor), slot.num).forEach((e,idx)=>{
        items.push({date:new Date(cursor), dk, slot, idx, student:e.student||'(শিক্ষার্থী অনির্দিষ্ট)', subject:e.subject, taught:e.taught, homework:e.homework, nextPlan:e.nextPlan});
      });
    });
    cursor=addDaysToDate(cursor, 1);
  }
  items.sort((a,b)=> a.dk===b.dk ? (a.slot.start-b.slot.start || a.idx-b.idx) : (a.dk<b.dk?-1:1));
  return items;
}
function renderNotesDb(){
  document.getElementById('ndbPeriodLabel').textContent = getNotesDbPeriodLabel();
  const items=getNdbItems();
  const body=document.getElementById('notesDbBody');
  const copyAllBtn=document.getElementById('ndbCopyAllBtn');
  if(copyAllBtn) copyAllBtn.style.display = items.length ? '' : 'none';
  if(items.length===0){
    body.innerHTML=`<div class="ins-empty">এই সময়ে কোনো নোট লেখা হয়নি।</div>`;
    return;
  }
  let lastDk=null, lastSlot=null;
  body.innerHTML = items.map(e=>{
    const dateHeader = (ndbMode!=='daily' && e.dk!==lastDk) ? (lastDk=e.dk, lastSlot=null, `<div class="ndb-date-hdr">${DAY_BN_FULL[DAYS[(e.date.getDay()+1)%7]]}, ${bnDateLabel(e.date)}</div>`) : '';
    const slotHeader = (e.slot.num!==lastSlot) ? (lastSlot=e.slot.num, `<div class="ndb-slot-hdr">${e.slot.label}</div>`) : '';
    return `${dateHeader}${slotHeader}<div class="ndb-entry">
      <div class="ndb-entry-top">
        <span class="ndb-entry-names">👤 ${escapeHtml(e.student)}${e.subject?` <span class="ndb-subject-tag">${escapeHtml(e.subject)}</span>`:''}</span>
        <button class="ndb-copy-btn" onclick="copyNoteEntry('${e.dk}','${e.slot.num}',${e.idx})" title="কপি করো"><span class="ic">${ICN.share}</span></button>
      </div>
      ${e.taught?`<div class="ndb-entry-line"><b>পড়ানো:</b> ${escapeHtml(e.taught)}</div>`:''}
      ${e.homework?`<div class="ndb-entry-line"><b>হোমওয়ার্ক:</b> ${escapeHtml(e.homework)}</div>`:''}
      ${e.nextPlan?`<div class="ndb-entry-line"><b>পরের পরিকল্পনা:</b> ${escapeHtml(e.nextPlan)}</div>`:''}
    </div>`;
  }).join('');
}
function formatNoteEntryText(e){
  const lines=[`📅 *${DAY_BN_FULL[DAYS[(e.date.getDay()+1)%7]]}, ${bnDateLabel(e.date)}* · ${e.slot.label}`, `👤 *${e.student}*${e.subject?` (${e.subject})`:''}`];
  if(e.taught) lines.push(`📚 *পড়ানো হয়েছে:* ${e.taught}`);
  if(e.homework) lines.push(`📌 *হোমওয়ার্ক:* ${e.homework}`);
  if(e.nextPlan) lines.push(`🎯 *পরের ক্লাসের পরিকল্পনা:* ${e.nextPlan}`);
  return lines.join('\n');
}
/* Entries for the same student + same class (e.g. Math and English on one day) are sent as ONE message: */
/* date/student header once, then a section per subject. A single entry looks exactly as before. */
function formatNoteGroupText(entries){
  if(entries.length===1) return formatNoteEntryText(entries[0]);
  const e0=entries[0];
  const lines=[`📅 *${DAY_BN_FULL[DAYS[(e0.date.getDay()+1)%7]]}, ${bnDateLabel(e0.date)}* · ${e0.slot.label}`, `👤 *${e0.student}*`];
  entries.forEach((e,i)=>{
    lines.push('', `━━ ${i+1}) *${e.subject||'বিষয় অনির্দিষ্ট'}* ━━`);
    if(e.taught) lines.push(`📚 *পড়ানো হয়েছে:* ${e.taught}`);
    if(e.homework) lines.push(`📌 *হোমওয়ার্ক:* ${e.homework}`);
    if(e.nextPlan) lines.push(`🎯 *পরের ক্লাসের পরিকল্পনা:* ${e.nextPlan}`);
  });
  return lines.join('\n');
}
function formatNotesGrouped(entries){
  const order=[], map={};
  entries.forEach(e=>{
    const k=`${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}|${e.slot.num}|${e.student}`;
    if(!map[k]){ map[k]=[]; order.push(k); }
    map[k].push(e);
  });
  return order.map(k=>formatNoteGroupText(map[k])).join('\n\n');
}
/* ---- ONE student, ALL subjects, over a period: one combined message grouped by date ---- */
function formatStudentNotesReport(name, items, label){
  const lines=[`📔 *${name}* — নোট সারাংশ`];
  if(label) lines.push(`🗓️ ${label}`);
  let lastDk=null;
  items.forEach(e=>{
    if(e.dk!==lastDk){
      lastDk=e.dk;
      lines.push('', `📅 *${DAY_BN_FULL[DAYS[(e.date.getDay()+1)%7]]}, ${bnDateLabel(e.date)}*`);
    }
    lines.push(`▪️ *${e.subject||'বিষয় অনির্দিষ্ট'}* · ${e.slot.label}`);
    if(e.taught) lines.push(`   📚 *পড়ানো হয়েছে:* ${e.taught}`);
    if(e.homework) lines.push(`   📌 *হোমওয়ার্ক:* ${e.homework}`);
    if(e.nextPlan) lines.push(`   🎯 *পরের পরিকল্পনা:* ${e.nextPlan}`);
  });
  return lines.join('\n');
}
function studentNotesRange(scope){
  const today=todayDateOnly();
  if(scope==='week'){ const start=addDaysToDate(today, -((today.getDay()+1)%7)); return {start, end:today, label:`এই সপ্তাহ (${bnDateLabel(start)} – ${bnDateLabel(today)})`}; }
  if(scope==='month'){ const start=new Date(today.getFullYear(), today.getMonth(), 1); return {start, end:today, label:monthKeyLabel(currentMonthKey())}; }
  const start=new Date(getCurrentSessionStart()+'T00:00:00');
  return {start, end:today, label:`${bnDateLabel(start)} থেকে আজ পর্যন্ত`};
}
function copyStudentAllNotes(name, scope){
  const {start,end,label}=studentNotesRange(scope);
  const items=collectNotesInRange(start,end).filter(e=>e.student===name && (e.taught||e.homework||e.nextPlan));
  if(!items.length){ showWarningToast(`${name}-এর এই সময়ে কোনো নোট লেখা নেই।`); return; }
  const subjects=new Set(items.map(e=>e.subject||'বিষয় অনির্দিষ্ট'));
  copyTextSmart(formatStudentNotesReport(name, items, label), `${name}-এর ${toBn(subjects.size)}টা বিষয়ের নোট কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করে পাঠাতে পারো।`);
}
function renderStudentNotesCopySection(name){
  const q=jsq(name);
  return `<div class="sm-section-title" style="margin-top:14px;">📝 সব বিষয়ের নোট একসাথে কপি</div>
    <div class="pct-chip-row">
      <button type="button" class="pct-chip" onclick="copyStudentAllNotes('${q}','week')">এই সপ্তাহ</button>
      <button type="button" class="pct-chip" onclick="copyStudentAllNotes('${q}','month')">এই মাস</button>
      <button type="button" class="pct-chip" onclick="copyStudentAllNotes('${q}','all')">সব নোট</button>
    </div>`;
}
function copyTextSmart(text, successMsg){
  if(navigator.share){ navigator.share({text}).catch(()=>{}); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>showSuccessToast(successMsg)).catch(()=>prompt('এই টেক্সটটা কপি করো:', text));
  } else {
    prompt('এই টেক্সটটা কপি করো:', text);
  }
}
function copyNoteEntry(dk, slotNum, idx){
  const {start,end}=getNotesDbRange();
  const items=collectNotesInRange(start,end);
  const e=items.find(x=>x.dk===dk && x.slot.num===slotNum && x.idx===idx);
  if(!e) return;
  copyTextSmart(formatNoteEntryText(e), 'কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করে পাঠাতে পারো।');
}
function copyAllNotesInRange(){
  const items=getNdbItems();
  if(items.length===0) return;
  if(ndbStudent){
    copyTextSmart(formatStudentNotesReport(ndbStudent, items, getNotesDbPeriodLabel()), `${ndbStudent}-এর সব বিষয়ের নোট কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করে পাঠাতে পারো।`);
    return;
  }
  const header=`📔 নোট সারাংশ — ${getNotesDbPeriodLabel()}\n`;
  const text = header + '\n' + formatNotesGrouped(items);
  copyTextSmart(text, 'পুরো তালিকা কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করে পাঠাতে পারো।');
}
/* ---- Shareable progress report: builds a short plain-text summary from data already tracked ---- */
/* (attendance, subject progress, this month's dues) and hands it to the OS share sheet — falls back ---- */
/* to clipboard copy on browsers without navigator.share. Money is left out while finance is hidden. */

/* ============ MONTHLY PROGRESS REPORT (this calendar month) -> WhatsApp to guardian ============ */
function computeMonthReport(name){
  const mk=currentMonthKey(), att=getAttendanceMap(); let present=0, late=0, absent=0;
  Object.keys(att).forEach(k=>{ const p=k.split('|'); if(p[0].slice(0,7)!==mk || p.slice(2).join('|')!==name) return; const s=att[k]; if(s==='present')present++; else if(s==='late')late++; else if(s==='absent')absent++; });
  const notes=getNotes(), topics=[], hw={done:0,partial:0,none:0};
  Object.keys(notes).sort().forEach(k=>{
    if(k.slice(0,7)!==mk || !notes[k] || !Array.isArray(notes[k].entries)) return;
    notes[k].entries.forEach(e=>{ if(e.student!==name) return;
      if(e.taught) topics.push((e.subject?e.subject+': ':'')+e.taught);
      if(e.hwStatus && hw[e.hwStatus]!==undefined) hw[e.hwStatus]++; });
  });
  const seen=new Set(), uniq=topics.filter(t=>!seen.has(t)&&seen.add(t));
  const marked=present+late+absent, hwTotal=hw.done+hw.partial+hw.none;
  return {present,late,absent,marked, rate: marked?Math.round((present+late)/marked*100):null, topics:uniq, hw, hwRate: hwTotal?Math.round((hw.done+hw.partial*0.5)/hwTotal*100):null};
}
function monthReportText(name){
  const r=computeMonthReport(name), pr=getStudentProfile(name), teacher=getTeacherName(false);
  const L=[`📚 ${studentDisplayName(name)} — ${monthKeyLabel(currentMonthKey())}-এর অগ্রগতি`, ''];
  if(r.marked){ L.push(`✅ উপস্থিতি: ${toBn(r.marked)}টা ক্লাসের মধ্যে ${toBn(r.present+r.late)}টায় উপস্থিত (${toBn(r.rate)}%)`); if(r.absent) L.push(`   অনুপস্থিত: ${toBn(r.absent)} দিন`); }
  if(r.hwRate!==null) L.push(`📝 হোমওয়ার্ক: ${toBn(r.hwRate)}% সম্পন্ন`);
  if(r.topics.length){ L.push('', '📖 এই মাসে যা পড়ানো হয়েছে:'); r.topics.slice(-8).forEach(t=>L.push('• '+t)); }
  if(!r.marked && !r.topics.length) L.push('এই মাসে এখনো কোনো রেকর্ড নেই।');
  if(!isFinanceHidden()){ const due=getStudentTotalDue(name); L.push('', due>0?`💰 বর্তমান বকেয়া: ${bnTaka(due)}`:'💰 কোনো বকেয়া নেই ✅'); }
  L.push('', teacher?`ধন্যবাদ,\n${teacher}`:'ধন্যবাদ।');
  return L.join('\n');
}
function sendMonthReportWA(name){
  const pr=getStudentProfile(name);
  if(!(pr.guardianPhone||'').trim()) showWarningToast('অভিভাবকের ফোন সেভ করা নেই — WhatsApp-এ নিজে কন্ট্যাক্ট বেছে নাও।');
  openWhatsApp(pr.guardianPhone, monthReportText(name));
}
function copyMonthReport(name){ copyTextSmart(monthReportText(name), 'এই মাসের রিপোর্ট কপি হয়েছে — WhatsApp-এ পেস্ট করো'); }

/* ============ HOME "আজকের লক্ষ্য": how much of today's work is done (classes / attendance / notes) ============ */
function computeTodayGoal(){
  const d=todayDateOnly(), today=todayKey(), nm=nowMinutes(); let classes=0, ended=0, stu=0, marked=0, notes=0;
  SCHEDULE.forEach(slot=>{
    if(isOffOn(d,slot.num)) return;
    const val=effectiveContentForDate(slot,today,d).trim(); if(!val) return;
    classes++; if(slot.end<=nm) ended++;
    val.split(',').map(x=>x.trim()).filter(Boolean).forEach(n=>{ stu++; if(getAttendance(d,slot.num,n)) marked++; });
    notes+=getNoteEntries(d,slot.num).length;
  });
  return {classes,ended,stu,marked,notes};
}
function renderTodayGoal(){
  const el=document.getElementById('todayGoal'); if(!el) return;
  const g=computeTodayGoal();
  if(!g.classes){ el.innerHTML=''; return; }
  const pct=g.stu?Math.round(g.marked/g.stu*100):0, done=g.stu>0 && g.marked>=g.stu;
  el.innerHTML=`<div class="goal-card${done?' done':''}"><div class="goal-top"><span>${done?'🎉 আজকের কাজ শেষ!':'🎯 আজকের লক্ষ্য'}</span><b>${toBn(pct)}%</b></div>
    <div class="goal-bar"><i style="width:${pct}%"></i></div>
    <div class="goal-meta"><span>ক্লাস ${toBn(g.ended)}/${toBn(g.classes)} শেষ</span><span>হাজিরা ${toBn(g.marked)}/${toBn(g.stu)}</span><span>নোট ${toBn(g.notes)}</span></div></div>`;
}

function shareStudentReport(name){
  const summary = computeStudentSummary(name);
  const subjects = getStudentSubjects(name);
  const lines = [];
  lines.push(`📚 ${name} — অগ্রগতি রিপোর্ট`);
  lines.push(`তারিখ: ${bnDateLabel(todayDateOnly())}`);
  lines.push('');
  if(summary.totalMarked>0){
    lines.push(`উপস্থিতি: মোট ${toBn(summary.totalMarked)} ক্লাসের মধ্যে ${toBn(summary.attendanceRate)}% উপস্থিত ছিল`);
  }
  const subjectNames = Object.keys(subjects);
  if(subjectNames.length){
    lines.push('');
    lines.push('বিষয়ভিত্তিক অগ্রগতি:');
    subjectNames.forEach(s=>{
      const chapters = subjects[s];
      const avg = chapters.length ? Math.round(chapters.reduce((a,c)=>a+c.pct,0)/chapters.length) : 0;
      lines.push(`• ${s}: ${toBn(avg)}% সম্পন্ন (${toBn(chapters.length)}টা অধ্যায়)`);
    });
  }
  if(!isFinanceHidden()){
    const due = getStudentTotalDue(name);
    lines.push('');
    lines.push(due>0 ? `সর্বমোট বকেয়া: ${bnTaka(due)}` : `সব পরিশোধ করা হয়েছে ✅`);
  }
  lines.push('');
  lines.push('— আমার টিউশন রুটিন অ্যাপ থেকে পাঠানো');
  const text = lines.join('\n');
  if(navigator.share){
    navigator.share({title:`${name} — অগ্রগতি রিপোর্ট`, text}).catch(()=>{});
  } else if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text)
      .then(()=>showSuccessToast('রিপোর্ট কপি হয়েছে'))
      .catch(()=>prompt('এই টেক্সটটা কপি করো:', text));
  } else {
    prompt('এই টেক্সটটা কপি করো:', text);
  }
}
function refreshFinanceViews(){
  renderInsights();
  renderSettingsTab();
  renderDueReminder();
  if(studentModalName) renderStudentModal(studentModalName);
}
function bnTakaOpen(n){
  const withCommas = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '৳'+toBn(withCommas);
}
function bnTaka(n){
  if(isFinanceHidden()) return '৳ ••••';
  const withCommas = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '৳'+toBn(withCommas);
}
/* ---- খাতা ট্যাবের জন্য ইংরেজি (0-9) সংখ্যা ---- */
function enNum(n){ return _numMode==='bn' ? toBnRaw(n) : String(n); }
function enTaka(n){ if(_numMode==='bn') return bnTakaOpen(n); return '৳'+Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function enDateLabel(date){ if(_numMode==='bn') return bnDateLabel(date); return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`; }
const KH_FIELD_IDS=['kh_amt','dl_amt','rc_amt'];
function khD(s){ return _numMode==='bn' ? s : bnDigitsToLatin(s); }   // খাতার লেখায় সংখ্যা ইংরেজি (সব-বাংলা মোড ছাড়া)
function isKhField(id){ return _numMode==='en' || (_numMode!=='bn' && KH_FIELD_IDS.includes(id)); }
function editDistance(a, b){
  a=a.trim(); b=b.trim();
  const m=a.length, n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
// Returns the closest known name to `input` if it's a near-miss (small edit distance, not identical,
// not wildly different in length) - used to catch likely typos like "সাকির" vs "সাকিরা".
function closestNameIfTypo(input){
  const names = getAllKnownNames();
  const target = input.trim();
  if(!target || names.includes(target)) return null;
  let best=null, bestDist=Infinity;
  for(const n of names){
    const d = editDistance(target, n);
    if(d<bestDist){ bestDist=d; best=n; }
  }
  const threshold = target.length<=4 ? 1 : 2;
  return (best && bestDist>0 && bestDist<=threshold) ? best : null;
}

