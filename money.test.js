// Money-logic tests: loads the REAL functions out of js/*.js (no copy-paste) into a sandbox with an
// in-memory localStorage and a fixed clock, then checks dues, partial/over-payments, opening balance,
// late fees, archived payments and receipt numbering. Run:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// app is split into js/*.js (classic scripts, shared global scope): read them in the same order index.html loads them
const root = path.join(__dirname, '..');
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'js', 'manifest.json'), 'utf8')).files;
const src = scripts.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
function grab(name) {            // pull "function name(...) { ... }" out of app.js by brace matching
  const start = src.search(new RegExp('^function ' + name + '\\(', 'm'));
  if (start < 0) throw new Error('function not found in js/*.js: ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
const NAMES = ['dateKeyStr','todayDateOnly','addDaysToDate','currentMonthKey','getPaymentsData','getStudentPayment',
  'feeAdjNet','feeEffective','payRefExists','payLooksDuplicate','restorePayment','addPayment','deletePayment','getArchives','getStudentPaidForMonth','getStudentDueForMonth','getStudentTotalDue',
  'getLateFeeConfig','isDueLate','getStudentDueWithLateFee','computeDueList'];

function make(nowISO = '2026-10-15T10:00:00') {
  const store = {};
  let NOW = new Date(nowISO).getTime();
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const ctx = vm.createContext({
    Date: FakeDate, Math, Set, Array, Object, JSON, parseFloat, String,
    lsGet: (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d),
    lsSet: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); return true; },
    getAllKnownNames: () => ['Rimi', 'Karim'],
  });
  vm.runInContext(NAMES.map(grab).join('\n'), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { run, store, setNow: (iso) => { NOW = new RealDate(iso).getTime(); } };
}
const setFee = (t, name, fee, opening = 0) => t.run(`lsSet('tr_payments', Object.assign(getPaymentsData(), {${JSON.stringify(name)}: {monthlyFee:${fee}, openingBalance:${opening}, payments:[]}}))`);

test('unpaid month: due equals the monthly fee', () => {
  const t = make(); setFee(t, 'Rimi', 1500);
  assert.equal(t.run(`getStudentTotalDue('Rimi')`), 1500);
});
test('partial payment reduces the due; full payment clears it', () => {
  const t = make(); setFee(t, 'Rimi', 1500);
  t.run(`addPayment('Rimi', 500, currentMonthKey(), '', false, 'bKash')`);
  assert.equal(t.run(`getStudentTotalDue('Rimi')`), 1000);
  t.run(`addPayment('Rimi', 1000, currentMonthKey(), '', false, 'Cash')`);
  assert.equal(t.run(`getStudentTotalDue('Rimi')`), 0);
});
test('over-payment never produces a negative due', () => {
  const t = make(); setFee(t, 'Rimi', 1000);
  t.run(`addPayment('Rimi', 1800, currentMonthKey(), '', false, 'Cash')`);
  assert.equal(t.run(`getStudentTotalDue('Rimi')`), 0);
});
test('opening balance is added to this month\'s due, and paying it down is reversible', () => {
  const t = make(); setFee(t, 'Rimi', 1000, 600);
  assert.equal(t.run(`getStudentTotalDue('Rimi')`), 1600);
  t.run(`addPayment('Rimi', 400, null, '', true, 'Cash')`);
  assert.equal(t.run(`getStudentTotalDue('Rimi')`), 1200);
  const id = t.run(`getStudentPayment('Rimi').payments[0].id`);
  t.run(`deletePayment('Rimi', ${JSON.stringify(id)})`);
  assert.equal(t.run(`getStudentTotalDue('Rimi')`), 1600);
});
test('opening-balance payment larger than the balance clamps at zero', () => {
  const t = make(); setFee(t, 'Rimi', 0, 300);
  t.run(`addPayment('Rimi', 500, null, '', true, 'Cash')`);
  assert.equal(t.run(`getStudentPayment('Rimi').openingBalance`), 0);
});
test('late fee: off by default, applies only after the configured day', () => {
  const t = make('2026-10-05T10:00:00'); setFee(t, 'Rimi', 1000);
  assert.equal(t.run(`getStudentDueWithLateFee('Rimi', currentMonthKey()).due`), 1000);
  t.store['tr_lateFee'] = { enabled: true, amount: 100, afterDay: 10 };
  assert.equal(t.run(`getStudentDueWithLateFee('Rimi', currentMonthKey()).due`), 1000);   // day 5: not late yet
  t.setNow('2026-10-20T10:00:00');
  assert.equal(t.run(`getStudentDueWithLateFee('Rimi', currentMonthKey()).due`), 1100);   // day 20: late
});
test('late fee is never added to a student who has paid in full', () => {
  const t = make('2026-10-20T10:00:00'); setFee(t, 'Rimi', 1000);
  t.store['tr_lateFee'] = { enabled: true, amount: 100, afterDay: 10 };
  t.run(`addPayment('Rimi', 1000, currentMonthKey(), '', false, 'Cash')`);
  assert.equal(t.run(`getStudentDueWithLateFee('Rimi', currentMonthKey()).due`), 0);
});
test('payments saved in an archive still count toward that month', () => {
  const t = make(); setFee(t, 'Rimi', 1000);
  t.store['tr_archives'] = [{ data: { payments: { Rimi: { payments: [{ monthKey: t.run('currentMonthKey()'), amount: 400 }] } } } }];
  assert.equal(t.run(`getStudentDueForMonth('Rimi', currentMonthKey())`), 600);
});
test('computeDueList lists only students who owe something', () => {
  const t = make(); setFee(t, 'Rimi', 1000); setFee(t, 'Karim', 500);
  t.run(`addPayment('Karim', 500, currentMonthKey(), '', false, 'Cash')`);
  assert.deepEqual(JSON.parse(t.run(`JSON.stringify(computeDueList().map(x=>[x.name,x.due]))`)), [['Rimi', 1000]]);
});
test('receipt numbers increase one by one', () => {
  const t = make(); setFee(t, 'Rimi', 3000);
  for (let i = 0; i < 3; i++) t.run(`addPayment('Rimi', 100, currentMonthKey(), '', false, 'Cash')`);
  assert.deepEqual(JSON.parse(t.run(`JSON.stringify(getStudentPayment('Rimi').payments.map(p=>p.no))`)), [1, 2, 3]);
});

/* ===================== student rename: every store must move together ===================== */
function makeRename(){
  const store = {};
  const ctx = vm.createContext({
    Math, Set, Array, Object, JSON, String,
    lsGet: (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d),
    lsSet: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); return true; },
    DAYS: ['sat', 'sun'],
    SCHEDULE: [{ num: '1', cells: { sat: 'Rimi, Karim', sun: 'Rimi' } }, { num: '2', cells: { sat: '', sun: 'Nila' } }],
  });
  const names = ['getSchedOverrides','getCellText','setCellText','getAllKnownNames','validStudentName','hasStudentData','renameStudent'];
  vm.runInContext(names.map(grab).join('\n'), ctx);
  return { store, run: (c) => vm.runInContext(c, ctx) };
}
function seed(t) {
  Object.assign(t.store, {
    tr_students: { Rimi: { klass: '8' }, Karim: {} },
    tr_payments: { Rimi: { monthlyFee: 1000, openingBalance: 0, payments: [{ id: 'a', amount: 500 }] } },
    tr_progress: { Rimi: { Math: ['ch1'] } },
    tr_attendance: { '2026-10-01|1|Rimi': 'present', '2026-10-01|1|Karim': 'absent' },
    tr_notes: { '2026-10-01|1': { entries: [{ student: 'Rimi', subject: 'Math', taught: 'x' }, { student: 'Karim', subject: 'Eng', taught: 'y' }] } },
    tr_makeups: [{ id: 'm', name: 'Rimi' }],
    tr_moves: { '2026-10-02|1': { toSlotNum: '2', name: 'Rimi' } },
    tr_archives: [{ id: 'z', data: { payments: { Rimi: { payments: [] } }, progress: { Rimi: {} }, attendance: { '2026-09-01|1|Rimi': 'present' }, notes: { 'k': { entries: [{ student: 'Rimi' }] } } } }],
  });
}
test('rename moves profile, payments, progress, attendance, notes, make-ups, moves, archives and schedule', () => {
  const t = makeRename(); seed(t);
  assert.equal(t.run(`renameStudent('Rimi', 'Rimi Akter').ok`), true);
  const s = t.store;
  assert.ok(s.tr_students['Rimi Akter'] && !s.tr_students['Rimi']);
  assert.equal(s.tr_payments['Rimi Akter'].payments[0].amount, 500);
  assert.ok(s.tr_progress['Rimi Akter'] && !s.tr_progress['Rimi']);
  assert.deepEqual(Object.keys(s.tr_attendance).sort(), ['2026-10-01|1|Karim', '2026-10-01|1|Rimi Akter']);
  assert.equal(s.tr_notes['2026-10-01|1'].entries[0].student, 'Rimi Akter');
  assert.equal(s.tr_notes['2026-10-01|1'].entries[1].student, 'Karim');
  assert.equal(s.tr_makeups[0].name, 'Rimi Akter');
  assert.equal(s.tr_moves['2026-10-02|1'].name, 'Rimi Akter');
  const a = s.tr_archives[0].data;
  assert.ok(a.payments['Rimi Akter'] && a.progress['Rimi Akter'] && !a.payments['Rimi']);
  assert.ok('2026-09-01|1|Rimi Akter' in a.attendance);
  assert.equal(a.notes.k.entries[0].student, 'Rimi Akter');
  assert.equal(t.run(`getCellText(SCHEDULE[0],'sat')`), 'Rimi Akter, Karim');
  assert.equal(t.run(`getCellText(SCHEDULE[0],'sun')`), 'Rimi Akter');
  assert.equal(t.run(`getCellText(SCHEDULE[1],'sun')`), 'Nila');
});
test('rename then rename back (undo) restores everything', () => {
  const t = makeRename(); seed(t); const before = JSON.stringify(t.store);
  t.run(`renameStudent('Rimi', 'Rimi Akter')`); t.run(`renameStudent('Rimi Akter', 'Rimi')`);
  const after = t.store;
  assert.deepEqual(after.tr_students, JSON.parse(before).tr_students);
  assert.deepEqual(after.tr_payments, JSON.parse(before).tr_payments);
  assert.deepEqual(after.tr_attendance, JSON.parse(before).tr_attendance);
  assert.equal(t.run(`getCellText(SCHEDULE[0],'sat')`), 'Rimi, Karim');
});
test('rename refuses a name that already exists (no silent merge), commas and empty names', () => {
  const t = makeRename(); seed(t);
  assert.equal(t.run(`renameStudent('Rimi', 'Karim').reason`), 'exists');
  assert.equal(t.run(`renameStudent('Rimi', 'A, B').reason`), 'invalid');
  assert.equal(t.run(`renameStudent('Rimi', '   ').reason`), 'invalid');
  assert.ok(t.store.tr_students['Rimi']);
});
test('rename refuses a name that still has saved history from a removed student', () => {
  const t = makeRename(); seed(t);
  t.store.tr_payments['Old Student'] = { monthlyFee: 500, openingBalance: 200, payments: [] };
  assert.equal(t.run(`renameStudent('Rimi', 'Old Student').reason`), 'exists');
});

