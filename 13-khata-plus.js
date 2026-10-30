/* ============ খাতা প্লাস (TallyKhata ভিডিও থেকে): নোট ও করণীয় চেকলিস্ট + গ্রাহক তালিকার ফিল্টার/সাজানো ============ */

/* ---------- নোট ও করণীয় (TallyKhata-র "ব্যবসার নোট"-এর মতো): যোগ · এডিট · টিক দিলে কাটা দাগ · মোছা ---------- */
const KH_NOTES_KEY='tr_khataNotes';
function getKhNotes(){ const v=lsGet(KH_NOTES_KEY,[]); return Array.isArray(v)?v:[]; }
function setKhNotes(a){ lsSet(KH_NOTES_KEY,a); }
/* pure (unit-tested): বাকি কাজ আগে (তারিখ ধরে, তারিখ নেই এমন নতুনগুলো শেষে), শেষ হওয়াগুলো নিচে */
function khNotesSorted(list){
  const arr=Array.isArray(list)?list:[];
  const pend=arr.filter(n=>!n.done).sort((a,b)=>{ const x=a.due||'9999-99-99', y=b.due||'9999-99-99'; return x<y?-1:(x>y?1:((b.at||0)-(a.at||0))); });
  const done=arr.filter(n=>n.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  return pend.concat(done);
}
function khNotesPending(){ return getKhNotes().filter(n=>!n.done).length; }
let khNoteEditId=null;
function khNotesBody(){
  const list=khNotesSorted(getKhNotes()), T=dateKeyStr(todayDateOnly()), pend=list.filter(n=>!n.done).length, done=list.length-pend;
  const row=n=>{
    const ed=khNoteEditId===n.id, late=!n.done&&n.due&&n.due<T, soon=!n.done&&n.due===T;
    const badge=n.due?`<small class="kn-due${late?' late':(soon?' soon':'')}">${late?'⏰ মেয়াদ পেরিয়েছে · ':(soon?'আজ · ':'')}${enDateLabel(new Date(n.due+'T00:00:00'))}</small>`:'';
    return `<div class="kn-row${n.done?' done':''}"><button type="button" class="kn-chk" aria-label="${n.done?'আবার বাকি করো':'শেষ হয়েছে'}" onclick="khNoteToggle('${n.id}')">${n.done?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2 8.8-9.2"/></svg>':''}</button>`
      +(ed?`<div class="kn-txt"><input class="kh-in kn-edit" id="kn_edit" value="${escapeHtml(n.text)}" maxlength="200" onkeydown="if(event.key==='Enter'){event.preventDefault();khNoteEditSave('${n.id}');}else if(event.key==='Escape'){khNoteEditCancel();}"><div class="kn-edit-btns"><button type="button" class="pct-chip" onclick="khNoteEditCancel()">বাতিল</button><button type="button" class="pct-chip active" onclick="khNoteEditSave('${n.id}')">সেভ</button></div></div>`
        :`<div class="kn-txt" onclick="khNoteEditStart('${n.id}')">${escapeHtml(n.text)}${badge}</div><button type="button" class="kh-edit" aria-label="এডিট" onclick="khNoteEditStart('${n.id}')">${ico('edit')}</button><button type="button" class="prog-del-chapter" aria-label="মুছে ফেলো" onclick="khNoteDel('${n.id}')">✕</button>`)
      +`</div>`;
  };
  return `<div class="kn-add"><input class="kh-in" id="kn_text" placeholder="নতুন নোট বা করণীয় লেখো…" autocomplete="off" maxlength="200" onkeydown="if(event.key==='Enter'){event.preventDefault();khNoteAdd();}">
      <div class="kn-add2"><input class="kh-in" id="kn_due" type="date" aria-label="কবের মধ্যে (ঐচ্ছিক)"><button type="button" class="kh-fab" onclick="khNoteAdd()">＋ যোগ করো</button></div></div>
    ${list.length?`<div class="kn-count"><span>${enNum(pend)} টি বাকি · ${enNum(done)} টি শেষ</span>${done?`<button type="button" onclick="khNotesClearDone()">শেষগুলো মুছো</button>`:''}</div><div class="kn-list">${list.map(row).join('')}</div>`
      :emptyState({icon:'note',title:'কোনো নোট নেই',body:'টাকা-পয়সার কাজ মনে রাখতে এখানে লিখে রাখো — যেমন "রাকিবের কাছ থেকে শুক্রবার টাকা নেব"। কাজ শেষ হলে টিক দিলেই কাটা দাগ পড়বে।'})}`;
}
function khNotesRefresh(){ const b=document.getElementById('khNotesBox'); const body=document.getElementById('khataModalBody'); if(!body) return; if(b||body.querySelector('.kn-add')) body.innerHTML='<div id="khNotesBox">'+khNotesBody()+'</div>'; try{ renderKhataTab(); }catch(e){} }
function khNotesPage(){ khNoteEditId=null; showKhataModal('📝 নোট ও করণীয়','<div id="khNotesBox">'+khNotesBody()+'</div>'); }
function khNoteAdd(){
  const t=document.getElementById('kn_text'), d=document.getElementById('kn_due'); const text=((t&&t.value)||'').trim();
  if(!text){ showWarningToast('আগে কিছু লেখো।'); if(t) t.focus(); return; }
  const list=getKhNotes(); list.push({id:Date.now()+'_'+Math.random().toString(36).slice(2,6), text:text.slice(0,200), done:false, due:(d&&d.value)||'', at:Date.now()}); setKhNotes(list);
  khNotesRefresh(); try{ navigator.vibrate&&navigator.vibrate(8); }catch(e){}
}
function khNoteToggle(id){
  const list=getKhNotes(), n=list.find(x=>x.id===id); if(!n) return; n.done=!n.done; n.doneAt=n.done?Date.now():0; setKhNotes(list);
  try{ navigator.vibrate&&navigator.vibrate(10); }catch(e){} khNotesRefresh();
}
function khNoteEditStart(id){ khNoteEditId=id; khNotesRefresh(); setTimeout(()=>{ const i=document.getElementById('kn_edit'); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length,i.value.length); }catch(e){} } },30); }
function khNoteEditCancel(){ khNoteEditId=null; khNotesRefresh(); }
function khNoteEditSave(id){
  const i=document.getElementById('kn_edit'), text=((i&&i.value)||'').trim(); if(!text){ showWarningToast('লেখা খালি রাখা যাবে না।'); return; }
  const list=getKhNotes(), n=list.find(x=>x.id===id); if(n){ n.text=text.slice(0,200); setKhNotes(list); }
  khNoteEditId=null; khNotesRefresh(); showSuccessToast('নোট আপডেট হয়েছে');
}
function khNoteDel(id){
  const before=JSON.stringify(getKhNotes()); setKhNotes(getKhNotes().filter(n=>n.id!==id)); khNotesRefresh();
  showUndoToast('নোট মুছে ফেলা হয়েছে',()=>{ setKhNotes(JSON.parse(before)); khNotesRefresh(); });
}
function khNotesClearDone(){
  const before=JSON.stringify(getKhNotes()); setKhNotes(getKhNotes().filter(n=>!n.done)); khNotesRefresh();
  showUndoToast('শেষ হওয়া নোটগুলো মুছে ফেলা হয়েছে',()=>{ setKhNotes(JSON.parse(before)); khNotesRefresh(); });
}

