/* ============ V71 ভিত্তি — ডেটা-স্কিমা সংস্করণ, নিরাপদ মাইগ্রেশন, "মুছে ফেলা"র স্মৃতি (tombstone) ============ */
/* নিয়ম (পরিকল্পনা §৮): ডেটার গঠন বদলালে (১) আগে স্ন্যাপশট, (২) ছোট ও বারবার চালানো-নিরাপদ (idempotent) ধাপ, */
/* (৩) পুরোনো রেকর্ড অক্ষত, (৪) সংস্করণ নম্বর একটাই জায়গায় (tr_schemaVer)। এই ফাইলে শুধু ঘোষণা — চালু হয় নিচের শেষে। */
const SCHEMA_VERSION = 75;
const SCHEMA_KEYS_NEW = ['tr_qbank','tr_results','tr_resultCfg','tr_resultPins','tr_adjust','tr_tombstones','tr_schemaVer'];

/* প্রতিটা ধাপ: {v, id, run()} — শুধু যোগ করে, কিছু মোছে/বদলায় না; দ্বিতীয়বার চালালেও কিছু ডুপ্লিকেট হয় না। */
const SCHEMA_MIGRATIONS = [
  { v:72, id:'v72-qbank',    run(){ if(!Array.isArray(lsGet('tr_qbank', null))) lsSet('tr_qbank', []); } },
  { v:73, id:'v73-results',  run(){ if(!Array.isArray(lsGet('tr_results', null))) lsSet('tr_results', []);
                                    if(!lsGet('tr_resultCfg', null)) lsSet('tr_resultCfg', {good:80, practice:60, last:3});
                                    if(!lsGet('tr_resultPins', null)) lsSet('tr_resultPins', {}); } },
  { v:74, id:'v74-fees',     run(){ if(!Array.isArray(lsGet('tr_adjust', null))) lsSet('tr_adjust', []);
                                    /* আগের মেকআপ তালিকায় status/ইতিহাসের ঘর নেই — পুরোনো রেকর্ড যেমন আছে তেমনই, শুধু আইডি নেই এমনগুলোয় আইডি বসে */
                                    const mk=lsGet('tr_makeups', []); let ch=false;
                                    if(Array.isArray(mk)) mk.forEach(m=>{ if(m && !m.id){ m.id=Date.now()+'_'+Math.random().toString(36).slice(2,7); ch=true; } });
                                    if(ch) lsSet('tr_makeups', mk); } },
  { v:75, id:'v75-tombs',    run(){ const t=lsGet('tr_tombstones', null); if(!t || typeof t!=='object' || Array.isArray(t)) lsSet('tr_tombstones', {}); } },
];
/* কতগুলো ধাপ বাকি (কিছু না চালিয়ে) — টেস্ট ও প্রিভিউয়ের জন্য */
function schemaPending(cur){ return SCHEMA_MIGRATIONS.filter(m=>m.v>(cur|0)); }
/* চালায়, ফেরত দেয় যেসব ধাপ চলেছে তাদের আইডি। snapshotFn থাকলে আগে সেটা (ব্যর্থ হলে ধাপ আটকায় না, কিন্তু ফল জানায়) */
function runSchemaMigrations(snapshotFn){
  const cur=Number(lsGet('tr_schemaVer', 70))||70, todo=schemaPending(cur), done=[];
  if(!todo.length){ if(cur<SCHEMA_VERSION) lsSet('tr_schemaVer', SCHEMA_VERSION); return {from:cur, ran:done, snapshot:false}; }
  let snap=false; try{ if(snapshotFn){ snapshotFn('before-migrate-v'+SCHEMA_VERSION); snap=true; } }catch(e){}
  todo.forEach(m=>{ try{ m.run(); done.push(m.id); }catch(e){ try{ console.warn('migration failed', m.id, e); }catch(_){} } });
  if(done.length===todo.length) lsSet('tr_schemaVer', SCHEMA_VERSION);      // একটাও ব্যর্থ হলে সংস্করণ বাড়ে না — পরের বার আবার চেষ্টা
  return {from:cur, ran:done, snapshot:snap};
}

/* ---- tombstone: "এই রেকর্ডটা ইচ্ছে করে মোছা হয়েছে" — মার্জের সময় অন্য ডিভাইসের পুরোনো কপি যেন ফিরে না আসে ---- */
/* গঠন: { "pay:<id>": তারিখ-মিলিসেকেন্ড, "att:<key>": ..., "note:<key>": ..., "exp:<id>": ... } */
function tombAdd(kind, id){ try{ const t=lsGet('tr_tombstones', {}); t[kind+':'+id]=Date.now(); lsSet('tr_tombstones', tombPrune(t)); }catch(e){} }
function tombClear(kind, id){ try{ const t=lsGet('tr_tombstones', {}); const k=kind+':'+id; if(k in t){ delete t[k]; lsSet('tr_tombstones', t); } }catch(e){} }
function tombHas(t, kind, id){ return !!(t && Object.prototype.hasOwnProperty.call(t, kind+':'+id)); }
function tombPrune(t, maxAgeMs, now){ const lim=(now||Date.now())-(maxAgeMs||180*86400000); const o={}; Object.keys(t||{}).forEach(k=>{ if(Number(t[k])>=lim) o[k]=t[k]; }); return o; }

/* ---- চালু করা (শুধু ব্রাউজারে) ---- */
if(typeof document!=='undefined'){
  try{ runSchemaMigrations(typeof safetySnapshot==='function' ? safetySnapshot : null); }catch(e){}
}
