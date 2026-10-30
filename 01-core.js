/* ============ DATA (from Class_Schedule_update_12.pdf) ============ */
const DAYS = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];
const DAY_BN = {Sat:'শনি',Sun:'রবি',Mon:'সোম',Tue:'মঙ্গল',Wed:'বুধ',Thu:'বৃহঃ',Fri:'শুক্র'};
const DAY_BN_FULL = {Sat:'শনিবার',Sun:'রবিবার',Mon:'সোমবার',Tue:'মঙ্গলবার',Wed:'বুধবার',Thu:'বৃহস্পতিবার',Fri:'শুক্রবার'};
const PERIOD_LABEL = {dawn:'ভোর',morn:'সকাল',noon:'দুপুর',dusk:'বিকাল',eve:'সন্ধ্যা',night:'রাত'};

/* ---- A small monochrome (currentColor) SVG icon set used in place of full-color system emoji for ---- */
/* UI chrome (buttons, nav, modal titles) — keeps the tonal, single-color look premium apps use. */
const ICN = {
  pencil:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z"/><path d="M13.5 6.5l3 3"/></svg>`,
  note:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14.5 3.5V7a1 1 0 0 0 1 1H19M8 12h8M8 15.5h5"/></svg>`,
  swap:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13.5M17.5 8 14 4.5M17.5 8 14 11.5"/><path d="M20 16H6.5M6.5 16 10 12.5M6.5 16 10 19.5"/></svg>`,
  ban:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.2"/><path d="M6.5 6.5l11 11"/></svg>`,
  undo:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11.5h9a4.5 4.5 0 0 1 0 9H9"/><path d="M9 7 5 11.5 9 16"/></svg>`,
  plus:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  trash:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M7 7l1 12.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1L17 7"/><path d="M10.3 11v6M13.7 11v6"/></svg>`,
  ban_warn:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18L12 4Z"/><path d="M12 10.2v4M12 17h.01"/></svg>`,
  person:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.8 3.5-6 7-6s6.3 2.2 7 6"/></svg>`,
  lock:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9" rx="1.8"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`,
  flag:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5v17"/><path d="M6 4.5h10.5l-2.5 3.5 2.5 3.5H6"/></svg>`,
  share:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8 15.8 6.7M8.2 13.2l7.6 4.1"/></svg>`,
  mic:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5v3"/></svg>`,
};
const PERIOD_ICON = {dawn:'🌅',morn:'🌤️',noon:'☀️',dusk:'🌇',eve:'🌆',night:'🌙'};

const SCHEDULE = [
  {label:'৬:২০ – ৭:৪০ AM', num:'০১', start:380, end:460, period:'dawn',
    cells:{Sat:'ফাহাদ, অভি',Sun:'রিতু, রাজ',Mon:'ফাহাদ, অভি',Tue:'রিতু, রাজ',Wed:'ফাহাদ, অভি',Thu:'রিতু, রাজ',Fri:'রিতু, রাজ'}},
  {label:'৭:৫০ – ৯:১০ AM', num:'০২', start:470, end:550, period:'morn',
    cells:{Sat:'আলিফা, বর্ণ',Sun:'হাসান',Mon:'আলিফা, বর্ণ',Tue:'হাসান',Wed:'আলিফা, বর্ণ',Thu:'হাসান',Fri:'আলিফা, বর্ণ'}},
  {label:'৯:২০ – ১০:৪০ AM', num:'০৩', start:560, end:640, period:'morn',
    cells:{Sat:'হাসান',Sun:'',Mon:'',Tue:'',Wed:'',Thu:'',Fri:'ফাহাদ, অভি'}},
  {label:'১০:৫০ AM – ১২:১০ PM', num:'০৪', start:650, end:730, period:'noon',
    cells:{Sat:'',Sun:'',Mon:'',Tue:'',Wed:'',Thu:'',Fri:'সালমা, সামিয়া, নোভা'}},
  {label:'২:০০ – ৩:২০ PM', num:'০৫', start:840, end:920, period:'noon',
    cells:{Sat:"nazim's stu",Sun:'',Mon:'',Tue:'',Wed:'',Thu:'',Fri:"nazim's stu"}},
  {label:'৩:২০ – ৪:৪০ PM', num:'০৬', start:920, end:1000, period:'dusk',
    cells:{Sat:'শ্রীকান্ত, আদিত্য s',Sun:'মিম',Mon:'সাকিরা',Tue:'মিম',Wed:'সাকিরা',Thu:'মিম',Fri:'শ্রীকান্ত, আদিত্য s'}},
  {label:'৪:৫০ – ৬:১০ PM', num:'০৭', start:1010, end:1090, period:'eve',
    cells:{Sat:'মিম',Sun:'সালমা, সামিয়া, নোভা',Mon:"nazim's stu",Tue:'সালমা, সামিয়া, নোভা',Wed:"nazim's stu",Thu:'সালমা, সামিয়া, নোভা',Fri:'আয়েশা'}},
  {label:'৬:২০ – ৭:৪০ PM', num:'০৮', start:1100, end:1180, period:'eve',
    cells:{Sat:'মামুনি, আদিত্য b',Sun:'শ্রীকান্ত, আদিত্য s',Mon:'মামুনি, আদিত্য b',Tue:'মামুনি, আদিত্য b',Wed:'মামুনি, আদিত্য b',Thu:'সাকিরা',Fri:'সাকিরা'}},
  {label:'৭:৫০ – ৯:১০ PM', num:'০৯', start:1190, end:1270, period:'night',
    cells:{Sat:'আয়েশা',Sun:'নয়াহাট new',Mon:'আয়েশা',Tue:'শ্রীকান্ত, আদিত্য s',Wed:'আয়েশা',Thu:'নয়াহাট new',Fri:'নয়াহাট new'}},
  {label:'৯:১০ – ১০:৩০ PM', num:'১০', start:1270, end:1350, period:'night',
    cells:{Sat:'',Sun:'',Mon:'নয়াহাট new',Tue:'',Wed:'',Thu:'',Fri:''}},
];

