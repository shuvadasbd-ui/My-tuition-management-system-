// Online backup storage (used by netlify/functions/backup.mjs). The phone encrypts everything BEFORE sending,
// so this only ever stores ciphertext under an unguessable id. Kept free of @netlify/blobs imports so it can be unit-tested.
export const MAX_BODY = 5_800_000;           // Netlify functions accept ~6 MB request bodies
const ID_RE = /^[a-f0-9]{40}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function sameOrigin(req){
  const origin = req.headers.get('origin');
  if(!origin) return true;
  try{ return new URL(origin).host === new URL(req.url).host; }catch(e){ return false; }
}

// db needs get(key,{type:'text'}) and set(key,text) — the @netlify/blobs store has both.
export async function handleBackup(req, db){
  if(req.method !== 'POST') return json({ error: 'method' }, 405);
  if(!sameOrigin(req)) return json({ error: 'origin' }, 403);
  const raw = await req.text();
  if(raw.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let b; try{ b = JSON.parse(raw); }catch(e){ return json({ error: 'bad json' }, 400); }
  if(!b || typeof b.id !== 'string' || !ID_RE.test(b.id)) return json({ error: 'id' }, 400);
  const key = 'b:' + b.id;

  if(b.action === 'put'){
    const k = b.blob;
    if(!k || typeof k !== 'object' || typeof k.iv !== 'string' || typeof k.data !== 'string' || k.iv.length > 40 || k.data.length < 16) return json({ error: 'blob' }, 400);
    const prev = await db.get(key, { type: 'text' }).catch(() => null);
    if(prev) await db.set(key + ':prev', prev);                    // keep the one before, in case a bad upload ever replaces a good one
    const savedAt = new Date().toISOString();
    await db.set(key, JSON.stringify({ blob: { v: Number(k.v) || 1, z: k.z ? 1 : 0, iv: k.iv, data: k.data }, savedAt }));
    return json({ ok: true, savedAt });
  }
  if(b.action === 'get'){
    const t = await db.get(b.which === 'prev' ? key + ':prev' : key, { type: 'text' }).catch(() => null);
    if(!t) return json({ error: 'none' }, 404);
    return new Response(t, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  return json({ error: 'action' }, 400);
}
