/* ============ WEEKLY SUMMARY CARD (Reports): last 7 days at a glance + a plain-language takeaway + next-month forecast ============ */
function computeWeekSummary(){
  const d=todayDateOnly(), days=[...Array(7)].map((_,i)=>dateKeyStr(addDaysToDate(d,-i)));
  const att=getAttendanceMap(), held=new Set(), absBy={}; let present=0, absent=0;
  Object.keys(att).forEach(k=>{
    const p=k.split('|'); if(!days.includes(p[0])) return; const st=att[k], name=p.slice(2).join('|');
    if(st==='present'||st==='late'){ present++; held.add(p[0]+'|'+p[1]); }
    else if(st==='absent'){ absent++; absBy[name]=(absBy[name]||0)+1; }
  });
  const notes=getNotes(); let noteCount=0;
  Object.keys(notes).forEach(k=>{ if(days.includes(k.split('|')[0]) && notes[k] && Array.isArray(notes[k].entries)) noteCount+=notes[k].entries.length; });
  const pays=getPaymentsData(), mk=currentMonthKey(); let collected=0, forecast=0, dueCount=0;
  Object.keys(pays).forEach(n=>{
    const sp=getStudentPayment(n); const effFee=feeEffective(n,mk); forecast+=effFee;
    sp.payments.forEach(p=>{ if(days.includes(p.date)) collected+=(p.amount||0); });
    if(effFee>0 && getStudentPaidForMonth(n,mk) < effFee) dueCount++;
  });
  const rate = (present+absent) ? Math.round(present/(present+absent)*100) : null;
  const topAbs = Object.keys(absBy).sort((a,b)=>absBy[b]-absBy[a])[0];
  return {classes:held.size, rate, noteCount, collected, forecast, dueCount, topAbs, topAbsN: topAbs?absBy[topAbs]:0};
}
function weekTakeaway(w){
  if(!w.classes && !w.noteCount) return 'এই সপ্তাহে এখনো কোনো রেকর্ড নেই — ক্লাস শেষে হাজিরা দিলেই এখানে সারাংশ দেখা যাবে।';
  if(w.topAbs && w.topAbsN>=2) return `⚠️ ${w.topAbs} এই সপ্তাহে ${toBn(w.topAbsN)} দিন অনুপস্থিত — একবার খোঁজ নেওয়া ভালো।`;
  if(w.rate!==null && w.rate>=90) return `🌟 দারুণ সপ্তাহ! হাজিরা ${toBn(w.rate)}% — এভাবেই চলুক।`;
  if(w.dueCount>0) return `💬 ${toBn(w.dueCount)} জনের এই মাসের ফি এখনো বাকি।`;
  return '✅ সপ্তাহটা ভালোভাবেই যাচ্ছে।';
}
function renderWeeklySummary(){
  const w=computeWeekSummary(), hide=isFinanceHidden(), m=v=>hide?'৳ ••••':bnTaka(v);
  const tile=(n,l)=>`<div class="wk-tile"><b>${n}</b><span>${l}</span></div>`;
  return `<div class="wk-card"><div class="wk-head">📊 গত ৭ দিনের সারাংশ</div>
    <div class="wk-grid">${tile(toBn(w.classes),'ক্লাস নিয়েছ')}${tile(w.rate===null?'—':toBn(w.rate)+'%','হাজিরার হার')}${tile(toBn(w.noteCount),'নোট লেখা')}${tile(m(w.collected),'সংগ্রহ হয়েছে')}</div>
    <div class="wk-take">${weekTakeaway(w)}</div>
    ${w.forecast>0?`<div class="wk-fc">🔮 আগামী মাসে আনুমানিক আয় <b>${m(w.forecast)}</b></div>`:''}</div>`;
}

