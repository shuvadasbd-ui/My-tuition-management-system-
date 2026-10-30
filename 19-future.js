/* ============ 🔮 ভবিষ্যৎ-যন্ত্র — তোমার টিউশনের "ডিজিটাল টুইন" ============ */
/* তোমার আসল ডেটা (ফি, ছাত্র-ঝুঁকি, ফি-আদায়ের ধরন, ফাঁকা স্লট) থেকে ১,৫০০টা সম্ভাব্য ভবিষ্যৎ চালায় (মন্টি কার্লো সিমুলেশন)। */
/* ফল: আগামী মাসগুলোর আয়ের সম্ভাবনার পরিসর, লক্ষ্যে পৌঁছানোর সম্ভাবনা, আর কোন পদক্ষেপে সবচেয়ে বেশি লাভ (সংবেদনশীলতা বিশ্লেষণ)। */
/* এটা ভবিষ্যদ্বাণী নয় — অনুমানের ওপর দাঁড়ানো সম্ভাবনার ছবি; অনুমানগুলো পর্দাতেই লেখা থাকে। */

/* ---- pure (unit-tested) ---- */
function fxRng(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function fxInvPoisson(u, lam){ if(!(lam>0)) return 0; let p=Math.exp(-lam), c=p, k=0; while(u>c && k<25){ k++; p*=lam/k; c+=p; } return k; }
function fxPct(sorted, p){ if(!sorted.length) return 0; const i=(sorted.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo); }
/* ঝুঁকি-স্কোর (০–১০০) → মাসে ছাড়ার সম্ভাবনা: ০ ≈ ২%, ১০০ ≈ ২৭%; স্কোর না থাকলে ৪% */
function fxHazard(score){ return (score==null||!isFinite(score))?0.04:0.02+Math.max(0,Math.min(100,score))/100*0.25; }
/* o: {students:[{name,fee,hazard,reliability}], months, runs, newRate, newFee, newHazard, freeSlots, seed, goal, base0, keep}
   প্রতিটা সিমুলেশনে একই র‍্যান্ডম সংখ্যার ধারা (common random numbers) — তাই "পদক্ষেপ নিলে" আর "না নিলে" তুলনাটা নিরপেক্ষ */
function fxSim(o){
  const M=o.months, R=o.runs||1500, S=o.students||[], keep=Math.min(R,o.keep==null?70:o.keep), cap=Math.max(0,Math.min(10,o.freeSlots|0)), newFee=o.newFee||0, newRate=Math.max(0,o.newRate||0), newHaz=o.newHazard==null?0.03:o.newHazard;
  const base0=o.base0!=null?o.base0:S.reduce((t,s)=>t+s.fee,0), byMonth=Array.from({length:M+1},()=>new Float64Array(R)), paths=[]; let goalHit=0, aboveHit=0, endStud=0, cum=0;
  for(let r=0;r<R;r++){
    const rnd=fxRng((o.seed|0)+r*7919+1), alive=S.map(()=>true), newActive=[]; let carry=0; const path=r<keep?[base0]:null; byMonth[0][r]=base0;
    let inc=0;
    for(let m=1;m<=M;m++){
      inc=carry; carry=0;
      for(let i=0;i<S.length;i++){ const s=S[i], uL=rnd(), uP=rnd(); if(alive[i]&&uL<s.hazard) alive[i]=false; if(alive[i]){ if(uP<s.reliability) inc+=s.fee; else carry+=s.fee; } }   // দেরি হলে ফি পরের মাসে আসে
      for(let j=0;j<cap;j++){ const u=rnd(); if(j<newActive.length&&newActive[j]){ if(u<newHaz) newActive[j]=false; else inc+=newFee; } }
      const arrivals=fxInvPoisson(rnd(),newRate); for(let a=0;a<arrivals&&newActive.length<cap;a++) newActive.push(true);
      byMonth[m][r]=inc; cum+=inc; if(path) path.push(inc);
    }
    if(path) paths.push(path);
    if(o.goal>0 && inc>=o.goal) goalHit++; if(inc>=base0*0.999) aboveHit++;
    endStud+=alive.filter(Boolean).length+newActive.filter(Boolean).length;
  }
  const bands=byMonth.map(arr=>{ const s=Float64Array.from(arr).sort(), mean=arr.reduce((t,x)=>t+x,0)/R; return {p10:fxPct(s,0.1),p25:fxPct(s,0.25),p50:fxPct(s,0.5),p75:fxPct(s,0.75),p90:fxPct(s,0.9),mean}; });
  return {months:M, runs:R, bands, paths, base0, pGoal:o.goal>0?goalHit/R:null, pAbove:aboveHit/R, endStudents:endStud/R, avgMonthly:cum/(R*M)};
}
/* pure: কার ছাড়ার সম্ভাবনা + প্রত্যাশিত ক্ষতি (বিশ্লেষণধর্মী) */
function fxTopRisk(students, months, n){
  return (students||[]).map(s=>{ let loss=0; for(let m=1;m<=months;m++) loss+=s.fee*(1-Math.pow(1-s.hazard,m)); return {name:s.name, fee:s.fee, pLeave:1-Math.pow(1-s.hazard,months), expectedLoss:loss}; })
    .sort((a,b)=>b.expectedLoss-a.expectedLoss).slice(0,n||3);
}
/* pure: কোন পদক্ষেপে সবচেয়ে লাভ — একই সিমুলেশন, একটা লিভার বদলে */
function fxLevers(o){
  const M=o.months, base=fxSim(Object.assign({},o,{keep:0})), S=o.students, top=fxTopRisk(S,M,1)[0], mk=f=>fxSim(Object.assign({},o,{keep:0},f));
  const L=[
    {key:'retainRisky', label:'ঝুঁকিতে থাকা সবাইকে ধরে রাখলে', sim:mk({students:S.map(s=>s.hazard>0.08?Object.assign({},s,{hazard:0.02}):s)})},
    top&&{key:'retainTop', label:`${top.name}-কে ধরে রাখলে`, sim:mk({students:S.map(s=>s.name===top.name?Object.assign({},s,{hazard:0.02}):s)})},
    {key:'newx2', label:'নতুন ছাত্র আনার হার দ্বিগুণ করলে', sim:mk({newRate:Math.max(0.2,(o.newRate||0)*2)})},
    {key:'fee10', label:'সবার ফি ১০% বাড়ালে (কেউ কেউ ছাড়তে পারে)', sim:mk({students:S.map(s=>Object.assign({},s,{fee:s.fee*1.1,hazard:Math.min(0.95,s.hazard*1.5+0.01)})), newFee:(o.newFee||0)*1.1})},
    {key:'collect', label:'ফি সময়মতো আদায় নিশ্চিত করলে', sim:mk({students:S.map(s=>Object.assign({},s,{reliability:1}))})}
  ].filter(Boolean).map(x=>({key:x.key, label:x.label, dAvg:x.sim.avgMonthly-base.avgMonthly, dGoal:base.pGoal==null?null:x.sim.pGoal-base.pGoal, dAbove:x.sim.pAbove-base.pAbove}));
  L.sort((a,b)=>b.dAvg-a.dAvg); return L;
}

/* ---- data from the app ---- */
function fxInputs(){
  const rd=radarData(), scores={}, due={};
  try{ const ix=smIndex(); getAllKnownNames().forEach(n=>{ const f=churnFeatures(n,ix), r=churnScore(f); scores[n]=r.band==='nodata'?null:r.score; due[n]=f.dueMonths; }); }catch(e){}
  const students=rd.rows.filter(r=>r.fee>0).map(r=>({name:r.name, fee:r.fee, hazard:fxHazard(scores[r.name]), reliability:(due[r.name]||0)>=1?0.8:0.95}));
  const avg=students.length?students.reduce((t,s)=>t+s.fee,0)/students.length:0;
  return {students, newFee:Math.round(avg), freeSlots:rd.free.length, goal:radarGoal(), seed:glxHash(students.map(s=>s.name+s.fee).join('|'))};
}

/* ---- screen ---- */
let fx={months:6, newRate:0.4, res:null, levers:null, top:null, o:null, t:1, raf:0, last:0, cursor:null, W:0, H:0, dpr:1};
function fxOpen(){
  if(isFinanceHidden()){ showWarningToast('আগে আর্থিক হিসাব আনলক করো (রিপোর্ট ট্যাবের উপরে "দেখাও")।'); return; }
  const nr=Number(lsGet('tr_fxNew',0.4)); fx.newRate=isFinite(nr)?Math.max(0,Math.min(2,nr)):0.4; fx.months=6; fx.cursor=null;
  showKhataModal('🔮 ভবিষ্যৎ-যন্ত্র', '<div id="fxBox"></div>'); fxRun(true);
}
function fxRun(animate){
  const inp=fxInputs(), box=document.getElementById('fxBox'); if(!box) return;
  if(!inp.students.length){ box.innerHTML=emptyState({icon:'chart',title:'এখনো হিসাবের মতো ফি নেই',body:'শিক্ষার্থীদের মাসিক ফি দিলে এখানে আগামী মাসগুলোর সম্ভাব্য আয় দেখাবে।'}); return; }
  fx.o=Object.assign({},inp,{months:fx.months, newRate:fx.newRate, runs:1500, keep:70}); const t0=performance.now();
  fx.res=fxSim(fx.o); fx.levers=fxLevers(fx.o); fx.top=fxTopRisk(inp.students,fx.months,3); fx.ms=Math.round(performance.now()-t0);
  box.innerHTML=fxHtml(); fxSetup(animate);
}
function fxK(v){ return v>=1000?toBn((v/1000).toFixed(v>=10000?0:1))+'হা':toBn(Math.round(v)); }
function fxHtml(){
  const r=fx.res, M=fx.months, b=r.bands[M], goal=fx.o.goal, p=goal>0?r.pGoal:r.pAbove, pct=Math.round(p*100), col=pct>=70?'#5ef2c8':(pct>=40?'#f2c85e':'#ff6b81');
  const circ=2*Math.PI*44, maxd=Math.max(1,...fx.levers.map(l=>Math.abs(l.dAvg)));
  const chips=[3,6,12].map(m=>`<button type="button" class="pct-chip${m===M?' active':''}" onclick="fxSetMonths(${m})">${toBn(m)} মাস</button>`).join('');
  return `<div class="fx-tag"><b>FUTURE ENGINE</b><span>● ${toBn(r.runs)}টা কল্পিত ভবিষ্যৎ · ${toBn(fx.ms)} মিলিসেকেন্ডে</span></div>
    <div class="fx-chips">${chips}</div>
    <div class="fx-wrap"><canvas id="fxCanvas"></canvas></div><div id="fxRead" class="fx-read">টেনে দেখো — কোন মাসে কত হতে পারে</div>
    <div class="fx-cards"><div class="fx-gauge"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" id="fxRing" style="stroke:${col};stroke-dasharray:${circ.toFixed(1)};stroke-dashoffset:${circ.toFixed(1)}" data-to="${(circ*(1-p)).toFixed(1)}"/></svg><div class="fx-gn" style="color:${col}">${toBn(pct)}%</div></div>
      <div class="fx-gl"><b>${goal>0?`${toBn(M)} মাস পরে ${bnTaka(goal)}-এ পৌঁছানোর সম্ভাবনা`:`${toBn(M)} মাস পরে আজকের আয়ের ওপরে থাকার সম্ভাবনা`}</b>
        <span>মাঝারি পরিস্থিতিতে আয় <em>${bnTaka(b.p50)}</em></span><span>খারাপ দিনে (১০%) <em class="dn">${bnTaka(b.p10)}</em> · ভালো দিনে (৯০%) <em class="up">${bnTaka(b.p90)}</em></span><span>${toBn(M)} মাস পরে গড়ে ${toBn(r.endStudents.toFixed(1))} জন ছাত্র থাকবে (এখন ${toBn(fx.o.students.length)} জন)</span></div></div>
    ${goal>0?'':`<div class="sm-hint">🎯 আয়ের রাডারে লক্ষ্য দিলে এখানে "লক্ষ্যে পৌঁছানোর সম্ভাবনা" দেখাবে।</div>`}
    <div class="rd-sec">⚡ কোন পদক্ষেপে সবচেয়ে বেশি লাভ?</div>
    ${fx.levers.map(l=>`<div class="fx-lev"><div class="fx-lt"><span>${escapeHtml(l.label)}</span><b class="${l.dAvg>=0?'up':'dn'}">${l.dAvg>=0?'+':'−'}${bnTaka(Math.abs(l.dAvg))}/মাস গড়ে</b></div><div class="rd-bar"><i style="width:${Math.max(3,Math.abs(l.dAvg)/maxd*100)}%;background:${l.dAvg>=0?'var(--paid)':'var(--due)'}"></i></div>${l.dGoal!=null?`<div class="fx-ls">লক্ষ্যে পৌঁছানোর সম্ভাবনা ${l.dGoal>=0?'+':'−'}${toBn(Math.round(Math.abs(l.dGoal)*100))}%</div>`:`<div class="fx-ls">আজকের আয়ের ওপরে থাকার সম্ভাবনা ${l.dAbove>=0?'+':'−'}${toBn(Math.round(Math.abs(l.dAbove)*100))}%</div>`}</div>`).join('')}
    <div class="rd-sec">🎯 সবচেয়ে বড় ঝুঁকি (${toBn(M)} মাসে)</div>
    ${fx.top.map(t=>`<div class="fx-risk"><span>${escapeHtml(t.name)}</span><em>ছাড়ার সম্ভাবনা ${toBn(Math.round(t.pLeave*100))}% · প্রত্যাশিত ক্ষতি ${bnTaka(t.expectedLoss)}</em></div>`).join('')}
    <div class="rd-sec">🎚️ নতুন ছাত্র আনার হার</div>
    <div class="fx-step"><button type="button" onclick="fxNewStep(-0.1)" aria-label="কমাও">−</button><b>মাসে গড়ে ${toBn(fx.newRate.toFixed(1))} জন</b><button type="button" onclick="fxNewStep(0.1)" aria-label="বাড়াও">+</button></div>
    <div class="fx-asm"><b>🧪 অনুমান (সৎভাবে):</b><div>• ছাড়ার হার তোমার ঝুঁকি-স্কোর থেকে ধরা (স্কোর ০ ≈ মাসে ২%, ১০০ ≈ ২৭%) — বাস্তবে যাচাই করা নয়।</div><div>• ফি ৯৫% সময়মতো আসে (বাকি থাকলে ৮০%); দেরি হলে পরের মাসে আসে।</div><div>• নতুন ছাত্র মাসে গড়ে ${toBn(fx.newRate.toFixed(1))} জন আসে, ফাঁকা স্লট থাকা পর্যন্ত (সর্বোচ্চ ১০), ফি ≈ ${bnTaka(fx.o.newFee)}, মাসে ৩% ছাড়ে।</div><div>• ছুটি, মৌসুমি ওঠানামা, পরীক্ষার চাপ ধরা হয়নি। এটা <b>সম্ভাবনার পরিসর</b>, ভবিষ্যদ্বাণী নয়।</div></div>`;
}
function fxSetMonths(m){ fx.months=m; fx.cursor=null; fxRun(true); }
function fxNewStep(d){ fx.newRate=Math.max(0,Math.min(2,Math.round((fx.newRate+d)*10)/10)); lsSet('tr_fxNew',fx.newRate); fx.cursor=null; const b=document.getElementById('khataModalBody'), y=b?b.scrollTop:0; fxRun(true); if(b) b.scrollTop=y; }
function fxSetup(animate){
  const cv=document.getElementById('fxCanvas'); if(!cv) return; const wrap=cv.parentElement, W=wrap.clientWidth||340, H=270, dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px'; fx.W=W; fx.H=H; fx.dpr=dpr;
  const at=e=>{ const r=cv.getBoundingClientRect(), padL=44, padR=14, x=(e.clientX-r.left-padL)/(W-padL-padR); fx.cursor=Math.max(0,Math.min(fx.months,Math.round(x*fx.months))); if(!fx.raf) fxDraw(1); fxReadout(); };
  cv.onpointerdown=e=>{ cv.setPointerCapture(e.pointerId); at(e); }; cv.onpointermove=e=>{ if(e.buttons||e.pointerType==='touch') at(e); };
  const reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  setTimeout(()=>{ const ring=document.getElementById('fxRing'); if(ring) ring.style.strokeDashoffset=ring.dataset.to; },60);
  if(animate && !reduce){ fx.t=0; fx.last=performance.now(); if(fx.raf) cancelAnimationFrame(fx.raf); fx.raf=requestAnimationFrame(fxFrame); } else { fx.t=1; fxDraw(1); }
}
function fxFrame(ts){
  const cv=document.getElementById('fxCanvas'); if(!cv||!cv.offsetParent||document.hidden){ fx.raf=0; return; }
  fx.t=Math.min(1,fx.t+Math.min(0.05,(ts-fx.last)/1000)/2.6); fx.last=ts; fxDraw(fx.t);
  if(fx.t<1) fx.raf=requestAnimationFrame(fxFrame); else fx.raf=0;                                     // one-off animation: no loop left running
}
function fxReadout(){
  const el=document.getElementById('fxRead'); if(!el||fx.cursor==null||!fx.res) return; const b=fx.res.bands[fx.cursor];
  el.innerHTML=`<b>${fx.cursor===0?'এখন':toBn(fx.cursor)+' মাস পরে'}</b> — খারাপ <span class="dn">${bnTaka(b.p10)}</span> · মাঝারি <span style="color:#f2c85e">${bnTaka(b.p50)}</span> · ভালো <span class="up">${bnTaka(b.p90)}</span>`;
}
function fxDraw(t){
  const cv=document.getElementById('fxCanvas'); if(!cv||!fx.res) return; const ctx=cv.getContext('2d'), W=fx.W, H=fx.H, r=fx.res, M=r.months, goal=fx.o.goal;
  ctx.setTransform(fx.dpr,0,0,fx.dpr,0,0); const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#0a1230'); bg.addColorStop(1,'#03040c'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  const padL=44, padR=14, padT=16, padB=26, x=m=>padL+(W-padL-padR)*m/M;
  let top=Math.max(...r.bands.map(b=>b.p90), ...r.paths.map(p=>Math.max(...p)), goal>0?goal:0, r.base0)*1.08, y=v=>H-padB-(H-padT-padB)*v/top;
  ctx.strokeStyle='rgba(120,190,255,0.12)'; ctx.fillStyle='rgba(180,210,255,0.55)'; ctx.font='10px sans-serif'; ctx.lineWidth=1; ctx.textAlign='right';
  for(let k=0;k<=4;k++){ const v=top*k/4, yy=y(v); ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(W-padR,yy); ctx.stroke(); ctx.fillText('৳'+fxK(v),padL-6,yy+3); }
  ctx.textAlign='center'; for(let m=0;m<=M;m++){ if(M>6&&m%2) continue; ctx.fillText(toBn(m),x(m),H-9); }
  const reveal=t*M;
  const pathTo=(arr,upto)=>{ ctx.beginPath(); for(let m=0;m<=Math.floor(upto);m++){ m?ctx.lineTo(x(m),y(arr[m])):ctx.moveTo(x(m),y(arr[m])); } const f=upto-Math.floor(upto); if(f>0&&Math.floor(upto)<M){ const m=Math.floor(upto); ctx.lineTo(x(m)+(x(m+1)-x(m))*f, y(arr[m])+(y(arr[m+1])-y(arr[m]))*f); } };
  ctx.globalCompositeOperation='lighter'; ctx.lineWidth=1; ctx.strokeStyle='rgba(90,200,255,0.16)'; r.paths.forEach(p=>{ pathTo(p,reveal); ctx.stroke(); }); ctx.globalCompositeOperation='source-over';
  const fade=Math.max(0,Math.min(1,(t-0.3)/0.5)), band=(lo,hi,a)=>{ ctx.beginPath(); for(let m=0;m<=M;m++){ const yy=y(r.bands[m][hi]); m?ctx.lineTo(x(m),yy):ctx.moveTo(x(m),yy); } for(let m=M;m>=0;m--) ctx.lineTo(x(m),y(r.bands[m][lo])); ctx.closePath(); ctx.fillStyle=`rgba(120,200,255,${a*fade})`; ctx.fill(); };
  band('p10','p90',0.12); band('p25','p75',0.2);
  if(goal>0){ const yg=y(goal); ctx.setLineDash([6,5]); ctx.strokeStyle='rgba(255,90,200,0.85)'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(padL,yg); ctx.lineTo(W-padR,yg); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='rgba(255,140,220,0.95)'; ctx.textAlign='left'; ctx.fillText('🎯 লক্ষ্য',padL+4,yg-5); }
  ctx.strokeStyle='#f2c85e'; ctx.lineWidth=2.4; ctx.shadowColor='rgba(242,200,94,0.9)'; ctx.shadowBlur=10; pathTo(r.bands.map(b=>b.p50),reveal); ctx.stroke(); ctx.shadowBlur=0;
  if(fx.cursor!=null){ const c=fx.cursor, xc=x(c); ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.moveTo(xc,padT); ctx.lineTo(xc,H-padB); ctx.stroke(); ctx.setLineDash([]); [['p10','#ff8a9a'],['p50','#f2c85e'],['p90','#7dffd8']].forEach(([k,col])=>{ ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=8; ctx.beginPath(); ctx.arc(xc,y(r.bands[c][k]),4,0,6.283); ctx.fill(); ctx.shadowBlur=0; }); }
}
