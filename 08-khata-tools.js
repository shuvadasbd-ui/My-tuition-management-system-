/* ============ খাতা টুলস (v46): মাসিক রিপিট · ক্যাটাগরি বাজেট · গ্লোবাল সার্চ · PDF (মাসিক ক্যাশ / সব কাস্টমার) · CSV ============ */
const KH_REC_KEY='tr_recurring', KH_CATBUD_KEY='tr_catBudget';
const khId=()=>Date.now()+'_'+Math.random().toString(36).slice(2,6);
const khPrevMonth=mk=>{ const [y,m]=mk.split('-').map(Number); return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`; };
const khNextMonth=mk=>{ const [y,m]=mk.split('-').map(Number); return m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`; };
const khDaysIn=mk=>{ const [y,m]=mk.split('-').map(Number); return new Date(y,m,0).getDate(); };

/* ---------- ১) মাসিক রিপিট (pure: যে মাসগুলোর এন্ট্রি বাকি) ---------- */
function khRecurDue(item, todayStr){
  const cur=todayStr.slice(0,7), out=[]; let mk=item.last?khNextMonth(item.last):item.from||cur, guard=0;
  while(mk<=cur && guard++<24){
    const d=Math.min(item.day||1, khDaysIn(mk)), date=`${mk}-${String(d).padStart(2,'0')}`;
    if(date<=todayStr) out.push({mk,date}); else break;
    mk=khNextMonth(mk);
  }
  return out;
}
function khRecurApply(){
  const list=lsGet(KH_REC_KEY,[]); if(!list.length) return 0;
  const today=dateKeyStr(todayDateOnly()); let n=0;
  list.forEach(it=>{ khRecurDue(it,today).forEach(x=>{ if(addDailyEntry(it.kind,it.amount,it.cat,it.note?it.note+' (রিপিট)':'রিপিট',x.date)){ n++; it.last=x.mk; } else it.last=x.mk; }); });
  if(n) { lsSet(KH_REC_KEY,list); try{ showSuccessToast(`${enNum(n)}টা রিপিট এন্ট্রি খাতায় যোগ হয়েছে`); }catch(e){} }
  else lsSet(KH_REC_KEY,list);
  return n;
}
let khRecKind='out';
function khRecKindPick(k){ khRecKind=k; document.querySelectorAll('#khRecKinds button').forEach(b=>b.classList.toggle('on',b.dataset.k===k)); const s=document.getElementById('khr_cat'); if(s) s.innerHTML=(k==='in'?DAILY_IN_CATS:DAILY_OUT_CATS).map(c=>`<option>${escapeHtml(c)}</option>`).join(''); }
function khRecurModal(){
  const list=lsGet(KH_REC_KEY,[]); khRecKind='out';
  const rows=list.map(r=>`<div class="kh-tx"><div>${escapeHtml(r.cat)}${r.note?' · '+escapeHtml(r.note):''}<small>প্রতি মাসের ${enNum(r.day)} তারিখ</small></div><div style="display:flex;gap:10px;align-items:center;"><b style="color:${r.kind==='in'?'var(--paid)':'var(--due)'}">${r.kind==='in'?'+':'−'}${enTaka(r.amount)}</b><button class="prog-del-chapter" onclick="khRecurDel('${r.id}')">✕</button></div></div>`).join('')||'<div class="st-empty">কোনো মাসিক রিপিট নেই। যেমন: বাসা ভাড়া, ইন্টারনেট বিল, মাসিক সঞ্চয়।</div>';
  showKhataModal('🔁 মাসিক রিপিট', `${rows}
    <div class="settings-section-title">নতুন রিপিট</div>
    <div class="kh-types" id="khRecKinds" style="grid-template-columns:1fr 1fr;"><button type="button" data-k="out" class="on" onclick="khRecKindPick('out')">খরচ</button><button type="button" data-k="in" onclick="khRecKindPick('in')">আয়</button></div>
    <input class="kh-in" id="khr_amt" type="number" inputmode="numeric" placeholder="টাকা (যেমন 1500)">
    <select class="kh-in" id="khr_cat">${DAILY_OUT_CATS.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select>
    <input class="kh-in" id="khr_note" placeholder="বিবরণ (যেমন বাসা ভাড়া)">
    <input class="kh-in" id="khr_day" type="number" inputmode="numeric" min="1" max="28" placeholder="মাসের কত তারিখে? (1-28)">
    <button class="kh-fab" style="position:static;width:100%;margin-top:10px;" onclick="khRecurSave()">✔ রিপিট চালু করো</button>`);
}
function khRecurSave(){
  const amt=Math.round(parseFloat(document.getElementById('khr_amt').value)||0), day=Math.min(28,Math.max(1,parseInt(document.getElementById('khr_day').value,10)||1));
  if(!(amt>0)){ showWarningToast('টাকার পরিমাণ লেখো।'); return; }
  const list=lsGet(KH_REC_KEY,[]);
  list.push({id:khId(), kind:khRecKind, amount:amt, cat:document.getElementById('khr_cat').value, note:document.getElementById('khr_note').value.trim(), day, last:khPrevMonth(currentMonthKey())});
  lsSet(KH_REC_KEY,list); khRecurApply(); renderKhataTab(); khRecurModal();
}
function khRecurDel(id){ lsSet(KH_REC_KEY,lsGet(KH_REC_KEY,[]).filter(r=>r.id!==id)); khRecurModal(); }

