// Oracle Messenger — Service Worker v6
const CACHE_VERSION = 6;
const CACHE_NAME = `oracle-v${CACHE_VERSION}`;
const STATIC_SHELL = [
  '/', '/chat', '/install', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  // Force immediate activation — don't wait for old SW to die
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_SHELL))
      .catch(() => {}) // Don't block install if pre-cache fails
  );
});

// ── Activate: wipe ALL old caches, claim all clients immediately ──────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim()) // Take control of all open tabs immediately
      .then(() => {
        // Notify all clients that SW updated — triggers page reload if needed
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
        });
        checkStorageQuota();
      })
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Network-only for API and external requests
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Cache-first for immutable Next.js static assets (hashed filenames)
  if (url.pathname.startsWith('/_next/static/')) {
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
    return;
  }

  // Network-first with cache fallback for HTML pages
  // Inject X-PWA-Standalone header when running in standalone mode
  // so the middleware can set the pwa-installed cookie automatically
  const isStandalone = self.clients && (
    matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true
  );
  const fetchRequest = (e.request.mode === 'navigate' && isStandalone)
    ? new Request(e.request, { headers: { ...Object.fromEntries(e.request.headers), 'X-PWA-Standalone': '1' } })
    : e.request;

  e.respondWith(
    fetch(fetchRequest)
      .then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request)
          .then(cached => cached || caches.match('/'))
      )
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
      data,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? '/chat'));
});

// ── Rappels événements à l'heure exacte ──────────────────────────────────────
// Le client envoie un message 'schedule-reminder' avec { id, title, date, timestamp }
// Le SW stocke les rappels et les déclenche à l'heure exacte via setTimeout
const scheduledReminders = new Map();

self.addEventListener('message', e => {
  if (e.data?.type === 'schedule-reminder') {
    const { id, title, date, timestamp } = e.data;
    // Annuler si déjà planifié
    if (scheduledReminders.has(id)) clearTimeout(scheduledReminders.get(id));
    const delay = timestamp - Date.now();
    if (delay <= 0) return; // déjà passé
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
});

// ── Storage quota alert ───────────────────────────────────────────────────────
async function checkStorageQuota() {
  if (!navigator.storage?.estimate) return;
  try {
    const { usage = 0, quota = 1 } = await navigator.storage.estimate();
    if (((quota - usage) / quota) * 100 < 10) {
      self.registration.showNotification('Oracle Messenger — Stockage', {
        body: "Votre téléphone est presque plein. Supprimez quelques fichiers pour libérer de l'espace.",
        icon: '/icons/icon-192.png',
        tag: 'storage-warning',
        requireInteraction: true,
      });
    }
  } catch {}
}
