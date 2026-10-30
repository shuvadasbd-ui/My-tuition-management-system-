/* ============ TIME / DAY HELPERS ============ */
function todayKeyIdx(){ return (new Date().getDay()+1)%7; }
function todayKey(){ return DAYS[todayKeyIdx()]; }
function nowMinutes(){ const d=new Date(); return d.getHours()*60+d.getMinutes()+d.getSeconds()/60; }

function bnClock(totalMin){
  totalMin = Math.max(0,totalMin);
  const h = Math.floor(totalMin/60), m = Math.floor(totalMin%60), s = Math.floor((totalMin*60)%60);
  if(h>0) return `${toBn(h)} ঘ ${toBn(m)} মি ${toBn(s)} সে`;
  if(m>0) return `${toBn(m)} মি ${toBn(s)} সে`;
  return `${toBn(s)} সেকেন্ড`;
}

/* ============ LIVE CLOCK + DAY PROGRESS ============ */
function bnTime12(d){
  let h=d.getHours(), m=d.getMinutes(), s=d.getSeconds();
  const ampm = h>=12 ? 'PM' : 'AM';
  h = h%12; if(h===0) h=12;
  return `${toBn(h)}:${toBn(String(m).padStart(2,'0'))}:${toBn(String(s).padStart(2,'0'))} ${ampm}`;
}
function renderLiveClock(){
  const el = document.getElementById('liveClock');
  if(!el) return;
  const nm = nowMinutes();
  let pct = Math.round(((nm-ARC_MIN)/(ARC_MAX-ARC_MIN))*100);
  pct = Math.max(0, Math.min(100, pct));
  el.innerHTML = `<span class="lc-time">${bnTime12(new Date())}</span><span class="lc-bar"><span class="lc-fill" style="width:${pct}%"></span></span><span class="lc-pct">${toBn(pct)}% দিন শেষ</span>`;
}

