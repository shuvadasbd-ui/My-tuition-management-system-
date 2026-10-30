// V72–V75 tests: pure logic of the question-paper builder, result analysis, fee adjustments, routine checks and backup merge.
// Loads the REAL modules (js/23..27) into a sandbox with an in-memory localStorage — no copy-paste of logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const allSrc = JSON.parse(read('js/manifest.json')).files.map(read).join('\n');
function grab(name) { const start = allSrc.search(new RegExp('^function ' + name + '\\(', 'm')); if (start < 0) throw new Error('missing ' + name); let i = allSrc.indexOf('{', allSrc.indexOf(')', start)), d = 0; for (; i < allSrc.length; i++) { if (allSrc[i] === '{') d++; else if (allSrc[i] === '}' && --d === 0) break; } return allSrc.slice(start, i + 1); }
function make(nowISO = '2026-10-28T10:00:00') {
  const store = {}, RealDate = Date; let NOW = new RealDate(nowISO).getTime();
  class FakeDate extends RealDate { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const ctx = vm.createContext({ Date: FakeDate, Math, Set, Array, Object, JSON, parseFloat, String, Number, isFinite, console,
    lsGet: (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d), lsSet: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); return true; },
    getAllKnownNames: () => ['Rimi', 'Karim'], bnTaka: n => '৳' + n, escapeHtml: s => String(s) });
  vm.runInContext(['dateKeyStr','todayDateOnly','addDaysToDate','currentMonthKey','getPaymentsData','getStudentPayment','feeAdjNet','feeEffective','payRefExists','payLooksDuplicate','addPayment','deletePayment','restorePayment','getArchives','getStudentPaidForMonth','getStudentDueForMonth','computeMonthlyIncomeStats'].map(grab).join('\n'), ctx);
  ['js/23-schema.js','js/24-qgen.js','js/25-results.js','js/26-fees.js','js/27-backup2.js'].forEach(f => vm.runInContext(read(f).replace(/^let (\w+)/gm, 'var $1').replace(/^const (\w+)/gm, 'var $1'), ctx));
  return { run: c => vm.runInContext(c, ctx), store, setNow: iso => { NOW = new RealDate(iso).getTime(); } };
}
const J = o => JSON.stringify(o);

// ---------- V71 migrations ----------
test('R13 migrations run twice: no duplicates, version stored, snapshot requested', () => {
  const t = make(); t.store.tr_makeups = [{ name: 'Rimi' }];
  const a = t.run(`(()=>{ globalThis.snaps=0; return runSchemaMigrations(()=>{ snaps++; }); })()`);
  assert.equal(a.ran.length, 4); assert.equal(t.run('snaps'), 1); assert.equal(t.store.tr_schemaVer, 75);
  const id = t.store.tr_makeups[0].id; assert.ok(id);
  const b = t.run(`runSchemaMigrations(()=>{ snaps++; })`); assert.equal(b.ran.length, 0); assert.equal(t.run('snaps'), 1);
  assert.equal(t.store.tr_makeups[0].id, id); assert.equal(t.store.tr_makeups.length, 1);
});