function renderInsights(){
  const body=document.getElementById('reportsBody');
  if(!body) return;
  const ins=computeMonthlyInsights();
  const alerts = computePatternAlerts();
  const makeups = getMakeups();
  const attSummary = computeAttendanceSummary();
  const mk = currentMonthKey();
  const income = computeMonthlyIncomeStats(mk);
  const alertsHtml = alerts.length ? `<div class="ins-alerts">${alerts.map(a=>`<div class="ins-alert">🔍 ${a}</div>`).join('')}</div>` : '';
  const makeupsHtml = makeups.length ? `<div class="ins-makeups">
      <div class="ins-makeups-title">📌 বকেয়া মেকআপ ক্লাস</div>
      ${makeups.map(m=>`<div class="makeup-row"><span>${escapeHtml(m.name)} — ${m.slotLabel} (${bnDateLabel(new Date(m.date+'T00:00:00'))})</span><button class="makeup-done" onclick="resolveMakeup('${m.id}')">✓ হয়ে গেছে</button></div>`).join('')}
    </div>` : `<div class="ins-empty">এই মুহূর্তে কোনো বকেয়া মেকআপ ক্লাস নেই।</div>`;
  const attNames = Object.keys(attSummary).sort((a,b)=>attSummary[b].total-attSummary[a].total);
  const attHtml = attNames.length ? attNames.map(n=>{
    const s=attSummary[n];
    return `<div class="att-summary-row">
      <span class="att-summary-name">${escapeHtml(n)}</span>
      <span class="att-summary-detail">🟢${toBn(s.present||0)} 🔴${toBn(s.absent||0)} 🟡${toBn(s.late||0)} 🔵${toBn(s.resched||0)}</span>
      <span class="att-summary-pct">${toBn(s.pct)}%</span>
      <div class="att-bar"><i class="${s.pct>=85?'good':(s.pct<70?'low':'')}" style="width:${Math.max(0,Math.min(100,s.pct))}%"></i></div>
    </div>`;
  }).join('') : `<div class="ins-empty">এখনো কোনো উপস্থিতি নেওয়া হয়নি — Day View-তে <span class="ic">${ICN.note}</span> চেপে শুরু করো।</div>`;

  const dueStudents = getAllKnownNames()
    .map(n=>{ const {due,late}=getStudentDueWithLateFee(n, mk); return {name:n, due, late}; })
    .filter(x=>x.due>0)
    .sort((a,b)=>b.due-a.due);
  const totalDueAllIn = dueStudents.reduce((s,x)=>s+x.due,0);
  const hasFinanceData = income.totalExpected>0 || totalDueAllIn>0;
  const incomeHtml = hasFinanceData ? `
    <div class="ins-row"><span class="ins-n" style="font-size:14px;">${bnTaka(income.totalExpected)}</span><span class="ins-l">এই মাসের মোট প্রত্যাশিত আয়</span></div>
    <div class="ins-row"><span class="ins-n" style="font-size:14px;">${bnTaka(income.totalPaid)}</span><span class="ins-l">পরিশোধিত হয়েছে</span></div>
    <div class="ins-row"><span class="ins-n" style="font-size:14px;color:${income.totalDue>0?'#ffb3a0':'var(--gold)'};">${bnTaka(income.totalDue)}</span><span class="ins-l">এই মাসের বাকি</span></div>
    <div class="ins-row"><span class="ins-n" style="font-size:14px;color:${totalDueAllIn>0?'var(--due)':'var(--paid)'};">${bnTaka(totalDueAllIn)}</span><span class="ins-l">সর্বমোট বকেয়া (আগের বকেয়া + লেট ফি সহ)</span></div>
  ` : `<div class="ins-empty">এখনো কোনো ছাত্রের মাসিক ফি নির্ধারণ করা হয়নি — শিক্ষার্থী প্রোফাইল থেকে যোগ করো।</div>`;
  const dueHtml = dueStudents.length ? dueStudents.map(s=>`
    <div class="makeup-row"><span>${escapeHtml(s.name)}${s.late?' <span class="target-overdue" style="font-size:9px;padding:2px 5px;border-radius:6px;">লেট ফি সহ</span>':''}</span><span class="pay-history-amt">${bnTaka(s.due)}</span></div>
  `).join('') : (hasFinanceData ? `<div class="ins-empty">এই মাসে কারো পেমেন্ট বাকি নেই। 🎉</div>` : '');

  const financeLockBannerHtml = isFinanceHidden()
    ? `<div class="settings-row" style="background:rgba(230,194,122,0.06);border:1px dashed rgba(230,194,122,0.3);"><span style="font-size:11.5px;color:var(--gold);">🙈 আর্থিক হিসাব লুকানো আছে</span><button class="pct-chip" style="margin-left:8px;" onclick="unlockFinance()">🔓 দেখাও</button></div>`
    : (lsGet('tr_hideFinance', true) ? `<div class="settings-row" style="display:flex;justify-content:flex-end;"><button class="pct-chip" onclick="lockFinanceAgain()">🙈 আবার লুকাও</button></div>` : '');

  const hws=homeworkStats();
  const hwStatsHtml = hws.length ? `<div class="settings-section-title">📌 হোমওয়ার্ক করার হার</div><div class="settings-row">${hws.map(x=>`<div class="att-summary-row"><span class="att-summary-name">${escapeHtml(x.name)}</span><span class="att-summary-pct">${toBn(x.pct)}%</span><div class="att-bar"><i class="${x.pct>=80?'good':(x.pct<50?'low':'')}" style="width:${x.pct}%"></i></div></div>`).join('')}</div>` : '';
  const incPct = income.totalExpected>0 ? Math.min(100, Math.round(income.totalPaid/income.totalExpected*100)) : 0;
  const incomeHeroHtml = hasFinanceData && income.totalExpected>0 ? `<div class="inc-hero">
      <div class="inc-hero-top"><div><div class="inc-hero-n">${bnTaka(income.totalPaid)}</div><div class="inc-hero-l">এই মাসে পাওয়া গেছে</div></div>${isFinanceHidden()?'':`<div class="inc-hero-pct">${toBn(incPct)}%</div>`}</div>
      ${isFinanceHidden()?'':`<div class="inc-bar"><i style="width:${incPct}%"></i></div>`}
      <div class="inc-hero-sub" style="${isFinanceHidden()?'margin-top:10px;':''}"><span>প্রত্যাশিত <b>${bnTaka(income.totalExpected)}</b></span><span>বাকি <b>${bnTaka(income.totalDue)}</b></span></div>
    </div>` : '';
  body.innerHTML = `
    ${financeLockBannerHtml}
    ${renderWeeklySummary()}
    ${radarCardHtml()}
    ${smartHubHtml()}
    <div class="kpi-grid">
      <div class="kpi-tile"><b>${toBn(ins.monthHrs)}</b><span>ঘণ্টা এই মাসে পড়ানো</span></div>
      <div class="kpi-tile" style="animation-delay:40ms"><b>${toBn(ins.streak)}</b><span>দিনের টানা streak</span></div>
      <div class="kpi-tile" style="animation-delay:80ms"><b class="sm">${DAY_BN_FULL[ins.busiestDay]}</b><span>সবচেয়ে ব্যস্ত দিন · ${toBn(ins.busiestHrs)} ঘণ্টা</span></div>
    </div>
    ${hwStatsHtml}
    <div class="settings-section-title">✅ এই সপ্তাহের ক্লাস স্ট্যাটাস</div>
    <div class="settings-row">${renderWeekStatusBar()}</div>
    <div class="settings-section-title">📅 আসন্ন ডেডলাইন</div>
    <div class="settings-row">${renderUpcomingDeadlines()}</div>
    ${alertsHtml ? `<div class="settings-section-title">🔍 প্যাটার্ন সতর্কতা</div><div class="settings-row">${alertsHtml}</div>` : ''}
    <div class="settings-section-title">💰 এই মাসের আয় (${monthKeyLabel(mk)})</div>
    ${incomeHeroHtml}
    <div class="settings-row">${incomeHtml}</div>
    <div class="settings-section-title">💳 পেমেন্ট মাধ্যম অনুযায়ী (${monthKeyLabel(mk)})</div>
    <div class="settings-row">${renderPaymentMethodBreakdown(mk)}</div>
    <div class="settings-section-title">🧾 খরচ ও নিট লাভ (${monthKeyLabel(mk)})</div>
    <div class="settings-row">${renderExpenseSection(mk)}</div>
    <div class="settings-section-title">📈 আয়ের ট্রেন্ড (৬ মাস)</div>
    <div class="settings-row">${renderRevenueChart()}</div>
    ${dueHtml ? `<div class="settings-section-title">🔴 পেমেন্ট বাকি শিক্ষার্থী</div><div class="settings-row">${dueHtml}</div>` : ''}
    <div class="settings-section-title">🎯 উপস্থিতির হার</div>
    <div class="settings-row">${attHtml}</div>
    <div class="settings-section-title">📌 মেকআপ ক্লাস</div>
    <div class="settings-row">${makeupsHtml}</div>`;
}

