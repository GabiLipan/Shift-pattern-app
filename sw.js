/* Offline cache. Everything is precached on install, then served from the cache
 * and refreshed quietly in the background. Bump CACHE when you change files so
 * old copies are cleared. */
const CACHE = 'shifts-v1.0.0';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'i18n.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = await net;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('', { status: 504 });
    })
  );
});
