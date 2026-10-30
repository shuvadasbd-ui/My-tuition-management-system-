/* ============ 💎 আয়ের রাডার — তোমার টিউশনের আসল ঘণ্টা-প্রতি আয় ============ */
/* ফি ÷ আসলে কত সময় লাগে (ক্লাস + যাওয়া-আসা, গ্রুপে সময় ভাগ হয়)। কে লাভজনক, ফি কোথায় কম, ফাঁকা স্লটে কত আয় বাড়ার সুযোগ, */
/* আর লক্ষ্যে পৌঁছাতে কী লাগবে — সব তোমার নিজের শিডিউল ও ফি থেকে, ফোনেই হিসাব হয়। */

/* pure (unit-tested). slots:[{num,start,end}], cellOf(slot,day)->"নাম, নাম", feeOf(name)->monthly fee.
   o:{travel: minutes added to every busy slot, weeks: weeks per month (4.33), goal: target monthly income, days:[...]} */
function radarCompute(slots, cellOf, feeOf, o){
  o=o||{};
  const travel=Math.max(0,Number(o.travel)||0), W=o.weeks||4.33, days=o.days||['Sat','Sun','Mon','Tue','Wed','Thu','Fri'], goal=Math.max(0,Number(o.goal)||0);
  const st={}, free=[], grid=[]; let busyMin=0, busyLen=0, busyN=0;
  slots.forEach(sl=>{
    const row=[], len=Math.max(0,sl.end-sl.start), used=days.some(d=>String(cellOf(sl,d)||'').split(',').some(x=>x.trim()));   // a period you never teach in is not "free time you could sell"
    days.forEach(d=>{
      const names=[...new Set(String(cellOf(sl,d)||'').split(',').map(s=>s.trim()).filter(Boolean))];
      row.push(names.length);
      if(!names.length){ if(used) free.push({num:sl.num, day:d, len}); return; }
      busyN++; busyMin+=len+travel; busyLen+=len;
      names.forEach(n=>{ const s=st[n]||(st[n]={name:n, sessions:0, min:0}); s.sessions++; s.min+=(len+travel)/names.length; });   // a group shares one slot, so each child carries only a share of the teacher's time
    });
    grid.push(row);
  });
  const busyHrs=busyMin/60*W;
  const rows=Object.values(st).map(s=>{ const fee=Math.max(0,Number(feeOf(s.name))||0), hrs=s.min/60*W; return {name:s.name, fee, sessions:s.sessions, hours:hrs, rate:(fee>0&&hrs>0)?fee/hrs:0}; });
  const paid=rows.filter(r=>r.fee>0), income=paid.reduce((t,r)=>t+r.fee,0), avg=busyHrs>0?income/busyHrs:0;
  rows.forEach(r=>{ r.pct=avg>0&&r.rate>0?r.rate/avg:0; r.tag=r.fee<=0?'nofee':(r.pct<0.7?'low':(r.pct>=1.3?'high':'ok'));
    r.raiseTo=(r.tag==='low')?Math.ceil(avg*r.hours/50)*50:0; r.raiseBy=r.raiseTo?r.raiseTo-r.fee:0; r.dropLoses=r.fee; r.dropFrees=r.hours; });
  rows.sort((a,b)=>(b.rate-a.rate)||a.name.localeCompare(b.name));
  const avgLen=busyN?busyLen/busyN:0, perSlot=avg>0?Math.round(avg*(avgLen+travel)/60*W):0;      // income from filling one more weekly slot with one paying student
  const res={rows, income, busyHrs, avg, weeklyHrs:busyHrs/W, free, grid, perSlot, noFee:rows.filter(r=>r.tag==='nofee').map(r=>r.name), goal:null};
  if(goal>0){ const gap=goal-income; res.goal={target:goal, gap:Math.max(0,gap), met:gap<=0, needSlots:(gap>0&&perSlot>0)?Math.ceil(gap/perSlot):0, freeSlots:free.length, raisePct:(gap>0&&income>0)?Math.ceil(gap/income*100):0}; res.goal.feasible=res.goal.met||(perSlot>0&&res.goal.needSlots<=free.length); }
  return res;
}
const RD_TRAVEL_KEY='tr_radarTravel', RD_GOAL_KEY='tr_radarGoal';
function radarTravel(){ const v=Number(lsGet(RD_TRAVEL_KEY,15)); return isFinite(v)?Math.max(0,Math.min(120,v)):15; }
function radarGoal(){ const v=Number(lsGet(RD_GOAL_KEY,0)); return isFinite(v)&&v>0?v:0; }
function radarData(){
  return radarCompute(SCHEDULE, getCellText, n=>getStudentPayment(n).monthlyFee, {travel:radarTravel(), goal:radarGoal(), days:DAYS});
}
function radarCardHtml(){
  if(isFinanceHidden()) return `<div class="rd-card rd-locked"><div class="rd-card-t">💎 আয়ের রাডার</div><div class="rd-card-s">🙈 আর্থিক হিসাব লুকানো আছে — "দেখাও" চেপে আনলক করলে তোমার আসল ঘণ্টা-প্রতি আয় দেখা যাবে।</div></div>`;
  const d=radarData();
  if(!(d.avg>0)) return `<div class="rd-card" onclick="radarOpen()"><div class="rd-card-t">💎 আয়ের রাডার</div><div class="rd-card-s">শিক্ষার্থীদের মাসিক ফি দিলে এখানে তোমার আসল ঘণ্টা-প্রতি আয়, কে লাভজনক আর কোথায় সুযোগ — সব দেখাবে।</div></div>`;
  const low=d.rows.filter(r=>r.tag==='low').length;
  return `<div class="rd-card" onclick="radarOpen()"><div class="rd-card-t">💎 আয়ের রাডার</div>
    <div class="rd-card-n">${bnTaka(d.avg)}<small> / ঘণ্টা</small></div>
    <div class="rd-card-s">সপ্তাহে ~${toBn(Math.round(d.weeklyHrs))} ঘণ্টা (যাওয়া-আসাসহ) · ${low?`${toBn(low)} জনের ফি গড়ের চেয়ে অনেক কম`:'কারো ফি গড়ের চেয়ে উল্লেখযোগ্য কম নয়'} · ${toBn(d.free.length)} টি ফাঁকা স্লট</div>
    <div class="rd-card-go">পুরো রাডার দেখো ›</div></div>`;
}
function radarOpen(){
  if(isFinanceHidden()){ showWarningToast('আগে আর্থিক হিসাব আনলক করো (রিপোর্ট ট্যাবের উপরে "দেখাও")।'); return; }
  showKhataModal('💎 আয়ের রাডার', radarBody());
}
function radarRefresh(){ const b=document.getElementById('khataModalBody'); if(b && b.querySelector('#rdBox')){ const y=b.scrollTop; b.innerHTML=radarBody(); b.scrollTop=y; } }
function radarTravelStep(n){ lsSet(RD_TRAVEL_KEY, Math.max(0,Math.min(120,radarTravel()+n))); radarRefresh(); }
function radarSetGoal(v){ const n=Math.round(parseFloat(String(bnDigitsToLatin(String(v||''))).replace(/[^0-9.]/g,''))||0); lsSet(RD_GOAL_KEY, n>0?n:0); radarRefresh(); }
function radarBody(){
  const d=radarData(), T=radarTravel(), max=Math.max(1,...d.rows.map(r=>r.rate)), dayNames=DAYS.map(x=>DAY_BN[x]);
  if(!(d.avg>0)) return `<div id="rdBox">${emptyState({icon:'chart',title:'এখনো হিসাব করার মতো ফি নেই',body:'শিক্ষার্থী প্রোফাইলে মাসিক ফি দিলে রাডার চালু হবে।'})}</div>`;
  const best=d.rows.find(r=>r.tag!=='nofee'), lows=d.rows.filter(r=>r.tag==='low').sort((a,b)=>b.raiseBy-a.raiseBy);
  const tips=[];
  if(lows[0]) tips.push(`<div class="rd-tip"><b>📈 ফি বাড়ানোর সুযোগ</b>${lows.slice(0,3).map(r=>`<div>${escapeHtml(r.name)}: এখন ${bnTaka(r.fee)} → গড়ের কাছে আনতে ≈ ${bnTaka(r.raiseTo)} <em>(+${bnTaka(r.raiseBy)})</em></div>`).join('')}</div>`);
  const groups=d.rows.filter(r=>r.tag==='high'); if(groups[0]) tips.push(`<div class="rd-tip"><b>🌟 সবচেয়ে লাভজনক</b><div>${groups.slice(0,3).map(r=>`${escapeHtml(r.name)} (${bnTaka(r.rate)}/ঘণ্টা)`).join(', ')} — একসঙ্গে পড়ানোয় সময় ভাগ হয়, তাই ঘণ্টা-প্রতি আয় বেশি।</div></div>`);
  if(d.free.length&&d.perSlot>0) tips.push(`<div class="rd-tip"><b>🕳️ ফাঁকা সময়ের দাম</b><div>সপ্তাহে ${toBn(d.free.length)} টি স্লট ফাঁকা। প্রতিটা স্লটে একজন ছাত্র পেলে মাসে গড়ে ≈ ${bnTaka(d.perSlot)} বাড়ে।</div></div>`);
  if(d.noFee.length) tips.push(`<div class="rd-tip rd-warn"><b>⚠️ ফি দেওয়া নেই</b><div>${d.noFee.map(escapeHtml).join(', ')} — এদের সময় হিসাবে ধরা হয়েছে, কিন্তু আয় ধরা হয়নি।</div></div>`);
  const g=d.goal;
  const goalHtml=`<div class="rd-sec">🎯 মাসিক আয়ের লক্ষ্য</div><div class="rd-goal"><input class="kh-in" inputmode="numeric" id="rd_goal" placeholder="লক্ষ্য কত টাকা? (যেমন ২৫০০০)" value="${radarGoal()||''}" onchange="radarSetGoal(this.value)">
    ${g?(g.met?`<div class="rd-goal-r ok">✅ লক্ষ্য ছাড়িয়ে গেছ — এখন মাসে ${bnTaka(d.income)}।</div>`
      :`<div class="rd-goal-r">আর লাগবে <b>${bnTaka(g.gap)}</b>।<br>${g.needSlots?`🔹 ${toBn(g.needSlots)} টি ফাঁকা স্লটে নতুন ছাত্র নিলে হবে (ফাঁকা আছে ${toBn(g.freeSlots)} টি) ${g.feasible?'✅':'— ফাঁকা স্লট কম পড়বে, ফিও বাড়াতে হবে'}`:''}<br>🔹 অথবা সবার ফি গড়ে প্রায় ${toBn(g.raisePct)}% বাড়ালে।</div>`):`<div class="rd-goal-r muted">লক্ষ্য দিলে বলে দেব কয়টা নতুন ছাত্র বা কত ফি বাড়ালে পৌঁছানো যাবে।</div>`}</div>`;
  const map=`<div class="rd-map"><div class="rd-mh"></div>${dayNames.map(x=>`<div class="rd-mh">${x}</div>`).join('')}${SCHEDULE.map((sl,i)=>`<div class="rd-ml">${PERIOD_ICON[sl.period]||''}${toBn(sl.num)}</div>${d.grid[i].map(n=>`<div class="rd-mc${n?' on':''}" title="${n} জন">${n?toBn(n):''}</div>`).join('')}`).join('')}</div>`;
  return `<div id="rdBox"><div class="rd-hero"><small>তোমার আসল ঘণ্টা-প্রতি আয়</small><b>${bnTaka(d.avg)}</b>
      <span>মাসে ${bnTaka(d.income)} ÷ ~${toBn(Math.round(d.busyHrs))} ঘণ্টা (ক্লাস + যাওয়া-আসা)</span>
      <div class="rd-trv"><span>যাওয়া-আসা প্রতি ক্লাসে</span><button type="button" onclick="radarTravelStep(-5)" aria-label="কমাও">−</button><b>${toBn(T)} মিনিট</b><button type="button" onclick="radarTravelStep(5)" aria-label="বাড়াও">+</button></div></div>
    ${tips.join('')}
    <div class="rd-sec">👥 কার কত — ঘণ্টা-প্রতি আয়</div>
    ${d.rows.map(r=>`<div class="rd-row ${r.tag}"><div class="rd-rn"><span>${escapeHtml(r.name)}</span><b>${r.rate?bnTaka(r.rate)+'/ঘণ্টা':'—'}</b></div><div class="rd-bar"><i style="width:${r.rate?Math.max(4,Math.round(r.rate/max*100)):0}%"></i></div><div class="rd-rs">ফি ${bnTaka(r.fee)} · সপ্তাহে ${toBn(r.sessions)} ক্লাস · মাসে ~${toBn(r.hours.toFixed(1))} ঘণ্টা${r.tag==='low'?' · <em>গড়ের চেয়ে কম</em>':''}${r.tag==='high'?' · <em class="g">গড়ের চেয়ে বেশি</em>':''}</div></div>`).join('')}
    ${goalHtml}
    <div class="rd-sec">🗓️ সপ্তাহের ম্যাপ — কোন স্লটে কয়জন</div>${map}
    <div class="rd-foot">হিসাব তোমার সাপ্তাহিক শিডিউল আর ফি থেকে, ১ মাস = ৪.৩৩ সপ্তাহ ধরে। ছুটি-মেকআপ ধরা হয়নি, তাই এটা মোটামুটি ছবি — নিখুঁত হিসাব নয়।</div></div>`;
}
