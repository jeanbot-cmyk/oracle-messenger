// Oracle Messenger — Service Worker v2
const CACHE_NAME = 'oracle-messenger-v2';
const STATIC_ASSETS = ['/', '/chat', '/login', '/manifest.json', '/install'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Poser le cookie pwa-installed quand l'app est lancée en standalone
self.addEventListener('message', event => {
  if (event.data === 'SET_PWA_COOKIE') {
    // Notifier tous les clients
    self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage('PWA_READY'));
    });
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/_next')) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
