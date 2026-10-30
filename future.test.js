// 🔮 ভবিষ্যৎ-যন্ত্র: the Monte-Carlo maths (determinism, certainty limits, monotonic levers, percentiles) and the screen in a real browser.
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
const ctx = vm.createContext({ Math, Number, String, Array, Object, JSON, Float64Array, isFinite });
vm.runInContext(['fxRng', 'fxInvPoisson', 'fxPct', 'fxHazard', 'fxSim', 'fxTopRisk', 'fxLevers'].map(grab).join('\n'), ctx);
const ev = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
const mkStudents = (n, fee, hz, rel) => Array.from({ length: n }, (_, i) => ({ name: 'ছাত্র' + i, fee, hazard: hz, reliability: rel }));
const sim = o => ev(`fxSim(${JSON.stringify(Object.assign({ months: 6, runs: 600, seed: 42, keep: 5, newRate: 0, newFee: 0, freeSlots: 0 }, o))})`);

test('simulation basics: deterministic, ordered percentiles, certainty limits', () => {
  const o = { students: mkStudents(5, 1000, 0.1, 0.9) };
  const a = sim(o), b = sim(o); assert.deepEqual(a.bands, b.bands);
  a.bands.forEach(x => { assert.ok(x.p10 <= x.p25 && x.p25 <= x.p50 && x.p50 <= x.p75 && x.p75 <= x.p90); });
  assert.equal(a.bands[0].p50, 5000); assert.equal(a.paths.length, 5); assert.equal(a.paths[0].length, 7);
  // nobody leaves, everybody pays on time → income is exactly constant, goal certain
  const sure = sim({ students: mkStudents(4, 1500, 0, 1), goal: 6000 });
  sure.bands.forEach(x => { assert.equal(x.p10, 6000); assert.equal(x.p90, 6000); }); assert.equal(sure.pGoal, 1); assert.equal(sure.endStudents, 4);
  // everybody leaves at once → nothing left after month 1
  const gone = sim({ students: mkStudents(4, 1500, 1, 1), goal: 1 }); assert.equal(gone.bands[3].p90, 0); assert.equal(gone.pGoal, 0); assert.equal(gone.endStudents, 0);
  // a late payment slips into the next month instead of vanishing (month 1 may be short, but never more than the fee roll)
  const late = sim({ students: mkStudents(3, 1000, 0, 0.5), months: 3 }); assert.ok(late.bands[1].p10 < 3000 && late.bands[2].p90 <= 6000);
  // riskier students → lower median later
  assert.ok(sim({ students: mkStudents(8, 1000, 0.25, 1) }).bands[6].p50 < sim({ students: mkStudents(8, 1000, 0.02, 1) }).bands[6].p50);
});

test('new students: more arrivals raise income, capped by free slots; none without free slots', () => {
  const base = { students: mkStudents(3, 1000, 0, 1), newFee: 1000, months: 6 };
  const none = sim(Object.assign({}, base, { newRate: 2, freeSlots: 0 })), some = sim(Object.assign({}, base, { newRate: 0.5, freeSlots: 5 })), many = sim(Object.assign({}, base, { newRate: 2, freeSlots: 5 }));
  assert.equal(none.bands[6].p50, 3000); assert.ok(some.bands[6].p50 > 3000); assert.ok(many.bands[6].p50 >= some.bands[6].p50);
  assert.ok(many.bands[6].p90 <= 3000 + 5000, 'never more than the free slots allow'); assert.ok(many.endStudents <= 3 + 5);
  assert.equal(ev(`fxInvPoisson(0.3, 0)`), 0); assert.ok(ev(`fxInvPoisson(0.999, 0.5)`) >= 2);
});

test('levers: common random numbers make "do X" never worse than baseline for pure improvements; ranking + goal deltas', () => {
  const students = [{ name: 'ক', fee: 3000, hazard: 0.2, reliability: 0.8 }, { name: 'খ', fee: 1000, hazard: 0.02, reliability: 0.95 }, { name: 'গ', fee: 2000, hazard: 0.1, reliability: 0.95 }];
  const L = ev(`fxLevers(${JSON.stringify({ students, months: 6, runs: 800, seed: 7, newRate: 0.4, newFee: 2000, freeSlots: 4, goal: 6000, base0: 6000 })})`), by = Object.fromEntries(L.map(x => [x.key, x]));
  assert.ok(by.retainRisky.dAvg >= 0 && by.retainTop.dAvg >= 0 && by.collect.dAvg >= 0 && by.newx2.dAvg >= 0, 'pure improvements never hurt under shared random draws');
  assert.ok(by.retainTop.label.includes('ক'), 'the biggest expected loss (3000 fee, 20% hazard) is the one to retain');
  assert.ok(by.retainRisky.dAvg >= by.retainTop.dAvg - 1e-9, 'retaining everyone risky ≥ retaining only the top one');
  for (let i = 1; i < L.length; i++) assert.ok(L[i - 1].dAvg >= L[i].dAvg, 'sorted best first');
  assert.ok(by.collect.dAvg > 0, 'on-time collection must show a real gain (late fees at the end of the horizon are lost otherwise)');
  assert.ok(L.every(x => x.dGoal != null)); assert.ok(by.retainRisky.dGoal >= 0);
  const noGoal = ev(`fxLevers(${JSON.stringify({ students, months: 3, runs: 300, seed: 1, newRate: 0.3, newFee: 2000, freeSlots: 2, goal: 0 })})`); assert.ok(noGoal.every(x => x.dGoal == null));
});

