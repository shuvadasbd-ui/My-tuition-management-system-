/* ============ 👆 আঙুলের ছাপ / ফেস লক (WebAuthn) ============ */
/* ফোনের নিজস্ব বায়োমেট্রিক (স্ক্রিন-লক) ব্যবহার হয় — আঙুলের ছাপ অ্যাপে বা কোথাও জমা হয় না, শুধু ফোন "হ্যাঁ, ঠিক মানুষ" সই করে দেয়। */
/* অ্যাপ সেই সই ফোনেই যাচাই করে (চ্যালেঞ্জ + আসল পাবলিক-কী)। আর্থিক হিসাব দেখানো, খাতা খোলা, এমনকি অ্যাপ খোলা — প্রতিটা আলাদাভাবে লক করা যায়। */
/* নিরাপত্তার সীমা (সৎভাবে): এটা অন্যের হাতে থাকা আনলক করা ফোন থেকে অ্যাপের গোপন তথ্য আড়াল করে; কেউ ফোনের ব্রাউজার-ডেটা সরাসরি ঘাঁটলে এটা ঠেকায় না। */
/* নিজেকে লক করে ফেলার বিপদ ঠেকাতে: চালুর আগে একবার সফল যাচাই লাগে, আর রিকভারি-কোড (অনলাইন ব্যাকআপের কোড) দিয়ে সবসময় বন্ধ করা যায়। */

/* ---- pure (unit-tested) ---- */
function bioB64u(b){ let s=''; const u=b instanceof Uint8Array?b:new Uint8Array(b); for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function bioFromB64u(s){ s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; const bin=atob(s), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
/* ECDSA সই: ASN.1 DER → WebCrypto-র কাঁচা r||s */
function bioDerToRaw(der, size){
  const b=der instanceof Uint8Array?der:new Uint8Array(der); let i=2; if(b[0]!==0x30) throw new Error('der'); if(b[1]&0x80) i=2+(b[1]&0x7f);
  if(b[i]!==0x02) throw new Error('der'); const rl=b[i+1]; let r=b.slice(i+2,i+2+rl); i=i+2+rl; if(b[i]!==0x02) throw new Error('der'); const sl=b[i+1]; let s=b.slice(i+2,i+2+sl);
  const fix=x=>{ while(x.length>size&&x[0]===0) x=x.slice(1); if(x.length>size) throw new Error('der'); const o=new Uint8Array(size); o.set(x,size-x.length); return o; };
  const out=new Uint8Array(size*2); out.set(fix(r),0); out.set(fix(s),size); return out;
}
/* authenticatorData: rpIdHash(32) | flags(1) | signCount(4) */
function bioParseAuth(a){ const u=a instanceof Uint8Array?a:new Uint8Array(a); if(u.length<37) return null; return {rpIdHash:u.slice(0,32), flags:u[32], up:!!(u[32]&1), uv:!!(u[32]&4), counter:((u[33]<<24)|(u[34]<<16)|(u[35]<<8)|u[36])>>>0}; }
/* কখন আবার লক হবে: lockMin 0 = ব্যাকগ্রাউন্ডে গেলেই, -1 = কখনো নয়, নইলে এত মিনিট পরে */
function bioShouldRelock(hiddenAt, now, lockMin){ if(hiddenAt==null||lockMin<0) return false; return lockMin===0?true:(now-hiddenAt)>=lockMin*60000; }
function bioBytesEq(a,b){ if(a.length!==b.length) return false; let r=0; for(let i=0;i<a.length;i++) r|=a[i]^b[i]; return r===0; }

/* ---- config ---- */
function bioCfg(){ const c=lsGet('tr_bio',null); return (c&&c.id&&c.pk)?c:null; }
function bioWants(scope){ const c=bioCfg(); return !!(c&&c.on&&c.scope&&c.scope[scope]); }
async function bioSupported(){ try{ return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }catch(e){ return false; } }
async function bioSha(bytes){ return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)); }

