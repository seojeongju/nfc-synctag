const CACHE_NAME = 'gold-synctag-v8';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Vite modulepreload와 SW respondWith가 겹치면 Chrome이
  // "preload not used / cross-world service worker mismatch" 경고를 냅니다.
  // script·style은 브라우저가 preload한 응답을 그대로 쓰게 둡니다.
  const dest = event.request.destination;
  if (dest === 'script' || dest === 'style' || dest === 'worker') {
    return;
  }

  // 그 외 요청만 네트워크 패스스루 (캐시 없음 → 최신 배포 반영)
  event.respondWith(fetch(event.request));
});
