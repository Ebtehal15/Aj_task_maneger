// Basic service worker for AJ İş Takip
// This is enough to make the app installable as a PWA.

const CACHE_NAME = 'aj-istakip-cache-v2';
const OFFLINE_URLS = [
  '/',
  '/public/css/style.css',
  '/public/img/site_ikon.png',
  '/public/img/logo.jpg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => caches.match('/'));
    })
  );
});