// ---------- V72 ----------
const mcq = (o = {}) => Object.assign(JSON.parse(t0.run('JSON.stringify(qpNewItem("mcq"))')), { q: 'প্রশ্ন ১', options: ['ক১', 'খ১', 'গ১', 'ঘ১'], ans: 1 }, o);
const t0 = make();
test('R09 MCQ validation: no answer, duplicate options, wrong count are errors', () => {
  const t = make(); const v = (item, full) => t.run(`qpValidate(${J([item])}, ${full})`).filter(x => x.level === 'error');
  assert.equal(v(mcq(), 1).length, 0);
  assert.ok(v(mcq({ ans: null }), 1).some(x => /সঠিক উত্তর/.test(x.text)));
  assert.ok(v(mcq({ options: ['a', 'a', 'c', 'd'] }), 1).some(x => /একই/.test(x.text)));
  assert.ok(v(mcq({ options: ['a', 'b', 'c'] }), 1).some(x => /চারটা/.test(x.text)));
  assert.ok(v(mcq({ ans: 7 }), 1).some(x => /সঠিক উত্তর/.test(x.text)));
});
test('marks must add up to full marks', () => {
  const t = make(), items = [mcq(), mcq({ q: 'অন্য' })];
  assert.equal(t.run(`qpSumMarks(${J(items)})`), 2);
  assert.ok(t.run(`qpValidate(${J(items)}, 10)`).some(x => /যোগফল/.test(x.text)));
  assert.ok(!t.run(`qpValidate(${J(items)}, 2)`).some(x => x.level === 'error'));
  assert.ok(t.run(`qpValidate(${J(items)}, 0)`).some(x => /পূর্ণমান/.test(x.text)));
});
test('print gate needs approval; editing is not enough', () => {
  const t = make(), it = mcq(); assert.equal(t.run(`qpReady(${J([it])}, 1).ok`), false);
  it.approved = true; assert.equal(t.run(`qpReady(${J([it])}, 1).ok`), true);
});
test('AI parse: fenced JSON, truncated JSON, letters as answers, junk', () => {
  const t = make();
  let r = t.run(`qpParseAi('\`\`\`json\\n[{"q":"x","options":["a","b","c","d"],"ans":"খ","unsure":true}]\\n\`\`\`','mcq')`);
  assert.equal(r.items.length, 1); assert.equal(r.items[0].ans, 1); assert.equal(r.items[0].unsure, true);
  r = t.run(`qpParseAi('[{"q":"a","options":["1","2","3","4"],"ans":0},{"q":"b","options":["1","2","3","4"],"ans":2},{"q":"c","opt','mcq')`);
  assert.equal(r.items.length, 2);
  assert.equal(t.run(`qpParseAi('sorry I cannot','mcq')`).bad, true);
  r = t.run(`qpParseAi('[{"q":""},5]','short')`); assert.equal(r.items.length, 0); assert.equal(r.dropped, 2);
});
test('AI prompt never contains phone numbers from source text and stays under server limits', () => {
  const t = make(); t.run('var aiScrubPhones=s=>String(s).replace(/01[3-9]\\d{8}/g,"[ফোন]")');
  const p = t.run(`qpPrompt({cls:'৮',board:'nctb',subject:'গণিত',chapter:'অনুপাত',lang:'bn',level:'mid',diff:'mid',source:'যোগাযোগ 01712345678 এ'},'mcq',3,[])`);
  assert.ok(!/01712345678/.test(p.user)); assert.ok(p.system.length < 6000); assert.ok(p.user.length < 50000);
});
test('R10 student paper never contains answers; key does', () => {
  const t = make(); const it = mcq({ explain: 'গোপন-ব্যাখ্যা' }); const sh = JSON.parse(t.run('JSON.stringify(qpNewItem("short"))')); Object.assign(sh, { q: 'সংক্ষিপ্ত?', answer: 'গোপন-উত্তর' });
  const cr = JSON.parse(t.run('JSON.stringify(qpNewItem("creative"))')); cr.stem = 'উদ্দীপক'; cr.parts.forEach((p, i) => { p.q = 'প' + i; p.a = 'গোপন-নমুনা' + i; });
  const set = { title: 'টেস্ট', meta: { type: 'model', cls: '৮', subject: 'গণিত', minutes: 30 }, items: [it, sh, cr], full: 14 };
  const paper = t.run(`qpPaperBody(${J(set)})`), key = t.run(`qpKeyBody(${J(set)})`);
  assert.ok(!/গোপন/.test(paper)); assert.ok(/গোপন-ব্যাখ্যা/.test(key) && /গোপন-উত্তর/.test(key) && /গোপন-নমুনা3/.test(key));
  assert.ok(/ক-বিভাগ/.test(paper) && /পূর্ণমান/.test(paper));
});
test('HTML in AI text is escaped in print output', () => {
  const t = make(); t.run('escapeHtml=s=>String(s).replace(/</g,"&lt;")'); const it = mcq({ q: '<img onerror=x>' });
  assert.ok(!/<img/.test(t.run(`qpPaperBody(${J({ meta: { type: 'mcq' }, items: [it], full: 1 })})`)));
});