/* ===================== "ক্লাস শেষ" wrap-up: pure helpers ===================== */
function makeWrap() {
  const store = {};
  const ctx = vm.createContext({ Object, Array, JSON,
    lsGet: (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d),
    getNotes: () => JSON.parse(JSON.stringify(store.tr_notes || {})),
    getStudentSubjects: (n) => (store.tr_progress || {})[n] || {} });
  vm.runInContext(['lastSubjectFor', 'mergeWrapEntry'].map(grab).join('\n'), ctx);
  return { store, run: (c) => vm.runInContext(c, ctx) };
}
test('wrap-up remembers the subject from the most recent note, else the first saved subject', () => {
  const t = makeWrap();
  t.store.tr_progress = { Rimi: { Science: [] } };
  assert.equal(t.run(`lastSubjectFor('Rimi')`), 'Science');
  t.store.tr_notes = {
    '2026-10-01|1': { entries: [{ student: 'Rimi', subject: 'Math' }] },
    '2026-10-03|1': { entries: [{ student: 'Rimi', subject: 'English' }, { student: 'Karim', subject: 'Bio' }] },
  };
  assert.equal(t.run(`lastSubjectFor('Rimi')`), 'English');
  assert.equal(t.run(`lastSubjectFor('Nobody')`), '');
});
test('wrap-up save replaces the same student+subject entry and keeps everyone else', () => {
  const t = makeWrap();
  const base = [{ student: 'Rimi', subject: 'Math', taught: 'old' }, { student: 'Karim', subject: 'Math', taught: 'k' }, { student: 'Rimi', subject: 'English', taught: 'e' }];
  const out = JSON.parse(t.run(`JSON.stringify(mergeWrapEntry(${JSON.stringify(base)}, 'Rimi', 'Math', 'new', 'Ex 3'))`));
  assert.equal(out.length, 3);
  assert.equal(out.filter(e => e.student === 'Rimi' && e.subject === 'Math').length, 1);
  assert.equal(out.find(e => e.student === 'Rimi' && e.subject === 'Math').taught, 'new');
  assert.ok(out.find(e => e.student === 'Karim') && out.find(e => e.subject === 'English'));
});

