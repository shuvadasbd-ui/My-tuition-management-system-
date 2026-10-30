/* ============ 🌌 ছাত্র-গ্যালাক্সি — তোমার টিউশনের জীবন্ত ত্রিমাত্রিক ব্রহ্মাণ্ড ============ */
/* সূর্য = তুমি। প্রতিটা ছাত্র একটা গ্রহ: রং = ঝুঁকি/অগ্রগতি/আয় (মোড বদলাও), আকার = অগ্রগতি, কক্ষপথ = ক্লাসের সংখ্যা (ভেতরে বেশি), */
/* ঘোরার গতি = উপস্থিতি, লাল উপগ্রহ = ফি বাকি, ঝাপসা রেখা = একসঙ্গে পড়া ছাত্র। টেনে ঘোরাও, চিমটি কেটে জুম করো, ফোন হেলালে গভীরতা নড়ে। */

/* ---- pure (unit-tested) ---- */
function glxHash(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h; }
const GLX_BAND={low:'#5ef2c8', medium:'#f2c85e', high:'#ff6b81', nodata:'#8aa0ff'};
/* rows: [{name, progress 0..100, attendance null|0..100, band, sessions, fee, due, mates:[...]}] → planets on rings */
function glxBuild(rows, mode){
  mode=mode||'health';
  const maxFee=Math.max(1,...rows.map(r=>r.fee||0));
  /* বেশি ক্লাসের ছাত্র ভেতরের কক্ষপথে; কক্ষপথ ভরে গেলে পরেরটায় — যাতে ভিড় না হয় */
  const order=rows.slice().sort((a,b)=>(b.sessions||0)-(a.sessions||0)||a.name.localeCompare(b.name)), byRing={}; let k0=0, used=0;
  order.forEach(r=>{ if(used>=2+2*k0){ k0++; used=0; } (byRing[k0]=byRing[k0]||[]).push(r); used++; });
  const nodes=[], rings=[];
  Object.keys(byRing).map(Number).sort((a,b)=>a-b).forEach(k=>{
    const list=byRing[k].slice().sort((a,b)=>a.name.localeCompare(b.name)), rad=0.34+0.15*k, seed=(glxHash('ring'+k)%628)/100;
    rings.push(rad);
    list.forEach((r,i)=>{
      const att=r.attendance==null?60:r.attendance, prog=Math.max(0,Math.min(100,Number(r.progress)||0)), fr=Math.min(1,(r.fee||0)/maxFee);
      let color; if(mode==='progress') color=`hsl(${Math.round(prog*1.4)},85%,62%)`; else if(mode==='income') color=`hsl(45,92%,${Math.round(42+30*fr)}%)`; else color=GLX_BAND[r.band]||GLX_BAND.nodata;
      nodes.push({name:r.name, ring:k, r:rad, a0:seed+Math.PI*2*i/list.length+(glxHash(r.name)%100)/2000, speed:(0.035+att/100*0.11)*(k%2?-1:1),
        size:mode==='income'?5+fr*9:5+prog/100*9, color, glow:0.45+att/200, sat:!!r.due, incl:((glxHash(r.name+'i')%100)/100-0.5)*0.22, phase:(glxHash(r.name+'p')%628)/100, mates:r.mates||[]});
    });
  });
  return {nodes, rings};
}
/* pure: 3-D → screen. cam:{rx,ry,zoom} */
function glxProject(p, cam, w, h){
  const cy=Math.cos(cam.ry), sy=Math.sin(cam.ry), cx=Math.cos(cam.rx), sx=Math.sin(cam.rx);
  const x=p.x*cy+p.z*sy; let z=-p.x*sy+p.z*cy; const y=p.y*cx-z*sx; z=p.y*sx+z*cx;
  const f=2.6/(2.6+z*0.9), S=Math.min(w,h)*0.46*cam.zoom;
  return {sx:w/2+x*f*S, sy:h/2+y*f*S, z, f};
}
function glxPos(n, t){ const a=n.a0+n.speed*t; return {x:n.r*Math.cos(a), z:n.r*Math.sin(a), y:Math.sin(a+n.phase)*n.r*n.incl*3}; }

