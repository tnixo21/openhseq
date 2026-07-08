/* OpenHSEQ service worker — offline app shell cache.
   Active only when served over http(s); ignored on file://.
   Bump CACHE when you change cached files. */
const CACHE = 'openhseq-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/css/styles.css',
  './assets/js/storage.js',
  './assets/js/auth.js',
  './assets/js/i18n.js',
  './assets/js/charts.js',
  './assets/js/app.js',
  './assets/js/settings.js',
  './assets/js/docs.js',
  './assets/js/audits.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache best-effort: don't fail install if a CDN asset can't be fetched
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => hit)
    )
  );
});
