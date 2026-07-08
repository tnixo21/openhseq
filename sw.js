/* OpenHSEQ — service worker DISABLED.
   The old cache-first worker served stale assets (e.g. an outdated login form).
   This version installs, wipes every cache, unregisters itself, and does NOT
   intercept fetches — so the app always loads fresh. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await self.clients.claim();
  try { await self.registration.unregister(); } catch (err) {}
})()));
// No 'fetch' handler → requests go straight to the network.
