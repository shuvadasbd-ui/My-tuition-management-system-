// AI proxy (used by netlify/functions/ai.mjs). The Anthropic API key lives ONLY in Netlify env vars — never in the app.
// This function can spend money, so it is locked down: it refuses to run without a passcode, caps requests per day
// (per device and in total), caps tokens, only forwards whitelisted fields and only allows two models.
// Kept free of @netlify/blobs imports so it can be unit-tested with a fake store and a fake fetch.
export const AI_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
export const AI_LIMITS = { body: 60000, messages: 24, payload: 50000, system: 6000, tools: 8, upstreamMs: 8500 };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function sameOrigin(req){ const o = req.headers.get('origin'); if(!o) return true; try{ return new URL(o).host === new URL(req.url).host; }catch(e){ return false; } }
function safeEq(a, b){ if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let r = 0; for(let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function sha(s){ const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

// deps: { db:{get(key,{type}),set(key,val)}, env:{ANTHROPIC_API_KEY,AI_PASSCODE,AI_DAILY_CAP,AI_DEVICE_CAP,AI_MAX_TOKENS}, fetchFn, now }
export async function handleAi(req, deps){
  const { db, env, fetchFn, now } = deps;
  if(req.method !== 'POST') return json({ error: 'method' }, 405);
  if(!sameOrigin(req)) return json({ error: 'origin' }, 403);
  if(!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503);
  if(!env.AI_PASSCODE) return json({ error: 'no_passcode' }, 503);              // never run open to the world
  const raw = await req.text(); if(raw.length > AI_LIMITS.body) return json({ error: 'too_large' }, 413);
  let b; try{ b = JSON.parse(raw); }catch(e){ return json({ error: 'bad_json' }, 400); }
  if(!b || typeof b !== 'object') return json({ error: 'bad_json' }, 400);
  if(!safeEq(String(b.pass || ''), String(env.AI_PASSCODE))) return json({ error: 'bad_pass' }, 401);
  if(typeof b.device !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(b.device)) return json({ error: 'device' }, 400);
  const model = b.model || AI_MODELS[0]; if(!AI_MODELS.includes(model)) return json({ error: 'model' }, 400);
  const msgs = b.messages;
  if(!Array.isArray(msgs) || msgs.length < 1 || msgs.length > AI_LIMITS.messages || !msgs.every(m => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content)))) return json({ error: 'messages' }, 400);
  if(JSON.stringify(msgs).length > AI_LIMITS.payload) return json({ error: 'too_large' }, 413);
  if(b.system != null && (typeof b.system !== 'string' || b.system.length > AI_LIMITS.system)) return json({ error: 'system' }, 400);
  let tools; if(b.tools != null){
    if(!Array.isArray(b.tools) || b.tools.length > AI_LIMITS.tools || !b.tools.every(t => t && typeof t.name === 'string' && /^[a-z_]{1,40}$/.test(t.name) && typeof t.description === 'string' && t.description.length <= 400 && t.input_schema && typeof t.input_schema === 'object')) return json({ error: 'tools' }, 400);
    tools = b.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  }
  const maxTokens = Math.max(1, Math.min(num(env.AI_MAX_TOKENS, 900), Math.floor(num(b.max_tokens, 600))));
  const day = new Date(now()).toISOString().slice(0, 10), gKey = 'ai:' + day + ':g', dKey = 'ai:' + day + ':d:' + await sha(b.device);
  const gCap = Math.floor(num(env.AI_DAILY_CAP, 400)), dCap = Math.floor(num(env.AI_DEVICE_CAP, 80));
  const g = Number(await db.get(gKey, { type: 'text' }).catch(() => 0)) || 0, d = Number(await db.get(dKey, { type: 'text' }).catch(() => 0)) || 0;
  if(g >= gCap) return json({ error: 'cap', which: 'global', cap: gCap }, 429);
  if(d >= dCap) return json({ error: 'cap', which: 'device', cap: dCap }, 429);
  await db.set(gKey, String(g + 1)); await db.set(dKey, String(d + 1));         // counted before the call, so failures and timeouts cannot be used to hammer the API
  const body = { model, max_tokens: maxTokens, messages: msgs }; if(b.system) body.system = b.system; if(tools && tools.length) body.tools = tools;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), AI_LIMITS.upstreamMs);
  let res; try{
    res = await fetchFn('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal, headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }catch(e){ return json({ error: 'slow' }, 504); } finally { clearTimeout(timer); }
  if(!res.ok){ const s = res.status; return json({ error: s === 401 || s === 403 ? 'upstream_auth' : (s === 429 ? 'upstream_rate' : (s === 400 ? 'upstream_bad' : 'upstream')), status: s }, s === 429 ? 429 : 502); }
  let out; try{ out = await res.json(); }catch(e){ return json({ error: 'upstream' }, 502); }
  return json({ content: Array.isArray(out.content) ? out.content : [], stop_reason: out.stop_reason || null, usage: out.usage || null, remaining: { device: Math.max(0, dCap - d - 1), global: Math.max(0, gCap - g - 1) } });
}
