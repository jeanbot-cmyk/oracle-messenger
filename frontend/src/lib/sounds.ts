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
    [0, 0.12].forEach((delay, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 1100, now + delay);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    });
  } catch {}
}

// ── Notification : bip doux montant ──────────────────────────────────────────
export function playNotificationSound() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.linearRampToValueAtTime(990, now + 0.15);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {}
}

// ── Sonnerie appel entrant : motif répété ─────────────────────────────────────
let ringtoneInterval: ReturnType<typeof setInterval> | null = null;
let vibrationInterval: ReturnType<typeof setInterval> | null = null;
let outgoingToneInterval: ReturnType<typeof setInterval> | null = null;
let ringUntil = 0;

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

function ringOnce() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;

    // Sonnerie originale Oracle Messenger : vraie mélodie en deux phrases,
    // plus proche d'un appel entrant qu'un bip de notification.
    const notes: Array<[number, number, number, number]> = [
      [0.00, 659, 0.38, 0.28],
      [0.42, 784, 0.38, 0.30],
      [0.84, 988, 0.46, 0.30],
      [1.40, 784, 0.32, 0.24],
      [1.74, 659, 0.34, 0.24],
      [2.18, 880, 0.42, 0.29],
      [2.66, 1047, 0.54, 0.31],
    ];

    notes.forEach(([delay, freq, duration, volume]) => {
      const start = now + delay;
      playTone(c, start, freq, duration, volume, 'triangle');
      playTone(c, start, freq / 2, duration, volume * 0.12, 'sine');
    });

    // Petite percussion douce pour que ça perce mieux sur haut-parleur mobile.
    [0, 0.84, 1.74, 2.66].forEach(delay => {
      playTone(c, now + delay, 1760, 0.055, 0.08, 'square');
    });
  } catch {}
}

export function startRingtone() {
  stopRingtone();
  ringUntil = Date.now() + 75_000;
  ringOnce();
  if ('vibrate' in navigator) {
    try { navigator.vibrate([900, 250, 900, 450, 500, 900]); } catch {}
  }
  ringtoneInterval = setInterval(() => {
    if (Date.now() > ringUntil) {
      stopRingtone();
      return;
    }
    ringOnce();
  }, 3900);
  vibrationInterval = setInterval(() => {
    if (Date.now() > ringUntil) {
      stopRingtone();
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate([900, 250, 900, 450, 500, 900]); } catch {}
    }
  }, 3900);
}

export function stopRingtone() {
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
    [[0, 430], [0.18, 480]].forEach(([delay, freq]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq as number, now + (delay as number));
      gain.gain.setValueAtTime(0, now + (delay as number));
      gain.gain.linearRampToValueAtTime(0.07, now + (delay as number) + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (delay as number) + 0.22);
      osc.start(now + (delay as number));
      osc.stop(now + (delay as number) + 0.25);
    });
  } catch {}
}

export function startOutgoingCallTone() {
  stopOutgoingCallTone();
  outgoingToneOnce();
  outgoingToneInterval = setInterval(outgoingToneOnce, 2200);
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
      playTone(c, now + delay, 760 - i * 120, 0.16 + i * 0.04, 0.18, 'sine');
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
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.1);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now); osc.stop(now + 0.35);
  } catch {}
}

export function playCallEnded() {
  try {
    const c = unlockAudio();
    const now = c.currentTime;
    [0, 0.15, 0.3].forEach((delay, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600 - i * 80, now + delay);
      gain.gain.setValueAtTime(0.1, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
      osc.start(now + delay); osc.stop(now + delay + 0.15);
    });
  } catch {}
}
