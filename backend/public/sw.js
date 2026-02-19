// Basic service worker for AJ İş Takip
// This is enough to make the app installable as a PWA.

const CACHE_NAME = 'aj-istakip-cache-v4';
const OFFLINE_URLS = [
  '/',
  '/login',
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

  const url = new URL(request.url);
  
  // If root path is requested in standalone mode (PWA), redirect to /login
  // Check if this is a navigation request (not an asset)
  if (url.pathname === '/' && request.mode === 'navigate') {
    event.respondWith(
      fetch('/login', { redirect: 'follow' }).then((response) => {
        // If fetch succeeds, return the response
        if (response.ok) {
          return response;
        }
        // Otherwise try cache
        return caches.match('/login');
      }).catch(() => {
        // If fetch fails, try cache
        return caches.match('/login');
      })
    );
    return;
  }

  // For all other requests, use normal cache-first strategy
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        // Fallback to login page if request fails
        if (request.url.includes('/login')) {
          return caches.match('/login');
        }
        // For navigation requests, fallback to login
        if (request.mode === 'navigate') {
          return caches.match('/login');
        }
        return caches.match('/');
      });
    })
  );
});