/* ---- Notifications: fires immediately while the app/tab is open, AND in the background via real ---- */
/* Web Push once the server functions are deployed (see netlify/functions/send-reminders.js) ---- */
const VAPID_PUBLIC_KEY = 'BP5YXlSav4wnHsKl4sy3WYTmDaxnc69LyhEQpVRwv8B6uWEWjJgSQAYKYIMXiZula1WV5MNFuHiYfA_ZVVcpcmE';
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
  return arr;
}
function getDeviceId(){
  let id = lsGet('tr_pushDeviceId', null);
  if(!id){ id = 'dev_'+Math.random().toString(36).slice(2)+Date.now().toString(36); lsSet('tr_pushDeviceId', id); }
  return id;
}
function notifPermissionState(){ return ('Notification' in window) ? Notification.permission : 'unsupported'; }
async function enableNotifications(){
  if(!('Notification' in window)){ showWarningToast('এই ব্রাউজারে Notification সমর্থিত নয়।'); return; }
  if(Notification.permission==='granted' && lsGet('tr_notifEnabled', false)){
    lsSet('tr_notifEnabled', false);
    await unsubscribePush();
    renderNotifToggle();
    return;
  }
  let perm = Notification.permission;
  if(perm!=='granted'){ perm = await Notification.requestPermission(); }
  lsSet('tr_notifEnabled', perm==='granted');
  if(perm==='granted') await subscribePush();
  renderNotifToggle();
}
function pushKeyMatches(sub){
  const k=sub.options && sub.options.applicationServerKey; if(!k) return true;
  const a=new Uint8Array(k), b=urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  return a.length===b.length && a.every((v,i)=>v===b[i]);
}
/* Privacy: student names only leave the phone (server push / lock-screen text) if the teacher opted in. */
function notifShowNames(){ return lsGet('tr_notifShowNames', false); }
function notifNamesText(val){
  if(notifShowNames()) return val;
  const n=String(val).split(',').filter(x=>x.trim()).length || 1;
  return `${toBn(n)}জন শিক্ষার্থী`;
}
function toggleNotifNames(){
  lsSet('tr_notifShowNames', !notifShowNames());
  renderNotifToggle(); syncPushSchedule();
  showSuccessToast(notifShowNames()?'নোটিফিকেশনে এখন নাম দেখাবে':'নোটিফিকেশনে নাম লুকানো থাকবে');
}
async function subscribePush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return; // background push unavailable on this browser; foreground reminders still work
  try{
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(sub && !pushKeyMatches(sub)){ try{ await sub.unsubscribe(); }catch(e){} sub=null; } // old key pair -> re-subscribe with the new one
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    await syncPushSchedule(sub);
  }catch(e){ console.error('push subscribe failed', e); }
}
async function unsubscribePush(){
  if(!('serviceWorker' in navigator)) return;
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      await fetch('/.netlify/functions/unsubscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({deviceId:getDeviceId()})}).catch(()=>{});
      await sub.unsubscribe();
    }
  }catch(e){ console.error('push unsubscribe failed', e); }
}
function buildScheduleSnapshot(daysAhead){
  const sessions=[];
  const cursor = todayDateOnly();
  for(let i=0;i<daysAhead;i++){
    const d = addDaysToDate(cursor, i);
    const dayKey = DAYS[(d.getDay()+1)%7];
    SCHEDULE.forEach(slot=>{
      if(isOffOn(d, slot.num)) return;
      const content = effectiveContentForDate(slot, dayKey, d);
      if(!content) return;
      sessions.push({ date:dateKeyStr(d), slotNum:slot.num, label:slot.label, start:slot.start, end:slot.end, students:notifNamesText(content), lead:leadTimeMinutesFor(slot, dayKey, d) });
    });
  }
  return sessions;
}
async function syncPushSchedule(existingSub){
  if(!lsGet('tr_notifEnabled', false)) return;
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = existingSub || await reg.pushManager.getSubscription();
    if(!sub) return;
    const dueList = computeDueList();
    const payload = {
      deviceId: getDeviceId(),
      subscription: sub.toJSON(),
      sessions: buildScheduleSnapshot(14),
      dueInfo: { count: dueList.length, totalDue: isFinanceHidden()?0:dueList.reduce((s,x)=>s+x.due,0), hideAmounts: isFinanceHidden() },
    };
    await fetch('/.netlify/functions/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  }catch(e){ console.error('push sync failed', e); }
}
function manualSyncPush(){
  syncPushSchedule()
    .then(()=>showSuccessToast('সিঙ্ক হয়ে গেছে'))
    .catch(()=>showWarningToast('সিঙ্ক করা যায়নি, ইন্টারনেট সংযোগ চেক করো।'));
}
function renderNotifToggle(){
  const el=document.getElementById('notifToggleBtn'); if(!el) return;
  const perm=notifPermissionState(); const enabled = perm==='granted' && lsGet('tr_notifEnabled', false);
  el.textContent = enabled ? '🔔 নোটিফিকেশন চালু আছে (বন্ধ করতে চাপ দাও)' : (perm==='denied' ? '🔕 ব্রাউজার সেটিংস থেকে অনুমতি লাগবে' : '🔔 ক্লাস শুরুর আগে নোটিফিকেশন চালু করো');
  el.disabled = perm==='denied';
  const namesBtn=document.getElementById('notifNamesBtn');
  if(namesBtn){ namesBtn.style.display = enabled ? '' : 'none'; namesBtn.textContent = notifShowNames() ? '👤 নোটিফিকেশনে ছাত্রের নাম: দেখাচ্ছে (লুকাতে চাপ দাও)' : '👤 নোটিফিকেশনে ছাত্রের নাম: লুকানো (দেখাতে চাপ দাও)'; }
  const syncBtn=document.getElementById('notifSyncBtn');
  if(syncBtn) syncBtn.style.display = enabled ? '' : 'none';
}
function leadTimeMinutesFor(slot, day, date){
  const todaysSlots = SCHEDULE.filter(s=>getCellText(s,day).trim() && !isOffOn(date,s.num)).sort((a,b)=>a.start-b.start);
  if(todaysSlots.length && todaysSlots[0].num===slot.num) return 20;
  const idx = todaysSlots.findIndex(s=>s.num===slot.num);
  if(idx>0 && (slot.start-todaysSlots[idx-1].end)<=10) return 5;
  return 10;
}
function pruneNotifiedLog(log){
  const todayK=dateKeyStr(todayDateOnly());
  Object.keys(log).forEach(k=>{ if(!k.startsWith(todayK)) delete log[k]; });
  return log;
}
function checkNotifications(){
  if(notifPermissionState()!=='granted' || !lsGet('tr_notifEnabled', false)) return;
  const today=todayKey(); const nm=nowMinutes(); const todayDate=todayDateOnly();
  let log = pruneNotifiedLog(lsGet('tr_notifiedLog', {}));
  SCHEDULE.forEach(slot=>{
    const val=getCellText(slot,today).trim();
    if(!val || isOffOn(todayDate, slot.num)) return;
    const lead=leadTimeMinutesFor(slot, today, todayDate);
    const key=dateKeyStr(todayDate)+'|'+slot.num;
    if(log[key]) return;
    if(nm>=slot.start-lead && nm<slot.start){
      log[key]=true; lsSet('tr_notifiedLog', log);
      const body=`${toBn(lead)} মিনিট পর ${notifNamesText(val)} — ${slot.label}`;
      sendAppNotification(body, key);
    }
  });
  /* Smarter reminders: once a day (after midday, so there's been a chance to already get paid), a ---- */
  /* single OS notification about outstanding payments — on top of the in-app Home banner. */
  const dueKey=dateKeyStr(todayDate)+'|due';
  if(!log[dueKey] && nm>=720){
    const dueList = computeDueList();
    if(dueList.length>0){
      log[dueKey]=true; lsSet('tr_notifiedLog', log);
      const body = isFinanceHidden()
        ? `${toBn(dueList.length)} জনের পেমেন্ট বাকি আছে।`
        : `${toBn(dueList.length)} জনের পেমেন্ট বাকি — মোট ${bnTaka(dueList.reduce((s,x)=>s+x.due,0))}।`;
      sendAppNotification(body, dueKey);
    }
  }
}
function sendAppNotification(body, tag){
  if('serviceWorker' in navigator && navigator.serviceWorker.controller){
    navigator.serviceWorker.ready.then(reg=>reg.showNotification('আমার টিউশন রুটিন', {body, icon:'icon-192.png', badge:'icon-192.png', tag}));
  } else if('Notification' in window){
    new Notification('আমার টিউশন রুটিন', {body, icon:'icon-192.png'});
  }
}

function renderWeekLoad(){
  const wrap=document.getElementById('weekLoad'); wrap.innerHTML='';
  const today=todayKey();
  const loads = DAYS.map(d=>{
    let t=0; SCHEDULE.forEach(s=>{ if(getCellText(s,d).trim()) t+=(s.end-s.start); });
    return t;
  });
  const max = Math.max(...loads,1);
  DAYS.forEach((d,i)=>{
    const col=document.createElement('div');
    col.className='wl-col'+(d===today?' is-today':'')+(d===activeDay?' is-active':'');
    const h = Math.max(10, Math.round((loads[i]/max)*34));
    col.innerHTML = `<div class="wl-bar-track"><div class="wl-bar" style="height:${h}px"></div></div><span class="wl-label">${DAY_BN[d]}</span>`;
    col.onclick=()=>selectDay(d);
    wrap.appendChild(col);
  });
}

/* ============ WEEK TABLE ============ */
function toggleHighlight(name){
  highlightedName = (highlightedName===name) ? null : name;
  renderWeekTable();
}
function renderWeekTable(){
  const today=todayKey();
  let html = '<thead><tr><th>সময়</th>'+DAYS.map(d=>`<th class="${d===today?'today-col':''}">${DAY_BN[d]}</th>`).join('')+'</tr></thead><tbody>';
  SCHEDULE.forEach(slot=>{
    const durTxt = toBn(slot.end-slot.start)+' মিনিট';
    html += `<tr><td class="time-col">${slot.label}<span class="dur">(${durTxt})</span></td>`;
    DAYS.forEach(d=>{
      const val=getCellText(slot, d).trim();
      let cellHtml;
      if(editMode){
        const raw = escapeHtml(val);
        cellHtml = `<input type="text" class="cell-edit-input" value="${raw}" placeholder="${slot.activity?slot.activityLabel:'—'}"
          onchange="handleCellEdit(${SCHEDULE.indexOf(slot)},'${d}',this)">`;
      } else if(val){
        cellHtml = val.split(',').map(s=>s.trim()).filter(Boolean).map(n=>{
          const c=avatarColor(n);
          const hl = n===highlightedName ? ' chip-highlight' : '';
          return `<span class="mini-chip${hl}" style="background:${c}22;color:${c}" onclick="toggleHighlight('${jsq(n)}')">${escapeHtml(n)}</span>`;
        }).join(' ');
      } else if(slot.activity){
        cellHtml = `<span class="mini-chip activity-chip">${slot.activityIcon} ${slot.activityLabel}</span>`;
      } else {
        cellHtml = '—';
      }
      html += `<td class="${d===today?'today-col':''}${editMode?' editing-cell':''}">${cellHtml}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  document.getElementById('weekTable').innerHTML = html;
}

/* ============ VIEW SWITCH ============ */
document.getElementById('vDayBtn').onclick=()=>{
  document.getElementById('vDayBtn').classList.add('active');
  document.getElementById('vWeekBtn').classList.remove('active');
  document.getElementById('dayView').style.display='';
  document.getElementById('weekView').style.display='none';
  document.getElementById('dayTabs').style.display='flex';
};
document.getElementById('vWeekBtn').onclick=()=>{
  document.getElementById('vWeekBtn').classList.add('active');
  document.getElementById('vDayBtn').classList.remove('active');
  document.getElementById('dayView').style.display='none';
  document.getElementById('weekView').style.display='';
  document.getElementById('dayTabs').style.display='none';
  renderWeekTable();
};

/* ============ ACTIONS ============ */
document.getElementById('printBtn').addEventListener('click', ()=>{ renderWeekTable(); window.print(); });

/* ============ INIT ============ */
function updateTopbarDot(){
  const dot=document.getElementById('topbarLiveDot');
  if(!dot) return;
  dot.style.display = (computeStatus().mode==='live') ? 'inline-block' : 'none';
}

function renderAll(){
  renderArcStops(); renderNextPanel(); renderFocusCard(); renderWeekLoad(); renderDayTabs(); renderDayView(); renderWhy(); renderLiveClock(); renderLockStrip(); renderInsights();
  renderHomeGreet(); renderKPIRow(); renderTodayGoal(); renderTodayList(); renderDueReminder(); renderBackupNag(); renderWrapUpBox(); updateAppBadge(); renderAbsenceRiskBox(); updateNotifCenterBadge(); updateTopbarDot();
}

/* ---- Command bar example chips: teach the phrasing pattern instead of making users guess ---- */
function renderCmdExamples(){
  const box = document.getElementById('cmdExamples');
  if(!box) return;
  const names = getAllKnownNames();
  const n1 = names[0] || 'রিমি';
  const n2 = names[1] || 'সাকিব';
  const examples = [
    `আজ ${n1}-এর ক্লাস বাতিল`,
    `${n2}-কে ৫টায় নাও`,
    `কাল ${n1}-এর ক্লাস বাতিল`,
    `${n1} ১৫০০ বিকাশ`,
    `${n2} পুরো ফি`,
    `${n1} গণিত অধ্যায় ৩ পড়ালাম, হোমওয়ার্ক অনুশীলনী ৩.২`,
    `রাকিব ৫০০ ধার দিলাম`,
    `খরচ ১২০ খাবার`,
  ];
  box.innerHTML = examples.map(ex=>`<button type="button" class="cmd-chip" onclick="fillCommandExample(this)">${escapeHtml(ex)}</button>`).join('');
}
function fillCommandExample(btn){
  const input = document.getElementById('cmdInput');
  input.value = btn.textContent;
  input.focus();
}

/* ---- প্রথমবারের টিপস (v54): কাজ আটকানো পপআপ নয় — হোমের মাথায় ছোট কার্ড, যেকোনো সময় ✕ বা "বুঝেছি" ---- */
const ONBOARD_STEPS = [
  {icon:'spark',    title:'স্বাগতম! ৩টা ছোট টিপ', body:'হোমে সবার আগে দেখবে এখন বা পরে কোন ক্লাস। নিচে পুরো দিনের লিস্ট আর কিছু ছোট স্ট্যাটস আছে।'},
  {icon:'settings', title:'ক্লাসের নাম বদলাতে ট্যাপ করো', body:'শিডিউল ট্যাবে কোনো ক্লাসের নামে ট্যাপ করলেই সরাসরি বদলানো যায়। নোট/উপস্থিতি, সময় বদল আর ছুটি দেওয়ার বোতামও ওখানেই।', cta:{label:'শিডিউল দেখো', js:"switchTab('schedule')"}},
  {icon:'chat',     title:'লিখে বলো', body:'"আজ রিমির ক্লাস বাতিল" এর মতো বাংলায় লিখলেই অ্যাপ বুঝে নেবে। ☰ মেনুতে রিপোর্ট, সেটিংস আর ব্যাকআপ আছে।'},
];
let onboardStep = lsGet('tr_tipStep', 0);
function renderOnboardStep(){
  const box=document.getElementById('tipBox'); if(!box) return;
  if(lsGet('tr_onboarded', false)){ box.innerHTML=''; return; }
  onboardStep=Math.min(Math.max(0,onboardStep),ONBOARD_STEPS.length-1);
  const s=ONBOARD_STEPS[onboardStep], isLast=onboardStep===ONBOARD_STEPS.length-1;
  box.innerHTML=`<div class="tip-card" role="region" aria-label="টিপ">
    <button type="button" class="tip-x" aria-label="বন্ধ করো" onclick="skipOnboarding()">✕</button>
    <div class="tip-ic">${ico(s.icon)}</div>
    <div class="tip-body"><div class="tip-title">${escapeHtml(s.title)}</div><div class="tip-text">${escapeHtml(s.body)}</div>
      <div class="tip-foot"><span class="tip-dots">${ONBOARD_STEPS.map((_,i)=>`<i class="${i===onboardStep?'on':''}"></i>`).join('')}</span>
        ${s.cta?`<button type="button" class="tip-link" onclick="${s.cta.js}">${s.cta.label}</button>`:''}
        <button type="button" class="tip-next" onclick="onboardNext()">${isLast?'বুঝেছি':'পরের টিপ'}</button></div></div></div>`;
}
function onboardNext(){
  if(onboardStep < ONBOARD_STEPS.length-1){ onboardStep++; lsSet('tr_tipStep',onboardStep); renderOnboardStep(); }
  else { finishOnboarding(); }
}
function skipOnboarding(){ finishOnboarding(); }
function finishOnboarding(){ lsSet('tr_onboarded', true); renderOnboardStep(); }
function maybeShowOnboarding(){ renderOnboardStep(); }
function replayTips(){ lsSet('tr_onboarded', false); onboardStep=0; lsSet('tr_tipStep',0); switchTab('home'); renderOnboardStep(); window.scrollTo(0,0); }
applyTheme();
renderAll();
renderCmdExamples();
maybeShowOnboarding();
if(lsGet('tr_notifEnabled', false)) syncPushSchedule().catch(()=>{}); // keep server-side reminders fresh each time the app is opened

// A plain setInterval(fn,1000) can drift: each tick only guarantees "about" 1000ms later, and
// background/throttled tabs delay it further, so the seconds can visibly lag by 1-2s or more.
// This self-corrects by re-measuring against the real clock each time, and snapping back to
// the true second boundary — plus an immediate refresh the moment the tab becomes visible again.
/* শুধু যা চোখে পড়ছে তা প্রতি সেকেন্ডে আঁকা হয়: হোমের ঘড়ি/লিস্ট তখনই, যখন হোম ট্যাব খোলা ও স্ক্রিন চালু; আর্ক/বুস্টার তখনই, যখন "আরও দেখো" খোলা। */
function homeIsLive(){ return document.visibilityState==='visible' && activeTab==='home'; }
function renderHomeLive(){
  if(!homeIsLive()) return;
  renderNextPanel(); renderTodayList();
  const more=document.getElementById('homeMore'); if(!more || !more.hidden){ renderFocusCard(); renderLiveClock(); }
}
function tick(){
  checkDayRollover(); checkNotifications(); updateTopbarDot(); renderHomeLive();
  const delay = 1000 - (Date.now() % 1000);
  setTimeout(tick, delay);
}
setTimeout(tick, 1000 - (Date.now() % 1000));

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'){
    checkDayRollover(); checkNotifications(); updateTopbarDot(); renderHomeLive();
  }
});

/* Home-screen icon badge = work waiting: classes not yet wrapped up + students who owe. (Android/desktop Chrome installs.) */
function updateAppBadge(){
  if(!('setAppBadge' in navigator)) return;
  try{
    const n=pendingWrapSlots().length + (isFinanceHidden() ? 0 : computeDueList().length);
    if(n>0) navigator.setAppBadge(n).catch(()=>{}); else navigator.clearAppBadge().catch(()=>{});
  }catch(e){}
}
/* Long-press shortcuts from manifest.json: ?go=wrap | pay | students */
function handleLaunchShortcut(){
  const go=new URLSearchParams(location.search).get('go'); if(!go) return;
  setTimeout(()=>{
    if(go==='students') switchTab('students');
    else { switchTab('home'); if(go==='pay'){ const i=document.getElementById('cmdInput'); if(i){ i.scrollIntoView({block:'center'}); i.focus(); } } else if(go==='wrap'){ const b=document.getElementById('wrapUpBox'); if(b) b.scrollIntoView({block:'start'}); } }
  }, 350);
}
window.addEventListener('load', handleLaunchShortcut);

/* ============ VISUAL EFFECTS: nav highlight, confetti, on/off switch ============ */
function moveNavInd(){
  const nav=document.querySelector('.bottom-nav'), ind=document.getElementById('navInd'), btn=nav && nav.querySelector('.nav-btn.active');
  if(ind && nav) ind.style.opacity = btn ? '' : '0';   // reports/settings live in the top menu, so no bottom tab is lit
  if(!nav || !ind || !btn) return;
  ind.style.width=btn.offsetWidth+'px';
  ind.style.transform=`translateX(${btn.offsetLeft}px)`;
}
function fxOn(){ return lsGet('tr_fx','on')!=='off' && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyFx(){ document.body.classList.toggle('no-fx', lsGet('tr_fx','on')==='off'); }
function toggleFx(){ lsSet('tr_fx', lsGet('tr_fx','on')==='off' ? 'on' : 'off'); applyFx(); renderSettingsTab(); showSuccessToast(lsGet('tr_fx','on')==='off' ? 'ইফেক্ট বন্ধ — ফোন আরও হালকা চলবে' : 'ইফেক্ট চালু'); }
function burstConfetti(){
  if(!fxOn()) return;
  const box=document.createElement('div'); box.className='fx-confetti';
  const cols=['#e6c27a','#35c28f','#7c5cff','#e2677a','#60a5fa'];
  for(let i=0;i<30;i++){
    const p=document.createElement('i'), a=(Math.random()*Math.PI)+Math.PI, d=140+Math.random()*190;
    p.style.setProperty('--c',cols[i%cols.length]);
    p.style.setProperty('--dx',(Math.cos(a)*d*1.1).toFixed(0)+'px');
    p.style.setProperty('--dy',(Math.sin(a)*d*1.35+220).toFixed(0)+'px');
    p.style.setProperty('--rot',(Math.random()*720-360).toFixed(0)+'deg');
    p.style.animationDelay=(Math.random()*0.12).toFixed(2)+'s';
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(()=>box.remove(),1700);
}
window.addEventListener('load', ()=>{ applyFx(); moveNavInd(); setTimeout(moveNavInd,400); });
window.addEventListener('resize', moveNavInd);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(moveNavInd);

/* ============ Every pop-up can be closed three ways: the ✕, a "বন্ধ করো" button at the bottom, or a tap outside / Esc ============ */
const CLOSE_SEL='.notesdb-close, .modal-close-x';
function installModalClosers(){
  document.querySelectorAll('.modal-overlay:not(#onboardModal)').forEach(ov=>{
    const x=ov.querySelector(CLOSE_SEL), box=ov.querySelector('.modal-box'); if(!x || !box) return;
    if(!box.querySelector('.mb-close')){
      const b=document.createElement('button'); b.type='button'; b.className='mb-close'; b.textContent='বন্ধ করো';
      b.addEventListener('click', ()=>x.click()); box.appendChild(b);
    }
    ov.addEventListener('click', e=>{ if(e.target===ov) x.click(); });
  });
}
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  const open=[...document.querySelectorAll('.modal-overlay')].filter(o=>getComputedStyle(o).display!=='none' && o.id!=='onboardModal' && o.querySelector(CLOSE_SEL));
  if(open.length) open[open.length-1].querySelector(CLOSE_SEL).click();
});
window.addEventListener('load', installModalClosers);

/* ============ PWA: SERVICE WORKER ============ */
function showUpdateBanner(){
  if(document.getElementById('updateBanner')) return;
  const b=document.createElement('div'); b.id='updateBanner';
  b.style.cssText='position:fixed;left:12px;right:12px;bottom:88px;z-index:9999;background:var(--void2,#1b1d2a);color:var(--paper,#fff);border:1px solid var(--line,#444);border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:13px;';
  b.innerHTML='<span>🆕 অ্যাপের নতুন আপডেট এসেছে</span><button class="pct-chip" onclick="location.reload()">রিফ্রেশ করো</button>';
  document.body.appendChild(b);
}
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* offline caching just won't be available; the app still works fine online */ });
    navigator.serviceWorker.ready.then(()=>{ if(lsGet('tr_notifEnabled', false) && notifPermissionState()==='granted') subscribePush(); }).catch(()=>{});
  });
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(hadController) showUpdateBanner(); });
}

/* hook: after every student-profile render, pre-fill the payment form */
(function(){ const _r=renderStudentModal; renderStudentModal=function(){ const out=_r.apply(this,arguments); try{ applyPayDefaults(); }catch(e){} return out; }; })();

/* ---- Accessibility: icon-only buttons get a screen-reader name from their tooltip (title), ---- */
/* including buttons that are drawn later by render functions. */
(function(){
  function label(root){
    try{
      (root.querySelectorAll ? root.querySelectorAll('button[title]:not([aria-label]), [onclick][title]:not([aria-label])') : []).forEach(el=>{
        const t=el.getAttribute('title'); if(t) el.setAttribute('aria-label', t);
      });
    }catch(e){}
  }
  label(document);
  try{
    let pending=false;
    new MutationObserver(()=>{ if(pending) return; pending=true; setTimeout(()=>{ pending=false; label(document); }, 200); })
      .observe(document.body, {childList:true, subtree:true});
  }catch(e){}
})();

