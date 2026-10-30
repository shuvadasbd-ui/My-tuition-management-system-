// Tests for the TallyKhata-video additions (v61): filter/sort of the customer list, day/week/month report ranges, notes ordering,
// and a real-browser walk through notes, filter, report and editing saved entries. Run: npm test
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
  if (start < 0) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
function load(names) {
  const ctx = vm.createContext({ Math, Number, String, Array, Object, JSON, Date,
    KH_TYPES: { gave: { sign: 1 }, got_back: { sign: -1 }, took: { sign: -1 }, paid_back: { sign: 1 } } });
  vm.runInContext(names.map(grab).join('\n'), ctx);
  return code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
}

test('customer list: kind filter and the four sort orders (no-transaction rows sink last)', () => {
  const q = load(['khataBalances', 'khataDebtRows']);
  const list = [
    { person: 'আলি', type: 'gave', amount: 500, date: '2026-10-01' },
    { person: 'বাবু', type: 'gave', amount: 100, date: '2026-10-09' },
    { person: 'সুমন', type: 'took', amount: 300, date: '2026-09-20' },
  ];
  const people = { 'সুমন': { kind: 'supplier' }, 'নতুন': { kind: 'customer', added: true } };
  const names = o => q(`khataDebtRows(${JSON.stringify(list)}, ${JSON.stringify(people)}, 'all', '', '2026-10-10', ${JSON.stringify(o)})`).map(r => r.name);
  assert.deepEqual(names({ sort: 'amt_asc' }), ['নতুন', 'বাবু', 'সুমন', 'আলি']);
  assert.deepEqual(names({ sort: 'amt_desc' }), ['আলি', 'সুমন', 'বাবু', 'নতুন']);
  assert.deepEqual(names({ sort: 'last_new' }), ['বাবু', 'আলি', 'সুমন', 'নতুন']);
  assert.deepEqual(names({ sort: 'last_old' }), ['সুমন', 'আলি', 'বাবু', 'নতুন']);
  assert.deepEqual(names({ kinds: { customer: false, supplier: true } }), ['সুমন']);
  assert.deepEqual(names({ kinds: { customer: true, supplier: false } }).sort(), ['আলি', 'নতুন', 'বাবু'].sort());
  assert.deepEqual(names(undefined), ['আলি', 'সুমন', 'বাবু', 'নতুন']);          // default order unchanged
});

