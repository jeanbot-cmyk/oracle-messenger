// Oracle Messenger — Service Worker v4
const CACHE_NAME = 'oracle-v4';
const STATIC_SHELL = ['/', '/chat', '/install', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
  checkStorageQuota();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Network-only for API
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Cache-first for immutable Next.js static assets
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(e.request, c)); }
        return res;
      }))
    );
    return;
  }

  // Network-first with cache fallback for pages
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && url.origin === self.location.origin) {
        const c = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, c));
      }
      return res;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/')))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(data.title ?? 'Oracle Messenger', {
    body: data.body ?? '', icon: '/icons/icon-192.png', badge: '/icons/icon-72.png',
    tag: data.tag ?? 'msg', requireInteraction: data.requireInteraction ?? false, data,
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? '/chat'));
});

async function checkStorageQuota() {
  if (!navigator.storage?.estimate) return;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (((quota - usage) / quota) * 100 < 10) {
      self.registration.showNotification('Oracle Messenger — Stockage', {
        body: "Votre téléphone est presque plein. Supprimez quelques fichiers dans Oracle Messenger pour libérer de l'espace.",
        icon: '/icons/icon-192.png', tag: 'storage-warning', requireInteraction: true,
      });
    }
  } catch {}
}
