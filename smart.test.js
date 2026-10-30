// ✨ স্মার্ট সহকারী: syllabus forecast, churn risk, voice class report — the maths/parsing and the three screens in a real browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function grab(name) {
  const start = src.search(new RegExp('^function ' + name + '\\(', 'm'));
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
const ctx = vm.createContext({ Math, Number, String, Array, Object, Set, Date, JSON });
vm.runInContext(['sfForecast', 'sfPaceFrom', 'churnScore', 'churnMessage', 'vrParse', 'vrMessage'].map(grab).join('\n'), ctx);
const ev = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
const days = (from, n) => Array.from({ length: n }, (_, i) => { const d = new Date(from + 'T00:00:00'); d.setDate(d.getDate() + i + 1); return d.toISOString().slice(0, 10); });

test('syllabus: ok / risk / behind / overdue / unknown, extra classes and projected finish', () => {
  const S = days('2026-10-15', 40);                                       // 40 upcoming classes, one a day
  const f = (chapters, pace) => ev(`sfForecast(${JSON.stringify({ today: '2026-10-15', chapters, sessions: S, pace })})`);
  // 2 chapters left by day 10, pace 0.5/class -> 5 chapters of capacity: ok
  let r = f([{ pct: 0, targetDate: S[9] }, { pct: 0, targetDate: S[9] }], { pace: 0.5 }); assert.equal(r.status, 'ok');
  // 6 chapters left by day 10, capacity 5 -> 83% => risk, 2 extra classes needed
  r = f(Array.from({ length: 6 }, () => ({ pct: 0, targetDate: S[9] })), { pace: 0.5 }); assert.equal(r.status, 'risk'); assert.equal(r.items[0].extra, 2);
  // 10 chapters left by day 10 -> behind; projected finish is the 20th class
  r = f(Array.from({ length: 10 }, () => ({ pct: 0, targetDate: S[9] })), { pace: 0.5 }); assert.equal(r.status, 'behind'); assert.equal(r.items[0].extra, 10); assert.equal(r.items[0].projected, S[19]);
  assert.equal(f([{ pct: 40, targetDate: '2026-10-01' }], { pace: 1 }).status, 'overdue');
  assert.equal(f([{ pct: 0, targetDate: S[9] }], null).status, 'unknown');
  assert.equal(f([{ pct: 100, targetDate: S[9] }], { pace: 1 }).status, 'done');
  assert.equal(f([{ pct: 0 }], { pace: 1 }).hasTargets, false);
  // cumulative: a later deadline carries the earlier unfinished work too
  r = f([{ pct: 0, targetDate: S[4] }, { pct: 0, targetDate: S[9] }], { pace: 0.4 }); assert.equal(r.items.length, 2); assert.equal(r.items[1].need, 2);
});

test('syllabus pace: from the progress log when it spans a week, else lifetime, else unknown', () => {
  const p = (log, done, present) => ev(`sfPaceFrom(${JSON.stringify(log)}, (a,b)=>8, ${done}, ${present})`);
  assert.deepEqual(p([{ d: '2026-10-01', u: 1 }, { d: '2026-10-15', u: 3 }], 3, 20), { pace: 0.25, src: 'log' });
  assert.equal(p([{ d: '2026-10-10', u: 1 }, { d: '2026-10-12', u: 2 }], 2, 10).src, 'life');           // <7 days of history
  assert.equal(p([{ d: '2026-10-01', u: 2 }, { d: '2026-10-15', u: 2 }], 2, 10).src, 'life');           // flat log → don't call it zero progress
  assert.equal(p([], 0.05, 20), null); assert.equal(p([], 3, 3), null);
});

test('churn: score, bands, reasons, trend, no-data', () => {
  const base = { recentMarked: 0, recentAbsent: 0, recentLate: 0, prevMarked: 0, prevAbsent: 0, hwN: 0, hwNone: 0, hwPartial: 0, dueMonths: 0, curUnpaidLate: false, daysSinceSeen: null, makeups: 0 };
  const sc = o => ev(`churnScore(${JSON.stringify(Object.assign({}, base, o))})`);
  assert.equal(sc({}).band, 'nodata');
  const good = sc({ recentMarked: 10, recentAbsent: 0 }); assert.equal(good.band, 'low'); assert.equal(good.score, 0);
  const bad = sc({ recentMarked: 8, recentAbsent: 4, recentLate: 2, prevMarked: 8, prevAbsent: 1, hwN: 6, hwNone: 4, dueMonths: 2, daysSinceSeen: 25 });
  assert.equal(bad.band, 'high'); assert.ok(bad.score >= 80 && bad.score <= 100); assert.equal(bad.reasons[0].key, 'abs');
  assert.ok(bad.reasons.some(r => r.key === 'trend') && bad.reasons.some(r => r.key === 'pay') && bad.reasons.some(r => r.key === 'silent'));
  assert.equal(sc({ recentMarked: 10, recentAbsent: 2, dueMonths: 1 }).band, 'medium');
  assert.equal(sc({ recentMarked: 2, recentAbsent: 2 }).score, 0);                                       // too few classes to judge
  assert.match(ev(`churnMessage({name:'রাকিব',key:'pay',teacher:'শুভ',guardian:'',amount:'৳১,৫০০'})`), /রাকিব-এর মাসিক ফি ৳১,৫০০ বাকি/);
  assert.match(ev(`churnMessage({name:'রাকিব',key:'abs',teacher:'শুভ',guardian:'মিসেস করিম'})`), /^আসসালামু আলাইকুম, মিসেস করিম।/);
});

