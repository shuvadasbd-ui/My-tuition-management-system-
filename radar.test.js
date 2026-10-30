// 💎 আয়ের রাডার: the maths (shared group time, travel, goal) and the screen in a real browser.
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
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
const ctx = vm.createContext({ Math, Number, String, Array, Object, Set, isFinite });
vm.runInContext(grab('radarCompute'), ctx);
const run = (slots, cells, fees, o) => JSON.parse(vm.runInContext(`JSON.stringify(radarCompute(${JSON.stringify(slots)}, (s,d)=>(${JSON.stringify(cells)}[s.num+'|'+d]||''), n=>(${JSON.stringify(fees)}[n]||0), ${JSON.stringify(o)}))`, ctx));
const slots = [{ num: '1', start: 0, end: 60 }, { num: '2', start: 100, end: 160 }, { num: '3', start: 200, end: 260 }];

test('radar: solo vs group time, travel, tags and free slots', () => {
  // one 60-min slot per day-slot. Rina alone (fee 2000, 1 session/wk); Tom+Ann share a slot (fee 1000 each)
  const cells = { '1|Sat': 'রিনা', '2|Sat': 'টম, অ্যান' };
  const r = run(slots, cells, { 'রিনা': 2000, 'টম': 1200, 'অ্যান': 1200 }, { travel: 0, days: ['Sat', 'Sun'] });
  assert.equal(r.income, 4400);
  assert.ok(Math.abs(r.busyHrs - 2 * 4.33) < 1e-9);                         // 2 busy slots x 1h x 4.33 weeks
  assert.ok(Math.abs(r.avg - 4400 / (2 * 4.33)) < 1e-6);
  const by = Object.fromEntries(r.rows.map(x => [x.name, x]));
  assert.ok(Math.abs(by['রিনা'].hours - 4.33) < 1e-9);                      // alone: whole hour
  assert.ok(Math.abs(by['টম'].hours - 4.33 / 2) < 1e-9);                    // group: half of the teacher's hour each
  assert.ok(by['টম'].rate > by['রিনা'].rate);                               // group pays more per teacher-hour
  assert.equal(r.free.length, 2);                                            // slot 3 is never taught on any day → not sellable free time; slots 1–2 on Sun are free
  assert.ok(['টম', 'অ্যান'].includes(r.rows[0].name));                       // sorted best rate first (the group pair)
});

test('radar: travel lowers the rate; low-rate students get a raise suggestion; no-fee students are flagged', () => {
  const cells = { '1|Sat': 'ক', '2|Sat': 'খ', '3|Sat': 'গ' };
  const fees = { 'ক': 3000, 'খ': 600 };
  const a = run(slots, cells, fees, { travel: 0, days: ['Sat'] }), b = run(slots, cells, fees, { travel: 30, days: ['Sat'] });
  assert.ok(b.avg < a.avg);
  const kha = a.rows.find(x => x.name === 'খ'); assert.equal(kha.tag, 'low'); assert.ok(kha.raiseTo > kha.fee); assert.equal(kha.raiseTo % 50, 0);
  assert.equal(a.rows.find(x => x.name === 'গ').tag, 'nofee'); assert.deepEqual(a.noFee, ['গ']);
  assert.equal(a.income, 3600);                                              // unpaid student adds time but no income
});

test('radar: goal maths — slots needed, feasibility, percent raise, already met', () => {
  const cells = { '1|Sat': 'ক' };
  const base = run(slots, cells, { 'ক': 2000 }, { travel: 0, days: ['Sat', 'Sun'], goal: 6000 });
  assert.equal(base.goal.gap, 4000); assert.ok(base.perSlot > 0);
  assert.equal(base.goal.needSlots, Math.ceil(4000 / base.perSlot));
  assert.equal(base.goal.raisePct, 200);
  assert.equal(base.goal.feasible, base.goal.needSlots <= base.free.length);
  assert.equal(run(slots, cells, { 'ক': 2000 }, { goal: 1500 }).goal.met, true);
  assert.equal(run(slots, cells, { 'ক': 2000 }, {}).goal, null);
  const empty = run(slots, {}, {}, {}); assert.equal(empty.avg, 0); assert.equal(empty.rows.length, 0);
});

test('UI: radar card on Reports, locked while finance is hidden, opens with real numbers and no JS errors', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => { const names = getAllKnownNames(); const p = {}; names.slice(0, 6).forEach((n, i) => { p[n] = { monthlyFee: 1500 + i * 500, openingBalance: 0, payments: [] }; }); localStorage.setItem('tr_payments', JSON.stringify(p)); switchTab('reports'); });
    await page.waitForTimeout(500);
    assert.ok((await page.evaluate(() => document.querySelector('.rd-card').innerText)).includes('লুকানো'), 'locked while amounts are hidden');
    await page.evaluate(() => { financeUnlocked = true; renderInsights(); });
    const card = await page.evaluate(() => document.querySelector('.rd-card').innerText);
    assert.ok(card.includes('ঘণ্টা') && card.includes('৳'), card);
    await page.evaluate(() => radarOpen());
    assert.ok(await page.evaluate(() => !!document.querySelector('#rdBox .rd-hero')));
    assert.ok((await page.evaluate(() => document.querySelectorAll('#rdBox .rd-row').length)) >= 6);
    const before = await page.evaluate(() => document.querySelector('.rd-hero b').innerText);
    await page.evaluate(() => radarTravelStep(30));
    assert.notEqual(await page.evaluate(() => document.querySelector('.rd-hero b').innerText), before, 'more travel time changes the rate');
    await page.evaluate(() => radarSetGoal('৫০০০০'));
    assert.ok((await page.evaluate(() => document.querySelector('.rd-goal-r').innerText)).includes('আর লাগবে'));
    assert.equal(await page.evaluate(() => document.querySelectorAll('.rd-mc').length), await page.evaluate(() => SCHEDULE.length * 7));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
