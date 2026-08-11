// Sonneries générées via Web Audio API — aucun fichier externe requis

let ctx: AudioContext | null = null;
let ringtoneTimers: ReturnType<typeof setTimeout>[] = [];

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  return c;
}

// ── Message reçu : double bip moderne ────────────────────────────────────────
export function playMessageSound() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    playPremiumTone(c, now, 880, 0.11, 0.075, 'sine');
    playPremiumTone(c, now + 0.085, 1320, 0.16, 0.09, 'triangle');
    playPremiumTone(c, now + 0.12, 1760, 0.08, 0.035, 'sine');
  } catch {}
}

// ── Notification : bip doux montant ──────────────────────────────────────────
export function playNotificationSound() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    playPremiumTone(c, now, 587, 0.22, 0.07, 'sine');
    playPremiumTone(c, now + 0.12, 880, 0.2, 0.075, 'triangle');
    playPremiumTone(c, now + 0.24, 1175, 0.18, 0.055, 'sine');
  } catch {}
}

export function playReminderSound() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    [
      [0, 523], [0.18, 659], [0.36, 784],
      [0.76, 659], [0.94, 784], [1.12, 988],
      [1.68, 587], [1.88, 740], [2.1, 1047],
    ].forEach(([delay, freq], index) => {
      playPremiumTone(c, now + (delay as number), freq as number, index < 6 ? 0.16 : 0.26, 0.095, 'sine');
    });
    if ('vibrate' in navigator) {
      try { navigator.vibrate([500, 160, 500, 260, 800]); } catch {}
    }
  } catch {}
}

// ── Sonnerie appel entrant : motif répété ─────────────────────────────────────
let ringtoneInterval: ReturnType<typeof setInterval> | null = null;
let vibrationInterval: ReturnType<typeof setInterval> | null = null;
let outgoingToneInterval: ReturnType<typeof setInterval> | null = null;
let ringUntil = 0;

function callNativeSound(method: 'startIncomingRingtone' | 'stopIncomingRingtone') {
  try {
    const bridge = (window as any).OracleAndroid;
    const fn = bridge?.[method];
    if (typeof fn !== 'function') return false;
    fn.call(bridge);
    return true;
  } catch {
    return false;
  }
}

function playTone(
  c: AudioContext,
  start: number,
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.035);
  gain.gain.setValueAtTime(volume, start + Math.max(0.04, duration - 0.08));
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function playPremiumTone(
  c: AudioContext,
  start: number,
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  playTone(c, start, freq, duration, volume, type);
  playTone(c, start + 0.006, freq * 2, Math.max(0.08, duration * 0.72), volume * 0.18, 'sine');
  playTone(c, start + 0.012, freq / 2, duration, volume * 0.1, 'triangle');
}

function ringOnce() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;

    // Récepteur web/PWA : cadence classique type téléphone fixe.
    // Dans l'app Android native, startRingtone() délègue au MediaPlayer natif
    // pour utiliser le canal Sonnerie plutôt que le volume multimédia.
    const notes: Array<[number, number, number, number]> = [
      [0.00, 440, 0.34, 0.22],
      [0.00, 480, 0.34, 0.16],
      [0.42, 440, 0.34, 0.22],
      [0.42, 480, 0.34, 0.16],
      [0.84, 440, 0.34, 0.22],
      [0.84, 480, 0.34, 0.16],
      [1.26, 440, 0.34, 0.22],
      [1.26, 480, 0.34, 0.16],
    ];

    notes.forEach(([delay, freq, duration, volume]) => {
      const start = now + delay;
      playPremiumTone(c, start, freq, duration, volume, 'sine');
    });
  } catch {}
}

export function startRingtone() {
  stopRingtone();
  ringUntil = Date.now() + 75_000;
  const nativeStarted = callNativeSound('startIncomingRingtone');
  if (!nativeStarted) ringOnce();
  if ('vibrate' in navigator) {
    try { navigator.vibrate([900, 260, 900, 520, 900, 260, 900]); } catch {}
  }
  ringtoneInterval = setInterval(() => {
    if (Date.now() > ringUntil) {
      stopRingtone();
      return;
    }
    if (!nativeStarted) ringOnce();
  }, 5200);
  vibrationInterval = setInterval(() => {
    if (Date.now() > ringUntil) {
      stopRingtone();
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate([900, 260, 900, 520, 900, 260, 900]); } catch {}
    }
  }, 5200);
}

export function stopRingtone() {
  callNativeSound('stopIncomingRingtone');
  if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
  if (vibrationInterval) { clearInterval(vibrationInterval); vibrationInterval = null; }
  ringtoneTimers.forEach(timer => clearTimeout(timer));
  ringtoneTimers = [];
  ringUntil = 0;
  if ('vibrate' in navigator) {
    try { navigator.vibrate(0); } catch {}
  }
}

function outgoingToneOnce() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    // Appelant : ringback distinct, cadence d'attente, jamais une sonnerie entrante.
    const notes: Array<[number, number, number, number]> = [
      [0.00, 425, 0.46, 0.032],
      [0.64, 425, 0.46, 0.032],
    ];
    notes.forEach(([delay, freq, duration, volume]) => {
      playPremiumTone(c, now + delay, freq, duration, volume, 'sine');
    });
  } catch {}
}

export function startOutgoingCallTone() {
  stopOutgoingCallTone();
  stopRingtone();
  outgoingToneOnce();
  outgoingToneInterval = setInterval(outgoingToneOnce, 3600);
}

export function stopOutgoingCallTone() {
  if (outgoingToneInterval) {
    clearInterval(outgoingToneInterval);
    outgoingToneInterval = null;
  }
}

export function playMissedCallSound() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    [0, 0.2, 0.46].forEach((delay, i) => {
      playPremiumTone(c, now + delay, 784 - i * 110, 0.16 + i * 0.04, 0.14, 'sine');
    });
    if ('vibrate' in navigator) {
      try { navigator.vibrate([180, 90, 180]); } catch {}
    }
  } catch {}
}

// ── Appel décroché / raccroché ────────────────────────────────────────────────
export function playCallConnected() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    playTone(c, now, 880, 0.13, 0.075, 'triangle');
    playTone(c, now + 0.12, 1175, 0.2, 0.08, 'sine');
  } catch {}
}

export function playCallEnded() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    [0, 0.15, 0.3].forEach((delay, i) => {
      playTone(c, now + delay, 620 - i * 95, 0.13, 0.072, 'sine');
    });
  } catch {}
}
