// Runs every 5 minutes (Netlify scheduled function). Sends:
//  1) a "class starting soon" push, `lead` minutes before each class
//  2) one "payments pending" push per day, after 12:00 noon (Bangladesh time)
// It works even when the app is closed. Each reminder is sent only once (tracked in `sent`).
import webpush from 'web-push';
import { store, dhakaNow, toBn } from '../lib/common.mjs';

export const config = { schedule: '*/5 * * * *' };

const TITLE = 'আমার টিউশন রুটিন';

export default async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { console.error('VAPID keys are not set in Netlify environment variables'); return; }
  webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const db = store();
  const { dateKey, minutes } = dhakaNow();
  const { blobs } = await db.list({ prefix: 'dev:' });

  for (const { key } of blobs) {
    const rec = await db.get(key, { type: 'json' }).catch(() => null);
    if (!rec || !rec.subscription) continue;
    const sent = rec.sent || {};
    const toSend = [];

    for (const s of rec.sessions || []) {
      if (s.date !== dateKey) continue;
      const tag = `${s.date}|${s.slotNum}`;
      if (sent[tag]) continue;
      if (minutes >= s.start - s.lead && minutes < s.start) {
        const left = Math.max(1, s.start - minutes);
        toSend.push({ tag, body: `${toBn(left)} মিনিট পরে ক্লাস — ${s.students} (${s.label})` });
      }
    }
    const dueTag = `${dateKey}|due`;
    const due = rec.dueInfo || {};
    if (!sent[dueTag] && minutes >= 720 && due.count > 0) {
      toSend.push({ tag: dueTag, body: due.hideAmounts
        ? `${toBn(due.count)} জনের পেমেন্ট বাকি আছে`
        : `${toBn(due.count)} জনের পেমেন্ট বাকি — মোট ৳${toBn(Math.round(due.totalDue))}` });
    }
    if (!toSend.length) continue;

    let gone = false;
    for (const n of toSend) {
      try {
        await webpush.sendNotification(rec.subscription, JSON.stringify({ title: TITLE, body: n.body, tag: n.tag }), { TTL: 900, urgency: 'high' });
        sent[n.tag] = true;
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) { gone = true; break; } // phone unsubscribed
        console.error('push failed', err && err.statusCode);
      }
    }
    if (gone) { await db.delete(key).catch(() => {}); continue; }

    // forget log entries older than ~3 days, then save
    Object.keys(sent).forEach((k) => { if (k.slice(0, 10) < prune(dateKey)) delete sent[k]; });
    await db.setJSON(key, { ...rec, sent });
  }
};

function prune(dateKey){
  const d = new Date(dateKey + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().slice(0, 10);
}
