/* ============ 🤖 AI সহকারী (Claude) — গোপনীয়তা-আগে নকশা ============ */
/* • নাম/ফোন ফোনেই সরিয়ে ("ছাত্র-1") তবেই কিছু বাইরে যায়; উত্তর এলে ফোনেই আবার আসল নাম বসে। */
/* • API কী অ্যাপে থাকে না — শুধু তোমার Netlify সার্ভারে (netlify/functions/ai.mjs)। অ্যাপ পাসকোড দিয়ে সেই ফাংশনকে ডাকে। */
/* • চ্যাটে AI সরাসরি তোমার ডেটা দেখে না: সে "টুল" চায় (যেমন ঝুঁকিতে কারা), টুল ফোনেই চলে, শুধু নাম-ছাড়া ফল ফেরত যায়। */
/* • AI না থাকলে (অফলাইন/পাসকোড নেই/সীমা শেষ) অ্যাপের বাকি সব আগের মতোই চলে — AI একটা বাড়তি স্তর, নির্ভরতা নয়। */

/* ---- pure (unit-tested) ---- */
/* বাংলাদেশি মোবাইল নম্বর (ইংরেজি/বাংলা অঙ্ক, +88, ফাঁক/হাইফেনসহ) → [ফোন]; টাকা বা তারিখ কাটে না */
const AI_PHONE_CAND=/\+?[\d০-৯][\d০-৯\s-]{8,16}[\d০-৯]/g;
function aiScrubPhones(t){ return String(t).replace(AI_PHONE_CAND,m=>{ const d=m.replace(/[০-৯]/g,c=>'০১২৩৪৫৬৭৮৯'.indexOf(c)).replace(/[\s-]/g,'').replace(/^\+/,''); return /^(?:88)?01[3-9]\d{8}$/.test(d)?'[ফোন]':m; }); }
function aiTokenMap(names){
  const uniq=[...new Set((names||[]).map(n=>String(n||'').trim()).filter(Boolean))].sort((a,b)=>b.length-a.length||a.localeCompare(b)), fwd={}, rev={};
  uniq.forEach((n,i)=>{ const t='ছাত্র-'+(i+1); fwd[n]=t; rev[t]=n; });
  return {fwd, rev, order:uniq};
}
function aiEsc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
/* নাম (দীর্ঘটা আগে) → টোকেন; ফোন নম্বর → [ফোন] */
function aiScrub(text, map){
  let t=aiScrubPhones(text==null?'':text);
  map.order.forEach(n=>{ t=t.replace(new RegExp(aiEsc(n),'g'),map.fwd[n]); }); return t;
}
/* টোকেন (বড় নম্বর আগে, যাতে "ছাত্র-10"-এর ভেতরে "ছাত্র-1" না ভাঙে) → আসল নাম */
function aiRestore(text, map){
  let t=String(text==null?'':text); Object.keys(map.rev).sort((a,b)=>b.length-a.length).forEach(k=>{ t=t.split(k).join(map.rev[k]); }); return t;
}
const AI_TONES={warm:'আন্তরিক ও উষ্ণ',polite:'বিনয়ী ও পেশাদার',firm:'ভদ্র কিন্তু দৃঢ়'};
function aiPolishSystem(tone, len){
  return `You help a private tutor in Bangladesh polish a WhatsApp message to a student's parent. Rewrite the draft in natural, polite Bangla. Tone: ${AI_TONES[tone]||AI_TONES.polite}. Keep every fact, number, date and amount exactly as written. Keep tokens such as ছাত্র-1 or [ফোন] unchanged. Do not add new facts, promises, deadlines or threats. Keep it under ${Math.round(len*1.3+40)} characters. Output ONLY the message text, nothing else.`;
}
const AI_CHAT_SYSTEM='তুমি একজন বাংলাদেশি প্রাইভেট টিউটরের সহকারী। শুধু টুল থেকে পাওয়া তথ্যের ভিত্তিতে বাংলায় সংক্ষেপে (সর্বোচ্চ ৫ বাক্য) উত্তর দাও। তথ্য না থাকলে সরাসরি "জানি না" বলে কোন তথ্য লাগবে তা বলো — আন্দাজ কোরো না। ছাত্রদের নাম "ছাত্র-N" টোকেনে আসে; উত্তরেও হুবহু ওই টোকেনই লেখো। কোনো ছাত্রকে দোষারোপ কোরো না — স্কোর ও সম্ভাবনা ইঙ্গিত মাত্র, রায় নয়। চিকিৎসা বা আইনি পরামর্শ দিও না।';
/* anthropic content blocks → {text, toolUses[]} */
function aiBlocks(content){
  const text=(content||[]).filter(b=>b&&b.type==='text').map(b=>b.text).join('\n').trim(), toolUses=(content||[]).filter(b=>b&&b.type==='tool_use');
  return {text, toolUses};
}
const AI_ERR={offline:'ইন্টারনেট নেই — AI-র জন্য নেট লাগে',no_pass:'AI-র পাসকোড দেওয়া নেই (সেটিংস → AI সহকারী)',not_configured:'সার্ভারে AI চালু করা হয়নি (ANTHROPIC_API_KEY নেই)',no_passcode:'সার্ভারে AI_PASSCODE সেট করা নেই',bad_pass:'পাসকোড মেলেনি',cap:'আজকের AI-র সীমা শেষ — কাল আবার চেষ্টা করো',slow:'AI ধীরে সাড়া দিল — আবার চেষ্টা করো',upstream_auth:'Claude API কী ঠিক নেই — Netlify-তে দেখো',upstream_rate:'Claude এখন ব্যস্ত — একটু পরে',upstream_bad:'অনুরোধটা Claude নিতে পারেনি',upstream:'Claude-এর দিকে সমস্যা — একটু পরে',http_404:'AI ফাংশন ডিপ্লয় করা নেই (netlify/functions/ai.mjs)',http_502:'সার্ভারে সমস্যা — আবার চেষ্টা করো',timeout:'সময় শেষ — আবার চেষ্টা করো'};
function aiErrText(code){ return AI_ERR[code]||('AI ত্রুটি: '+code); }

