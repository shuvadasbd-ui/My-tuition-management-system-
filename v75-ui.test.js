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


test('UI V72-75: question paper flow, results, fees screens, import-merge preview — no JS errors, no overflow', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => { document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove()); const nm = getAllKnownNames()[0]; window.__nm = nm; localStorage.setItem('tr_payments', JSON.stringify({ [nm]: { monthlyFee: 1500, openingBalance: 0, payments: [] } })); financeUnlocked = true; });
    // schema migrated on load
    assert.equal(await page.evaluate(() => lsGet('tr_schemaVer', 0)), 75);
    // V72: manual question, gate blocks print until fixed + approved
    await page.evaluate(() => { qpOpen(); qpAdd('mcq'); });
    await page.evaluate(() => { document.getElementById('qe_q').value = 'দুই আর দুই কত?'; ['১','২','৩','৪'].forEach((v, i) => document.getElementById('qe_o' + i).value = v); document.getElementById('qe_ans').value = '3'; document.getElementById('qe_marks').value = '1'; qpEditSave(qp.items[0].id); });
    assert.ok((await page.evaluate(() => document.getElementById('qpBox').innerText)).includes('পূর্ণমান'));
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; qpPrint('paper'); });
    assert.equal(await page.evaluate(() => window.__printed), 0, 'print blocked: full marks missing and not approved');
    await page.evaluate(() => { qpSetFull(1); qpApproveAll(); qpPrint('paper'); });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__printed), 1);
    assert.ok(await page.evaluate(() => !document.getElementById('qpPrintHost').innerText.includes('উত্তর')));
    await page.evaluate(() => { document.body.classList.remove('qp-printing'); document.getElementById('qpPrintHost').remove(); qpSave(); });
    assert.equal(await page.evaluate(() => lsGet('tr_qbank', []).length), 1);
    // V73
    await page.evaluate(() => { closeKhataModal(); resOpen(); document.getElementById('rs_subj').value = 'গণিত'; document.getElementById('rs_ch').value = 'অনুপাত'; document.getElementById('rs_got').value = '4'; document.getElementById('rs_full').value = '10'; resSave(); resTab('weak'); });
    assert.ok((await page.evaluate(() => document.getElementById('resBox').innerText)).includes('পর্যবেক্ষণ'));
    await page.evaluate(() => resTab('report'));
    assert.ok(await page.evaluate(() => document.getElementById('res_wa').disabled), 'share disabled until approved');
    // V74
    await page.evaluate(() => { closeKhataModal(); feeOpen(); fee.kind = 'discount'; document.getElementById('fa_amt').value = '300'; document.getElementById('fa_reason').value = 'ভাই-বোন'; feeAddAdj(); });
    assert.equal(await page.evaluate(() => getStudentDueForMonth(window.__nm, currentMonthKey())), 1200);
    await page.evaluate(() => feeRunCheck());
    assert.ok((await page.evaluate(() => document.getElementById('feeBox').innerText)).includes('হিসাব মিলেছে'));
    // V75: import preview shows diff + merge option
    await page.evaluate(() => { closeKhataModal(); const p = { app: 'tuition-routine', schema: 75, data: { tr_attendance: JSON.stringify({ '2026-01-01|1|X': 'present' }) } }; p.checksum = bkChecksum(p.data); pendingImportPayload = p; showImportPreview(p); });
    const txt = await page.evaluate(() => document.getElementById('yirBody').innerText);
    assert.ok(txt.includes('মার্জ') && txt.includes('অ্যাটেন্ডেন্স'));
    // narrow screen: no sideways overflow in any of the new screens
    for (const open of ['qpOpen()', 'resOpen()', 'feeOpen()']) {
      await page.evaluate(`closeKhataModal(); ${open}`); await page.waitForTimeout(250);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'overflow in ' + open);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