/* ===================== one-line payment commands ===================== */
function grabConst(name) {
  const m = src.match(new RegExp('^const ' + name + ' = .*$', 'm'));
  if (!m) throw new Error('const not found: ' + name);
  return m[0];
}
function makeCmd(state = {}) {
  const ctx = vm.createContext({
    Math, Array, Object, String, parseFloat, RegExp,
    Date: class extends Date { constructor(...a) { a.length ? super(...a) : super('2026-10-15T10:00:00'); } },
    getAllKnownNames: () => ['রিমি', 'সাকিব'],
    isFinanceHidden: () => !!state.hidden,
    currentMonthKey: () => '2026-10',
    getStudentPayment: () => ({ monthlyFee: 1500, openingBalance: state.opening || 0, payments: [] }),
    getStudentDueForMonth: () => state.due ?? 1500,
  });
  const code = ['PAY_WORDS', 'PAY_METHOD_WORDS', 'MONTH_NAMES', 'BN_NUM_WORDS'].map(grabConst).join('\n') + '\n' +
    ['bnDigitsToLatin', 'findNameInText', 'bnWordsToDigits', 'extractAmount', 'parsePaymentCommand'].map(grab).join('\n');
  vm.runInContext(code, ctx);
  return (text) => JSON.parse(vm.runInContext(`JSON.stringify(parsePaymentCommand(${JSON.stringify(text)}))`, ctx));
}
test('command: "রিমি ১৫০০ বিকাশ" becomes a bKash payment for this month', () => {
  const r = makeCmd()('রিমি ১৫০০ বিকাশ');
  assert.equal(r.ok, true); assert.equal(r.amount, 1500); assert.equal(r.method, 'বিকাশ');
  assert.equal(r.monthKey, '2026-10'); assert.equal(r.opening, false); assert.equal(r.after, 0);
});
test('command: Latin digits, commas, "হাজার" and "শ" all read as money', () => {
  const p = makeCmd();
  assert.equal(p('রিমি 1,500 টাকা').amount, 1500);
  assert.equal(p('রিমি ২ হাজার টাকা দিয়েছে').amount, 2000);
  assert.equal(p('সাকিব ১৫ শ টাকা').amount, 1500);
});
test('command: "পুরো ফি" pays exactly what is still due; nothing due is refused', () => {
  assert.equal(makeCmd({ due: 900 })('সাকিব পুরো ফি').amount, 900);
  const none = makeCmd({ due: 0 })('সাকিব পুরো ফি');
  assert.equal(none.ok, false);
});
test('command: "আগের বকেয়া" goes to the opening balance; a month name picks that month', () => {
  const r = makeCmd({ opening: 600 })('রিমি ২০০ আগের বকেয়া');
  assert.equal(r.opening, true); assert.equal(r.after, 400);
  assert.equal(makeCmd()('রিমি ১০০০ টাকা সেপ্টেম্বর').monthKey, '2026-09');
  assert.equal(makeCmd()('রিমি ১০০০ টাকা ডিসেম্বর').monthKey, '2025-12');   // December is last year, not the future
});
test('command: schedule commands and clock times are NOT mistaken for payments', () => {
  const p = makeCmd();
  assert.equal(p('রিমিকে ৫টায় নাও'), null);
  assert.equal(p('আজ রিমির ক্লাস বাতিল'), null);
  assert.equal(p('রিমিকে আজ সাড়ে ৯টায় নাও'), null);
});
test('command: needs a known name, an amount, and an unlocked finance view', () => {
  assert.equal(makeCmd()('করিম ১৫০০ বিকাশ'), null);
  assert.equal(makeCmd()('রিমি বিকাশ').ok, false);
  assert.equal(makeCmd({ hidden: true })('রিমি ১৫০০ বিকাশ').ok, false);
});

