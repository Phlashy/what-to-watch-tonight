// Service worker, scoped to the app's base path (/movie-night/) so it never
// intercepts other apps sharing the same host (e.g. other apps on anguspi).
//
// Strategy: network-first for navigations, so a freshly deployed version always
// wins; falls back to a cached app shell when offline. (The app is an SPA, so
// every route resolves to the same index.html shell.)

const CACHE = 'movie-night-v1';
const BASE = '/movie-night/';
const SHELL = BASE; // index.html is served at the base path

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle navigations (opening the app / following links).
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Keep the cached shell fresh for offline use.
        const copy = response.clone();
        caches
          .open(CACHE)
          .then((cache) => cache.put(SHELL, copy))
          .catch(() => {});
        return response;
      })
      .catch(() => caches.match(SHELL))
  );
});
