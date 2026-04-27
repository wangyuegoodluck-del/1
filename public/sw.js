// 这个 Service Worker 已停用，并会自动清理缓存并注销自己
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
        return self.registration.unregister();
    }).then(() => {
        return self.clients.claim();
    })
  );
});
