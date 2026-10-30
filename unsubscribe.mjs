// Called by the app when notifications are switched off: forgets this phone.
import { store, json, validDeviceId, sameOrigin } from '../lib/common.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!sameOrigin(req)) return json({ error: 'origin' }, 403);
  let body;
  try{ body = JSON.parse(await req.text()); }catch(e){ return json({ error: 'bad json' }, 400); }
  if (!validDeviceId(body && body.deviceId)) return json({ error: 'deviceId' }, 400);
  await store().delete('dev:' + body.deviceId).catch(() => {});
  return json({ ok: true });
};
