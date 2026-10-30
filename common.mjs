// Shared helpers for the push-notification functions.
import { getStore } from '@netlify/blobs';

export const store = () => getStore('push-devices');

// Bangladesh has no daylight saving: always UTC+6.
export function dhakaNow(){
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0');
  return { dateKey: `${y}-${m}-${day}`, minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

const BN = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
export const toBn = (n) => String(n).replace(/[0-9]/g, (d) => BN[+d]);

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Only genuine browser push services are accepted as subscription endpoints, so this function
// can't be abused to make our server send requests to arbitrary websites.
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function validEndpoint(ep){
  try{
    const u = new URL(ep);
    return u.protocol === 'https:' && ep.length < 1000 && PUSH_HOSTS.some((re) => re.test(u.hostname));
  }catch(e){ return false; }
}

export const validDeviceId = (id) => typeof id === 'string' && /^dev_[a-z0-9]{8,60}$/.test(id);

// Browsers send an Origin header on cross-site requests; refuse anything not coming from our own site.
export function sameOrigin(req){
  const origin = req.headers.get('origin');
  if(!origin) return true;
  try{ return new URL(origin).host === new URL(req.url).host; }catch(e){ return false; }
}