/* ---- data from the app ---- */
function glxRows(){
  const hid=(typeof isFinanceHidden==='function')&&isFinanceHidden(), prog=getProgressData(), rows=[], cellsByName={}, ix=smIndex();
  SCHEDULE.forEach(s=>DAYS.forEach(d=>{ const names=getCellText(s,d).split(',').map(x=>x.trim()).filter(Boolean); names.forEach(n=>{ (cellsByName[n]=cellsByName[n]||[]).push(names); }); }));
  Object.keys(cellsByName).forEach(name=>{
    let tot=0, cnt=0; Object.keys(prog[name]||{}).forEach(s=>(prog[name][s]||[]).forEach(c=>{ tot+=Number(c.pct)||0; cnt++; }));
    let att=null, band='nodata', fee=0, due=false;
    try{ att=computeStudentSummary(name).attendanceRate; }catch(e){}
    try{ band=churnScore(churnFeatures(name,ix)).band; }catch(e){}
    if(!hid){ try{ fee=getStudentPayment(name).monthlyFee||0; due=getStudentTotalDue(name)>0; }catch(e){} }
    const mates=new Set(); cellsByName[name].forEach(g=>{ if(g.length>1) g.forEach(m=>{ if(m!==name) mates.add(m); }); });
    rows.push({name, progress:cnt?tot/cnt:0, attendance:att, band, sessions:cellsByName[name].length, fee, due, mates:[...mates]});
  });
  return rows;
}