/* ============ DAY ARC ============ */
const ARC_P0=[40,120], ARC_P1=[500,-10], ARC_P2=[960,120];
function bezier(t,p0,p1,p2){
  const x=(1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t**2*p2[0];
  const y=(1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t**2*p2[1];
  return [x,y];
}
const ARC_MIN=370, ARC_MAX=1290, ARC_SPAN=ARC_MAX-ARC_MIN;

function renderArcStops(){
  const wrap = document.getElementById('arcStops');
  wrap.innerHTML='';
  const today = todayKey();
  SCHEDULE.forEach(slot=>{
    const mid=(slot.start+slot.end)/2;
    const t=Math.min(1,Math.max(0,(mid-ARC_MIN)/ARC_SPAN));
    const [x,y]=bezier(t,ARC_P0,ARC_P1,ARC_P2);
    const hasToday = getCellText(slot, today).trim()!=='';
    const anyClass = DAYS.some(d=>getCellText(slot, d).trim()!=='');
    const dot=document.createElement('div');
    dot.className='arc-stop'+(anyClass?'':' empty-stop');
    dot.style.left=(x/10)+'%'; dot.style.top=y+'px';
    dot.style.color=`var(--${slot.period})`; dot.style.background=`var(--${slot.period})`;
    if(hasToday){ dot.style.transform='translate(-50%,-50%) scale(1.25)'; }
    wrap.appendChild(dot);
  });
}

let arcPathLenCache=null;
function updateArcMarker(status){
  const marker=document.getElementById('arcMarker');
  if(!marker || !marker.offsetParent) return;   // arc is folded under "আরও দেখো" — skip the layout work
  const nm=nowMinutes();
  let t;
  if(nm<ARC_MIN) t=0; else if(nm>ARC_MAX) t=1; else t=(nm-ARC_MIN)/ARC_SPAN;
  const [x,y]=bezier(t,ARC_P0,ARC_P1,ARC_P2);
  marker.style.left=(x/10)+'%'; marker.style.top=y+'px';
  marker.className='arc-marker'+(status.mode==='live'?' live':(nm<ARC_MIN||nm>ARC_MAX?' off':''));

  const progressPath=document.getElementById('arcProgress'), glowPath=document.getElementById('arcGlow');
  if(progressPath && glowPath){
    if(arcPathLenCache===null) arcPathLenCache=progressPath.getTotalLength();
    const offset=arcPathLenCache*(1-t);
    progressPath.style.strokeDasharray=arcPathLenCache; progressPath.style.strokeDashoffset=offset;
    glowPath.style.strokeDasharray=arcPathLenCache; glowPath.style.strokeDashoffset=offset;
  }
}

/* ============ NEXT / LIVE STATUS ============ */
// Finds the first non-empty, non-cancelled slot strictly after (baseOffset days from today, minuteMark),
// searching forward across the week. baseOffset=0 means "today". Tracks the real calendar date at each
// step so date-specific off/cancel marks (not just recurring day-of-week) are respected.
function findForward(baseOffset, minuteMark, skipSlot){
  const todayIdx = todayKeyIdx();
  const base = todayDateOnly();
  {
    const idx=(todayIdx+baseOffset)%7; const day=DAYS[idx];
    const date=addDaysToDate(base, baseOffset);
    for(const slot of SCHEDULE){
      if(slot===skipSlot) continue;
      const val=effectiveContentForDate(slot, day, date);
      if(val && slot.start>minuteMark) return {slot, day, addDays:baseOffset, away:slot.start-minuteMark, date, val};
    }
  }
  for(let add=1; add<=7; add++){
    const totalOffset=baseOffset+add;
    const idx=(todayIdx+totalOffset)%7; const day=DAYS[idx];
    const date=addDaysToDate(base, totalOffset);
    for(const slot of SCHEDULE){
      if(slot===skipSlot) continue;
      const val=effectiveContentForDate(slot, day, date);
      if(val) return {slot, day, addDays:totalOffset, away: totalOffset*1440 - minuteMark + slot.start, date, val};
    }
  }
  return null;
}

function computeStatus(){
  const today=todayKey(); const nm=nowMinutes();
  const todayDate=todayDateOnly();
  for(const slot of SCHEDULE){
    const val=effectiveContentForDate(slot, today, todayDate);
    if(val && nm>=slot.start && nm<slot.end){
      const then = findForward(0, slot.end, slot);
      return {mode:'live', slot, day:today, frac:(nm-slot.start)/(slot.end-slot.start), remain:slot.end-nm, then, effVal:val};
    }
  }
  const found = findForward(0, nm, null);
  if(found){
    const then = findForward(found.addDays, found.slot.end, found.slot);
    return {mode:'next', slot:found.slot, day:found.day, away:found.away, then, addDays:found.addDays, date:found.date, effVal: found.val};
  }
  return {mode:'none'};
}

function renderClockSegments(totalMin){
  totalMin = Math.max(0,totalMin);
  const h=Math.floor(totalMin/60), m=Math.floor(totalMin%60), s=Math.floor((totalMin*60)%60);
  const seg=(val,unit)=>`<div class="seg-wrap"><div class="seg">${toBn(String(val).padStart(2,'0'))}</div><span class="unit">${unit}</span></div>`;
  let html='';
  if(h>0) html += seg(h,'ঘণ্টা') + '<span class="colon">:</span>';
  html += seg(m,'মিনিট') + '<span class="colon">:</span>';
  html += seg(s,'সেকেন্ড');
  return html;
}

function thenText(then){
  if(!then) return null;
  const dayTxt = then.addDays===0 ? 'আজই' : (then.addDays===1 ? 'আগামীকাল' : DAY_BN_FULL[then.day]);
  return `<span class="then-icon">${PERIOD_ICON[then.slot.period]}</span> তারপর <b>${then.val}</b> — ${dayTxt}, ${then.slot.label}`;
}

function renderNextPanel(){
  const status=computeStatus();
  const panel=document.getElementById('nextPanel');
  const ring=document.getElementById('npRing'), ringInner=document.getElementById('npRingInner'),
        label=document.getElementById('npLabel'), title=document.getElementById('npTitle'),
        sub=document.getElementById('npSub'), clock=document.getElementById('npClock'),
        thenBox=document.getElementById('npThen');

  const isDoneForToday = status.mode==='next' && status.addDays>=1;

  if(status.mode==='live'){
    const tint = getComputedStyle(document.documentElement).getPropertyValue('--'+status.slot.period).trim();
    panel.style.setProperty('--np-tint', tint);
    ring.classList.add('is-live');
    ring.style.background = `conic-gradient(${tint} ${status.frac*100}%, var(--ov009) 0)`;
    ringInner.textContent='🔴';
    label.textContent='এখন চলছে · '+DAY_BN_FULL[status.day];
    title.innerHTML = `<b>${status.effVal}</b>`;
    sub.textContent = status.slot.label+' · শেষ হতে বাকি';
    clock.style.display='flex'; clock.innerHTML = renderClockSegments(status.remain);
  } else if(isDoneForToday){
    panel.style.setProperty('--np-tint', 'var(--night)');
    ring.classList.remove('is-live');
    ring.style.background = `var(--ov009)`;
    ringInner.textContent='🌙';
    label.textContent='আজকের ক্লাস শেষ · ভালো করেছ';
    title.innerHTML = `পরবর্তী: <b>${status.effVal}</b>`;
    sub.textContent = (status.addDays===1?'কাল':DAY_BN_FULL[status.day])+', '+status.slot.label;
    clock.style.display='none';
  } else if(status.mode==='next'){
    const tint = getComputedStyle(document.documentElement).getPropertyValue('--'+status.slot.period).trim();
    panel.style.setProperty('--np-tint', tint);
    ring.classList.remove('is-live');
    ring.style.background = `conic-gradient(${tint}55 100%, var(--ov009) 0)`;
    ringInner.textContent = PERIOD_ICON[status.slot.period];
    label.textContent = 'পরবর্তী ক্লাস · আজ';
    title.innerHTML = `<b>${status.effVal}</b>`;
    sub.textContent = status.slot.label+' · শুরু হতে বাকি';
    clock.style.display='flex'; clock.innerHTML = renderClockSegments(status.away);
  } else {
    panel.style.setProperty('--np-tint', 'var(--night)');
    ring.classList.remove('is-live');
    ring.style.background = `var(--ov009)`;
    ringInner.textContent='🌙';
    label.textContent='এই সপ্তাহে আর কোনো ক্লাস নেই';
    title.textContent='—'; sub.textContent=''; clock.style.display='none';
  }

  const tt = (status.mode!=='none' && !isDoneForToday) ? thenText(status.then) : null;
  if(tt){ thenBox.style.display='flex'; thenBox.innerHTML = tt; }
  else{ thenBox.style.display='none'; }

  updateArcMarker(status);
}


/* ============ FOCUS / MOTIVATION PANEL ============ */
/* ---- 60-day Booster Pack (booster-data.js): one day's 7 lines, cycling every 60 days. ---- */
/* Home shows Booster + 3 main lines; "আজকের Growth" expands the other 3. */
const BOOSTER_LABELS = ['🔥 Booster','🧠 মানসিক দৃঢ়তা','🎯 ফোকাস','👨‍🏫 শিক্ষক-মাইন্ডসেট','⚡ অ্যাকশন','🌙 রিফ্লেকশন','💡 নীতি'];
// order inside a day: 0 Booster, 1 মানসিক দৃঢ়তা, 2 Focus, 3 Teacher, 4 Action, 5 Reflection, 6 Principle
const BOOSTER_MAIN=[1,2,4], BOOSTER_GROWTH=[3,5,6];
let boosterOffset=0, boosterGrowthOpen=false, boosterDaysCache=null;
function boosterDays(){
  if(boosterDaysCache) return boosterDaysCache;
  const raw=(window.BOOSTER_PACK||'').trim();
  const days=raw ? raw.split(/\n\s*\n/).map(b=>b.split('\n').map(l=>l.trim()).filter(Boolean)).filter(d=>d.length===7) : [];
  boosterDaysCache=days; return days;
}
function boosterDayNumber(){
  const days=boosterDays(); if(!days.length) return 0;
  let start=lsGet('tr_boosterStart', null);
  if(!start){ start=dateKeyStr(todayDateOnly()); lsSet('tr_boosterStart', start); }
  const [y,m,d]=String(start).split('-').map(Number);
  const t=todayDateOnly();
  const diff=Math.round((Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())-Date.UTC(y||1970,(m||1)-1,d||1))/86400000);
  return ((((diff+boosterOffset)%days.length)+days.length)%days.length);
}
function boosterShift(n){ boosterOffset+=n; renderBooster(); }
function boosterToday(){ boosterOffset=0; renderBooster(); }
function toggleGrowth(){ boosterGrowthOpen=!boosterGrowthOpen; renderBooster(); }
function restartBoosterPack(){
  if(!confirm('৬০ দিনের প্যাক আজ থেকে Day 01 থেকে শুরু করবে?')) return;
  lsSet('tr_boosterStart', dateKeyStr(todayDateOnly())); boosterOffset=0; renderBooster();
}
function renderBooster(){
  const q=document.getElementById('fcQuote'); if(!q) return;
  const days=boosterDays();
  const dayEl=document.getElementById('fcDay'), rowsEl=document.getElementById('fcRows'), gBtn=document.getElementById('fcGrowthBtn'), gEl=document.getElementById('fcGrowth');
  if(!days.length){ q.textContent=''; dayEl.innerHTML=''; rowsEl.innerHTML=''; gBtn.style.display='none'; gEl.style.display='none'; return; }
  const idx=boosterDayNumber(), day=days[idx];
  q.textContent=day[0];
  dayEl.innerHTML=`<button type="button" class="fc-nav" onclick="boosterShift(-1)" aria-label="আগের দিন">‹</button>
    <span class="fc-daylabel" onclick="boosterToday()">Day ${toBn(String(idx+1).padStart(2,'0'))} / ${toBn(days.length)}${boosterOffset?' · আজকে ফিরতে চাপো':''}</span>
    <button type="button" class="fc-nav" onclick="boosterShift(1)" aria-label="পরের দিন">›</button>
    <button type="button" class="fc-nav fc-restart" onclick="restartBoosterPack()" aria-label="আবার প্রথম থেকে" title="আবার প্রথম থেকে">↺</button>`;
  const row=i=>`<div class="fc-row"><span class="fc-row-tag">${BOOSTER_LABELS[i]}</span><span class="fc-row-text">${escapeHtml(day[i])}</span></div>`;
  rowsEl.innerHTML=BOOSTER_MAIN.map(row).join('');
  gBtn.style.display=''; gBtn.textContent=boosterGrowthOpen?'আজকের Growth ▴':'আজকের Growth ▾';
  gBtn.setAttribute('aria-expanded', boosterGrowthOpen?'true':'false');
  gEl.style.display=boosterGrowthOpen?'':'none';
  gEl.innerHTML=BOOSTER_GROWTH.map(row).join('');
}

function renderFocusCard(){
  const today = todayKey();
  const nm = nowMinutes();
  renderBooster();

  let classCount=0, remaining=0;
  const students=new Set();
  const todayDate = todayDateOnly();
  SCHEDULE.forEach(slot=>{
    const val=effectiveContentForDate(slot, today, todayDate);
    if(val){
      classCount++;
      val.split(',').map(s=>s.trim()).filter(Boolean).forEach(n=>students.add(n));
      if(slot.end>nm) remaining++;
    }
  });

  document.getElementById('fcStats').innerHTML = `
    <div class="fc-stat"><span class="fc-stat-n">${toBn(classCount)}</span><span class="fc-stat-l">আজকের ক্লাস</span></div>
    <div class="fc-stat"><span class="fc-stat-n">${toBn(students.size)}</span><span class="fc-stat-l">শিক্ষার্থী</span></div>
    <div class="fc-stat"><span class="fc-stat-n">${toBn(remaining)}</span><span class="fc-stat-l">বাকি আছে</span></div>`;

  let weekMin=0;
  DAYS.forEach(d=>{ SCHEDULE.forEach(slot=>{ if(getCellText(slot,d).trim()) weekMin += (slot.end-slot.start); }); });
  const weekHrs = Math.round(weekMin/6)/10;
  document.getElementById('fcFoot').textContent = `এই সপ্তাহে মোট ${toBn(weekHrs)} ঘণ্টা পড়াচ্ছ`;
}

/* ============ PERSONAL "WHY" LINE ============ */
function renderWhy(){
  const el = document.getElementById('fcWhy');
  if(WHY_I_TEACH.trim()){ el.style.display='block'; el.textContent = '✦ '+WHY_I_TEACH.trim(); }
  else { el.style.display='none'; }
}

/* ============ DAY TABS + DAY VIEW ============ */
let activeDay = todayKey();
let highlightedName = null;
let lastKnownToday = todayKey();
let editMode = true; /* PIN system removed — the app is always directly editable now */
let financeUnlocked = false; /* session-only: resets to hidden every time the app is (re)opened */
let noteModalCtx = null;

/* ============ TAB NAVIGATION ============ */
const TAB_IDS = {home:'pageHome', schedule:'pageSchedule', students:'pageStudents', reports:'pageReports', khata:'pageKhata', settings:'pageSettings'};
const NAV_IDS = {home:'navHome', schedule:'navSchedule', students:'navStudents', reports:'navReports', khata:'navKhata', settings:'navSettings'};
let activeTab='home';
function toggleTopMenu(e){ if(e) e.stopPropagation(); const m=document.getElementById('topMenu'); if(!m) return; m.classList.contains('on')?closeTopMenu():openTopMenu(); }
function openTopMenu(){ const m=document.getElementById('topMenu'), o=document.getElementById('topMenuOv'), b=document.getElementById('topMenuBtn'); if(!m) return;
  m.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('cur',x.dataset.tab===activeTab)); m.classList.add('on'); o.classList.add('on'); if(b) b.setAttribute('aria-expanded','true'); }