/* ---- transport ---- */
const AI_URL='/.netlify/functions/ai';
function aiDevice(){ let d=lsGet('tr_aiDev',''); if(!/^[A-Za-z0-9_-]{16,64}$/.test(d)){ const b=crypto.getRandomValues(new Uint8Array(18)); d='d'+[...b].map(x=>x.toString(36).padStart(2,'0')).join('').slice(0,30); lsSet('tr_aiDev',d); } return d; }
function aiOn(){ return lsGet('tr_aiOn',true)!==false; }
async function aiCall(o){
  if(!navigator.onLine) return {ok:false,error:'offline'};
  const pass=lsGet('tr_aiPass',''); if(!pass) return {ok:false,error:'no_pass'};
  const ctrl=new AbortController(), to=setTimeout(()=>ctrl.abort(),25000);
  try{
    const res=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({pass,device:aiDevice(),model:o.model||'claude-haiku-5-5',system:o.system,messages:o.messages,tools:o.tools,max_tokens:o.max_tokens||600})});
    const j=await res.json().catch(()=>({}));
    if(!res.ok) return {ok:false,error:j.error||('http_'+res.status),which:j.which};
    if(j.remaining) lsSet('tr_aiLeft',Object.assign({d:dateKeyStr(todayDateOnly())},j.remaining));
    return {ok:true,data:j};
  }catch(e){ return {ok:false,error:(e&&e.name==='AbortError')?'timeout':'offline'}; } finally { clearTimeout(to); }
}
function aiLeftText(){ const l=lsGet('tr_aiLeft',null); return (l&&l.d===dateKeyStr(todayDateOnly()))?`আজ আর ${toBn(l.device)}টা অনুরোধ বাকি`:''; }

