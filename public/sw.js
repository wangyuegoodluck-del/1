// 这个 Service Worker 已停用，并会自动清理缓存
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// 重定向所有请求到网络
self.addEventListener('fetch', (event) => {
  return; 
});
