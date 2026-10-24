// Service worker — PWA + offline app-shell.
// HTML: tarmoq birinchi, offline bo'lsa keshdagi '/' (SPA). /assets/* (hash'li JS/CSS): kesh birinchi.
// Google Fonts: stale-while-revalidate. API (/api) — keshlanmaydi (ma'lumotni useApi localStorage'da saqlaydi).
const CACHE = 'sa-cache-v2';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.add('/')).catch(() => {}).then(() => self.skipWaiting()),
  );
});

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

function put(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Shriftlar — stale-while-revalidate
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => put(req, res)).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  // Hash'li build fayllari — o'zgarmas: kesh birinchi
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))),
    );
    return;
  }

  // Qolgan (HTML navigatsiya, manifest, ikonlar): tarmoq birinchi, offline'da keshdan / app-shell
  e.respondWith(
    fetch(req)
      .then((res) => put(req.mode === 'navigate' ? '/' : req, res))
      .catch(() =>
        caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : Response.error())),
      ),
  );
});