/* ---- ১) মেসেজ AI দিয়ে সাজানো (২ ও ৩ নম্বরের মেসেজ পাতায় বসে) ---- */
function aiMsgHtml(){
  if(!aiOn()) return '';
  return `<div class="ai-box"><div class="ai-t">✨ AI দিয়ে সাজাও <small>নাম ও ফোন ছাড়া পাঠানো হয়</small></div><div class="ai-tones">${Object.keys(AI_TONES).map(k=>`<button type="button" class="pct-chip" onclick="aiPolish('${k}')">${AI_TONES[k]}</button>`).join('')}</div><div id="aiMsgNote" class="ai-note"></div></div>`;
}
let aiPrevMsg=null;
async function aiPolish(tone){
  const ta=document.getElementById('sm_msg'), note=document.getElementById('aiMsgNote'); if(!ta) return; const draft=ta.value.trim(); if(!draft){ showWarningToast('আগে মেসেজ লেখো।'); return; }
  if(!lsGet('tr_aiPass','')){ aiSetupPage(); return; }
  const map=aiTokenMap(aiNames()); note.textContent='⏳ AI সাজাচ্ছে…';
  const r=await aiCall({system:aiPolishSystem(tone,draft.length),messages:[{role:'user',content:aiScrub(draft,map)}],max_tokens:500});
  if(!r.ok){ note.textContent='⚠️ '+aiErrText(r.error); return; }
  const out=aiBlocks(r.data.content).text; if(!out){ note.textContent='⚠️ AI কিছু লেখেনি — আবার চেষ্টা করো'; return; }
  aiPrevMsg=ta.value; ta.value=aiRestore(out,map);
  note.innerHTML=`✅ সাজানো হয়েছে — পাঠানোর আগে পড়ে নাও। <button type="button" class="ai-undo" onclick="aiUndoMsg()">↩ আগের লেখা ফেরাও</button> ${aiLeftText()}`;
}
function aiUndoMsg(){ const ta=document.getElementById('sm_msg'); if(ta&&aiPrevMsg!=null){ ta.value=aiPrevMsg; const n=document.getElementById('aiMsgNote'); if(n) n.textContent='আগের লেখা ফেরানো হয়েছে।'; } }

