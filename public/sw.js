const CACHE_NAME = 'todo-cache-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

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


// self.addEventListener("fetch", (event) => {
//   const request = event.request;

//   // If it's an API request
//   if (request.url.includes("/api/todos")) {
//     event.respondWith(networkFirst(request));
//   } else {
//     // Handle other requests with cache-first strategy
//     event.respondWith(cacheFirst(request));
//   }
// });

// // Cache-first strategy for static files
// async function cacheFirst(request) {
//   const cached = await caches.match(request);
//   if (cached) {
//     return cached;
//   }
//   const response = await fetch(request);
//   const cache = await caches.open(CACHE_NAME);
//   cache.put(request, response.clone());
//   return response;
// }

// // Network-first strategy for API requests
// async function networkFirst(request) {
//   try {
//     console.log('request', request)
//     const response = await fetch(request);
//     console.log('fetched from network:', response);
//     const cache = await caches.open(CACHE_NAME);
//     cache.put(request, response.clone());
//     return response;
//   } catch (error) {
//     const cached = await caches.match(request);
//     if (cached) {
//       return cached;
//     }
//     return caches.match("/offline.html");
//   }
// }


