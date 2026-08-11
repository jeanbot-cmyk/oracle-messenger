// Oracle Messenger — Service Worker v201
// Incrémenter cette version à chaque déploiement qui doit purger les anciens assets.
const CACHE_VERSION = '201-20260810-native-calls-icon-safe';
const CACHE_NAME = `oracle-v${CACHE_VERSION}`;
const NAVIGATION_TIMEOUT_MS = 1200;

const STATIC_SHELL = [
  '/',
  '/chat',
  '/contacts',
  '/profile',
  '/tools',
  '/business',
  '/gallery',
  '/stories',
  '/onboarding',
  '/install',
  '/reset-pwa.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icons/icon-192-v20260809-premium.png', '/icons/icon-512-v20260809-premium.png', '/icons/icon-1024-v20260809-premium.png'
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
    ]).then(() =>
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
        })
    )
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

  if (url.pathname === '/oracle-messenger.apk') {
    e.respondWith(Response.redirect('/install', 302));
    return;
  }

  if (url.pathname === '/reset-pwa.html') {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  // HTML pages : réseau rapide avec fallback cache, pour éviter les écrans blancs
  // quand le réseau mobile est lent tout en mettant le cache à jour en arrière-plan.
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      navigationResponse(e.request)
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

async function navigationFallback(request) {
  const cachedRequest = await caches.match(request);
  if (cachedRequest) return cachedRequest;
  const cachedPath = await caches.match(new URL(request.url).pathname);
  if (cachedPath) return cachedPath;
  const cachedChat = await caches.match('/chat');
  if (cachedChat) return cachedChat;
  const cachedHome = await caches.match('/');
  if (cachedHome) return cachedHome;
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oracle Messenger</title><body style="font-family:system-ui;padding:24px"><h1>Oracle Messenger</h1><p>Connexion indisponible. Les pages deja ouvertes restent consultables quand le cache est pret.</p></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request, { cache: 'no-store' })
    .then(res => {
      if (res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    });

  const timeout = new Promise(resolve => {
    setTimeout(async () => resolve(await navigationFallback(request)), NAVIGATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([network, timeout]);
  } catch {
    return navigationFallback(request);
  }
}

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  if (data.type === 'call-sync') {
    e.waitUntil(
      self.registration.getNotifications()
        .then(notifications => notifications
          .filter(notification =>
            String(notification.tag || '').startsWith('incoming-call-') ||
            (data.callId && notification.data?.callId === data.callId)
          )
          .forEach(notification => notification.close()))
        .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
        .then(clients => {
          clients.forEach(client => client.postMessage({
            type: 'CALL_SYNC',
            callId: data.callId,
            status: data.status,
          }));
        })
    );
    return;
  }
  const isCall = data.type === 'call';
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'Oracle Messenger', {
      body: data.body ?? '',
      icon: '/icons/icon-192-v20260809-premium.png',
      badge: '/icons/icon-72-v20260809-premium.png',
      tag: data.tag ?? 'msg',
      renotify: true,
      requireInteraction: data.requireInteraction ?? isCall,
      vibrate: data.vibrate ?? (isCall ? [1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000] : [120, 50, 120]),
      actions: isCall ? [{ action: 'open', title: 'Répondre' }] : undefined,
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
    const { id, title, date, timestamp, note } = e.data;
    if (scheduledReminders.has(id)) clearTimeout(scheduledReminders.get(id));
    const delay = timestamp - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => {
      self.registration.showNotification(`📅 Rappel : ${title}`, {
        body: note || `Prévu le ${date}`,
        icon: '/icons/icon-192-v20260809-premium.png',
        badge: '/icons/icon-72-v20260809-premium.png',
        tag: `reminder-${id}`,
        renotify: true,
        silent: false,
        requireInteraction: true,
        vibrate: [900, 250, 900, 450, 900],
        actions: [{ action: 'open', title: 'Ouvrir' }],
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
    e.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.skipWaiting())
    );
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
        icon: '/icons/icon-192-v20260809-premium.png',
        tag: 'storage-warning',
        requireInteraction: true,
      });
    }
  } catch {}
}