/* ===================== smart notes: sentence parser, suggestions, homework stats ===================== */
function makeSmart(state = {}) {
  const ctx = vm.createContext({
    Object, Array, JSON, Set, RegExp, String, Math,
    getAllKnownNames: () => ['রিমি', 'সাকিব'],
    getStudentSubjects: (n) => (state.progress || {})[n] || {},
    getNotes: () => JSON.parse(JSON.stringify(state.notes || {})),
    getArchives: () => state.archives || [],
    todayDateOnly: () => new Date('2026-10-15T00:00:00'),
    dateKeyStr: (d) => d.toISOString().slice(0, 10),
    lastSubjectFor: (n) => state.lastSubject || '',
  });
  const code = ['NOTE_MARK', 'TEACH_WORDS', 'COMMON_SUBJECTS'].map(grabConst).join('\n') + '\n' +
    ['findNameInText', 'lastEntryFor', 'smartSuggestion', 'parseNoteCommand', 'homeworkStats'].map(grab).join('\n');
  vm.runInContext(code, ctx);
  return (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx));
}
test('smart note: one sentence splits into subject, taught, homework and next plan', () => {
  const q = makeSmart({ progress: { 'রিমি': { 'গণিত': [] } } });
  const r = q(`parseNoteCommand('রিমি গণিত অধ্যায় ৩ পড়ালাম, হোমওয়ার্ক অনুশীলনী ৩.২, পরের ক্লাসে অধ্যায় ৪')`);
  assert.equal(r.name, 'রিমি'); assert.equal(r.subject, 'গণিত');
  assert.equal(r.taught, 'অধ্যায় ৩'); assert.equal(r.homework, 'অনুশীলনী ৩.২'); assert.equal(r.nextPlan, 'অধ্যায় ৪');
});
test('smart note: order of parts does not matter, and a missing subject falls back to the last one', () => {
  const q = makeSmart({ lastSubject: 'ইংরেজি' });
  const r = q(`parseNoteCommand('সাকিবের বাড়ির কাজ: ১০টা বাক্য লেখা, আজ Tense পড়ালাম')`);
  assert.equal(r.name, 'সাকিব'); assert.equal(r.subject, 'ইংরেজি');
  assert.equal(r.homework, '১০টা বাক্য লেখা, আজ Tense'); 
});
test('smart note: payment lines, schedule commands and bare names are NOT notes', () => {
  const q = makeSmart();
  assert.equal(q(`parseNoteCommand('রিমি ১৫০০ বিকাশ')`), null);
  assert.equal(q(`parseNoteCommand('আজ রিমির ক্লাস বাতিল')`), null);
  assert.equal(q(`parseNoteCommand('রিমিকে ৫টায় নাও')`), null);
  assert.equal(q(`parseNoteCommand('রিমি')`), null);
  assert.equal(q(`parseNoteCommand('করিম গণিত পড়ালাম')`), null);
});
test('suggestion: last "next plan" wins, else the chapter after the one taught, else first unfinished', () => {
  const prog = { 'রিমি': { 'গণিত': [{ chapter: 'অধ্যায় ১', pct: 100 }, { chapter: 'অধ্যায় ২', pct: 40 }, { chapter: 'অধ্যায় ৩', pct: 0 }] } };
  let q = makeSmart({ progress: prog, notes: { '2026-10-10|1': { entries: [{ student: 'রিমি', subject: 'গণিত', taught: 'অধ্যায় ১', nextPlan: 'রিভিশন' }] } } });
  assert.equal(q(`smartSuggestion('রিমি','গণিত')`).text, 'রিভিশন');
  q = makeSmart({ progress: prog, notes: { '2026-10-10|1': { entries: [{ student: 'রিমি', subject: 'গণিত', taught: 'অধ্যায় ২', nextPlan: '' }] } } });
  assert.equal(q(`smartSuggestion('রিমি','গণিত')`).text, 'অধ্যায় ৩');
  q = makeSmart({ progress: prog });
  assert.equal(q(`smartSuggestion('রিমি','গণিত')`).text, 'অধ্যায় ২');
});
test('last entry ignores today (we are filling today in) and finds the most recent earlier class', () => {
  const q = makeSmart({ notes: {
    '2026-10-15|1': { entries: [{ student: 'রিমি', subject: 'গণিত', taught: 'today' }] },
    '2026-10-12|1': { entries: [{ student: 'রিমি', subject: 'গণিত', taught: 'newer' }] },
    '2026-10-01|1': { entries: [{ student: 'রিমি', subject: 'গণিত', taught: 'older' }] } } });
  assert.equal(q(`lastEntryFor('রিমি','গণিত').entry.taught`), 'newer');
});
test('homework stats: counts done/partial/none, needs 3+ answers, sorted weakest first, includes archives', () => {
  const e = (s, st) => ({ student: s, subject: 'গণিত', taught: 'x', hwStatus: st });
  const q = makeSmart({
    notes: { a: { entries: [e('রিমি', 'done'), e('রিমি', 'done'), e('সাকিব', 'none'), e('সাকিব', 'none')] } },
    archives: [{ data: { notes: { b: { entries: [e('রিমি', 'none'), e('সাকিব', 'partial')] } } } }] });
  const r = q(`homeworkStats()`);
  assert.deepEqual(r.map(x => [x.name, x.pct]), [['সাকিব', 17], ['রিমি', 67]]);
});
test('saving a note keeps the homework status of that student+subject', () => {
  const s2 = {};
  const ctx = vm.createContext({ Object, Array, JSON,
    getNotes: () => JSON.parse(JSON.stringify(s2.notes || {})),
    lsSet: (k, v) => { s2.notes = JSON.parse(JSON.stringify(v)); },
    dateKeyStr: () => '2026-10-12' });
  vm.runInContext(grab('setNoteEntries'), ctx);
  s2.notes = { '2026-10-12|1': { entries: [{ student: 'রিমি', subject: 'গণিত', taught: 'a', homework: 'h', nextPlan: '', hwStatus: 'done' }] } };
  vm.runInContext(`setNoteEntries(new Date(), '1', [{student:'রিমি', subject:'গণিত', taught:'b', homework:'h2', nextPlan:''}])`, ctx);
  assert.equal(s2.notes['2026-10-12|1'].entries[0].hwStatus, 'done');
  assert.equal(s2.notes['2026-10-12|1'].entries[0].taught, 'b');
});

