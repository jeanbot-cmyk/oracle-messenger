// Sonneries générées via Web Audio API — aucun fichier externe requis

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

function resume() {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  return c;
}

// ── Message reçu : double bip moderne ────────────────────────────────────────
export function playMessageSound() {
  try {
    const c = resume();
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
    const c = resume();
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

function ringOnce() {
  try {
    const c = resume();
    const now = c.currentTime;
    // Sonnerie plus longue et plus présente, adaptée aux téléphones.
    [[0, 780, 0.34], [0.22, 980, 0.32], [0.44, 780, 0.34], [0.66, 980, 0.32], [0.98, 660, 0.28], [1.2, 880, 0.30]].forEach(([delay, freq, vol]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq as number, now + (delay as number));
      gain.gain.setValueAtTime(0, now + (delay as number));
      gain.gain.linearRampToValueAtTime(vol as number, now + (delay as number) + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (delay as number) + 0.28);
      osc.start(now + (delay as number));
      osc.stop(now + (delay as number) + 0.32);
    });
  } catch {}
}

export function startRingtone() {
  stopRingtone();
  ringUntil = Date.now() + 60_000;
  ringOnce();
  if ('vibrate' in navigator) {
    try { navigator.vibrate([850, 250, 850, 700]); } catch {}
  }
  ringtoneInterval = setInterval(() => {
    if (Date.now() > ringUntil) {
      stopRingtone();
      return;
    }
    ringOnce();
  }, 1850);
  vibrationInterval = setInterval(() => {
    if (Date.now() > ringUntil) {
      stopRingtone();
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate([850, 250, 850, 700]); } catch {}
    }
  }, 2600);
}

export function stopRingtone() {
  if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
  if (vibrationInterval) { clearInterval(vibrationInterval); vibrationInterval = null; }
  ringUntil = 0;
  if ('vibrate' in navigator) {
    try { navigator.vibrate(0); } catch {}
  }
}

function outgoingToneOnce() {
  try {
    const c = resume();
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

// ── Appel décroché / raccroché ────────────────────────────────────────────────
export function playCallConnected() {
  try {
    const c = resume();
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
    const c = resume();
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
