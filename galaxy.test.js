// 🌌 ছাত্র-গ্যালাক্সি: planet layout + 3-D projection maths, and the interactive canvas in a real browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) {}
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function grab(name, kind) {
  const start = src.search(new RegExp('^' + (kind || 'function') + ' ' + name + '\\b', 'm'));
  if (start < 0) throw new Error('missing ' + name);
  if (kind === 'const') return src.slice(start, src.indexOf('\n', start));
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
const ctx = vm.createContext({ Math, Number, String, Array, Object, JSON });
vm.runInContext([grab('glxHash'), grab('GLX_BAND', 'const'), grab('glxBuild'), grab('glxProject'), grab('glxPos')].join('\n'), ctx);
const ev = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
const rows = [
  { name: 'ক', progress: 80, attendance: 95, band: 'low', sessions: 4, fee: 3000, due: false, mates: ['খ'] },
  { name: 'খ', progress: 20, attendance: 40, band: 'high', sessions: 4, fee: 1000, due: true, mates: ['ক'] },
  { name: 'গ', progress: 50, attendance: null, band: 'nodata', sessions: 1, fee: 0, due: false, mates: [] },
];

test('galaxy layout: more classes = inner ring, progress = size, risk = colour, attendance = speed, due = satellite', () => {
  const b = ev(`glxBuild(${JSON.stringify(rows)}, 'health')`), n = Object.fromEntries(b.nodes.map(x => [x.name, x]));
  assert.ok(n['ক'].r < n['গ'].r, 'inner ring for the student with most classes'); assert.equal(n['ক'].ring, n['খ'].ring);
  assert.ok(n['ক'].size > n['খ'].size, 'bigger = more progress');
  assert.equal(n['ক'].color, '#5ef2c8'); assert.equal(n['খ'].color, '#ff6b81'); assert.equal(n['গ'].color, '#8aa0ff');
  assert.ok(Math.abs(n['ক'].speed) > Math.abs(n['খ'].speed), 'better attendance orbits faster');
  assert.equal(n['খ'].sat, true); assert.equal(n['ক'].sat, false);
  assert.equal(b.rings.length, 2); assert.ok(b.rings[0] < b.rings[1]);
  assert.deepEqual(ev(`glxBuild(${JSON.stringify(rows)}, 'health')`), b, 'deterministic');
  const inc = Object.fromEntries(ev(`glxBuild(${JSON.stringify(rows)}, 'income')`).nodes.map(x => [x.name, x]));
  assert.ok(inc['ক'].size > inc['খ'].size && inc['খ'].size > inc['গ'].size, 'income mode sizes by fee');
  assert.match(ev(`glxBuild(${JSON.stringify(rows)}, 'progress')`).nodes[0].color, /^hsl\(/);
});

test('galaxy projection: centre stays centred, nearer = bigger, rotation moves points', () => {
  const cam = { rx: 0.8, ry: 0.3, zoom: 1 }, c = ev(`glxProject({x:0,y:0,z:0}, ${JSON.stringify(cam)}, 400, 600)`);
  assert.equal(Math.round(c.sx), 200); assert.equal(Math.round(c.sy), 300);
  const near = ev(`glxProject({x:0,y:0,z:-0.5}, {rx:0,ry:0,zoom:1}, 400, 600)`), far = ev(`glxProject({x:0,y:0,z:0.5}, {rx:0,ry:0,zoom:1}, 400, 600)`);
  assert.ok(near.f > far.f);
  const a = ev(`glxProject({x:0.5,y:0,z:0}, {rx:0,ry:0,zoom:1}, 400, 600)`), b = ev(`glxProject({x:0.5,y:0,z:0}, {rx:0,ry:1,zoom:1}, 400, 600)`);
  assert.notEqual(Math.round(a.sx), Math.round(b.sx));
  const p = ev(`glxPos(${JSON.stringify({ r: 0.4, a0: 0, speed: 1, phase: 0, incl: 0.1 })}, 0)`); assert.ok(Math.abs(p.x - 0.4) < 1e-9);
});

test('UI: galaxy opens, draws, a tap selects a planet and shows its card, modes switch, loop stops on close', { skip: !chromium && 'playwright not installed' }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => { document.querySelectorAll('[id*=splash],[class*=splash]').forEach(e => e.remove()); glxOpen(); });   // the intro splash would otherwise sit on top of the canvas
    await page.waitForSelector('#glxCanvas'); await page.waitForTimeout(900);
    const n = await page.evaluate(() => glx.nodes.length); assert.ok(n >= 5, 'planets: ' + n);
    assert.ok(await page.evaluate(() => { const c = document.getElementById('glxCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++; return lit > 40; }), 'canvas has glowing content');
    // tap exactly on a planet
    const pt = await page.evaluate(() => { const nd = glx.nodes.find(x => x.px > 40 && x.px < glx.W - 40 && x.py > 90 && x.py < glx.H - 160); const r = document.getElementById('glxCanvas').getBoundingClientRect(); return { x: r.left + nd.px, y: r.top + nd.py, name: nd.name }; });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForFunction(() => document.getElementById('glxHud').style.display === 'block');
    assert.ok((await page.evaluate(() => document.getElementById('glxHud').innerText)).includes(pt.name));
    await page.click('.glx-modes button[data-m="income"]');
    assert.equal(await page.evaluate(() => glx.mode), 'income'); assert.ok(await page.evaluate(() => !!glx.sel), 'selection survives mode switch');
    // dragging rotates the camera
    const ry = await page.evaluate(() => glx.cam.ry), box = await page.evaluate(() => { const r = document.getElementById('glxCanvas').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 120 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + 20, { steps: 6 }); await page.mouse.up();
    assert.notEqual(await page.evaluate(() => glx.cam.ry), ry);
    // closing the page stops the render loop
    await page.evaluate(() => { closeKhataModal(); }); await page.waitForTimeout(900);          // hidden, but the canvas is still in the DOM — the loop must stop anyway
    assert.ok(await page.evaluate(() => !!document.getElementById('glxCanvas')), 'canvas stays in the DOM after closing');
    assert.equal(await page.evaluate(() => glx.raf), 0, 'render loop stopped after the page was closed');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