test('top risk, hazard mapping, percentile helper', () => {
  const t = ev(`fxTopRisk(${JSON.stringify([{ name: 'ক', fee: 1000, hazard: 0.1 }, { name: 'খ', fee: 5000, hazard: 0.1 }, { name: 'গ', fee: 1000, hazard: 0.3 }])}, 6, 2)`);
  assert.deepEqual(t.map(x => x.name), ['খ', 'গ']); assert.ok(Math.abs(t[0].pLeave - (1 - Math.pow(0.9, 6))) < 1e-12); assert.ok(t[0].expectedLoss > 0);
  assert.equal(ev(`fxHazard(0)`), 0.02); assert.equal(ev(`fxHazard(100)`), 0.27); assert.equal(ev(`fxHazard(null)`), 0.04); assert.equal(ev(`fxHazard(500)`), 0.27);
  assert.equal(ev(`fxPct([1,2,3,4,5], 0.5)`), 3); assert.equal(ev(`fxPct([10,20], 0.5)`), 15); assert.equal(ev(`fxPct([], 0.5)`), 0);
  const r = ev(`(function(){ const f=fxRng(5), a=[]; for(let i=0;i<1000;i++) a.push(f()); return {min:Math.min(...a), max:Math.max(...a), mean:a.reduce((x,y)=>x+y,0)/1000}; })()`); assert.ok(r.min >= 0 && r.max < 1 && Math.abs(r.mean - 0.5) < 0.05);
});

test('UI: opens locked while finance is hidden, draws the fan chart, scrubbing reads values, controls re-run, loop stops after the animation and on close', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => { document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove()); const names = getAllKnownNames(), p = {}; names.forEach((n, i) => { p[n] = { monthlyFee: 1000 + (i % 5) * 400, openingBalance: 0, payments: [] }; }); localStorage.setItem('tr_payments', JSON.stringify(p)); lsSet('tr_radarGoal', 40000); });
    await page.evaluate(() => { financeUnlocked = false; fxOpen(); });
    assert.equal(await page.evaluate(() => !!document.getElementById('fxCanvas')), false, 'locked while amounts are hidden');
    await page.evaluate(() => { financeUnlocked = true; fxOpen(); });
    await page.waitForSelector('#fxCanvas'); await page.waitForFunction(() => fx.t >= 1 && !fx.raf, null, { timeout: 8000 });
    assert.ok(await page.evaluate(() => { const c = document.getElementById('fxCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 200) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 150) lit++; return lit > 60; }), 'fan chart has bright content');
    assert.ok(await page.evaluate(() => fx.ms < 1500), 'simulation time ' + await page.evaluate(() => fx.ms) + 'ms');
    assert.equal(await page.evaluate(() => fx.res.runs), 1500); assert.ok(await page.evaluate(() => document.querySelectorAll('.fx-lev').length >= 4));
    assert.ok((await page.evaluate(() => document.querySelector('.fx-gn').innerText)).includes('%'));
    // scrub
    const box = await page.evaluate(() => { const r = document.getElementById('fxCanvas').getBoundingClientRect(); return { x: r.left + r.width * 0.7, y: r.top + 120 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.up();
    assert.ok((await page.evaluate(() => document.getElementById('fxRead').innerText)).includes('মাস পরে'));
    // horizon + new-student rate re-run the engine
    await page.evaluate(() => fxSetMonths(12)); assert.equal(await page.evaluate(() => fx.res.months), 12);
    const before = await page.evaluate(() => fx.res.bands[12].p50); await page.evaluate(() => { fxNewStep(0.8); }); assert.equal(await page.evaluate(() => fx.newRate), 1.2);
    assert.ok(await page.evaluate(() => fx.res.bands[12].p50) >= before, 'more new students never lowers the median');
    assert.equal(await page.evaluate(() => lsGet('tr_fxNew', 0)), 1.2);
    // closing stops any running animation
    await page.evaluate(() => fxSetMonths(6)); await page.evaluate(() => closeKhataModal()); await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => fx.raf), 0); assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