function closeTopMenu(){ const m=document.getElementById('topMenu'), o=document.getElementById('topMenuOv'), b=document.getElementById('topMenuBtn'); if(m) m.classList.remove('on'); if(o) o.classList.remove('on'); if(b) b.setAttribute('aria-expanded','false'); }
function topMenuGo(t){ closeTopMenu(); switchTab(t); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeTopMenu(); });
const TAB_ORDER=['home','schedule','students','khata'];
function switchTab(tab){ if(tab!=='khata') khataUnlocked=false;
  if(!TAB_IDS[tab]) return;
  const from=TAB_ORDER.indexOf(activeTab), to=TAB_ORDER.indexOf(tab), dx=(from<0||to<0||from===to)?0:(to>from?18:-18);   // আগের ট্যাবের দিক থেকে স্লাইড
  const pg=document.getElementById(TAB_IDS[tab]); if(pg) pg.style.setProperty('--tab-dx',dx+'px');
  activeTab=tab;
  Object.keys(TAB_IDS).forEach(t=>{
    const page=document.getElementById(TAB_IDS[t]), nav=document.getElementById(NAV_IDS[t]);
    if(page) page.style.display = (t===tab) ? 'block' : 'none';
    if(nav) nav.classList.toggle('active', t===tab);
  });
  closeTopMenu(); const mb=document.getElementById('topMenuBtn'); if(mb) mb.classList.toggle('on', tab==='reports'||tab==='settings');
  if(tab==='students') renderStudentsTab();
  if(tab==='reports') renderInsights();
  if(tab==='khata') renderKhataTab();
  if(tab==='settings') renderSettingsTab();
  if(tab==='home'){ try{ renderHomeLive(); }catch(e){} }   // হোমে ফিরলেই তাজা ঘড়ি/লিস্ট
  window.scrollTo(0,0);
  moveNavInd();
}

