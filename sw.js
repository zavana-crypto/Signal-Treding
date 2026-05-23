const CACHE_NAME = 'zavana-v1';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    // PWA butuh fetch handler, tapi kita biarkan mengambil data terbaru dari jaringan
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});