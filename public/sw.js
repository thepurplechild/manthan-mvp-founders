self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('manthan-shell-v1').then((cache) => cache.addAll([
      '/',
      '/offline.html',
      '/manifest.json'
    ]))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const apiCacheName = 'manthan-api-v1';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Network-first for APIs we can cache safely
  if (url.pathname.startsWith('/api/trends') || url.pathname.startsWith('/api/recommendations')) {
    event.respondWith((async () => {
      try {
        const net = await fetch(request);
        const resClone = net.clone();
        const cache = await caches.open(apiCacheName);
        cache.put(request, resClone);
        return net;
      } catch (e) {
        const cache = await caches.open(apiCacheName);
        const cached = await cache.match(request);
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // Cache-first for shell
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open('manthan-shell-v1');
        const cached = await cache.match('/offline.html');
        return cached || new Response('Offline', { status: 503 });
      }
    })());
  }
});

