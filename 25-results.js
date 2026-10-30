/* ============ V73 — পরীক্ষার ফল, দুর্বল অধ্যায় ও অভিভাবকের মাসিক ফল-রিপোর্ট ============ */
/* নিয়ম (পরিকল্পনা §৪): ফল আগে শতকরায়; একটা পরীক্ষায় স্থায়ী রায় নয় (<২ পরীক্ষা = "পর্যবেক্ষণ"); অনুপস্থিত/অসম্পূর্ণ/শূন্য নম্বর আলাদা; */
/* প্রতিটা সুপারিশের সঙ্গে কারণ; শিক্ষক যেকোনো সুপারিশ বদলাতে পারে (tr_resultPins); রিপোর্ট শেয়ারের আগে পড়ে অনুমোদন। */
/* tr_results: [{id, student, subject, chapter, exam, date:'YYYY-MM-DD', got, full, status:'taken'|'absent'|'incomplete', note}] */

const RES_STATUS = {taken:'দিয়েছে', absent:'অনুপস্থিত', incomplete:'অসম্পূর্ণ'};
const RES_BAND_LABEL = {good:'ভালো অগ্রগতি', practice:'আরও অনুশীলন', weak:'পুনরায় শেখানো', watch:'পর্যবেক্ষণ'};