/* ===================== bKash / Nagad SMS -> payment ===================== */
function makeSms() {
  const ctx = vm.createContext({ Math, Array, Object, String, parseFloat, RegExp });
  vm.runInContext(grab('bnDigitsToLatin') + '\n' + grabConst('phone10') + '\n' + ['parseSmsPayment', 'matchPhoneToStudent', 'findPaymentByTrx'].map(grab).join('\n'), ctx);
  return (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx));
}
const BKASH = 'You have received Tk 1,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 12,345.00. TrxID 9AB3CD45EF at 03/10/2026 16:45';
const NAGAD = 'Money Received. Amount: Tk 2,000.00 Sender: 01812-345678 Ref: N/A TxnID: 7CD2EF11AB Balance: Tk 5,000.00 03/10/2026 17:10';
test('SMS: bKash message gives amount (not the balance), sender, TrxID and method', () => {
  const r = makeSms()(`parseSmsPayment(${JSON.stringify(BKASH)})`);
  assert.equal(r.amount, 1500); assert.equal(r.phone, '01712345678'); assert.equal(r.trx, '9AB3CD45EF'); assert.equal(r.method, 'বিকাশ');
});
test('SMS: Nagad message (dashed number) is read, and filed under "অন্যান্য" because "নগদ" means cash here', () => {
  const r = makeSms()(`parseSmsPayment(${JSON.stringify(NAGAD)})`);
  assert.equal(r.amount, 2000); assert.equal(r.phone, '01812345678'); assert.equal(r.method, 'অন্যান্য'); assert.equal(r.wallet, 'Nagad');
});
test('SMS: Bangla digits and wording work too', () => {
  const r = makeSms()(`parseSmsPayment('আপনি ১,২০০ টাকা পেয়েছেন ০১৭১২৩৪৫৬৭৮ থেকে। TrxID 5XY7ZZ99AA')`);
  assert.equal(r.amount, 1200); assert.equal(r.phone, '01712345678');
});
test('SMS: ordinary chat text, or a message with no amount/number, is ignored', () => {
  const q = makeSms();
  assert.equal(q(`parseSmsPayment('রিমি ১৫০০ বিকাশ')`), null);
  assert.equal(q(`parseSmsPayment('You have received a gift')`), null);
});
test('SMS: sender number matches a guardian number or a remembered extra number, in any format', () => {
  const q = makeSms();
  const profiles = { 'রিমি': { guardianPhone: '+880 1712-345678' }, 'সাকিব': { guardianPhone: '01900000000', payPhones: ['01812345678'] } };
  assert.equal(q(`matchPhoneToStudent(${JSON.stringify(profiles)}, '01712345678')`), 'রিমি');
  assert.equal(q(`matchPhoneToStudent(${JSON.stringify(profiles)}, '8801812345678')`), 'সাকিব');
  assert.equal(q(`matchPhoneToStudent(${JSON.stringify(profiles)}, '01555555555')`), null);
});
test('SMS: the same TrxID is never added twice', () => {
  const q = makeSms();
  const pays = { 'রিমি': { payments: [{ note: 'bKash TrxID 9AB3CD45EF' }] } };
  assert.equal(q(`findPaymentByTrx(${JSON.stringify(pays)}, '9AB3CD45EF')`), 'রিমি');
  assert.equal(q(`findPaymentByTrx(${JSON.stringify(pays)}, 'NEWTRX0001')`), null);
  assert.equal(q(`findPaymentByTrx(${JSON.stringify(pays)}, '')`), null);
});

/* ===================== spoken amounts, chapter finish, monthly collection ===================== */
test('spoken amounts: Bangla number words become money', () => {
  const p = makeCmd();
  const amt = (txt) => p(txt).amount;
  assert.equal(amt('রিমি এক হাজার পাঁচশো টাকা'), 1500);
  assert.equal(amt('রিমি দেড় হাজার বিকাশ'), 1500);
  assert.equal(amt('রিমি আড়াই হাজার টাকা'), 2500);
  assert.equal(amt('রিমি সাড়ে তিন হাজার টাকা'), 3500);
  assert.equal(amt('রিমি পনেরো শ টাকা'), 1500);
  assert.equal(amt('রিমি দুই হাজার টাকা'), 2000);
  assert.equal(amt('রিমি পাঁচশো পঞ্চাশ টাকা'), 550);
  assert.equal(amt('রিমি আট শত টাকা'), 800);
});
test('spoken amounts: digits are untouched, and ordinary words stay words', () => {
  const p = makeCmd();
  assert.equal(p('রিমি ১৫০০ বিকাশ').amount, 1500);
  assert.equal(p('রিমি বিকাশ').ok, false);
});
test('chapter finish: the sentence matches a saved chapter either way round', () => {
  const ctx = vm.createContext({ Array, Object, getStudentSubjects: () => ({ 'গণিত': [{ chapter: 'অধ্যায় ১' }, { chapter: 'সূচক ও লগারিদম' }] }) });
  vm.runInContext(grab('chapterIndexFor'), ctx);
  const f = (taught) => vm.runInContext(`chapterIndexFor('রিমি','গণিত',${JSON.stringify(taught)})`, ctx);
  assert.equal(f('সূচক ও লগারিদম'), 1);
  assert.equal(f('অধ্যায় ১ এর সূচক'), 0);
  assert.equal(f('অজানা টপিক'), -1);
  assert.equal(f(''), -1);
});
test('monthly collection lists only students who owe this month, biggest first', () => {
  const due = { 'রিমি': 900, 'সাকিব': 0, 'নিলা': 1500 };
  const ctx = vm.createContext({ Array, Object,
    currentMonthKey: () => '2026-10', getAllKnownNames: () => Object.keys(due),
    getStudentDueForMonth: (n) => due[n], getStudentPayment: () => ({ openingBalance: 0 }) });
  vm.runInContext(grab('batchPayRows'), ctx);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(batchPayRows().map(r=>[r.name,r.due]))', ctx)), [['নিলা', 1500], ['রিমি', 900]]);
});