/* ---------- ২) ক্যাটাগরি-ভিত্তিক বাজেট ---------- */
function khCatBudgets(){ return lsGet(KH_CATBUD_KEY,{}); }
function khCatBudgetModal(){
  const b=khCatBudgets();
  showKhataModal('🎯 ক্যাটাগরি বাজেট', `<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">মাসে প্রতিটা খাতে কত পর্যন্ত খরচ করবে। ফাঁকা বা 0 রাখলে সীমা নেই।</div>`+DAILY_OUT_CATS.map((c,i)=>`<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><span style="flex:1;font-size:13px;">${escapeHtml(c)}</span><input class="kh-in" id="khcb_${i}" type="number" inputmode="numeric" style="width:120px;margin:0;" value="${b[c]||''}" placeholder="0"></div>`).join('')+`<button class="kh-fab" style="position:static;width:100%;margin-top:10px;" onclick="khCatBudgetSave()">✔ সেভ করো</button>`);
}
function khCatBudgetSave(){
  const b={}; DAILY_OUT_CATS.forEach((c,i)=>{ const v=Math.round(parseFloat(document.getElementById('khcb_'+i).value)||0); if(v>0) b[c]=v; });
  lsSet(KH_CATBUD_KEY,b); closeKhataModal(); renderKhataTab(); showSuccessToast('ক্যাটাগরি বাজেট সেভ হয়েছে');
}
function khCatBudgetCard(sm){
  const b=khCatBudgets(), cats=Object.keys(b); if(!cats.length) return '';
  return `<div class="settings-section-title">ক্যাটাগরি বাজেট</div><div class="settings-row">`+cats.map(c=>{
    const spent=sm.cats[c]||0, pct=Math.round(spent/b[c]*100), cls=pct>=100?'over':(pct>=80?'warn':'');
    return `<div style="margin-bottom:8px;font-size:12.5px;display:flex;justify-content:space-between;"><span>${escapeHtml(c)}${pct>=100?' ⚠️':''}</span><b>${enTaka(spent)} / ${enTaka(b[c])}</b></div><div class="kh-bar"><i class="${cls}" style="width:${Math.min(100,pct)}%"></i></div>`;
  }).join('')+`</div>`;
}

