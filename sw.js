// Service worker for "আমার টিউশন রুটিন" — enables offline use and "Install app" in Chrome.
// Bump CACHE_NAME whenever you want to force everyone's cache to refresh after a big update.
const CACHE_NAME = 'tuition-routine-v75';
const FONT_CACHE = 'tuition-fonts-v1'; // survives app updates so Bangla fonts keep working offline
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for the app's own files: when online you get a matching set of index.html + js/*.js +
// style.css (no half-old/half-new mix after an update). But on a weak connection (signal present, internet
// not really) waiting forever would leave the app stuck — so if the network has not answered within
// NET_WAIT ms and a cached copy exists, the cached copy is used (the network answer still refreshes the cache
// in the background). After one such timeout the cache is used straight away for NET_COOL ms, so a page never
// mixes old and new files. Query strings (e.g. ?go=wrap) are ignored when matching the cache, and any page
// navigation falls back to the cached index.html when nothing else works.
const NET_WAIT = 3000, NET_COOL = 30000; let slowUntil = 0;
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const host = new URL(event.request.url).hostname;
  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => cache.match(event.request).then((hit) => hit ||
        fetch(event.request).then((res) => { if (res && (res.status === 200 || res.type === 'opaque')) cache.put(event.request, res.clone()); return res; })
      ))
    );
    return;
  }
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.url.includes('/.netlify/functions/')) return; // never cache API calls

  const fromNet = () => fetch(event.request).then((response) => {
    if (response && response.status === 200 && response.type === 'basic') {
      const copy = response.clone();
      const key = new URL(event.request.url); key.search = '';
      caches.open(CACHE_NAME).then((cache) => cache.put(key.toString(), copy));
    }
    return response;
  });
  const offlineFallback = () => caches.match(event.request, { ignoreSearch: true }).then((cached) => {
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
    return Response.error();
  });
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    const net = fromNet();
    event.waitUntil(net.catch(() => {}));                         // let the cache refresh finish even if we already answered
    if (!cached) return net.catch(offlineFallback);               // nothing cached yet: the network is all we have
    if (Date.now() < slowUntil) return cached;                    // network was just too slow: stay on the cached set
    return Promise.race([
      net.catch(() => cached),
      new Promise((res) => setTimeout(() => { slowUntil = Date.now() + NET_COOL; res(cached); }, NET_WAIT)),
    ]);
  })());
});

// Tapping a notification focuses the open app and (if the push carried a ?go= link) jumps to that
// screen; otherwise it opens the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => 'focus' in c);
      if (existing) {
        const go = (event.notification.data && event.notification.data.url) ? existing.navigate(target).catch(() => existing) : Promise.resolve(existing);
        return go.then((c) => (c || existing).focus());
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// Real background push: fired by the send-reminders server function even when this app/tab
// isn't open at all, which is what lets class/payment reminders arrive on time regardless.
self.addEventListener('push', (event) => {
  let data = { title: 'আমার টিউশন রুটিন', body: 'একটা নতুন রিমাইন্ডার আছে।' };
  try { if (event.data) data = event.data.json(); } catch (e) { /* fall back to default text above */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'আমার টিউশন রুটিন', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || null },
    })
  );
});
