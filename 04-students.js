/* ============ STUDENTS TAB (Phase 2: roster derived from schedule + editable profile per student) ============ */
let studentFilter='all', studentQuery='';
function onStudentSearch(v){ studentQuery=(v||'').trim().toLowerCase(); renderStudentsTab(); }
function setStudentFilter(f){ studentFilter=f; renderStudentsTab(); }
function clearStudentFilters(){ studentFilter='all'; studentQuery=''; const i=document.getElementById('studentSearch'); if(i) i.value=''; renderStudentsTab(); }
function renderStudentsTab(){
  const el=document.getElementById('studentsList'), countEl=document.getElementById('studentsCount'), fEl=document.getElementById('studentFilters');
  if(!el) return;
  const hide=isFinanceHidden();
  const dueMap={}; computeDueList().forEach(x=>dueMap[x.name]=x);
  const all=getAllKnownNames().map(name=>{
    let weeklyCount=0;
    DAYS.forEach(d=>{ SCHEDULE.forEach(slot=>{ if(getCellText(slot,d).split(',').map(s=>s.trim()).includes(name)) weeklyCount++; }); });
    const pr=getStudentProfiles()[name]||{};
    const filled=studentProfileFilledCount(name);
    return {name, weeklyCount, color:avatarColor(name), initial:(name.trim()[0]||'?'), filled, total:STUDENT_FIELDS.length, avatar:pr.avatar||'', klass:(pr.klass||'').trim(), due:dueMap[name]?dueMap[name].due:0};
  }).sort((a,b)=>b.weeklyCount-a.weeklyCount);
  const counts={all:all.length, due:all.filter(r=>r.due>0).length, incomplete:all.filter(r=>r.filled<4).length};
  if(fEl) fEl.innerHTML=[['all','সবাই'],['due','বকেয়া আছে'],['incomplete','প্রোফাইল বাকি']].map(([k,l])=>
    `<button class="st-chip${studentFilter===k?' active':''}" onclick="setStudentFilter('${k}')">${l}<span class="n">${toBn(counts[k])}</span></button>`).join('');
  let rows=all;
  if(studentFilter==='due') rows=rows.filter(r=>r.due>0);
  else if(studentFilter==='incomplete') rows=rows.filter(r=>r.filled<4);
  if(studentQuery) rows=rows.filter(r=>(r.name+' '+r.klass).toLowerCase().includes(studentQuery));
  if(countEl) countEl.textContent = rows.length===all.length ? `মোট ${toBn(all.length)} জন` : `${toBn(rows.length)} জন দেখাচ্ছে (মোট ${toBn(all.length)})`;
  if(!rows.length){ el.innerHTML=(studentFilter==='due'&&!studentQuery)?emptyState({icon:'check',title:'কারো বকেয়া নেই',body:'সবাই এই মাসের ফি মিটিয়ে দিয়েছে।'}):emptyState({icon:'search',title:'কাউকে পাওয়া যায়নি',body:'নাম বা ক্লাস অন্যভাবে লিখে দেখো।',label:'ফিল্টার সরাও',onclick:"clearStudentFilters()"}); return; }
  el.innerHTML = rows.map((r,i)=>{
    const q=jsq(r.name);
    const pct=Math.round(r.filled/r.total*100);
    const status = r.due>0 ? `<span class="sc2-due">${hide?'বকেয়া':'বকেয়া '+bnTaka(r.due)}</span>` : `<span class="sc2-ok">✓ ঠিক আছে</span>`;
    return `<div class="sc2" style="--sc:${r.color};animation-delay:${Math.min(i,12)*30}ms" onclick="openStudentModal('${q}')">
      <div class="student-avatar" style="background:${r.color}22;color:${r.color};">${studentAvatarInner(r.name, r.avatar, r.initial)}</div>
      <div class="student-info">
        <div class="sc2-top"><span class="sc2-name">${escapeHtml(r.name)}</span></div>
        <div class="sc2-meta">${r.klass?`<span class="sc2-tag">${escapeHtml(r.klass)}</span>`:''}<span class="sc2-tag">সপ্তাহে ${toBn(r.weeklyCount)}টা ক্লাস</span></div>
        <div class="sc2-bar" title="প্রোফাইল ${toBn(pct)}% পূর্ণ"><i style="width:${pct}%"></i></div>
      </div>
      <div class="sc2-side">${status}${r.due>0?`<button class="sc2-wa" title="WhatsApp তাগাদা" onclick="event.stopPropagation();sendDueReminderWA('${q}')">💬</button>`:''}</div>
    </div>`;
  }).join('');
}

