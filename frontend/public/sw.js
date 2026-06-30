// Oracle Messenger — Service Worker v7
// Version liée au timestamp de build pour forcer la mise à jour instantanée
const CACHE_VERSION = 7;
const BUILD_TS = Date.now(); // change à chaque déploiement
const CACHE_NAME = `oracle-v${CACHE_VERSION}`;

const STATIC_SHELL = [
  '/', '/chat', '/install', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

// ── Install : skipWaiting immédiat ────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting(); // Activer immédiatement sans attendre
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_SHELL))
      .catch(() => {})
  );
});

// ── Activate : supprimer TOUS les anciens caches + claim immédiat ─────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      // Supprimer tous les anciens caches
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      // Prendre le contrôle de tous les clients immédiatement
      self.clients.claim(),
    ])
  );
});

// ── Fetch : network-first pour HTML, cache-first pour assets ─────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne pas intercepter les requêtes API, socket, ou externes
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io') ||
    e.request.method !== 'GET'
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // HTML pages : network-first (toujours la version fraîche)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Assets (JS, CSS, images) : cache-first avec fallback réseau
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'Oracle Messenger', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: data.tag ?? 'msg',
      requireInteraction: data.requireInteraction ?? false,
      vibrate: [100, 50, 100],
      data,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Si l'app est déjà ouverte, la mettre au premier plan
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(e.notification.data?.url ?? '/chat');
          return;
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      return self.clients.openWindow(e.notification.data?.url ?? '/chat');
    })
  );
});

// ── Rappels événements à l'heure exacte ──────────────────────────────────────
const scheduledReminders = new Map();

self.addEventListener('message', e => {
  if (e.data?.type === 'schedule-reminder') {
    const { id, title, date, timestamp } = e.data;
    if (scheduledReminders.has(id)) clearTimeout(scheduledReminders.get(id));
    const delay = timestamp - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => {
      self.registration.showNotification(`📅 Rappel : ${title}`, {
        body: `Événement prévu le ${date}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: `reminder-${id}`,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { url: '/tools?tab=events' },
      });
      scheduledReminders.delete(id);
    }, delay);
    scheduledReminders.set(id, timer);
  }

  if (e.data?.type === 'cancel-reminder') {
    const { id } = e.data;
    if (scheduledReminders.has(id)) {
      clearTimeout(scheduledReminders.get(id));
      scheduledReminders.delete(id);
    }
  }

  // Force update : le client demande au SW de se mettre à jour
  if (e.data?.type === 'force-update') {
    self.skipWaiting();
  }
});

// ── Storage quota alert ───────────────────────────────────────────────────────
async function checkStorageQuota() {
  if (!navigator.storage?.estimate) return;
  try {
    const { usage = 0, quota = 1 } = await navigator.storage.estimate();
    if (((quota - usage) / quota) * 100 < 10) {
      self.registration.showNotification('Oracle Messenger — Stockage', {
        body: "Votre téléphone est presque plein. Supprimez quelques fichiers.",
        icon: '/icons/icon-192.png',
        tag: 'storage-warning',
        requireInteraction: true,
      });
    }
  } catch {}
}
