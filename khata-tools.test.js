// Pure-logic tests for js/08-khata-tools.js (monthly repeats, global search, CSV). Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = vm.createContext({
    Math, Number, String, Array, Object, JSON, Date, parseInt, parseFloat, RegExp, setTimeout: () => 0,
    KH_TYPES: { gave: { label: 'ধার দিলাম', sign: 1 } },
    bnDigitsToLatin: s => s.replace(/[০-৯]/g, c => '০১২৩৪৫৬৭৮৯'.indexOf(c)),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '08-khata-tools.js'), 'utf8'), ctx);
  return code => vm.runInContext(code, ctx);
}

test('repeat: catches up missed months, never adds a future day, clamps the day to month length', () => {
  const q = load();
  const due = it => JSON.parse(q(`JSON.stringify(khRecurDue(${JSON.stringify(it)}, '2026-10-15'))`)).map(x => x.date);
  assert.deepEqual(due({ day: 1, last: '2026-07' }), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.deepEqual(due({ day: 20, last: '2026-09' }), []);                       // 20 Oct is still ahead
  assert.deepEqual(due({ day: 28, last: '2026-01' }).length, 8);                 // Feb..Sep + none for Oct (28 > 15)
  assert.deepEqual(due({ day: 31, last: '2026-01' }).slice(0, 2), ['2026-02-28', '2026-03-31']);
  assert.deepEqual(due({ day: 10, last: '2026-10' }), []);                       // already done this month
});

test('search: matches name, note, category and amount (Bangla digits too)', () => {
  const q = load();
  const khata = [{ person: 'রাকিব', type: 'gave', amount: 500, note: 'বই', date: '2026-10-05' }];
  const daily = [{ kind: 'out', amount: 120, cat: 'খাবার', note: 'দুপুর', date: '2026-10-09' }];
  const run = s => JSON.parse(q(`JSON.stringify(khSearchAll(${JSON.stringify(s)}, ${JSON.stringify(khata)}, ${JSON.stringify(daily)}))`));
  assert.equal(run('রাকিব').length, 1);
  assert.equal(run('১২০')[0].src, 'daily');
  assert.equal(run('500')[0].src, 'khata');
  assert.equal(run('দুপুর').length, 1);
  assert.equal(run('').length, 0);
  assert.equal(run('zzz').length, 0);
});

test('csv: BOM, quotes and commas are escaped', () => {
  const q = load();
  const out = q(`khCsvBuild(['a','b'], [['x,y','he said "hi"'],['১',2]])`);
  assert.ok(out.startsWith('\uFEFF'));
  assert.equal(out.split('\r\n')[1], '"x,y","he said ""hi"""');
  assert.equal(out.split('\r\n').length, 3);
});

test('app.js bundle is in sync with the sources (run `npm run build` if this fails)', () => {
  const { files } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js', 'manifest.json'), 'utf8'));
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\n*$/, '\n');
    assert.ok(bundle.includes(src), f + ' differs from app.js');
  }
});

test('number mode: mixed / en / bn decide which digits each helper produces', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const line = (src, re) => { const m = src.match(re); assert.ok(m, 'not found: ' + re); return m[0]; };
  const core = read('js/01-core.js'), pay = read('js/02-payments.js'), cmd = read('js/06-commands.js');
  const code = [
    line(core, /^const BN_DIGITS = .*$/m), line(core, /^function toBnRaw\(n\).*$/m), line(core, /^function toBn\(n\).*$/m),
    line(cmd, /^function bnDigitsToLatin\(s\).*$/m),
    line(pay, /^function enNum\(n\).*$/m), line(pay, /^function khD\(s\).*$/m),
    line(pay, /^const KH_FIELD_IDS=.*$/m), line(pay, /^function isKhField\(id\).*$/m),
  ].join('\n');
  const at = mode => { const ctx = vm.createContext({ String, Array }); vm.runInContext('let _numMode=' + JSON.stringify(mode) + ';\n' + code, ctx); return c => vm.runInContext(c, ctx); };
  const mixed = at('mixed'), en = at('en'), bn = at('bn');
  assert.equal(mixed('toBn(125)'), '১২৫');  assert.equal(mixed('enNum(125)'), '125');  assert.equal(mixed('khD("১২ অক্টোবর")'), '12 অক্টোবর');
  assert.equal(en('toBn(125)'), '125');       assert.equal(en('enNum(125)'), '125');
  assert.equal(bn('toBn(125)'), '১২৫');       assert.equal(bn('enNum(125)'), '১২৫');     assert.equal(bn('khD("১২ অক্টোবর")'), '১২ অক্টোবর');
  assert.equal(mixed('isKhField("kh_amt")'), true);  assert.equal(mixed('isKhField("exp_amount")'), false);   // keypad: English only in the khata fields
  assert.equal(en('isKhField("exp_amount")'), true); assert.equal(bn('isKhField("kh_amt")'), false);
});
