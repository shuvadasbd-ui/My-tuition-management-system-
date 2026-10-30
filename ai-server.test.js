// The AI proxy: locked down by default, capped, whitelisted, and it never leaks the key.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'netlify/lib/ai.mjs')).href);
const mem = () => { const m = new Map(); return { m, get: async k => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); } }; };
const DEV = 'dev_0123456789abcdef';
const req = (b, h) => new Request('https://app.test/.netlify/functions/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: typeof b === 'string' ? b : JSON.stringify(b) });
const good = (o) => Object.assign({ pass: 'sesame', device: DEV, messages: [{ role: 'user', content: 'হ্যালো' }] }, o || {});
function deps(over) {
  const calls = []; const d = { db: mem(), env: { ANTHROPIC_API_KEY: 'sk-secret-key', AI_PASSCODE: 'sesame' }, now: () => Date.UTC(2026, 9, 24, 10), calls,
    fetchFn: async (url, opt) => { calls.push({ url, opt }); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ঠিক আছে' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, id: 'msg_internal', secret: 'x' }), { status: 200 }); } };
  return Object.assign(d, over || {});
}
const st = async (r) => ({ status: r.status, body: await r.json() });

test('locked down by default: needs key + passcode, right method/origin/body/passcode/device', async () => {
  const { handleAi } = await load();
  assert.equal((await handleAi(new Request('https://app.test/f', { method: 'GET' }), deps())).status, 405);
  assert.equal((await handleAi(req(good(), { origin: 'https://evil.example' }), deps())).status, 403);
  let r = await st(await handleAi(req(good()), deps({ env: { AI_PASSCODE: 'sesame' } }))); assert.equal(r.status, 503); assert.equal(r.body.error, 'not_configured');
  r = await st(await handleAi(req(good()), deps({ env: { ANTHROPIC_API_KEY: 'k' } }))); assert.equal(r.status, 503); assert.equal(r.body.error, 'no_passcode', 'must refuse to run open to the world');
  assert.equal((await handleAi(req('{nope'), deps())).status, 400);
  assert.equal((await handleAi(req('x'.repeat(60001)), deps())).status, 413);
  assert.equal((await st(await handleAi(req(good({ pass: 'wrong' })), deps()))).body.error, 'bad_pass');
  assert.equal((await st(await handleAi(req(good({ pass: undefined })), deps()))).body.error, 'bad_pass');
  assert.equal((await st(await handleAi(req(good({ device: 'x' })), deps()))).body.error, 'device');
});

test('validation: model allow-list, messages, system, tools, token cap', async () => {
  const { handleAi } = await load(); const E = async (o) => (await st(await handleAi(req(good(o)), deps()))).body.error;
  assert.equal(await E({ model: 'claude-opus-5-5' }), 'model'); assert.equal(await E({ messages: [] }), 'messages'); assert.equal(await E({ messages: [{ role: 'system', content: 'x' }] }), 'messages');
  assert.equal(await E({ messages: Array.from({ length: 25 }, () => ({ role: 'user', content: 'a' })) }), 'messages');
  assert.equal(await E({ messages: [{ role: 'user', content: 'x'.repeat(51000) }] }), 'too_large'); assert.equal(await E({ system: 'x'.repeat(6001) }), 'system');
  assert.equal(await E({ tools: [{ name: 'Bad Name!', description: 'd', input_schema: {} }] }), 'tools'); assert.equal(await E({ tools: Array.from({ length: 9 }, (_, i) => ({ name: 't' + 'a'.repeat(i), description: 'd', input_schema: { type: 'object' } })) }), 'tools');
  const d = deps(); await handleAi(req(good({ max_tokens: 99999, system: 'ছোট', model: 'claude-sonnet-5-5', tools: [{ name: 'get_x', description: 'd', input_schema: { type: 'object' }, evil: 1 }], temperature: 9, stream: true })), d);
  const sent = JSON.parse(d.calls[0].opt.body); assert.equal(sent.max_tokens, 900); assert.equal(sent.model, 'claude-sonnet-5-5'); assert.equal(sent.system, 'ছোট');
  assert.deepEqual(Object.keys(sent).sort(), ['max_tokens', 'messages', 'model', 'system', 'tools']); assert.deepEqual(Object.keys(sent.tools[0]).sort(), ['description', 'input_schema', 'name']);
  const d2 = deps({ env: { ANTHROPIC_API_KEY: 'k', AI_PASSCODE: 'sesame', AI_MAX_TOKENS: '300' } }); await handleAi(req(good({ max_tokens: 500 })), d2); assert.equal(JSON.parse(d2.calls[0].opt.body).max_tokens, 300);
});

test('forwards correctly, hides the key and internals, reports what is left today', async () => {
  const { handleAi } = await load(), d = deps(), r = await st(await handleAi(req(good()), d));
  assert.equal(r.status, 200); assert.equal(r.body.content[0].text, 'ঠিক আছে'); assert.equal(r.body.stop_reason, 'end_turn'); assert.deepEqual(r.body.remaining, { device: 79, global: 399 });
  assert.equal(r.body.id, undefined); assert.equal(r.body.secret, undefined); assert.ok(!JSON.stringify(r.body).includes('sk-secret-key'));
  assert.equal(d.calls[0].url, 'https://api.anthropic.com/v1/messages'); assert.equal(d.calls[0].opt.headers['x-api-key'], 'sk-secret-key'); assert.equal(d.calls[0].opt.headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.parse(d.calls[0].opt.body).model, 'claude-haiku-5-5');
});

test('daily caps: per device and global, reset next day; failures still count', async () => {
  const { handleAi } = await load(); let d = deps({ env: { ANTHROPIC_API_KEY: 'k', AI_PASSCODE: 'sesame', AI_DEVICE_CAP: '2', AI_DAILY_CAP: '3' } });
  assert.equal((await handleAi(req(good()), d)).status, 200); assert.equal((await handleAi(req(good()), d)).status, 200);
  let r = await st(await handleAi(req(good()), d)); assert.equal(r.status, 429); assert.equal(r.body.which, 'device'); assert.equal(d.calls.length, 2, 'blocked calls never reach the API');
  assert.equal((await handleAi(req(good({ device: 'other_device_0123456' })), d)).status, 200);
  r = await st(await handleAi(req(good({ device: 'third_device_0123456' })), d)); assert.equal(r.status, 429); assert.equal(r.body.which, 'global');
  d.now = () => Date.UTC(2026, 9, 25, 1); assert.equal((await handleAi(req(good()), d)).status, 200, 'a new day starts fresh');
  const f = deps({ fetchFn: async () => new Response('boom', { status: 500 }) }); await handleAi(req(good()), f); assert.ok([...f.db.m.values()].includes('1'), 'a failed upstream call still uses up quota');
});

test('upstream trouble maps to safe errors (no leaks): auth, rate, bad request, 5xx, timeout, junk', async () => {
  const { handleAi } = await load(); const run = async (fetchFn) => st(await handleAi(req(good()), deps({ fetchFn })));
  let r = await run(async () => new Response('{"error":{"message":"invalid x-api-key sk-secret-key"}}', { status: 401 })); assert.equal(r.status, 502); assert.equal(r.body.error, 'upstream_auth'); assert.ok(!JSON.stringify(r.body).includes('sk-secret'));
  r = await run(async () => new Response('{}', { status: 429 })); assert.equal(r.status, 429); assert.equal(r.body.error, 'upstream_rate');
  r = await run(async () => new Response('{}', { status: 400 })); assert.equal(r.body.error, 'upstream_bad'); r = await run(async () => new Response('{}', { status: 529 })); assert.equal(r.body.error, 'upstream');
  r = await run(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }); assert.equal(r.status, 504); assert.equal(r.body.error, 'slow');
  r = await run(async () => new Response('<html>', { status: 200 })); assert.equal(r.status, 502);
});
