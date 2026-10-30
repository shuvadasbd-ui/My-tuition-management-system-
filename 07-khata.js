/* ============ খাতা: বাকি-পাওনা (who owes whom) + personal daily income/expense. Stored apart from the tuition data, */
/* so starting a new tuition session never touches it. tr_khata = person transactions, tr_daily = income/expense. ============ */
const KH_TYPES = {
  gave:     {label:'ধার দিলাম',     sign:+1},   // they now owe me more
  got_back: {label:'ফেরত পেলাম',    sign:-1},
  took:     {label:'ধার নিলাম',     sign:-1},   // I now owe them more
  paid_back:{label:'ফেরত দিলাম',    sign:+1},
};
const DAILY_OUT_CATS = ['খাবার','বাজার','যাতায়াত','মোবাইল/নেট','বিনোদন','স্বাস্থ্য','পরিবার','অন্যান্য'];
const DAILY_IN_CATS = ['টিউশন ছাড়া আয়','উপহার','অন্যান্য'];
function getKhata(){ return lsGet('tr_khata', []); }
function getDaily(){ return lsGet('tr_daily', []); }
function khataBalances(list){          // net per person: + means they owe me, - means I owe them
  const b={};
  (list||[]).forEach(t=>{ const k=KH_TYPES[t.type]; if(!k) return; b[t.person]=(b[t.person]||0)+k.sign*t.amount; });
  return b;
}
function khataTotals(list){
  const b=khataBalances(list); let get=0, owe=0;
  Object.values(b).forEach(v=>{ if(v>0) get+=v; else if(v<0) owe+=-v; });
  return {get, owe};
}
function dailySummary(list, mk){
  const rows=(list||[]).filter(e=>(e.date||'').startsWith(mk)); let inc=0, out=0; const cats={};
  rows.forEach(e=>{ if(e.kind==='in') inc+=e.amount; else { out+=e.amount; cats[e.cat]=(cats[e.cat]||0)+e.amount; } });
  return {rows, inc, out, left:inc-out, cats};
}
function addKhataTx(person, type, amount, note, date){
  person=(person||'').trim(); amount=Math.round(parseFloat(amount)||0);
  if(!person || !KH_TYPES[type] || !(amount>0)) return null;
  const list=getKhata(); const t={id:Date.now()+'_'+Math.random().toString(36).slice(2,6), person, type, amount, note:(note||'').trim(), date:date||dateKeyStr(todayDateOnly())};
  list.push(t); lsSet('tr_khata', list); return t;
}
function addDailyEntry(kind, amount, cat, note, date){
  amount=Math.round(parseFloat(amount)||0); if(!(amount>0)) return null;
  const list=getDaily(); const e={id:Date.now()+'_'+Math.random().toString(36).slice(2,6), kind:kind==='in'?'in':'out', amount, cat:cat||'অন্যান্য', note:(note||'').trim(), date:date||dateKeyStr(todayDateOnly())};
  list.push(e); lsSet('tr_daily', list); return e;
}
let khataSeg='debt', khataMk=null;

