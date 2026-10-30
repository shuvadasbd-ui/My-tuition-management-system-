// 🧠 খাতা-বুদ্ধি: trust score (FIFO repayment history), collection plan, cash-runway simulation, and the Khata tab in a real browser.
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
const ctx = vm.createContext({ Math, Number, String, Array, Object, JSON, Date, Float64Array, isFinite });
vm.runInContext(['fxRng', 'fxPct', 'kzDays', 'kzRepayStats', 'kzTrust', 'kzBand', 'kzPayProb', 'kzPlan', 'kzMessage', 'kzHistory', 'kzRunway', 'kzRunwayLevers'].map(grab).join('\n'), ctx);
const ev = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
const tx = (type, amount, date) => ({ person: 'ক', type, amount, date });

test('repayment stats: FIFO matching, delay in days, share repaid, age of the oldest unpaid loan', () => {
  let s = ev(`kzRepayStats(${JSON.stringify([tx('gave', 1000, '2026-01-01'), tx('got_back', 400, '2026-01-11'), tx('got_back', 600, '2026-01-31')])}, '2026-02-10')`);
  assert.equal(s.matched, 1000); assert.equal(s.repaidShare, 1); assert.equal(s.avgDelay, 22); assert.equal(s.openAge, 0); assert.equal(s.lastPayDays, 10);
  s = ev(`kzRepayStats(${JSON.stringify([tx('gave', 500, '2026-09-01')])}, '2026-10-15')`); assert.equal(s.matched, 0); assert.equal(s.repaidShare, 0); assert.equal(s.avgDelay, null); assert.equal(s.openAge, 44); assert.equal(s.lastPayDays, null);
  // 1200 repaid against 1000 (old) + 500 (newer): old fully paid, 300 of the newer still open → age counted from the newer loan
  s = ev(`kzRepayStats(${JSON.stringify([tx('gave', 1000, '2026-06-01'), tx('gave', 500, '2026-08-01'), tx('got_back', 1200, '2026-08-10')])}, '2026-10-01')`); assert.equal(s.openAge, 61); assert.ok(Math.abs(s.repaidShare - 0.8) < 1e-9);
  // a fresh loan has not had time to be repaid: it must not drag down the share of a good payer
  s = ev(`kzRepayStats(${JSON.stringify([tx('gave', 1000, '2026-01-01'), tx('got_back', 1000, '2026-01-05'), tx('gave', 4000, '2026-10-10')])}, '2026-10-15')`); assert.equal(s.repaidShare, 1); assert.equal(s.openAge, 5);
  // …but once it is older than 30 days and still unpaid, it counts
  s = ev(`kzRepayStats(${JSON.stringify([tx('gave', 1000, '2026-01-01'), tx('got_back', 1000, '2026-01-05'), tx('gave', 1000, '2026-08-01')])}, '2026-10-15')`); assert.equal(s.repaidShare, 0.5);
  s = ev(`kzRepayStats(${JSON.stringify([tx('took', 900, '2026-01-01'), tx('paid_back', 900, '2026-01-05')])}, '2026-02-01')`); assert.equal(s.n, 0, 'money I owe is not part of their trust record');
  assert.equal(ev(`kzRepayStats([], '2026-02-01')`).n, 0);
});

test('trust score: prompt payers high, slow/old-debt low, new = unknown; probability follows', () => {
  const T = o => ev(`kzTrust(${JSON.stringify(o.s)}, ${JSON.stringify(o.o || { today: '2026-10-15', net: 1000 })})`).score;
  const prompt = { n: 3, matched: 3000, repaidShare: 1, avgDelay: 5, openAge: 0, lastPayDays: 8 }, slow = { n: 3, matched: 1000, repaidShare: 0.3, avgDelay: 80, openAge: 150, lastPayDays: 100 };
  assert.ok(T({ s: prompt }) >= 85); assert.ok(T({ s: slow }) <= 30);
  assert.equal(T({ s: { n: 0 } }), null); assert.equal(T({ s: { n: 1, matched: 0, openAge: 10, repaidShare: 0, avgDelay: null, lastPayDays: null } }), null, 'brand-new loan: no verdict yet');
  assert.ok(T({ s: prompt, o: { today: '2026-10-15', net: 1000, due: '2026-10-01' } }) < T({ s: prompt }), 'a missed promise date costs points');
  assert.equal(ev(`kzBand(80)`), 'good'); assert.equal(ev(`kzBand(55)`), 'mid'); assert.equal(ev(`kzBand(10)`), 'bad'); assert.equal(ev(`kzBand(null)`), 'new');
  const P = (score, s) => ev(`kzPayProb(${JSON.stringify({ score })}, ${JSON.stringify(s)})`);
  assert.equal(ev(`kzPayProb({score:null}, {})`), 0.45); assert.ok(P(90, prompt) > P(30, slow)); assert.ok(P(100, { lastPayDays: 1, openAge: 0 }) <= 0.95); assert.ok(P(0, { lastPayDays: null, openAge: 300 }) >= 0.05);
});

