'use client';
import { useEffect, useRef, useState } from 'react';

// Sonnerie via Web Audio API — pas de fichier audio requis
function createRingOscillators(ctx: AudioContext) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  osc1.type = 'sine'; osc1.frequency.value = 880;
  osc2.type = 'sine'; osc2.frequency.value = 1100;
  gain.gain.value = 0.25;
  osc1.connect(gain); osc2.connect(gain);
  gain.connect(ctx.destination);
  return [osc1, osc2];
}

function playBip(ctx: AudioContext, freq = 1000, duration = 0.25, vol = 0.35) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + duration);
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const ringOscs = useRef<OscillatorNode[]>([]);
  const ringTimer = useRef<NodeJS.Timeout | null>(null);
  const ringAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported('Notification' in window);
    if ('Notification' in window) setPermission(Notification.permission);

    // Unlock AudioContext on first user gesture (required by mobile browsers)
    const unlock = () => {
      try {
        if (!ctxRef.current) {
          ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
      } catch {}
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

  function ctx(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }

  async function requestPermission(): Promise<boolean> {
    if (!supported) return false;
    const r = await Notification.requestPermission();
    setPermission(r);
    return r === 'granted';
  }

  // ── Sonnerie appel entrant (boucle) ──────────────────────────────────────
  function startRingtone() {
    try {
      if ('vibrate' in navigator) navigator.vibrate([600, 400, 600, 400, 600]);

      // Try HTML Audio first (most reliable on mobile)
      try {
        if (!ringAudio.current) {
          // Use a data URI for a simple beep tone — no external file needed
          ringAudio.current = new Audio(
            'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA' +
            'EAAQAAgD4AAACAPAABACAAZGF0YUoGAACBhYqFbF1fdJiVkHBZW2mSj4ZqU1Vl' +
            'iIV8ZE5QYH+CeGZQUmB8f3VlT1FffX52ZlBSXnt+dWZQUl57fnVmUFJee352Zl' +
            'BSXnt+dWZQUl57fnVmUFJee352ZlBSXnt+dWZQUl57fnVmUFJee352ZlBSXnt+' +
            'dWZQUl57fnVmUFJee352ZlBSXnt+dWZQUl57fnVmUFJee352ZlBSXnt+dWZQUl' +
            '57fnVmUFJee352ZlBSXnt+dWZQUl57fnVmUFJee352ZlBSXnt+dWZQUl57fnVm' +
            'UFJee352ZlBSXnt+dWZQUl57fnVmUFJee352ZlBSXnt+dWZQUl57fnVmUFJee3' +
            '52ZlBSXnt+dWZQUl57fnVmUFJee352ZlBSXnt+dWZQUl57fnVmUFJee352ZlBS' +
            'Xnt+dWZQUl57fnVmUFJee352ZlBSXnt+dWZQUl57fnVmUFJee352ZlBSXnt+dQ=='
          );
          ringAudio.current.loop = true;
          ringAudio.current.volume = 0.8;
        }
        ringAudio.current.currentTime = 0;
        ringAudio.current.play().catch(() => {
          // Fallback to Web Audio oscillator
          startOscillatorRing();
        });
        return;
      } catch {}

      startOscillatorRing();
    } catch {}
  }

  function startOscillatorRing() {
    const ring = () => {
      try {
        const c = ctx();
        const oscs = createRingOscillators(c);
        ringOscs.current = oscs;
        oscs.forEach(o => o.start());
        setTimeout(() => { try { oscs.forEach(o => o.stop()); } catch {} }, 1400);
      } catch {}
    };
    ring();
    ringTimer.current = setInterval(() => {
      ring();
      if ('vibrate' in navigator) navigator.vibrate([600, 400, 600]);
    }, 2600);
  }

  function stopRingtone() {
    if (ringTimer.current) { clearInterval(ringTimer.current); ringTimer.current = null; }
    try { ringOscs.current.forEach(o => o.stop()); } catch {}
    ringOscs.current = [];
    try { ringAudio.current?.pause(); if (ringAudio.current) ringAudio.current.currentTime = 0; } catch {}
    if ('vibrate' in navigator) navigator.vibrate(0);
  }

  // ── Sons courts ──────────────────────────────────────────────────────────
  function playMessageSound() {
    try {
      playBip(ctx(), 1000, 0.2, 0.3);
      if ('vibrate' in navigator) navigator.vibrate(80);
    } catch {}
  }

  function playMissedCallSound() {
    try {
      const c = ctx();
      playBip(c, 880, 0.15, 0.3);
      setTimeout(() => playBip(c, 660, 0.15, 0.25), 200);
      setTimeout(() => playBip(c, 440, 0.3, 0.2), 400);
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    } catch {}
  }

  // ── Notification système ─────────────────────────────────────────────────
  function notify(title: string, opts?: {
    body?: string; icon?: string; tag?: string;
    data?: any; requireInteraction?: boolean;
  }) {
    if (!supported || permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        icon: opts?.icon ?? '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        body: opts?.body,
        tag: opts?.tag,
        data: opts?.data,
        requireInteraction: opts?.requireInteraction ?? false,
        silent: false,
      });
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
      data: { url: '/chat' },
    });
  }

  function notifyIncomingCall(callerName: string, type: 'audio' | 'video') {
    startRingtone();
    if (document.visibilityState !== 'visible') {
      notify(`📞 Appel ${type === 'video' ? 'vidéo' : 'audio'} — ${callerName}`, {
        body: 'Appuyez pour répondre',
        tag: 'incoming-call',
        requireInteraction: true,
        data: { url: '/chat' },
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