/* ============ HOME: greeting + KPI cards + today's list ============ */
function greetingWord(h){
  if(h<12) return 'শুভ সকাল';
  if(h<16) return 'শুভ দুপুর';
  if(h<19) return 'শুভ বিকাল';
  if(h<22) return 'শুভ সন্ধ্যা';
  return 'শুভ রাত্রি';
}
function renderHomeGreet(){
  const el=document.getElementById('homeGreet');
  if(!el) return;
  const now=new Date();
  const streak = computeTeachingStreak();
  const streakHtml = streak>=2 ? `<span class="streak-badge">🔥 ${toBn(streak)} দিনের এন্ট্রি স্ট্রিক</span>` : '';
  el.innerHTML = `<div class="home-greet-hi">${greetingWord(now.getHours())}, শুভ 👋 ${streakHtml}</div>
    <div class="home-greet-date">${DAY_BN_FULL[todayKey()]}, ${bnDateLabel(todayDateOnly())}</div>`;
}
function renderKPIRow(){
  const el=document.getElementById('kpiRow');
  if(!el) return;
  const today=todayKey(), todayDate=todayDateOnly(), nm=nowMinutes();
  let classCount=0, todayMin=0, remaining=0;
  SCHEDULE.forEach(slot=>{
    const val=effectiveContentForDate(slot, today, todayDate);
    if(val){ classCount++; todayMin+=(slot.end-slot.start); if(slot.end>nm) remaining++; }
  });
  const totalStudents=getAllKnownNames().length;
  el.innerHTML = `
    <div class="kpi-card"><span class="kpi-n">${toBn(classCount)}</span><span class="kpi-l">আজকের ক্লাস</span></div>
    <div class="kpi-card"><span class="kpi-n">${toBn(totalStudents)}</span><span class="kpi-l">মোট শিক্ষার্থী</span></div>
    <div class="kpi-card"><span class="kpi-n">${toBn(Math.round(todayMin/6)/10)}</span><span class="kpi-l">আজ ঘণ্টা</span></div>
    <div class="kpi-card"><span class="kpi-n">${toBn(remaining)}</span><span class="kpi-l">বাকি আছে</span></div>`;
}
function renderTodayList(){
  const el=document.getElementById('todayList');
  if(!el) return;
  const today=todayKey(), todayDate=todayDateOnly(), nm=nowMinutes();
  const status=computeStatus();
  let html='';
  SCHEDULE.forEach(slot=>{
    const baseVal=getCellText(slot,today).trim();
    const movedFrom=getMoveFrom(todayDate, slot.num);
    const cancelled = !!baseVal && !movedFrom && isOffOn(todayDate, slot.num);
    const effVal=effectiveContentForDate(slot, today, todayDate);
    const displayName = effVal || (slot.activity ? `${slot.activityIcon} ${slot.activityLabel}` : ((cancelled||movedFrom) ? baseVal : ''));
    if(!displayName) return;
    const isLive = status.mode==='live' && status.day===today && status.slot===slot;
    let pillClass='', pillText='';
    if(movedFrom){ pillClass='st-moved'; pillText=`<span class="ic">${ICN.swap}</span> সরানো`; }
    else if(cancelled){ pillClass='st-off'; pillText='⚫ বাতিল'; }
    else if(isLive){ pillClass='st-live'; pillText='🔴 এখন চলছে'; }
    else if(effVal && slot.end<=nm){ pillClass='st-done'; pillText='🟢 সম্পন্ন'; }
    else if(effVal){ pillClass='st-upcoming'; pillText='🔵 সামনে'; }
    const swipeable = !!effVal || cancelled;
    html += `<div class="swipe-wrap${swipeable?'':' no-swipe'}" data-slot="${slot.num}">
      <div class="swipe-bg"><span class="sb-l">✅ সবাই উপস্থিত</span><span class="sb-r">${cancelled?'↩️ বাতিল তুলে নাও':'⚫ বাতিল করো'}</span></div>
      <div class="today-row${isLive?' is-live':''}">
      <div class="today-time">${slot.label}</div>
      <div class="today-name">${escapeHtml(displayName)}</div>
      ${pillText?`<div class="today-pill ${pillClass}">${pillText}</div>`:''}
    </div></div>`;
  });
  const hint = (html && !lsGet('tr_swipeHintSeen', false)) ? `<div class="swipe-hint">👉 ক্লাস কার্ড ডানে টানলে "সবাই উপস্থিত", বামে টানলে "বাতিল"</div>` : '';
  el.innerHTML = html ? (hint+html) : `<div class="empty-state"><svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M42 10a22 22 0 1 0 12 30A18 18 0 0 1 42 10z"/><path d="M14 14l1.6 3.4L19 19l-3.4 1.6L14 24l-1.6-3.4L9 19l3.4-1.6z"/></svg><div class="es-t">আজ কোনো ক্লাস নেই</div><div class="es-s">একটু বিশ্রাম নাও — কাল আবার নতুন উদ্যমে 🌿</div></div>`;
}