/* ============ KHATA PIN LOCK (auto-locks when you leave the tab or the app goes to the background) ============ */
let khataUnlocked=false;
async function khHash(pin, salt){
  const data=new TextEncoder().encode(salt+':'+pin);
  if(window.crypto && crypto.subtle){ try{ const b=await crypto.subtle.digest('SHA-256',data); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(e){} }
  let h=5381; for(const c of salt+':'+pin) h=((h<<5)+h+c.charCodeAt(0))|0; return 'x'+h;   // fallback for non-https (file://)
}
function khataLocked(){ return (!!lsGet('tr_khataPin',null) || (typeof bioWants==='function' && bioWants('khata'))) && !khataUnlocked; }
function renderKhataLock(){
  const hasPin=!!lsGet('tr_khataPin',null), bio=(typeof bioWants==='function')&&bioWants('khata');
  return `<div class="kh-lock"><div style="font-size:42px">🔒</div><div class="kh-lock-t">খাতা লক করা আছে</div>
    ${bio?`<button class="kh-fab" onclick="khBioUnlock()">👆 আঙুলের ছাপে খোলো</button>`:''}
    ${hasPin?`<input class="kh-in" id="kh_unlock_pin" type="password" inputmode="numeric" maxlength="8" placeholder="${bio?'অথবা পিন লেখো':'পিন লেখো'}" onkeydown="if(event.key==='Enter')khUnlock()" autocomplete="off">
    <button class="kh-fab" onclick="khUnlock()">🔓 খোলো</button>`:''}</div>`;
}
async function khUnlock(){
  const cfg=lsGet('tr_khataPin',null), el=document.getElementById('kh_unlock_pin'); if(!cfg||!el) return;
  if(await khHash(bnDigitsToLatin(el.value.trim()), cfg.s)===cfg.h){ khataUnlocked=true; renderKhataTab(); }
  else { showWarningToast('পিন মেলেনি।'); el.value=''; el.focus(); }
}
function khataPinMenu(){
  const has=!!lsGet('tr_khataPin',null);
  showKhataModal(has?'পিন বদলাও / বন্ধ করো':'খাতার পিন সেট করো', `${has?'<input class="kh-in" id="kh_pin_old" type="password" inputmode="numeric" maxlength="8" placeholder="বর্তমান পিন">':''}
    <input class="kh-in" id="kh_pin_new" type="password" inputmode="numeric" maxlength="8" placeholder="${has?'নতুন পিন (বন্ধ করতে ফাঁকা রাখো)':'4-8 সংখ্যার পিন'}">
    <div style="font-size:11px;color:var(--muted);margin-top:6px;">ট্যাব ছাড়লে বা অ্যাপ ব্যাকগ্রাউন্ডে গেলে খাতা নিজে লক হবে। পিন ভুলে গেলে খাতা খোলা যাবে না — ব্যাকআপ আলাদা রেখো।</div>
    <button class="kh-fab" style="margin-top:12px;" onclick="khSavePin()">সেভ করো</button>`);
}
async function khSavePin(){
  const cfg=lsGet('tr_khataPin',null), oldEl=document.getElementById('kh_pin_old'), nw=bnDigitsToLatin((document.getElementById('kh_pin_new').value||'').trim());
  if(cfg && (!oldEl || await khHash(bnDigitsToLatin(oldEl.value.trim()),cfg.s)!==cfg.h)){ showWarningToast('বর্তমান পিন মেলেনি।'); return; }
  if(!nw){ if(cfg){ localStorage.removeItem('tr_khataPin'); closeKhataModal(); renderKhataTab(); showSuccessToast('পিন বন্ধ হয়েছে'); } return; }
  if(!/^\d{4,8}$/.test(nw)){ showWarningToast('পিন 4 থেকে 8টা সংখ্যা হতে হবে।'); return; }
  const s=Math.random().toString(36).slice(2,10); lsSet('tr_khataPin',{s,h:await khHash(nw,s)}); khataUnlocked=true;
  closeKhataModal(); renderKhataTab(); showSuccessToast('পিন সেট হয়েছে');
}
document.addEventListener('visibilitychange',()=>{ if(document.hidden && khataUnlocked){ khataUnlocked=false; const p=document.getElementById('pageKhata'); if(p && p.style.display!=='none') renderKhataTab(); } });

function renderKhataTab(){
  const el=document.getElementById('khataBody'); if(!el) return;
  if(!khataMk) khataMk=currentMonthKey();
  try{ if(typeof khRecurApply==='function') khRecurApply(); }catch(e){}
  const seg=`<div class="kh-seg"><button class="${khataSeg==='debt'?'on':''}" onclick="setKhataSeg('debt')">বাকি-পাওনা</button><button class="${khataSeg==='daily'?'on':''}" onclick="setKhataSeg('daily')">ক্যাশবক্স</button></div>`;
  if(khataLocked()){ el.innerHTML=renderKhataLock(); return; }
  const pinBtn=`<button type="button" class="kh-pin-chip" onclick="khataPinMenu()">${lsGet('tr_khataPin',null)?'🔒 পিন চালু':'🔓 পিন দিয়ে লক করো'}</button>`;
  el.innerHTML = seg + (khataSeg==='debt' ? renderKhataDebt() : renderKhataDaily()) + `<div style="text-align:center;margin:16px 0 4px;">${pinBtn}</div>`;
}
function setKhataSeg(v){ khataSeg=v; renderKhataTab(); }
/* pure helper (unit-tested): one row per person with a non-zero balance, filtered + sorted */
function khataDebtRows(list, people, filter, query, todayStr, opts){
  const bal=khataBalances(list), last={};
  (list||[]).forEach(t=>{ if(!last[t.person] || t.date>last[t.person]) last[t.person]=t.date; });
  const q=(query||'').trim().toLowerCase(), now=new Date(todayStr+'T00:00:00').getTime();
  const kinds=(opts&&opts.kinds)||null, sortBy=(opts&&opts.sort)||'default';   // opts: {kinds:{customer:bool,supplier:bool}, sort:'default'|'amt_asc'|'amt_desc'|'last_new'|'last_old'}
  const rowsRaw=Object.entries(bal).filter(([,v])=>v!==0);
  Object.keys(people||{}).forEach(n=>{ if(people[n] && people[n].added && !rowsRaw.some(r=>r[0]===n)) rowsRaw.push([n,0]); });   // people added by hand show up even before any transaction
  const kindOf=r=>((people&&people[r.name])||{}).kind==='supplier'?'supplier':'customer';
  const cmpLast=(a,b,dir)=>{ if(!a.last&&!b.last) return 0; if(!a.last) return 1; if(!b.last) return -1; return dir*(a.last<b.last?-1:(a.last>b.last?1:0)); };   // no-transaction rows always sink to the bottom
  const sorters={
    'default':(a,b)=>(b.overdue-a.overdue)||(Math.abs(b.net)-Math.abs(a.net)),
    'amt_asc':(a,b)=>Math.abs(a.net)-Math.abs(b.net),
    'amt_desc':(a,b)=>Math.abs(b.net)-Math.abs(a.net),
    'last_new':(a,b)=>cmpLast(a,b,-1),
    'last_old':(a,b)=>cmpLast(a,b,1)
  };
  return rowsRaw.map(([name,net])=>{
    const p=(people&&people[name])||{}, due=p.due||'';
    return {name, net, phone:p.phone||'', due, overdue: !!due && net>0 && due<todayStr, last:last[name]||'',
            days: last[name]?Math.max(0,Math.floor((now-new Date(last[name]+'T00:00:00').getTime())/86400000)):null};
  }).filter(r=>filter==='get'?r.net>0:filter==='owe'?r.net<0:filter==='overdue'?r.overdue:true)
    .filter(r=>!q || r.name.toLowerCase().includes(q) || r.phone.includes(q))
    .filter(r=>!kinds || kinds[kindOf(r)]!==false)
    .sort(sorters[sortBy]||sorters['default']);
}
let khFilter='all';
function setKhFilter(f){ khFilter=f; renderKhataTab(); }
function khSearch(v){ const q=(v||'').trim().toLowerCase(); document.querySelectorAll('#khList .kh-row').forEach(r=>{ r.style.display=(!q||r.dataset.q.includes(q))?'':'none'; }); }
function renderKhataDebt(){
  const list=getKhata(), tot=khataTotals(list), people=getLs('tr_khataPeople'), T=dateKeyStr(todayDateOnly());
  const all=khataDebtRows(list,people,'all','',T), overdueN=all.filter(r=>r.overdue).length;
  const rows=khataDebtRows(list,people,khFilter,'',T,khFiltOpts()), kzm=kzTrustMap(list,people,T,rows);
  const chip=(k,l)=>`<button type="button" class="pct-chip${khFilter===k?' on':''}" onclick="setKhFilter('${k}')">${l}</button>`;
  return `<div class="kh-sum"><div class="kh-card get"><small>আমি পাব</small><b>${enTaka(tot.get)}</b></div><div class="kh-card owe"><small>আমি দেব</small><b>${enTaka(tot.owe)}</b></div></div>
    ${kzBannerHtml(list,people,T,all)}
    ${overdueN?`<div class="kh-overdue" onclick="setKhFilter('overdue')">⏰ ${enNum(overdueN)} জনের তাগাদার তারিখ পেরিয়ে গেছে — দেখো</div>`:''}
    <div class="kq">${[['chat','গ্রুপ তাগাদা','khataGroupRemind()'],['note','নোট','khNotesPage()',khNotesPending()],['wallet','ক্যাশবক্স',"setKhataSeg('daily')"],['file','হিসাব','khataDayReport()'],['search','খোঁজো','khSearchModal()'],['chart','রিপোর্ট',"switchTab('reports')"],['cloud','ব্যাকআপ','exportBackup()'],['tools','টুলস','khToolsMenu()']].map(([i,l,c,n])=>`<button type="button" onclick="${c}"><span>${ico(i)}${n?`<em class="kq-badge">${enNum(n)}</em>`:''}</span>${l}</button>`).join('')}</div>
    <button class="kh-fab" onclick="openKhataTx('', 'gave')">➕ নতুন লেনদেন</button>
    <div class="kh-count">কাস্টমার ${enNum(all.filter(r=>(people[r.name]||{}).kind!=='supplier').length)} / সাপ্লায়ার ${enNum(all.filter(r=>(people[r.name]||{}).kind==='supplier').length)}</div>
    <button type="button" class="kh-addfab" aria-label="নতুন কাস্টমার" onclick="openKhataPersonAdd()"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="3.6"/><path d="M3.5 20c.6-3.6 3.2-5.4 6.5-5.4s5.9 1.8 6.5 5.4M19 7v6M16 10h6"/></svg></button>
    ${all.length?`<div class="kh-sbar"><input class="kh-in kh-search" type="search" placeholder="🔍 নাম বা ফোন দিয়ে খোঁজো" oninput="khSearch(this.value)"><button type="button" class="kh-ib${khFiltActive()?' on':''}" aria-label="ফিল্টার ও সাজানো" onclick="khFilterModal()">${ico('filter')}</button><button type="button" class="kh-ib" aria-label="সব কাস্টমারের PDF ডাউনলোড" onclick="khAllCustomersPdf()">${ico('download')}</button></div>`:''}
    ${all.length?`<div class="pct-chip-row" style="margin:8px 0;">${chip('all','সব')}${chip('get','পাবো')}${chip('owe','দেবো')}${chip('overdue','⏰ মেয়াদ পেরিয়েছে')}</div>`:''}
    ${khFiltActive()?`<div class="kf-note"><span>ফিল্টার চালু আছে</span><button type="button" onclick="khFiltReset(true)">সাফ করো</button></div>`:''}
    <div id="khList">${rows.length ? rows.map(r=>`<div class="kh-row" data-q="${escapeHtml((r.name+' '+r.phone).toLowerCase())}" onclick="openKhataPerson('${jsq(r.name)}')">
      <div class="kh-av" style="background:${avatarColor(r.name)}22;color:${avatarColor(r.name)};">${escapeHtml(r.name.trim()[0]||'?')}</div>
      <div class="kh-name">${escapeHtml(r.name)}<small>${r.net>0?'আমাকে দেবে':(r.net<0?'আমি দেব':'কোনো বাকি নেই')}${r.phone?' · '+escapeHtml(r.phone):''}${r.days!==null?` · শেষ লেনদেন ${r.days===0?'আজ':enNum(r.days)+' দিন আগে'}`:''}</small>${kzPill(kzm[r.name])}${r.overdue?'<span class="kh-badge due">⏰ তাগাদার তারিখ পেরিয়েছে</span>':(r.due&&r.net>0?`<span class="kh-badge">তাগাদা: ${enDateLabel(new Date(r.due+'T00:00:00'))}</span>`:'')}</div>
      <div class="kh-amt ${r.net>0?'get':(r.net<0?'owe':'')}">${enTaka(Math.abs(r.net))}</div></div>`).join('') : (all.length?emptyState({icon:'search',title:'এই ফিল্টারে কেউ নেই',label:'সব দেখাও',onclick:"setKhFilter('all')"}):emptyState({icon:'book',title:'খাতা এখনো ফাঁকা',body:'কাউকে ধার দিলে বা কারো কাছ থেকে নিলে এখানে লিখে রাখো। হোমের বারে লিখলেও হয়: <b>রাকিব 500 ধার দিলাম</b>',label:'প্রথম লেনদেন যোগ করো',onclick:"openKhataTx('', 'gave')"}))}</div>`;
}

/* ============ TALLYKHATA-STYLE EXTRAS: SMS/WhatsApp messages, statement, due date ============ */
function openSms(phone, text){
  const num=String(phone||'').replace(/[^0-9+]/g,''), sep=/iPhone|iPad|iPod/.test(navigator.userAgent)?'&':'?';
  window.location.href=`sms:${num}${sep}body=${encodeURIComponent(text)}`;
}
function khataBalLine(net){ return net>0?`মোট বাকি ${enTaka(net)}`:(net<0?`আপনার পাওনা ${enTaka(-net)}`:'হিসাব মিটে গেছে'); }
function khataLastTxMsg(name){
  const list=getKhata().filter(t=>t.person===name); if(!list.length) return '';
  const last=list.slice().sort((a,b)=>a.date.localeCompare(b.date)).pop(), net=khataBalances(list)[name]||0, who=getTeacherName(false);
  const day=last.date===dateKeyStr(todayDateOnly())?'আজকের':enDateLabel(new Date(last.date+'T00:00:00'));
  return `${name}, ${day} লেনদেন: ${KH_TYPES[last.type].label} ${enTaka(last.amount)}। ${khataBalLine(net)}।${who?`\n— ${who}`:''}`;
}
function khataStatementText(name){
  const list=getKhata().filter(t=>t.person===name).sort((a,b)=>a.date.localeCompare(b.date)), who=getTeacherName(false); let run=0;
  const rows=list.map(t=>{ run+=KH_TYPES[t.type].sign*t.amount; return `${enDateLabel(new Date(t.date+'T00:00:00'))} — ${KH_TYPES[t.type].label} ${enTaka(t.amount)}${t.note?` (${t.note})`:''} → ${run>0?'বাকি ':(run<0?'পাওনা ':'')}${enTaka(Math.abs(run))}`; });
  return `📒 হিসাবের বিবরণী — ${name}\nতারিখ: ${enDateLabel(todayDateOnly())}\n\n${rows.join('\n')}\n\n${khataBalLine(run)}${who?`\n— ${who}`:''}`;
}
function khataMsgSend(name, via){
  const text=khataLastTxMsg(name); if(!text){ showWarningToast('এখনো কোনো লেনদেন নেই।'); return; }
  const ph=(getLs('tr_khataPeople')[name]||{}).phone||'';
  if(!ph) showWarningToast('ফোন নম্বর সেভ করা নেই — নিজে কন্ট্যাক্ট বেছে নাও।');
  via==='sms'?openSms(ph,text):openWhatsApp(ph,text);
}
function khataRemindSms(name){
  const net=khataBalances(getKhata())[name]||0; if(net<=0) return;
  const ph=(getLs('tr_khataPeople')[name]||{}).phone||'', who=getTeacherName(false);
  openSms(ph, `আসসালামু আলাইকুম, ${name}। আপনার কাছে আমার ${enTaka(net)} পাওনা আছে। সুবিধামতো সময়ে দিয়ে দিলে ভালো হতো। ধন্যবাদ।${who?` — ${who}`:''}`);
}
function khataShareStatement(name){ copyTextSmart(khataStatementText(name),'বিবরণী কপি হয়েছে — WhatsApp বা এসএমএসে পেস্ট করো'); }
function khataSetDue(name){
  const cur=(getLs('tr_khataPeople')[name]||{}).due||'', v=prompt('কত দিন পরে তাগাদা দেবে? (সংখ্যা লেখো, মুছতে 0)', cur?'':'7');
  if(v===null) return; const n=Math.round(parseFloat(bnDigitsToLatin(v))); if(isNaN(n)||n<0) return;
  const p=getLs('tr_khataPeople'); p[name]=p[name]||{};
  if(n===0) delete p[name].due; else p[name].due=dateKeyStr(addDaysToDate(todayDateOnly(), n));
  lsSet('tr_khataPeople', p); openKhataPerson(name); renderKhataTab();
  showSuccessToast(n===0?'তাগাদার তারিখ মুছে গেছে':`${n} দিন পরে তাগাদার তারিখ ঠিক হয়েছে`);
}

/* ============ PDF STATEMENT (ট্যালিখাতা-style): date + running balance | বিবরণ | দিলাম | পেলাম, opening balance, totals ============ */
/* pure helper (unit-tested). "দিলাম" = money going out from me (gave / paid_back, sign +), "পেলাম" = coming in (got_back / took, sign -) */
function khataStatementRows(list, from, to){
  const all=(list||[]).map((t,i)=>({t,i})).sort((a,b)=>(a.t.date.localeCompare(b.t.date))||(a.i-b.i)).map(x=>x.t);
  let opening=0; const rows=[]; let run=0, totOut=0, totIn=0;
  all.forEach(t=>{
    const s=KH_TYPES[t.type]; if(!s) return; const v=s.sign*t.amount;
    if(from && t.date<from){ opening+=v; return; }
    if(to && t.date>to) return;
    rows.push({date:t.date, note:t.note||'', out:v>0?t.amount:0, in:v<0?t.amount:0, type:t.type});
  });
  run=opening; if(opening>0) totOut+=opening; else if(opening<0) totIn+=-opening;
  rows.forEach(r=>{ run+=r.out-r.in; r.run=run; totOut+=r.out; totIn+=r.in; });
  return {opening, rows, totOut, totIn, balance:totOut-totIn};
}
function khPdfAmt(n){ return enNum(Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})); }
function khPdfDate(ds, comma){ const [y,m,d]=ds.split('-').map(Number); return `${enNum(String(d).padStart(2,'0'))} ${MONTH_NAMES[m-1]}${comma?',':''} ${enNum(y)}`; }
function getTeacherPhone(askIfMissing){
  let p=lsGet('tr_teacherPhone',null);
  if(p===null && askIfMissing){ const v=prompt('রিপোর্টের ওপরে যে মোবাইল নম্বর থাকবে (ঐচ্ছিক, না চাইলে ফাঁকা রাখো):',''); p=(v||'').trim(); lsSet('tr_teacherPhone',p); }
  return p||'';
}
async function khataStatementPages(name, from, to){
  const list=getKhata().filter(t=>t.person===name), d=khataStatementRows(list,from,to);
  const phone=(getLs('tr_khataPeople')[name]||{}).phone||'', me=getTeacherName(false), myPhone=getTeacherPhone(false);
  const first=list.map(t=>t.date).sort()[0]||dateKeyStr(todayDateOnly()), fromS=from||first, toS=to||dateKeyStr(todayDateOnly());
  try{ await Promise.race([Promise.all([document.fonts.load('700 20px "Hind Siliguri"'),document.fonts.load('500 14px "Hind Siliguri"')]), new Promise(r=>setTimeout(r,1200))]); }catch(e){}   // never wait on a slow network for a webfont
  const SC=2, W=794, H=1123, M=32, FF='"Hind Siliguri","Noto Sans Bengali","Kalpurush","Segoe UI",sans-serif';
  const X={date:M, desc:M+170, out:M+420, in:M+575, end:W-M}, RED='#b3202c', GRN='#1f8f5f', INK='#1b1b24', MUT='#8a8a98', LINE='#e6e6ee';
  const pages=[]; let cv, c, y;
  const font=(w,s)=>`${w} ${s}px ${FF}`;
  const T=(s,x,yy,f,col,al)=>{ c.font=f; c.fillStyle=col||INK; c.textAlign=al||'left'; c.textBaseline='alphabetic'; c.fillText(s,x,yy); };
  const rr=(x,yy,w,h,r,fill)=>{ c.beginPath(); c.moveTo(x+r,yy); c.arcTo(x+w,yy,x+w,yy+h,r); c.arcTo(x+w,yy+h,x,yy+h,r); c.arcTo(x,yy+h,x,yy,r); c.arcTo(x,yy,x+w,yy,r); c.closePath(); c.fillStyle=fill; c.fill(); };
  const pill=(txt,x,yy,col)=>{ c.font=font(600,13); const w=c.measureText(txt).width+26; rr(x,yy,w,28,14,'#f0f0f3'); T(txt,x+13,yy+19,font(600,13),col); };
  const balPill=(run,x,yy)=>run>0?pill('পাবো '+khPdfAmt(run),x,yy,RED):(run<0?pill('দেবো '+khPdfAmt(-run),x,yy,GRN):pill('হিসাব মিটে গেছে',x,yy,MUT));
  const wrap=(s,maxW,f)=>{ c.font=f; const out=[]; let line=''; String(s).split(/\s+/).filter(Boolean).forEach(w=>{ const tryL=line?line+' '+w:w; if(c.measureText(tryL).width<=maxW||!line) line=tryL; else { out.push(line); line=w; } }); if(line) out.push(line); return out.slice(0,4); };
  const newPage=(isFirst)=>{
    cv=document.createElement('canvas'); cv.width=W*SC; cv.height=H*SC; c=cv.getContext('2d'); c.scale(SC,SC); c.fillStyle='#fff'; c.fillRect(0,0,W,H);
    c.fillStyle='#fcf0f0'; c.fillRect(0,0,W,104);
    T(me||'আমার খাতা',M,52,font(700,24),RED); if(myPhone) T('মোবাইল নম্বরঃ '+myPhone,M,78,font(600,13.5),INK);
    T('আমার টিউশন রুটিন',W-M,52,font(700,17),RED,'right'); T('হিসাবের বিবরণী',W-M,76,font(500,12.5),MUT,'right');
    y=isFirst?132:128;
    if(isFirst){
      T(name,M,y+14,font(700,24),INK); y+=22; if(phone){ T('(Ph: '+phone+')',M,y+14,font(600,13.5),INK); y+=22; }
      const now=new Date(), hh=now.getHours()%12||12, mm=String(now.getMinutes()).padStart(2,'0');
      T(`রিপোর্ট তৈরি : ${khPdfDate(dateKeyStr(now),true)} - ${enNum(String(hh).padStart(2,'0'))}:${enNum(mm)} ${now.getHours()>=12?'PM':'AM'}`,M,y+16,font(500,14),INK); y+=24;
      T(`রিপোর্ট : ${khPdfDate(fromS)} থেকে ${khPdfDate(toS)} পর্যন্ত`,M,y+16,font(700,14),INK); y+=40;
    }
    c.fillStyle='#f4f5f9'; c.fillRect(M,y,W-2*M,50);
    T('তারিখ',X.date+85,y+31,font(500,14),INK,'center'); T('বিবরণ',X.desc+125,y+31,font(500,14),INK,'center');
    T('দিলাম',X.out+77,y+31,font(500,14),INK,'center'); T('পেলাম',X.in+77,y+31,font(500,14),INK,'center'); y+=50;
    pages.push(c);
  };
  const tint=(yy,h)=>{ c.fillStyle='rgba(179,32,44,0.06)'; c.fillRect(X.out,yy,X.in-X.out,h); c.fillStyle='rgba(31,143,95,0.06)'; c.fillRect(X.in,yy,X.end-X.in,h); };
  const frame=(yy,h)=>{ tint(yy,h); c.strokeStyle=LINE; c.lineWidth=1; c.strokeRect(M+.5,yy+.5,W-2*M-1,h); [X.desc,X.out,X.in].forEach(x=>{ c.beginPath(); c.moveTo(x+.5,yy); c.lineTo(x+.5,yy+h); c.stroke(); }); };
  newPage(true);
  if(d.opening!==0 || !d.rows.length){
    const h=64; frame(y,h); T('পূর্বের ব্যালেন্স',X.date+14,y+38,font(500,14.5),INK);
    if(d.opening>0) T(khPdfAmt(d.opening),X.out+145,y+38,font(500,15),RED,'right'); else if(d.opening<0) T(khPdfAmt(-d.opening),X.in+145,y+38,font(500,15),GRN,'right');
    y+=h;
  }
  d.rows.forEach(r=>{
    c.font=font(500,14); const lines=wrap(r.note, X.out-X.desc-26, font(500,14)), h=Math.max(82, 52+lines.length*21);
    if(y+h>H-64) newPage(false);
    frame(y,h); T(khPdfDate(r.date,true),X.date+14,y+30,font(700,14),INK); balPill(r.run,X.date+14,y+40);
    lines.forEach((ln,i)=>T(ln,X.desc+14,y+34+i*21,font(500,14),INK));
    if(r.out) T(khPdfAmt(r.out),X.out+145,y+36,font(500,15),RED,'right'); if(r.in) T(khPdfAmt(r.in),X.in+145,y+36,font(500,15),GRN,'right');
    y+=h;
  });
  if(y+120>H-64) newPage(false);
  frame(y,58); T('সর্বমোট',X.out-16,y+37,font(600,17),INK,'right'); T(khPdfAmt(d.totOut),X.out+145,y+37,font(700,15.5),RED,'right'); T(khPdfAmt(d.totIn),X.in+145,y+37,font(700,15.5),GRN,'right'); y+=58;
  frame(y,58); T('ব্যালেন্স',X.out-16,y+37,font(600,17),INK,'right');
  if(d.balance>0) T(khPdfAmt(d.balance),X.out+145,y+37,font(700,15.5),RED,'right'); else if(d.balance<0) T(khPdfAmt(-d.balance),X.in+145,y+37,font(700,15.5),GRN,'right'); else T('মিটে গেছে',X.out+145,y+37,font(700,15),MUT,'right');
  pages.forEach((p,i)=>{ c=p; T(`Page no. ${i+1} of ${pages.length}`,W-M,H-26,font(500,12.5),'#555','right'); });
  return pages.map(p=>p.canvas);
}
/* minimal PDF writer: one full-page JPEG per A4 page (keeps Bangla shaping exactly as the browser draws it) */
function khBuildPdf(canvases){
  const enc=new TextEncoder(), parts=[]; let off=0; const xref=[];
  const push=b=>{ const u=typeof b==='string'?enc.encode(b):b; parts.push(u); off+=u.length; };
  const obj=(n,body)=>{ xref[n]=off; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };
  const jpegs=canvases.map(cv=>{ const s=atob(cv.toDataURL('image/jpeg',0.9).split(',')[1]), u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return {u,w:cv.width,h:cv.height}; });
  const n=jpegs.length, PW=595.28, PH=841.89; push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,`<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
  jpegs.forEach((j,i)=>{
    const p=3+i*3, content=`q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(p,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${p+2} 0 R >> >> /Contents ${p+1} 0 R >>`);
    obj(p+1,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    xref[p+2]=off; push(`${p+2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.u.length} >>\nstream\n`); push(j.u); push('\nendstream\nendobj\n');
  });
  const total=3+n*3, xo=off; push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for(let i=1;i<total;i++) push(String(xref[i]).padStart(10,'0')+' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xo}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'});
}
function khataPdfModal(name){
  const q=jsq(name), list=getKhata().filter(t=>t.person===name), first=list.map(t=>t.date).sort()[0]||dateKeyStr(todayDateOnly()), today=dateKeyStr(todayDateOnly());
  const d3=dateKeyStr(addDaysToDate(todayDateOnly(),-90)), m1=today.slice(0,8)+'01';
  showKhataModal('📄 হিসাবের PDF', `<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">${escapeHtml(name)}-এর পুরো লেনদেনের রিপোর্ট — ট্যালিখাতার মতো ছকে। কোন সময়ের হিসাব?</div>
    <div class="pct-chip-row"><button type="button" class="pct-chip on" onclick="khPdfRange('${first}','${today}',this)">সব সময়</button><button type="button" class="pct-chip" onclick="khPdfRange('${m1}','${today}',this)">এই মাস</button><button type="button" class="pct-chip" onclick="khPdfRange('${d3}','${today}',this)">গত 3 মাস</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><div><small style="color:var(--muted)">থেকে</small><input class="kh-in" id="kp_from" type="date" value="${first}"></div><div><small style="color:var(--muted)">পর্যন্ত</small><input class="kh-in" id="kp_to" type="date" value="${today}"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><div><small style="color:var(--muted)">রিপোর্টে তোমার নাম</small><input class="kh-in" id="kp_me" value="${escapeHtml(getTeacherName(false)||'')}"></div><div><small style="color:var(--muted)">তোমার মোবাইল</small><input class="kh-in" id="kp_ph" type="tel" value="${escapeHtml(getTeacherPhone(false)||'')}"></div></div>
    <button class="kh-fab" style="margin-top:12px;" onclick="khataPdfGo('${q}','dl')">📥 PDF ডাউনলোড করো</button>
    <button class="settings-btn" style="margin-top:8px;" onclick="khataPdfGo('${q}','share')">📤 শেয়ার করো (WhatsApp, মেসেজ…)</button>
    <div id="kp_msg" class="ks-hint"></div>`);
}
function khPdfRange(f,t,btn){ document.getElementById('kp_from').value=f; document.getElementById('kp_to').value=t; document.querySelectorAll('.pct-chip-row .pct-chip').forEach(b=>b.classList.toggle('on',b===btn)); }
async function khataMakePdf(name, from, to){
  const blob=khBuildPdf(await khataStatementPages(name,from,to)), fname=`${name}-হিসাব-${dateKeyStr(todayDateOnly()).replace(/-/g,'')}.pdf`.replace(/[\\/:*?"<>|]/g,'_');
  let file=null; try{ file=new File([blob],fname,{type:'application/pdf'}); }catch(e){}
  return {blob,fname,file,url:URL.createObjectURL(blob)};
}
function khAutoDownload(r){ try{ const a=document.createElement('a'); a.href=r.url; a.download=r.fname; document.body.appendChild(a); a.click(); a.remove(); }catch(e){} }
function khSnack(html, ms){
  let s=document.getElementById('khSnack'); if(!s){ s=document.createElement('div'); s.id='khSnack'; document.body.appendChild(s); }
  s.innerHTML=html; s.classList.add('on'); clearTimeout(s._t); if(ms) s._t=setTimeout(()=>s.classList.remove('on'),ms);
}
async function khataQuickPdf(name, days){
  const t=todayDateOnly(), to=dateKeyStr(t), from=days?dateKeyStr(addDaysToDate(t,-days)):''; closeDlPop();
  khSnack('<span><span class="spin"></span>রিপোর্ট তৈরি হচ্ছে…</span>');
  try{
    const r=await khataMakePdf(name,from,to); khAutoDownload(r);
    khSnack(`<span>✅ রিপোর্ট ডাউনলোড সফল হয়েছে</span><a href="${r.url}" download="${escapeHtml(r.fname)}">সেভ করো</a>`,8000);
  }catch(e){ console.error(e); khSnack('<span>⚠️ PDF বানাতে সমস্যা: '+escapeHtml(String((e&&e.message)||e))+'</span>',7000); }
}
function closeDlPop(){ const p=document.getElementById('khDlPop'); if(p) p.remove(); }
function khDlMenu(name){
  if(document.getElementById('khDlPop')){ closeDlPop(); return; }
  const q=jsq(name), p=document.createElement('div'); p.id='khDlPop';
  p.innerHTML=[['30 দিন',`khataQuickPdf('${q}',30)`],['3 মাস',`khataQuickPdf('${q}',90)`],['সব সময়',`khataQuickPdf('${q}',0)`],['📅 তারিখ নির্ধারণ / শেয়ার',`closeDlPop();khataPdfModal('${q}')`]].map(([l,c])=>`<button type="button" onclick="${c}">${l}</button>`).join('');
  document.querySelector('#khataModal .modal-box').appendChild(p); setTimeout(()=>document.addEventListener('click',closeDlPop,{once:true}),0);
}
async function khataPdfGo(name, mode){
  const from=document.getElementById('kp_from').value, to=document.getElementById('kp_to').value, msg=document.getElementById('kp_msg');
  if(from && to && from>to){ showWarningToast('"থেকে" তারিখ "পর্যন্ত"-এর আগে হতে হবে।'); return; }
  lsSet('tr_teacherName',(document.getElementById('kp_me').value||'').trim()); lsSet('tr_teacherPhone',(document.getElementById('kp_ph').value||'').trim());
  if(msg) msg.innerHTML='<span class="spin"></span>PDF তৈরি হচ্ছে…';
  try{
    const r=await khataMakePdf(name,from,to);
    if(mode==='share' && r.file && navigator.canShare && navigator.canShare({files:[r.file]})){ try{ await navigator.share({files:[r.file],title:`${name} — হিসাবের বিবরণী`}); if(msg) msg.textContent='✅ শেয়ার হয়েছে'; return; }catch(e){ if(e&&e.name==='AbortError'){ if(msg) msg.textContent=''; return; } } }
    khAutoDownload(r);
    if(msg) msg.innerHTML=`✅ PDF তৈরি হয়েছে। নিজে নিজে না নামলে নিচের বাটনে চাপো:<a class="kh-fab" style="display:block;text-align:center;text-decoration:none;margin-top:8px;" href="${r.url}" download="${escapeHtml(r.fname)}">📥 PDF সেভ করো</a>`;
  }catch(e){ console.error(e); if(msg) msg.textContent='⚠️ সমস্যা হয়েছে: '+((e&&e.message)||e); showWarningToast('PDF বানাতে সমস্যা হয়েছে।'); }
}

function khataExtraButtons(q, net){
  const b=(c,l,s)=>`<button class="settings-btn" style="margin-top:8px;${s||''}" onclick="${c}">${l}</button>`;
  return (net>0?b(`khataRemindSms('${q}')`,'💬 এসএমএসে তাগাদা পাঠাও'):'')
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><button class="settings-btn" style="margin:0;" onclick="khataMsgSend('${q}','wa')">📩 লেনদেনের মেসেজ<br><small>WhatsApp</small></button><button class="settings-btn" style="margin:0;" onclick="khataMsgSend('${q}','sms')">📩 লেনদেনের মেসেজ<br><small>এসএমএস</small></button></div>`
    + b(`khataPdfModal('${q}')`,'📥 হিসাবের PDF ডাউনলোড / শেয়ার','border-color:rgba(230,194,122,0.5);')
    + b(`khataShareStatement('${q}')`,'📋 হিসাবের লেখা কপি করো')
    + (net>0?b(`khataSetDue('${q}')`,'⏰ তাগাদার তারিখ ঠিক করো'):'');
}


/* ============ TALLYKHATA-STYLE: add customer/supplier (phonebook picker), group reminder, cashbox reconcile ============ */
let khNewKind='customer';
function khPickKind(k){ khNewKind=k; document.querySelectorAll('.kh-types button').forEach(b=>b.classList.toggle('on',b.dataset.k===k)); }
function openKhataPersonAdd(){
  khNewKind='customer';
  showKhataModal('নতুন কাস্টমার/সাপ্লায়ার', `<div class="kh-types" style="grid-template-columns:1fr 1fr;"><button type="button" data-k="customer" class="on" onclick="khPickKind('customer')">কাস্টমার</button><button type="button" data-k="supplier" onclick="khPickKind('supplier')">সাপ্লায়ার</button></div>
    <button type="button" class="settings-btn" style="margin-top:10px;" onclick="khPickContact()">📇 ফোনবুক থেকে যোগ করি</button>
    <input class="kh-in" id="np_name" placeholder="নাম" autocomplete="off"><input class="kh-in" id="np_phone" type="tel" inputmode="tel" placeholder="মোবাইল নম্বর">
    <button class="kh-fab" style="margin-top:6px;" onclick="khSavePerson()">নিশ্চিত</button>`);
}
async function khPickContact(){
  if(!(navigator.contacts && navigator.contacts.select)){ showWarningToast('এই ব্রাউজারে ফোনবুক খোলা যায় না — নাম ও নম্বর নিজে লেখো।'); return; }
  try{ const r=await navigator.contacts.select(['name','tel'],{multiple:false}); if(r&&r[0]){ document.getElementById('np_name').value=(r[0].name||[])[0]||''; document.getElementById('np_phone').value=((r[0].tel||[])[0]||'').replace(/\s+/g,''); } }catch(e){}
}
function khSavePerson(){
  const name=(document.getElementById('np_name').value||'').trim(), phone=(document.getElementById('np_phone').value||'').trim();
  if(!name){ showWarningToast('নাম দিতে হবে।'); return; }
  const p=getLs('tr_khataPeople'); p[name]=Object.assign(p[name]||{}, {kind:khNewKind, added:true}, phone?{phone}:{});
  lsSet('tr_khataPeople',p); closeKhataModal(); renderKhataTab(); showSuccessToast(`${name} যোগ হয়েছে`);
}
function khataGroupRemind(){
  const T=dateKeyStr(todayDateOnly()), rows=khataDebtRows(getKhata(),getLs('tr_khataPeople'),'get','',T);
  if(!rows.length){ showSuccessToast('কারো কাছে পাওনা নেই 🎉'); return; }
  showKhataModal('💬 গ্রুপ তাগাদা', `<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">${enNum(rows.length)} জনের কাছে পাওনা আছে — একজন একজন করে পাঠাও:</div>`+rows.map(r=>`<div class="kh-row" style="cursor:default;"><div class="kh-name">${escapeHtml(r.name)}<small>${enTaka(r.net)}${r.overdue?' · ⏰ মেয়াদ পেরিয়েছে':''}</small></div><button class="pct-chip" onclick="khataRemind('${jsq(r.name)}')">WhatsApp</button><button class="pct-chip" onclick="khataRemindSms('${jsq(r.name)}')">এসএমএস</button></div>`).join(''));
}
function khataCashInfo(){
  const all=getDaily(), t=dateKeyStr(todayDateOnly()); let cash=0, tin=0, tout=0;
  all.forEach(e=>{ const v=e.amount||0; if(e.kind==='in'){ cash+=v; if(e.date===t) tin+=v; } else { cash-=v; if(e.date===t) tout+=v; } });
  return {cash, tin, tout};
}
function renderKhataCash(){
  const c=khataCashInfo();
  return `<div class="cb-panel"><div class="cb-top"><div><b>${enTaka(dailySummary(getDaily(),currentMonthKey()).left)}</b><small>এই মাসের উদ্বৃত্ত</small></div><i></i><div><b>${enTaka(c.cash)}</b><small>বর্তমান ক্যাশ</small></div></div>
    <div class="cb-sub"><span>আজ পেলাম <em class="g">${enTaka(c.tin)}</em></span><span>আজ দিলাম <em class="r">${enTaka(c.tout)}</em></span></div>
    <div class="cb-btns"><button type="button" onclick="khataDayReport()">📄 রিপোর্ট</button><button type="button" onclick="khataReconcile()">⇄ ক্যাশবক্স মিলাই</button></div></div>`;
}
function khataReconcile(){
  showKhataModal('⇄ ক্যাশবক্স মিলাই', `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">খাতা অনুযায়ী এখন ক্যাশ <b>${enTaka(khataCashInfo().cash)}</b>। আসলে হাতে/মোবাইলে মোট কত আছে?</div>
    <input class="kh-in" id="rc_amt" type="text" inputmode="none" autocomplete="off" placeholder="আসল ক্যাশ" oninput="calcPreview('rc_amt')">${calcPadHtml('rc_amt')}
    <button class="kh-fab" onclick="khataReconcileSave()">সমন্বয় করো</button>`);
}
function khataReconcileSave(){
  const real=calcAmt('rc_amt'); if(isNaN(real)){ showWarningToast('সঠিক টাকার পরিমাণ দাও।'); return; }
  const diff=Math.round((real-khataCashInfo().cash)*100)/100;
  if(diff===0){ closeKhataModal(); showSuccessToast('ক্যাশ ঠিকই মিলে গেছে ✅'); return; }
  const kind=diff>0?'in':'out', cats=kind==='in'?DAILY_IN_CATS:DAILY_OUT_CATS;
  addDailyEntry(kind, String(Math.abs(diff)), cats[cats.length-1], 'ক্যাশ মিলানো সমন্বয়', dateKeyStr(todayDateOnly()));
  closeKhataModal(); renderKhataTab(); showSuccessToast(`${enTaka(Math.abs(diff))} ${diff>0?'বেশি':'কম'} ছিল — সমন্বয় হয়েছে`);
}


/* ============ হিসাব রিপোর্ট — দিন / সপ্তাহ (শনি–শুক্র) / মাস; ‹ › দিয়ে সরানো; নিচে এন্ট্রির তালিকা (এডিট/মোছা); ⬇ PDF ============ */
function khataDayData(daily, date){
  let opening=0; const inM={}, outM={};
  (daily||[]).forEach(e=>{ const v=e.amount||0, isIn=e.kind==='in';
    if(e.date<date) opening+=isIn?v:-v;
    else if(e.date===date){ const m=isIn?inM:outM, c=e.cat||'অন্যান্য'; m[c]=(m[c]||0)+v; } });
  const inRows=Object.entries(inM), outRows=Object.entries(outM);
  const totIn=Math.max(opening,0)+inRows.reduce((s,r)=>s+r[1],0), totOut=Math.max(-opening,0)+outRows.reduce((s,r)=>s+r[1],0);
  return {opening, inRows, outRows, totIn, totOut, closing:totIn-totOut};
}
/* same as khataDayData but for a date range [from, to] (inclusive) */
function khataRangeData(daily, from, to){
  let opening=0; const inM={}, outM={};
  (daily||[]).forEach(e=>{ const v=e.amount||0, isIn=e.kind==='in';
    if(e.date<from) opening+=isIn?v:-v;
    else if(e.date<=to){ const m=isIn?inM:outM, c=e.cat||'অন্যান্য'; m[c]=(m[c]||0)+v; } });
  const inRows=Object.entries(inM), outRows=Object.entries(outM);
  const totIn=Math.max(opening,0)+inRows.reduce((s,r)=>s+r[1],0), totOut=Math.max(-opening,0)+outRows.reduce((s,r)=>s+r[1],0);
  return {opening, inRows, outRows, totIn, totOut, closing:totIn-totOut};
}
/* pure: the date range a period covers around an anchor day. week = Saturday..Friday (Bangladesh), month = 1st..last */
function khRangeOf(per, anchor){
  const f=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  const d=new Date(anchor+'T00:00:00');
  if(per==='week'){ const s=new Date(d); s.setDate(d.getDate()-((d.getDay()+1)%7)); const e=new Date(s); e.setDate(s.getDate()+6); return {from:f(s), to:f(e)}; }
  if(per==='month'){ return {from:f(new Date(d.getFullYear(),d.getMonth(),1)), to:f(new Date(d.getFullYear(),d.getMonth()+1,0))}; }
  return {from:anchor, to:anchor};
}
/* pure: move the anchor by n periods (day ±1, week ±7, month ±1 month) */
function khRangeShift(per, anchor, n){
  const f=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  const d=new Date(anchor+'T00:00:00');
  if(per==='month'){ d.setDate(1); d.setMonth(d.getMonth()+n); } else d.setDate(d.getDate()+(per==='week'?7:1)*n);
  return f(d);
}
let khDay='', khPer='day', khFromRep=false;
function khRangeLabel(per, rg){
  const today=dateKeyStr(todayDateOnly()), L=ds=>enDateLabel(new Date(ds+'T00:00:00'));
  if(per==='month') return khD(monthKeyLabel(rg.from.slice(0,7)));
  if(per==='week') return L(rg.from)+' – '+L(rg.to)+((today>=rg.from&&today<=rg.to)?' (এই সপ্তাহ)':'');
  return L(rg.from)+(rg.from===today?' (আজ)':'');
}
/* one income/expense row (tap or ✎ to edit, ✕ to delete) — used by the cashbox list and the report page */
function khDailyRow(e, inRep){
  const go=`${inRep?'khFromRep=true;':'khFromRep=false;'}openDailyAdd('${e.kind}','${e.id}')`;
  return `<div class="kh-tx kh-tx-ed" onclick="${go}"><div>${escapeHtml(e.cat)}${e.note?` · ${escapeHtml(e.note)}`:''}</div><div style="display:flex;gap:6px;align-items:center;"><b style="color:${e.kind==='in'?'var(--paid)':'var(--due)'}">${e.kind==='in'?'+':'−'}${enTaka(e.amount)}</b><button type="button" class="kh-edit" aria-label="এডিট" onclick="event.stopPropagation();${go}">${ico('edit')}</button><button type="button" class="prog-del-chapter" aria-label="মুছে ফেলো" onclick="event.stopPropagation();deleteDaily('${e.id}')">✕</button></div></div>`;
}
function khDayBody(){
  const today=dateKeyStr(todayDateOnly()), rg=khRangeOf(khPer,khDay), d=khataRangeData(getDaily(),rg.from,rg.to), A=n=>enTaka(n);
  const row=(l,i,o,c)=>`<div class="kd-r ${c||''}"><span>${escapeHtml(l)}</span><b class="g">${i?A(i):''}</b><b class="r">${o?A(o):''}</b></div>`;
  const seg=[['day','দিন'],['week','সপ্তাহ'],['month','মাস']].map(([k,l])=>`<button type="button" class="${khPer===k?'on':''}" onclick="khSetPer('${k}')">${l}</button>`).join('');
  const nextBlocked=khRangeOf(khPer,khRangeShift(khPer,khDay,1)).from>today;
  const ents=getDaily().filter(e=>e.date>=rg.from&&e.date<=rg.to).sort((a,b)=>b.date.localeCompare(a.date));
  const byDay={}; ents.forEach(e=>{ (byDay[e.date]=byDay[e.date]||[]).push(e); });
  const list=Object.keys(byDay).map(dt=>`<div class="settings-section-title">${enDateLabel(new Date(dt+'T00:00:00'))}</div><div class="settings-row">${byDay[dt].map(e=>khDailyRow(e,true)).join('')}</div>`).join('');
  const startLbl={day:'দিনের',week:'সপ্তাহের',month:'মাসের'}[khPer];
  return `<div id="khRepBox"><div class="kh-seg kr-seg">${seg}</div>
    <div class="kd-nav"><button type="button" onclick="khDayShift(-1)" aria-label="আগেরটা">‹</button><span>📅 ${khRangeLabel(khPer,rg)}</span><button type="button" onclick="khDayShift(1)" ${nextBlocked?'disabled':''} aria-label="পরেরটা">›</button></div>
    <div class="kd-h"><span>বিবরণ</span><span>পেলাম</span><span>দিলাম</span></div>
    ${row(startLbl+' শুরুতে ক্যাশ', d.opening>0?d.opening:0, d.opening<0?-d.opening:0)}
    ${d.inRows.map(r=>row(r[0],r[1],0)).join('')}${d.outRows.map(r=>row(r[0],0,r[1])).join('')}
    ${(!d.inRows.length&&!d.outRows.length)?'<div class="kd-empty">এই সময়ে কোনো লেনদেন নেই</div>':''}
    ${row('মোট',d.totIn,d.totOut,'tot')}<div class="kd-r bal"><span>ক্যাশ ব্যালেন্স</span><b>${A(d.closing)}</b></div>
    ${ents.length?`<div class="settings-section-title" style="margin-top:14px;">লেনদেনের তালিকা (এডিট করতে ট্যাপ করো)</div>${list}`:''}
    <button class="kh-fab" style="margin-top:16px;" onclick="khataReconcile()">⇄ ক্যাশবক্স মিলাই</button></div>`;
}
function khRepRefresh(){ if(!document.getElementById('khRepBox')) return false; document.getElementById('khataModalBody').innerHTML=khDayBody(); return true; }
function khataDayReport(date){ khDay=date||dateKeyStr(todayDateOnly()); showKhataModal('📄 হিসাব রিপোর্ট', khDayBody(), `<button type="button" class="kh-dl" onclick="event.stopPropagation();khRangePdf()">⬇ ডাউনলোড</button>`); }
function khSetPer(p){ khPer=p; khRepRefresh(); }
function khDayShift(n){ const next=khRangeShift(khPer,khDay,n); if(khRangeOf(khPer,next).from>dateKeyStr(todayDateOnly())) return; khDay=next; khRepRefresh(); }
async function khRangePdf(){
  khSnack('<span><span class="spin"></span>রিপোর্ট তৈরি হচ্ছে…</span>');
  try{
    const rg=khRangeOf(khPer,khDay), d=khataRangeData(getDaily(),rg.from,rg.to), GRN='#1f8f5f', RED='#b3202c';
    const rows=getDaily().filter(e=>e.date>=rg.from&&e.date<=rg.to).sort((a,b)=>a.date.localeCompare(b.date));
    const inc=rows.filter(e=>e.kind==='in').reduce((t,e)=>t+e.amount,0), out=rows.filter(e=>e.kind!=='in').reduce((t,e)=>t+e.amount,0);
    const blob=await khTablePdf({title:'ক্যাশ রিপোর্ট', sub:khRangeLabel(khPer,rg), summary:[['আয়',enTaka(inc),GRN],['খরচ',enTaka(out),RED],['ক্যাশ ব্যালেন্স',enTaka(d.closing),'#1b1b24']],
      cols:[{h:'তারিখ',x:0,w:120},{h:'ক্যাটাগরি / বিবরণ',x:130,w:380},{h:'আয়',x:590,al:'right',w:100},{h:'খরচ',x:698,al:'right',w:100}],
      rows:rows.map(e=>[enDateLabel(new Date(e.date+'T00:00:00')), e.cat+(e.note?' · '+e.note:''), e.kind==='in'?enTaka(e.amount):'', e.kind!=='in'?enTaka(e.amount):'']),
      rowColors:rows.map(()=>[null,null,GRN,RED])});
    await khSavePdf(blob,`ক্যাশ-রিপোর্ট-${rg.from}${rg.to!==rg.from?'_'+rg.to:''}.pdf`);
  }catch(e){ console.error(e); khSnack('<span>⚠️ PDF বানাতে সমস্যা: '+escapeHtml(String((e&&e.message)||e))+'</span>',7000); }
}

function getLs(k){ return lsGet(k, {}); }

/* ============ SMART PERSONAL ACCOUNTING (all on-device): category learning, budget, insights, daily chart ============ */
const KH_CAT_HINTS = { 'খাবার':['খাবার','ভাত','চা','নাস্তা','হোটেল','রেস্টুরেন্ট','বিরিয়ানি','ফল','দুধ','কফি','পানি'], 'বাজার':['বাজার','সবজি','মাছ','মুদি','তেল','চাল','ডাল','মাংস','ডিম'], 'যাতায়াত':['রিকশা','বাস','ভাড়া','সিএনজি','উবার','পাঠাও','ট্রেন','পেট্রোল','টিকিট'], 'মোবাইল/নেট':['রিচার্জ','নেট','ডাটা','মোবাইল','ওয়াইফাই','ইন্টারনেট','মিনিট'], 'বিনোদন':['সিনেমা','গেম','ঘুরতে','ইফুটবল','efootball','মুভি','পার্টি'], 'স্বাস্থ্য':['ডাক্তার','ঔষধ','ওষুধ','হাসপাতাল','টেস্ট','চিকিৎসা'], 'পরিবার':['মা','বাবা','ভাই','বোন','পরিবার','বাসা']};
function learnCategory(note, kind){
  note=(note||'').trim(); if(!note) return '';
  const cats=kind==='in'?DAILY_IN_CATS:DAILY_OUT_CATS, toks=note.split(/[\s,.;:+\-/]+/).filter(w=>w.length>1);
  const score={};   // 1) learn from this person's own history: words that appeared with a category before
  getDaily().forEach(e=>{ if(e.kind!==(kind==='in'?'in':'out') || !e.note || !cats.includes(e.cat)) return;
    toks.forEach(w=>{ if(e.note.includes(w)) score[e.cat]=(score[e.cat]||0)+1; }); });
  const best=Object.keys(score).sort((a,b)=>score[b]-score[a])[0]; if(best) return best;
  if(kind!=='in'){ for(const c of Object.keys(KH_CAT_HINTS)){ if(cats.includes(c) && KH_CAT_HINTS[c].some(w=>note.includes(w))) return c; } }
  return '';
}
function dlSmartCat(kind){
  const note=(document.getElementById('dl_note')||{}).value||'', c=learnCategory(note,kind), hint=document.getElementById('dl_hint');
  if(!c){ if(hint) hint.textContent=''; return; }
  const chip=[...document.querySelectorAll('.dl-cat')].find(b=>b.dataset.c===c);
  if(chip){ dlPickCat(chip); if(hint) hint.textContent='🤖 ক্যাটাগরি বুঝে নিলাম: '+c; }
}
function getKhataBudget(){ return Math.max(0, parseFloat(lsGet('tr_budget',0))||0); }
function setKhataBudget(){
  const cur=getKhataBudget(), v=prompt('এই মাসের খরচের সীমা (টাকা)। বন্ধ করতে 0 লেখো:', cur||'');
  if(v===null) return; lsSet('tr_budget', Math.max(0, Math.round(parseFloat(bnDigitsToLatin(v))||0))); renderKhataTab();
}
function khataDailyChart(rows, mk, dim, todayN, avg){
  const per=Array(dim).fill(0); rows.forEach(e=>{ if(e.kind!=='in'){ const d=parseInt(e.date.slice(8,10),10); if(d>=1&&d<=dim) per[d-1]+=e.amount; } });
  const mx=Math.max(1,...per), W=310, H=84, bw=W/dim;
  const bars=per.map((v,i)=>{ const h=Math.round(v/mx*(H-16)); return `<rect x="${(i*bw+1).toFixed(1)}" y="${H-12-h}" width="${Math.max(2,bw-2).toFixed(1)}" height="${Math.max(h,v?2:0)}" rx="2" fill="${i+1===todayN?'var(--gold)':'rgba(111,124,238,0.75)'}"/>`; }).join('');
  const ay=H-12-Math.round(avg/mx*(H-16));
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="দৈনিক খরচ">${bars}${avg>0?`<line x1="0" x2="${W}" y1="${ay}" y2="${ay}" stroke="var(--due)" stroke-width="1" stroke-dasharray="4 3"/>`:''}<text x="0" y="${H}" font-size="8.5" fill="var(--muted)">${enNum(1)}</text><text x="${W}" y="${H}" font-size="8.5" fill="var(--muted)" text-anchor="end">${enNum(dim)}</text></svg>`;
}
function renderKhataSmart(sm, mk){
  const [y,m]=mk.split('-').map(Number), dim=new Date(y,m,0).getDate(), isCur=mk===currentMonthKey();
  const dayNow=isCur?todayDateOnly().getDate():dim, daysLeft=isCur?dim-dayNow+1:0;
  const avg=sm.out/Math.max(1,dayNow), proj=isCur?Math.round(avg*dim):sm.out;
  const prevMk=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`, prev=dailySummary(getDaily(), prevMk);
  const budget=getKhataBudget(), T=enTaka, lines=[];
  let bar='';
  if(budget>0){
    const pct=Math.round(sm.out/budget*100), cls=pct>=100?'over':(pct>=80?'warn':'');
    bar=`<div class="ks-bud"><div class="ks-bud-top"><span>🎯 মাসের সীমা ${T(budget)}</span><b>${enNum(pct)}%</b></div><div class="kh-bar"><i class="${cls}" style="width:${Math.min(100,pct)}%"></i></div></div>`;
    if(pct>=100) lines.push(`🚨 সীমা ছাড়িয়ে গেছে — ${T(sm.out-budget)} বেশি খরচ হয়েছে।`);
    else if(pct>=80) lines.push(`⚠️ সীমার ${enNum(pct)}% শেষ — বাকি ${T(budget-sm.out)}।`);
    if(isCur && budget>sm.out && daysLeft>0) lines.push(`💡 আজ থেকে দিনে ${T(Math.floor((budget-sm.out)/daysLeft))} করে খরচ করলে সীমার ভেতরে থাকবে।`);
    if(isCur && proj>budget && pct<100 && dayNow>=3) lines.push(`📈 এই গতিতে চললে মাস শেষে প্রায় ${T(proj)} হবে — সীমার চেয়ে ${T(proj-budget)} বেশি।`);
  } else if(isCur && sm.left>0 && daysLeft>0){
    lines.push(`💡 হাতে ${T(sm.left)} আছে — দিনে ${T(Math.floor(sm.left/daysLeft))} করে চালাতে পারো।`);
  }
  if(isCur && dayNow>=3 && sm.out>0) lines.push(`📊 গড় দৈনিক খরচ ${T(Math.round(avg))}${budget>0?'':` · মাস শেষে আনুমানিক ${T(proj)}`}।`);
  if(prev.out>0){ const base=isCur?proj:sm.out, ch=Math.round((base-prev.out)/prev.out*100);
    if(Math.abs(ch)>=10 && (!isCur||dayNow>=5)) lines.push(ch>0?`🔺 গত মাসের (${T(prev.out)}) চেয়ে ${enNum(ch)}% বেশি খরচের পথে।`:`🔻 গত মাসের চেয়ে ${enNum(-ch)}% কম — ভালো যাচ্ছে।`); }
  const jump=Object.entries(sm.cats).filter(([c,v])=>(prev.cats[c]||0)>0 && v>prev.cats[c]*1.3 && v-prev.cats[c]>=200).sort((a,b)=>(b[1]-prev.cats[b[0]])-(a[1]-prev.cats[a[0]]))[0];
  if(jump) lines.push(`🔍 ${jump[0]}-এ গত মাসের চেয়ে ${T(jump[1]-prev.cats[jump[0]])} বেশি গেছে।`);
  const chart=sm.out>0?`<div class="ks-chart">${khataDailyChart(sm.rows, mk, dim, isCur?dayNow:0, avg)}<div class="ks-cap">দৈনিক খরচ · লাল রেখা = গড়</div></div>`:'';
  return `<div class="ks-card"><div class="ks-head"><span>🧠 স্মার্ট হিসাব</span><button type="button" class="pct-chip" onclick="setKhataBudget()">${budget>0?'সীমা বদলাও':'সীমা ঠিক করো'}</button></div>${bar}${lines.map(l=>`<div class="ks-line">${l}</div>`).join('')||'<div class="ks-line" style="color:var(--muted)">কয়েকদিন হিসাব লিখলেই এখানে পরামর্শ আসবে।</div>'}${chart}</div>`;
}

function renderKhataDaily(){
  const mk=khataMk, sm=dailySummary(getDaily(), mk), [y,m]=mk.split('-').map(Number);
  const prev=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`, next=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;
  const cats=Object.entries(sm.cats).sort((a,b)=>b[1]-a[1]);
  const days={}; sm.rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(e=>{ (days[e.date]=days[e.date]||[]).push(e); });
  return renderKhataCash()+`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><button class="pct-chip" onclick="khataShiftMonth('${prev}')">‹</button><b style="color:var(--paper)">${khD(monthKeyLabel(mk))}</b><button class="pct-chip" onclick="khataShiftMonth('${next}')">›</button></div>
    <div class="kh-sum kh-daily"><div class="kh-card get"><small>আয়</small><b>${enTaka(sm.inc)}</b></div><div class="kh-card owe"><small>খরচ</small><b>${enTaka(sm.out)}</b></div></div>
    <div class="kh-card" style="margin-bottom:10px;"><small>${sm.left>=0?'হাতে থাকল':'ঘাটতি'}</small><b style="color:${sm.left>=0?'var(--gold)':'var(--due)'}">${enTaka(Math.abs(sm.left))}</b></div>
    ${renderKhataSmart(sm,mk)}
    ${typeof khCatBudgetCard==='function'?khCatBudgetCard(sm):''}
    <button type="button" class="settings-btn" style="margin:0 0 10px;" onclick="khToolsMenu()">🧰 খাতা টুলস — রিপিট · বাজেট · সার্চ · PDF · CSV</button>
    <button class="kh-fab" onclick="openDailyAdd('out')">➕ খরচ / আয় লেখো</button>
    ${cats.length?`<div class="settings-section-title">কোথায় কত গেল</div><div class="settings-row">${cats.map(([c,v])=>`<div style="margin-bottom:8px;font-size:12.5px;display:flex;justify-content:space-between;"><span>${escapeHtml(c)}</span><b>${enTaka(v)}</b></div><div class="kh-bar"><i style="width:${Math.round(v/sm.out*100)}%"></i></div>`).join('')}</div>`:''}
    ${cats.length?'':emptyState({icon:'wallet',title:'এই মাসে কোনো হিসাব নেই',body:'আয় বা খরচ হলেই উপরের বোতামে লিখে ফেলো — মাস শেষে কোথায় কত গেল এখানে দেখা যাবে।'})}
    ${Object.keys(days).map(d=>`<div class="settings-section-title">${enDateLabel(new Date(d+'T00:00:00'))}</div><div class="settings-row">${days[d].map(e=>khDailyRow(e,false)).join('')}</div>`).join('') || '<div class="st-empty">এই মাসে কোনো হিসাব নেই। হোমের বারে লিখতে পারো: <b>খরচ ১২০ খাবার</b></div>'}`;
}
function khataShiftMonth(mk){ khataMk=mk; renderKhataTab(); }
/* khata "pages": full-screen, slide in from the right, ← closes, and the phone's back gesture closes the page instead of leaving the app */
let khModalTok=0, khHist=false, khIgnorePop=false;
function setKhataAction(html){ const a=document.getElementById('khataModalAction'); if(a) a.innerHTML=html||''; }
/* মডালের শিরোনামের শুরুর ইমোজি → একই ধাঁচের লাইন আইকন */
const KH_TITLE_ICONS={'🤖':'spark','📖':'file','🔮':'spark','🧠':'spark','💭':'chat','🌌':'spark','🧭':'spark','📉':'chart','🎙️':'mic','📩':'chat','💎':'spark','📝':'note','🧰':'tools','🔁':'repeat','🎯':'target','🔎':'search','📄':'file','💬':'chat'};
function khTitleHtml(t){ t=String(t||''); const e=[...t][0]; return KH_TITLE_ICONS[e] ? ico(KH_TITLE_ICONS[e])+' '+escapeHtml(t.slice(e.length).trim()) : escapeHtml(t); }
function showKhataModal(title, html, actionHtml){
  const m=document.getElementById('khataModal'); khModalTok++;
  document.getElementById('khataModalTitle').innerHTML=khTitleHtml(title); document.getElementById('khataModalBody').innerHTML=html; setKhataAction(actionHtml);
  const wasOpen=m.style.display==='flex'&&!m.classList.contains('closing'); m.classList.remove('closing'); m.style.display='flex';
  document.getElementById('khataModalBody').scrollTop=0;
  if(!wasOpen && !khHist){ try{ history.pushState({kh:1},''); khHist=true; }catch(e){} }
}
function closeKhataModal(fromPop){
  const m=document.getElementById('khataModal'); if(m.style.display==='none') return; const tok=khModalTok; closeDlPop(); calcHide();
  m.classList.add('closing');
  setTimeout(()=>{ if(tok!==khModalTok) return; m.style.display='none'; m.classList.remove('closing'); setKhataAction(''); },170);
  if(fromPop===true){ khHist=false; return; }
  setTimeout(()=>{ if(khHist && document.getElementById('khataModal').style.display==='none'){ khHist=false; khIgnorePop=true; try{ history.back(); }catch(e){} } },320);
}
window.addEventListener('popstate',()=>{ if(khIgnorePop){ khIgnorePop=false; return; } const m=document.getElementById('khataModal'); if(m && m.style.display!=='none' && khHist) closeKhataModal(true); });
let khTxType='gave';

/* ============ CALCULATOR KEYPAD for amount fields (TallyKhata-style): 250+130×2, 10%, ÷, =, live preview ============ */
/* pure (unit-tested). Safe parser — no eval. "200+10%" = 220 (percent of the left side), "200×10%" = 20, "5+" = 5, ÷0 = null */
function calcEval(expr){
  let s=bnDigitsToLatin(String(expr||'')).replace(/[×xX*]/g,'*').replace(/[÷/]/g,'/').replace(/[−–—]/g,'-').replace(/[\s,]/g,'');
  if(!s || /[^0-9.+\-*/%]/.test(s)) return null;
  const tok=[], re=/(\d+\.?\d*|\.\d+)(%?)|([+\-*/])/g; let m, used=0;
  while((m=re.exec(s))){ used+=m[0].length; if(m[3]) tok.push({op:m[3]}); else tok.push({n:parseFloat(m[1]),pct:m[2]==='%'}); }
  if(used!==s.length) return null;
  while(tok.length && tok[tok.length-1].op) tok.pop();                      // trailing operator: ignore for the live preview
  if(tok.length && tok[0].op==='+') tok.shift(); else if(tok.length && tok[0].op==='-') tok.unshift({n:0,pct:false});
  if(!tok.length || tok[0].op) return null;
  for(let i=0;i<tok.length;i++){ if(!!tok[i].op===!!(i%2===0)) return null; }   // must alternate number, operator, number…
  let sum=0, sign=1, i=0;
  while(i<tok.length){
    let first=tok[i], val=first.n, single=true; i++;
    if(first.pct && !(i<tok.length && (tok[i].op==='*'||tok[i].op==='/')) && i>1) val=sum*first.n/100;   // "+10%": percent of what is already summed
    else if(first.pct) val=first.n/100;
    while(i<tok.length && (tok[i].op==='*'||tok[i].op==='/')){
      const op=tok[i].op, nx=tok[i+1], v=nx.pct?nx.n/100:nx.n; single=false;
      if(op==='/'){ if(v===0) return null; val/=v; } else val*=v; i+=2;
    }
    sum+=sign*val;
    if(i<tok.length){ sign=tok[i].op==='-'?-1:1; i++; }
  }
  return isFinite(sum)?Math.round(sum*100)/100:null;
}
function calcPadHtml(id){ return `<div class="cp-prev" id="${id}_prev"></div>`; }
function calcPreview(id){
  const el=document.getElementById(id), pv=document.getElementById(id+'_prev'); if(!el||!pv) return;
  const r=calcEval(el.value), hasOp=/[+\-−×÷*/%]/.test(bnDigitsToLatin(el.value).replace(/^-/,''));
  const TK=isKhField(id)?enTaka:bnTakaOpen;
  pv.textContent=(hasOp && r!==null)?'= '+TK(r):'';
  if(calcTarget===id){ const cr=document.getElementById('cdRes'); if(cr) cr.textContent=(hasOp && r!==null)?'= '+TK(r):''; }
}
function calcKey(id,k){
  const el=document.getElementById(id); if(!el) return; let v=el.value||''; const last=v.slice(-1), isOp=c=>'+−×÷-*/'.includes(c);
  if(k==='AC') v='';
  else if(k==='⌫') v=v.slice(0,-1);
  else if(k==='='){ const r=calcEval(v); if(r===null){ if(v) showWarningToast('হিসাবটা ঠিক নেই।'); return; } v=isKhField(id)?String(r):toBn(String(r)); }
  else if('+−×÷'.includes(k)){ if(!v) return; v=isOp(last)?v.slice(0,-1)+k:v+k; }
  else if(k==='%'){ if(!v || !/[0-9০-৯]/.test(last)) return; v+=k; }
  else if(k==='.'){ const cur=bnDigitsToLatin(v).split(/[+\-−×÷*/%]/).pop(); if(cur.includes('.')) return; v+=(cur===''?(isKhField(id)?'0.':'০.'):'.'); }
  else { if(last==='%') return; v+=k; }
  el.value=v; calcPreview(id);
}

/* ---- docked keypad (like TallyKhata): appears only when an amount field is tapped, slides up from the bottom ---- */
const CALC_IDS=['kh_amt','dl_amt','pp_amount','exp_amount','rc_amt']; let calcTarget=null;
const CALC_BACK='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9.5l-5 5M12 9.5l5 5"/></svg>';
function calcEnsureDock(){
  let d=document.getElementById('calcDock'); if(d) return d;
  const K=(k,c,label)=>`<button type="button" class="cd-k ${c||''}" data-k="${k}" aria-label="${k==='⌫'?'মুছো':k}" onmousedown="event.preventDefault()" onclick="calcPress('${k}')">${label||k}</button>`;
  d=document.createElement('div'); d.id='calcDock'; d.className='calc-dock'; d.setAttribute('role','group'); d.setAttribute('aria-label','ক্যালকুলেটর');
  d.innerHTML=`<div class="cd-top"><span class="cd-title">ক্যালকুলেটর</span><span id="cdRes"></span><button type="button" class="cd-ok" onmousedown="event.preventDefault()" onclick="calcConfirm()">ঠিক আছে ✓</button></div>
    <div class="cd-grid">${K('AC','op')}${K('%','op')}${K('÷','op')}${K('×','op')}${K('৭')}${K('৮')}${K('৯')}${K('−','op')}${K('৪')}${K('৫')}${K('৬')}${K('১')}${K('২')}${K('৩')}${K('⌫','op',CALC_BACK)}${K('০')}${K('.')}${K('=','eq')}${K('+','op plus')}</div>`;
  document.body.appendChild(d); return d;
}
function calcRelabel(latin){ document.querySelectorAll('#calcDock .cd-k').forEach(b=>{ const k=b.dataset.k; if(/^[০-৯]$/.test(k)) b.textContent=latin?bnDigitsToLatin(k):k; }); }
function calcShow(id){
  const el=document.getElementById(id); if(!el) return; const d=calcEnsureDock(); calcTarget=id;
  calcRelabel(isKhField(id)); d.classList.add('on'); document.body.classList.add('calc-open'); calcPreview(id);
  setTimeout(()=>{ try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} },80);
}
function calcHide(){ const d=document.getElementById('calcDock'); if(d) d.classList.remove('on'); document.body.classList.remove('calc-open'); calcTarget=null; }
function calcPress(k){ if(!calcTarget) return; try{ navigator.vibrate&&navigator.vibrate(6); }catch(e){} if(isKhField(calcTarget)) k=bnDigitsToLatin(k); calcKey(calcTarget,k); }
function calcConfirm(){
  const id=calcTarget, el=id&&document.getElementById(id);
  if(el){ const r=calcEval(el.value); if(r!==null && /[+\-−×÷*/%]/.test(bnDigitsToLatin(el.value).replace(/^-/,''))){ el.value=isKhField(id)?String(r):toBn(String(r)); calcPreview(id); } }
  calcHide();
}
document.addEventListener('focusin',e=>{ const id=e.target&&e.target.id; if(CALC_IDS.includes(id)) calcShow(id); else if(calcTarget && !(e.target.closest&&e.target.closest('#calcDock'))) calcHide(); });
document.addEventListener('click',e=>{ const id=e.target&&e.target.id; if(CALC_IDS.includes(id)) calcShow(id); });
document.addEventListener('pointerdown',e=>{ if(!calcTarget) return; const t=e.target; if((t.closest&&t.closest('#calcDock'))||(t.id&&CALC_IDS.includes(t.id))) return; calcHide(); },true);
setInterval(()=>{ if(calcTarget && !document.getElementById(calcTarget)) calcHide(); },500);

function calcAmt(id){ const el=document.getElementById(id); const r=el?calcEval(el.value):null; return r===null?NaN:r; }

let khEditTx=null;
function openKhataTx(person, type, editId){
  const ed=editId?getKhata().find(t=>t.id===editId):null; khEditTx=ed?ed.id:null;
  khTxType=ed?ed.type:(type||'gave'); if(ed) person=ed.person;
  showKhataModal(ed?'লেনদেন এডিট':'নতুন লেনদেন', `<input class="kh-in" id="kh_person" list="kh_people" placeholder="কার সাথে? (নাম)" value="${escapeHtml(person||'')}">
    <datalist id="kh_people">${Object.keys(khataBalances(getKhata())).map(n=>`<option value="${escapeHtml(n)}">`).join('')}</datalist>
    <div class="kh-types">${Object.entries(KH_TYPES).map(([k,v])=>`<button type="button" data-t="${k}" class="${k===khTxType?'on':''}" onclick="khPickType('${k}')">${v.label}</button>`).join('')}</div>
    <input class="kh-in" id="kh_amt" type="text" inputmode="none" placeholder="টাকার পরিমাণ (যেমন 250+130×2)" autocomplete="off" value="${ed?ed.amount:''}" oninput="calcPreview('kh_amt')">${calcPadHtml('kh_amt')}
    <input class="kh-in" id="kh_note" placeholder="নোট (ঐচ্ছিক)" value="${ed?escapeHtml(ed.note||''):''}">
    <input class="kh-in" id="kh_date" type="date" value="${ed?ed.date:dateKeyStr(todayDateOnly())}">
    <button class="kh-fab" style="margin-top:12px;" onclick="saveKhataTx()">${ed?'আপডেট করো':'সেভ করো'}</button>`);
}
function khPickType(k){ khTxType=k; document.querySelectorAll('.kh-types button').forEach(b=>b.classList.toggle('on', b.dataset.t===k)); }
function saveKhataTx(){
  if(khEditTx){
    const person=(document.getElementById('kh_person').value||'').trim(), amt=Math.round(calcAmt('kh_amt')||0);
    if(!person || !(amt>0)){ showWarningToast('নাম আর টাকার পরিমাণ দুটোই দিতে হবে।'); return; }
    const list=getKhata(), t=list.find(x=>x.id===khEditTx); if(!t){ khEditTx=null; closeKhataModal(); return; }
    const old=t.person; t.person=person; t.type=khTxType; t.amount=amt; t.note=(document.getElementById('kh_note').value||'').trim(); t.date=document.getElementById('kh_date').value||t.date;
    lsSet('tr_khata', list);
    if(old!==person && !list.some(x=>x.person===old)){ const pp=getLs('tr_khataPeople'); if(pp[old]){ if(!pp[person]) pp[person]=pp[old]; delete pp[old]; lsSet('tr_khataPeople', pp); } }   // phone / due date follow the renamed person
    khEditTx=null; renderKhataTab(); showSuccessToast('লেনদেন আপডেট হয়েছে'); openKhataPerson(person); return;
  }
  const t=addKhataTx(document.getElementById('kh_person').value, khTxType, String(calcAmt('kh_amt')), document.getElementById('kh_note').value, document.getElementById('kh_date').value);
  if(!t){ showWarningToast('নাম আর টাকার পরিমাণ দুটোই দিতে হবে।'); return; }
  closeKhataModal(); renderKhataTab(); showSuccessToast('লেনদেন সেভ হয়েছে');
}
function openKhataPerson(name){
  const q=jsq(name), list=getKhata().filter(t=>t.person===name).sort((a,b)=>b.date.localeCompare(a.date)), net=khataBalances(list)[name]||0, ph=(getLs('tr_khataPeople')[name]||{}).phone||'';
  showKhataModal(name, `<div class="kh-card ${net>0?'get':(net<0?'owe':'')}" style="text-align:center;"><small>${net>0?escapeHtml(name)+' আমাকে দেবে':(net<0?'আমি দেব':'হিসাব মিটে গেছে')}</small><b>${enTaka(Math.abs(net))}</b></div>
    <div class="kh-types">${Object.entries(KH_TYPES).map(([k,v])=>`<button type="button" onclick="openKhataTx('${q}','${k}')">${v.label}</button>`).join('')}</div>
    ${net!==0?`<button class="settings-btn" onclick="settleKhata('${q}')">✔ পুরো মিটিয়ে দিলাম (${enTaka(Math.abs(net))})</button>`:''}
    ${net>0?`<button class="settings-btn" style="margin-top:8px;" onclick="khataRemind('${q}')"><span class="ic">${ICN.share}</span> WhatsApp-এ তাগাদা পাঠাও</button>`:''}
    ${khataExtraButtons(q,net)}
    <button class="settings-btn" style="margin-top:8px;" onclick="editKhataPhone('${q}')">📞 ফোন নম্বর ${ph?'('+escapeHtml(ph)+') বদলাও':'যোগ করো'}</button>
    <div class="settings-section-title">লেনদেনের ইতিহাস</div>
    ${list.map(t=>`<div class="kh-tx kh-tx-ed" onclick="openKhataTx('${q}','${t.type}','${t.id}')"><div>${KH_TYPES[t.type].label}${t.note?` · ${escapeHtml(t.note)}`:''}<small>${enDateLabel(new Date(t.date+'T00:00:00'))}</small></div><div style="display:flex;gap:6px;align-items:center;"><b>${enTaka(t.amount)}</b><button type="button" class="kh-edit" aria-label="এডিট" onclick="event.stopPropagation();openKhataTx('${q}','${t.type}','${t.id}')">${ico('edit')}</button><button type="button" class="prog-del-chapter" aria-label="মুছে ফেলো" onclick="event.stopPropagation();deleteKhataTx('${t.id}','${q}')">✕</button></div></div>`).join('')}`);
  setKhataAction(`<button type="button" class="kh-dl" onclick="event.stopPropagation();khDlMenu('${q}')">⬇ ডাউনলোড</button>`);
}
function settleKhata(name){
  const net=khataBalances(getKhata())[name]||0; if(!net) return;
  addKhataTx(name, net>0?'got_back':'paid_back', Math.abs(net), 'পুরো মিটিয়ে দেওয়া');
  openKhataPerson(name); renderKhataTab();
}
function deleteKhataTx(id, name){
  const before=JSON.stringify(getKhata()); lsSet('tr_khata', getKhata().filter(t=>t.id!==id));
  openKhataPerson(name); renderKhataTab();
  showUndoToast('লেনদেন মুছে ফেলা হয়েছে', ()=>{ lsSet('tr_khata', JSON.parse(before)); renderKhataTab(); closeKhataModal(); });
}
function deleteDaily(id){
  const before=JSON.stringify(getDaily()); lsSet('tr_daily', getDaily().filter(e=>e.id!==id)); renderKhataTab(); khRepRefresh();
  showUndoToast('হিসাবটা মুছে ফেলা হয়েছে', ()=>{ lsSet('tr_daily', JSON.parse(before)); renderKhataTab(); khRepRefresh(); });
}
function editKhataPhone(name){
  const all=getLs('tr_khataPeople'), v=prompt(`${name}-এর ফোন নম্বর:`, (all[name]||{}).phone||''); if(v===null) return;
  all[name]={...(all[name]||{}), phone:v.trim()}; lsSet('tr_khataPeople', all); openKhataPerson(name); renderKhataTab();
}
function khataRemind(name){
  const net=khataBalances(getKhata())[name]||0; if(net<=0) return;
  const ph=(getLs('tr_khataPeople')[name]||{}).phone||'', who=getTeacherName(false);
  openWhatsApp(ph, `আসসালামু আলাইকুম, ${name}।\nআপনার কাছে আমার ${enTaka(net)} পাওনা আছে। সুবিধামতো সময়ে দিয়ে দিলে ভালো হতো। ধন্যবাদ।${who?`\n— ${who}`:''}`);
}
let khEditDaily=null;
function openDailyAdd(kind, editId, keep){
  if(editId) khEditDaily=editId; else if(!keep) khEditDaily=null;
  const ed=khEditDaily?getDaily().find(e=>e.id===khEditDaily):null;
  if(ed && !keep) kind=ed.kind;
  const base=kind==='in'?DAILY_IN_CATS:DAILY_OUT_CATS, today=dateKeyStr(todayDateOnly());
  const v=keep||(ed?{amt:String(ed.amount),note:ed.note||'',date:ed.date,cat:ed.cat}:{amt:'',note:'',date:today,cat:''});
  const cats=(v.cat && !base.includes(v.cat))?base.concat(v.cat):base, ci=Math.max(0,cats.indexOf(v.cat));   // an old category that is no longer in the list stays selectable
  showKhataModal(ed?'আয় / খরচ এডিট':'আয় / খরচ লেখো', `<div class="kh-types" style="grid-template-columns:1fr 1fr;"><button type="button" data-k="out" class="${kind==='out'?'on':''}" onclick="dlSwitchKind('out')">খরচ</button><button type="button" data-k="in" class="${kind==='in'?'on':''}" onclick="dlSwitchKind('in')">আয়</button></div>
    <input class="kh-in" id="dl_amt" type="text" inputmode="none" placeholder="টাকার পরিমাণ (যেমন 250+130×2)" autocomplete="off" value="${escapeHtml(v.amt)}" oninput="calcPreview('dl_amt')">${calcPadHtml('dl_amt')}
    <div class="pct-chip-row" style="margin-top:8px;">${cats.map((c,i)=>`<button type="button" class="pct-chip dl-cat${i===ci?' on':''}" data-c="${escapeHtml(c)}" onclick="dlPickCat(this)">${escapeHtml(c)}</button>`).join('')}</div>
    <input class="kh-in" id="dl_note" placeholder="নোট (ঐচ্ছিক) — লিখলেই ক্যাটাগরি বুঝে নেব" value="${escapeHtml(v.note)}" oninput="dlSmartCat('${kind}')"><div id="dl_hint" class="ks-hint"></div>
    <input class="kh-in" id="dl_date" type="date" value="${escapeHtml(v.date)}">
    <button class="kh-fab" style="margin-top:12px;" onclick="saveDaily('${kind}')">${ed?'আপডেট করো':'সেভ করো'}</button>`);
}
/* আয় ↔ খরচ বদলালে যা লিখেছ (টাকা, নোট, তারিখ) হারায় না */
function dlSwitchKind(k){ const g=id=>(document.getElementById(id)||{}).value||''; openDailyAdd(k,null,{amt:g('dl_amt'),note:g('dl_note'),date:g('dl_date')||dateKeyStr(todayDateOnly()),cat:''}); }
function dlPickCat(b){ document.querySelectorAll('.dl-cat').forEach(x=>x.classList.toggle('on', x===b)); }
function saveDaily(kind){
  const cat=(document.querySelector('.dl-cat.on')||{dataset:{c:'অন্যান্য'}}).dataset.c;
  if(khEditDaily){
    const amt=Math.round(calcAmt('dl_amt')||0); if(!(amt>0)){ showWarningToast('টাকার পরিমাণ লেখো।'); return; }
    const list=getDaily(), e=list.find(x=>x.id===khEditDaily); if(!e){ khEditDaily=null; closeKhataModal(); return; }
    e.kind=kind==='in'?'in':'out'; e.amount=amt; e.cat=cat; e.note=(document.getElementById('dl_note').value||'').trim(); e.date=document.getElementById('dl_date').value||e.date;
    lsSet('tr_daily', list); khEditDaily=null; renderKhataTab(); showSuccessToast('হিসাব আপডেট হয়েছে');
    if(khFromRep){ khFromRep=false; khataDayReport(khDay||undefined); } else closeKhataModal();
    return;
  }
  if(!addDailyEntry(kind, String(calcAmt('dl_amt')), cat, document.getElementById('dl_note').value, document.getElementById('dl_date').value)){ showWarningToast('টাকার পরিমাণ লেখো।'); return; }
  closeKhataModal(); renderKhataTab(); showSuccessToast('হিসাব সেভ হয়েছে');
}
/* ---- one-line entry from the home bar: "রাকিব ৫০০ ধার দিলাম" / "রাকিব ২০০ ফেরত দিল" / "খরচ ১২০ খাবার" / "আয় ৫০০ উপহার" ---- */
const KH_PHRASES = [[/ফেরত পেলাম|ফেরত দিয়েছে|ফেরত দিল(?![\u0980-\u09FF])|শোধ করেছে|শোধ দিয়েছে/,'got_back'],[/ফেরত দিলাম|শোধ করলাম|শোধ দিলাম/,'paid_back'],[/ধার নিলাম|ধার করলাম|ঋণ নিলাম|ধার নিয়েছি/,'took'],[/ধার দিলাম|ধার দিয়েছি|বাকি দিলাম/,'gave']];
/* The person's name is everything before the amount — whether the amount was typed in digits or spoken in words. */
function khataPersonPrefix(text){
  const di=text.search(/[0-9০-৯]/);
  if(di>=0) return text.slice(0,di);
  const half=new RegExp('^(সাড়ে|দেড়|দেড|আড়াই)$'.normalize('NFD'));
  const toks=text.split(/\s+/);
  const i=toks.findIndex(t=>half.test(t.normalize('NFD')) || bnWordsToDigits(t)!==t.normalize('NFD'));
  return i>0 ? toks.slice(0,i).join(' ') : '';
}
function parseKhataCommand(text){
  const t0=bnDigitsToLatin(bnWordsToDigitsSafe(text)).trim();
  const amt=(()=>{ const m=t0.replace(/(\d),(?=\d{3})/g,'$1').match(/\d+(?:\.\d+)?/); return m?Math.round(parseFloat(m[0])):0; })();
  const dm=/^(খরচ|খরচ করলাম|কিনলাম|আয়|ইনকাম)\s/.exec(text.trim());
  if(dm && amt>0){
    const kind=/আয়|ইনকাম/.test(dm[1])?'in':'out', cats=kind==='in'?DAILY_IN_CATS:DAILY_OUT_CATS;
    const note=text.trim().slice(dm[0].length).replace(/[0-9০-৯,.]+/g,' ').replace(/টাকা/g,' ').replace(/\s+/g,' ').trim();
    const cat=cats.find(c=>c.split('/').some(w=>note.includes(w)))||learnCategory(note,kind)||cats[cats.length-1];
    return {ok:true, action:'khata', mode:'daily', kind, amount:amt, cat, note};
  }
  const hit=KH_PHRASES.find(([re])=>re.test(text)); if(!hit || !(amt>0)) return null;
  const before=khataPersonPrefix(text).replace(/(?:-?কে|-র|-এর)\s*$/,'').trim();
  const person=before || null; if(!person) return {ok:false, msg:'কার সাথে লেনদেন বুঝতে পারিনি। যেমন লেখো: "রাকিব ৫০০ ধার দিলাম"।'};
  return {ok:true, action:'khata', mode:'person', person, type:hit[1], amount:amt};
}
function bnWordsToDigitsSafe(t){ return /[0-9০-৯]/.test(t) ? t : bnWordsToDigits(t); }
function executeKhataCommand(r){
  if(r.mode==='daily') addDailyEntry(r.kind, r.amount, r.cat, r.note); else addKhataTx(r.person, r.type, r.amount, '');
  clearCommandResult(); document.getElementById('cmdInput').value=''; renderKhataTab();
  showSuccessToast(r.mode==='daily' ? `${r.kind==='in'?'আয়':'খরচ'} ${enTaka(r.amount)} খাতায় লেখা হয়েছে` : `${r.person}: ${KH_TYPES[r.type].label} ${enTaka(r.amount)} লেখা হয়েছে`);
}