/* ---- ২) চ্যাট: AI টুল চায়, টুল ফোনেই চলে ---- */
function aiNames(){
  const n=[]; try{ getAllKnownNames().forEach(x=>n.push(x)); Object.keys(khataBalances(getKhata())).forEach(x=>n.push(x)); const st=lsGet('tr_students',{}); Object.keys(st).forEach(k=>{ n.push(k); const g=(st[k]||{}).guardianName; if(g) n.push(g); }); }catch(e){}
  return n;
}
const AI_TOOLS=[
  {name:'get_overview',description:'টিউশনের সারসংক্ষেপ: ছাত্র সংখ্যা, সপ্তাহের ক্লাস-ঘণ্টা, ঝুঁকি ও সিলেবাসের গণনা (টাকার তথ্য নয়)',input_schema:{type:'object',properties:{}}},
  {name:'list_risky_students',description:'ঝুঁকিতে থাকা ছাত্রদের তালিকা (স্কোর ও কারণসহ), সবচেয়ে ঝুঁকিপূর্ণ আগে',input_schema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:10}}}},
  {name:'get_student',description:'একজন ছাত্রের বিস্তারিত: উপস্থিতি, অগ্রগতি, সপ্তাহে ক্লাস, ঝুঁকির কারণ, সিলেবাস অবস্থা। id যেমন "ছাত্র-3"',input_schema:{type:'object',properties:{id:{type:'string'}},required:['id']}},
  {name:'get_syllabus_status',description:'সিলেবাস পূর্বাভাস: কে ঠিক পথে, কে ঝুঁকিতে, কে পিছিয়ে',input_schema:{type:'object',properties:{}}},
  {name:'get_money_summary',description:'আর্থিক সারসংক্ষেপ: মাসের আয়, ঘণ্টা-প্রতি আয় (শুধু ফাইন্যান্স আনলক থাকলে)',input_schema:{type:'object',properties:{}}}
];
let aiSess=null;
function aiRunTool(name,input){
  const map=aiSess.map; input=input||{};
  try{
    if(name==='get_overview'){
      const names=getAllKnownNames(), ch=churnAll(), sf=sfAll().filter(s=>s.hasTargets), rd=radarData();
      return {students:names.length, weekly_class_hours:Math.round(rd.weeklyHrs*10)/10, free_slots_per_week:rd.free.length, risk:{high:ch.filter(x=>x.band==='high').length,medium:ch.filter(x=>x.band==='medium').length,low:ch.filter(x=>x.band==='low').length}, syllabus:{behind:sf.filter(s=>s.status==='behind'||s.status==='overdue').length,at_risk:sf.filter(s=>s.status==='risk').length,on_track:sf.filter(s=>s.status==='ok').length}};
    }
    if(name==='list_risky_students'){
      const lim=Math.max(1,Math.min(10,Number(input.limit)||5)); return {students:churnAll().filter(x=>x.band!=='low').slice(0,lim).map(x=>({id:map.fwd[x.name],band:x.band,score:x.score,reasons:x.reasons.slice(0,3).map(r=>isFinanceHidden()&&r.key==='pay'?'আর্থিক কারণ (লুকানো)':r.text)}))};
    }
    if(name==='get_student'){
      const real=map.rev[String(input.id||'').trim()]; if(!real) return {error:'এই id-র কোনো ছাত্র নেই'};
      const ix=smIndex(), f=churnFeatures(real,ix), r=churnScore(f), sf=sfAll().find(s=>s.name===real), sess=sfSessionDates(real,7).length, sum=(()=>{ try{ return computeStudentSummary(real); }catch(e){ return {}; } })();
      return {id:input.id, attendance_percent:sum.attendanceRate==null?null:Math.round(sum.attendanceRate), progress_percent:Math.round(thkProgress(real)), classes_per_week:(function(){ let c=0; SCHEDULE.forEach(s=>DAYS.forEach(d=>{ if(getCellText(s,d).split(',').map(x=>x.trim()).includes(real)) c++; })); return c; })(), risk:{band:r.band,score:r.score,reasons:r.reasons.map(x=>isFinanceHidden()&&x.key==='pay'?'আর্থিক কারণ (লুকানো)':x.text)}, syllabus:sf?{status:sf.status}:null};
    }
    if(name==='get_syllabus_status') return {students:sfAll().filter(s=>s.hasTargets).map(s=>({id:map.fwd[s.name],status:s.status,next_deadline_missing_chapters:s.items[0]?Math.round(s.items[0].need*10)/10:0}))};
    if(name==='get_money_summary'){
      if(isFinanceHidden()) return {locked:true,message:'ফাইন্যান্স আনলক করা নেই'};
      const rd=radarData(); return {monthly_income:rd.income, hourly_rate:Math.round(rd.avg), students_paying:rd.rows.filter(r=>r.fee>0).length, students_without_fee:rd.noFee.length};
    }
    return {error:'অজানা টুল'};
  }catch(e){ return {error:'টুল চালাতে সমস্যা'}; }
}
let aiChat={msgs:[],busy:false,log:[]};
function aiChatOpen(){
  if(!lsGet('tr_aiPass','')){ aiSetupPage(); return; }
  aiSess={map:aiTokenMap(aiNames())}; aiChat={msgs:[],busy:false,log:[]};
  const sugg=['এই সপ্তাহে কাকে নিয়ে সবচেয়ে বেশি চিন্তা করা উচিত?','সিলেবাস নিয়ে কে সবচেয়ে বিপদে?','আমার টিউশনের সার্বিক অবস্থা কেমন?'];
  showKhataModal('🤖 AI জিজ্ঞেস করো',`<div id="aiChatBox"><div class="ai-priv">🔒 নাম ও ফোন ছাড়া পাঠানো হয় · AI ফোনের ডেটা সরাসরি দেখে না, শুধু টুলের ফল পায়</div><div id="aiLog" class="ai-log"></div>
    <div class="ai-sugg">${sugg.map(s=>`<button type="button" class="pct-chip" onclick="aiSuggest(this)">${s}</button>`).join('')}</div>
    <div class="ai-in"><input class="kh-in" id="ai_q" placeholder="যা জানতে চাও লেখো…" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();aiSend();}"><button type="button" class="kh-fab" onclick="aiSend()">পাঠাও</button></div><div id="aiLeft" class="ai-note">${aiLeftText()}</div></div>`);
}
function aiSuggest(b){ document.getElementById('ai_q').value=b.textContent; aiSend(); }
function aiLogAdd(who,html,cls){ const l=document.getElementById('aiLog'); if(!l) return null; const d=document.createElement('div'); d.className='ai-b '+who+(cls?' '+cls:''); d.innerHTML=html; l.appendChild(d); l.scrollTop=l.scrollHeight; d.scrollIntoView&&d.scrollIntoView({block:'nearest'}); return d; }
async function aiSend(){
  const inp=document.getElementById('ai_q'); if(!inp||aiChat.busy) return; const q=inp.value.trim(); if(!q) return; inp.value=''; aiChat.busy=true;
  aiLogAdd('me',escapeHtml(q)); const wait=aiLogAdd('ai','⏳ ভাবছি…','wait'); let tools=0;
  aiChat.msgs.push({role:'user',content:aiScrub(q,aiSess.map)});
  for(let round=0;round<5;round++){
    const r=await aiCall({system:AI_CHAT_SYSTEM,messages:aiChat.msgs,tools:AI_TOOLS,max_tokens:700});
    if(!r.ok){ wait.className='ai-b ai err'; wait.textContent='⚠️ '+aiErrText(r.error); aiChat.msgs.pop(); aiChat.busy=false; return; }
    const {text,toolUses}=aiBlocks(r.data.content); aiChat.msgs.push({role:'assistant',content:r.data.content});
    if(r.data.stop_reason==='tool_use' && toolUses.length){
      const results=toolUses.map(t=>{ tools++; return {type:'tool_result',tool_use_id:t.id,content:JSON.stringify(aiRunTool(t.name,t.input))}; });
      aiChat.msgs.push({role:'user',content:results}); wait.textContent='🔧 তথ্য দেখছি…'; continue;
    }
    wait.className='ai-b ai'; wait.innerHTML=escapeHtml(aiRestore(text||'কোনো উত্তর পাইনি।',aiSess.map)).replace(/\n/g,'<br>')+`<div class="ai-meta">🔧 ${toBn(tools)}টা টুল · 🔒 নাম ছাড়া</div>`;
    const l=document.getElementById('aiLeft'); if(l) l.textContent=aiLeftText(); aiChat.busy=false; return;
  }
  wait.className='ai-b ai err'; wait.textContent='⚠️ অনেক ধাপ লাগছে — প্রশ্নটা ছোট করে আবার করো।'; aiChat.busy=false;
}

