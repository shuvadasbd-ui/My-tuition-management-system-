/* ============ V75 — নিরাপদ ব্যাকআপ: স্কিমা+চেকসাম যাচাই, রিস্টোরের আগে "কী বদলাবে" প্রিভিউ, দুই ডিভাইসের তথ্য মার্জ ============ */
/* বাস্তবতা: লাইভ ক্লাউড-সিঙ্ক (লগইন, সার্ভার-অথরাইজেশন) এখানে বানানো হয়নি — পরিকল্পনাই বলে স্থিতিশীল হওয়ার আগে নয়। */
/* বদলে আছে: অনলাইন ব্যাকআপ (রিকভারি কোড) + এই মার্জ — দুই ফোনের তথ্য রেকর্ড ধরে মেলানো, মোছা রেকর্ড (tombstone) ফিরে না আসা, দ্বন্দ্ব আলাদা দেখানো। */

const BK_MAX_BYTES = 25*1024*1024;
const BK_MAPS = {tr_attendance:['অ্যাটেন্ডেন্স','att'], tr_notes:['ক্লাস নোট','note'], tr_students:['শিক্ষার্থী প্রোফাইল',''], tr_progress:['অধ্যায়/অগ্রগতি',''], tr_offMap:['ছুটির দিন',''], tr_moves:['স্লট সরানো',''], tr_schedOverrides:['শিডিউল পরিবর্তন','']};
const BK_LISTS = {tr_expenses:['খরচ','exp'], tr_makeups:['মেকআপ ক্লাস',''], tr_todos:['করণীয়',''], tr_results:['পরীক্ষার ফল','res'], tr_adjust:['ফি সমন্বয়',''], tr_qbank:['প্রশ্নপত্র ভান্ডার','']};

