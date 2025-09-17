const CACHE_NAME = 'todo-cache-v1';
const APP_SHELL = ["/", "/index.html", "/index.css", "/manifest.webmanifest"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k))))
  );
});

// Network falling back to cache for navigation and static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (request.method !== 'GET') return;

  // Runtime cache for GET /api/todos (stale-while-revalidate)
  if (url.pathname === '/api/todos') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      
      const networkPromise = fetch(request).then(async (resp) => {
        // const json = await resp.json();
        // console.log("networkPromise", json);
        if (resp && resp.ok) {
          await cache.put(request, resp.clone());
        }
        return resp;
      }).catch(() => undefined);

      // Prefer network, but if offline return cached
      const networkResp = await networkPromise;
      if (networkResp) return networkResp;
      if (cached) return cached;
      throw new Error('Offline and not in cache');
    })());
    return;
  }

  // App shell and static assets: network-first with cache fallback
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }
});