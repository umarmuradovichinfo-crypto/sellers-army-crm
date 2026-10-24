// Minimal service worker — o'rnatish (PWA) + oddiy offline.
const CACHE = 'sa-cache-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // API va boshqa origin so'rovlari — keshlanmaydi (har doim tarmoq)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) {
    return;
  }

  // Tarmoq birinchi; offline bo'lsa keshdan, navigatsiya bo'lsa '/' ga qaytadi
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || caches.match('/')),
      ),
  );
});