// ---------- V73 ----------
const R = (o) => Object.assign({ id: String(Math.random()), student: 'Rimi', subject: 'গণিত', chapter: 'অনুপাত', exam: 't', date: '2026-10-01', status: 'taken', got: 5, full: 10 }, o);
test('percentage: zero marks valid, absent/incomplete null, full 0 and got>full invalid', () => {
  const t = make(); const p = r => t.run(`resPct(${J(r)})`);
  assert.equal(p(R({ got: 0 })), 0); assert.equal(p(R({ status: 'absent', got: null })), null); assert.equal(p(R({ status: 'incomplete' })), null);
  assert.equal(p(R({ full: 0 })), null); assert.equal(p(R({ got: 11 })), null); assert.equal(p(R({ got: 7, full: 9 })), 77.8);
});
test('weak analysis: one test = watch only; two tests average; absent not averaged; pins override', () => {
  const t = make(); const st = (rs, pins) => t.run(`resStats(${J(rs)},'Rimi',resCfgFrom({}),${J(pins || {})})`)[0];
  assert.equal(st([R({ got: 3 })]).band, 'watch');
  const two = st([R({ got: 5, date: '2026-09-01' }), R({ got: 5.4, date: '2026-10-01' })]); assert.equal(two.band, 'weak'); assert.equal(two.avg, 52);
  const ab = st([R({ got: 9 }), R({ status: 'absent', got: null, date: '2026-10-05' })]); assert.equal(ab.absent, 1); assert.equal(ab.avg, 90);
  assert.equal(st([R({ got: 9 }), R({ got: 9, date: '2026-10-02' })], { 'Rimi|গণিত|অনুপাত': 'weak' }).band, 'weak');
  assert.equal(st([R({ got: 3 }), R({ got: 3, date: '2026-10-02' })], { 'Rimi|গণিত|অনুপাত': 'dismiss' }).dismissed, true);
  assert.equal(st([R({ got: 6 }), R({ got: 7, date: '2026-10-02' })]).band, 'practice');
});
test('explanation always carries the reason (numbers) and teacher can dismiss from list', () => {
  const t = make(); const rs = [R({ got: 5, date: '2026-09-01' }), R({ got: 5.4, date: '2026-10-01' })];
  const s = t.run(`resStats(${J(rs)},'Rimi',resCfgFrom({}),{})[0]`); assert.match(t.run(`resExplain(${J(s)})`), /অনুপাত.*52%/);
  assert.equal(t.run(`resWeakList(${J(rs)},resCfgFrom({}),{'Rimi|গণিত|অনুপাত':'dismiss'}).length`), 0);
});
test('duplicate result entry rejected; validation messages', () => {
  const t = make(); const r = R({}); assert.equal(t.run(`resIsDup(${J([r])},${J(Object.assign({}, r, { id: 'z' }))})`), true);
  assert.match(t.run(`resValidate(${J(R({ got: 12 }))})`), /বেশি/); assert.match(t.run(`resValidate(${J(R({ got: '' }))})`), /প্রাপ্ত/); assert.equal(t.run(`resValidate(${J(R({}))})`), '');
});
test('monthly report compares with previous month and omits money', () => {
  const t = make(); const rs = [R({ date: '2026-09-10', got: 4 }), R({ date: '2026-10-10', got: 7 })];
  const rep = t.run(`resMonthReport(${J(rs)},'Rimi','2026-10',{'2026-10-03|1|Rimi':'present','2026-10-04|1|Rimi':'absent'},resCfgFrom({}),{})`);
  assert.equal(rep.subjects[0].delta, 30); assert.equal(rep.att.marked, 2);
  const txt = t.run(`resReportText({display:'রিমি',klass:'৮',monthLabel:'অক্টোবর',rep:${J(rep)},teacher:'শুভ',comment:'ভালো'})`);
  assert.match(txt, /⬆️/); assert.ok(!/৳|বকেয়া/.test(txt)); assert.match(txt, /ভালো/);
  assert.equal(t.run(`resPrevMonth('2026-01')`), '2025-12');
});

