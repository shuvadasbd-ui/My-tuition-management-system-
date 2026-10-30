/* ============ SETTINGS TAB: notifications + backup/restore ============ */
const BACKUP_KEYS=['tr_teacherPhone','tr_budget','tr_khata','tr_khataPeople','tr_daily','tr_lastPayMethod','tr_fx','tr_wrapSkip','tr_receiptSeq','tr_notifShowNames','tr_teacherName', 'tr_offMap','tr_schedOverrides','tr_notes','tr_notifEnabled','tr_notifiedLog','tr_makeups','tr_installDate','tr_moves','tr_students','tr_attendance','tr_progress','tr_payments','tr_hideFinance','tr_expenses','tr_lateFee','tr_theme','tr_archives','tr_currentSessionStart','tr_todos','tr_boosterStart','tr_recurring','tr_catBudget','tr_numMode','tr_tipStep','tr_khataNotes','tr_radarTravel','tr_radarGoal','tr_progLog','tr_thinkLog','tr_fxNew','tr_qbank','tr_results','tr_resultCfg','tr_resultPins','tr_adjust','tr_tombstones','tr_schemaVer'];
/* ---- Calendar export (.ics): a weekly-recurring event per scheduled slot/day, so the whole routine ---- */
/* can be imported into Google Calendar / the phone's own calendar and seen alongside everything else. */
function icsEscape(s){ return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }
function icsTimeStr(h,m){ return String(h).padStart(2,'0')+String(m).padStart(2,'0')+'00'; }
/* ---- Voice-to-text: uses the browser's built-in Web Speech API (no library, no server) to fill a ---- */
/* note field by speaking instead of typing — handy right after a class when typing is slower. */
/* ---- Theme: toggles a body class that swaps the CSS custom properties defined in :root / ---- */
/* body.light-theme — persisted so it stays applied across app opens. */
/* ---- Collapsible settings/report sections: keeps long lists of options scannable — tap a section ---- */
/* title to expand/collapse it. Open/closed state persists per section-id across re-renders. */
function toggleSection(headerEl, sectionId){
  const body = headerEl.nextElementSibling;
  if(!body) return;
  const nowOpen = body.style.display === 'none';
  body.style.display = nowOpen ? '' : 'none';
  headerEl.classList.toggle('is-open', nowOpen);
  const state = lsGet('tr_sectionState', {});
  state[sectionId] = nowOpen;
  lsSet('tr_sectionState', state);
}
function sectionOpen(sectionId, defaultOpen){
  const state = lsGet('tr_sectionState', {});
  return sectionId in state ? state[sectionId] : defaultOpen;
}
function collapsibleTitle(id, label, defaultOpen){
  const open = sectionOpen(id, defaultOpen);
  return `<div class="settings-section-title collapsible-title${open?' is-open':''}" onclick="toggleSection(this,'${id}')">${label}</div>`;
}
function applyTheme(){
  // the previous build switched everyone to the Tally look by itself; undo that once, unless the person picked it on purpose
  if(lsGet('tr_tallyDefault',false) && !lsGet('tr_themeChosen',false) && !lsGet('tr_tallyReverted',false)){ lsSet('tr_tallyReverted',true); if(lsGet('tr_theme','dark')==='tally') lsSet('tr_theme','dark'); }
  const theme = lsGet('tr_theme', 'dark');
  document.body.classList.toggle('light-theme', theme==='light' || theme==='tally');
  document.body.classList.toggle('tally-theme', theme==='tally');
}
function setTheme(t){ lsSet('tr_themeChosen',true); lsSet('tr_theme',t); applyTheme(); renderAll(); }
function onToggleTheme(isLight){
  lsSet('tr_theme', isLight ? 'light' : 'dark');
  applyTheme();
}
function startVoiceInput(fieldId, btn){
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRec){ showWarningToast('এই ব্রাউজারে ভয়েস টাইপিং সাপোর্ট নেই — কিবোর্ড খুললে সেখানকার মাইক আইকন ব্যবহার করতে পারো।'); return; }
  const field = document.getElementById(fieldId);
  if(!field) return;
  const rec = new SpeechRec();
  rec.lang = 'bn-BD';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  if(btn) btn.classList.add('listening');
  rec.onresult = (e)=>{
    const text = e.results[0][0].transcript;
    field.value = field.value.trim() ? field.value.trim()+' '+text : text;
  };
  rec.onerror = ()=>{ if(btn) btn.classList.remove('listening'); };
  rec.onend = ()=>{ if(btn) btn.classList.remove('listening'); };
  rec.start();
}
function onToggleLateFee(checked){
  const cfg=getLateFeeConfig();
  lsSet('tr_lateFee', {...cfg, enabled:checked});
  renderInsights(); renderDueReminder();
}
function onLateFeeSettingChange(){
  const cfg=getLateFeeConfig();
  const amount=parseFloat(document.getElementById('lateFeeAmount').value)||0;
  const afterDay=Math.max(1, Math.min(28, parseInt(document.getElementById('lateFeeDay').value)||10));
  lsSet('tr_lateFee', {...cfg, amount, afterDay});
  renderInsights(); renderDueReminder();
}
function exportScheduleICS(){
  const BYDAY_CODE = {Sat:'SA',Sun:'SU',Mon:'MO',Tue:'TU',Wed:'WE',Thu:'TH',Fri:'FR'};
  const now=new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  let events='';
  DAYS.forEach(d=>{
    SCHEDULE.forEach(slot=>{
      const names = getCellText(slot, d).trim();
      if(!names) return;
      // find the next date that falls on this weekday, to anchor the weekly-recurring event
      const targetDow = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[d];
      let anchor=new Date(now); anchor.setHours(0,0,0,0);
      while(anchor.getDay()!==targetDow) anchor=addDaysToDate(anchor,1);
      const y=anchor.getFullYear(), mo=String(anchor.getMonth()+1).padStart(2,'0'), da=String(anchor.getDate()).padStart(2,'0');
      const startH=Math.floor(slot.start/60), startM=slot.start%60;
      const endH=Math.floor(slot.end/60), endM=slot.end%60;
      const uid=`${d}-${slot.num}@amar-tuition-routine`;
      events += `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${dtstamp}\r\nDTSTART;TZID=Asia/Dhaka:${y}${mo}${da}T${icsTimeStr(startH,startM)}\r\nDTEND;TZID=Asia/Dhaka:${y}${mo}${da}T${icsTimeStr(endH,endM)}\r\nRRULE:FREQ=WEEKLY;BYDAY=${BYDAY_CODE[d]}\r\nSUMMARY:${icsEscape(names)}\r\nDESCRIPTION:${icsEscape(slot.label)}\r\nEND:VEVENT\r\n`;
    });
  });
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Amar Tuition Routine//EN\r\nCALSCALE:GREGORIAN\r\n${events}END:VCALENDAR\r\n`;
  const blob=new Blob([ics], {type:'text/calendar'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='tuition-routine.ics';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function renderBackupNag(){
  const el=document.getElementById('backupNagBox'); if(!el) return;
  const last=lsGet('tr_lastBackupAt', null);
  const days = last ? Math.floor((Date.now()-new Date(last).getTime())/86400000) : 999;
  if(days<7 || lsGet('tr_backupNagDay','')===dateKeyStr(todayDateOnly())){ el.innerHTML=''; return; }
  el.innerHTML=`<div class="due-reminder"><div class="due-reminder-text">💾 ${last?`সর্বশেষ ব্যাকআপ ${toBn(days)} দিন আগে`:'এখনো কোনো ব্যাকআপ নেওয়া হয়নি'} — ডেটা হারানোর আগে নিয়ে রাখো</div>
    <div style="display:flex;gap:8px;margin-top:8px;"><button class="pct-chip" onclick="backupAndShare()">ব্যাকআপ নাও</button><button class="pct-chip" onclick="dismissBackupNag()">পরে</button></div></div>`;
}
function dismissBackupNag(){ lsSet('tr_backupNagDay', dateKeyStr(todayDateOnly())); renderBackupNag(); }
/* ---- Backup encryption (optional): AES-GCM with a key derived from the teacher's password (PBKDF2). ---- */
/* The backup holds student names, phone numbers and money records, and usually gets shared via */
/* WhatsApp/Drive — a password-protected file is useless to anyone else who gets hold of it. */
function b64FromBytes(buf){ let s=''; const u=new Uint8Array(buf); for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); }
function bytesFromB64(b){ const s=atob(b); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; }
async function deriveBackupKey(password, salt){
  const base=await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:250000, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function encryptBackupText(plainText, password){
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveBackupKey(password, salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, new TextEncoder().encode(plainText));
  return JSON.stringify({ app:'tuition-routine', encrypted:true, v:1, exportedAt:new Date().toISOString(), salt:b64FromBytes(salt), iv:b64FromBytes(iv), data:b64FromBytes(ct) });
}
async function decryptBackupPayload(payload, password){
  const key=await deriveBackupKey(password, bytesFromB64(payload.salt));
  const pt=await crypto.subtle.decrypt({name:'AES-GCM', iv:bytesFromB64(payload.iv)}, key, bytesFromB64(payload.data));
  return JSON.parse(new TextDecoder().decode(pt));
}
function collectBackupData(){
  const data={}; BACKUP_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!==null) data[k]=v; });
  return data;
}
/* Returns the file text to save, or null if the teacher cancelled. plain=true skips the password question. */
async function buildBackupFileText(plain){
  const json=(()=>{ const data=collectBackupData(); return JSON.stringify({ app:'tuition-routine', version:9, schema:(typeof SCHEMA_VERSION!=='undefined'?SCHEMA_VERSION:undefined), exportedAt:new Date().toISOString(), checksum:(typeof bkChecksum==='function'?bkChecksum(data):undefined), counts:(typeof bkCounts==='function'?bkCounts(data):undefined), data }, null, 2); })();
  if(plain) return json;
  const canEncrypt = !!(window.crypto && crypto.subtle);
  if(!canEncrypt) return json;
  const pw=prompt('ব্যাকআপ ফাইলে পাসওয়ার্ড দিন (নিরাপত্তার জন্য ভালো)।\n\n⚠️ পাসওয়ার্ড ভুলে গেলে এই ব্যাকআপ আর খোলা যাবে না — মনে রাখার মতো কিছু দিন।\nপাসওয়ার্ড ছাড়াই নিতে চাইলে ফাঁকা রেখে OK চাপুন।','');
  if(pw===null) return null;
  if(!pw) return json;
  if(pw.length<4){ showWarningToast('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের দিন।'); return null; }
  const again=prompt('পাসওয়ার্ডটা আবার লিখুন:','');
  if(again===null) return null;
  if(again!==pw){ showWarningToast('দুইবার একই পাসওয়ার্ড মেলেনি, ব্যাকআপ নেওয়া হয়নি।'); return null; }
  return encryptBackupText(json, pw);
}
function backupFileName(){ return `tuition-routine-backup-${dateKeyStr(todayDateOnly())}.json`; }
async function backupAndShare(){
  let text;
  try{ text=await buildBackupFileText(false); }catch(e){ showWarningToast('ব্যাকআপ তৈরি করা যায়নি।'); return; }
  if(text===null) return;
  const file=new File([text], backupFileName(), {type:'application/json'});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'টিউশন রুটিন ব্যাকআপ'});
      lsSet('tr_lastBackupAt', new Date().toISOString()); renderBackupNag(); renderSettingsTab();
      showSuccessToast('ব্যাকআপ শেয়ার হয়েছে — WhatsApp বা Drive-এ সেভ করে রাখো');
      return;
    }
  }catch(e){ if(e && e.name==='AbortError') return; }
  downloadBackupText(text); renderBackupNag();
}
function downloadBackupText(text){
  const blob=new Blob([text], {type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=backupFileName();
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
  lsSet('tr_lastBackupAt', new Date().toISOString());
  renderSettingsTab();
}
async function exportBackup(opts){
  const plain = !!(opts && opts.plain);
  let text;
  try{ text=await buildBackupFileText(plain); }catch(e){ showWarningToast('ব্যাকআপ তৈরি করা যায়নি।'); return; }
  if(text===null) return;
  downloadBackupText(text);
}
/* ---- Import preview: instead of overwriting blind, show a before/after record-count comparison ---- */
/* and automatically save a backup of the current data first — so an accidental wrong-file import ---- */
/* is always recoverable. */
function countRecordsFromJsonStr(raw){
  try{
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)) return parsed.length;
    if(parsed && typeof parsed==='object') return Object.keys(parsed).length;
  }catch(e){}
  return 0;
}
let pendingImportPayload=null;
function validateBackupPayload(payload){
  if(!payload || typeof payload!=='object' || !payload.data || typeof payload.data!=='object' || Array.isArray(payload.data)) return false;
  if(payload.app && payload.app!=='tuition-routine') return false;
  if(typeof bkProblems==='function' && bkProblems(payload, BACKUP_KEYS, SCHEMA_VERSION).fatal.length) return false;
  const keys=Object.keys(payload.data).filter(k=>BACKUP_KEYS.includes(k));
  if(!keys.length) return false;
  // every value must be a string holding valid JSON — otherwise the app would crash on the next load
  return keys.every(k=>{ const v=payload.data[k]; if(typeof v!=='string') return false; try{ JSON.parse(v); return true; }catch(e){ return false; } });
}
function importBackup(file){
  if(!file) return;
  if(typeof BK_MAX_BYTES!=='undefined' && file.size>BK_MAX_BYTES){ showWarningToast('ফাইলটা অনেক বড় (২৫ MB-এর বেশি) — ব্যাকআপ ফাইল মনে হচ্ছে না।'); return; }
  const reader=new FileReader();
  reader.onload=async (e)=>{
    try{
      let payload=JSON.parse(e.target.result);
      if(payload && payload.encrypted){
        if(!(window.crypto && crypto.subtle)) throw new Error('nocrypto');
        const pw=prompt('এই ব্যাকআপ পাসওয়ার্ড দিয়ে সুরক্ষিত। পাসওয়ার্ড লিখুন:','');
        if(pw===null) return;
        try{ payload=await decryptBackupPayload(payload, pw); }
        catch(err){ showWarningToast('পাসওয়ার্ড ভুল, অথবা ফাইলটা নষ্ট।'); return; }
      }
      if(typeof bkProblems==='function'){ const pr=bkProblems(payload, BACKUP_KEYS, SCHEMA_VERSION); if(pr.fatal.length){ showWarningToast(pr.fatal[0]+' — এখনকার তথ্য যেমন ছিল তেমনই আছে।'); return; } }
      if(!validateBackupPayload(payload)) throw new Error('invalid');
      showImportPreview(payload);
    }catch(err){ showWarningToast('এই ফাইলটা ঠিক ব্যাকআপ ফাইল মনে হচ্ছে না, অথবা ভেতরের তথ্য নষ্ট।'); }
  };
  reader.readAsText(file);
}
function showImportPreview(payload){
  pendingImportPayload=payload;
  const compareKeys=[
    {key:'tr_students', label:'শিক্ষার্থী প্রোফাইল'},
    {key:'tr_payments', label:'পেমেন্ট রেকর্ড'},
    {key:'tr_attendance', label:'অ্যাটেন্ডেন্স এন্ট্রি'},
    {key:'tr_notes', label:'ক্লাস নোট'},
    {key:'tr_expenses', label:'খরচের এন্ট্রি'},
    {key:'tr_archives', label:'আর্কাইভ করা সেশন'},
  ];
  const rows=compareKeys.map(c=>{
    const curRaw=localStorage.getItem(c.key);
    const newRaw=payload.data[c.key];
    if(curRaw===null && newRaw===undefined) return '';
    const curCount=curRaw?countRecordsFromJsonStr(curRaw):0;
    const newCount=newRaw?countRecordsFromJsonStr(newRaw):0;
    return `<div class="makeup-row"><span>${c.label}</span><span class="pay-history-amt">${toBn(curCount)} → ${toBn(newCount)}</span></div>`;
  }).filter(Boolean).join('');
  const exportedAt=payload.exportedAt ? bnDateLabel(new Date(payload.exportedAt)) : 'অজানা তারিখ';
  document.getElementById('yirBody').innerHTML=`
    <div class="modal-title" style="text-align:center;">📥 ব্যাকআপ প্রিভিউ</div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:4px;">এই ব্যাকআপ নেওয়া হয়েছিল: ${exportedAt}</div>
    <div style="margin-top:12px;">${rows || '<div class="ins-empty">তুলনা করার মতো তথ্য পাওয়া যায়নি।</div>'}</div>
    ${typeof bkPreviewHtml==='function'?bkPreviewHtml(payload):''}
    <div class="prevplan-chip" style="display:block;margin-top:10px;">⚠️ ইমপোর্ট করলে এখনকার তথ্য এই ব্যাকআপ দিয়ে বদলে যাবে — এগিয়ে যাওয়ার আগে চলতি তথ্যের একটা ব্যাকআপ নিজে থেকেই ডাউনলোড হয়ে যাবে।</div>
    <div class="modal-actions">
      <button class="modal-btn secondary" onclick="cancelImportBackup()">বাতিল</button>
      <button class="modal-btn primary" onclick="confirmImportBackup()">নিশ্চিত করো, ইমপোর্ট করো</button>
    </div>`;
  document.getElementById('yirModal').style.display='flex';
}
function cancelImportBackup(){ pendingImportPayload=null; closeYearInReview(); }
function confirmImportBackup(){
  if(!pendingImportPayload) return;
  if(typeof bkApplyMode==='function') pendingImportPayload=bkApplyMode(pendingImportPayload);
  safetySnapshot('before-import');
  try{ if(pendingImportPayload._abKey){ lsSet('tr_abKey', pendingImportPayload._abKey); lsSet('tr_abHash',''); } }catch(e){}   // restored from an online backup: keep using that same recovery code
  if(!validateBackupPayload(pendingImportPayload)){ showWarningToast('ব্যাকআপ ফাইলটা ঠিক নেই, ইমপোর্ট বন্ধ করা হলো।'); pendingImportPayload=null; return; }
  exportBackup({plain:true}); // automatic safety backup of current data before overwriting
  // Snapshot current values so a failure halfway (e.g. storage full) can be rolled back completely.
  const snapshot={}; BACKUP_KEYS.forEach(k=>{ snapshot[k]=localStorage.getItem(k); });
  try{
    // True restore: keys present in the backup are written, keys absent from it are cleared,
    // so old and new data never end up mixed.
    BACKUP_KEYS.forEach(k=>{
      if(Object.prototype.hasOwnProperty.call(pendingImportPayload.data,k)) localStorage.setItem(k, pendingImportPayload.data[k]);
      else localStorage.removeItem(k);
    });
  }catch(err){
    BACKUP_KEYS.forEach(k=>{ try{ if(snapshot[k]===null) localStorage.removeItem(k); else localStorage.setItem(k, snapshot[k]); }catch(e){} });
    pendingImportPayload=null;
    showWarningToast('ইমপোর্ট করা যায়নি (স্টোরেজ ভরা থাকতে পারে)। আগের তথ্য যেমন ছিল তেমনই আছে।');
    return;
  }
  pendingImportPayload=null;
  showSuccessToast('ইমপোর্ট সম্পন্ন হয়েছে — পেজ রিফ্রেশ হচ্ছে...');
  setTimeout(()=>location.reload(), 1000);
}
function renderSettingsTab(){
  const el=document.getElementById('settingsBody');
  if(!el) return;
  const lastBackup = lsGet('tr_lastBackupAt', null);
  let backupStatusHtml;
  if(!lastBackup){
    backupStatusHtml = `<div class="backup-status backup-status-warn">⚠️ এখনো কোনো ব্যাকআপ নেওয়া হয়নি</div>`;
  } else {
    const days = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000);
    const dayText = days<=0 ? 'আজ' : days===1 ? 'গতকাল' : `${toBn(days)} দিন আগে`;
    backupStatusHtml = `<div class="backup-status${days>14?' backup-status-warn':''}">${days>14?'⚠️':'✅'} সর্বশেষ ব্যাকআপ: ${dayText}</div>`;
  }
  const notifOn = notifPermissionState()==='granted' && lsGet('tr_notifEnabled', false);
  const bkDays = lastBackup ? Math.floor((Date.now()-new Date(lastBackup).getTime())/86400000) : null;
  const statusStripHtml = `<div class="set-status">
      <span class="set-chip ${notifOn?'ok':''}">${notifOn?'🔔 নোটিফিকেশন চালু':'🔕 নোটিফিকেশন বন্ধ'}</span>
      <span class="set-chip ${bkDays===null||bkDays>14?'warn':'ok'}">${bkDays===null?'💾 ব্যাকআপ নেওয়া হয়নি':(bkDays<=0?'💾 ব্যাকআপ আজ':`💾 ব্যাকআপ ${toBn(bkDays)} দিন আগে`)}</span>
      <span class="set-chip">${{light:'☀️ লাইট থিম',tally:'🔴 টালি থিম'}[lsGet('tr_theme','dark')]||'🌙 ডার্ক থিম'}</span>
      <button type="button" class="set-chip ${lsGet('tr_fx','on')==='off'?'':'ok'}" onclick="toggleFx()" style="font-family:inherit;cursor:pointer;">✨ ইফেক্ট: ${lsGet('tr_fx','on')==='off'?'বন্ধ':'চালু'}</button>
    </div>`;
  el.innerHTML = `
    ${statusStripHtml}
    <div class="settings-section">
      ${collapsibleTitle('notif','🔔 নোটিফিকেশন', false)}
      <div class="settings-row" style="${sectionOpen('notif',false)?'':'display:none;'}">
        <button class="notif-btn" id="notifToggleBtn" onclick="enableNotifications()"></button>
        <button class="notif-btn" id="notifNamesBtn" onclick="toggleNotifNames()" style="display:none;margin-top:8px;"></button>
        <button class="settings-btn" id="notifSyncBtn" onclick="manualSyncPush()" style="display:none;">🔄 এখন সিঙ্ক করো (শিডিউল বদলালে চাপো)</button>
        <div style="font-size:10.5px;color:var(--muted);line-height:1.6;margin-top:6px;">অ্যাপ বন্ধ থাকলেও রিমাইন্ডার পেতে সার্ভার সাইড পুশ সেটআপ লাগবে — বিস্তারিত README-তে আছে।</div>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('safety','🛡️ ডেটা সুরক্ষা', true)}
      <div class="settings-row" style="${sectionOpen('safety',true)?'':'display:none;'}">${safetyCardHtml()}</div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('backup','💾 ডেটা ব্যাকআপ', true)}
      <div class="settings-row" style="${sectionOpen('backup',true)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">ফোন হারালে বা রিসেট হলে এই ব্রাউজারের সব সেভ করা তথ্য (এডিট, ছুটি, নোট, মুভ) হারিয়ে যেতে পারে — মাঝেমধ্যে ব্যাকআপ নিয়ে রাখো।</div>
        ${abCardHtml()}
        ${aiCardHtml()}
        ${bioCardHtml()}
        ${backupStatusHtml}
        <button class="settings-btn" onclick="exportBackup()">⬇️ ব্যাকআপ ডাউনলোড করো</button>
        <button class="settings-btn" onclick="document.getElementById('restoreFileInput').click()">⬆️ ব্যাকআপ থেকে ফিরিয়ে আনো</button>
        <input type="file" id="restoreFileInput" class="settings-file-input" accept="application/json" onchange="importBackup(this.files[0])">
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('ics','📆 ক্যালেন্ডার এক্সপোর্ট', false)}
      <div class="settings-row" style="${sectionOpen('ics',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">পুরো সাপ্তাহিক রুটিন একটা ফাইলে বানিয়ে দাও, যেটা Google Calendar বা ফোনের ক্যালেন্ডারে যোগ করা যাবে।</div>
        <button class="settings-btn" onclick="exportScheduleICS()">📆 ক্যালেন্ডার ফাইল (.ics) ডাউনলোড করো</button>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('latefee','⏰ লেট ফি', false)}
      <div class="settings-row" style="${sectionOpen('latefee',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">চালু করলে, মাসের একটা নির্দিষ্ট তারিখ পার হয়ে গেলেও ফি বাকি থাকলে বকেয়ার হিসাবে একটা এক্সট্রা লেট ফি যোগ করে দেখাবে (এটা শুধু হিসাবে দেখানোর জন্য, পেমেন্ট রেকর্ডে যোগ হয় না)।</div>
        <label class="toggle-row">
          <span>লেট ফি চালু করো</span>
          <input type="checkbox" ${getLateFeeConfig().enabled?'checked':''} onchange="onToggleLateFee(this.checked)">
        </label>
        <div class="add-day-row" style="margin-top:8px;">
          <span class="add-day-lb">পরিমাণ</span>
          <input type="number" min="0" id="lateFeeAmount" class="sm-field-input" value="${getLateFeeConfig().amount}" onchange="onLateFeeSettingChange()">
        </div>
        <div class="add-day-row">
          <span class="add-day-lb">দিন</span>
          <input type="number" min="1" max="28" id="lateFeeDay" class="sm-field-input" value="${getLateFeeConfig().afterDay}" onchange="onLateFeeSettingChange()">
        </div>
        <div style="font-size:10.5px;color:var(--muted);">মাসের কত তারিখের পর লেট ফি ধরা হবে।</div>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('theme','🎨 থিম', false)}
      <div class="settings-row" style="${sectionOpen('theme',false)?'':'display:none;'}">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">অ্যাপের থিম</div>
        <div class="pct-chip-row">${[['dark','🌙 ডার্ক'],['light','☀️ লাইট'],['tally','🔴 টালি']].map(([k,l])=>`<button type="button" class="pct-chip${lsGet('tr_theme','dark')===k?' on':''}" onclick="setTheme('${k}')">${l}</button>`).join('')}</div>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('numfmt','🔢 সংখ্যার ধরন', false)}
      <div class="settings-row" style="${sectionOpen('numfmt',false)?'':'display:none;'}">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.6;">অ্যাপের সব সংখ্যা কোন ধরনে দেখাবে। বদলালে অ্যাপ একবার নিজে রিফ্রেশ হবে।</div>
        <div class="pct-chip-row">${[['mixed','মিশ্র'],['en','সব ইংরেজি (123)'],['bn','সব বাংলা (১২৩)']].map(([k,l])=>`<button type="button" class="pct-chip${_numMode===k?' on':''}" onclick="setNumMode('${k}')">${l}</button>`).join('')}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;">মিশ্র = খাতায় ইংরেজি, বাকি জায়গায় বাংলা।</div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">💡 শুরুর টিপস</div>
      <div class="settings-row"><div style="font-size:12px;color:var(--muted);margin-bottom:8px;">অ্যাপ ব্যবহারের ৩টা ছোট টিপ আবার দেখতে চাইলে।</div><button type="button" class="settings-btn" onclick="replayTips()">টিপস আবার দেখাও</button></div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('finprivacy','🙈 আর্থিক গোপনীয়তা', true)}
      <div class="settings-row" style="${sectionOpen('finprivacy',true)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">ফোনটা অন্য কেউ দেখলেও যেন টাকার হিসাব চোখে না পড়ে, তাই এটা <b style="color:var(--paper);">ডিফল্টভাবে চালু</b> — ফি, পেমেন্ট, আয়ের হিসাব সব জায়গায় লুকানো থাকে (৳ ••••), "দেখাও" চাপলে দেখা যায়। অ্যাপ আবার খুললে এটা আবার লুকিয়ে যাবে।</div>
        <label class="toggle-row">
          <span>টাকার অংক লুকিয়ে রাখো</span>
          <input type="checkbox" id="hideFinanceToggle" ${lsGet('tr_hideFinance', true)?'checked':''} onchange="onToggleHideFinance(this.checked)">
        </label>
        ${lsGet('tr_hideFinance', true) ? (
          financeUnlocked
            ? `<div class="backup-status" style="margin-top:8px;">🔓 এখন দেখা যাচ্ছে (এই সেশনে)</div><button class="settings-btn" onclick="lockFinanceAgain()">🙈 আবার লুকাও</button>`
            : `<button class="settings-btn" style="margin-top:8px;" onclick="unlockFinance()">🔓 দেখাও</button>`
        ) : ''}
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('yir','🎉 ইয়ার ইন রিভিউ', false)}
      <div class="settings-row" style="${sectionOpen('yir',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">এখন পর্যন্ত মোট কতজন ছাত্র পড়িয়েছ, কত ঘণ্টা, কত আয় — একটা সামারি কার্ড দেখো।</div>
        <button class="settings-btn" onclick="showYearInReview()">✨ সামারি দেখাও</button>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('notesdb','📔 নোট ডেটাবেজ', false)}
      <div class="settings-row" style="${sectionOpen('notesdb',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">কোন দিন কী পড়ানো হলো, হোমওয়ার্ক কী দেওয়া হলো — দৈনিক/সাপ্তাহিক/মাসিক হিসেবে দেখো, আর এক ট্যাপে হোয়াটসঅ্যাপে পাঠানোর জন্য কপি করো।</div>
        <button class="settings-btn" onclick="openNotesDatabase()"><span class="ic">${ICN.note}</span> নোট ডেটাবেজ খুলো</button>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('pdf','🖨️ রিপোর্ট এক্সপোর্ট', false)}
      <div class="settings-row" style="${sectionOpen('pdf',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">এই মাসের আয়-পেমেন্ট আর উপস্থিতির হিসাব একটা পরিষ্কার PDF হিসেবে সেভ/প্রিন্ট করো।</div>
        <button class="settings-btn" onclick="exportReportPDF()">🖨️ PDF হিসেবে এক্সপোর্ট করো</button>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('session','🎓 সেশন ম্যানেজমেন্ট', false)}
      <div class="settings-row" style="${sectionOpen('session',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">নতুন শিক্ষাবর্ষ শুরু করলে এই মাসের/আগের অ্যাটেন্ডেন্স-নোট-পেমেন্ট আর্কাইভ হয়ে যাবে, শিডিউল ও প্রোফাইল ঠিকই থেকে যাবে।</div>
        <button class="settings-btn" onclick="openSessionManager()">🎓 সেশন ম্যানেজ করো</button>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('todos','📝 রিমাইন্ডার নোট', false)}
      <div class="settings-row" style="${sectionOpen('todos',false)?'':'display:none;'}">
        ${renderTodoSection()}
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('daysummary','📊 আজকের সারাংশ', false)}
      <div class="settings-row" style="${sectionOpen('daysummary',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">আজ কতগুলো ক্লাস লগ হয়েছে, কতগুলো নোট বাকি, আজ কত টাকা পেয়েছ — এক নজরে দেখো।</div>
        <button class="settings-btn" onclick="showDaySummary()">📊 আজকের সারাংশ দেখাও</button>
      </div>
    </div>
    <div class="settings-section">
      ${collapsibleTitle('healthcheck','🩺 ডেটা হেলথ-চেক', false)}
      <div class="settings-row" style="${sectionOpen('healthcheck',false)?'':'display:none;'}">
        <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">মাসিক ফি সেট করা আছে কিনা, নামের বানানে ভুল আছে কিনা — এমন খুঁটিনাটি সমস্যা নিজে থেকে খুঁজে বের করে দেখাবে।</div>
        <button class="settings-btn" onclick="showDataHealthCheck()">🩺 চেক করো</button>
      </div>
    </div>`;
  renderNotifToggle(); safetyRefreshCard();
}
function onToggleHideFinance(checked){
  lsSet('tr_hideFinance', checked);
  if(!checked) financeUnlocked=false; // no need to stay "unlocked" once the feature itself is off
  refreshFinanceViews();
}

