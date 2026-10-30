// 👆 The fingerprint lock: the crypto helpers, and the real WebAuthn flow in Chrome with a virtual fingerprint sensor.
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
  const start = src.search(new RegExp('^function ' + name + '\\(', 'm')); if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
const ctx = vm.createContext({ Math, Number, String, Array, Object, JSON, Uint8Array, btoa, atob, Error });
vm.runInContext(['bioB64u', 'bioFromB64u', 'bioDerToRaw', 'bioParseAuth', 'bioShouldRelock', 'bioBytesEq'].map(grab).join('\n'), ctx);
const ev = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));

test('helpers: base64url, DER→raw signature (leading zeros, short ints), authData flags, relock rule', () => {
  assert.equal(ev(`bioB64u(new Uint8Array([251,255,254,0,1]))`), '-__-AAE'); assert.deepEqual(ev(`Array.from(bioFromB64u('-__-AAE'))`), [251, 255, 254, 0, 1]);
  const r = [0x00, 0x80, ...Array(31).fill(7)], s = [5, 6];                         // r has a 0x00 pad byte (33 bytes), s is only 2 bytes
  const der = [0x30, 2 + r.length + 2 + s.length, 0x02, r.length, ...r, 0x02, s.length, ...s];
  const raw = ev(`Array.from(bioDerToRaw(new Uint8Array(${JSON.stringify(der)}), 32))`);
  assert.equal(raw.length, 64); assert.equal(raw[0], 0x80); assert.equal(raw[31], 7); assert.deepEqual(raw.slice(32, 62), Array(30).fill(0)); assert.deepEqual(raw.slice(62), [5, 6]);
  assert.throws(() => ev(`Array.from(bioDerToRaw(new Uint8Array([1,2,3]), 32))`));
  const auth = Array(32).fill(9).concat([0x05, 0, 0, 1, 2]); let p = ev(`(function(){ const x=bioParseAuth(new Uint8Array(${JSON.stringify(auth)})); return {up:x.up,uv:x.uv,counter:x.counter,len:x.rpIdHash.length}; })()`);
  assert.deepEqual(p, { up: true, uv: true, counter: 258, len: 32 }); assert.equal(ev(`bioParseAuth(new Uint8Array(${JSON.stringify(auth.slice(0, 32).concat([0x01, 0, 0, 0, 0]))})).uv`), false); assert.equal(ev(`bioParseAuth(new Uint8Array(10))`), null);
  assert.equal(ev(`bioShouldRelock(1000, 1500, 0)`), true); assert.equal(ev(`bioShouldRelock(1000, 1500, 2)`), false); assert.equal(ev(`bioShouldRelock(0, 120000, 2)`), true); assert.equal(ev(`bioShouldRelock(0, 9e12, -1)`), false); assert.equal(ev(`bioShouldRelock(null, 5, 0)`), false);
  assert.equal(ev(`bioBytesEq(new Uint8Array([1,2]), new Uint8Array([1,2]))`), true); assert.equal(ev(`bioBytesEq(new Uint8Array([1,2]), new Uint8Array([1,3]))`), false);
});

