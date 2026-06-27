// Oracle Messenger — Service Worker
const CACHE_NAME = 'oracle-messenger-v1';
const STATIC_ASSETS = ['/', '/chat', '/login', '/manifest.json'];

// Installation — mise en cache des assets statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activation — nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — stratégie Network First pour les API, Cache First pour les assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API → toujours réseau
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    return;
  }

  // Assets statiques → Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached ?? new Response('Offline', { status: 503 }));
    })
  );
});

// Notifications push
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Oracle Messenger', {
      body:    data.body ?? '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-72.png',
      image:   data.image,
      data:    data.url ? { url: data.url } : undefined,
      vibrate: [200, 100, 200],
      tag:     data.tag ?? 'oracle-msg',
      renotify: true,
    })
  );
});

// Clic sur notification → ouvrir l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/chat';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => c.url.includes('/chat'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