/* ---------- ৩) গ্লোবাল সার্চ (pure: খাতা + আয়-খরচ একসাথে) ---------- */
function khSearchAll(q, khata, daily){
  q=bnDigitsToLatin(String(q||'')).trim().toLowerCase(); if(!q) return [];
  const num=/^\d+$/.test(q)?parseInt(q,10):null, res=[];
  (khata||[]).forEach(t=>{ const lb=(KH_TYPES[t.type]||{}).label||''; const hay=`${t.person} ${t.note||''} ${lb}`.toLowerCase(); if(hay.includes(q)||(num!==null&&t.amount===num)) res.push({src:'khata',date:t.date,title:t.person,sub:`${lb}${t.note?' · '+t.note:''}`,amount:t.amount,person:t.person}); });
  (daily||[]).forEach(e=>{ const hay=`${e.cat} ${e.note||''} ${e.kind==='in'?'আয়':'খরচ'}`.toLowerCase(); if(hay.includes(q)||(num!==null&&e.amount===num)) res.push({src:'daily',date:e.date,title:e.cat,sub:e.note||(e.kind==='in'?'আয়':'খরচ'),amount:e.amount,kind:e.kind}); });
  return res.sort((a,b)=>b.date.localeCompare(a.date));
}
function khSearchModal(){
  showKhataModal('🔎 খাতায় খোঁজো', `<input class="kh-in" id="khg_q" type="search" placeholder="নাম, বিবরণ, ক্যাটাগরি বা টাকার অঙ্ক" oninput="khSearchRun(this.value)" autocomplete="off"><div id="khg_res">${emptyState({icon:'search',title:'খুঁজতে লেখো',body:'নাম, বিবরণ, ক্যাটাগরি বা টাকার অঙ্ক — খাতা আর আয়-খরচ দুই জায়গাতেই খোঁজা হবে।'})}</div>`);
  setTimeout(()=>{ const i=document.getElementById('khg_q'); if(i) i.focus(); },250);
}
function khSearchRun(v){
  const r=khSearchAll(v,getKhata(),getDaily()), box=document.getElementById('khg_res'); if(!box) return;
  if(!String(v||'').trim()){ box.innerHTML=emptyState({icon:'search',title:'খুঁজতে লেখো',body:'নাম, বিবরণ, ক্যাটাগরি বা টাকার অঙ্ক — খাতা আর আয়-খরচ দুই জায়গাতেই খোঁজা হবে।'}); return; }
  box.innerHTML=r.length?`<div style="font-size:11.5px;color:var(--muted);margin:6px 0;">${enNum(r.length)}টা ফলাফল${r.length>50?' (প্রথম 50টা)':''}</div>`+r.slice(0,50).map(x=>`<div class="kh-tx" ${x.src==='khata'?`style="cursor:pointer" onclick="openKhataPerson('${jsq(x.person)}')"`:''}><div>${escapeHtml(x.title)}<small>${escapeHtml(x.sub)} · ${enDateLabel(new Date(x.date+'T00:00:00'))} ${x.src==='khata'?'· খাতা':'· আয়-খরচ'}</small></div><b style="color:${x.kind==='in'?'var(--paid)':(x.kind==='out'?'var(--due)':'var(--paper)')}">${enTaka(x.amount)}</b></div>`).join(''):emptyState({icon:'search',title:'কিছু পাওয়া যায়নি',body:'অন্য কোনো নাম বা টাকার অঙ্ক দিয়ে খুঁজে দেখো।'});
}