/* ---------- pure (unit-tested) ---------- */
function bkHash(s){ let a=0x811c9dc5, b=0x1b873593; for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); a^=c; a=Math.imul(a,0x01000193)>>>0; b=Math.imul(b^c,0x85ebca6b)>>>0; b^=b>>>13; } return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0')+':'+s.length; }
function bkChecksum(data){ return bkHash(Object.keys(data||{}).sort().map(k=>k+'='+data[k]).join('\n')); }
function bkParse(s, d){ try{ return s==null?d:JSON.parse(s); }catch(e){ return d; } }
function bkCounts(data){ const o={}; Object.keys(data||{}).forEach(k=>{ const v=bkParse(data[k],null); if(Array.isArray(v)) o[k]=v.length; else if(v&&typeof v==='object') o[k]=Object.keys(v).length; }); return o; }
/* ফাইল ঢোকানোর আগে যাচাই: fatal থাকলে ঢোকানো যাবে না */
function bkProblems(payload, knownKeys, schemaMax, size){
  const fatal=[], warn=[];
  if(!payload || typeof payload!=='object' || !payload.data || typeof payload.data!=='object' || Array.isArray(payload.data)){ fatal.push('ফাইলের গঠন ঠিক নেই।'); return {fatal,warn}; }
  if(size && size>BK_MAX_BYTES) fatal.push('ফাইলটা অনেক বড় (২৫ MB-এর বেশি)।');
  if(payload.schema!=null){
    if(!(Number(payload.schema)>=1)) fatal.push('স্কিমা সংস্করণ ঠিক নেই।');
    else if(Number(payload.schema)>schemaMax) fatal.push('এই ব্যাকআপ অ্যাপের নতুন সংস্করণের — আগে অ্যাপ আপডেট করো, নইলে তথ্য নষ্ট হতে পারে।');
  } else warn.push('পুরোনো ফরম্যাটের ব্যাকআপ — ঢোকানোর পর অ্যাপ নিজে নতুন গঠনে আনবে।');
  if(payload.checksum && payload.checksum!==bkChecksum(payload.data)) fatal.push('ফাইলটা নষ্ট বা বদলানো (চেকসাম মেলেনি)।');
  const keys=Object.keys(payload.data), unknown=knownKeys?keys.filter(k=>!knownKeys.includes(k)):[];
  if(unknown.length) warn.push(`${unknown.length}টা অচেনা তথ্য-অংশ বাদ যাবে।`);
  if(!keys.length) fatal.push('ব্যাকআপ খালি।');
  keys.forEach(k=>{ if(typeof payload.data[k]!=='string') fatal.push(`"${k}"-এর মান ঠিক নেই।`); else { try{ JSON.parse(payload.data[k]); }catch(e){ fatal.push(`"${k}"-এর ভেতরের তথ্য নষ্ট।`); } } });
  // একই আইডি দুবার? (তালিকাধর্মী অংশে)
  Object.keys(BK_LISTS).forEach(k=>{ const v=bkParse(payload.data[k],null); if(Array.isArray(v)){ const ids=v.map(x=>x&&x.id).filter(x=>x!=null); if(new Set(ids).size!==ids.length) warn.push(`"${BK_LISTS[k][0]}"-এ একই আইডি একাধিকবার আছে।`); } });
  return {fatal:fatal.slice(0,6), warn};
}
const bkJ=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function bkPaymentRows(map){ const o={}; Object.keys(map||{}).forEach(n=>{ ((map[n]||{}).payments||[]).forEach(p=>{ if(p&&p.id!=null) o[n+'|'+p.id]=p; }); }); return o; }
/* রিস্টোরের আগের প্রিভিউ: cur → next-এ কী যোগ/বাদ/বদল হবে */
function bkDiff(cur, next){
  const rows=[], cmp=(label,key,A,B)=>{ let add=0,rem=0,chg=0; Object.keys(B).forEach(k=>{ if(!(k in A)) add++; else if(!bkJ(A[k],B[k])) chg++; }); Object.keys(A).forEach(k=>{ if(!(k in B)) rem++; }); if(add||rem||chg||Object.keys(A).length||Object.keys(B).length) rows.push({key,label,cur:Object.keys(A).length,next:Object.keys(B).length,added:add,removed:rem,changed:chg}); };
  Object.keys(BK_MAPS).forEach(k=>{ if(!(k in cur)&&!(k in next)) return; cmp(BK_MAPS[k][0],k,bkParse(cur[k],{})||{},bkParse(next[k],{})||{}); });
  Object.keys(BK_LISTS).forEach(k=>{ if(!(k in cur)&&!(k in next)) return; const toMap=l=>{ const o={}; (Array.isArray(l)?l:[]).forEach((x,i)=>{ o[(x&&x.id!=null)?x.id:'#'+i]=x; }); return o; }; cmp(BK_LISTS[k][0],k,toMap(bkParse(cur[k],[])),toMap(bkParse(next[k],[]))); });
  if('tr_payments' in cur || 'tr_payments' in next){ const ca=bkParse(cur.tr_payments,{})||{}, nb=bkParse(next.tr_payments,{})||{}; cmp('পেমেন্ট','tr_payments',bkPaymentRows(ca),bkPaymentRows(nb));
    let fee=0; Object.keys(nb).forEach(n=>{ if(ca[n] && (ca[n].monthlyFee!==nb[n].monthlyFee || (ca[n].openingBalance||0)!==(nb[n].openingBalance||0))) fee++; }); if(fee) rows.push({key:'tr_payments#fee',label:'ফি/পূর্ব-বকেয়া বদল',cur:fee,next:fee,added:0,removed:0,changed:fee}); }
  const handled=new Set([...Object.keys(BK_MAPS),...Object.keys(BK_LISTS),'tr_payments']); let other=0;
  new Set([...Object.keys(cur),...Object.keys(next)]).forEach(k=>{ if(!handled.has(k) && cur[k]!==next[k]) other++; });
  if(other) rows.push({key:'other',label:'খাতা ও সেটিংস',cur:other,next:other,added:0,removed:0,changed:other});
  return {rows, total:rows.reduce((s,r)=>s+r.added+r.removed+r.changed,0)};
}
/* মার্জ: কিছুই অন্ধভাবে "নতুনটা জেতে" নয়। opts.conflict = 'local' | 'theirs' (শুধু একই রেকর্ডে ভিন্ন মান হলে) */
function bkMerge(cur, next, opts){
  const pref=(opts&&opts.conflict)==='theirs'?'theirs':'local', out={}, rows=[], conflicts=[], now=(opts&&opts.now)||Date.now();
  const tc=bkParse(cur.tr_tombstones,{})||{}, tn=bkParse(next.tr_tombstones,{})||{}, tm=Object.assign({},tn,tc);
  Object.keys(tn).forEach(k=>{ if(tc[k]!=null) tm[k]=Math.max(Number(tc[k])||0,Number(tn[k])||0); });
  const lim=now-180*86400000; Object.keys(tm).forEach(k=>{ if(Number(tm[k])<lim) delete tm[k]; });
  const has=(t,kind,id)=>!!kind && Object.prototype.hasOwnProperty.call(t,kind+':'+id);
  const pick=(a,b)=>pref==='theirs'?b:a;
  const row=(key,label)=>{ const r={key,label,added:0,kept:0,dropped:0,conflicts:0}; rows.push(r); return r; };
  Object.keys(BK_MAPS).forEach(k=>{
    if(!(k in cur)&&!(k in next)) return; const C=bkParse(cur[k],{})||{}, N=bkParse(next[k],{})||{}, [label,kind]=BK_MAPS[k], r=row(k,label), M={};
    Object.keys(C).forEach(id=>{ if(!(id in N)){ if(has(tn,kind,id)){ r.dropped++; } else { M[id]=C[id]; r.kept++; } } });
    Object.keys(N).forEach(id=>{
      if(!(id in C)){ if(has(tc,kind,id)) return; M[id]=N[id]; r.added++; return; }
      if(bkJ(C[id],N[id])){ M[id]=C[id]; return; }
      if(k==='tr_students' && C[id] && N[id] && typeof C[id]==='object' && typeof N[id]==='object'){          // প্রোফাইল: খালি ঘর ভরো, ভিন্ন মান হলে দ্বন্দ্ব
        const m=Object.assign({}, C[id]); let bad=false;
        Object.keys(N[id]).forEach(f=>{ const a=C[id][f], b=N[id][f], ea=(a==null||a===''), eb=(b==null||b===''); if(ea&&!eb) m[f]=b; else if(!ea&&!eb&&!bkJ(a,b)){ bad=true; if(pref==='theirs') m[f]=b; } });
        M[id]=m; if(bad){ r.conflicts++; conflicts.push({key:k,label,id}); } return;
      }
      r.conflicts++; conflicts.push({key:k,label,id}); M[id]=pick(C[id],N[id]);
    });
    out[k]=JSON.stringify(M);
  });
  Object.keys(BK_LISTS).forEach(k=>{
    if(!(k in cur)&&!(k in next)) return; const C=bkParse(cur[k],[]), N=bkParse(next[k],[]), [label,kind]=BK_LISTS[k], r=row(k,label), M=[], idx={};
    (Array.isArray(C)?C:[]).forEach(x=>{ if(x&&x.id!=null&&has(tn,kind,x.id)&&!(Array.isArray(N)&&N.some(y=>y&&y.id===x.id))){ r.dropped++; return; } M.push(x); if(x&&x.id!=null) idx[x.id]=M.length-1; r.kept++; });
    (Array.isArray(N)?N:[]).forEach(x=>{ if(!x||x.id==null){ return; } if(!(x.id in idx)){ if(has(tc,kind,x.id)) return; M.push(x); r.added++; return; }
      const i=idx[x.id]; if(!bkJ(M[i],x)){ r.conflicts++; conflicts.push({key:k,label,id:x.id}); if(pref==='theirs') M[i]=x; } });
    out[k]=JSON.stringify(M);
  });
  if('tr_payments' in cur || 'tr_payments' in next){
    const C=bkParse(cur.tr_payments,{})||{}, N=bkParse(next.tr_payments,{})||{}, r=row('tr_payments','পেমেন্ট'), M={};
    new Set([...Object.keys(C),...Object.keys(N)]).forEach(n=>{
      const a=C[n], b=N[n]; if(!a){ M[n]=b; r.added+=((b.payments||[]).length)||0; return; } if(!b){ M[n]=a; return; }
      const voidedIds=new Set([...(a.voided||[]),...(b.voided||[])].map(p=>p.id)), pays={}, vmap={};
      (a.payments||[]).forEach(p=>{ if(!voidedIds.has(p.id)) pays[p.id]=p; });
      (b.payments||[]).forEach(p=>{ if(voidedIds.has(p.id)||p.id in pays) return; if(has(tc,'pay',p.id)) return; pays[p.id]=p; r.added++; });
      [...(a.voided||[]),...(b.voided||[])].forEach(p=>{ vmap[p.id]=vmap[p.id]||p; });
      const base=x=>(Number(x.openingBalance)||0)+(x.payments||[]).filter(p=>p.monthKey==='opening').reduce((s,p)=>s+p.amount,0), merged={};
      let fee=a.monthlyFee, bs=base(a);
      if(a.monthlyFee!==b.monthlyFee){ r.conflicts++; conflicts.push({key:'tr_payments',label:'মাসিক ফি',id:n}); if(pref==='theirs') fee=b.monthlyFee; }
      if(base(a)!==base(b)){ r.conflicts++; conflicts.push({key:'tr_payments',label:'পূর্ব-বকেয়া',id:n}); if(pref==='theirs') bs=base(b); }
      const list=Object.keys(pays).map(id=>pays[id]), openSum=list.filter(p=>p.monthKey==='opening').reduce((s,p)=>s+p.amount,0);
      Object.assign(merged,a,{monthlyFee:fee, openingBalance:Math.max(0,bs-openSum), payments:list}); const v=Object.keys(vmap).map(id=>vmap[id]); if(v.length) merged.voided=v; M[n]=merged;
    });
    out.tr_payments=JSON.stringify(M);
  }
  const handled=new Set([...Object.keys(BK_MAPS),...Object.keys(BK_LISTS),'tr_payments','tr_tombstones','tr_schemaVer','tr_receiptSeq']); let keptLocal=0, took=0;
  new Set([...Object.keys(cur),...Object.keys(next)]).forEach(k=>{ if(handled.has(k)) return; if(k in cur){ out[k]=cur[k]; if(k in next && cur[k]!==next[k]) keptLocal++; } else { out[k]=next[k]; took++; } });
  if(keptLocal||took) rows.push({key:'other',label:'খাতা ও সেটিংস (স্থানীয়টাই রাখা হয়)',added:took,kept:keptLocal,dropped:0,conflicts:0});
  if('tr_receiptSeq' in cur || 'tr_receiptSeq' in next) out.tr_receiptSeq=JSON.stringify(Math.max(Number(bkParse(cur.tr_receiptSeq,0))||0, Number(bkParse(next.tr_receiptSeq,0))||0));   // রসিদ নম্বর যেন না মেলে
  out.tr_tombstones=JSON.stringify(tm);
  out.tr_schemaVer=JSON.stringify(Math.max(Number(bkParse(cur.tr_schemaVer,0))||0, Number(bkParse(next.tr_schemaVer,0))||0)||70);
  return {data:out, rows, conflicts};
}

