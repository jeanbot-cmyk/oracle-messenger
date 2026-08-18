'use client';
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getSession } from 'next-auth/react';
import { BACKEND_URL } from '../lib/config';
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
  const nativePushRegisteredRef = useRef(false);
  const activeCallNotificationRef = useRef<Notification | null>(null);

  async function saveSubscription(subscription: any) {
    const session = await getSession().catch(() => null);
    const backendToken = (session?.user as any)?.backendToken;
    if (backendToken) {
      const res = await fetch(`${BACKEND_URL}/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendToken}`,
        },
        body: JSON.stringify(subscription),
      });
      if (res.ok) return;
    }

    const fallback = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
    if (!fallback.ok) throw new Error('Push subscription backend save failed');
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported('Notification' in window || Capacitor.isNativePlatform());
    if (Capacitor.isNativePlatform()) {
      PushNotifications.checkPermissions()
        .then(result => {
          const granted = result.receive === 'granted';
          setPermission(granted ? 'granted' : 'default');
          if (granted) subscribeToNativePush().catch(() => {});
        })
        .catch(() => {});
    } else if ('Notification' in window) {
      setPermission(Notification.permission);
      if (Notification.permission === 'granted') subscribeToPush().catch(() => {});
    }

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
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CALL_SYNC') stopRingtone();
    };
    navigator.serviceWorker?.addEventListener?.('message', onServiceWorkerMessage);
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      navigator.serviceWorker?.removeEventListener?.('message', onServiceWorkerMessage);
    };
  }, []);

  async function requestPermission(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await PushNotifications.requestPermissions();
        const granted = result.receive === 'granted';
        setPermission(granted ? 'granted' : 'denied');
        if (granted) await subscribeToNativePush();
        return granted;
      } catch (error) {
        console.warn('[Push] native permission failed:', error);
        return false;
      }
    }
    if (!supported || !('Notification' in window)) return false;
    const r = await Notification.requestPermission();
    setPermission(r);
    if (r === 'granted') {
      // S'abonner aux Push Notifications via le Service Worker
      subscribeToPush().catch(() => {});
    }
    return r === 'granted';
  }

  async function subscribeToNativePush() {
    if (!Capacitor.isNativePlatform()) return;
    if (nativePushRegisteredRef.current) return;
    nativePushRegisteredRef.current = true;
    try {
      if (Capacitor.getPlatform() === 'android') {
        await PushNotifications.createChannel({
          id: 'oracle_messenger_incoming_calls_v3',
          name: 'Appels Oracle Messenger',
          description: 'Appels audio et vidéo entrants avec sonnerie Oracle Messenger',
          importance: 5,
          visibility: 1,
          sound: 'oracle_call',
          vibration: true,
        }).catch(error => {
          console.warn('[Push] incoming call channel creation failed:', error);
        });
        await PushNotifications.createChannel({
          id: 'oracle_messenger_messages_v2',
          name: 'Messages Oracle Messenger',
          description: 'Messages et alertes Oracle Messenger',
          importance: 4,
          visibility: 1,
          sound: 'oracle_message',
          vibration: true,
        }).catch(error => {
          console.warn('[Push] message channel creation failed:', error);
        });
      }
      await PushNotifications.addListener('registration', async token => {
        await saveSubscription({
          type: 'fcm',
          token: token.value,
          platform: Capacitor.getPlatform(),
        }).catch(error => {
          console.warn('[Push] native token backend save failed:', error);
        });
      });
      await PushNotifications.addListener('registrationError', error => {
        console.warn('[Push] native registration error:', error);
      });
      await PushNotifications.addListener('pushNotificationReceived', notification => {
        const data = notification.data ?? {};
        console.info('[Push] native foreground notification received:', {
          type: data.type,
          callId: data.callId,
          tag: data.tag,
        });
        if (data.type === 'call-sync') {
          stopCentralRingtone();
        } else if (data.type === 'call') {
          startCentralRingtone();
        }
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const url = action.notification.data?.url;
        if (action.notification.data?.type === 'call') stopCentralRingtone();
        if (typeof url === 'string' && url) window.location.href = url;
      });
      await PushNotifications.register();
    } catch (error) {
      nativePushRegisteredRef.current = false;
      console.warn('[Push] native subscription failed:', error);
    }
  }

  async function subscribeToPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
      const reg = await navigator.serviceWorker.ready;

      // Récupérer la clé VAPID publique depuis le backend
      const res = await fetch(`${BACKEND_URL}/notifications/vapid-public-key`);
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

      await saveSubscription(sub.toJSON());
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
    activeCallNotificationRef.current?.close();
    activeCallNotificationRef.current = null;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.getNotifications())
        .then(notifications => notifications
          .filter(notification => String(notification.tag || '').startsWith('incoming-call-'))
          .forEach(notification => notification.close()))
        .catch(() => {});
    }
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
        icon: opts?.icon ?? '/icons/icon-192-v20260809-premium.png',
        badge: '/icons/icon-72-v20260809-premium.png',
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
    activeCallNotificationRef.current?.close();
    activeCallNotificationRef.current = null;
    startRingtone();
    if (document.visibilityState !== 'visible') {
      const url = convId ? `/chat?conv=${encodeURIComponent(convId)}&call=incoming` : '/chat?call=incoming';
      activeCallNotificationRef.current = notify(`📞 Appel ${type === 'video' ? 'vidéo' : 'audio'} — ${callerName}`, {
        body: 'Ouvrez Oracle Messenger pour répondre.',
        tag: `incoming-call-${convId ?? 'chat'}`,
        requireInteraction: true,
        vibrate: [1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000],
        data: { url },
      }) ?? null;
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