/* ---- সেটিংস কার্ড + সেটআপ পাতা ---- */
function aiCardHtml(){
  const has=!!lsGet('tr_aiPass','');
  return `<div id="aiCard" class="ab-card" style="margin-top:12px;"><div style="font-size:12.5px;font-weight:700;color:var(--paper);margin-bottom:4px;">🤖 AI সহকারী (Claude)</div>
    <div class="backup-status${has&&aiOn()?'':' backup-status-warn'}">${!aiOn()?'⏸ বন্ধ করা আছে':(has?'✅ পাসকোড দেওয়া আছে '+aiLeftText():'⚠️ এখনো চালু হয়নি — নিচে ধাপগুলো দেখো')}</div>
    <input class="kh-in" id="ai_pass" type="password" placeholder="AI পাসকোড (Netlify-তে যা দিয়েছ)" autocomplete="off" style="margin-top:8px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><button class="settings-btn" style="margin:0;" onclick="aiSavePass()">💾 সেভ</button><button class="settings-btn" style="margin:0;" onclick="aiTest()">🧪 পরীক্ষা</button></div>
    <button class="settings-btn" onclick="aiToggle()">${aiOn()?'⏸ AI বন্ধ করো':'▶️ AI চালু করো'}</button><button class="settings-btn" onclick="aiSetupPage()">📖 সেটআপের ধাপ ও গোপনীয়তা</button><div id="aiTestNote" class="ai-note"></div></div>`;
}
function aiSavePass(){ const v=(document.getElementById('ai_pass').value||'').trim(); if(!v){ showWarningToast('পাসকোড লেখো।'); return; } lsSet('tr_aiPass',v); showSuccessToast('AI পাসকোড সেভ হয়েছে'); const c=document.getElementById('aiCard'); if(c) c.outerHTML=aiCardHtml(); }
function aiToggle(){ lsSet('tr_aiOn',!aiOn()); const c=document.getElementById('aiCard'); if(c) c.outerHTML=aiCardHtml(); }
async function aiTest(){
  const n=document.getElementById('aiTestNote'); if(n) n.textContent='⏳ পরীক্ষা চলছে…';
  const r=await aiCall({system:'Reply with exactly: ঠিক আছে',messages:[{role:'user',content:'test'}],max_tokens:20});
  if(n) n.textContent=r.ok?('✅ AI কাজ করছে। '+aiLeftText()):('⚠️ '+aiErrText(r.error));
}
function aiSetupPage(){
  showKhataModal('📖 AI সেটআপ',`<div class="ai-setup"><div class="ai-priv">🔒 <b>কী বাইরে যায়:</b> নাম ও ফোন সরানো মেসেজের খসড়া, আর টুলের নাম-ছাড়া সারসংক্ষেপ (যেমন "ছাত্র-3: ঝুঁকি উচ্চ, কারণ অনুপস্থিতি")। <b>কী যায় না:</b> আসল নাম, ফোন নম্বর, ব্যাকআপ, খাতার লেনদেন।</div>
    <ol class="ai-steps"><li><b>Claude Platform-এ অ্যাকাউন্ট</b> খুলে একটা <b>API কী</b> বানাও (platform.claude.com)। সেখানে মাসিক <b>খরচের সীমা (spend limit)</b> ছোট একটা অঙ্কে বেঁধে দাও।</li>
    <li><b>Netlify</b> → তোমার প্রজেক্ট → Project configuration → Environment variables-এ দুটো যোগ করো: <code>ANTHROPIC_API_KEY</code> = ওই কী; <code>AI_PASSCODE</code> = তোমার নিজের বানানো একটা গোপন শব্দ।</li>
    <li>অ্যাপ আবার <b>ডিপ্লয়</b> করো (ফাংশন <code>ai.mjs</code> সহ পুরো ফোল্ডার)।</li>
    <li>এখানে সেটিংস → <b>AI সহকারী</b>-তে ওই গোপন শব্দ বসিয়ে সেভ করে <b>পরীক্ষা</b> চাপো।</li></ol>
    <div class="ai-priv">💰 <b>খরচ:</b> ছোট দ্রুত মডেল (Haiku 5.5) ব্যবহার হয়; প্রকাশিত দাম প্রায় $0.10 / $0.50 প্রতি ১০ লক্ষ টোকেন (ইনপুট/আউটপুট) — একটা চ্যাট-উত্তর সাধারণত এক সেন্টের ভগ্নাংশ। সঠিক দাম অফিসিয়াল প্রাইসিং পাতায় দেখে নিও। ফাংশনে নিজেই দৈনিক সীমা আছে (ডিভাইসপ্রতি ৮০, মোট ৪০০ অনুরোধ)।</div>
    <div class="ai-priv">🛡️ পাসকোড না থাকলে ফাংশন নিজেই চলতে অস্বীকার করে — যাতে অন্য কেউ তোমার টাকায় AI চালাতে না পারে।</div></div>`);
}