/* ============ FOCUS / MOTIVATION DATA ============ */

// Optional personal line — edit the text between the quotes any time you like.
// Leave it as '' (empty) to keep this row hidden.
const WHY_I_TEACH = '';

const BN_DIGITS = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
// সংখ্যার ধরন (Settings → চেহারা): 'mixed' = খাতায় ইংরেজি, বাকিতে বাংলা (ডিফল্ট) · 'en' = সব ইংরেজি · 'bn' = সব বাংলা
let _numMode=(()=>{ try{ const v=JSON.parse(localStorage.getItem('tr_numMode')); return ['mixed','en','bn'].includes(v)?v:'mixed'; }catch(e){ return 'mixed'; } })();
function toBnRaw(n){ return String(n).replace(/[0-9]/g, d=>BN_DIGITS[+d]); }
function toBn(n){ return _numMode==='en' ? String(n) : toBnRaw(n); }

// Escapes text that came from the user (names, notes, homework, etc.) before it's dropped into
// innerHTML, so a stray '<', '>', '&', or quote can't break the markup or vanish from view.
function escapeHtml(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Makes a value safe to place inside a single-quoted JS string that itself sits in an HTML attribute
// (onclick="fn('...')"): escapes backslash and quote for JS, then &, <, >, " for HTML.
function jsq(s){
  return escapeHtml(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,''));
}

const AVATAR_COLORS = ['#e07b5a','#e0a94a','#3fb8a0','#9a7be0','#d4659a','#6f7cee','#35c28f','#e2677a','#4fa9d6','#c9a255'];
function avatarColor(name){ let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0; return AVATAR_COLORS[h%AVATAR_COLORS.length]; }