test('voice report: sentence sorting and message layout', () => {
  const p = ev(`vrParse('আজ ভগ্নাংশ যোগ করালাম। হোমওয়ার্ক পাতা ১২ করে আসবে। পরের ক্লাসে বিয়োগ ধরব। ভালো বুঝেছে। সূত্র দুটো লেখালাম')`);
  assert.equal(p.taught, 'আজ ভগ্নাংশ যোগ করালাম। সূত্র দুটো লেখালাম।'); assert.equal(p.homework, 'হোমওয়ার্ক পাতা ১২ করে আসবে।');
  assert.equal(p.next, 'পরের ক্লাসে বিয়োগ ধরব।'); assert.equal(p.remark, 'ভালো বুঝেছে।');
  assert.equal(ev(`vrParse('')`).taught, '');
  const m = ev(`vrMessage({name:'রাকিব',guardian:'',teacher:'শুভ',dateLabel:'১৫ অক্টোবর',taught:'যোগ।',homework:'',next:'বিয়োগ।',remark:''})`);
  assert.ok(m.includes('📖 আজ যা পড়ানো হয়েছে: যোগ।') && m.includes('🔜 পরের ক্লাসে: বিয়োগ।') && !m.includes('বাড়ির কাজ') && !m.includes('মন্তব্য') && m.endsWith('— শুভ'));
});

