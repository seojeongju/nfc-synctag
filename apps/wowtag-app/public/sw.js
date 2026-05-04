const CACHE_NAME = 'gold-synctag-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass-through: Do not cache to avoid caching issues during continuous updates
  return;
});