/* ============ LOCAL STORAGE HELPERS ============ */
function lsGet(key, fallback){
  try{ const v=localStorage.getItem(key); return v===null ? fallback : JSON.parse(v); }
  catch(e){ return fallback; }
}
function lsSet(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); hideStorageWarning(); return true; }
  catch(e){ showStorageWarning(); return false; }
}
/* ---- Storage protection: if a save silently fails (quota full, private-mode restrictions), the ---- */
/* teacher sees a visible warning instead of unknowingly losing data on the next reload. */
function showStorageWarning(){
  if(document.getElementById('storageWarnBanner')) return;
  const b=document.createElement('div');
  b.id='storageWarnBanner';
  b.className='storage-warn-banner';
  b.innerHTML=`<span class="ic">${ICN.ban_warn}</span> ডেটা সেভ হচ্ছে না — স্টোরেজ ফুল হয়ে থাকতে পারে। এখনই ব্যাকআপ নাও, নাহলে পরিবর্তন হারাতে পারে। <button onclick="switchTab('settings');hideStorageWarning();">Settings-এ যাও</button>`;
  document.body.appendChild(b);
}
function hideStorageWarning(){
  const b=document.getElementById('storageWarnBanner');
  if(b) b.remove();
}
/* ---- ফিডব্যাক (v53): সব টোস্ট এক ধাঁচে — আইকন, সময়-বার, হালকা ভাইব্রেশন; টোস্টে ট্যাপ করলে বন্ধ ---- */
/* showSuccessToast / showWarningToast / showUndoToast নাম আগের মতোই; আন্ডু টোস্ট আলাদা স্লটে থাকে, তাই মাঝখানে অন্য টোস্ট এলেও আন্ডু হারায় না। */
function haptic(kind){ try{ if(!navigator.vibrate) return; navigator.vibrate(kind==='warn'?[18,40,18]:kind==='undo'?[8,30,8]:kind==='tick'?6:10); }catch(e){} }
let undoState=null, undoTimer=null, msgTimer=null;
const TT_ICONS={
  ok:'<svg class="tt-ic" viewBox="0 0 24 24" aria-hidden="true"><path class="tt-draw" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  warn:'<svg class="tt-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8l9 15.7H3z"/><path d="M12 9.5v4.2M12 16.6v.2"/></svg>',
  undo:'<svg class="tt-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h8.5a5 5 0 0 1 0 10H11"/></svg>'
};
function toastHost(){
  let h=document.getElementById('toastHost');
  if(!h){ h=document.createElement('div'); h.id='toastHost'; h.className='tt-host'; h.setAttribute('aria-live','polite'); h.innerHTML='<div class="tt-slot" data-s="u"></div><div class="tt-slot" data-s="m"></div>'; document.body.appendChild(h); }
  return h;
}
function toastDismiss(t){ if(!t||!t.isConnected) return; t.classList.add('out'); setTimeout(()=>{ t.remove(); },200); if(t.id==='undoToast'){ undoState=null; } }
function toastShow(kind, message, ms, undoFn){
  const slot=toastHost().querySelector(`.tt-slot[data-s="${undoFn?'u':'m'}"]`);
  slot.innerHTML='';
  const t=document.createElement('div');
  t.className='tt tt-'+kind; t.id=undoFn?'undoToast':'successToast'; t.setAttribute('role',kind==='warn'?'alert':'status');
  t.innerHTML=`${TT_ICONS[kind]}<span class="tt-msg"></span>${undoFn?'<button type="button" class="tt-btn" onclick="runUndo()">আন্ডু করো</button>':''}<i class="tt-bar" style="animation-duration:${ms}ms"></i>`;
  t.querySelector('.tt-msg').textContent=message;
  t.addEventListener('click',e=>{ if(!e.target.closest('.tt-btn')) toastDismiss(t); });
  slot.appendChild(t); haptic(kind==='ok'?'ok':kind);
  if(undoFn){ undoState=undoFn; clearTimeout(undoTimer); undoTimer=setTimeout(()=>toastDismiss(t),ms); }
  else { clearTimeout(msgTimer); msgTimer=setTimeout(()=>toastDismiss(t),ms); }
}
function showSuccessToast(message){ toastShow('ok',message,2200); }
function showWarningToast(message){ toastShow('warn',message,2800); }
function showUndoToast(message, restoreFn){ toastShow('undo',message,8000,restoreFn); }
function runUndo(){
  const fn=undoState; undoState=null; clearTimeout(undoTimer);
  const t=document.getElementById('undoToast'); if(t) { t.classList.add('out'); setTimeout(()=>t.remove(),200); }
  if(fn) { fn(); haptic('ok'); }
}

/* ---- One-time data migration: correcting a name-spelling mistake (মামুন -> মামুনি) made during the ---- */
/* Aug 2026 schedule update, so nothing already saved under the wrong spelling gets lost. */
function migrateStudentRename(oldName, newName){
  const profiles = lsGet('tr_students', {});
  if(profiles[oldName] && !profiles[newName]){ profiles[newName]=profiles[oldName]; delete profiles[oldName]; lsSet('tr_students', profiles); }
  const payments = lsGet('tr_payments', {});
  if(payments[oldName] && !payments[newName]){ payments[newName]=payments[oldName]; delete payments[oldName]; lsSet('tr_payments', payments); }
  const progress = lsGet('tr_progress', {});
  if(progress[oldName] && !progress[newName]){ progress[newName]=progress[oldName]; delete progress[oldName]; lsSet('tr_progress', progress); }
  const att = lsGet('tr_attendance', {});
  let attChanged=false;
  Object.keys(att).forEach(k=>{
    const parts = k.split('|');
    if(parts[2]===oldName){ const nk=parts[0]+'|'+parts[1]+'|'+newName; if(!(nk in att)){ att[nk]=att[k]; delete att[k]; attChanged=true; } }
  });
  if(attChanged) lsSet('tr_attendance', att);
}
if(!lsGet('tr_migrated_2026aug_schedule_fix', false)){
  migrateStudentRename('মামুন','মামুনি');
  lsSet('tr_migrated_2026aug_schedule_fix', true);
}