/* ---- enrol / verify ---- */
async function bioEnroll(){
  if(!(await bioSupported())){ showWarningToast('এই ফোনে আঙুলের ছাপ/ফেস লক পাওয়া গেল না — ফোনের সেটিংসে স্ক্রিন-লক আর ফিঙ্গারপ্রিন্ট চালু আছে কি দেখো।'); return false; }
  try{
    const cred=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)), rp:{name:'আমার টিউশন রুটিন', id:location.hostname}, user:{id:crypto.getRandomValues(new Uint8Array(16)), name:'teacher', displayName:'শিক্ষক'}, pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}], authenticatorSelection:{authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged'}, attestation:'none', timeout:60000}});
    const r=cred.response, pk=r.getPublicKey&&r.getPublicKey(), alg=r.getPublicKeyAlgorithm&&r.getPublicKeyAlgorithm(); if(!pk||(alg!==-7&&alg!==-257)) throw new Error('unsupported');
    lsSet('tr_bio',{id:bioB64u(new Uint8Array(cred.rawId)), pk:bioB64u(new Uint8Array(pk)), alg, on:false, scope:{finance:true,khata:true,app:false}, lockMin:2});
  }catch(e){ showWarningToast('আঙুলের ছাপ চালু করা গেল না'+((e&&e.name==='NotAllowedError')?' (বাতিল হয়েছে)':'')+'।'); return false; }
  if(!(await bioVerify('setup'))){ localStorage.removeItem('tr_bio'); showWarningToast('যাচাই মেলেনি — তাই চালু করলাম না (যাতে নিজেকে লক না করো)।'); return false; }
  try{ abGetKey(); }catch(e){}                                            // রিকভারি-কোড নিশ্চিত করা
  const c=bioCfg(); c.on=true; lsSet('tr_bio',c); bioRefreshCard(); showSuccessToast('আঙুলের ছাপ-লক চালু হয়েছে ✅'); return true;
}
let bioBusy=false;
async function bioVerify(why){
  const c=bioCfg(); if(!c||bioBusy) return false; bioBusy=true;
  try{
    const challenge=crypto.getRandomValues(new Uint8Array(32));
    const a=await navigator.credentials.get({publicKey:{challenge, allowCredentials:[{type:'public-key',id:bioFromB64u(c.id)}], userVerification:'required', rpId:location.hostname, timeout:60000}});
    const r=a.response, clientJSON=new Uint8Array(r.clientDataJSON), cd=JSON.parse(new TextDecoder().decode(clientJSON)), auth=new Uint8Array(r.authenticatorData), p=bioParseAuth(auth);
    if(cd.type!=='webauthn.get'||cd.challenge!==bioB64u(challenge)||cd.origin!==location.origin||!p||!p.up||!p.uv) return false;
    if(!bioBytesEq(p.rpIdHash, await bioSha(new TextEncoder().encode(location.hostname)))) return false;
    const data=new Uint8Array(auth.length+32); data.set(auth,0); data.set(await bioSha(clientJSON),auth.length); const sig=new Uint8Array(r.signature);
    if(c.alg===-7){ const key=await crypto.subtle.importKey('spki',bioFromB64u(c.pk),{name:'ECDSA',namedCurve:'P-256'},false,['verify']); return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bioDerToRaw(sig,32),data); }
    const key=await crypto.subtle.importKey('spki',bioFromB64u(c.pk),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']); return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,sig,data);
  }catch(e){ return false; } finally { bioBusy=false; }
}

/* ---- integrations ---- */
function bioHooks(){ /* (খাতা-লক ও আর্থিক আনলক সরাসরি bioWants() ডাকে — নিচে ০২/০৭ ফাইলে) */ }
async function khBioUnlock(){ if(await bioVerify('khata')){ khataUnlocked=true; renderKhataTab(); } else showWarningToast('যাচাই মেলেনি — আবার চেষ্টা করো।'); }
async function bioUnlockFinance(){ if(await bioVerify('finance')){ financeUnlocked=true; refreshFinanceViews(); } else showWarningToast('যাচাই মেলেনি — আর্থিক হিসাব লুকানোই থাকল।'); }
/* অ্যাপ-খোলার গেট */
let bioFails=0;
function bioGateShow(){
  if(document.getElementById('bioGate')) return; const g=document.createElement('div'); g.id='bioGate'; g.className='bio-gate'; bioFails=0;
  g.innerHTML=`<div class="bio-card"><div class="bio-ic">🔒</div><div class="bio-t">আমার টিউশন রুটিন</div><div class="bio-s">আনলক করতে ফোনের আঙুলের ছাপ বা ফেস লক লাগবে</div><button type="button" class="kh-fab" onclick="bioGateGo()">👆 আনলক করো</button><button type="button" id="bioStuck" class="bio-stuck" style="display:none" onclick="bioRecoverOff()">আনলক হচ্ছে না? রিকভারি কোড দিয়ে লক বন্ধ করো</button></div>`;
  document.body.appendChild(g);
}
async function bioGateGo(){ if(await bioVerify('app')){ const g=document.getElementById('bioGate'); if(g) g.remove(); } else { bioFails++; showWarningToast('মেলেনি — আবার চেষ্টা করো।'); if(bioFails>=2){ const s=document.getElementById('bioStuck'); if(s) s.style.display='block'; } } }
/* রিকভারি: অনলাইন ব্যাকআপের ২০-অক্ষরের কোড ঠিক হলে লক বন্ধ */
function bioRecoverOff(code){
  const input=(code!==undefined)?code:prompt('অনলাইন ব্যাকআপের রিকভারি কোড লেখো (সেটিংস → ব্যাকআপ → 🔑 রিকভারি কোড দেখো-তে ছিল):'); if(input===null||input===undefined) return false;
  const mine=abNorm(lsGet('tr_abKey','')); if(mine.length===20 && abNorm(input)===mine){ const c=bioCfg(); if(c){ c.on=false; lsSet('tr_bio',c); } const g=document.getElementById('bioGate'); if(g) g.remove(); bioRefreshCard(); showSuccessToast('আঙুলের ছাপ-লক বন্ধ হয়েছে'); return true; }
  showWarningToast('কোড মেলেনি।'); return false;
}
/* ব্যাকগ্রাউন্ড থেকে ফিরলে (সময় পেরোলে) আবার লক */
let bioHiddenAt=null;
function bioOnVisibility(hidden, now){
  const c=bioCfg(); if(!c||!c.on) return;
  if(hidden){ bioHiddenAt=now; return; }
  if(bioShouldRelock(bioHiddenAt,now,c.lockMin)){
    if(c.scope.finance&&financeUnlocked){ financeUnlocked=false; try{ refreshFinanceViews(); }catch(e){} }
    if(c.scope.khata&&khataUnlocked){ khataUnlocked=false; try{ renderKhataTab(); }catch(e){} }
    if(c.scope.app) bioGateShow();
  }
  bioHiddenAt=null;
}
document.addEventListener('visibilitychange',()=>bioOnVisibility(document.hidden,Date.now()));
if(bioWants('app')) bioGateShow();

