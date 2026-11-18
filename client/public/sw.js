// Service worker, scoped to the app's base path (/movie-night/) so it never
// intercepts other apps sharing the same host (e.g. other apps on anguspi).
//
// Strategy: network-first for navigations, so a freshly deployed version always
// wins; falls back to a cached app shell when offline. (The app is an SPA, so
// every route resolves to the same index.html shell.)
//
// Cache names: Cache Storage is shared by EVERY app on the same web address, not
// just this one (on anguspi that includes the care site at /colette/, whose
// offline pages matter). So when a new version activates it must only tidy up
// caches this app created, i.e. names starting with CACHE_PREFIX. Until v2 it
// deleted everything except its own cache, which wiped other apps' offline pages
// whenever this app updated. The bump from v1 to v2 exists so installed copies
// pick up this corrected worker.

const CACHE_PREFIX = 'movie-night-';
const CACHE = `${CACHE_PREFIX}v2`;
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
      .then((keys) =>
        Promise.all(
          keys
            // Only our own old caches. Never another app's (see the note at the top).
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
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
