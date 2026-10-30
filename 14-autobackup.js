/* ============ স্বয়ংক্রিয় অনলাইন ব্যাকআপ ============ */
/* নেট থাকলে ডেটা বদলালেই নিজে থেকে ব্যাকআপ যায় — অনুমতি লাগে না। নেট না থাকলে অপেক্ষায় থাকে, নেট এলেই পাঠায়। */
/* ফোনেই AES-GCM দিয়ে এনক্রিপ্ট হয়ে যায়; সার্ভারে শুধু অর্থহীন লেখা থাকে। খোলার চাবি = ফোনের রিকভারি কোড। */
const AB_KEY='tr_abKey', AB_HASH='tr_abHash', AB_AT='tr_abAt', AB_ERR='tr_abErr', AB_ON='tr_abOn', AB_URL='/.netlify/functions/backup';
const AB_ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789';        // no 0/O/1/I/L — easy to read out and type
function abNorm(k){ return String(k||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function abFmt(k){ return abNorm(k).replace(/(.{4})(?=.)/g,'$1-'); }
function abEnabled(){ return lsGet(AB_ON,true)!==false; }
function abGetKey(){
  let k=abNorm(lsGet(AB_KEY,''));
  if(k.length!==20){ const out=[]; while(out.length<20){ const b=crypto.getRandomValues(new Uint8Array(32)); for(const x of b){ if(x<248 && out.length<20) out.push(AB_ALPHA[x%31]); } } k=out.join(''); lsSet(AB_KEY,k); }
  return k;
}
async function abSha(str){ return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))); }
async function abIdOf(key){ return [...(await abSha('tr-id:'+abNorm(key)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,40); }
async function abAesKey(key){ return crypto.subtle.importKey('raw', await abSha('tr-enc:'+abNorm(key)), 'AES-GCM', false, ['encrypt','decrypt']); }
async function abStream(bytes, TransformCtor, kind){ const s=new Blob([bytes]).stream().pipeThrough(new TransformCtor(kind)); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function abPack(text, key){
  let bytes=new TextEncoder().encode(text), z=0;
  if(typeof CompressionStream!=='undefined'){ try{ bytes=await abStream(bytes, CompressionStream, 'gzip'); z=1; }catch(e){ bytes=new TextEncoder().encode(text); } }
  const iv=crypto.getRandomValues(new Uint8Array(12)), ct=await crypto.subtle.encrypt({name:'AES-GCM', iv}, await abAesKey(key), bytes);
  return {v:1, z, iv:b64FromBytes(iv), data:b64FromBytes(ct)};
}
async function abUnpack(blob, key){
  let bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:bytesFromB64(blob.iv)}, await abAesKey(key), bytesFromB64(blob.data)));
  if(blob.z) bytes=await abStream(bytes, DecompressionStream, 'gzip');
  return JSON.parse(new TextDecoder().decode(bytes));
}
function abHashOf(s){ let h=0x811c9dc5; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; } return h.toString(16)+':'+s.length; }
let abBusy=false;
async function abRun(o){
  o=o||{};
  if(abBusy) return false;
  if(!o.force && !abEnabled()) return false;
  if(!(window.crypto && crypto.subtle)) return false;
  if(!navigator.onLine){ if(o.manual) showWarningToast('এখন ইন্টারনেট নেই — নেট এলে নিজে থেকেই ব্যাকআপ হয়ে যাবে।'); abRefreshCard(); return false; }
  const data=collectBackupData(); if(!Object.keys(data).length){ if(o.manual) showWarningToast('ব্যাকআপ নেওয়ার মতো কোনো তথ্য এখনো নেই।'); return false; }
  const dataStr=JSON.stringify(data), h=abHashOf(dataStr);
  if(!o.force && h===lsGet(AB_HASH,'')) return false;                       // nothing changed since the last good upload
  abBusy=true; abRefreshCard();
  try{
    const key=abGetKey(), id=await abIdOf(key), blob=await abPack(JSON.stringify({app:'tuition-routine', v:1, exportedAt:new Date().toISOString(), data}), key);
    const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(), 25000);
    let res; try{ res=await fetch(AB_URL,{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'put', id, blob}), signal:ctrl.signal}); } finally { clearTimeout(to); }
    if(!res.ok) throw new Error(res.status===413?'তথ্য অনেক বড়':(res.status===404?'সার্ভারে ব্যাকআপ ফাংশন পাওয়া যায়নি':'সার্ভার '+res.status));
    const now=new Date().toISOString(); lsSet(AB_HASH,h); lsSet(AB_AT,now); lsSet(AB_ERR,''); lsSet('tr_lastBackupAt',now);
    try{ renderBackupNag(); }catch(e){}
    if(o.manual) showSuccessToast('অনলাইন ব্যাকআপ হয়ে গেছে ✅');
    return true;
  }catch(e){
    const msg=(e&&e.name==='AbortError')?'নেট খুব ধীর':String((e&&e.message)||e); lsSet(AB_ERR,msg);
    if(o.manual) showWarningToast('ব্যাকআপ হয়নি: '+msg);
    return false;
  }finally{ abBusy=false; abRefreshCard(); }
}
async function abRestoreFlow(){
  const mine=lsGet(AB_KEY,'');
  const inp=prompt('অনলাইন ব্যাকআপের রিকভারি কোড লেখো (এই ফোনের কোডটাই বসানো আছে; নতুন ফোনে পুরনো ফোনের কোড দাও):', mine?abFmt(mine):'');
  if(inp===null) return;
  const key=abNorm(inp); if(key.length!==20){ showWarningToast('কোডটা ২০ অক্ষরের হবে — আবার দেখো।'); return; }
  if(!navigator.onLine){ showWarningToast('ইন্টারনেট ছাড়া অনলাইন ব্যাকআপ আনা যাবে না।'); return; }
  try{
    const res=await fetch(AB_URL,{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'get', id:await abIdOf(key)})});
    if(res.status===404){ showWarningToast('এই কোডে কোনো ব্যাকআপ পাওয়া যায়নি।'); return; }
    if(!res.ok) throw new Error('server');
    const rec=await res.json(); let payload;
    try{ payload=await abUnpack(rec.blob, key); }catch(e){ showWarningToast('কোড ভুল, অথবা ব্যাকআপটা নষ্ট।'); return; }
    if(!validateBackupPayload(payload)){ showWarningToast('ব্যাকআপের ভেতরের তথ্য ঠিক নেই।'); return; }
    payload._abKey=key; if(!payload.exportedAt) payload.exportedAt=rec.savedAt;
    showImportPreview(payload);
  }catch(e){ showWarningToast('অনলাইন ব্যাকআপ আনা যায়নি — নেট দেখে আবার চেষ্টা করো।'); }
}
function abToggle(){ lsSet(AB_ON, !abEnabled()); abRefreshCard(); if(abEnabled()) abRun(); }
function abShowCode(){ const k=abFmt(abGetKey()); const el=document.getElementById('abCode'); if(!el) return; el.style.display='block'; el.innerHTML=`<div style="font-size:11.5px;color:var(--muted);margin-bottom:6px;">রিকভারি কোড — কোথাও লিখে বা কপি করে রাখো:</div><div style="font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:700;letter-spacing:1px;text-align:center;padding:10px;border-radius:var(--r-md);background:var(--ov006);color:var(--gold);user-select:all;">${k}</div><button class="settings-btn" onclick="abCopyCode()">📋 কোড কপি করো</button>`; }
function abCopyCode(){ const k=abFmt(abGetKey()); try{ navigator.clipboard.writeText(k).then(()=>showSuccessToast('কোড কপি হয়েছে'),()=>showWarningToast('কপি হয়নি — কোডটা নিজে লিখে রাখো।')); }catch(e){ showWarningToast('কপি হয়নি — কোডটা নিজে লিখে রাখো।'); } }
function abStatusHtml(){
  if(!abEnabled()) return '<div class="backup-status backup-status-warn">⏸ স্বয়ংক্রিয় ব্যাকআপ বন্ধ আছে</div>';
  const at=lsGet(AB_AT,null), err=lsGet(AB_ERR,''), changed=abHashOf(JSON.stringify(collectBackupData()))!==lsGet(AB_HASH,'');
  const when=at?(()=>{ const d=new Date(at), days=Math.floor((Date.now()-d.getTime())/86400000), hm=toBn(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')); return (days<=0?'আজ':days===1?'গতকাল':toBn(days)+' দিন আগে')+', '+hm; })():'';
  if(abBusy) return '<div class="backup-status">⏳ ব্যাকআপ হচ্ছে…</div>';
  if(!navigator.onLine) return `<div class="backup-status${changed?' backup-status-warn':''}">📴 অফলাইন — ${changed?'নতুন বদল জমে আছে, নেট এলেই নিজে থেকে ব্যাকআপ হবে':'সবই ব্যাকআপ করা আছে'}${when?` (সর্বশেষ: ${when})`:''}</div>`;
  if(err && changed) return `<div class="backup-status backup-status-warn">⚠️ সর্বশেষ চেষ্টা ব্যর্থ (${escapeHtml(err)}) — আবার চেষ্টা করবে</div>`;
  return `<div class="backup-status">${at?`☁️ সর্বশেষ অনলাইন ব্যাকআপ: ${when}${changed?' · নতুন বদল পাঠানো হবে':''}`:'☁️ চালু আছে — এখনো প্রথম ব্যাকআপ যায়নি'}</div>`;
}
function abCardHtml(){
  return `<div id="abCard" class="ab-card">${abCardInner()}</div>`;
}
function abCardInner(){
  return `<div style="font-size:12.5px;font-weight:700;color:var(--paper);margin-bottom:4px;">☁️ স্বয়ংক্রিয় অনলাইন ব্যাকআপ</div>
    <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:8px;">নেট থাকলে ডেটা বদলালেই নিজে থেকে ব্যাকআপ হয়ে যায় — কিছু চাপতে হয় না। নেট না থাকলে অ্যাপ অফলাইনেই চলে, নেট এলে জমে থাকা বদল পাঠিয়ে দেয়। ডেটা ফোনেই এনক্রিপ্ট হয়ে যায়, রিকভারি কোড ছাড়া কেউ পড়তে পারে না।</div>
    ${abStatusHtml()}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><button class="settings-btn" style="margin:0;" onclick="abRun({force:true,manual:true})">☁️ এখনই ব্যাকআপ</button><button class="settings-btn" style="margin:0;" onclick="abToggle()">${abEnabled()?'⏸ বন্ধ করো':'▶️ চালু করো'}</button></div>
    <button class="settings-btn" onclick="abRestoreFlow()">📥 অনলাইন ব্যাকআপ থেকে ফিরিয়ে আনো</button>
    <button class="settings-btn" onclick="abShowCode()">🔑 রিকভারি কোড দেখো (নতুন ফোনে লাগবে)</button>
    <div id="abCode" style="display:none;margin-top:8px;"></div>`;
}
function abRefreshCard(){ const c=document.getElementById('abCard'); if(!c) return; const code=document.getElementById('abCode'), open=code&&code.style.display==='block'; c.innerHTML=abCardInner(); if(open) abShowCode(); }
window.addEventListener('online', ()=>{ abRefreshCard(); setTimeout(()=>abRun(),1500); });     // নেট ফিরলেই জমে থাকা বদল পাঠাও
window.addEventListener('offline', abRefreshCard);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) setTimeout(()=>abRun(),1500); });
setInterval(()=>abRun(), 120000);
setTimeout(()=>abRun(), 6000);