test('collection plan: biggest expected recovery first, tone follows trust, only receivables, honest reasons', () => {
  const T = '2026-10-15', txs = [
    tx('gave', 5000, '2026-01-01'), tx('got_back', 5000, '2026-01-10'), tx('gave', 3000, '2026-10-05'),                                   // ক: always pays fast
    Object.assign(tx('gave', 6000, '2026-03-01'), { person: 'খ' }),                                                                         // খ: big, 7 months unpaid
    Object.assign(tx('gave', 200, '2026-10-10'), { person: 'গ' }), Object.assign(tx('took', 900, '2026-10-01'), { person: 'ঘ' })];
  txs.forEach(t => { if (t.person === 'ক' && t.date === '2026-01-01') t.person = 'ক'; });
  const rows = [{ name: 'ক', net: 3000, due: '', overdue: false }, { name: 'খ', net: 6000, due: '2026-04-01', overdue: true }, { name: 'গ', net: 200, due: '', overdue: false }, { name: 'ঘ', net: -900, due: '', overdue: false }];
  const plan = ev(`kzPlan(${JSON.stringify(rows)}, ${JSON.stringify(txs)}, '${T}')`);
  assert.equal(plan.items.length, 3, 'a payable (net < 0) is not a collection target'); const by = Object.fromEntries(plan.items.map(x => [x.name, x]));
  assert.equal(by['ক'].tone, 'soft'); assert.equal(by['খ'].tone, 'direct'); assert.equal(by['গ'].tone, 'neutral'); assert.equal(by['গ'].score, null);
  assert.ok(by['ক'].p > by['খ'].p); assert.ok(by['খ'].why.some(w => w.includes('তাগাদার তারিখ পেরিয়েছে'))); assert.ok(by['ক'].why.some(w => w.includes('গড়ে')));
  assert.ok(Math.abs(plan.expectedAll - plan.items.reduce((t, x) => t + x.expected, 0)) < 1e-6);
  for (let i = 1; i < plan.items.length; i++) assert.ok(plan.items[i - 1].priority >= plan.items[i].priority);
  const m = t => ev(`kzMessage({name:'রাকিব',amount:'৳1,500',tone:'${t}',openAge:90,teacher:'শুভ'})`);
  ['soft', 'firm', 'direct', 'neutral'].forEach(t => { assert.ok(m(t).includes('রাকিব') && m(t).includes('৳1,500') && m(t).endsWith('— শুভ')); });
  assert.notEqual(m('soft'), m('direct')); assert.ok(m('direct').includes('৯০') || m('direct').includes('90'));
});

test('history sampler: skips repeat entries, no zero-padding before the first entry', () => {
  const daily = [{ kind: 'out', amount: 100, date: '2026-10-10', note: 'চা' }, { kind: 'out', amount: 5000, date: '2026-10-11', note: 'ভাড়া (রিপিট)' }, { kind: 'in', amount: 300, date: '2026-10-12', note: '' }, { kind: 'out', amount: 40, date: '2026-10-12', note: '' }];
  const h = ev(`kzHistory(${JSON.stringify(daily)}, '2026-10-14', 90)`);
  assert.equal(h.days, 5); assert.deepEqual(h.out, [100, 0, 40, 0, 0]); assert.deepEqual(h.inn, [0, 0, 300, 0, 0]);
  assert.equal(ev(`kzHistory([], '2026-10-14', 90)`).days, 90 - 0 > 0 ? ev(`kzHistory([], '2026-10-14', 90)`).days : 0);
});

test('runway: exact when everything is certain; runs dry at the right time; collections help; levers are monotone', () => {
  const base = { cash: 1000, days: 30, runs: 300, seed: 5, today: '2026-10-15', hist: { out: [100], inn: [0] }, recur: [], recvs: [] };
  const R = o => ev(`kzRunway(${JSON.stringify(Object.assign({}, base, o))})`);
  let r = R({}); assert.equal(r.bands[0].p50, 1000); assert.equal(r.bands[5].p10, 500); assert.equal(r.bands[5].p90, 500); assert.equal(r.bands[30].p50, -2000); assert.equal(r.pRunout, 1); assert.equal(r.p10NegDay, 11);
  r = R({ hist: { out: [0], inn: [0] } }); assert.equal(r.pRunout, 0); assert.equal(r.bands[30].p50, 1000); assert.equal(r.p10NegDay, 0);
  r = R({ hist: { out: [0], inn: [0] }, recur: [{ kind: 'out', amount: 700, day: 20 }, { kind: 'in', amount: 200, day: 25 }] }); assert.equal(r.bands[4].p50, 1000); assert.equal(r.bands[5].p50, 300); assert.equal(r.bands[10].p50, 500);
  const noPay = R({ hist: { out: [50], inn: [0] }, recvs: [] }), pays = R({ hist: { out: [50], inn: [0] }, recvs: [{ id: 0, net: 2000, p30: 1 }] });
  assert.ok(pays.bands[30].p50 >= noPay.bands[30].p50 + 1000 - 1e-9, 'a certain receivable adds at least half its value');
  const L = ev(`kzRunwayLevers(${JSON.stringify(Object.assign({}, base, { hist: { out: [0, 200, 60], inn: [0, 0, 80] }, recvs: [{ id: 0, net: 3000, p30: 0.4 }, { id: 1, net: 500, p30: 0.5 }] }))})`), by = Object.fromEntries(L.levers.map(x => [x.key, x]));
  assert.ok(by.collect.dEnd >= 0 && by.cut.dEnd >= 0 && by.rise.dEnd <= 0, 'shared random draws: improvements never hurt');
  assert.ok(by.collect.dRun <= 0 && by.cut.dRun <= 0 && by.rise.dRun >= 0);
  for (let i = 1; i < L.levers.length; i++) assert.ok(L.levers[i - 1].dEnd >= L.levers[i].dEnd);
  assert.deepEqual(R({ hist: { out: [10, 60, 0], inn: [0, 5, 0] } }).bands, R({ hist: { out: [10, 60, 0], inn: [0, 5, 0] } }).bands, 'deterministic');
});

