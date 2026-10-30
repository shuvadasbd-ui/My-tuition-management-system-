// 🧠 সিদ্ধান্ত-সহকারী (why / what-if) and 💭 চিন্তা-শক্তি (6-level questions + response log): the logic and both screens in a real browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function grabFn(name) {
  const start = src.search(new RegExp('^function ' + name + '\\(', 'm'));
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
function grabConst(name) {
  const start = src.search(new RegExp('^const ' + name + '=', 'm')), eol = src.indexOf('\n', start);
  if (src.slice(start, eol).trimEnd().endsWith(';')) return src.slice(start, eol);
  const m = /\n[\]}];/.exec(src.slice(start)); return src.slice(start, start + m.index + 3);
}
const ctx = vm.createContext({ Math, Number, String, Array, Object, Set, JSON });
vm.runInContext(['radarCompute', 'dcWhy', 'dcLeaveProb', 'dcSim', 'thkQuestions', 'thkNextLevel'].map(grabFn).concat(['THK_T', 'THK_SUBJ'].map(grabConst)).join('\n'), ctx);
const ev = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
const base = { recentMarked: 0, recentAbsent: 0, cohortAbsRate: null, hwN: 0, hwNone: 0, hwPartial: 0, sessions: null, cohortSessions: null, syllabusBad: 0, perClass: '', dueMonths: 0, daysSinceSeen: null };
const why = o => ev(`dcWhy(${JSON.stringify(Object.assign({}, base, o))})`);

test('why: ranks causes, shows the counter-argument, compares with the group, admits low confidence', () => {
  let r = why({ recentMarked: 8, recentAbsent: 5, cohortAbsRate: 0.05, hwN: 6, hwNone: 1, dueMonths: 1 });
  assert.equal(r.causes[0].key, 'abs'); assert.ok(r.causes[0].evidence.includes('দলের মাঝামাঝি')); assert.equal(r.causes[0].counter, ''); assert.equal(r.confidence, 'high');
  // everyone in the group is absent a lot → not a one-student problem, and the cause is weighed down
  const groupWide = why({ recentMarked: 8, recentAbsent: 5, cohortAbsRate: 0.55 });
  assert.ok(groupWide.causes[0].counter.includes('দলের বাকিদেরও')); assert.ok(groupWide.causes[0].score < r.causes[0].score);
  // few data points → low confidence + small-sample caveat
  r = why({ hwN: 3, hwNone: 3 }); assert.equal(r.confidence, 'low'); assert.ok(r.causes[0].counter.includes('নমুনা'));
  assert.deepEqual(why({}).causes, []);
  // fewer sessions than the group only matters when the syllabus is actually behind
  const load = (bad) => why({ sessions: 2, cohortSessions: 4, syllabusBad: bad, recentMarked: 6 }).causes.find(c => c.key === 'load');
  assert.ok(load(2).score > load(0).score); assert.ok(load(0).counter.includes('পিছিয়ে নেই'));
  r = why({ syllabusBad: 2, perClass: '১.২', dueMonths: 2, daysSinceSeen: 20, recentMarked: 5, recentAbsent: 2 }); assert.ok(r.causes.length <= 3 && r.causes.every(c => c.check));
});

test('what-if: raise fee, drop, add — income/hours/hourly-rate deltas and the risk maths', () => {
  const slots = [{ num: '1', start: 0, end: 60 }, { num: '2', start: 100, end: 160 }, { num: '3', start: 200, end: 260 }];
  const cells = { '1|Sat': 'রিনা', '2|Sat': 'টম, অ্যান' }, fees = { 'রিনা': 2000, 'টম': 1000, 'অ্যান': 1000 };
  const sim = act => ev(`dcSim(${JSON.stringify(slots)}, (s,d)=>(${JSON.stringify(cells)}[s.num+'|'+d]||''), n=>(${JSON.stringify(fees)}[n]||0), {travel:0,days:['Sat','Sun']}, ${JSON.stringify(act)}, 40)`);
  const up = sim({ type: 'raise', name: 'রিনা', by: 500 });
  assert.equal(up.dIncome, 500); assert.equal(up.dHours, 0); assert.ok(up.dAvg > 0); assert.equal(up.newFee, 2500);
  assert.ok(up.p > 0 && up.p < 0.9); assert.ok(Math.abs(up.breakEven - 500 / 2500) < 1e-9);
  assert.ok(Math.abs(up.expected - ((1 - up.p) * 2500 - 2000)) < 1e-9);
  const dropped = sim({ type: 'drop', name: 'রিনা' });
  assert.equal(dropped.dIncome, -2000); assert.ok(dropped.dHours < 0); assert.ok(dropped.freedHrs > 0); assert.equal(dropped.fee0, 2000);
  const add = sim({ type: 'add', fee: 1500, slots: 2 });
  assert.equal(add.dIncome, 1500); assert.equal(add.used, 2); assert.ok(add.dHours > 0);
  assert.equal(ev(`dcLeaveProb(0, 0)`), 0); assert.equal(ev(`dcLeaveProb(100, 500)`), 0.9);
  assert.ok(ev(`dcLeaveProb(60, 30)`) > ev(`dcLeaveProb(10, 30)`), 'already-risky student leaves more easily');
});