// If the page stays open across midnight, today's date silently changes underneath it.
// The next-panel/focus-card already recompute "today" fresh every second, so they stay correct,
// but the day tabs / day view / week-load chart / arc dots only redraw on user interaction —
// so without this check they'd keep showing the OLD day until someone taps something.
function checkDayRollover(){
  const nowToday = todayKey();
  if(nowToday === lastKnownToday) return;
  if(activeDay === lastKnownToday){ activeDay = nowToday; } // was following "today" -> keep following
  lastKnownToday = nowToday;
  renderArcStops(); renderDayTabs(); renderDayView(); renderWeekLoad(); renderInsights();
  renderHomeGreet(); renderKPIRow(); renderTodayGoal(); renderTodayList(); renderDueReminder(); renderAbsenceRiskBox(); updateNotifCenterBadge();
  if(document.getElementById('weekView').style.display !== 'none'){ renderWeekTable(); }
}

function selectDay(d){
  activeDay=d;
  renderDayTabs(); renderDayView(); renderWeekLoad();
}
function renderDayTabs(){
  const wrap=document.getElementById('dayTabs'); wrap.innerHTML='';
  const today=todayKey();
  DAYS.forEach(d=>{
    const btn=document.createElement('button');
    btn.className='day-tab'+(d===activeDay?' active':'')+(d===today?' is-today':'');
    btn.textContent=DAY_BN[d];
    btn.onclick=()=>selectDay(d);
    wrap.appendChild(btn);
  });
}