/* ---------- ৪+৫) PDF (মাসিক ক্যাশ / সব কাস্টমার): একই পেজ-বিল্ডার, khBuildPdf দিয়ে ---------- */
async function khTablePdf(o){   // o: {title, sub, summary:[[label,value,color]], cols:[{h,x,al}], rows:[[...]], rowColors?:[[...]]}
  try{ await Promise.race([document.fonts.load('700 20px "Hind Siliguri"'), new Promise(r=>setTimeout(r,1200))]); }catch(e){}
  const SC=2,W=794,H=1123,M=32,FF='"Hind Siliguri","Noto Sans Bengali","Kalpurush","Segoe UI",sans-serif',RED='#b3202c',INK='#1b1b24',MUT='#8a8a98',LINE='#e6e6ee';
  const me=getTeacherName(false), phone=getTeacherPhone(false), pages=[]; let cv,c,y;
  const T=(s,x,yy,w,sz,col,al)=>{ c.font=`${w} ${sz}px ${FF}`; c.fillStyle=col||INK; c.textAlign=al||'left'; c.textBaseline='alphabetic'; c.fillText(String(s),x,yy); };
  const clip=(s,max,w,sz)=>{ c.font=`${w} ${sz}px ${FF}`; s=String(s); while(c.measureText(s).width>max && s.length>1) s=s.slice(0,-1); return s; };
  const head=()=>{ cv=document.createElement('canvas'); cv.width=W*SC; cv.height=H*SC; c=cv.getContext('2d'); c.scale(SC,SC); c.fillStyle='#fff'; c.fillRect(0,0,W,H); c.fillStyle='#fcf0f0'; c.fillRect(0,0,W,96);
    T(me||'আমার খাতা',M,48,700,24,RED); if(phone) T('মোবাইল নম্বরঃ '+phone,M,74,600,13.5,INK); T('আমার টিউশন রুটিন',W-M,48,700,17,RED,'right'); T(o.title,W-M,72,500,12.5,MUT,'right'); y=124; pages.push(cv); };
  const colHead=()=>{ c.fillStyle='#f6f6f9'; c.fillRect(M,y-16,W-2*M,28); o.cols.forEach(k=>T(k.h,k.al==='right'?M+k.x:M+k.x,y+3,700,12.5,MUT,k.al)); y+=30; };
  head(); T(o.sub,M,y+6,700,15,INK); y+=26;
  if(o.summary){ const bw=(W-2*M-12*(o.summary.length-1))/o.summary.length; o.summary.forEach(([l,v,col],i)=>{ const x=M+i*(bw+12); c.fillStyle='#f6f6f9'; c.fillRect(x,y,bw,58); T(l,x+12,y+20,500,12,MUT); T(v,x+12,y+46,700,20,col||INK); }); y+=78; }
  colHead();
  o.rows.forEach((r,ri)=>{ if(y>H-70){ head(); colHead(); }
    o.cols.forEach((k,ci)=>{ const col=(o.rowColors&&o.rowColors[ri]&&o.rowColors[ri][ci])||INK; T(clip(r[ci],k.w||200,500,13),M+k.x,y+4,500,13,col,k.al); });
    c.strokeStyle=LINE; c.beginPath(); c.moveTo(M,y+14); c.lineTo(W-M,y+14); c.stroke(); y+=28; });
  if(!o.rows.length) T('কোনো তথ্য নেই',M,y+8,500,13,MUT);
  pages.forEach((p,i)=>{ c=p.getContext('2d'); c.font=`500 11px ${FF}`; c.fillStyle=MUT; c.textAlign='center'; c.fillText(`${i+1} / ${pages.length}`,W/2,H-24); });
  return khBuildPdf(pages);
}
async function khSavePdf(blob, fname){
  fname=fname.replace(/[\\/:*?"<>|]/g,'_'); const url=URL.createObjectURL(blob), r={blob,fname,url};
  khAutoDownload(r); khSnack(`<span>✅ রিপোর্ট ডাউনলোড সফল হয়েছে</span><a href="${url}" download="${escapeHtml(fname)}">সেভ করো</a>`,8000);
}
async function khMonthlyCashPdf(mk){
  mk=mk||khataMk||currentMonthKey(); closeKhataModal(); khSnack('<span><span class="spin"></span>রিপোর্ট তৈরি হচ্ছে…</span>');
  try{
    const sm=dailySummary(getDaily(),mk), rows=sm.rows.slice().sort((a,b)=>a.date.localeCompare(b.date)), GRN='#1f8f5f', RED='#b3202c';
    const blob=await khTablePdf({title:'মাসিক ক্যাশ রিপোর্ট', sub:khD(monthKeyLabel(mk)), summary:[['আয়',enTaka(sm.inc),GRN],['খরচ',enTaka(sm.out),RED],[sm.left>=0?'হাতে থাকল':'ঘাটতি',enTaka(Math.abs(sm.left)),sm.left>=0?'#1b1b24':RED]],
      cols:[{h:'তারিখ',x:0,w:120},{h:'ক্যাটাগরি / বিবরণ',x:130,w:380},{h:'আয়',x:590,al:'right',w:100},{h:'খরচ',x:698,al:'right',w:100}],
      rows:rows.map(e=>[enDateLabel(new Date(e.date+'T00:00:00')), e.cat+(e.note?' · '+e.note:''), e.kind==='in'?enTaka(e.amount):'', e.kind==='out'?enTaka(e.amount):'']),
      rowColors:rows.map(()=>[null,null,GRN,RED])});
    await khSavePdf(blob,`ক্যাশ-রিপোর্ট-${mk}.pdf`);
  }catch(e){ console.error(e); khSnack('<span>⚠️ PDF বানাতে সমস্যা: '+escapeHtml(String((e&&e.message)||e))+'</span>',7000); }
}
async function khAllCustomersPdf(){
  closeKhataModal(); khSnack('<span><span class="spin"></span>রিপোর্ট তৈরি হচ্ছে…</span>');
  try{
    const list=getKhata(), bal=khataBalances(list), people=getLs('tr_khataPeople'), tot=khataTotals(list), last={};
    list.forEach(t=>{ if(!last[t.person]||t.date>last[t.person]) last[t.person]=t.date; });
    const names=Object.keys(bal).filter(n=>bal[n]!==0).sort((a,b)=>Math.abs(bal[b])-Math.abs(bal[a])), RED='#b3202c', GRN='#1f8f5f';
    const blob=await khTablePdf({title:'সব কাস্টমারের হিসাব', sub:'তারিখ: '+khPdfDate(dateKeyStr(todayDateOnly())), summary:[['আমি পাব',enTaka(tot.get),RED],['আমি দেব',enTaka(tot.owe),GRN],['জন',enNum(names.length)]],
      cols:[{h:'নাম',x:0,w:230},{h:'ফোন',x:250,w:140},{h:'শেষ লেনদেন',x:410,w:120},{h:'বাকি / পাওনা',x:700,al:'right',w:160}],
      rows:names.map(n=>[n,(people[n]||{}).phone||'',last[n]?enDateLabel(new Date(last[n]+'T00:00:00')):'',(bal[n]>0?'পাব ':'দেব ')+enTaka(Math.abs(bal[n]))]),
      rowColors:names.map(n=>[null,null,null,bal[n]>0?RED:GRN])});
    await khSavePdf(blob,`সব-কাস্টমার-${dateKeyStr(todayDateOnly())}.pdf`);
  }catch(e){ console.error(e); khSnack('<span>⚠️ PDF বানাতে সমস্যা: '+escapeHtml(String((e&&e.message)||e))+'</span>',7000); }
}

/* ---------- ৬) CSV (এক্সেলে বাংলা ঠিক রাখতে BOM সহ) ---------- */
function khCsvCell(v){ v=String(v==null?'':v); return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
function khCsvBuild(header, rows){ return '\uFEFF'+[header].concat(rows).map(r=>r.map(khCsvCell).join(',')).join('\r\n'); }
function khCsvKhata(){ return khCsvBuild(['তারিখ','নাম','ধরন','পরিমাণ','বিবরণ'], getKhata().slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,t.person,(KH_TYPES[t.type]||{}).label||t.type,t.amount,t.note||''])); }
function khCsvDaily(){ return khCsvBuild(['তারিখ','ধরন','ক্যাটাগরি','পরিমাণ','বিবরণ'], getDaily().slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>[e.date,e.kind==='in'?'আয়':'খরচ',e.cat,e.amount,e.note||''])); }
function khCsvDownload(which){
  const text=which==='daily'?khCsvDaily():khCsvKhata(), fname=(which==='daily'?'আয়-খরচ-':'খাতা-লেনদেন-')+dateKeyStr(todayDateOnly())+'.csv', blob=new Blob([text],{type:'text/csv;charset=utf-8'});
  closeKhataModal(); khSavePdf(blob,fname);
}