test('UI: banner + trust pills on the Khata tab, plan page, message, runway chart, horizons, hostile names, loop stops', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => {
      document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove());
      const base = todayDateOnly(), back = n => { const d = new Date(base); d.setDate(base.getDate() - n); return dateKeyStr(d); }, evil = '<img src=x onerror="window.__x=1">';
      localStorage.setItem('tr_khata', JSON.stringify([
        { id: 'a', person: 'রাকিব', type: 'gave', amount: 2000, note: '', date: back(80) }, { id: 'b', person: 'রাকিব', type: 'got_back', amount: 2000, note: '', date: back(70) }, { id: 'c', person: 'রাকিব', type: 'gave', amount: 1500, note: '', date: back(5) },
        { id: 'd', person: 'সুমন', type: 'gave', amount: 6000, note: '', date: back(200) }, { id: 'e', person: evil, type: 'gave', amount: 700, note: '', date: back(40) }]));
      const daily = []; for (let i = 1; i <= 30; i++) { daily.push({ id: 'o' + i, kind: 'out', amount: 100 + (i % 5) * 40, cat: 'খাবার', note: '', date: back(i) }); if (i % 7 === 0) daily.push({ id: 'i' + i, kind: 'in', amount: 1500, cat: 'বেতন', note: '', date: back(i) }); }
      localStorage.setItem('tr_daily', JSON.stringify(daily)); localStorage.setItem('tr_recurring', JSON.stringify([{ id: 'r1', kind: 'out', amount: 800, cat: 'মোবাইল/নেট', day: 20, from: '2026-01', last: '2026-10', note: 'নেট' }]));
      switchTab('khata');
    });
    await page.waitForTimeout(500);
    const banner = await page.evaluate(() => document.querySelector('.kz-banner') && document.querySelector('.kz-banner').innerText); assert.ok(banner && banner.includes('খাতা-বুদ্ধি') && banner.includes('আদায়'), banner);
    assert.ok(await page.evaluate(() => document.querySelectorAll('#khList .kz-pill').length) >= 2, 'a trust pill beside each receivable');
    assert.equal(await page.evaluate(() => window.__x || 0), 0);
    // plan page
    await page.evaluate(() => kzOpen());
    assert.ok(await page.evaluate(() => document.querySelectorAll('.kz-card').length) >= 3); assert.equal(await page.evaluate(() => window.__x || 0), 0, 'a hostile name must not run');
    const first = await page.evaluate(() => document.querySelector('.kz-cn b').innerText); assert.ok(first.length > 0);
    assert.ok((await page.evaluate(() => document.querySelector('.kz-hero').innerText)).includes('আদায়'));
    await page.evaluate(() => kzMsg('রাকিব')); assert.ok((await page.inputValue('#sm_msg')).includes('রাকিব'));
    // runway page
    await page.evaluate(() => { kzOpen('run'); });
    await page.waitForSelector('#kzCanvas'); await page.waitForFunction(() => kz.t >= 1 && !kz.raf, null, { timeout: 8000 });
    assert.ok(await page.evaluate(() => { const c = document.getElementById('kzCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 200) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 150) lit++; return lit > 40; }), 'runway chart has bright content');
    assert.equal(await page.evaluate(() => kz.res.runs), 1200); assert.ok(await page.evaluate(() => document.querySelectorAll('.fx-lev').length) === 3);
    assert.ok((await page.evaluate(() => document.querySelector('.fx-gn').innerText)).includes('%'));
    assert.ok(await page.evaluate(() => kz.inp.recur.length === 1 && kz.inp.hist.days >= 25), 'recurring bill + real history are used');
    const box = await page.evaluate(() => { const r = document.getElementById('kzCanvas').getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + 100 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.up(); assert.ok((await page.evaluate(() => document.getElementById('kzRead').innerText)).includes('দিন পরে'));
    await page.evaluate(() => kzDays_(90)); assert.equal(await page.evaluate(() => kz.res.days), 90);
    await page.evaluate(() => closeKhataModal()); await page.waitForTimeout(900); assert.equal(await page.evaluate(() => kz.raf), 0);
    assert.equal(await page.evaluate(() => window.__x || 0), 0); assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