/* ---- Whole-day / per-slot off toggles (for the currently resolved date of activeDay) ---- */
/* ---- Makeup-class tracker: pending list of {id, date, slotNum, slotLabel, name} ---- */
function getMakeupsAll(){ const l=lsGet('tr_makeups', []); return Array.isArray(l)?l:[]; }
function getMakeups(){ return getMakeupsAll().filter(m=>!m.doneAt); }             // শুধু বাকি থাকাগুলো
function getMakeupHistory(){ return getMakeupsAll().filter(m=>m.doneAt); }       // V74: হয়ে যাওয়াগুলোর ইতিহাস মোছা হয় না
function addMakeup(date, slotNum, name){
  const slot = SCHEDULE.find(s=>s.num===slotNum);
  const list = getMakeupsAll();
  list.push({id: Date.now()+'_'+Math.random().toString(36).slice(2,7), date: dateKeyStr(date), slotNum, slotLabel: slot?slot.label:'', name});
  lsSet('tr_makeups', list);
}
function resolveMakeup(id){
  const all=getMakeupsAll(); const m=all.find(x=>x.id===id); if(m) m.doneAt=Date.now();
  lsSet('tr_makeups', all);
  renderInsights();
}

function onToggleDayOff(day){
  toggleDayOff(resolvedDateForDay(day));
  renderDayView(); renderNextPanel(); renderFocusCard(); renderInsights(); renderWeekLoad();
}
function onToggleSlotOff(slotNum){
  const date = resolvedDateForDay(activeDay);
  const wasOff = isOffOn(date, slotNum) || isDayFullyOff(date);
  toggleSlotOff(date, slotNum);
  const isOffNow = isOffOn(date, slotNum) || isDayFullyOff(date);
  if(!wasOff && isOffNow){
    const slot = SCHEDULE.find(s=>s.num===slotNum);
    const name = getCellText(slot, activeDay).trim();
    if(name && confirm(`"${name}"-এর এই ক্লাসটা কি পরে পুষিয়ে দিতে হবে? (মনে রাখব, পরে তালিকায় দেখাব)`)){
      addMakeup(date, slotNum, name);
    }
  }
  renderDayView(); renderNextPanel(); renderFocusCard(); renderInsights();
}
function undoMove(fromSlotNum){
  cancelMove(resolvedDateForDay(activeDay), fromSlotNum);
  renderDayView(); renderNextPanel(); renderFocusCard(); renderInsights();
}

