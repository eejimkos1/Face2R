const CACHE_NAME = 'face2r-v4';

const PRE_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/css/camera.css',
  '/css/admin.css',
  '/js/app.js',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/camera.js',
  '/js/recognition.js',
  '/js/confidence.js',
  '/js/ui.js',
  '/js/admin.js',
  '/js/admin-ui.js',
  '/manifest.json'
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRE_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: apply caching strategies
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // CDN requests: cache-first with network fallback
  if (url.includes('gstatic.com') || url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});