/* ---- settings card ---- */
function bioCardHtml(){
  const c=bioCfg(), on=!!(c&&c.on), sc=(c&&c.scope)||{}, ck=(k,l)=>`<label class="kf-chk" style="margin-top:6px;"><input type="checkbox" ${sc[k]?'checked':''} onchange="bioScope('${k}',this.checked)"><span>${l}</span></label>`;
  const mins=[[0,'ব্যাকগ্রাউন্ডে গেলেই'],[2,'২ মিনিট'],[15,'১৫ মিনিট'],[-1,'কখনো নয়']];
  return `<div id="bioCard" class="ab-card" style="margin-top:12px;"><div style="font-size:12.5px;font-weight:700;color:var(--paper);margin-bottom:4px;">👆 আঙুলের ছাপ / ফেস লক</div>
    <div class="backup-status${on?'':' backup-status-warn'}">${on?'✅ চালু আছে':'⏸ বন্ধ আছে'}</div>
    <div style="font-size:11.5px;color:var(--muted);line-height:1.7;margin:8px 0;">ফোনের নিজের বায়োমেট্রিক ব্যবহার হয়; আঙুলের ছাপ অ্যাপে বা সার্ভারে যায় না। এটা অন্যের হাতে থাকা আনলক করা ফোন থেকে তোমার আর্থিক হিসাব ও খাতা আড়াল করে।</div>
    ${on?`${ck('finance','আর্থিক হিসাব দেখাতে')}${ck('khata','খাতা খুলতে')}${ck('app','অ্যাপ খুলতেই')}
      <div style="font-size:11.5px;color:var(--muted);margin:10px 0 4px;">আবার লক হবে:</div><div class="pct-chip-row">${mins.map(([m,l])=>`<button type="button" class="pct-chip${c.lockMin===m?' active':''}" onclick="bioLockMin(${m})">${l}</button>`).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><button class="settings-btn" style="margin:0;" onclick="bioTest()">🧪 পরীক্ষা</button><button class="settings-btn" style="margin:0;" onclick="bioDisable()">⏸ বন্ধ করো</button></div>`
    :`<button class="settings-btn" onclick="bioEnroll()">👆 চালু করো</button>`}
    <div id="bioNote" class="ai-note"></div></div>`;
}
function bioRefreshCard(){ const c=document.getElementById('bioCard'); if(c) c.outerHTML=bioCardHtml(); }
function bioScope(k,v){ const c=bioCfg(); if(!c) return; c.scope[k]=!!v; lsSet('tr_bio',c); if(k==='finance'&&v){ financeUnlocked=false; try{ refreshFinanceViews(); }catch(e){} } }
function bioLockMin(m){ const c=bioCfg(); if(!c) return; c.lockMin=m; lsSet('tr_bio',c); bioRefreshCard(); }
async function bioTest(){ const n=document.getElementById('bioNote'); if(n) n.textContent='⏳ ফোনের যাচাই আসছে…'; const ok=await bioVerify('test'); if(n) n.textContent=ok?'✅ যাচাই সফল — সব ঠিক আছে।':'⚠️ যাচাই মেলেনি।'; }
async function bioDisable(){
  if(await bioVerify('off')){ const c=bioCfg(); c.on=false; lsSet('tr_bio',c); bioRefreshCard(); showSuccessToast('আঙুলের ছাপ-লক বন্ধ হয়েছে'); return; }
  if(confirm('যাচাই হলো না। রিকভারি কোড দিয়ে বন্ধ করতে চাও?')) bioRecoverOff();
}