/* ---- renderer ---- */
let glx={raf:0, nodes:[], rings:[], rows:[], cam:{rx:0.85,ry:0,zoom:1}, t:0, last:0, sel:null, mode:'health', auto:true, idle:0, ptr:{}, moved:0, tilt:{x:0,y:0}, stars:[], reduce:false, shoot:null};
function glxOpen(){
  const rows=glxRows();
  if(!rows.length){ showWarningToast('গ্যালাক্সি বানাতে আগে শিডিউলে ছাত্র বসাও।'); return; }
  glx.rows=rows; glx.sel=null; glx.mode='health'; glx.auto=true; glx.t=0; glx.cam={rx:1.0,ry:0.3,zoom:1.14}; glx.reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  glx.stars=Array.from({length:170},()=>({x:Math.random(),y:Math.random(),z:Math.random(),p:Math.random()*6.28}));
  showKhataModal('🌌 ছাত্র-গ্যালাক্সি', `<div id="glxWrap" class="glx-wrap"><canvas id="glxCanvas"></canvas><div class="glx-scan"></div>
    <div class="glx-top"><div class="glx-tag"><b>STUDENT GALAXY</b><span>● ${toBn(rows.length)} জন · ☀️ সূর্য = তুমি</span></div>
      <div class="glx-modes"><button type="button" data-m="health" class="on" onclick="glxMode('health')">ঝুঁকি</button><button type="button" data-m="progress" onclick="glxMode('progress')">অগ্রগতি</button><button type="button" data-m="income" onclick="glxMode('income')">আয়</button></div></div>
    <div class="glx-legend">রং = মোড · আকার = অগ্রগতি · কক্ষপথ = ক্লাস (ভেতরে বেশি) · গতি = উপস্থিতি</div><div id="glxHud" class="glx-hud" style="display:none;"></div></div>`);
  setTimeout(()=>{ glxSetup(); },60);
}
function glxMode(m){ glx.mode=m; document.querySelectorAll('.glx-modes button').forEach(b=>b.classList.toggle('on',b.dataset.m===m)); const sel=glx.sel&&glx.sel.name; glxRebuild(); if(sel){ const n=glx.nodes.find(x=>x.name===sel); if(n) glxSelect(n); } }
function glxRebuild(){ const b=glxBuild(glx.rows, glx.mode); glx.nodes=b.nodes; glx.rings=b.rings; }
function glxSetup(){
  const wrap=document.getElementById('glxWrap'), cv=document.getElementById('glxCanvas'); if(!wrap||!cv) return;
  const top=wrap.getBoundingClientRect().top, H=Math.max(380,Math.round(window.innerHeight-top-6)), W=wrap.clientWidth, dpr=Math.min(2,window.devicePixelRatio||1);
  wrap.style.height=H+'px'; cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px'; glx.W=W; glx.H=H; glx.dpr=dpr;
  glxRebuild();
  const P=glx.ptr; let pinch=0;
  cv.onpointerdown=e=>{ cv.setPointerCapture(e.pointerId); P[e.pointerId]={x:e.clientX,y:e.clientY}; glx.moved=0; glx.auto=false; glx.idle=0; };
  cv.onpointermove=e=>{ const p=P[e.pointerId]; if(!p) return; const ids=Object.keys(P);
    if(ids.length===2){ const [a,b]=ids.map(i=>P[i]); const d0=Math.hypot(a.x-b.x,a.y-b.y); P[e.pointerId]={x:e.clientX,y:e.clientY}; const [c,d]=ids.map(i=>P[i]); const d1=Math.hypot(c.x-d.x,c.y-d.y); glx.cam.zoom=Math.max(0.6,Math.min(2.2,glx.cam.zoom*(d1/(d0||d1)))); glx.moved+=10; return; }
    const dx=e.clientX-p.x, dy=e.clientY-p.y; glx.moved+=Math.abs(dx)+Math.abs(dy); glx.cam.ry+=dx*0.008; glx.cam.rx=Math.max(-0.25,Math.min(1.35,glx.cam.rx+dy*0.006)); P[e.pointerId]={x:e.clientX,y:e.clientY}; };
  cv.onpointerup=cv.onpointercancel=e=>{ const had=P[e.pointerId]; delete P[e.pointerId]; if(had && glx.moved<8 && e.type==='pointerup'){ const r=cv.getBoundingClientRect(); glxTap(e.clientX-r.left, e.clientY-r.top); } };
  cv.onwheel=e=>{ e.preventDefault(); glx.cam.zoom=Math.max(0.6,Math.min(2.2,glx.cam.zoom*(e.deltaY<0?1.08:0.93))); glx.auto=false; glx.idle=0; };
  if(!glx.gyro){ glx.gyro=true; window.addEventListener('deviceorientation',e=>{ if(e.gamma==null) return; glx.tilt.x=Math.max(-1,Math.min(1,(e.gamma||0)/35)); glx.tilt.y=Math.max(-1,Math.min(1,((e.beta||45)-45)/35)); }); }
  if(glx.raf) cancelAnimationFrame(glx.raf); glx.last=performance.now(); glx.raf=requestAnimationFrame(glxFrame);
  if(!glx.vis){ glx.vis=true; document.addEventListener('visibilitychange',()=>{ const c=document.getElementById('glxCanvas'); if(!document.hidden && !glx.raf && c && c.offsetParent){ glx.last=performance.now(); glx.raf=requestAnimationFrame(glxFrame); } }); }
}
function glxTap(x,y){
  let best=null, bd=1e9; glx.nodes.forEach(n=>{ if(n.px==null) return; const d=Math.hypot(n.px-x,n.py-y); if(d<Math.max(n.pr+16,26) && d<bd){ bd=d; best=n; } });
  if(best) glxSelect(best); else { glx.sel=null; const h=document.getElementById('glxHud'); if(h) h.style.display='none'; }
}
function glxSelect(n){
  glx.sel=n; const r=glx.rows.find(x=>x.name===n.name)||{}, hid=(typeof isFinanceHidden==='function')&&isFinanceHidden(), h=document.getElementById('glxHud'); if(!h) return;
  const bar=(l,v,c)=>`<div class="glx-bar"><span>${l}</span><i><u style="width:${Math.max(2,Math.min(100,v))}%;background:${c}"></u></i><b>${toBn(Math.round(v))}%</b></div>`;
  let nextC=''; try{ const s=sfSessionDates(n.name,14)[0]; if(s) nextC=`পরের ক্লাস: ${sfDateBn(s)}`; }catch(e){}
  const band={low:'নিরাপদ',medium:'মাঝারি ঝুঁকি',high:'উচ্চ ঝুঁকি',nodata:'তথ্য কম'}[r.band]||'';
  h.innerHTML=`<div class="glx-hud-h"><b style="color:${n.color}">${escapeHtml(n.name)}</b><button type="button" onclick="glxClose()" aria-label="বন্ধ">✕</button></div>
    ${bar('অগ্রগতি',r.progress||0,'#7bd8ff')}${r.attendance==null?'':bar('উপস্থিতি',r.attendance,'#5ef2c8')}
    <div class="glx-hud-m"><span>${band}</span><span>সপ্তাহে ${toBn(r.sessions||0)} ক্লাস</span>${nextC?`<span>${nextC}</span>`:''}${(!hid&&r.due)?'<span class="due">🔴 ফি বাকি</span>':''}${n.mates.length?`<span>👥 ${n.mates.slice(0,3).map(escapeHtml).join(', ')}</span>`:''}</div>
    <div class="glx-hud-b"><button type="button" onclick="churnMsgOpen('${jsq(n.name)}')">📩 মেসেজ</button><button type="button" onclick="sfOpen()">🧭 সিলেবাস</button></div>`;
  h.style.display='block';
}
function glxClose(){ glx.sel=null; const h=document.getElementById('glxHud'); if(h) h.style.display='none'; }
function glxFrame(ts){
  const cv=document.getElementById('glxCanvas'); if(!cv || !cv.offsetParent || document.hidden){ glx.raf=0; return; }   // page closed (hidden, but still in the DOM) or app in background: stop drawing, save battery
  const dt=Math.min(0.05,(ts-glx.last)/1000); glx.last=ts; if(!glx.reduce) glx.t+=dt;
  glx.idle+=dt; if(!glx.auto && glx.idle>7 && !Object.keys(glx.ptr).length) glx.auto=true;
  if(glx.auto && !glx.reduce) glx.cam.ry+=dt*0.1;
  const ctx=cv.getContext('2d'), W=glx.W, H=glx.H, dpr=glx.dpr, T=glx.t; ctx.setTransform(dpr,0,0,dpr,0,0);
  const cam={rx:glx.cam.rx+glx.tilt.y*0.12, ry:glx.cam.ry+glx.tilt.x*0.18, zoom:glx.cam.zoom};
  /* space */
  const bg=ctx.createRadialGradient(W/2,H/2,10,W/2,H/2,Math.max(W,H)*0.75); bg.addColorStop(0,'#101a3a'); bg.addColorStop(0.5,'#080c1f'); bg.addColorStop(1,'#02030a'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  const neb=(x,y,r,c)=>{ const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,c); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); };
  neb(W*(0.25-cam.ry*0.02),H*0.3,W*0.6,'rgba(120,70,255,0.16)'); neb(W*(0.8-cam.ry*0.02),H*0.75,W*0.55,'rgba(0,200,255,0.12)');
  glx.stars.forEach(s=>{ const px=((s.x+cam.ry*0.03*(0.3+s.z))%1+1)%1*W, py=(s.y+cam.rx*0.01*s.z)%1*H, a=0.25+0.6*Math.abs(Math.sin(T*0.8*s.z+s.p)); ctx.globalAlpha=a; ctx.fillStyle='#cfe4ff'; ctx.fillRect(px,py,0.6+s.z*1.4,0.6+s.z*1.4); }); ctx.globalAlpha=1;
  if(!glx.shoot && !glx.reduce && Math.random()<0.004) glx.shoot={x:Math.random()*W*0.7,y:Math.random()*H*0.4,l:0};
  if(glx.shoot){ const s=glx.shoot; s.l+=dt*1.6; ctx.strokeStyle=`rgba(190,230,255,${Math.max(0,1-s.l)})`; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(s.x+s.l*160,s.y+s.l*90); ctx.lineTo(s.x+s.l*160-60,s.y+s.l*90-34); ctx.stroke(); if(s.l>1) glx.shoot=null; }
  /* orbit rings */
  ctx.lineWidth=1; glx.rings.forEach((rad,i)=>{ ctx.strokeStyle=`rgba(120,190,255,${0.16-i*0.015})`; ctx.beginPath(); for(let k=0;k<=72;k++){ const a=k/72*Math.PI*2, p=glxProject({x:rad*Math.cos(a),y:0,z:rad*Math.sin(a)},cam,W,H); k?ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy); } ctx.stroke(); });
  /* project everything, sort far → near */
  const items=glx.nodes.map(n=>{ const p=glxProject(glxPos(n,T),cam,W,H); n.px=p.sx; n.py=p.sy; n.pr=n.size*p.f*Math.min(1.5,glx.cam.zoom); n.pz=p.z; return n; });
  /* constellation lines between students who study together */
  ctx.lineWidth=1; const byName={}; items.forEach(n=>{ byName[n.name]=n; }); items.forEach(n=>n.mates.forEach(m=>{ const o=byName[m]; if(o && n.name<m){ ctx.strokeStyle='rgba(160,220,255,0.18)'; ctx.beginPath(); ctx.moveTo(n.px,n.py); ctx.lineTo(o.px,o.py); ctx.stroke(); } }));
  /* sun */
  const c=glxProject({x:0,y:0,z:0},cam,W,H), sr=(16+Math.sin(T*2)*1.6)*c.f*Math.min(1.4,glx.cam.zoom);
  ctx.globalCompositeOperation='lighter'; const sg=ctx.createRadialGradient(c.sx,c.sy,0,c.sx,c.sy,sr*4.5); sg.addColorStop(0,'rgba(255,230,150,0.95)'); sg.addColorStop(0.25,'rgba(255,170,60,0.45)'); sg.addColorStop(1,'rgba(255,120,0,0)'); ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(c.sx,c.sy,sr*4.5,0,6.283); ctx.fill();
  for(let r=0;r<9;r++){ const a=T*0.3+r*0.698; ctx.strokeStyle='rgba(255,210,120,0.22)'; ctx.beginPath(); ctx.moveTo(c.sx+Math.cos(a)*sr*1.3,c.sy+Math.sin(a)*sr*1.3); ctx.lineTo(c.sx+Math.cos(a)*sr*(2.4+Math.sin(T*1.5+r)*0.5),c.sy+Math.sin(a)*sr*(2.4+Math.sin(T*1.5+r)*0.5)); ctx.stroke(); }
  ctx.globalCompositeOperation='source-over'; ctx.fillStyle='#fff3c4'; ctx.beginPath(); ctx.arc(c.sx,c.sy,sr*0.8,0,6.283); ctx.fill();
  /* planets */
  items.sort((a,b)=>b.pz-a.pz).forEach(n=>{
    const sel=glx.sel&&glx.sel.name===n.name, r=n.pr, dim=0.55+0.45*(1-(n.pz+1)/2);
    ctx.globalCompositeOperation='lighter'; const g=ctx.createRadialGradient(n.px,n.py,0,n.px,n.py,r*3.4); g.addColorStop(0,n.color); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.globalAlpha=0.5*n.glow*dim; ctx.fillStyle=g; ctx.beginPath(); ctx.arc(n.px,n.py,r*3.4,0,6.283); ctx.fill();
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=Math.min(1,0.55+dim*0.5);
    const pg=ctx.createRadialGradient(n.px-r*0.35,n.py-r*0.4,r*0.1,n.px,n.py,r); pg.addColorStop(0,'#ffffff'); pg.addColorStop(0.35,n.color); pg.addColorStop(1,'rgba(10,14,40,0.95)'); ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(n.px,n.py,r,0,6.283); ctx.fill(); ctx.globalAlpha=1;
    if(n.sat){ const a=T*2.4+n.phase, sx=n.px+Math.cos(a)*(r+8), sy=n.py+Math.sin(a)*(r+8)*0.7; ctx.fillStyle='#ff4d5e'; ctx.shadowColor='#ff4d5e'; ctx.shadowBlur=8; ctx.beginPath(); ctx.arc(sx,sy,2.4,0,6.283); ctx.fill(); ctx.shadowBlur=0; }
    if(sel){ ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=1.4; ctx.setLineDash([5,4]); ctx.lineDashOffset=-T*20; ctx.beginPath(); ctx.arc(n.px,n.py,r+9,0,6.283); ctx.stroke(); ctx.setLineDash([]); }
    if(sel || n.pz<0.15 && glx.nodes.length<=22 || r>9.5){ ctx.font='600 11px sans-serif'; ctx.textAlign='center'; ctx.fillStyle=sel?'#fff':'rgba(220,235,255,0.82)'; ctx.fillText(n.name.split(/\s+/)[0].slice(0,9), n.px, n.py+r+14); }
  });
  glx.raf=requestAnimationFrame(glxFrame);
}