/* ============ SWIPE ACTIONS on today's class cards: → everyone present, ← cancel / un-cancel (both undoable) ============ */
function swipeMarkPresent(slotNum){
  const d=todayDateOnly(), slot=SCHEDULE.find(x=>x.num===slotNum); if(!slot) return;
  if(isOffOn(d,slotNum)){ showWarningToast('ক্লাসটা বাতিল করা আছে — আগে বাতিল তুলে নাও।'); return; }
  if(slot.start>nowMinutes()){ showWarningToast('ক্লাস এখনো শুরু হয়নি।'); return; }
  const val=effectiveContentForDate(slot,todayKey(),d).trim(); if(!val) return;
  const names=val.split(',').map(x=>x.trim()).filter(Boolean);
  const todo=names.filter(n=>!getAttendance(d,slotNum,n));
  if(!todo.length){ showSuccessToast('সবার হাজিরা আগেই দেওয়া আছে'); return; }
  const prev=JSON.stringify(getAttendanceMap());
  todo.forEach(n=>setAttendance(d,slotNum,n,'present'));
  document.getElementById('wrapUpBox') && (document.getElementById('wrapUpBox').dataset.key='');
  renderAll();
  showUndoToast(`${slot.label} — ${toBn(todo.length)} জন উপস্থিত`, ()=>{ lsSet('tr_attendance', JSON.parse(prev)); document.getElementById('wrapUpBox') && (document.getElementById('wrapUpBox').dataset.key=''); renderAll(); });
}
function swipeToggleCancel(slotNum){
  const d=todayDateOnly(), slot=SCHEDULE.find(x=>x.num===slotNum); if(!slot) return;
  if(isDayFullyOff(d)){ showWarningToast('আজ পুরো দিনই ছুটি দেওয়া আছে।'); return; }
  if(getMoveFrom(d,slotNum)){ showWarningToast('এই ক্লাস অন্য সময়ে সরানো আছে।'); return; }
  const was=isOffOn(d,slotNum);
  toggleSlotOff(d,slotNum); renderAll();
  showUndoToast(was?`${slot.label} — বাতিল তুলে নেওয়া হয়েছে`:`${slot.label} — ক্লাস বাতিল হয়েছে`, ()=>{ toggleSlotOff(d,slotNum); renderAll(); });
}
(function setupSwipe(){
  const THRESH=84, MAX=130;
  let st=null;
  function vib(ms){ try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} }
  document.addEventListener('pointerdown', e=>{
    const wrap=e.target.closest && e.target.closest('#todayList .swipe-wrap'); 
    if(!wrap || wrap.classList.contains('no-swipe')) return;
    if(e.pointerType==='mouse' && e.button!==0) return;
    st={wrap, row:wrap.querySelector('.today-row'), x:e.clientX, y:e.clientY, dx:0, locked:null, fired:false, id:e.pointerId};
  });
  document.addEventListener('pointermove', e=>{
    if(!st || e.pointerId!==st.id) return;
    const dx=e.clientX-st.x, dy=e.clientY-st.y;
    if(st.locked===null){
      if(Math.abs(dx)<8 && Math.abs(dy)<8) return;
      st.locked = Math.abs(dx)>Math.abs(dy)*1.4 ? 'h' : 'v';
      if(st.locked==='h'){ st.wrap.classList.add('dragging'); try{ st.wrap.setPointerCapture(e.pointerId); }catch(_){} }
    }
    if(st.locked!=='h') return;
    st.dx=Math.max(-MAX, Math.min(MAX, dx));
    st.row.style.transform=`translateX(${st.dx}px)`;
    const p=Math.min(1, Math.abs(st.dx)/THRESH);
    st.wrap.style.setProperty('--p', p.toFixed(2));
    st.wrap.classList.toggle('swp-right', st.dx>0);
    st.wrap.classList.toggle('swp-left', st.dx<0);
    const ready=Math.abs(st.dx)>=THRESH;
    if(ready && !st.fired){ st.fired=true; vib(12); } else if(!ready && st.fired){ st.fired=false; }
    st.wrap.classList.toggle('swp-ready', ready);
  });
  function end(e){
    if(!st || (e && e.pointerId!==st.id)) return;
    const s=st; st=null;
    if(s.locked!=='h') return;
    const go = Math.abs(s.dx)>=THRESH, dir = s.dx>0 ? 'right' : 'left', slotNum=s.wrap.dataset.slot;
    s.wrap.classList.remove('dragging','swp-ready','swp-right','swp-left');
    s.row.style.transform=''; s.wrap.style.removeProperty('--p');
    s.wrap.dataset.swiped='1'; setTimeout(()=>{ delete s.wrap.dataset.swiped; },300);
    if(go){
      lsSet('tr_swipeHintSeen', true);
      if(dir==='right') swipeMarkPresent(slotNum); else swipeToggleCancel(slotNum);
    }
  }
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

