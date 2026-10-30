// UI smoke tests in a real browser. Skipped automatically when Playwright isn't installed
// (to run them:  npm i -D playwright && npx playwright install chromium && npm test)
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

test('UI: khata tab shows English digits, tools menu opens, no JS errors', { skip: !chromium && 'playwright not installed' }, async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
  }).listen(0);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } }), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => {
      localStorage.setItem('tr_khata', JSON.stringify([{ id: '1', person: 'রাকিব', type: 'gave', amount: 1500, note: '', date: '2026-10-05' }]));
      switchTab('khata');
    });
    await page.waitForTimeout(400);
    const body = await page.evaluate(() => document.getElementById('khataBody').innerText);
    assert.ok(body.includes('1,500'), 'amount shown with English digits');
    assert.ok(!/[০-৯]/.test(body), 'no Bangla digits in the khata tab');
    await page.evaluate(() => khToolsMenu());
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#khataModalBody .settings-btn').length), 9);
    await page.evaluate(() => switchTab('settings'));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.set-group').length), 5);          // Settings grouped in 5
    await page.evaluate(() => switchTab('home'));
    assert.equal(await page.evaluate(() => document.getElementById('homeMore').hidden), true);           // decorative arc/booster folded away
    await page.evaluate(() => { window.__u = 0; showUndoToast('test', () => { window.__u++; }); showSuccessToast('ok'); });
    await page.waitForTimeout(300);
    await page.click('#undoToast .tt-btn');                                                              // undo works even with another toast on screen
    assert.equal(await page.evaluate(() => window.__u), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

// Layout guard: no tab or khata page may overflow sideways, on a normal (390px) and a very small (320px) phone.
test('UI: no sideways overflow on any tab at 390px and 320px', { skip: !chromium && 'playwright not installed' }, async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
  }).listen(0);
  const browser = await chromium.launch();
  try {
    for (const width of [390, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 760 } }), page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(() => localStorage.setItem('tr_onboarded', 'true'));
      await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
      await page.waitForTimeout(1500);
      for (const tab of ['home', 'schedule', 'students', 'khata', 'reports', 'settings']) {
        await page.evaluate(t => switchTab(t), tab);
        await page.waitForTimeout(300);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(over <= 0, `${tab} overflows by ${over}px at ${width}px`);
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});