// ---------- V74 ----------
const setFee = (t, n, fee, opening = 0) => t.run(`lsSet('tr_payments', Object.assign(getPaymentsData(), {${J(n)}:{monthlyFee:${fee},openingBalance:${opening},payments:[]}}))`);
test('R03/V74 due = fee + charges − discounts − payments, voided adjustments ignored', () => {
  const t = make(); setFee(t, 'Rimi', 1500); const mk = t.run('currentMonthKey()');
  t.store.tr_adjust = [{ id: 'a', student: 'Rimi', monthKey: mk, kind: 'discount', amount: 300, reason: 'x' }, { id: 'b', student: 'Rimi', monthKey: mk, kind: 'charge', amount: 100, reason: 'y' }, { id: 'c', student: 'Rimi', monthKey: mk, kind: 'discount', amount: 999, reason: 'z', voided: true }];
  assert.equal(t.run(`getStudentDueForMonth('Rimi', currentMonthKey())`), 1300);
  t.run(`addPayment('Rimi',500,currentMonthKey(),'',false,'Cash')`); assert.equal(t.run(`getStudentDueForMonth('Rimi', currentMonthKey())`), 800);
});
test('discount larger than fee never makes negative due', () => {
  const t = make(); setFee(t, 'Rimi', 500); t.store.tr_adjust = [{ id: 'a', student: 'Rimi', monthKey: t.run('currentMonthKey()'), kind: 'discount', amount: 900, reason: 'x' }];
  assert.equal(t.run(`getStudentDueForMonth('Rimi', currentMonthKey())`), 0);
  assert.equal(t.run(`feeStatementPure(500,[{kind:'discount',amount:900}],0).clamped`), true);
});
test('R04 same ref twice = one payment; reversed ref still blocked; soft duplicate warning', () => {
  const t = make(); setFee(t, 'Rimi', 1000);
  assert.ok(t.run(`addPayment('Rimi',300,currentMonthKey(),'',false,'bKash','TRX1')`));
  assert.equal(t.run(`addPayment('Rimi',300,currentMonthKey(),'',false,'bKash','TRX1')`), null);
  assert.equal(t.run(`getStudentPayment('Rimi').payments.length`), 1);
  assert.equal(t.run(`payLooksDuplicate('Rimi',300,currentMonthKey(),'bKash')`), true);
  const id = t.run(`getStudentPayment('Rimi').payments[0].id`); t.run(`deletePayment('Rimi','${id}','ভুল')`);
  assert.equal(t.run(`addPayment('Rimi',300,currentMonthKey(),'',false,'bKash','TRX1')`), null);
});
test('payment reversal keeps history and can be restored (opening balance too)', () => {
  const t = make(); setFee(t, 'Rimi', 1000, 600); t.run(`addPayment('Rimi',200,null,'',true,'Cash')`);
  assert.equal(t.store.tr_payments.Rimi.openingBalance, 400);
  const id = t.store.tr_payments.Rimi.payments[0].id; t.run(`deletePayment('Rimi','${id}','ভুল')`);
  assert.equal(t.store.tr_payments.Rimi.openingBalance, 600); assert.equal(t.store.tr_payments.Rimi.voided.length, 1); assert.ok(t.store.tr_tombstones['pay:' + id]);
  assert.equal(t.run(`restorePayment('Rimi','${id}')`), true); assert.equal(t.store.tr_payments.Rimi.openingBalance, 400); assert.equal(t.store.tr_payments.Rimi.voided.length, 0); assert.ok(!t.store.tr_tombstones['pay:' + id]);
});
test('R05 reconciliation: report totals match per-student ledger; adjustments included', () => {
  const t = make(); setFee(t, 'Rimi', 1000); t.run(`lsSet('tr_payments', Object.assign(getPaymentsData(), {Karim:{monthlyFee:2000,openingBalance:0,payments:[]}}))`);
  t.run(`addPayment('Rimi',400,currentMonthKey(),'',false,'Cash')`); t.store.tr_adjust = [{ id: 'a', student: 'Karim', monthKey: t.run('currentMonthKey()'), kind: 'discount', amount: 500, reason: 'x' }];
  const c = t.run(`feeCheck(currentMonthKey())`); assert.equal(c.ok, true); assert.equal(c.totals.expected, 2500); assert.equal(c.totals.collected, 400); assert.equal(c.totals.due, 2100);
});
test('R07 absence streak counts classes, skips cancelled/rescheduled/excused/holidays', () => {
  const t = make(); const att = { '2026-10-01|1|Rimi': 'present', '2026-10-02|1|Rimi': 'absent', '2026-10-03|1|Rimi': 'cancelled', '2026-10-04|1|Rimi': 'absent', '2026-10-05|1|Rimi': 'resched', '2026-10-06|1|Rimi': 'excused', '2026-10-07|1|Rimi': 'absent' };
  assert.equal(t.run(`absenceStreakOf(${J(att)},'Rimi')`), 3);
  assert.equal(t.run(`absenceStreakOf(${J(att)},'Rimi',(d)=>d==='2026-10-07')`), 2);
  assert.equal(t.run(`absenceStreakOf(${J(Object.assign({}, att, { '2026-10-08|1|Rimi': 'late' }))},'Rimi')`), 0);
});
test('R06 routine conflict: same student blocks, busy slot / off day warn', () => {
  const t = make(); const c = i => t.run(`routineConflictFrom(${J(i)})`);
  assert.equal(c({ name: 'Rimi', here: ['Rimi'] }).level, 'block'); assert.equal(c({ name: 'Rimi', here: ['Karim'] }).level, 'warn');
  assert.equal(c({ name: 'Rimi', here: [], dayOff: true }).level, 'warn'); assert.equal(c({ name: 'Rimi', here: [] }).level, 'ok');
});