/* ===================== খাতা: who owes whom + daily income/expense ===================== */
function makeKhata() {
  const daily = [];
  const ctx = vm.createContext({ Math, Array, Object, String, parseFloat, RegExp, getDaily: () => daily });
  const types = src.match(/^const KH_TYPES = \{[\s\S]*?\n\};/m)[0];
  vm.runInContext(types + '\n' + ['DAILY_OUT_CATS', 'DAILY_IN_CATS', 'KH_PHRASES', 'BN_NUM_WORDS', 'KH_CAT_HINTS'].map(grabConst).join('\n') + '\n' +
    ['bnDigitsToLatin', 'bnWordsToDigits', 'bnWordsToDigitsSafe', 'khataBalances', 'khataTotals', 'dailySummary', 'khataPersonPrefix', 'learnCategory', 'khataDebtRows', 'khataStatementRows', 'calcEval', 'khataDayData', 'safetyHasData', 'safetySummary', 'safetyPrune', 'safetyPickRestore', 'parseKhataCommand'].map(grab).join('\n'), ctx);
  const q = (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx));
  q.daily = daily; return q;
}
test('khata: balances net out per person; totals split into "I will get" and "I will owe"', () => {
  const q = makeKhata();
  const list = [
    { person: 'রাকিব', type: 'gave', amount: 1000 }, { person: 'রাকিব', type: 'got_back', amount: 400 },
    { person: 'সুমি', type: 'took', amount: 700 }, { person: 'সুমি', type: 'paid_back', amount: 200 },
    { person: 'নিলা', type: 'gave', amount: 300 }, { person: 'নিলা', type: 'got_back', amount: 300 } ];
  assert.deepEqual(q(`khataBalances(${JSON.stringify(list)})`), { 'রাকিব': 600, 'সুমি': -500, 'নিলা': 0 });
  assert.deepEqual(q(`khataTotals(${JSON.stringify(list)})`), { get: 600, owe: 500 });
});
test('khata: monthly income/expense summary and category totals', () => {
  const q = makeKhata();
  const list = [{ kind: 'in', amount: 3000, date: '2026-10-02', cat: 'উপহার' }, { kind: 'out', amount: 500, date: '2026-10-03', cat: 'খাবার' },
    { kind: 'out', amount: 250, date: '2026-10-09', cat: 'খাবার' }, { kind: 'out', amount: 900, date: '2026-09-30', cat: 'বাজার' }];
  const r = q(`dailySummary(${JSON.stringify(list)}, '2026-10')`);
  assert.equal(r.inc, 3000); assert.equal(r.out, 750); assert.equal(r.left, 2250); assert.deepEqual(r.cats, { 'খাবার': 750 });
});
test('khata command: lending, repaying, borrowing in plain Bangla', () => {
  const q = makeKhata();
  assert.deepEqual(q(`parseKhataCommand('রাকিব ৫০০ ধার দিলাম')`), { ok: true, action: 'khata', mode: 'person', person: 'রাকিব', type: 'gave', amount: 500 });
  assert.equal(q(`parseKhataCommand('রাকিব ২০০ ফেরত দিল')`).type, 'got_back');
  assert.equal(q(`parseKhataCommand('সুমি ১০০০ ধার নিলাম')`).type, 'took');
  assert.equal(q(`parseKhataCommand('সুমিকে ৩০০ ফেরত দিলাম')`).type, 'paid_back');
  assert.equal(q(`parseKhataCommand('সুমিকে ৩০০ ফেরত দিলাম')`).person, 'সুমি');
});
test('khata command: a name ending in "র" is NOT chopped, and spoken amounts work', () => {
  const q = makeKhata();
  assert.equal(q(`parseKhataCommand('আনোয়ার ৫০০ ধার দিলাম')`).person, 'আনোয়ার');
  const sp = q(`parseKhataCommand('রাকিব এক হাজার ধার দিলাম')`);
  assert.equal(sp.person, 'রাকিব'); assert.equal(sp.amount, 1000); assert.equal(sp.type, 'gave');
  const half = q(`parseKhataCommand('সুমি সাড়ে তিন হাজার ধার নিলাম')`);
  assert.equal(half.person, 'সুমি'); assert.equal(half.amount, 3500);
});
test('khata command: daily expense/income pick a category from the words, default to "অন্যান্য"', () => {
  const q = makeKhata();
  const e = q(`parseKhataCommand('খরচ ১২০ খাবার')`);
  assert.equal(e.mode, 'daily'); assert.equal(e.kind, 'out'); assert.equal(e.amount, 120); assert.equal(e.cat, 'খাবার');
  assert.equal(q(`parseKhataCommand('খরচ ৫০ চা বিস্কুট')`).cat, 'খাবার');        // smart word hint
  assert.equal(q(`parseKhataCommand('খরচ ৫০ কিছু একটা')`).cat, 'অন্যান্য');       // unknown words still default
  assert.equal(q(`parseKhataCommand('আয় ৫০০ উপহার')`).kind, 'in');
});
test('khata command: payments, schedule commands and notes are left alone', () => {
  const q = makeKhata();
  assert.equal(q(`parseKhataCommand('রিমি ১৫০০ বিকাশ')`), null);
  assert.equal(q(`parseKhataCommand('আজ রিমির ক্লাস বাতিল')`), null);
  assert.equal(q(`parseKhataCommand('রিমি গণিত অধ্যায় ৩ পড়ালাম')`), null);
  assert.equal(q(`parseKhataCommand('রাকিব ধার দিলাম')`), null);
});