/* ---- One-time cleanup: remove any leftover self-edit override that still holds a bare "আদিত্য" ---- */
/* (with no s/b suffix) from before the schedule was split into two separate entries, so it stops */
/* showing as a 3rd, ambiguous student in the list. The schedule's own base values are untouched. */
if(!lsGet('tr_migrated_2026aug_aditya_cleanup', false)){
  const ov = getSchedOverrides();
  let changed=false;
  Object.keys(ov).forEach(k=>{
    const parts = ov[k].split(',').map(s=>s.trim());
    if(parts.includes('আদিত্য')){ delete ov[k]; changed=true; }
  });
  if(changed) lsSet('tr_schedOverrides', ov);
  lsSet('tr_migrated_2026aug_aditya_cleanup', true);
}

/* ---- One-time cleanup: PIN system removed entirely, so the app is now always directly editable. ---- */
if(!lsGet('tr_migrated_2026aug_pin_removed', false)){
  localStorage.removeItem('tr_pin');
  lsSet('tr_migrated_2026aug_pin_removed', true);
}
/* ---- One-time cleanup: old uploaded student photos (base64) are no longer displayed but were still ---- */
/* eating the ~5MB localStorage quota. Remove only large 'data:image' strings from student profiles. */
if(!lsGet('tr_migrated_2026oct_photo_cleanup', false)){
  try{
    const profs=lsGet('tr_students', {});
    let changed=false;
    Object.keys(profs).forEach(nm=>{
      const p=profs[nm];
      if(!p || typeof p!=='object') return;
      Object.keys(p).forEach(f=>{
        const v=p[f];
        if(typeof v==='string' && v.length>1500 && /^data:image\//i.test(v)){ delete p[f]; changed=true; }
      });
    });
    if(changed) lsSet('tr_students', profs);
  }catch(e){ /* leave data untouched if anything looks odd */ }
  lsSet('tr_migrated_2026oct_photo_cleanup', true);
}
/* Ask the browser not to evict our data under storage pressure (protects the localStorage-only data). */
try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}

if(!lsGet('tr_currentSessionStart', null)){
  lsSet('tr_currentSessionStart', lsGet('tr_installDate', dateKeyStr(todayDateOnly())));
}

function dateKeyStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function todayDateOnly(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function addDaysToDate(d, n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }

/* ---- Off-day / one-off cancellation: { "YYYY-MM-DD": "all" | ["01","06",...] } ---- */
function getOffMap(){ return lsGet('tr_offMap', {}); }
function isOffOn(date, slotNum){
  const info = getOffMap()[dateKeyStr(date)];
  if(!info) return false;
  return info==='all' || (Array.isArray(info) && info.includes(slotNum));
}
function isDayFullyOff(date){ return getOffMap()[dateKeyStr(date)]==='all'; }
function toggleSlotOff(date, slotNum){
  const map=getOffMap(); const k=dateKeyStr(date);
  if(map[k]==='all') return; // whole day already off; per-slot toggle is moot
  let info = Array.isArray(map[k]) ? map[k].slice() : [];
  const i=info.indexOf(slotNum);
  if(i>=0) info.splice(i,1); else info.push(slotNum);
  if(info.length===0) delete map[k]; else map[k]=info;
  lsSet('tr_offMap', map);
}
function toggleDayOff(date){
  const map=getOffMap(); const k=dateKeyStr(date);
  if(map[k]==='all') delete map[k]; else map[k]='all';
  lsSet('tr_offMap', map);
}

/* ---- One-off "move to another slot": { "YYYY-MM-DD|fromSlotNum": {toSlotNum, name} } ---- */
/* A move relocates one date's class from one slot to a different slot the SAME day, without */
/* touching the permanent weekly template. The source becomes empty for that date; the destination */
/* gets the moved name added on top of whatever it normally has. */
function getMoves(){ return lsGet('tr_moves', {}); }
function getMoveFrom(date, slotNum){ return getMoves()[dateKeyStr(date)+'|'+slotNum] || null; }
function getMoveInto(date, slotNum){
  const moves=getMoves(); const dk=dateKeyStr(date);
  for(const k in moves){ if(k.indexOf(dk+'|')===0 && moves[k].toSlotNum===slotNum) return {fromSlotNum:k.slice(dk.length+1), toSlotNum:moves[k].toSlotNum, name:moves[k].name}; }
  return null;
}
function createMove(date, fromSlotNum, toSlotNum, name){
  const moves=getMoves(); moves[dateKeyStr(date)+'|'+fromSlotNum]={toSlotNum, name}; lsSet('tr_moves', moves);
}
function cancelMove(date, fromSlotNum){
  const moves=getMoves(); delete moves[dateKeyStr(date)+'|'+fromSlotNum]; lsSet('tr_moves', moves);
}

/* ---- Schedule overrides (self-edit mode): { "slotNum|day": "custom text" } ---- */
function getSchedOverrides(){ return lsGet('tr_schedOverrides', {}); }
function getCellText(slot, day){
  const ov=getSchedOverrides(); const k=slot.num+'|'+day;
  return (k in ov) ? ov[k] : (slot.cells[day]||'');
}
function setCellText(slot, day, text){
  const ov=getSchedOverrides(); const k=slot.num+'|'+day;
  const trimmed=text.trim(), original=(slot.cells[day]||'');
  if(trimmed===original){ delete ov[k]; } else { ov[k]=trimmed; }
  lsSet('tr_schedOverrides', ov);
}

// Wraps setCellText with two lightweight safety checks for the self-edit grid:
// (1) if the new text looks like a near-miss typo of an existing known name, confirm before saving;
// (2) if a previously non-empty cell is being cleared to empty, confirm before wiping it.
function handleCellEdit(slotIdx, day, inputEl){
  const slot = SCHEDULE[slotIdx];
  const newVal = inputEl.value.trim();
  const oldVal = getCellText(slot, day).trim();

  if(oldVal && !newVal){
    if(!confirm(`"${oldVal}" মুছে এই ঘর খালি করতে চাও?`)){ inputEl.value = oldVal; return; }
  } else if(newVal){
    const parts = newVal.split(',').map(s=>s.trim()).filter(Boolean);
    for(const part of parts){
      const suggestion = closestNameIfTypo(part);
      if(suggestion){
        if(!confirm(`"${part}" লিখেছ — এটা কি "${suggestion}" হওয়ার কথা ছিল (বানান ভুল কিনা যাচাই করো)?\n\nOK = হ্যাঁ এটাই ঠিক আছে, রেখে দাও যেমন লিখেছ\nCancel = না, আমি ঠিক করে আবার লিখব`)){
          inputEl.focus(); return;
        }
      }
    }
  }
  setCellText(slot, day, inputEl.value);
  renderWeekTable(); renderAll();
}

/* ---- What a slot ACTUALLY shows on one specific real date: template + self-edits, minus cancellations, */
/* minus content relocated away by a move, plus any guest relocated in by a move. This is what the */
/* live/next engine and Day View use; Week View keeps showing the plain recurring template. ---- */
function effectiveContentForDate(slot, day, date){
  let base = getCellText(slot, day).trim();
  if(isOffOn(date, slot.num)) base='';
  if(getMoveFrom(date, slot.num)) base='';
  const into = getMoveInto(date, slot.num);
  if(into) base = base ? base+', '+into.name : into.name;
  return base;
}

/* ---- Per-session notes: { "YYYY-MM-DD|slotNum": "text" (legacy) | {taught,homework,nextPlan} (current) } ---- */
function getNotes(){ return lsGet('tr_notes', {}); }
function getNote(date, slotNum){ return getNotes()[dateKeyStr(date)+'|'+slotNum] || ''; } // legacy accessor, still used for the has-note dot check
/* ---- Per-session notes, now per-student-per-subject: { "YYYY-MM-DD|slotNum": {entries:[{student, ---- */
/* subject, taught, homework, nextPlan}]} } — so a slot with two students studying different things ---- */
/* doesn't force both into one mixed-up text block. Old formats (plain string, or a single ---- */
/* {taught,homework,nextPlan} blob) are read transparently as a single legacy entry, nothing is lost. */
function getNoteEntries(date, slotNum){
  const raw=getNotes()[dateKeyStr(date)+'|'+slotNum];
  if(!raw) return [];
  if(typeof raw==='string') return [{student:'', subject:'', taught:raw, homework:'', nextPlan:''}];
  if(Array.isArray(raw.entries)) return raw.entries;
  return [{student:'', subject:'', taught:raw.taught||'', homework:raw.homework||'', nextPlan:raw.nextPlan||''}];
}
function setNoteEntries(date, slotNum, entries){
  const notes=getNotes(); const k=dateKeyStr(date)+'|'+slotNum;
  const old=(notes[k] && Array.isArray(notes[k].entries)) ? notes[k].entries : [];
  const cleaned=(entries||[]).map(e=>{
    const o={ student:(e.student||'').trim(), subject:(e.subject||'').trim(),
      taught:(e.taught||'').trim(), homework:(e.homework||'').trim(), nextPlan:(e.nextPlan||'').trim() };
    const hw = e.hwStatus || (old.find(x=>x.student===o.student && x.subject===o.subject && x.hwStatus)||{}).hwStatus;
    if(hw) o.hwStatus=hw;                       // 'done' | 'partial' | 'none' — was last class's homework done?
    return o;
  }).filter(e=>e.taught||e.homework||e.nextPlan);
  if(cleaned.length){ notes[k]={entries:cleaned}; if(typeof tombClear==='function') tombClear('note', k); } else { delete notes[k]; if(typeof tombAdd==='function') tombAdd('note', k); }
  lsSet('tr_notes', notes);
}
/* ---- Backward-compatible merged view for spots that just need "is there a note / rough preview" ---- */
/* rather than the full per-student breakdown (e.g. the day-view slot card's small preview line). */
function getNoteStructured(date, slotNum){
  const entries=getNoteEntries(date, slotNum);
  if(!entries.length) return {taught:'', homework:'', nextPlan:''};
  return {
    taught: entries.map(e=>e.taught).filter(Boolean).join(' · '),
    homework: entries.map(e=>e.homework).filter(Boolean).join(' · '),
    nextPlan: entries.map(e=>e.nextPlan).filter(Boolean).join(' · '),
  };
}
/* ---- Finds the most recent earlier session's "next class plan" for this same slot, so today's ---- */
/* "taught" field can be filled from it with one tap instead of retyping what was already planned. */
function getPreviousPlanForSlot(date, slotNum, student){
  const notes = getNotes();
  const todayKey = dateKeyStr(date);
  let bestDateKey = null, bestPlan = '';
  Object.keys(notes).forEach(k=>{
    const [dk, sn] = k.split('|');
    if(sn!==slotNum || dk>=todayKey) return;
    const entries = getNoteEntries(new Date(dk+'T00:00:00'), slotNum);
    const match = student ? entries.find(e=>e.student===student) : entries[0];
    const plan = match ? (match.nextPlan||'').trim() : '';
    if(plan && (!bestDateKey || dk>bestDateKey)){ bestDateKey=dk; bestPlan=plan; }
  });
  return bestPlan;
}
/* ---- Attendance: { "YYYY-MM-DD|slotNum|studentName": "present"|"absent"|"late"|"resched" } ---- */
const ATT_STATUS = {present:{label:'উপস্থিত', icon:'🟢'}, absent:{label:'অনুপস্থিত', icon:'🔴'}, late:{label:'দেরি', icon:'🟡'}, resched:{label:'পিছানো', icon:'🔵'}, excused:{label:'ছুটি নিয়েছে', icon:'⚪'}, cancelled:{label:'ক্লাস বাতিল', icon:'⚫'}};
const PAYMENT_METHODS = ['নগদ','বিকাশ','ব্যাংক','অন্যান্য'];
function getAttendanceMap(){ return lsGet('tr_attendance', {}); }
function getAttendance(date, slotNum, name){ return getAttendanceMap()[dateKeyStr(date)+'|'+slotNum+'|'+name] || null; }
function setAttendance(date, slotNum, name, status){
  const map=getAttendanceMap(); const k=dateKeyStr(date)+'|'+slotNum+'|'+name;
  if(status){ map[k]=status; if(typeof tombClear==='function') tombClear('att', k); } else { delete map[k]; if(typeof tombAdd==='function') tombAdd('att', k); }
  lsSet('tr_attendance', map);
}
// Per-student attendance summary across all recorded history: {present,absent,late,resched,total,pct}
/* ---- Also merges archived sessions, so "সর্বমোট রেকর্ড" (all-time) in the PDF/Reports actually is. ---- */
function computeAttendanceSummary(){
  const byStudent={};
  function accumulate(map){
    Object.keys(map).forEach(k=>{
      const parts=k.split('|'); const name=parts.slice(2).join('|'); const status=map[k];
      if(!byStudent[name]) byStudent[name]={present:0,absent:0,late:0,resched:0,excused:0,cancelled:0,total:0};
      byStudent[name][status]=(byStudent[name][status]||0)+1;
      if(status!=='cancelled') byStudent[name].total++; // a class the teacher cancelled isn't the student's attendance record
    });
  }
  accumulate(getAttendanceMap());
  getArchives().forEach(a=>accumulate(a.data.attendance||{}));
  Object.keys(byStudent).forEach(name=>{
    const s=byStudent[name];
    const countedPresent = s.present + s.late; // late still counts as attended for the percentage
    const countedTotal = s.total - s.excused; // an excused absence doesn't count against the rate either way
    s.pct = countedTotal>0 ? Math.round((countedPresent/countedTotal)*100) : 0;
  });
  return byStudent;
}

/* ---- Which real calendar date does a day-tab ('Sat'..'Fri') refer to right now? ---- */
/* Today if it IS today; otherwise the next upcoming occurrence of that weekday. */
function resolvedDateForDay(day){
  const diff = (DAYS.indexOf(day) - todayKeyIdx() + 7) % 7;
  return addDaysToDate(todayDateOnly(), diff);
}
function bnDateLabel(date){
  const months=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  return `${toBn(date.getDate())} ${months[date.getMonth()]}`;
}

/* ============ SHARED: known names + fuzzy matching (used by typo-check and the command bar) ============ */
function getAllKnownNames(){
  const set=new Set();
  DAYS.forEach(d=>{ SCHEDULE.forEach(slot=>{ getCellText(slot,d).split(',').map(s=>s.trim()).filter(Boolean).forEach(n=>set.add(n)); }); });
  return Array.from(set);
}

/* ============ STUDENT PROFILES (Phase 2) ============ */
/* A student's existence is still derived from the schedule (same as before) — this just attaches */
/* extra editable info to a name: { "নাম": {nickname, klass, school, guardianName, guardianPhone, address, admissionDate, subjects} } */
const STUDENT_FIELDS = [
  {key:'nickname', label:'ডাকনাম'},
  {key:'klass', label:'ক্লাস/শ্রেণী'},
  {key:'school', label:'স্কুল/কলেজ'},
  {key:'subjects', label:'বিষয়সমূহ'},
  {key:'guardianName', label:'অভিভাবকের নাম'},
  {key:'guardianPhone', label:'অভিভাবকের ফোন'},
  {key:'address', label:'ঠিকানা'},
  {key:'admissionDate', label:'ভর্তির তারিখ'},
  {key:'examDate', label:'পরীক্ষার তারিখ'},
];
function getStudentProfiles(){ return lsGet('tr_students', {}); }
function getStudentProfile(name){ return getStudentProfiles()[name] || {}; }
function saveStudentProfile(name, profile){
  const all=getStudentProfiles();
  all[name]=profile;
  lsSet('tr_students', all);
}
function studentProfileFilledCount(name){
  const p=getStudentProfile(name);
  return STUDENT_FIELDS.filter(f=>(p[f.key]||'').trim()).length;
}

/* ============ PROGRESS: subject -> chapters -> % complete (Phase 4) ============ */
/* tr_progress: { studentName: { subjectName: [ {chapter, pct}, ... ] } } */
function getProgressData(){ return lsGet('tr_progress', {}); }
function getStudentSubjects(name){ return getProgressData()[name] || {}; }
function addSubject(name, subject){
  subject=subject.trim(); if(!subject) return;
  const data=getProgressData();
  data[name]=data[name]||{};
  if(!data[name][subject]) data[name][subject]=[];
  lsSet('tr_progress', data);
}
function deleteSubject(name, subject){
  const data=getProgressData();
  if(data[name]){ delete data[name][subject]; lsSet('tr_progress', data); }
}
function addChapter(name, subject, chapter, pct, targetDate){
  subject=subject.trim(); chapter=chapter.trim(); if(!subject||!chapter) return;
  const data=getProgressData();
  data[name]=data[name]||{}; data[name][subject]=data[name][subject]||[];
  const entry={chapter, pct: Math.max(0,Math.min(100, Math.round(pct)||0))};
  if(targetDate) entry.targetDate=targetDate;
  data[name][subject].push(entry);
  lsSet('tr_progress', data);
  try{ sfLogSnapshot(name); }catch(e){}
}
function updateChapterPct(name, subject, idx, pct){
  const data=getProgressData();
  if(data[name] && data[name][subject] && data[name][subject][idx]){
    data[name][subject][idx].pct = Math.max(0,Math.min(100, Math.round(pct)||0));
    lsSet('tr_progress', data);
    try{ sfLogSnapshot(name); }catch(e){}
  }
}
function updateChapterTarget(name, subject, idx, targetDate){
  const data=getProgressData();
  if(data[name] && data[name][subject] && data[name][subject][idx]){
    if(targetDate) data[name][subject][idx].targetDate=targetDate;
    else delete data[name][subject][idx].targetDate;
    lsSet('tr_progress', data);
  }
}
/* ---- Term planning: chapters can carry an optional target date; this renders a small colored badge ---- */
/* (overdue/soon/normal) next to the chapter name, and collectUpcomingDeadlines() feeds the Reports view. */
function renderTargetBadge(targetDate){
  const days = Math.round((new Date(targetDate+'T00:00:00') - todayDateOnly()) / 86400000);
  let cls='target-badge', text;
  if(days<0){ cls+=' target-overdue'; text=`${toBn(Math.abs(days))} দিন পার হয়ে গেছে`; }
  else if(days===0){ cls+=' target-soon'; text='আজই'; }
  else if(days<=7){ cls+=' target-soon'; text=`${toBn(days)} দিন বাকি`; }
  else { text=bnDateLabel(new Date(targetDate+'T00:00:00')); }
  return ` <span class="${cls}">🎯 ${text}</span>`;
}
function collectUpcomingDeadlines(){
  const progress=getProgressData();
  const profiles=getStudentProfiles();
  const items=[];
  Object.keys(progress).forEach(name=>{
    Object.keys(progress[name]).forEach(subj=>{
      progress[name][subj].forEach(c=>{
        if(c.targetDate) items.push({name, subj, chapter:c.chapter, date:c.targetDate, kind:'chapter'});
      });
    });
  });
  Object.keys(profiles).forEach(name=>{
    const d=(profiles[name].examDate||'').trim();
    if(d && /^\d{4}-\d{2}-\d{2}$/.test(d)) items.push({name, date:d, kind:'exam'});
  });
  collectAdmissionRenewals().forEach(r=>{
    items.push({name:r.name, date:dateKeyStr(r.anniversaryDate), kind:'renewal', years:r.years});
  });
  items.sort((a,b)=> a.date<b.date?-1:1);
  return items;
}
/* ---- Admission renewal: flags students whose admission-date anniversary falls within about a ---- */
/* week either side of today, so old admissions don't get forgotten as a renewal conversation. */
function collectAdmissionRenewals(){
  const profiles=getStudentProfiles();
  const today=todayDateOnly();
  const items=[];
  Object.keys(profiles).forEach(name=>{
    const d=(profiles[name].admissionDate||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const admitDate=new Date(d+'T00:00:00');
    if(isNaN(admitDate)) return;
    const yearsSince=today.getFullYear()-admitDate.getFullYear();
    if(yearsSince<1) return;
    const anniv=new Date(admitDate); anniv.setFullYear(admitDate.getFullYear()+yearsSince);
    const daysDiff=Math.round((anniv-today)/86400000);
    if(daysDiff>=-7 && daysDiff<=7) items.push({name, years:yearsSince, anniversaryDate:anniv});
  });
  return items;
}
function renderUpcomingDeadlines(){
  const items = collectUpcomingDeadlines();
  if(items.length===0) return `<div class="ins-empty">কোনো টার্গেট তারিখ, পরীক্ষার তারিখ বা ভর্তি-নবায়ন নেই — ছাত্রের প্রোফাইলে "পরীক্ষার তারিখ"/"ভর্তির তারিখ" অথবা কোনো অধ্যায়ে "টার্গেট তারিখ" যোগ করো।</div>`;
  return items.map(it=>{
    const days = Math.round((new Date(it.date+'T00:00:00') - todayDateOnly()) / 86400000);
    const overdue = days<0;
    const soon = days>=0 && days<=7;
    const label = it.kind==='exam' ? `${escapeHtml(it.name)} — পরীক্ষা`
      : it.kind==='renewal' ? `${escapeHtml(it.name)} — ভর্তির ${toBn(it.years)} বছর পূর্ণ`
      : `${escapeHtml(it.name)} — ${escapeHtml(it.subj)}: ${escapeHtml(it.chapter)}`;
    const icon = it.kind==='exam' ? '📝' : it.kind==='renewal' ? '🔁' : '🎯';
    return `<div class="makeup-row">
      <span onclick="closeSearchModal();switchTab('students');openStudentModal('${jsq(it.name)}')" style="cursor:pointer;">${icon} ${label}</span>
      <span class="${overdue?'target-overdue':(soon?'target-soon':'')}" style="font-size:11px;">${bnDateLabel(new Date(it.date+'T00:00:00'))}</span>
    </div>`;
  }).join('');
}
function deleteChapter(name, subject, idx){
  const data=getProgressData();
  if(data[name] && data[name][subject]){
    data[name][subject].splice(idx,1);
    lsSet('tr_progress', data);
  }
}
function computeStudentAcademicPct(name){
  const subjects=getStudentSubjects(name);
  let all=[];
  Object.values(subjects).forEach(chs=>{ all=all.concat(chs); });
  if(!all.length) return null;
  return Math.round(all.reduce((a,c)=>a+c.pct,0)/all.length);
}

