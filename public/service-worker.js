'use strict';

const WORKER_VERSION = 'master-list-pwa-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Installation is intentionally network-first for now. API responses, account
// state and private media must never enter a shared browser cache implicitly.
self.addEventListener('message', (event) => {
  if (event.data === 'master-list:version') event.source?.postMessage({ type: 'master-list:pwa-version', version: WORKER_VERSION });
});
