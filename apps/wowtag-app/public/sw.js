const CACHE_NAME = 'gold-synctag-v4';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Chrome/Android 설치 가능 조건: fetch 핸들러에서 respondWith 호출 필요.
  // 캐시 없이 네트워크만 사용(항상 최신 배포 반영).
  event.respondWith(fetch(event.request));
});