/* ---------- screen (প্রিভিউ-এর ভেতরে বসে) ---------- */
let bkMode='replace', bkConflict='local';
function bkSetMode(m){ bkMode=m; const n=document.getElementById('bkModeNote'); if(n) n.innerHTML=bkModeNote(); const c=document.getElementById('bkConfBox'); if(c) c.style.display=m==='merge'?'block':'none'; }
function bkModeNote(){ return bkMode==='merge' ? 'মার্জ: দুই দিকের তথ্য রেকর্ড ধরে মিলবে। কিছু মোছা হবে না (যেগুলো ইচ্ছে করে মোছা, সেগুলো ছাড়া)। একই রেকর্ডে ভিন্ন মান হলে নিচের পছন্দ অনুযায়ী।' : 'রিস্টোর: এখনকার তথ্য এই ব্যাকআপ দিয়ে বদলে যাবে।'; }
function bkPreviewHtml(payload){
  bkMode='replace'; bkConflict='local'; const E=escapeHtml; let d, pr;
  try{ d=bkDiff(collectBackupData(), payload.data); pr=bkProblems(payload, BACKUP_KEYS, SCHEMA_VERSION); }catch(e){ return ''; }
  const rows=d.rows.map(r=>`<div class="makeup-row"><span>${E(r.label)}</span><span class="pay-history-amt" style="font-size:11px;">${r.added?'+'+toBn(r.added)+' ':''}${r.removed?'−'+toBn(r.removed)+' ':''}${r.changed?'~'+toBn(r.changed):''}${(!r.added&&!r.removed&&!r.changed)?'অপরিবর্তিত':''}</span></div>`).join('');
  return `<div style="margin-top:10px;font-size:11px;color:var(--muted);">রিস্টোর করলে কী হবে (+ যোগ · − বাদ · ~ বদল):</div>${rows||'<div class="ins-empty">কোনো পার্থক্য নেই।</div>'}
  ${pr.warn.map(w=>`<div class="qp-iss warn">⚠️ ${E(w)}</div>`).join('')}
  <div class="pct-chip-row" style="margin-top:10px;"><label class="pct-chip"><input type="radio" name="bkm" checked onchange="bkSetMode('replace')"> সম্পূর্ণ রিস্টোর</label><label class="pct-chip"><input type="radio" name="bkm" onchange="bkSetMode('merge')"> 🔀 মার্জ (দুই ফোনের তথ্য মেলাও)</label></div>
  <div class="qp-note-small" id="bkModeNote">${bkModeNote()}</div>
  <div id="bkConfBox" style="display:none;"><div class="qp-note-small">একই রেকর্ডে দুই জায়গায় ভিন্ন মান থাকলে:</div><div class="pct-chip-row"><label class="pct-chip"><input type="radio" name="bkc" checked onchange="bkConflict='local'"> এই ফোনেরটা রাখো</label><label class="pct-chip"><input type="radio" name="bkc" onchange="bkConflict='theirs'"> ব্যাকআপেরটা নাও</label></div><div class="qp-note-small">খাতা ও সেটিংস মার্জ হয় না — এই ফোনেরটাই থাকে।</div></div>`;
}
/* কনফার্মের ঠিক আগে: মার্জ বাছলে payload-এর data মার্জ-করা তথ্য দিয়ে বদলে যায় */
function bkApplyMode(payload){
  if(bkMode!=='merge') return payload;
  const m=bkMerge(collectBackupData(), payload.data, {conflict:bkConflict}), keep={};
  Object.keys(m.data).filter(k=>BACKUP_KEYS.includes(k)).forEach(k=>{ keep[k]=m.data[k]; });
  return Object.assign({}, payload, {data:keep});
}