/* ===================== wrap-up: several subjects for one student ===================== */
test('wrap-up: a second and third subject each become their own note', () => {
  const ctx = vm.createContext({ Object, Array });
  vm.runInContext(grab('joinWrapBlocks'), ctx);
  const r = JSON.parse(vm.runInContext(`JSON.stringify(joinWrapBlocks([{sub:'গণিত',taught:'a',hw:'x'},{sub:'ইংরেজি',taught:'b',hw:''},{sub:'বিজ্ঞান',taught:'c',hw:'z'}]))`, ctx));
  assert.deepEqual(r.map(b => b.sub), ['গণিত', 'ইংরেজি', 'বিজ্ঞান']);
});
test('wrap-up: the same subject typed twice is joined, not overwritten', () => {
  const ctx = vm.createContext({ Object, Array });
  vm.runInContext(grab('joinWrapBlocks'), ctx);
  const r = JSON.parse(vm.runInContext(`JSON.stringify(joinWrapBlocks([{sub:'গণিত',taught:'বীজগণিত',hw:'Ex 1'},{sub:'গণিত',taught:'জ্যামিতি',hw:''}]))`, ctx));
  assert.equal(r.length, 1); assert.equal(r[0].taught, 'বীজগণিত, জ্যামিতি'); assert.equal(r[0].hw, 'Ex 1');
});

test('khata: learnCategory learns from the person\'s own history first, then built-in word hints, else nothing', () => {
  const q = makeKhata();
  q.daily.push({ kind: 'out', cat: 'বিনোদন', note: 'চায়ের আড্ডা', amount: 50 });
  assert.equal(q("learnCategory('চায়ের দোকানে','out')"), 'বিনোদন');   // history beats the generic hint
  assert.equal(q("learnCategory('সন্ধ্যায় রিকশা','out')"), 'যাতায়াত'); // built-in hint
  assert.equal(q("learnCategory('কিছু একটা','out')"), '');
  assert.equal(q("learnCategory('রিকশা','in')"), '');                 // hints are for expenses only
  assert.equal(q("parseKhataCommand('খরচ ৮০ উবার').cat"), 'যাতায়াত');
});

test('khata list: filter পাবো/দেবো/overdue, search by name or phone, overdue first, days since last entry', () => {
  const q = makeKhata();
  const list = [
    { person: 'রাকিব', type: 'gave', amount: 1000, date: '2026-10-01' }, { person: 'সুমি', type: 'took', amount: 700, date: '2026-10-08' },
    { person: 'নিলা', type: 'gave', amount: 300, date: '2026-10-09' }, { person: 'মিটে', type: 'gave', amount: 50, date: '2026-10-02' }, { person: 'মিটে', type: 'got_back', amount: 50, date: '2026-10-03' } ];
  const people = { 'রাকিব': { phone: '01711111111', due: '2026-10-05' }, 'নিলা': { due: '2026-10-20' }, 'সুমি': { due: '2026-10-01' } };
  const rows = (f, s) => q(`khataDebtRows(${JSON.stringify(list)}, ${JSON.stringify(people)}, '${f}', '${s}', '2026-10-10')`);
  assert.deepEqual(rows('all', '').map(r => r.name), ['রাকিব', 'সুমি', 'নিলা']);          // settled person hidden; overdue রাকিব first
  assert.deepEqual(rows('get', '').map(r => r.name), ['রাকিব', 'নিলা']);
  assert.deepEqual(rows('owe', '').map(r => r.name), ['সুমি']);
  assert.deepEqual(rows('overdue', '').map(r => r.name), ['রাকিব']);                      // সুমি has a due date too, but I owe her, so not "overdue to collect"
  assert.deepEqual(rows('all', '0171').map(r => r.name), ['রাকিব']);
  assert.equal(rows('all', 'নিলা')[0].days, 1);
  assert.equal(rows('all', '')[0].days, 9);
});

test('khata PDF rows: opening balance, running balance and totals match the TallyKhata report (অভি: ৩৯,২৩৯ পাবো)', () => {
  const q = makeKhata();
  const tx = [['2026-07-10','gave',43250],['2026-07-23','gave',134],['2026-08-01','gave',300],['2026-08-04','got_back',5000],['2026-08-13','got_back',500],
    ['2026-08-13','gave',8500],['2026-08-13','got_back',2000],['2026-09-08','got_back',5000],['2026-09-08','gave',5000],['2026-09-13','gave',870],
    ['2026-09-13','got_back',500],['2026-09-13','gave',1285],['2026-10-03','gave',300],['2026-10-03','gave',600],['2026-10-03','got_back',8000]]
    .map(([date, type, amount]) => ({ person: 'অভি', date, type, amount }));
  const r = q(`khataStatementRows(${JSON.stringify(tx)}, '2026-07-11', '2026-10-09')`);
  assert.equal(r.opening, 43250);
  assert.equal(r.rows.length, 14);
  assert.equal(r.rows[0].run, 43384);          // after দুধের দাম ১৩৪
  assert.equal(r.rows[2].run, 38684);          // after ৫,০০০ পেলাম
  assert.equal(r.totOut, 60239); assert.equal(r.totIn, 21000); assert.equal(r.balance, 39239);
  assert.equal(r.rows[r.rows.length - 1].run, 39239);
  const all = q(`khataStatementRows(${JSON.stringify(tx)}, '', '')`);   // no range: nothing is "opening"
  assert.equal(all.opening, 0); assert.equal(all.rows.length, 15); assert.equal(all.balance, 39239);
});

test('calculator keypad: + − × ÷ %, precedence, Bangla digits, decimals, safe on bad input', () => {
  const q = makeKhata(), ev = (s) => q(`calcEval(${JSON.stringify(s)})`);
  assert.equal(ev('২৫০+১৩০×২'), 510);          // × before +
  assert.equal(ev('1000-250-50'), 700);
  assert.equal(ev('১২০০÷৪'), 300);
  assert.equal(ev('200+10%'), 220);             // percent of the amount on the left
  assert.equal(ev('200-10%'), 180);
  assert.equal(ev('200×10%'), 20);
  assert.equal(ev('50%'), 0.5);
  assert.equal(ev('০.১+০.২'), 0.3);             // no floating-point junk
  assert.equal(ev('1,500 + 500'), 2000);
  assert.equal(ev('৫০০+'), 500);                // trailing operator ignored while typing
  assert.equal(ev('৭০০'), 700);
  assert.equal(ev('100÷0'), null);              // never Infinity
  assert.equal(ev(''), null);
  assert.equal(ev('+'), null);
  assert.equal(ev('abc'), null);
  assert.equal(ev('5++3'), null);
  assert.equal(ev('process.exit()'), null);     // not eval(): anything but digits/operators is rejected
  assert.equal(ev('-5+10'), 5);
});