/* ---- Student detail / profile modal ---- */
let studentModalName=null;
function openStudentModal(name){
  studentModalName=name;
  renderStudentModal();
  document.getElementById('studentModal').style.display='flex';
}
function closeStudentModal(){ document.getElementById('studentModal').style.display='none'; studentModalName=null; }
function renderStudentModal(){
  const name=studentModalName; if(!name) return;
  const profile=getStudentProfile(name);
  let weeklySlots=[];
  DAYS.forEach(d=>{ SCHEDULE.forEach(slot=>{ if(getCellText(slot,d).split(',').map(s=>s.trim()).includes(name)) weeklySlots.push(`${DAY_BN[d]} ${slot.label}`); }); });

  document.getElementById('studentModalTitle').textContent = `👤 ${escapeHtml(name)}`;
  const body=document.getElementById('studentModalBody');

  const avatar = profile.avatar || '';
  const photoColor = avatarColor(name);
  const pickRow=(g,label)=>`<div style="width:100%;font-size:11.5px;color:var(--muted);margin:4px 0 2px;">${label}</div>`+
    [0,1,2,3,4,5].map(n=>`<button type="button" class="av-pick${(g+n)===avatar?' active':''}" onclick="setStudentAvatar('${g+n}')" title="${label}">${avatarSvg(g+n, photoColor)}</button>`).join('');
  const photoHtml = `<div class="sm-photo-row">
    <div class="sm-photo-avatar" style="background:${photoColor}22;color:${photoColor};">${studentAvatarInner(name, avatar, name.trim()[0]||'?')}</div>
    ${editMode?`<div class="sm-photo-actions" style="flex:1;">
        ${pickRow('b','বালক')}
        ${pickRow('g','বালিকা')}
        ${avatar?`<button type="button" class="pct-chip" style="margin-top:6px;" onclick="setStudentAvatar('')">অবতার সরাও</button>`:''}
      </div>`:''}
  </div>`;
  const shareButtonHtml = `<button class="settings-btn" onclick="shareStudentReport('${jsq(name)}')" style="margin-bottom:14px;"><span class="ic">${ICN.share}</span> প্রগ্রেস রিপোর্ট শেয়ার করো</button><button class="settings-btn" onclick="sendMonthReportWA('${jsq(name)}')" style="margin-bottom:6px;">📅 এই মাসের রিপোর্ট — অভিভাবকের WhatsApp-এ</button><button type="button" class="pay-month-link" style="margin-bottom:14px;" onclick="copyMonthReport('${jsq(name)}')">📋 এই মাসের রিপোর্ট কপি করো</button>`;
  const summaryHtml = renderStudentSummaryCard(name);
  const scheduleHtml = `<div class="sm-section-title">📅 সাপ্তাহিক ক্লাস (${toBn(weeklySlots.length)}টা)</div>
    <div class="sm-slots">${weeklySlots.map(s=>`<span class="sm-slot-chip">${escapeHtml(s)}</span>`).join('')}</div>`;

  if(editMode){
    body.innerHTML = `
      ${photoHtml}
      ${shareButtonHtml}
      ${summaryHtml}
      ${scheduleHtml}
      ${renderStudentNotesCopySection(name)}
      <div class="sm-section-title" style="margin-top:14px;"><span class="ic">${ICN.pencil}</span> প্রোফাইল তথ্য</div>
      ${STUDENT_FIELDS.map(f=>`
        <div class="sm-field">
          <label class="sm-field-label">${f.label}${(f.key==='admissionDate'||f.key==='examDate')?' <span style="font-weight:400;color:var(--muted2);">(YYYY-MM-DD লিখলে রিমাইন্ডার কাজ করবে, যেমন 2026-01-15)</span>':''}</label>
          <input type="text" class="sm-field-input" id="sm_${f.key}" value="${escapeHtml(profile[f.key]||'')}">
        </div>`).join('')}
      <button class="modal-btn primary" style="width:100%;margin-top:6px;" onclick="saveStudentModal()">💾 প্রোফাইল সেভ করো</button>
      ${renderProgressSection(name, true)}
      ${renderPaymentSection(name, true)}
      <button type="button" class="settings-btn" style="margin-top:16px;" onclick="onRenameStudent()">✏️ নাম বদলাও (সব তথ্য একসাথে সরবে)</button>
      <div class="sm-section-title" style="margin-top:16px;color:var(--due);"><span class="ic">${ICN.ban_warn}</span> বিপজ্জনক অঞ্চল</div>
      <button class="settings-btn" style="border-color:rgba(226,103,122,0.35);color:var(--due);" onclick="onDeleteStudent()"><span class="ic">${ICN.ban}</span> শিডিউল থেকে বাদ দাও</button>
      <button class="settings-btn" style="border-color:rgba(226,103,122,0.35);color:var(--due);margin-top:8px;" onclick="onEraseStudentData()"><span class="ic">${ICN.trash}</span> সব তথ্য স্থায়ীভাবে মুছে ফেলো</button>`;
  } else {
    const filledFields = STUDENT_FIELDS.filter(f=>(profile[f.key]||'').trim());
    body.innerHTML = `
      ${photoHtml}
      ${shareButtonHtml}
      ${summaryHtml}
      ${scheduleHtml}
      ${renderStudentNotesCopySection(name)}
      <div class="sm-section-title" style="margin-top:14px;">📋 প্রোফাইল তথ্য</div>
      ${filledFields.length ? filledFields.map(f=>`
        <div class="sm-view-row"><span class="sm-view-label">${f.label}</span><span class="sm-view-value">${escapeHtml(profile[f.key])}</span></div>
      `).join('') : `<div class="ins-empty">এখনো কোনো তথ্য যোগ করা হয়নি — এডিট মোডে এসে অভিভাবকের ফোন নম্বর, স্কুল ইত্যাদি যোগ করো।</div>`}
      ${renderProgressSection(name, false)}
      ${renderPaymentSection(name, false)}
      <div class="sm-edit-hint"><span class="ic">${ICN.pencil}</span> তথ্য যোগ/বদলাতে সিডিউল ট্যাব থেকে এডিট মোড খুলো।</div>`;
  }
}
function saveStudentModal(){
  if(!studentModalName) return;
  const profile={...getStudentProfile(studentModalName)}; // preserve fields not shown in this form, like avatar
  STUDENT_FIELDS.forEach(f=>{ const el=document.getElementById('sm_'+f.key); profile[f.key]=el?el.value.trim():''; });
  saveStudentProfile(studentModalName, profile);
  renderStudentModal();
  renderStudentsTab();
  showSuccessToast('প্রোফাইল সেভ হয়েছে');
}
/* ---- Student avatar: a flat boy/girl illustration drawn as inline SVG (no images, works offline). ---- */
/* profile.avatar is a short code: 'b0'..'b5' (boy) or 'g0'..'g5' (girl) — school-uniform portraits that */
/* differ in skin tone, hairstyle, hair colour and uniform colour. */
/* Old uploaded photos are no longer shown; their data is left untouched in storage. */
const AV_SKIN=['#f6d5b8','#e0ab7c','#b07548'];
const AV_NECK=['#e8bd9b','#cb925f','#9a6339'];
const AV_HAIR=['#2a1f17','#5e3b24'];
const AV_SET={
  b:[{s:0,k:0,h:0,u:'#1f3a5f',bg:'#dbe4ff'},{s:1,k:1,h:0,u:'#24473b',bg:'#d3f0e6'},{s:2,k:2,h:0,u:'#3b3b6d',bg:'#e9defa'},{s:0,k:1,h:1,u:'#1f3a5f',bg:'#fde4d6'},{s:1,k:0,h:1,u:'#5a2d3b',bg:'#fff0c9'},{s:2,k:1,h:0,u:'#24473b',bg:'#d6eef7'}],
  g:[{s:0,k:0,h:0,u:'#1f3a5f',bg:'#e9defa'},{s:1,k:1,h:0,u:'#5a2d3b',bg:'#fde4d6'},{s:2,k:2,h:1,u:'#24473b',bg:'#d3f0e6'},{s:0,k:1,h:1,u:'#3b3b6d',bg:'#dbe4ff'},{s:1,k:0,h:0,u:'#1f3a5f',bg:'#fff0c9'},{s:2,k:1,h:1,u:'#5a2d3b',bg:'#d6eef7'}]
};
function avatarSvg(code){
  const m=/^([bg])([0-5])$/.exec(code||''); if(!m) return '';
  const girl=m[1]==='g', v=AV_SET[m[1]][+m[2]];
  const skin=AV_SKIN[v.k], neck=AV_NECK[v.k], hair=AV_HAIR[v.h];
  const hi='rgba(255,255,255,.22)';
  let back='', top='';
  if(!girl){
    if(v.s===0){
      top=`<path d="M19.5 29C18.3 15 27 10 33 10C42 10 46.5 17 44.5 29C43.5 24.5 40.5 21.5 36 20C31.5 23 25.5 24.5 21.5 26C20.3 26.7 19.8 27.8 19.5 29Z" fill="${hair}"/><path d="M26 14.5C30 12 36 12 40 15" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round"/>`;
    } else if(v.s===1){
      top=`<path d="M20 27C19.5 16 26 11.5 32 11.5C39 11.5 44.5 16 44 27C42.2 22.5 38 19.6 32 19.6C26 19.6 22 22.5 20 27Z" fill="${hair}"/><path d="M25 15C29 13 35 13 39 15.5" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round"/>`;
    } else {
      top=`<g fill="${hair}"><circle cx="22.5" cy="21" r="5"/><circle cx="28" cy="15.5" r="5.5"/><circle cx="35" cy="14.8" r="5.5"/><circle cx="41.5" cy="20" r="5"/><circle cx="20.8" cy="27" r="3.4"/><circle cx="43.2" cy="27" r="3.4"/></g>`;
    }
  } else {
    if(v.s===0 || v.s===3 || v.s===5){
      back=`<path d="M15.5 31C15 11 49 11 48.5 31L51 54C45 56.5 40 52 40 47L24 47C24 52 19 56.5 13 54Z" fill="${hair}"/>`;
      top=`<path d="M20 30C20 17 28 13.5 33 13.5C41 13.5 45 19 44 30C40.5 22.5 34.5 20 30 20.5C26 22.5 22 26 20 30Z" fill="${hair}"/><path d="M26 16C30 14 36 14 40 17" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round"/>`;
    } else if(v.s===1 || v.s===4){
      back=`<path d="M16.5 32C16 11.5 48 11.5 47.5 32L48 43C44 46 38.5 45 37.5 41L26.5 41C25.5 45 20 46 16 43Z" fill="${hair}"/>`;
      top=`<path d="M20 27.5C20 16.5 28 13 32 13C38 13 44 16.5 44 27.5C40.5 22.5 36 21.2 32 21.2C28 21.2 23.5 22.5 20 27.5Z" fill="${hair}"/><path d="M25 16.5C29 14.5 35 14.5 39 16.5" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round"/>`;
    } else {
      back=`<circle cx="32" cy="9.5" r="5.6" fill="${hair}"/>`;
      top=`<path d="M20 29C19.5 17 26 12.5 32 12.5C38 12.5 44.5 17 44 29C41 23 37 20.5 32 20.5C27 20.5 23 23 20 29Z" fill="${hair}"/><path d="M26 15.5C30 13.8 36 13.8 40 15.8" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round"/><rect x="28.8" y="13.2" width="6.4" height="2.2" rx="1.1" fill="#c0392b"/>`;
    }
  }
  const brow=girl?1.1:1.4;
  const neckline=girl
    ?`<path d="M26 46.2L32 57L38 46.2Z" fill="#fff"/><path d="M32 52.2L27.4 49.6L27.4 55Z M32 52.2L36.6 49.6L36.6 55Z" fill="#c0392b"/><circle cx="32" cy="52.2" r="1.3" fill="#a52f23"/>`
    :`<path d="M26 46.2L32 57L38 46.2Z" fill="#fff"/><path d="M32 51.5L30.4 54.2L32 62L33.6 54.2Z" fill="#c0392b"/><path d="M30.6 50.6L33.4 50.6L32.6 52L31.4 52Z" fill="#a52f23"/>`;
  return `<svg class="av-svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="${v.bg}"/>${back}`+
    `<path d="M27.6 38L27.6 47.5Q32 51.5 36.4 47.5L36.4 38Z" fill="${neck}"/>`+
    `<path d="M5 64C5 52 17 46 32 46C47 46 59 52 59 64Z" fill="${v.u}"/>${neckline}`+
    `<path d="M26 46.2L29.6 56.6M38 46.2L34.4 56.6" stroke="rgba(0,0,0,.28)" stroke-width="1" fill="none" stroke-linecap="round"/>`+
    `<circle cx="20" cy="31.5" r="2.3" fill="${skin}"/><circle cx="44" cy="31.5" r="2.3" fill="${skin}"/>`+
    `<ellipse cx="32" cy="30.5" rx="11.6" ry="13" fill="${skin}"/>${top}`+
    `<circle cx="24.6" cy="35.6" r="2.3" fill="#e57368" opacity=".22"/><circle cx="39.4" cy="35.6" r="2.3" fill="#e57368" opacity=".22"/>`+
    `<path d="M24.3 27.4Q27.4 25.9 30.4 27.2M33.6 27.2Q36.6 25.9 39.7 27.4" fill="none" stroke="${hair}" stroke-width="${brow}" stroke-linecap="round"/>`+
    `<ellipse cx="27.5" cy="31" rx="1.5" ry="1.9" fill="#231a14"/><ellipse cx="36.5" cy="31" rx="1.5" ry="1.9" fill="#231a14"/><circle cx="28" cy="30.3" r=".5" fill="#fff"/><circle cx="37" cy="30.3" r=".5" fill="#fff"/>`+
    `<path d="M32 32.4Q33.4 34.8 31.6 35.2" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="1" stroke-linecap="round"/>`+
    `<path d="M28.6 38.2Q32 40.8 35.4 38.2" fill="none" stroke="#8a4a3a" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}
function studentAvatarInner(name, code, fallback){
  const svg=avatarSvg(code);
  return svg || escapeHtml(fallback);
}
function setStudentAvatar(code){
  if(!studentModalName) return;
  const profile={...getStudentProfile(studentModalName)};
  if(code) profile.avatar=code; else delete profile.avatar;
  saveStudentProfile(studentModalName, profile);
  renderStudentModal();
  renderStudentsTab();
}

/* ---- Subject/chapter progress section within the student modal ---- */
function renderProgressSection(name, editableMode){
  const subjects=getStudentSubjects(name);
  const subjectNames=Object.keys(subjects);
  const academicPct=computeStudentAcademicPct(name);
  const attSummary=computeAttendanceSummary()[name];

  let html=`<div class="sm-section-title" style="margin-top:14px;">📊 সার্বিক অগ্রগতি</div>`;
  if(academicPct===null && !attSummary){
    html+=`<div class="ins-empty">এখনো কোনো অগ্রগতির তথ্য নেই — নিচে বিষয় ও অধ্যায় যোগ করে কতদূর পড়ানো হয়েছে ট্র্যাক রাখো।</div>`;
  } else {
    html+=`<div class="prog-overall">
      ${academicPct!==null ? `<div class="prog-overall-item"><span class="prog-overall-label">একাডেমিক</span><div class="prog-bar-outer"><div class="prog-bar-inner" style="width:${academicPct}%"></div></div><span class="prog-overall-pct">${toBn(academicPct)}%</span></div>` : ''}
      ${attSummary ? `<div class="prog-overall-item"><span class="prog-overall-label">উপস্থিতি</span><div class="prog-bar-outer"><div class="prog-bar-inner att-bar" style="width:${attSummary.pct}%"></div></div><span class="prog-overall-pct">${toBn(attSummary.pct)}%</span></div>` : ''}
    </div>`;
  }

  html+=`<div class="sm-section-title" style="margin-top:14px;">📚 বিষয় ও অধ্যায়</div>`;
  if(subjectNames.length===0){
    html+=`<div class="ins-empty">এখনো কোনো বিষয়/অধ্যায় যোগ করা হয়নি — নিচের ফর্ম দিয়ে প্রথম বিষয়টা যোগ করো।</div>`;
  } else {
    subjectNames.forEach(subj=>{
      const chapters=subjects[subj];
      const esc=jsq(subj);
      html+=`<div class="prog-subject">
        <div class="prog-subject-title">${escapeHtml(subj)}${editableMode?`<button class="prog-del-subject" onclick="onDeleteSubject('${esc}')">✕ বিষয় মুছো</button>`:''}</div>
        ${chapters.length===0?`<div class="ins-empty" style="padding-left:2px;">কোনো অধ্যায় নেই।</div>`:chapters.map((c,idx)=>{
          const targetBadge = c.targetDate ? renderTargetBadge(c.targetDate) : '';
          return `
          <div class="prog-chapter-row">
            <span class="prog-chapter-name">${escapeHtml(c.chapter)}${targetBadge}</span>
            <div class="prog-bar-outer"><div class="prog-bar-inner" style="width:${c.pct}%"></div></div>
            ${editableMode
              ? `<input type="number" min="0" max="100" class="prog-pct-input" value="${c.pct}" onchange="onUpdateChapterPct('${esc}',${idx},this.value)">
                 <button class="prog-del-chapter" onclick="onDeleteChapter('${esc}',${idx})">✕</button>`
              : `<span class="prog-pct-label">${toBn(c.pct)}%</span>`}
          </div>
          ${editableMode?`<div class="prog-target-row"><span>🎯 টার্গেট তারিখ:</span><input type="date" class="prog-target-input" value="${c.targetDate||''}" onchange="onUpdateChapterTarget('${esc}',${idx},this.value)"></div>`:''}`;
        }).join('')}
      </div>`;
    });
  }

  if(editableMode){
    html+=`<div class="prog-add-form">
      <div class="sm-section-title"><span class="ic">${ICN.plus}</span> নতুন অধ্যায় যোগ করো</div>
      <input type="text" id="pa_subject" class="sm-field-input" placeholder="বিষয় (যেমন: গণিত)" list="pa_subject_list">
      <datalist id="pa_subject_list">${subjectNames.map(s=>`<option value="${escapeHtml(s)}">`).join('')}</datalist>
      <input type="text" id="pa_chapter" class="sm-field-input" placeholder="অধ্যায়ের নাম (যেমন: Algebra)" style="margin-top:6px;">
      <input type="date" id="pa_target" class="sm-field-input" style="margin-top:6px;" title="টার্গেট তারিখ (ঐচ্ছিক)">
      <input type="hidden" id="pa_pct" value="0">
      <div class="pct-chip-row" id="pa_pct_chips">
        ${[0,25,50,75,100].map(p=>`<button type="button" class="pct-chip${p===0?' active':''}" data-pct="${p}" onclick="selectPctChip('pa_pct_chips','pa_pct',${p},this)">${toBn(p)}%</button>`).join('')}
      </div>
      <button class="settings-btn" style="margin-top:8px;" onclick="onAddChapter()">যোগ করো</button>
    </div>`;
  }
  return html;
}
function selectPctChip(rowId, inputId, pct, btn){
  document.getElementById(inputId).value = pct;
  document.querySelectorAll('#'+rowId+' .pct-chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function onAddChapter(){
  if(!studentModalName) return;
  const subj=document.getElementById('pa_subject').value;
  const chap=document.getElementById('pa_chapter').value;
  const pct=parseFloat(document.getElementById('pa_pct').value)||0;
  const target=document.getElementById('pa_target').value;
  if(!subj.trim()||!chap.trim()) return;
  addSubject(studentModalName, subj);
  addChapter(studentModalName, subj, chap, pct, target);
  renderStudentModal();
  showSuccessToast('অধ্যায় যোগ হয়েছে');
}
function onUpdateChapterTarget(subject, idx, val){
  if(!studentModalName) return;
  updateChapterTarget(studentModalName, subject, idx, val);
  renderStudentModal();
}
function onUpdateChapterPct(subject, idx, val){
  if(!studentModalName) return;
  updateChapterPct(studentModalName, subject, idx, parseFloat(val)||0);
  renderStudentModal();
}
function onDeleteChapter(subject, idx){
  if(!studentModalName) return;
  deleteChapter(studentModalName, subject, idx);
  renderStudentModal();
}
function onDeleteSubject(subject){
  if(!studentModalName) return;
  if(!confirm(`"${subject}" বিষয়ের সব অধ্যায়সহ মুছে ফেলতে চাও?`)) return;
  deleteSubject(studentModalName, subject);
  renderStudentModal();
}

/* ---- Payment section within the student modal (Phase 5) ---- */
function paymentMonthLabel(mk){ return mk==='opening' ? 'আগের বকেয়া' : monthKeyLabel(mk); }
function renderPaymentSection(name, editableMode){
  const pay=getStudentPayment(name);
  const mk=currentMonthKey();
  const paidThisMonth=getStudentPaidForMonth(name, mk);
  const dueThisMonth=getStudentDueForMonth(name, mk);
  const openingBalance=pay.openingBalance||0;
  const totalDue=getStudentTotalDue(name);
  const sortedPayments=pay.payments.slice().sort((a,b)=> b.date.localeCompare(a.date));

  let html=`<div class="sm-section-title" style="margin-top:14px;">💰 পেমেন্ট — ${monthKeyLabel(mk)}</div>`;

  if(editableMode){
    html+=`<div class="sm-field">
      <label class="sm-field-label">মাসিক ফি (৳)</label>
      <input type="number" min="0" class="sm-field-input" id="sm_monthlyFee" value="${pay.monthlyFee||''}" onchange="onSetMonthlyFee(this.value)">
    </div>
    <div class="sm-field" style="margin-top:8px;">
      <label class="sm-field-label">আগের বকেয়া (৳) — এই অ্যাপ ব্যবহার শুরুর আগে বা মাসের হিসাবের বাইরে যা বাকি আছে</label>
      <input type="number" min="0" class="sm-field-input" id="sm_openingBalance" value="${openingBalance||''}" onchange="onSetOpeningBalance(this.value)">
    </div>`;
  }

  if(pay.monthlyFee>0 || openingBalance>0){
    html+=`<div class="pay-status-row">
      <span class="pay-chip pay-chip-fee">এই মাসের ফি ${bnTaka(pay.monthlyFee)}</span>
      <span class="pay-chip pay-chip-paid">এই মাসে পরিশোধ ${bnTaka(paidThisMonth)}</span>
      <span class="pay-chip ${dueThisMonth>0?'pay-chip-due':'pay-chip-clear'}">এই মাসে বাকি ${bnTaka(dueThisMonth)}</span>
    </div>
    ${openingBalance>0?`<div class="pay-status-row" style="margin-top:6px;"><span class="pay-chip pay-chip-due">আগের বকেয়া ${bnTaka(openingBalance)}</span></div>`:''}
    <div class="ssum-card" style="margin-top:10px;padding:10px 12px;">
      <div class="ssum-row" style="justify-content:center;">
        <div class="ssum-item">
          <div class="ssum-num" style="color:${totalDue>0?'var(--due)':'var(--paid)'};font-size:17px;">${totalDue>0?bnTaka(totalDue):'✅ সব পরিশোধ'}</div>
          <div class="ssum-lb">সর্বমোট বকেয়া (আগের + এই মাসের)</div>
        </div>
      </div>
    </div>
    ${totalDue>0?`<button class="settings-btn" style="margin-top:8px;" onclick="sendDueReminderWA(studentModalName)"><span class="ic">${ICN.share}</span> বকেয়ার মেসেজ পাঠাও (WhatsApp)</button>`:''}`;
  } else {
    html+=`<div class="ins-empty">এখনো মাসিক ফি নির্ধারণ করা হয়নি — নিচে ফি লিখলে বকেয়া হিসাব এখান থেকেই দেখা যাবে।</div>`;
  }

  html+=`<div class="sm-section-title" style="margin-top:12px;">🧾 পেমেন্ট হিস্ট্রি</div>`;
  html+= sortedPayments.length ? sortedPayments.map(p=>`
      <div class="pay-history-row">
        <span>${bnDateLabel(new Date(p.date+'T00:00:00'))} · ${paymentMonthLabel(p.monthKey)}${p.method?' · '+escapeHtml(p.method):''}${p.note?' · '+escapeHtml(p.note):''}</span>
        <span class="pay-history-amt">${bnTaka(p.amount)} <button class="prog-del-chapter" title="রসিদ" onclick="openReceipt('${p.id}')">🧾</button>${editableMode?` <button class="prog-del-chapter" onclick="onEditPayment('${p.id}')">✏️</button> <button class="prog-del-chapter" onclick="onDeletePayment('${p.id}')">✕</button>`:''}</span>
      </div>`).join('') : `<div class="ins-empty">এখনো কোনো পেমেন্ট যোগ করা হয়নি — টাকা পেলে নিচে যোগ করে রাখো, হিসাব এখানেই থাকবে।</div>`;

  if(editableMode){
    const monthOptions=[];
    for(let i=0;i<6;i++){
      const d=new Date(); d.setMonth(d.getMonth()-i);
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthOptions.push(`<option value="${k}"${k===mk?' selected':''}>${monthKeyLabel(k)}</option>`);
    }
    html+=`<div class="prog-add-form">
      <div class="sm-section-title"><span class="ic">${ICN.plus}</span> পেমেন্ট যোগ করো</div>
      <input type="text" inputmode="none" id="pp_amount" class="sm-field-input" placeholder="টাকার পরিমাণ (যেমন ২৫০+১৩০×২)" autocomplete="off" oninput="calcPreview('pp_amount')">${calcPadHtml('pp_amount')}
      ${pay.monthlyFee>0?`<button type="button" class="pct-chip" style="margin-top:6px;" onclick="document.getElementById('pp_amount').value=${pay.monthlyFee}">পুরো ফি ${bnTaka(pay.monthlyFee)}</button>`:''}
      <div class="sm-field" style="margin-top:6px;">
        <label class="sm-field-label">কীভাবে পরিশোধ হলো?</label>
        <input type="hidden" id="pp_method" value="নগদ">
        <div class="pct-chip-row" id="pp_method_chips">
          ${PAYMENT_METHODS.map((m,i)=>`<button type="button" class="pct-chip${i===0?' active':''}" onclick="selectPctChip('pp_method_chips','pp_method','${m}',this)">${m}</button>`).join('')}
        </div>
      </div>
      <input type="text" id="pp_note" class="sm-field-input" placeholder="নোট (ঐচ্ছিক)" style="margin-top:6px;">
      <div class="sm-field" id="pp_month_field" style="margin-top:8px;display:none;">
        <label class="sm-field-label">কোন মাসের জন্য?</label>
        <select id="pp_month" class="sm-field-input">
          <option value="__opening__"${openingBalance>0?'':' disabled'}>আগের বকেয়া থেকে কমাও</option>
          ${monthOptions.join('')}
        </select>
      </div>
      <button type="button" class="pay-month-link" id="pp_month_link" onclick="togglePaymentMonthField()">এই মাসের জন্য নয়? পরিবর্তন করো</button>
      <button class="settings-btn" style="margin-top:8px;" onclick="onAddPayment()">যোগ করো</button>
    </div>`;
  }
  return html;
}
/* ============ RECEIPT + WHATSAPP (guardian messaging) ============ */
/* A receipt is built on the fly from an existing payment record — nothing new is stored except */
/* the teacher's name (tr_teacherName) used on the receipt. Messages open WhatsApp via wa.me with */
/* the guardian's saved phone; if no phone is saved, WhatsApp opens its contact picker instead. */
function waNumber(phone){
  let d=String(phone||'').replace(/[^0-9]/g,'');
  if(!d) return '';
  if(d.startsWith('00')) d=d.slice(2);
  if(d.startsWith('880')) return d;
  if(d.startsWith('0')) return '88'+d;
  if(d.length===10) return '880'+d;
  return d;
}
function openWhatsApp(phone, text){
  const num=waNumber(phone);
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}
function getTeacherName(askIfMissing){
  let n=lsGet('tr_teacherName','');
  if(!n && askIfMissing){
    const v=prompt('রসিদে যে নাম থাকবে (আপনার নাম):','');
    if(v && v.trim()){ n=v.trim(); lsSet('tr_teacherName', n); }
  }
  return n||'';
}
function changeTeacherName(){
  const cur=lsGet('tr_teacherName','');
  const v=prompt('রসিদে যে নাম থাকবে:', cur);
  if(v===null) return;
  lsSet('tr_teacherName', v.trim());
  if(receiptCtx) renderReceipt();
}
function studentDisplayName(name){
  const pr=getStudentProfile(name);
  return (pr.nickname||'').trim() || name;
}
let receiptCtx=null;
function openReceipt(paymentId, forName){
  const who = forName || studentModalName; if(!who) return;
  const pay=getStudentPayment(who);
  const p=pay.payments.find(x=>x.id===paymentId);
  if(!p) return;
  getTeacherName(true);
  receiptCtx={name:who, payment:p};
  renderReceipt();
  document.getElementById('receiptModal').style.display='flex';
}
function closeReceipt(){ document.getElementById('receiptModal').style.display='none'; receiptCtx=null; }
function receiptNo(p){ return p.no ? 'R-'+toBn(String(p.no).padStart(4,'0')) : 'R-'+toBn(String(p.id).split('_')[0].slice(-6)); }
function receiptData(){
  const {name,payment:p}=receiptCtx;
  return {
    name, p,
    teacher:getTeacherName(false),
    dateLabel:bnDateLabel(new Date(p.date+'T00:00:00')),
    forLabel:paymentMonthLabel(p.monthKey),
    method:p.method||'নগদ',
    no:receiptNo(p),
    totalDue:getStudentTotalDue(name),
  };
}
function renderReceipt(){
  const r=receiptData();
  const rows=[
    ['রসিদ নং', r.no],
    ['তারিখ', r.dateLabel],
    ['ছাত্র/ছাত্রী', escapeHtml(studentDisplayName(r.name))],
    ['কোন মাসের জন্য', escapeHtml(r.forLabel)],
    ['পরিশোধের মাধ্যম', escapeHtml(r.method)],
  ];
  if(r.p.note) rows.push(['নোট', escapeHtml(r.p.note)]);
  document.getElementById('receiptBody').innerHTML=`
    <div style="border:1.5px dashed var(--border, #bbb);border-radius:14px;padding:16px;background:var(--surface, #fff);">
      <div style="text-align:center;font-weight:700;font-size:16px;">পেমেন্ট রসিদ</div>
      <div style="text-align:center;font-size:12px;opacity:.7;margin-bottom:10px;">${r.teacher?escapeHtml(r.teacher):'—'}</div>
      ${rows.map(x=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(128,128,128,.18);font-size:14px;"><span style="opacity:.7">${x[0]}</span><span style="text-align:right">${x[1]}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 4px;">
        <span style="font-weight:600;">প্রাপ্ত টাকা</span>
        <span style="font-weight:800;font-size:22px;color:var(--paid, #16a34a);">${bnTaka(r.p.amount)}</span>
      </div>
      <div style="font-size:12px;opacity:.75;text-align:center;">${r.totalDue>0?'বর্তমান মোট বকেয়া: '+bnTaka(r.totalDue):'✅ কোনো বকেয়া নেই'}</div>
    </div>
    <button class="settings-btn" style="margin-top:10px;" onclick="receiptSendWA()"><span class="ic">${ICN.share}</span> অভিভাবকের WhatsApp-এ পাঠাও</button>
    <button class="settings-btn" style="margin-top:8px;" onclick="receiptSaveImage()">🖼️ ছবি হিসেবে সেভ/শেয়ার করো</button>
    <button class="settings-btn" style="margin-top:8px;" onclick="receiptCopy()">📋 টেক্সট কপি করো</button>
    <button type="button" class="pay-month-link" style="margin-top:8px;" onclick="changeTeacherName()">রসিদের নাম বদলাও</button>`;
}
function receiptText(){
  const r=receiptData();
  const pr=getStudentProfile(r.name);
  const greet=(pr.guardianName||'').trim()?`আসসালামু আলাইকুম, ${pr.guardianName.trim()}।\n`:'আসসালামু আলাইকুম।\n';
  return greet+
`${studentDisplayName(r.name)}-এর ${r.forLabel} মাসের টিউশন ফি ${bnTaka(r.p.amount)} পেয়েছি (${r.method}, ${r.dateLabel})। ধন্যবাদ।
রসিদ নং: ${r.no}
`+(r.totalDue>0?`বর্তমান মোট বকেয়া: ${bnTaka(r.totalDue)}\n`:'এখন কোনো বকেয়া নেই। ✅\n')+(r.teacher?`— ${r.teacher}`:'');
}
function receiptSendWA(){
  if(!receiptCtx) return;
  const pr=getStudentProfile(receiptCtx.name);
  if(!(pr.guardianPhone||'').trim()) showWarningToast('অভিভাবকের ফোন সেভ করা নেই — WhatsApp-এ নিজে কন্টাক্ট বেছে নিতে হবে');
  openWhatsApp(pr.guardianPhone, receiptText());
}
function receiptCopy(){ if(receiptCtx) copyTextSmart(receiptText(), 'রসিদ কপি হয়েছে'); }
function receiptSaveImage(){
  if(!receiptCtx) return;
  const r=receiptData();
  const W=720, H=r.p.note?640:580;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const x=c.getContext('2d');
  const font='"Hind Siliguri","Noto Sans Bengali","Kalpurush",system-ui,sans-serif';
  x.fillStyle='#ffffff'; x.fillRect(0,0,W,H);
  x.strokeStyle='#999'; x.setLineDash([8,6]); x.lineWidth=2; x.strokeRect(20,20,W-40,H-40); x.setLineDash([]);
  x.fillStyle='#111'; x.textAlign='center';
  x.font='bold 36px '+font; x.fillText('পেমেন্ট রসিদ', W/2, 80);
  x.font='22px '+font; x.fillStyle='#555'; x.fillText(r.teacher||'', W/2, 115);
  const rows=[['রসিদ নং',r.no],['তারিখ',r.dateLabel],['ছাত্র/ছাত্রী',studentDisplayName(r.name)],['কোন মাসের জন্য',r.forLabel],['পরিশোধের মাধ্যম',r.method]];
  if(r.p.note) rows.push(['নোট',r.p.note]);
  let y=170;
  rows.forEach(rw=>{
    x.textAlign='left'; x.fillStyle='#666'; x.font='24px '+font; x.fillText(rw[0],50,y);
    x.textAlign='right'; x.fillStyle='#111'; x.fillText(rw[1],W-50,y);
    x.strokeStyle='#e5e5e5'; x.lineWidth=1; x.beginPath(); x.moveTo(50,y+14); x.lineTo(W-50,y+14); x.stroke();
    y+=52;
  });
  y+=20;
  x.textAlign='left'; x.fillStyle='#111'; x.font='bold 26px '+font; x.fillText('প্রাপ্ত টাকা',50,y);
  x.textAlign='right'; x.fillStyle='#16a34a'; x.font='bold 44px '+font; x.fillText(bnTaka(r.p.amount),W-50,y+4);
  y+=60;
  x.textAlign='center'; x.fillStyle='#777'; x.font='22px '+font;
  x.fillText(r.totalDue>0?'বর্তমান মোট বকেয়া: '+bnTaka(r.totalDue):'কোনো বকেয়া নেই ✓', W/2, y);
  c.toBlob(async blob=>{
    if(!blob) return;
    const file=new File([blob], `receipt-${r.no}.png`, {type:'image/png'});
    try{
      if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:'পেমেন্ট রসিদ'}); return; }
    }catch(e){ if(e && e.name==='AbortError') return; }
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    showSuccessToast('রসিদের ছবি সেভ হয়েছে');
  },'image/png');
}
/* ---- Due reminder to the guardian: polite message with this month's due + any carried-over balance ---- */
function sendDueReminderWA(name){
  const pr=getStudentProfile(name);
  const mk=currentMonthKey();
  const pay=getStudentPayment(name);
  const monthDue=getStudentDueForMonth(name, mk);
  const opening=pay.openingBalance||0;
  const total=getStudentTotalDue(name);
  if(total<=0){ showSuccessToast('কোনো বকেয়া নেই'); return; }
  const teacher=getTeacherName(true);
  let t=((pr.guardianName||'').trim()?`আসসালামু আলাইকুম, ${pr.guardianName.trim()}।\n`:'আসসালামু আলাইকুম।\n');
  t+=`${studentDisplayName(name)}-এর ${monthKeyLabel(mk)} মাসের টিউশন ফি`+(opening>0?` (আগের বকেয়াসহ)`:'')+` মোট ${bnTaka(total)} বাকি আছে।`;
  if(opening>0 && monthDue>0) t+=`\n(আগের বকেয়া ${bnTaka(opening)} + এই মাসের ${bnTaka(monthDue)})`;
  t+=`\nসুবিধামতো সময়ে পরিশোধ করলে কৃতজ্ঞ থাকব। ধন্যবাদ।`+(teacher?`\n— ${teacher}`:'');
  if(!(pr.guardianPhone||'').trim()) showWarningToast('অভিভাবকের ফোন সেভ করা নেই — WhatsApp-এ নিজে কন্টাক্ট বেছে নিতে হবে');
  openWhatsApp(pr.guardianPhone, t);
}
function onSetMonthlyFee(val){
  if(!studentModalName) return;
  setMonthlyFee(studentModalName, val);
  renderStudentModal();
}
function togglePaymentMonthField(){
  const field=document.getElementById('pp_month_field');
  const link=document.getElementById('pp_month_link');
  if(!field) return;
  const show = field.style.display==='none';
  field.style.display = show ? '' : 'none';
  if(link) link.style.display = show ? 'none' : '';
}
function onSetOpeningBalance(val){
  if(!studentModalName) return;
  setOpeningBalance(studentModalName, val);
  renderStudentModal();
}
function onAddPayment(){
  if(!studentModalName) return;
  const amount=String(calcAmt('pp_amount'));
  const note=document.getElementById('pp_note').value;
  const monthSel=document.getElementById('pp_month').value;
  const method=document.getElementById('pp_method').value;
  if(!parseFloat(amount)) return;
  if(monthSel!=='__opening__' && typeof payLooksDuplicate==='function' && payLooksDuplicate(studentModalName, amount, monthSel, method) && !confirm('এইমাত্র একই টাকার, একই মাসের একটা পেমেন্ট যোগ হয়েছে। আবার যোগ করবে?')) return;
  lsSet('tr_lastPayMethod', method);
  if(monthSel==='__opening__') addPayment(studentModalName, amount, null, note, true, method);
  else addPayment(studentModalName, amount, monthSel, note, false, method);
  renderStudentModal();
  showSuccessToast('পেমেন্ট যোগ হয়েছে');
}
function onEditPayment(id){
  if(!studentModalName) return;
  const data=getPaymentsData(); const rec=data[studentModalName]; if(!rec) return;
  const p=(rec.payments||[]).find(x=>x.id===id); if(!p) return;
  const v=prompt('নতুন টাকার পরিমাণ (৳):', p.amount); if(v===null) return;
  const amt=parseFloat(v);
  if(!(amt>0)){ showWarningToast('সঠিক টাকার পরিমাণ লেখো।'); return; }
  const note=prompt('নোট (ঐচ্ছিক):', p.note||'');
  if(p.monthKey==='opening') rec.openingBalance=Math.max(0,(rec.openingBalance||0)+p.amount-amt);
  p.amount=amt; if(note!==null) p.note=note.trim();
  lsSet('tr_payments', data); renderStudentModal(); showSuccessToast('পেমেন্ট আপডেট হয়েছে');
}
function onDeletePayment(id){
  if(!studentModalName) return;
  deletePayment(studentModalName, id);
  renderStudentModal();
}

