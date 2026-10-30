// The AI layer on the phone: names/phones never leave, answers get the real names back, the tool loop works, errors are friendly.
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
  const start = src.search(new RegExp('^function ' + name + '\\(', 'm')); if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
function grabConst(name) { const start = src.search(new RegExp('^const ' + name + '=', 'm')), eol = src.indexOf('\n', start); if (src.slice(start, eol).trimEnd().endsWith(';')) return src.slice(start, eol); const m = /\n[\]}];/.exec(src.slice(start)); return src.slice(start, start + m.index + 3); }
const ctx = vm.createContext({ Math, Number, String, Array, Object, Set, JSON, RegExp });
vm.runInContext([grabConst('AI_PHONE_CAND'), grabFn('aiScrubPhones'), grabFn('aiTokenMap'), grabFn('aiEsc'), grabFn('aiScrub'), grabFn('aiRestore'), grabConst('AI_TONES'), grabFn('aiPolishSystem'), grabFn('aiBlocks'), grabConst('AI_ERR'), grabFn('aiErrText')].join('\n'), ctx);
const ev = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));

test('privacy filter: names (longest first, special characters) and BD mobile numbers go; money, dates and plain numbers stay; round trip restores', () => {
  const names = ['রাকিব', 'রাকিব হোসেন', 'মিসেস করিম (মা)', 'Anik+Das', 'নাম.১'];
  const t = 'রাকিব হোসেন আর রাকিব, মিসেস করিম (মা), Anik+Das ও নাম.১ — ফোন 01712345678, +8801812-345678, ০১৯১২৩৪৫৬৭৮, 88 01512 345678। ৳১,৫০০ বাকি, তারিখ 2026-10-24, ২০২৬-১০-২৪, ফি ১২০০০ ২০০০০।';
  const s = ev(`(function(){ const m=aiTokenMap(${JSON.stringify(names)}); return {m, out:aiScrub(${JSON.stringify(t)}, m)}; })()`);
  assert.ok(!/রাকিব|করিম|Anik|নাম\.১/.test(s.out), 'no name survives: ' + s.out);
  assert.ok(!/0171|01812|01912|01512|০১৯১/.test(s.out) && (s.out.match(/\[ফোন\]/g) || []).length === 4, 'four phones removed: ' + s.out);
  assert.ok(s.out.includes('৳১,৫০০') && s.out.includes('2026-10-24') && s.out.includes('২০২৬-১০-২৪') && s.out.includes('১২০০০ ২০০০০'), 'money/dates/plain numbers untouched: ' + s.out);
  assert.ok(s.out.includes(s.m.fwd['রাকিব হোসেন']) && s.m.fwd['রাকিব হোসেন'] !== s.m.fwd['রাকিব'], 'the longer name wins over its prefix');
  const back = ev(`aiRestore(${JSON.stringify(s.out)}, ${JSON.stringify(s.m)})`);
  assert.ok(back.includes('রাকিব হোসেন আর রাকিব') && back.includes('মিসেস করিম (মা)') && back.includes('Anik+Das') && back.includes('নাম.১'), back);
  // 11+ tokens: "ছাত্র-1" must not corrupt "ছাত্র-10"
  const many = Array.from({ length: 12 }, (_, i) => 'ছাত্রনাম' + String.fromCharCode(0x0995 + i));
  const r = ev(`(function(){ const m=aiTokenMap(${JSON.stringify(many)}); const out=aiScrub(${JSON.stringify(many.join(' | '))}, m); return {out, back:aiRestore(out,m)}; })()`); assert.equal(r.back, many.join(' | '));
  assert.deepEqual(ev(`aiTokenMap([' ', '', null, 'ক', 'ক']).order`), ['ক']);
});

