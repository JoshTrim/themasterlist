'use strict';

const WORKER_VERSION = 'master-list-pwa-v2';
const ARTWORK_CACHE = 'master-list-public-artwork-v1';
const ARTWORK_PATHS = new Set(['/shows', '/artists', '/venues', '/artist', '/venue', '/show', '/overview']);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('master-list-public-artwork-') && key !== ARTWORK_CACHE).map((key) => caches.delete(key))))
  ]));
});

async function cachedArtwork(request, clientId) {
  const client = clientId ? await self.clients.get(clientId) : null;
  const pathname = client?.url ? new URL(client.url).pathname : '';
  if (!ARTWORK_PATHS.has(pathname)) return fetch(request);
  const cache = await caches.open(ARTWORK_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
  return response;
}

// Only cross-origin public artwork on profile/archive pages is cached. API
// responses, same-origin profile uploads, show media and map tiles stay out.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === 'GET' && request.destination === 'image' && url.origin !== self.location.origin) {
    event.respondWith(cachedArtwork(request, event.clientId));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'master-list:version') event.source?.postMessage({ type: 'master-list:pwa-version', version: WORKER_VERSION });
});