// ---------- V75 ----------
const D = (o) => { const d = {}; Object.keys(o).forEach(k => d[k] = J(o[k])); return d; };
test('R12 corrupt / future / tampered backups are rejected before any change', () => {
  const t = make(); const keys = ['tr_notes', 'tr_payments'];
  const prob = (p, size) => t.run(`bkProblems(${J(p)}, ${J(keys)}, 75, ${size || 0})`);
  assert.ok(prob({ data: { tr_notes: '{bad' } }).fatal.length); assert.ok(prob({}).fatal.length); assert.ok(prob({ data: {} }).fatal.length);
  assert.ok(prob({ schema: 99, data: D({ tr_notes: {} }) }).fatal.some(x => /নতুন সংস্করণ/.test(x)));
  assert.ok(prob({ data: D({ tr_notes: {} }) }, 30e6).fatal.some(x => /বড়/.test(x)));
  const data = D({ tr_notes: { a: 1 } }), cs = t.run(`bkChecksum(${J(data)})`);
  assert.equal(prob({ schema: 75, checksum: cs, data }).fatal.length, 0);
  assert.ok(prob({ schema: 75, checksum: cs, data: D({ tr_notes: { a: 2 } }) }).fatal.some(x => /চেকসাম/.test(x)));
  assert.ok(prob({ data }).warn.some(x => /পুরোনো/.test(x)));
});
test('R11 restore preview counts added/removed/changed', () => {
  const t = make(); const cur = D({ tr_attendance: { a: 'present', b: 'absent' }, tr_expenses: [{ id: 1, amount: 5 }] }), next = D({ tr_attendance: { a: 'absent', c: 'present' }, tr_expenses: [] });
  const d = t.run(`bkDiff(${J(cur)}, ${J(next)})`), att = d.rows.find(r => r.key === 'tr_attendance'), exp = d.rows.find(r => r.key === 'tr_expenses');
  assert.deepEqual([att.added, att.removed, att.changed], [1, 1, 1]); assert.equal(exp.removed, 1);
});
test('R14/R15 merge: union, conflicts reported, local/theirs choice, tombstones stop resurrection', () => {
  const t = make();
  const cur = D({ tr_attendance: { x: 'present', y: 'absent' }, tr_tombstones: { 'att:gone': Date.now() }, tr_expenses: [{ id: 'e1', amount: 10 }], tr_receiptSeq: 5 });
  const next = D({ tr_attendance: { x: 'absent', z: 'late', gone: 'present' }, tr_tombstones: {}, tr_expenses: [{ id: 'e1', amount: 10 }, { id: 'e2', amount: 20 }], tr_receiptSeq: 9 });
  let m = t.run(`bkMerge(${J(cur)}, ${J(next)}, {conflict:'local'})`); const att = JSON.parse(m.data.tr_attendance);
  assert.equal(att.x, 'present'); assert.equal(att.z, 'late'); assert.equal(att.y, 'absent'); assert.ok(!('gone' in att));
  assert.equal(m.conflicts.length, 1); assert.equal(JSON.parse(m.data.tr_expenses).length, 2); assert.equal(JSON.parse(m.data.tr_receiptSeq), 9);
  m = t.run(`bkMerge(${J(cur)}, ${J(next)}, {conflict:'theirs'})`); assert.equal(JSON.parse(m.data.tr_attendance).x, 'absent');
  const again = t.run(`bkMerge(${J(m.data)}, ${J(next)}, {conflict:'theirs'})`); assert.equal(J(JSON.parse(again.data.tr_attendance)), J(JSON.parse(m.data.tr_attendance)));   // দ্বিতীয়বার মার্জে কিছু বদলায় না
});
test('merge payments: union by id, no double-count, voided wins, opening balance recomputed', () => {
  const t = make(); const P = (o) => Object.assign({ monthlyFee: 1000, openingBalance: 600, payments: [] }, o);
  const p1 = { id: 'p1', amount: 300, monthKey: '2026-10' }, p2 = { id: 'p2', amount: 200, monthKey: 'opening' }, p3 = { id: 'p3', amount: 100, monthKey: '2026-10' };
  const cur = D({ tr_payments: { Rimi: P({ openingBalance: 600, payments: [p1, p3] }) } });
  const next = D({ tr_payments: { Rimi: P({ openingBalance: 400, payments: [p1, p2], voided: [p3] }) } });
  const m = t.run(`bkMerge(${J(cur)}, ${J(next)}, {})`), r = JSON.parse(m.data.tr_payments).Rimi;
  assert.deepEqual(r.payments.map(p => p.id).sort(), ['p1', 'p2']); assert.equal(r.openingBalance, 400); assert.equal(r.voided.length, 1);
  assert.equal(m.conflicts.length, 0);
  const diffFee = D({ tr_payments: { Rimi: P({ monthlyFee: 1200, payments: [p1] }) } });
  assert.equal(t.run(`bkMerge(${J(cur)}, ${J(diffFee)}, {})`).conflicts.some(c => c.label === 'মাসিক ফি'), true);
});
test('student profile merge fills empty fields, flags real differences', () => {
  const t = make(); const cur = D({ tr_students: { Rimi: { klass: '৮', school: '' } } }), next = D({ tr_students: { Rimi: { klass: '৯', school: 'ক স্কুল', address: 'ঢাকা' } } });
  const m = t.run(`bkMerge(${J(cur)}, ${J(next)}, {conflict:'local'})`), s = JSON.parse(m.data.tr_students).Rimi;
  assert.equal(s.school, 'ক স্কুল'); assert.equal(s.address, 'ঢাকা'); assert.equal(s.klass, '৮'); assert.equal(m.conflicts.length, 1);
});
test('tombAdd / tombClear / prune', () => {
  const t = make(); t.run(`tombAdd('pay','1')`); assert.ok(t.store.tr_tombstones['pay:1']); t.run(`tombClear('pay','1')`); assert.ok(!('pay:1' in t.store.tr_tombstones));
  assert.equal(Object.keys(t.run(`tombPrune({'a:1':1,'b:2':${Date.now()}})`)).length, 1);
});