/* ---------- মেনু ---------- */
function khToolsMenu(){
  const b=(c,i,l,s)=>`<button class="settings-btn" style="margin-top:8px;text-align:left;" onclick="${c}">${ico(i)}${l}${s?`<br><small style="color:var(--muted)">${s}</small>`:''}</button>`;
  showKhataModal('🧰 খাতা টুলস', b('khNotesPage()','note','নোট ও করণীয়','চেকলিস্ট — কাজ শেষে টিক দাও')
    +b('khataDayReport()','file','হিসাব রিপোর্ট','দিন · সপ্তাহ · মাস — PDF সহ')
    +b('khSearchModal()','search','খাতায় খোঁজো','নাম, বিবরণ বা টাকার অঙ্ক দিয়ে সব জায়গায়')
    +b('khRecurModal()','repeat','মাসিক রিপিট','বাসা ভাড়া, বিলের মতো নিয়মিত এন্ট্রি নিজে থেকে বসবে')
    +b('khCatBudgetModal()','target','ক্যাটাগরি বাজেট','প্রতিটা খাতের জন্য আলাদা মাসিক সীমা')
    +b('khMonthlyCashPdf()','file','মাসিক ক্যাশ PDF',khD(monthKeyLabel(khataMk||currentMonthKey())))
    +b('khAllCustomersPdf()','users','সব কাস্টমারের PDF','এক পাতায় সবার বাকি-পাওনা')
    +b("khCsvDownload('khata')",'table','লেনদেন CSV (এক্সেল)','খাতার সব লেনদেন')
    +b("khCsvDownload('daily')",'table','আয়-খরচ CSV (এক্সেল)','ক্যাশবক্সের সব এন্ট্রি'));
}
setTimeout(()=>{ try{ if(khRecurApply() && document.getElementById('pageKhata') && document.getElementById('pageKhata').style.display!=='none') renderKhataTab(); }catch(e){ console.error(e); } },1500);