test('thinking ladder: 6 levels of questions, subject flavour, deterministic rotation, level moves with responses', () => {
  for (let lv = 1; lv <= 6; lv++) { const q = ev(`thkQuestions('ভগ্নাংশ','গণিত',${lv},0)`); assert.equal(q.length, 3); assert.ok(q.every(x => x.includes('ভগ্নাংশ') || lv >= 4 || x.length > 10)); }
  assert.ok(ev(`thkQuestions('ভগ্নাংশ','',2,0)`)[0].includes('ভগ্নাংশ'), 'topic is filled into the template');
  assert.ok(ev(`thkQuestions('','',1,0)`)[0].includes('আজকের পড়া'));
  assert.deepEqual(ev(`thkQuestions('ক','গণিত',4,3)`), ev(`thkQuestions('ক','গণিত',4,3)`));
  assert.notDeepEqual(ev(`thkQuestions('ক','গণিত',4,0)`), ev(`thkQuestions('ক','গণিত',4,1)`));
  assert.ok(ev(`thkQuestions('ক','বিজ্ঞান',4,0).concat(thkQuestions('ক','বিজ্ঞান',4,1),thkQuestions('ক','বিজ্ঞান',4,2),thkQuestions('ক','বিজ্ঞান',4,3))`).some(x => x.includes('ঘটত না') || x.includes('কী হতো')));
  const nl = (log, p) => ev(`thkNextLevel(${JSON.stringify(log)}, ${p})`);
  assert.equal(nl([], 10).level, 2); assert.equal(nl([], 45).level, 3); assert.equal(nl([], 70).level, 4); assert.equal(nl([], 95).level, 5);
  assert.equal(nl([{ level: 3, rating: 3 }, { level: 3, rating: 3 }], 50).level, 4);
  assert.equal(nl([{ level: 3, rating: 1 }, { level: 3, rating: 1 }], 50).level, 2);
  assert.equal(nl([{ level: 3, rating: 3 }, { level: 3, rating: 2 }], 50).level, 3);
  assert.equal(nl([{ level: 6, rating: 3 }, { level: 6, rating: 3 }], 50).level, 6, 'capped at 6');
  assert.equal(nl([{ level: 1, rating: 1 }, { level: 1, rating: 1 }], 50).level, 1, 'floored at 1');
  assert.equal(nl([{ level: 3, rating: 3 }, { level: 4, rating: 3 }], 50).level, 4, 'two good ratings must be at the same level');
});

test('UI: both screens open, what-if answers, ratings are logged and move the level, parent message', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => {
      document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove());
      const base = todayDateOnly(), names = getAllKnownNames(), nm = names[0], back = n => { const d = new Date(base); d.setDate(base.getDate() - n); return dateKeyStr(d); }, att = {}, pay = {};
      names.forEach((n, k) => { for (let i = 1; i <= 8; i++) att[back(i * 3) + '|1|' + n] = (n === nm && i % 2) ? 'absent' : 'present'; pay[n] = { monthlyFee: 1000 + k * 100, openingBalance: 0, payments: [] }; });
      localStorage.setItem('tr_attendance', JSON.stringify(att)); localStorage.setItem('tr_payments', JSON.stringify(pay));
      localStorage.setItem('tr_progress', JSON.stringify({ [nm]: { 'গণিত': [{ chapter: 'ভগ্নাংশ', pct: 20, targetDate: '' }] } }));
      localStorage.setItem('tr_students', JSON.stringify({ [nm]: { guardianName: 'মিসেস করিম', guardianPhone: '01711111111' } }));
      window.__nm = nm; financeUnlocked = true; switchTab('reports');
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.sm-tile').length), 11);
    // 🧠 why + what-if
    await page.evaluate(() => dcOpen());
    assert.ok(await page.evaluate(() => !!document.querySelector('#dcBox .dc-cause')), 'at least one cause shown for the absent student');
    assert.ok((await page.evaluate(() => document.getElementById('dcBox').innerText)).includes('অ্যাপ যা জানে না'));
    await page.evaluate(() => dcAct('r500'));
    assert.ok((await page.evaluate(() => document.querySelector('.dc-res').innerText)).includes('ঝুঁকির হিসাব'));
    await page.evaluate(() => dcAct('drop')); assert.ok((await page.evaluate(() => document.querySelector('.dc-res').innerText)).includes('সাবধান'));
    await page.evaluate(() => dcAct('add1')); assert.ok((await page.evaluate(() => document.querySelector('.dc-res').innerText)).includes('বিপরীত যুক্তি'));
    // 💭 thinking skills
    await page.evaluate(() => { thkSt.name = window.__nm; thkOpen(); });
    assert.equal(await page.inputValue('#thk_topic'), 'ভগ্নাংশ');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.thk-q').length), 3);
    assert.equal(await page.evaluate(() => document.querySelector('.thk-step.on b').innerText), '২', 'progress 20% starts at level 2');
    await page.evaluate(() => thkRate(3)); await page.evaluate(() => thkRate(3));
    assert.equal(await page.evaluate(() => thkLog()[window.__nm].length), 2);
    assert.equal(await page.evaluate(() => document.querySelector('.thk-step.on b').innerText), '৩', 'two great answers move the student up one step');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.thk-dot').length), 2);
    await page.evaluate(() => thkParentMsg());
    const msg = await page.inputValue('#sm_msg'); assert.ok(msg.includes('ভাবনার প্রশ্ন') && msg.includes('মিসেস করিম'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