test('blocks, prompts and error texts', () => {
  const b = ev(`aiBlocks([{type:'text',text:'এক'},{type:'tool_use',id:'t1',name:'get_x',input:{}},{type:'text',text:'দুই'}])`); assert.equal(b.text, 'এক\nদুই'); assert.equal(b.toolUses.length, 1); assert.deepEqual(ev(`aiBlocks(null)`), { text: '', toolUses: [] });
  const sys = ev(`aiPolishSystem('firm', 100)`); assert.ok(sys.includes('দৃঢ়') && sys.includes('170') && sys.includes('ONLY the message'));
  assert.ok(ev(`aiErrText('cap')`).includes('সীমা')); assert.ok(ev(`aiErrText('http_404')`).includes('ডিপ্লয়')); assert.ok(ev(`aiErrText('weird')`).includes('weird'));
});

test('UI: polish + chat with tools through a faked AI endpoint — names and phones never sent, real names come back, errors are friendly', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    const sent = []; let script = [];
    await page.route('**/.netlify/functions/ai', route => { const body = JSON.parse(route.request().postData()); sent.push(body); const next = script.shift() || { status: 200, json: { content: [{ type: 'text', text: 'ডিফল্ট' }], stop_reason: 'end_turn' } }; route.fulfill({ status: next.status, contentType: 'application/json', body: JSON.stringify(next.json) }); });
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    const info = await page.evaluate(() => {
      document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove());
      const base = todayDateOnly(), names = getAllKnownNames(), nm = names[0], back = n => { const d = new Date(base); d.setDate(base.getDate() - n); return dateKeyStr(d); }, att = {};
      names.forEach((n, k) => { for (let i = 1; i <= 8; i++) att[back(i * 3) + '|1|' + n] = (n === nm && i % 2) ? 'absent' : 'present'; });
      localStorage.setItem('tr_attendance', JSON.stringify(att)); localStorage.setItem('tr_students', JSON.stringify({ [nm]: { guardianName: 'মিসেস করিম', guardianPhone: '01711111111' } }));
      localStorage.setItem('tr_khata', JSON.stringify([{ id: '1', person: 'রহিম সাহেব', type: 'gave', amount: 500, note: '', date: dateKeyStr(base) }]));
      return { nm };
    });
    const nm = info.nm;
    // no passcode yet → setup page, nothing sent
    await page.evaluate(() => aiChatOpen()); assert.ok((await page.evaluate(() => document.getElementById('khataModalBody').innerText)).includes('ANTHROPIC_API_KEY')); assert.equal(sent.length, 0);
    await page.evaluate(() => { closeKhataModal(); lsSet('tr_aiPass', 'sesame'); });
    // message polish
    await page.waitForTimeout(500);
    await page.evaluate(n => { smMsgPage(n, `আসসালামু আলাইকুম মিসেস করিম। ${n}-এর ফি ৳১,৫০০ বাকি। ফোন: 01711111111।`); }, nm);
    const tok = await page.evaluate(n => aiTokenMap(aiNames()).fwd[n], nm); assert.ok(tok.startsWith('ছাত্র-'));
    script = [{ status: 200, json: { content: [{ type: 'text', text: `আপনাকে সালাম। ${tok}-এর ৳১,৫০০ ফি বাকি আছে, সুবিধামতো দিয়ে দিলে ভালো হয়।` }], stop_reason: 'end_turn', remaining: { device: 70, global: 300 } } }];
    await page.evaluate(() => aiPolish('polite')); await page.waitForFunction(() => document.getElementById('aiMsgNote').innerText.includes('সাজানো হয়েছে'));
    const out = sent[0], flat = JSON.stringify(out);
    assert.ok(!flat.includes(nm) && !flat.includes('করিম') && !flat.includes('01711111111') && flat.includes('[ফোন]') && flat.includes(tok), 'only scrubbed text leaves: ' + flat);
    assert.equal(out.pass, 'sesame'); assert.ok(/^[A-Za-z0-9_-]{16,64}$/.test(out.device)); assert.equal(out.model, 'claude-haiku-5-5');
    const shown = await page.inputValue('#sm_msg'); assert.ok(shown.includes(nm + '-এর ৳১,৫০০') && !shown.includes('ছাত্র-'), 'real name restored: ' + shown);
    await page.evaluate(() => aiUndoMsg()); assert.ok((await page.inputValue('#sm_msg')).includes('মিসেস করিম'));
    // chat with a two-step tool loop
    await page.evaluate(() => { closeKhataModal(); }); await page.waitForTimeout(500); sent.length = 0;
    await page.evaluate(() => aiChatOpen());
    const t2 = await page.evaluate(n => aiSess.map.fwd[n], nm);
    script = [
      { status: 200, json: { content: [{ type: 'text', text: 'দেখছি' }, { type: 'tool_use', id: 'tu_1', name: 'list_risky_students', input: { limit: 3 } }, { type: 'tool_use', id: 'tu_2', name: 'get_overview', input: {} }], stop_reason: 'tool_use' } },
      { status: 200, json: { content: [{ type: 'text', text: `${t2} নিয়ে সবচেয়ে বেশি চিন্তা — অনুপস্থিতি বেশি।` }], stop_reason: 'end_turn', remaining: { device: 60, global: 200 } } }];
    await page.fill('#ai_q', `${nm} কেমন আছে? ফোন 01711111111`); await page.evaluate(() => aiSend());
    await page.waitForFunction(() => document.querySelectorAll('.ai-b.ai:not(.wait)').length >= 1, null, { timeout: 8000 });
    assert.equal(sent.length, 2); assert.ok(JSON.stringify(sent[0].messages).includes(t2) && !JSON.stringify(sent[0].messages).includes(nm) && !JSON.stringify(sent[0].messages).includes('01711111111'), 'question is scrubbed');
    assert.equal(sent[0].tools.length, 5); assert.ok(sent[0].system.includes('টুল'));
    const toolMsg = sent[1].messages[sent[1].messages.length - 1]; assert.equal(toolMsg.role, 'user'); assert.deepEqual(toolMsg.content.map(c => c.tool_use_id), ['tu_1', 'tu_2']);
    const results = toolMsg.content.map(c => c.content).join(' '); assert.ok(!results.includes(nm) && !results.includes('রহিম') && !results.includes('01711111111'), 'tool results carry no names/phones'); assert.ok(results.includes('"students"') && results.includes(t2));
    const answer = await page.evaluate(() => document.querySelector('.ai-b.ai:not(.wait)').innerText); assert.ok(answer.includes(nm + ' নিয়ে') && !answer.includes('ছাত্র-'), answer);
    assert.ok((await page.evaluate(() => document.getElementById('aiLeft').innerText)).includes('৬০'));
    // friendly errors
    for (const [status, code, want] of [[429, 'cap', 'সীমা'], [401, 'bad_pass', 'পাসকোড'], [503, 'not_configured', 'চালু করা হয়নি'], [504, 'slow', 'ধীরে']]) {
      script = [{ status, json: { error: code } }]; await page.fill('#ai_q', 'আবার'); await page.evaluate(() => aiSend());
      await page.waitForFunction(w => [...document.querySelectorAll('.ai-b.err')].some(e => e.innerText.includes(w)), want, { timeout: 5000 });
    }
    // the sessions's own tool runner never leaks names either
    const leak = await page.evaluate(() => JSON.stringify(['get_overview', 'list_risky_students', 'get_syllabus_status', 'get_money_summary'].map(t => aiRunTool(t, {}))) + JSON.stringify(aiRunTool('get_student', { id: aiSess.map.fwd[getAllKnownNames()[0]] })));
    assert.ok(!leak.includes(nm), 'tool outputs are name-free'); assert.ok(JSON.stringify(await page.evaluate(() => aiRunTool('get_student', { id: 'ছাত্র-999' }))).includes('error'));
    assert.equal(await page.evaluate(() => aiRunTool('get_money_summary', {}).locked), true, 'money is locked while finance is hidden');
    // offline → friendly message, no request
    sent.length = 0; await page.context().setOffline(true); await page.fill('#ai_q', 'অফলাইন'); await page.evaluate(() => aiSend());
    await page.waitForFunction(() => [...document.querySelectorAll('.ai-b.err')].some(e => e.innerText.includes('ইন্টারনেট নেই')), null, { timeout: 5000 }); assert.equal(sent.length, 0); await page.context().setOffline(false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