/* ---------- pure (unit-tested) ---------- */
function resNf(nf){ return typeof nf==='function' ? nf : (typeof toBn==='function' ? toBn : String); }
function resCfgFrom(c){ c=c||{}; const n=(v,d)=>{ v=Number(v); return isFinite(v)&&v>0&&v<=100 ? v : d; }; let good=n(c.good,80), practice=n(c.practice,60); if(practice>=good) practice=Math.max(1,good-1); return {good, practice, last:Math.max(1,Math.min(6,parseInt(c.last,10)||3))}; }
function resCfg(){ return resCfgFrom(lsGet('tr_resultCfg',{})); }
/* শতকরা (১ দশমিক পর্যন্ত); শুধু "দিয়েছে" অবস্থার বৈধ নম্বরে। পূর্ণমান ০ হলে গণনা নয়। শূন্য নম্বর = বৈধ ০%। */
function resPct(r){
  if(!r || r.status!=='taken') return null;
  const g=Number(r.got), f=Number(r.full); if(r.got===''||r.got==null||!isFinite(g)||!(f>0)||g<0||g>f) return null;
  return Math.round(g/f*1000)/10;
}
function resValidate(r){
  if(!r.student) return 'শিক্ষার্থী বাছো।'; if(!String(r.subject||'').trim()) return 'বিষয় লেখো।';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')) return 'তারিখ ঠিক নেই।';
  if(!RES_STATUS[r.status]) return 'অবস্থা বাছো।';
  if(r.status==='taken'){ const f=Number(r.full), g=Number(r.got); if(!(f>0)) return 'পূর্ণমান ০-এর বেশি হতে হবে।'; if(r.got===''||r.got==null||!isFinite(g)||g<0) return 'প্রাপ্ত নম্বর লেখো (শূন্য পেলে ০ লেখো)।'; if(g>f) return 'প্রাপ্ত নম্বর পূর্ণমানের চেয়ে বেশি হতে পারে না।'; }
  return '';
}
function resIsDup(list, r){ return list.some(x=>x.student===r.student && x.subject===r.subject && (x.chapter||'')===(r.chapter||'') && (x.exam||'')===(r.exam||'') && x.date===r.date && x.status===r.status && Number(x.got)===Number(r.got) && Number(x.full)===Number(r.full)); }
function resBand(avg, cfg){ return avg>=cfg.good ? 'good' : (avg>=cfg.practice ? 'practice' : 'weak'); }
function resKey(student, subject, chapter){ return student+'|'+subject+'|'+(chapter||''); }
/* এক শিক্ষার্থীর প্রতিটা বিষয়/অধ্যায়ের অবস্থা। pins: {key:'weak'|'ok'|'dismiss'} */
function resStats(results, student, cfg, pins){
  cfg=cfg||resCfgFrom({}); pins=pins||{}; const g={};
  (results||[]).filter(r=>r.student===student).forEach(r=>{ const k=resKey(student,r.subject,r.chapter); (g[k]=g[k]||{student,subject:r.subject,chapter:r.chapter||'',key:k,rows:[]}).rows.push(r); });
  return Object.keys(g).map(k=>{
    const o=g[k], rows=o.rows.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.id)<String(b.id)?-1:1);
    const taken=rows.filter(r=>resPct(r)!==null), pcts=taken.map(resPct), lastK=pcts.slice(-cfg.last);
    const avg=lastK.length ? Math.round(lastK.reduce((s,x)=>s+x,0)/lastK.length*10)/10 : null;
    const st={student,subject:o.subject,chapter:o.chapter,key:k,n:taken.length,used:lastK.length,pcts:lastK,avg,
      absent:rows.filter(r=>r.status==='absent').length, incomplete:rows.filter(r=>r.status==='incomplete').length, zeros:taken.filter(r=>Number(r.got)===0).length,
      trend: pcts.length>=2 ? Math.round((pcts[pcts.length-1]-pcts[pcts.length-2])*10)/10 : null, lastDate:rows[rows.length-1].date, pinned:null, dismissed:false};
    if(avg===null){ st.band='none'; }
    else { st.band=resBand(avg,cfg); if(st.n<2 && st.band==='weak') st.band='watch'; }
    const p=pins[k]; if(p==='weak'){ st.band='weak'; st.pinned='weak'; } else if(p==='ok'){ st.band='good'; st.pinned='ok'; } else if(p==='dismiss'){ st.dismissed=true; st.pinned='dismiss'; }
    return st;
  }).sort((a,b)=>(a.avg==null?999:a.avg)-(b.avg==null?999:b.avg));
}
/* কারণসহ ব্যাখ্যা — nf = সংখ্যা-ফরম্যাটার (অ্যাপে বাংলা অঙ্ক) */
function resExplain(st, nf){
  nf=resNf(nf); const ch=st.chapter?`${st.chapter} অধ্যায়ে`:`${st.subject}-এ`, avg=st.avg==null?'':nf(st.avg)+'%';
  let t;
  if(st.band==='none') t=`${ch} এখনো কোনো পূর্ণ পরীক্ষার নম্বর নেই।`;
  else if(st.pinned==='weak') t=`${ch} শিক্ষক নিজে "দুর্বল" চিহ্নিত করেছেন (গড় ${avg})।`;
  else if(st.pinned==='ok') t=`${ch} শিক্ষক "ঠিক আছে" ধরেছেন (গড় ${avg})।`;
  else if(st.band==='watch') t=`${ch} মাত্র ${nf(st.n)}টা পরীক্ষা (${avg}) — স্থায়ী সিদ্ধান্তের আগে আরেকটা পরীক্ষা দেখা ভালো; ছোট একটা কুইজ নেওয়া যায়।`;
  else if(st.band==='weak') t=`${ch} শেষ ${nf(st.used)}টা পরীক্ষার গড় ${avg}; ১০ মিনিটের পুনরাবৃত্তি ও ছোট কুইজ প্রস্তাবিত।`;
  else if(st.band==='practice') t=`${ch} শেষ ${nf(st.used)}টা পরীক্ষার গড় ${avg}; আরও কিছু অনুশীলন করালে ভালো ফল আসবে।`;
  else t=`${ch} শেষ ${nf(st.used)}টা পরীক্ষার গড় ${avg} — ভালো অগ্রগতি।`;
  if(st.trend!=null && Math.abs(st.trend)>=10) t+=` সর্বশেষ পরীক্ষায় আগেরটার চেয়ে ${nf(Math.abs(st.trend))}% ${st.trend>0?'বেড়েছে':'কমেছে'}।`;
  const side=[]; if(st.absent) side.push(`অনুপস্থিত ${nf(st.absent)}বার`); if(st.incomplete) side.push(`অসম্পূর্ণ ${nf(st.incomplete)}বার`); if(st.zeros) side.push(`০ নম্বর ${nf(st.zeros)}বার`);
  if(side.length) t+=` (${side.join(', ')} — অনুপস্থিত/অসম্পূর্ণ গড়ে ধরা হয়নি)`;
  return t;
}
function resWeakList(results, cfg, pins, onlyStudent){
  const names=[...new Set((results||[]).map(r=>r.student))].filter(n=>!onlyStudent||n===onlyStudent), out=[];
  names.forEach(n=>resStats(results,n,cfg,pins).forEach(s=>{ if(!s.dismissed && (s.band==='weak'||s.band==='watch'||s.band==='practice')) out.push(s); }));
  const rank={weak:0,watch:1,practice:2}; return out.sort((a,b)=>(rank[a.band]-rank[b.band])||((a.avg==null?999:a.avg)-(b.avg==null?999:b.avg)));
}
function resPrevMonth(mk){ const [y,m]=mk.split('-').map(Number); const d=new Date(y,m-2,1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function resAttSummary(att, name, mk){ let present=0,late=0,absent=0; Object.keys(att||{}).forEach(k=>{ const p=k.split('|'); if(p[0].slice(0,7)!==mk || p.slice(2).join('|')!==name) return; const s=att[k]; if(s==='present')present++; else if(s==='late')late++; else if(s==='absent')absent++; }); return {present,late,absent,marked:present+late+absent}; }
/* মাসের রিপোর্টের কাঁচা তথ্য: বিষয়ভিত্তিক গড় + আগের মাসের সঙ্গে পরিবর্তন */
function resMonthReport(results, student, mk, att, cfg, pins){
  cfg=cfg||resCfgFrom({}); const mine=(results||[]).filter(r=>r.student===student), prev=resPrevMonth(mk);
  const avgOf=(rows)=>{ const p=rows.map(resPct).filter(x=>x!==null); return p.length?Math.round(p.reduce((s,x)=>s+x,0)/p.length*10)/10:null; };
  const subs=[...new Set(mine.filter(r=>r.date.slice(0,7)===mk).map(r=>r.subject))].map(s=>{
    const cur=mine.filter(r=>r.subject===s&&r.date.slice(0,7)===mk), pr=mine.filter(r=>r.subject===s&&r.date.slice(0,7)===prev), a=avgOf(cur), b=avgOf(pr);
    return {subject:s, avg:a, prev:b, delta:(a!=null&&b!=null)?Math.round((a-b)*10)/10:null, n:cur.filter(r=>resPct(r)!==null).length, absent:cur.filter(r=>r.status==='absent').length, incomplete:cur.filter(r=>r.status==='incomplete').length};
  });
  const st=resStats(mine,student,cfg,pins).filter(s=>!s.dismissed && s.lastDate.slice(0,7)===mk);
  return {mk, subjects:subs, good:st.filter(s=>s.band==='good'), practice:st.filter(s=>s.band==='practice'||s.band==='weak'||s.band==='watch'), att:resAttSummary(att,student,mk), examsTaken:mine.filter(r=>r.date.slice(0,7)===mk&&resPct(r)!==null).length};
}
function resReportText(o){      // o: {display, klass, monthLabel, rep, teacher, comment, nf}
  const nf=resNf(o.nf), r=o.rep, L=[`📊 ${o.display}${o.klass?' ('+o.klass+')':''} — ${o.monthLabel}-এর পরীক্ষার ফল`,''];
  if(r.att.marked) L.push(`✅ উপস্থিতি: ${nf(r.att.marked)}টা ক্লাসের মধ্যে ${nf(r.att.present+r.att.late)}টায় উপস্থিত`,'');
  if(!r.subjects.length) L.push('এই মাসে কোনো পরীক্ষার ফল নেই।');
  r.subjects.forEach(s=>{
    let line=`• ${s.subject}: `+(s.avg==null?'পূর্ণ পরীক্ষা হয়নি':`${nf(s.avg)}%`);
    if(s.delta!=null) line+=s.delta>0?` (আগের মাসের চেয়ে ${nf(s.delta)}% বেশি ⬆️)`:s.delta<0?` (আগের মাসের চেয়ে ${nf(Math.abs(s.delta))}% কম ⬇️)`:' (আগের মাসের মতোই)';
    if(s.absent) line+=` — ${nf(s.absent)}টা পরীক্ষায় অনুপস্থিত`; if(s.incomplete) line+=` — ${nf(s.incomplete)}টা অসম্পূর্ণ`;
    L.push(line);
  });
  const nm=s=>s.chapter?`${s.subject} (${s.chapter})`:s.subject;
  if(r.good.length) L.push('','👍 ভালো করছে: '+r.good.map(nm).join(', '));
  if(r.practice.length){ L.push('','🔁 আরও অনুশীলন দরকার: '+r.practice.map(nm).join(', '),'📌 আগামী মাসের পরিকল্পনা: এই বিষয়গুলোয় ছোট পুনরাবৃত্তি ও কুইজ।'); }
  if(o.comment) L.push('','💬 শিক্ষকের মন্তব্য: '+o.comment);
  L.push('', o.teacher?`ধন্যবাদ,\n${o.teacher}`:'ধন্যবাদ।'); return L.join('\n');
}

/* ---------- screen ---------- */
let res={tab:'add', student:'', status:'taken', filter:'', mk:'', approved:false, comment:''};
function resList(){ const l=lsGet('tr_results',[]); return Array.isArray(l)?l:[]; }
function resOpen(){ if(!res.mk) res.mk=currentMonthKey(); const names=getAllKnownNames(); if(!res.student||!names.includes(res.student)) res.student=names[0]||''; showKhataModal('📊 ফল ও দুর্বলতা','<div id="resBox"></div>'); resRender(); }
function resTab(t){ res.tab=t; res.approved=false; resRender(); }
function resSetStudent(v){ res.student=v; res.approved=false; resRender(); }
function resSetStatus(s){ res.status=s; resRender(); }
function resSubjectOpts(){ const sj=getStudentSubjects(res.student)||{}; return Object.keys(sj); }
function resChapterOpts(subj){ const c=(getStudentSubjects(res.student)||{})[subj]; return Array.isArray(c)?c.map(x=>x.chapter).filter(Boolean):[]; }
function resChips(){ return `<div class="pct-chip-row">${[['add','➕ ফল যোগ'],['weak','🔎 দুর্বলতা'],['report','📨 মাসিক রিপোর্ট']].map(([k,l])=>`<button type="button" class="pct-chip${res.tab===k?' active':''}" onclick="resTab('${k}')">${l}</button>`).join('')}</div>`; }
function resStudentSel(all){ const names=getAllKnownNames(); return `<select class="sm-field-input" onchange="resSetStudent(this.value)">${all?`<option value="">সবাই</option>`:''}${names.map(n=>`<option value="${escapeHtml(n)}"${n===res.student?' selected':''}>${escapeHtml(studentDisplayName(n))}</option>`).join('')}</select>`; }
function resRender(){
  const box=document.getElementById('resBox'); if(!box) return;
  if(!getAllKnownNames().length){ box.innerHTML=emptyState({icon:'chart',title:'কোনো শিক্ষার্থী নেই',body:'আগে শিক্ষার্থী যোগ করো, তারপর পরীক্ষার ফল লিখো।'}); return; }
  box.innerHTML=resChips()+(res.tab==='add'?resAddHtml():res.tab==='weak'?resWeakHtml():resReportHtml());
}
function resAddHtml(){
  const s=res.status, subs=resSubjectOpts(), E=escapeHtml, recent=resList().filter(r=>r.student===res.student).sort((a,b)=>a.date<b.date?1:-1).slice(0,8);
  return `<label class="sm-field-label">শিক্ষার্থী</label>${resStudentSel(false)}
  <datalist id="resSubj">${subs.map(x=>`<option value="${E(x)}">`).join('')}</datalist>
  <div class="qp-grid"><div><label class="sm-field-label">বিষয়</label><input class="sm-field-input" id="rs_subj" list="resSubj" placeholder="যেমন গণিত" oninput="resChapterList()"></div>
  <div><label class="sm-field-label">অধ্যায়/টপিক</label><input class="sm-field-input" id="rs_ch" list="resCh" placeholder="যেমন অনুপাত"><datalist id="resCh"></datalist></div>
  <div><label class="sm-field-label">পরীক্ষার নাম</label><input class="sm-field-input" id="rs_exam" placeholder="যেমন মাসিক পরীক্ষা"></div>
  <div><label class="sm-field-label">তারিখ</label><input type="date" class="sm-field-input" id="rs_date" value="${dateKeyStr(todayDateOnly())}"></div></div>
  <label class="sm-field-label">অবস্থা</label><div class="pct-chip-row">${Object.keys(RES_STATUS).map(k=>`<button type="button" class="pct-chip${s===k?' active':''}" onclick="resSetStatus('${k}')">${RES_STATUS[k]}</button>`).join('')}</div>
  ${s==='taken'?`<div class="qp-grid"><div><label class="sm-field-label">প্রাপ্ত নম্বর</label><input type="number" min="0" step="any" class="sm-field-input" id="rs_got" placeholder="শূন্য পেলে ০"></div><div><label class="sm-field-label">পূর্ণমান</label><input type="number" min="1" class="sm-field-input" id="rs_full" placeholder="যেমন ২৫"></div></div>`:`<div class="qp-note-small">${s==='absent'?'অনুপস্থিত — নম্বর গড়ে ধরা হবে না (শূন্য নম্বরের সঙ্গে গুলিয়ে ফেলা হয় না)।':'অসম্পূর্ণ (শেষ করেনি) — নম্বর গড়ে ধরা হবে না।'}</div>`}
  <label class="sm-field-label">মন্তব্য (ঐচ্ছিক)</label><input class="sm-field-input" id="rs_note">
  <div class="qp-actions"><button type="button" class="modal-btn primary" onclick="resSave()">সেভ করো</button></div>
  ${recent.length?`<div class="settings-section-title" style="margin-top:14px;">সাম্প্রতিক ফল</div>${recent.map(r=>{ const p=resPct(r); return `<div class="makeup-row"><span>${E(r.subject)}${r.chapter?' · '+E(r.chapter):''} <small style="color:var(--muted)">${E(r.exam||'')} · ${bnDateLabel(new Date(r.date+'T00:00:00'))}</small></span><span class="pay-history-amt">${p!==null?toBn(r.got)+'/'+toBn(r.full)+' ('+toBn(p)+'%)':RES_STATUS[r.status]} <button class="makeup-done" onclick="resDel('${r.id}')">🗑</button></span></div>`; }).join('')}`:''}`;
}
function resChapterList(){ const sj=document.getElementById('rs_subj'), dl=document.getElementById('resCh'); if(!sj||!dl) return; dl.innerHTML=resChapterOpts(sj.value.trim()).map(c=>`<option value="${escapeHtml(c)}">`).join(''); }
function resSave(){
  const v=id=>{ const e=document.getElementById(id); return e?e.value.trim():''; };
  const r={id:Date.now()+'_'+Math.random().toString(36).slice(2,7), student:res.student, subject:v('rs_subj'), chapter:v('rs_ch'), exam:v('rs_exam'), date:v('rs_date'), status:res.status, got:res.status==='taken'?v('rs_got'):null, full:res.status==='taken'?v('rs_full'):null, note:v('rs_note')};
  const err=resValidate(r); if(err){ showWarningToast(err); return; }
  if(res.status==='taken'){ r.got=Number(r.got); r.full=Number(r.full); }
  const list=resList(); if(resIsDup(list,r)){ showWarningToast('এই ফলটা আগেই লেখা আছে — দ্বিতীয়বার যোগ হয়নি।'); return; }
  list.push(r); if(!lsSet('tr_results',list)){ showWarningToast('সেভ হয়নি — স্টোরেজ ভরা থাকতে পারে।'); return; }
  showSuccessToast('ফল সেভ হয়েছে'); res.status='taken'; resRender();
}
function resDel(id){ const list=resList(), rm=list.find(x=>x.id===id); if(!rm) return; lsSet('tr_results', list.filter(x=>x.id!==id)); if(typeof tombAdd==='function') tombAdd('res', id); resRender(); showUndoToast('ফল মুছেছে', ()=>{ const l=resList(); l.push(rm); lsSet('tr_results',l); if(typeof tombClear==='function') tombClear('res', id); resRender(); }); }
function resPin(key, val){ const p=lsGet('tr_resultPins',{}); if(val) p[key]=val; else delete p[key]; lsSet('tr_resultPins',p); resRender(); }
function resPinBtn(key,val,label){ return `<button type="button" onclick="resPin(decodeURIComponent('${encodeURIComponent(key)}'),${val?`'${val}'`:'null'})">${label}</button>`; }
function resWeakHtml(){
  const cfg=resCfg(), pins=lsGet('tr_resultPins',{}), list=resWeakList(resList(),cfg,pins,res.filter), E=escapeHtml;
  const hidden=resList().length? [...new Set(resList().map(r=>r.student))].reduce((n,s)=>n+resStats(resList(),s,cfg,pins).filter(x=>x.dismissed).length,0):0;
  const col={weak:'#ff9d8a',watch:'#9ab4ff',practice:'#f2c85e'};
  return `<label class="sm-field-label">কার জন্য</label><select class="sm-field-input" onchange="res.filter=this.value;resRender()"><option value="">সবাই</option>${getAllKnownNames().map(n=>`<option value="${E(n)}"${n===res.filter?' selected':''}>${E(studentDisplayName(n))}</option>`).join('')}</select>
  ${list.length?list.map(s=>`<div class="qp-card"><div class="qp-ch"><b>${E(studentDisplayName(s.student))} — ${E(s.subject)}${s.chapter?' · '+E(s.chapter):''}</b><span style="color:${col[s.band]}">${RES_BAND_LABEL[s.band]}${s.avg!=null?' · '+toBn(s.avg)+'%':''}</span></div>
   <div class="qp-ex">${s.pcts.length?'শেষ ফল: '+s.pcts.map(p=>toBn(p)+'%').join(' → '):''}</div><div class="qp-qt" style="margin-top:4px;">${E(resExplain(s,toBn))}</div>
   <div class="qp-btns">${resPinBtn(s.key,'weak','🚩 দুর্বল ধরো')}${resPinBtn(s.key,'ok','👍 ঠিক আছে')}${resPinBtn(s.key,'dismiss','🙈 লুকাও')}${s.pinned?resPinBtn(s.key,null,'↩ রিসেট'):''}</div></div>`).join(''):`<div class="ins-empty" style="margin-top:10px;">${resList().length?'এখন কোনো দুর্বল বা পর্যবেক্ষণযোগ্য অধ্যায় নেই 🎉':'ফল যোগ করলে এখানে বিশ্লেষণ আসবে।'}</div>`}
  ${hidden?`<div class="qp-note-small">${toBn(hidden)}টা লুকানো আছে — "রিসেট" করতে সংশ্লিষ্ট ফল খুঁজে আবার দুর্বল/ঠিক আছে চাপো।</div>`:''}
  <details style="margin-top:12px;"><summary class="settings-btn" style="text-align:left;">⚙️ সীমা বদলাও (এখন: ${toBn(cfg.good)}%+ ভালো · ${toBn(cfg.practice)}–${toBn(cfg.good-1)}% অনুশীলন · নিচে পুনরায় শেখানো)</summary>
   <div class="qp-grid"><div><label class="sm-field-label">ভালো (%-এর ওপরে)</label><input type="number" class="sm-field-input" id="rc_good" value="${cfg.good}"></div><div><label class="sm-field-label">অনুশীলন (%-এর ওপরে)</label><input type="number" class="sm-field-input" id="rc_prac" value="${cfg.practice}"></div><div><label class="sm-field-label">শেষ কয়টা পরীক্ষার গড়</label><input type="number" min="1" max="6" class="sm-field-input" id="rc_last" value="${cfg.last}"></div></div>
   <div class="qp-actions"><button type="button" class="modal-btn secondary" onclick="resSaveCfg()">সংরক্ষণ</button></div></details>`;
}
function resSaveCfg(){ const c=resCfgFrom({good:document.getElementById('rc_good').value, practice:document.getElementById('rc_prac').value, last:document.getElementById('rc_last').value}); lsSet('tr_resultCfg',c); showSuccessToast('সীমা বদলেছে'); resRender(); }
function resMonthOpts(){ const o=[]; let mk=currentMonthKey(); for(let i=0;i<6;i++){ o.push(mk); mk=resPrevMonth(mk); } return o; }
function resBuildText(){ const name=res.student, pr=getStudentProfile(name)||{}, rep=resMonthReport(resList(), name, res.mk, getAttendanceMap(), resCfg(), lsGet('tr_resultPins',{}));
  return resReportText({display:studentDisplayName(name), klass:pr.klass||'', monthLabel:monthKeyLabel(res.mk), rep, teacher:getTeacherName(false), comment:res.comment, nf:toBn}); }
function resReportHtml(){
  const E=escapeHtml, txt=resBuildText();
  return `<label class="sm-field-label">শিক্ষার্থী</label>${resStudentSel(false)}<label class="sm-field-label">মাস</label><select class="sm-field-input" onchange="res.mk=this.value;res.approved=false;resRender()">${resMonthOpts().map(m=>`<option value="${m}"${m===res.mk?' selected':''}>${E(monthKeyLabel(m))}</option>`).join('')}</select>
  <label class="sm-field-label">শিক্ষকের মন্তব্য (ঐচ্ছিক)</label><input class="sm-field-input" value="${E(res.comment)}" onchange="res.comment=this.value;res.approved=false;resRender()">
  <label class="sm-field-label">প্রিভিউ (পাঠানোর আগে পড়ে নাও — দরকারে এখানেই বদলাও)</label><textarea class="sm-field-input" id="res_txt" rows="12" oninput="res.approved=false;resSyncApprove()">${E(txt)}</textarea>
  <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:var(--fs-sm);"><input type="checkbox" id="res_ok" onchange="res.approved=this.checked;resSyncApprove()"> পড়ে দেখেছি, শেয়ারের জন্য ঠিক আছে</label>
  <div class="qp-actions"><button type="button" class="modal-btn primary" id="res_cp" onclick="resShare('copy')" disabled>📋 কপি</button><button type="button" class="modal-btn primary" id="res_wa" onclick="resShare('wa')" disabled>💬 WhatsApp</button></div>
  <div class="qp-note-small">রিপোর্টে কোনো ফি/বকেয়ার তথ্য যায় না — শুধু উপস্থিতি, ফল ও পরিকল্পনা।</div>`;
}
function resSyncApprove(){ const ok=document.getElementById('res_ok'), on=!!(ok&&ok.checked); ['res_cp','res_wa'].forEach(i=>{ const b=document.getElementById(i); if(b) b.disabled=!on; }); }
function resShare(how){ const t=(document.getElementById('res_txt')||{}).value||''; if(!t.trim()||!res.approved) return; if(how==='copy') copyTextSmart(t,'রিপোর্ট কপি হয়েছে — WhatsApp-এ পেস্ট করো'); else { const pr=getStudentProfile(res.student)||{}; if(!(pr.guardianPhone||'').trim()) showWarningToast('অভিভাবকের ফোন সেভ করা নেই — নিজে কন্ট্যাক্ট বেছে নাও।'); openWhatsApp(pr.guardianPhone, t); } }