test('UI: enrol, verify, finance + Khata + app gate, auto-relock, tamper-proof, recovery — with a virtual fingerprint sensor', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 } }), page = await ctx2.newPage();
    page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
    const cdp = await ctx2.newCDPSession(page); await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const setUV = v => cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: v });
    await page.goto(`http://localhost:${srv.address().port}/index.html`);                       // localhost: a valid WebAuthn relying-party id (an IP address is not)
    await page.evaluate(() => { document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove()); localStorage.setItem('tr_khata', JSON.stringify([{ id: '1', person: 'রাকিব', type: 'gave', amount: 500, note: '', date: dateKeyStr(todayDateOnly()) }])); });
    assert.equal(await page.evaluate(() => bioSupported()), true);
    // failed fingerprint at enrolment → NOT enabled (no self-lock-out)
    await setUV(false); assert.equal(await page.evaluate(() => bioEnroll()), false); assert.equal(await page.evaluate(() => !!bioCfg() && bioCfg().on), false);
    await setUV(true); assert.equal(await page.evaluate(() => bioEnroll()), true);
    const cfg = await page.evaluate(() => bioCfg()); assert.equal(cfg.on, true); assert.equal(cfg.alg, -7); assert.ok(cfg.pk.length > 60 && cfg.id.length > 10); assert.equal(await page.evaluate(() => abNorm(lsGet('tr_abKey', '')).length), 20, 'recovery code exists');
    // verification really checks the signature
    assert.equal(await page.evaluate(() => bioVerify('t')), true);
    await setUV(false); assert.equal(await page.evaluate(() => bioVerify('t')), false, 'no fingerprint → no unlock'); await setUV(true);
    const goodPk = cfg.pk; await page.evaluate(async () => { const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); const spki = new Uint8Array(await crypto.subtle.exportKey('spki', k.publicKey)); const c = bioCfg(); c.pk = bioB64u(spki); lsSet('tr_bio', c); });
    assert.equal(await page.evaluate(() => bioVerify('t')), false, 'a signature from another key is rejected'); await page.evaluate(pk => { const c = bioCfg(); c.pk = pk; lsSet('tr_bio', c); }, goodPk);
    assert.equal(await page.evaluate(() => bioVerify('t')), true);
    // finance
    await page.evaluate(() => { financeUnlocked = false; }); await setUV(false); await page.evaluate(() => unlockFinance()); await page.waitForTimeout(400); assert.equal(await page.evaluate(() => financeUnlocked), false, 'finance stays hidden without the fingerprint');
    await setUV(true); await page.evaluate(() => unlockFinance()); await page.waitForFunction(() => financeUnlocked === true, null, { timeout: 5000 });
    // Khata
    await page.evaluate(() => { khataUnlocked = false; switchTab('khata'); }); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => khataLocked()), true); assert.ok(await page.evaluate(() => document.getElementById('khataBody').innerText.includes('আঙুলের ছাপে খোলো')));
    assert.equal(await page.evaluate(() => !!document.getElementById('kh_unlock_pin')), false, 'no PIN box when only the fingerprint is set up');
    await setUV(false); await page.evaluate(() => khBioUnlock()); await page.waitForTimeout(400); assert.equal(await page.evaluate(() => khataUnlocked), false);
    await setUV(true); await page.evaluate(() => khBioUnlock()); await page.waitForFunction(() => khataUnlocked === true, null, { timeout: 5000 });
    // auto-relock rules (time injected)
    await page.evaluate(() => { const c = bioCfg(); c.lockMin = 2; lsSet('tr_bio', c); financeUnlocked = true; khataUnlocked = true; bioOnVisibility(true, 1000); bioOnVisibility(false, 1000 + 60000); });
    assert.equal(await page.evaluate(() => financeUnlocked), true, 'back after 1 min: still unlocked (limit is 2 min)');
    await page.evaluate(() => { bioOnVisibility(true, 1000); bioOnVisibility(false, 1000 + 130000); }); assert.equal(await page.evaluate(() => financeUnlocked), false); assert.equal(await page.evaluate(() => khataUnlocked), false);
    // app gate
    await page.evaluate(() => { const c = bioCfg(); c.scope.app = true; lsSet('tr_bio', c); bioGateShow(); }); assert.equal(await page.evaluate(() => !!document.getElementById('bioGate')), true);
    await setUV(false); await page.evaluate(() => bioGateGo()); await page.evaluate(() => bioGateGo()); assert.equal(await page.evaluate(() => document.getElementById('bioStuck').style.display), 'block', 'after two failures the recovery link appears'); assert.equal(await page.evaluate(() => !!document.getElementById('bioGate')), true);
    await setUV(true); await page.evaluate(() => bioGateGo()); await page.waitForFunction(() => !document.getElementById('bioGate'), null, { timeout: 5000 });
    // recovery: wrong code fails, right code switches the lock off
    await page.evaluate(() => bioGateShow()); assert.equal(await page.evaluate(() => bioRecoverOff('WRONGCODEWRONGCODE12')), false); assert.equal(await page.evaluate(() => bioCfg().on), true);
    assert.equal(await page.evaluate(() => bioRecoverOff(abFmt(lsGet('tr_abKey', '')))), true); assert.equal(await page.evaluate(() => bioCfg().on), false); assert.equal(await page.evaluate(() => !!document.getElementById('bioGate')), false);
    // off = old behaviour
    await page.evaluate(() => { khataUnlocked = false; financeUnlocked = false; unlockFinance(); }); assert.equal(await page.evaluate(() => financeUnlocked), true); assert.equal(await page.evaluate(() => khataLocked()), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