test('UI: hub on Reports, three screens work, note saved, no JS errors', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => {
      const dk = d => dateKeyStr(d), base = todayDateOnly(), nm = getAllKnownNames()[0], nm2 = getAllKnownNames()[1];
      const att = {}, back = n => { const d = new Date(base); d.setDate(base.getDate() - n); return dk(d); };
      for (let i = 1; i <= 8; i++) att[back(i * 3) + '|1|' + nm] = i % 2 ? 'absent' : 'present';       // half absent
      for (let i = 1; i <= 8; i++) att[back(i * 3) + '|1|' + nm2] = 'present';
      localStorage.setItem('tr_attendance', JSON.stringify(att));
      const t = new Date(base); t.setDate(base.getDate() + 20);
      localStorage.setItem('tr_progress', JSON.stringify({ [nm]: { 'গণিত': [{ chapter: 'ভগ্নাংশ', pct: 10, targetDate: dk(t) }, { chapter: 'বীজগণিত', pct: 0, targetDate: dk(t) }, { chapter: 'জ্যামিতি', pct: 0, targetDate: dk(t) }] } }));
      localStorage.setItem('tr_students', JSON.stringify({ [nm]: { guardianName: 'মিসেস করিম', guardianPhone: '01711111111' } }));
      localStorage.setItem('tr_payments', JSON.stringify({ [nm]: { monthlyFee: 1500, openingBalance: 0, payments: [] } }));
      window.__nm = nm; switchTab('reports');
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.sm-tile').length), 11);
    // 1) forecast
    await page.evaluate(() => sfOpen());
    assert.ok(await page.evaluate(() => !!document.querySelector('#sfBox .sm-card')));
    assert.ok((await page.evaluate(() => document.getElementById('sfBox').innerText)).includes(await page.evaluate(() => window.__nm)));
    // 2) churn: the half-absent student is flagged high and a guardian message opens with the phone
    await page.evaluate(() => churnOpen());
    const top = await page.evaluate(() => document.querySelector('#chBox .sm-card').className);
    assert.ok(top.includes('high') || top.includes('medium'), top);
    await page.evaluate(() => churnMsgOpen(window.__nm));
    assert.ok((await page.inputValue('#sm_msg')).startsWith('আসসালামু আলাইকুম, মিসেস করিম'));
    // 3) voice report → message → saved into class notes
    await page.evaluate(() => vrOpen());
    await page.selectOption('#vr_name', await page.evaluate(() => window.__nm));
    await page.fill('#vr_text', 'আজ যোগ করালাম। হোমওয়ার্ক পাতা ১২ করে আসবে। পরের ক্লাসে বিয়োগ ধরব।');
    await page.evaluate(() => vrMake());
    const msg = await page.inputValue('#sm_msg');
    assert.ok(msg.includes('📝 বাড়ির কাজ: হোমওয়ার্ক পাতা ১২ করে আসবে।') && msg.includes('মিসেস করিম'));
    const inToday = await page.evaluate(() => !!SCHEDULE.find(s => getCellText(s, DAYS[(todayDateOnly().getDay() + 1) % 7]).split(',').map(x => x.trim()).includes(window.__nm)));
    await page.evaluate(() => vrSaveNote());
    if (inToday) assert.ok(await page.evaluate(() => Object.values(getNotes()).some(n => (n.entries || []).some(e => e.student === window.__nm && e.homework.includes('১২')))));
    // progress log snapshots when a chapter changes
    await page.evaluate(() => updateChapterPct(window.__nm, 'গণিত', 0, 60));
    assert.equal(await page.evaluate(() => lsGet('tr_progLog', {})[window.__nm].slice(-1)[0].u), 0.6);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('audit regressions: hostile student names never run script; hidden finance hides money reasons; big history stays fast', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove()));
    const r = await page.evaluate(async () => {
      const evil = '<img src=x onerror="window.__x=1">\'"&', orig = getCellText; getCellText = (s, d) => (s.num === SCHEDULE[0].num && d === DAYS[0]) ? evil : orig(s, d);
      const T = dateKeyStr(todayDateOnly());
      localStorage.setItem('tr_khata', JSON.stringify([{ id: '1', person: evil, type: 'gave', amount: 100, note: evil, date: T }]));
      localStorage.setItem('tr_khataNotes', JSON.stringify([{ id: 'n', text: evil, done: false, due: '', at: 1 }]));
      localStorage.setItem('tr_daily', JSON.stringify([{ id: 'd', kind: 'out', amount: 5, cat: evil, note: evil, date: T }]));
      localStorage.setItem('tr_progress', JSON.stringify({ [evil]: { [evil]: [{ chapter: evil, pct: 10, targetDate: dateKeyStr(new Date(Date.now() + 864e5 * 20)) }] } }));
      financeUnlocked = true; const bad = [];
      const pages = { person: () => openKhataPerson(evil), report: () => khataDayReport(), notes: () => khNotesPage(), churn: () => churnOpen(), sf: () => sfOpen(), vr: () => vrOpen(), msg: () => smMsgPage(evil, 'x'), thk: () => { thkSt.name = evil; thkOpen(); }, dc: () => { dcSt.name = evil; dcOpen(); }, radar: () => radarOpen(), galaxy: () => { glxOpen(); setTimeout(() => glxSelect(glx.nodes.find(x => x.name === evil) || glx.nodes[0]), 150); } };
      for (const k of Object.keys(pages)) { window.__x = 0; pages[k](); await new Promise(z => setTimeout(z, 260)); if (window.__x) bad.push(k); closeKhataModal(); await new Promise(z => setTimeout(z, 420)); }
      return bad;
    });
    assert.deepEqual(r, [], 'pages that executed script from a student name: ' + r.join(','));
    const hid = await page.evaluate(async () => {
      const names = getAllKnownNames(), base = todayDateOnly(), att = {};
      names.forEach(n => { for (let i = 1; i <= 8; i++) { const d = new Date(base); d.setDate(base.getDate() - i * 3); att[dateKeyStr(d) + '|1|' + n] = 'present'; } });
      localStorage.setItem('tr_attendance', JSON.stringify(att)); localStorage.setItem('tr_payments', JSON.stringify(Object.fromEntries(names.map(n => [n, { monthlyFee: 1500, openingBalance: 0, payments: [] }]))));
      const o = {}; financeUnlocked = true; churnOpen(); o.shown = /ফি বাকি|মাসের ফি/.test(document.getElementById('khataModalBody').innerText); closeKhataModal(); await new Promise(z => setTimeout(z, 500));
      financeUnlocked = false; churnOpen(); o.leak = /ফি বাকি|মাসের ফি|ফি এখনো/.test(document.getElementById('khataModalBody').innerText); closeKhataModal(); await new Promise(z => setTimeout(z, 500));
      dcOpen(); o.dcLeak = /ফি বাকি/.test(document.getElementById('khataModalBody').innerText); closeKhataModal(); return o;
    });
    assert.equal(hid.shown, true, 'unlocked: the fee reason is shown'); assert.equal(hid.leak, false, 'hidden: no fee reason on the risk page'); assert.equal(hid.dcLeak, false, 'hidden: no fee reason in the decision aid');
    const perf = await page.evaluate(() => {
      const names = getAllKnownNames(), att = {}, base = todayDateOnly();
      for (let d = 0; d < 400; d++) { const dt = new Date(base); dt.setDate(base.getDate() - d); const k = dateKeyStr(dt); names.forEach((n, i) => { att[k + '|1|' + n] = (i + d) % 7 == 0 ? 'absent' : 'present'; }); }
      localStorage.setItem('tr_attendance', JSON.stringify(att)); financeUnlocked = true;
      const t = f => { const s = performance.now(); f(); return performance.now() - s; };
      return { n: Object.keys(att).length, hub: t(() => smartHubHtml()), churn: t(() => churnAll()) };
    });
    assert.ok(perf.n >= 6000 && perf.hub < 400 && perf.churn < 150, 'hub ' + Math.round(perf.hub) + 'ms, churnAll ' + Math.round(perf.churn) + 'ms for ' + perf.n + ' records');
  } finally { await browser.close(); srv.close(); }
});