test('report ranges: week is Saturday..Friday, month is 1st..last, shifting never skips', () => {
  const q = load(['khRangeOf', 'khRangeShift', 'khataRangeData']);
  assert.deepEqual(q(`khRangeOf('week','2026-10-15')`), { from: '2026-10-10', to: '2026-10-16' });   // Thu 15 Oct -> Sat 10 .. Fri 16
  assert.deepEqual(q(`khRangeOf('week','2026-10-10')`), { from: '2026-10-10', to: '2026-10-16' });   // Saturday starts a week
  assert.deepEqual(q(`khRangeOf('week','2026-10-16')`), { from: '2026-10-10', to: '2026-10-16' });   // Friday ends it
  assert.deepEqual(q(`khRangeOf('month','2026-02-14')`), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(q(`khRangeOf('day','2026-10-15')`), { from: '2026-10-15', to: '2026-10-15' });
  assert.equal(q(`khRangeShift('month','2026-01-31',1)`), '2026-02-01');                             // 31 Jan + 1 month must not jump to March
  assert.equal(q(`khRangeShift('month','2026-03-15',-1)`), '2026-02-01');
  assert.equal(q(`khRangeShift('week','2026-10-15',-1)`), '2026-10-08');
  assert.equal(q(`khRangeShift('day','2026-10-01',-1)`), '2026-09-30');
  const daily = [{ kind: 'in', amount: 1000, cat: 'উপহার', date: '2026-09-30' }, { kind: 'out', amount: 200, cat: 'খাবার', date: '2026-10-02' }, { kind: 'out', amount: 50, cat: 'খাবার', date: '2026-10-20' }];
  const d = q(`khataRangeData(${JSON.stringify(daily)}, '2026-10-01', '2026-10-15')`);
  assert.equal(d.opening, 1000); assert.equal(d.totOut, 200); assert.equal(d.closing, 800);          // 20 Oct is outside the range
});

test('notes: pending first (earliest due first), finished last', () => {
  const q = load(['khNotesSorted']);
  const l = [{ id: 'a', done: true, doneAt: 5 }, { id: 'b', due: '2026-10-20', at: 1 }, { id: 'c', at: 9 }, { id: 'd', due: '2026-10-12', at: 2 }, { id: 'e', done: true, doneAt: 8 }];
  assert.deepEqual(q(`khNotesSorted(${JSON.stringify(l)})`).map(n => n.id), ['d', 'b', 'c', 'e', 'a']);
  assert.deepEqual(q(`khNotesSorted(null)`), []);
});

test('UI: notes, filter+sort, week report and editing saved entries (real browser, no JS errors)', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
  }).listen(0);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } }), errors = [];
    // closing a khata page animates, then pops one history entry — wait for all of that so a quick reopen can't race it
    const closePage = async () => { await page.evaluate(() => closeKhataModal()); await page.waitForFunction(() => document.getElementById('khataModal').style.display === 'none' && !khHist, null, { timeout: 5000 }); await page.waitForTimeout(150); };
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => {
      const T = dateKeyStr(todayDateOnly());
      localStorage.setItem('tr_khata', JSON.stringify([
        { id: 'k1', person: 'রাকিব', type: 'gave', amount: 1500, note: '', date: T },
        { id: 'k2', person: 'সুমন', type: 'took', amount: 300, note: '', date: '2026-09-01' }]));
      localStorage.setItem('tr_khataPeople', JSON.stringify({ 'সুমন': { kind: 'supplier', phone: '01700000000' } }));
      localStorage.setItem('tr_daily', JSON.stringify([{ id: 'd1', kind: 'out', amount: 120, cat: 'খাবার', note: 'দুপুর', date: T }]));
      switchTab('khata');
    });
    await page.waitForTimeout(400);
    // quick row: 8 tiles incl. নোট
    assert.equal(await page.evaluate(() => document.querySelectorAll('.kq button').length), 8);
    // notes: add, tick (strike-through), edit, delete, badge
    await page.evaluate(() => khNotesPage());
    await page.fill('#kn_text', 'রাকিবের টাকা নেব'); await page.click('.kn-add .kh-fab');
    await page.fill('#kn_text', 'বিল দেব'); await page.click('.kn-add .kh-fab');
    assert.equal(await page.evaluate(() => getKhNotes().length), 2);
    await page.evaluate(() => khNoteToggle(getKhNotes()[0].id));
    assert.equal(await page.evaluate(() => document.querySelectorAll('.kn-row.done').length), 1);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.kn-row.done .kn-txt')).textDecorationLine), 'line-through');
    await page.evaluate(() => khNoteEditStart(getKhNotes()[1].id)); await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'kn_edit'); await page.fill('#kn_edit', 'বিল দেব ১০ তারিখে'); await page.keyboard.press('Enter');
    assert.ok((await page.evaluate(() => getKhNotes().map(n => n.text))).includes('বিল দেব ১০ তারিখে'));
    await closePage();
    assert.equal(await page.evaluate(() => document.querySelector('.kq-badge') && document.querySelector('.kq-badge').textContent), '1');
    // filter: suppliers only, then sort
    await page.evaluate(() => { khFiltState = { cust: false, supp: true, sort: 'default' }; renderKhataTab(); });
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#khList .kh-name')].map(e => e.firstChild.textContent.trim())), ['সুমন']);
    await page.evaluate(() => { khFiltReset(true); khFilterModal(); }); await page.click('.kf-opt[data-v="amt_asc"]');
    await page.click('#khataModalBody .kh-fab');
    await page.waitForFunction(() => document.getElementById('khataModal').style.display === 'none' && !khHist, null, { timeout: 5000 }); await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#khList .kh-name')].map(e => e.firstChild.textContent.trim())), ['সুমন', 'রাকিব']);
    // week report + switching periods
    await page.evaluate(() => { khPer = 'week'; khataDayReport(); });
    assert.ok((await page.evaluate(() => document.querySelector('.kd-nav span').textContent)).includes('এই সপ্তাহ'));
    assert.equal(await page.evaluate(() => document.querySelectorAll('#khRepBox .kh-tx').length), 1);
    // edit a saved income/expense from the report: amount + kind switch keeps typed values
    await page.click('#khRepBox .kh-tx .kh-edit');
    assert.equal(await page.inputValue('#dl_amt'), '120');
    await page.fill('#dl_amt', '175'); await page.fill('#dl_note', 'দুপুর + চা');
    await page.evaluate(() => dlSwitchKind('in'));
    assert.equal(await page.inputValue('#dl_amt'), '175');
    await page.evaluate(() => dlSwitchKind('out'));
    await page.evaluate(() => saveDaily('out'));
    const e = await page.evaluate(() => getDaily()); assert.equal(e.length, 1);
    assert.equal(e[0].id, 'd1'); assert.equal(e[0].amount, 175); assert.equal(e[0].note, 'দুপুর + চা'); assert.equal(e[0].kind, 'out');
    assert.ok(await page.evaluate(() => !!document.getElementById('khRepBox')), 'back on the report page after saving');
    // edit a saved debt transaction (amount + rename keeps the phone)
    await page.evaluate(() => openKhataTx('', 'gave', 'k2'));
    assert.equal(await page.inputValue('#kh_amt'), '300');
    await page.fill('#kh_amt', '450'); await page.fill('#kh_person', 'সুমন ভাই');
    await page.evaluate(() => saveKhataTx());
    const k = await page.evaluate(() => ({ list: getKhata(), people: getLs('tr_khataPeople') }));
    assert.equal(k.list.find(t => t.id === 'k2').amount, 450); assert.equal(k.list.find(t => t.id === 'k2').person, 'সুমন ভাই');
    assert.equal(k.people['সুমন ভাই'].phone, '01700000000'); assert.ok(!k.people['সুমন']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