function renderDayView(){
  const wrap=document.getElementById('dayView'); wrap.innerHTML='';
  const status=computeStatus();
  const resolvedDate = resolvedDateForDay(activeDay);
  const dayIsOff = isDayFullyOff(resolvedDate);

  const header=document.createElement('div');
  header.className='day-view-header';
  header.innerHTML = `<span class="dvh-date">${bnDateLabel(resolvedDate)}${resolvedDate.getTime()===todayDateOnly().getTime()?' · আজ':''}</span>
    <button class="dvh-toggle${dayIsOff?' is-off':''}" onclick="onToggleDayOff('${activeDay}')">${dayIsOff?'↩️ ছুটি বাতিল':'🗓️ পুরো দিন ছুটি করো'}</button>`;
  wrap.appendChild(header);

  SCHEDULE.forEach(slot=>{
    const baseVal = getCellText(slot, activeDay).trim();
    const movedFrom = getMoveFrom(resolvedDate, slot.num);
    const movedInto = getMoveInto(resolvedDate, slot.num);
    const cancelled = !!baseVal && !movedFrom && (dayIsOff || isOffOn(resolvedDate, slot.num));
    const isActivity = !baseVal && !!slot.activity;
    const isLive = status.mode==='live' && status.day===activeDay && status.slot===slot;

    const card=document.createElement('div');
    card.className='slot-card'
      +(baseVal||movedInto?'':(isActivity?' activity-slot':' empty-slot'))
      +(isLive?' is-live':'')
      +(cancelled||movedFrom?' off-slot':'');
    card.style.borderLeftColor = isActivity ? 'var(--paid)' : `var(--${slot.period})`;

    let nameHtml;
    let nameClickable = false;
    if(movedFrom){
      const toSlot=SCHEDULE.find(s=>s.num===movedFrom.toSlotNum);
      nameHtml = `<s>${escapeHtml(baseVal)}</s> <span class="off-badge move-badge"><span class="ic">${ICN.swap}</span> ${toSlot?toSlot.label:''}-এ সরানো হয়েছে</span>`;
    } else if(cancelled){
      nameHtml = `<s>${escapeHtml(baseVal)}</s> <span class="off-badge">ছুটি</span>`;
    } else if(baseVal){
      nameHtml = escapeHtml(baseVal)+` <span class="edit-hint">${ICN.pencil}</span>`;
      nameClickable = true;
    } else if(isActivity){
      nameHtml = `${slot.activityIcon} ${slot.activityLabel}`;
    } else if(movedInto){
      nameHtml = '';
    } else {
      nameHtml = '+ নাম যোগ করো';
      nameClickable = true;
    }

    const noteObj = baseVal ? getNoteStructured(resolvedDate, slot.num) : {taught:'',homework:'',nextPlan:''};
    const hasNote = !!(noteObj.taught || noteObj.homework || noteObj.nextPlan);
    const attNames = baseVal ? baseVal.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const attMarked = attNames.filter(n=>getAttendance(resolvedDate, slot.num, n));

    let tools='';
    if(movedFrom){
      tools = `<div class="slot-tools"><button class="tool-btn is-off" onclick="undoMove('${slot.num}')" title="ফিরিয়ে আনো">${ICN.undo}</button></div>`;
    } else if(baseVal){
      tools = `<div class="slot-tools">
          <button class="tool-btn${hasNote||attMarked.length?' has-note':''}" onclick="openNoteModal('${slot.num}')" title="নোট ও উপস্থিতি">${ICN.note}</button>
          <button class="tool-btn" onclick="openMoveModal('${slot.num}')" ${cancelled||dayIsOff?'disabled':''} title="অন্য সময়ে নাও">${ICN.swap}</button>
          <button class="tool-btn${cancelled?' is-off':''}" onclick="onToggleSlotOff('${slot.num}')" ${dayIsOff?'disabled':''} title="ছুটি/বাতিল">${cancelled?ICN.undo:ICN.ban}</button>
        </div>`;
    }

    const guestHtml = movedInto ? `<div class="slot-guest"><span class="ic">${ICN.swap}</span> <b>${escapeHtml(movedInto.name)}</b> আজ এখানে <button class="guest-x" onclick="undoMove('${movedInto.fromSlotNum}')" title="বাতিল">✕</button></div>` : '';
    const previewBits=[];
    if(attMarked.length) previewBits.push(attMarked.map(n=>ATT_STATUS[getAttendance(resolvedDate,slot.num,n)].icon).join(''));
    if(noteObj.taught) previewBits.push(`<span class="ic">${ICN.note}</span> `+escapeHtml(noteObj.taught));
    else if(noteObj.homework) previewBits.push(`<span class="ic">${ICN.flag}</span> `+escapeHtml(noteObj.homework));

    card.innerHTML = `
      <div class="slot-time">${slot.label}</div>
      <div class="slot-names ${baseVal?'':(isActivity?'is-activity':'is-empty')}${nameClickable?' tappable-name':''}"${nameClickable?` onclick="openRenameModal('${slot.num}')"`:''}>${nameHtml}</div>
      <div class="period-pill">${PERIOD_LABEL[slot.period]}</div>
      ${tools}
      ${guestHtml}
      ${previewBits.length?`<div class="slot-note-preview">${previewBits.join(' · ')}</div>`:''}`;
    wrap.appendChild(card);
  });
}


function setNumMode(m){ if(!['mixed','en','bn'].includes(m)||m===_numMode) return; lsSet('tr_numMode',m); try{ showSuccessToast('সংখ্যার ধরন বদলানো হচ্ছে…'); }catch(e){} setTimeout(()=>location.reload(),350); }