test('khata list: a person added by hand shows up with a zero balance, but a settled person does not', () => {
  const q = makeKhata();
  const list = [{ person: 'রাকিব', type: 'gave', amount: 500, date: '2026-10-01' }, { person: 'মিটে', type: 'gave', amount: 50, date: '2026-10-02' }, { person: 'মিটে', type: 'got_back', amount: 50, date: '2026-10-03' }];
  const people = { 'নতুন': { added: true, kind: 'supplier', phone: '01800000000' }, 'মিটে': {} };
  const rows = (f) => q(`khataDebtRows(${JSON.stringify(list)}, ${JSON.stringify(people)}, '${f}', '', '2026-10-10')`);
  assert.deepEqual(rows('all').map(r => r.name), ['রাকিব', 'নতুন']);       // নতুন has no transactions yet; মিটে is settled -> hidden
  assert.equal(rows('all')[1].net, 0);
  assert.deepEqual(rows('get').map(r => r.name), ['রাকিব']);               // zero-balance people never appear under পাবো/দেবো
  assert.deepEqual(rows('owe').map(r => r.name), []);
});

test('daily cash report: opening cash carries over, per-category rows, totals and closing balance', () => {
  const q = makeKhata();
  const daily = [
    { kind: 'in', amount: 9000, cat: 'প্রজেক্ট', date: '2026-10-01' }, { kind: 'out', amount: 600, cat: 'খাবার', date: '2026-10-02' },
    { kind: 'in', amount: 500, cat: 'টিউশন', date: '2026-10-03' }, { kind: 'in', amount: 250, cat: 'টিউশন', date: '2026-10-03' },
    { kind: 'out', amount: 100, cat: 'যাতায়াত', date: '2026-10-03' }, { kind: 'out', amount: 40, cat: 'যাতায়াত', date: '2026-10-03' }, { kind: 'in', amount: 70, cat: 'অন্য', date: '2026-10-04' } ];
  const d = q(`khataDayData(${JSON.stringify(daily)}, '2026-10-03')`);
  assert.equal(d.opening, 8400);                                   // 9000 - 600 before that day
  assert.deepEqual(d.inRows, [['টিউশন', 750]]); assert.deepEqual(d.outRows, [['যাতায়াত', 140]]);   // same category summed
  assert.equal(d.totIn, 9150); assert.equal(d.totOut, 140); assert.equal(d.closing, 9010);
  assert.equal(q(`khataDayData(${JSON.stringify(daily)}, '2026-10-04')`).opening, 9010);                // next day starts where this one ended
  const neg = q(`khataDayData(${JSON.stringify([{ kind: 'out', amount: 300, cat: 'খাবার', date: '2026-10-01' }])}, '2026-10-02')`);
  assert.equal(neg.opening, -300); assert.equal(neg.totOut, 300); assert.equal(neg.closing, -300);       // overdrawn opening goes to the "দিলাম" side
  assert.equal(q(`khataDayData([], '2026-10-02')`).closing, 0);
});

test('data safety: detects an emptied app, prunes old snapshots, and only offers a real, not-yet-declined snapshot', () => {
  const q = makeKhata(), has = (o) => q(`safetyHasData((k) => (${JSON.stringify(o)})[k] === undefined ? null : (${JSON.stringify(o)})[k])`);
  assert.equal(has({}), false);                                                         // brand-new install
  assert.equal(has({ tr_khata: '[]', tr_daily: '[]', tr_payments: '{}', tr_notes: '{}' }), false);   // everything emptied
  assert.equal(has({ tr_khata: '[{"person":"a"}]' }), true);
  assert.equal(has({ tr_notes: '{"2026-10-01|01":{}}' }), true);
  assert.equal(has({ tr_khata: 'not json' }), false);                                   // corrupt value never counts as data
  const s = q(`safetySummary((k) => ({ tr_khata: '[1,2,3]', tr_attendance: '{"a":1,"b":2}', tr_notes: 'oops' })[k] || null)`);
  assert.deepEqual(s, { khata: 3, daily: 0, att: 2, notes: 0 });
  const snaps = [];
  for (let i = 0; i < 10; i++) snaps.push({ id: 'auto-' + i, ts: 1000 + i, reason: 'auto' });
  for (let i = 0; i < 8; i++) snaps.push({ id: 'm-' + i, ts: 5000 + i, reason: 'manual' });
  const del = q(`safetyPrune(${JSON.stringify(snaps)})`).sort();
  assert.equal(del.length, 3 + 3);                                                      // 10 auto -> keep 7 (drop 3); 8 other -> keep 5 (drop 3)
  assert.ok(del.includes('auto-0') && del.includes('auto-2') && !del.includes('auto-9') && del.includes('m-0') && !del.includes('m-7'));
  const pool = [{ id: 'a', ts: 1, hasData: true }, { id: 'b', ts: 3, hasData: true }, { id: 'c', ts: 5, hasData: false }];
  assert.equal(q(`safetyPickRestore(${JSON.stringify(pool)}, null)`).id, 'b');          // newest one that actually has data
  assert.equal(q(`safetyPickRestore(${JSON.stringify(pool)}, 3)`), null);              // declined ts=3: it and everything older stay quiet (no nagging)
  assert.equal(q(`safetyPickRestore(${JSON.stringify(pool.concat([{ id: 'd', ts: 9, hasData: true }]))}, 3)`).id, 'd');   // a newer snapshot may ask again
  assert.equal(q(`safetyPickRestore([], null)`), null);
});
