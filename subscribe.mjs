// Called by the app: saves this phone's push subscription + the next 14 days of classes.
import { store, json, validEndpoint, validDeviceId, sameOrigin, dhakaNow } from '../lib/common.mjs';

const MAX_DEVICES = Number(process.env.MAX_DEVICES || 20);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!sameOrigin(req)) return json({ error: 'origin' }, 403);
  const raw = await req.text();
  if (raw.length > 300000) return json({ error: 'too large' }, 413);

  let body;
  try{ body = JSON.parse(raw); }catch(e){ return json({ error: 'bad json' }, 400); }

  const { deviceId, subscription, sessions, dueInfo } = body || {};
  if (!validDeviceId(deviceId)) return json({ error: 'deviceId' }, 400);
  const sub = subscription && subscription.keys ? {
    endpoint: subscription.endpoint,
    keys: { p256dh: str(subscription.keys.p256dh, 200), auth: str(subscription.keys.auth, 100) },
  } : null;
  if (!sub || !validEndpoint(sub.endpoint) || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'subscription' }, 400);
  if (!Array.isArray(sessions) || sessions.length > 500) return json({ error: 'sessions' }, 400);

  // Keep only well-formed sessions, with sanitised fields.
  const clean = [];
  for (const s of sessions) {
    const start = int(s && s.start, 0, 1439), lead = int(s && s.lead, 0, 120);
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date)) || start === null || lead === null) continue;
    clean.push({ date: s.date, slotNum: str(String(s.slotNum), 20), label: str(s.label, 60), start, lead, students: str(s.students, 300) });
  }
  const due = {
    count: int(dueInfo && dueInfo.count, 0, 10000) || 0,
    totalDue: Math.max(0, Math.min(Number(dueInfo && dueInfo.totalDue) || 0, 1e9)),
    hideAmounts: !(dueInfo && dueInfo.hideAmounts === false),
  };

  const db = store();
  const key = 'dev:' + deviceId;
  const existing = await db.get(key, { type: 'json' }).catch(() => null);
  if (!existing) {
    const { blobs } = await db.list({ prefix: 'dev:' });
    if (blobs.length >= MAX_DEVICES) return json({ error: 'limit' }, 429);
  }
  // Keep the "already notified" log so re-syncing never causes the same reminder to repeat.
  const sent = existing && existing.sent ? existing.sent : {};
  await db.setJSON(key, { subscription: sub, sessions: clean, dueInfo: due, sent, updatedAt: dhakaNow().dateKey });
  return json({ ok: true });
};
