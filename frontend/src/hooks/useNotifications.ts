'use client';
import { useEffect, useState } from 'react';
import {
  playMessageSound as playCentralMessageSound,
  playMissedCallSound as playCentralMissedCallSound,
  startRingtone as startCentralRingtone,
  stopRingtone as stopCentralRingtone,
  unlockAudio,
} from '../lib/sounds';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported('Notification' in window);
    if ('Notification' in window) setPermission(Notification.permission);

    // Unlock AudioContext on first user gesture (required by mobile browsers)
    const unlock = () => {
      try { unlockAudio(); } catch {}
      // Remove after first interaction
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  async function requestPermission(): Promise<boolean> {
    if (!supported) return false;
    const r = await Notification.requestPermission();
    setPermission(r);
    if (r === 'granted') {
      // S'abonner aux Push Notifications via le Service Worker
      subscribeToPush().catch(() => {});
    }
    return r === 'granted';
  }

  async function subscribeToPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const reg = await navigator.serviceWorker.ready;

      // Récupérer la clé VAPID publique depuis le backend
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
      const res = await fetch(`${backendUrl}/notifications/vapid-public-key`);
      if (!res.ok) return;
      const { key } = await res.json();
      if (!key) return;

      // Convertir la clé base64 en Uint8Array
      const vapidKey = urlBase64ToUint8Array(key);

      // Créer ou récupérer la subscription existante
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
      }

      // On passe par l'API Next.js pour récupérer la session serveur
      // et transmettre le token backend sans l'exposer côté client.
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch (e) {
      console.warn('[Push] subscription failed:', e);
    }
  }

  function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const arr = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
    return arr.buffer;
  }

  function startRingtone() {
    startCentralRingtone();
  }

  function stopRingtone() {
    stopCentralRingtone();
  }

  // ── Sons courts ──────────────────────────────────────────────────────────
  function playMessageSound() {
    playCentralMessageSound();
  }

  function playMissedCallSound() {
    playCentralMissedCallSound();
  }

  // ── Notification système ─────────────────────────────────────────────────
  function notify(title: string, opts?: {
    body?: string; icon?: string; tag?: string;
    data?: any; requireInteraction?: boolean; vibrate?: number[];
  }) {
    if (!supported || permission !== 'granted') return;
    try {
      const notificationOptions = {
        icon: opts?.icon ?? '/icons/icon-192-v20260803.png',
        badge: '/icons/icon-72-v20260803.png',
        body: opts?.body,
        tag: opts?.tag,
        data: opts?.data,
        requireInteraction: opts?.requireInteraction ?? false,
        vibrate: opts?.vibrate,
        silent: false,
      } as NotificationOptions & { vibrate?: number[] };
      const n = new Notification(title, notificationOptions);
      n.onclick = () => {
        window.focus();
        if (opts?.data?.url) window.location.href = opts.data.url;
        n.close();
      };
      return n;
    } catch {}
  }

  // ── API publique ─────────────────────────────────────────────────────────
  function notifyMessage(senderName: string, content: string, convId?: string) {
    playMessageSound();
    if (document.visibilityState === 'visible') return;
    notify(senderName, {
      body: content.length > 100 ? content.slice(0, 100) + '…' : content,
      tag: `msg-${convId ?? 'chat'}`,
      data: { url: convId ? `/chat?conv=${encodeURIComponent(convId)}` : '/chat' },
    });
  }

  function notifyIncomingCall(callerName: string, type: 'audio' | 'video', convId?: string) {
    startRingtone();
    if (document.visibilityState !== 'visible') {
      const url = convId ? `/chat?conv=${encodeURIComponent(convId)}&call=incoming` : '/chat?call=incoming';
      notify(`📞 Appel ${type === 'video' ? 'vidéo' : 'audio'} — ${callerName}`, {
        body: 'Ouvrez Oracle Messenger pour répondre.',
        tag: `incoming-call-${convId ?? 'chat'}`,
        requireInteraction: true,
        vibrate: [1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000],
        data: { url },
      });
    }
  }

  function notifyMissedCall(callerName: string) {
    stopRingtone();
    playMissedCallSound();
    notify(`📵 Appel manqué — ${callerName}`, {
      body: 'Touchez pour rappeler',
      tag: 'missed-call',
      requireInteraction: false,
      vibrate: [220, 80, 220],
      data: { url: '/chat' },
    });
  }

  return {
    permission, supported,
    requestPermission, notify,
    notifyMessage, notifyIncomingCall, notifyMissedCall,
    startRingtone, stopRingtone,
    playMessageSound, playMissedCallSound,
  };
}
