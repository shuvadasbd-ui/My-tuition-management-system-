// Online auto-backup (v62): server handler, end-to-end encrypted round trip, offline queueing, and the weak-network service worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const root = path.join(__dirname, '..');
const ID = 'a'.repeat(40);
const mem = () => { const m = new Map(); return { m, get: async k => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); } }; };
const post = (body, extra = {}) => new Request('https://x.test/.netlify/functions/backup', { method: 'POST', headers: { 'content-type': 'application/json', ...extra.headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('server: stores ciphertext, keeps the previous copy, validates everything', async () => {
  const { handleBackup, MAX_BODY } = await import(pathToFileURL(path.join(root, 'netlify/lib/backup.mjs')).href);
  const db = mem(), blob = n => ({ v: 1, z: 1, iv: 'AAAAAAAAAAAAAAAA', data: 'x'.repeat(40) + n });
  assert.equal((await handleBackup(post({ action: 'put', id: ID, blob: blob(1) }), db)).status, 200);
  assert.equal((await handleBackup(post({ action: 'put', id: ID, blob: blob(2) }), db)).status, 200);
  const cur = await (await handleBackup(post({ action: 'get', id: ID }), db)).json();
  const prev = await (await handleBackup(post({ action: 'get', id: ID, which: 'prev' }), db)).json();
  assert.ok(cur.blob.data.endsWith('2')); assert.ok(prev.blob.data.endsWith('1'));
  assert.equal((await handleBackup(post({ action: 'get', id: 'b'.repeat(40) }), db)).status, 404);
  assert.equal((await handleBackup(post({ action: 'get', id: 'short' }), db)).status, 400);
  assert.equal((await handleBackup(post({ action: 'put', id: ID, blob: { iv: 1 } }), db)).status, 400);
  assert.equal((await handleBackup(post('{nope'), db)).status, 400);
  assert.equal((await handleBackup(post({ action: 'zzz', id: ID }), db)).status, 400);
  assert.equal((await handleBackup(new Request('https://x.test/f', { method: 'GET' }), db)).status, 405);
  assert.equal((await handleBackup(post({ action: 'get', id: ID }, { headers: { origin: 'https://evil.example' } }), db)).status, 403);
  assert.equal((await handleBackup(post('x'.repeat(MAX_BODY + 1)), db)).status, 413);
});

function startServer(handleBackup, db, state) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  return http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/.netlify/functions/backup') {
      const chunks = []; req.on('data', c => chunks.push(c));
      req.on('end', async () => {
        state.posts++;
        const r = await handleBackup(new Request('http://127.0.0.1' + u, { method: req.method, headers: { 'content-type': 'application/json' }, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), db);
        res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
      });
      return;
    }
    const f = path.join(root, u === '/' ? 'index.html' : decodeURIComponent(u));
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } setTimeout(() => { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }, state.delay); });
  }).listen(0);
}

test('browser: auto backup is encrypted, waits while offline, sends when the net returns, and restores on a new phone', { skip: !chromium && 'playwright not installed' }, async () => {
  const { handleBackup } = await import(pathToFileURL(path.join(root, 'netlify/lib/backup.mjs')).href);
  const db = mem(), state = { posts: 0, delay: 0 }, srv = startServer(handleBackup, db, state), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch(), errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(url);
    await page.evaluate(() => { localStorage.setItem('tr_khata', JSON.stringify([{ id: '1', person: 'রাকিব', type: 'gave', amount: 1500, note: '', date: '2026-10-05' }])); });
    assert.equal(await page.evaluate(() => abRun({ force: true })), true);
    const stored = [...db.m.entries()].filter(([k]) => k.startsWith('b:') && !k.endsWith(':prev'));
    assert.equal(stored.length, 1);
    assert.ok(!stored[0][1].includes('রাকিব') && !stored[0][1].includes('tr_khata'), 'server must only see ciphertext');
    assert.equal(await page.evaluate(() => abRun()), false, 'nothing changed → nothing sent');
    // offline: a change is queued, not sent
    await ctx.setOffline(true);
    const before = state.posts;
    await page.evaluate(() => { localStorage.setItem('tr_khata', JSON.stringify([{ id: '1', person: 'রাকিব', type: 'gave', amount: 2500, note: '', date: '2026-10-05' }])); });
    assert.equal(await page.evaluate(() => abRun()), false);
    assert.equal(state.posts, before);
    assert.ok((await page.evaluate(() => { openAbTest = 1; return abStatusHtml(); })).includes('অফলাইন'));
    // net returns → sent by itself
    await ctx.setOffline(false);
    await page.waitForFunction(() => abHashOf(JSON.stringify(collectBackupData())) === lsGet(AB_HASH, ''), null, { timeout: 8000 });
    assert.ok(state.posts > before);
    // a brand-new phone: only the recovery code is known
    const key = await page.evaluate(() => abFmt(lsGet(AB_KEY, '')));
    assert.match(key, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    const ctx2 = await browser.newContext(), p2 = await ctx2.newPage(); await p2.goto(url);
    const restored = await p2.evaluate(async k => {
      const nk = abNorm(k), res = await fetch(AB_URL, { method: 'POST', body: JSON.stringify({ action: 'get', id: await abIdOf(nk) }) });
      const rec = await res.json(), payload = await abUnpack(rec.blob, nk);
      let wrong = 'none'; try { await abUnpack(rec.blob, 'ABCDEFGHJKMNPQRSTUVW'); } catch (e) { wrong = 'rejected'; }
      return { valid: validateBackupPayload(payload), amount: JSON.parse(payload.data.tr_khata)[0].amount, wrong };
    }, key);
    assert.equal(restored.valid, true); assert.equal(restored.amount, 2500); assert.equal(restored.wrong, 'rejected');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('service worker: a weak connection does not leave the app hanging — cached copy opens within seconds', { skip: !chromium && 'playwright not installed' }, async () => {
  const { handleBackup } = await import(pathToFileURL(path.join(root, 'netlify/lib/backup.mjs')).href);
  const state = { posts: 0, delay: 0 }, srv = startServer(handleBackup, mem(), state), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    await page.goto(url); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1200);
    state.delay = 15000;                                                    // signal bars full, internet dead
    const t = Date.now(), p2 = await ctx.newPage(); p2.goto(url, { timeout: 30000 }).catch(() => {});
    await p2.waitForFunction(() => typeof switchTab === 'function', null, { timeout: 12000 });
    assert.ok(Date.now() - t < 10000, 'opened in ' + (Date.now() - t) + ' ms');
    await ctx.setOffline(true); state.delay = 0;
    const p3 = await ctx.newPage(); await p3.goto(url); assert.ok(await p3.evaluate(() => typeof switchTab === 'function'), 'fully offline still opens');
  } finally { await browser.close(); srv.close(); }
});