/* ---------- ফিল্টার ও সাজানো (গ্রাহক তালিকা): কাস্টমার/সাপ্লায়ার · পরিমাণ · সর্বশেষ লেনদেন ---------- */
let khFiltState={cust:true, supp:true, sort:'default'}, khFiltDraft='default';
function khFiltOpts(){ return {kinds:{customer:khFiltState.cust, supplier:khFiltState.supp}, sort:khFiltState.sort}; }
function khFiltActive(){ return !khFiltState.cust || !khFiltState.supp || khFiltState.sort!=='default'; }
function khFilterModal(){
  const s=khFiltState; khFiltDraft=s.sort;
  const opt=(v,l)=>`<button type="button" class="kf-opt${khFiltDraft===v?' on':''}" data-v="${v}" onclick="khFiltPick('${v}')"><i></i>${l}</button>`;
  showKhataModal('ফিল্টার', `<div class="kf-sec">কাদের দেখাবে</div>
    <label class="kf-chk"><input type="checkbox" id="kf_c" ${s.cust?'checked':''}><span>কাস্টমার</span></label>
    <label class="kf-chk"><input type="checkbox" id="kf_s" ${s.supp?'checked':''}><span>সাপ্লায়ার</span></label>
    <div class="kf-sec">দেবো / পাবো পরিমাণ</div><div class="kf-grid">${opt('amt_asc','কম → বেশি')}${opt('amt_desc','বেশি → কম')}</div>
    <div class="kf-sec">সর্বশেষ লেনদেন</div><div class="kf-grid">${opt('last_new','নতুন → পুরাতন')}${opt('last_old','পুরাতন → নতুন')}</div>
    <button class="kh-fab" style="margin-top:18px;" onclick="khFiltApply()">নিশ্চিত</button>
    <button type="button" class="settings-btn" onclick="khFiltReset()">সব ফিল্টার সরাও</button>`);
}
function khFiltPick(v){ khFiltDraft=(khFiltDraft===v)?'default':v; document.querySelectorAll('.kf-opt').forEach(b=>b.classList.toggle('on',b.dataset.v===khFiltDraft)); }
function khFiltApply(){
  const c=document.getElementById('kf_c').checked, s=document.getElementById('kf_s').checked;
  if(!c && !s){ showWarningToast('কাস্টমার বা সাপ্লায়ার — অন্তত একটা বেছে নাও।'); return; }
  khFiltState={cust:c, supp:s, sort:khFiltDraft}; closeKhataModal(); renderKhataTab();
}
function khFiltReset(stay){ khFiltState={cust:true, supp:true, sort:'default'}; khFiltDraft='default'; if(!stay) closeKhataModal(); renderKhataTab(); }
