export type InstallPromptEvent = Event & {
  platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

const PROMPT_KEYS = ['__installPrompt', '__pwaPrompt'];
const LOG_KEY = 'oracle-pwa-install-log';

function sendPwaInstallDiagnostic(item: Record<string, unknown>) {
  try {
    const body = JSON.stringify(item);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/pwa-diagnostic', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/pwa-diagnostic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function logPwaInstall(event: string, detail: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  try {
    const item = {
      event,
      detail,
      time: new Date().toISOString(),
      path: window.location.pathname + window.location.search,
      standalone: window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true,
      ua: navigator.userAgent,
      online: navigator.onLine,
      referrer: document.referrer || '',
    };
    const current = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    const next = Array.isArray(current) ? [...current, item].slice(-60) : [item];
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
    (window as any).__oraclePwaInstallLog = next;
    (window as any).__oraclePwaLog?.(event, detail);
    sendPwaInstallDiagnostic(item);
    console.info('[Oracle PWA install]', event, detail);
  } catch {}
}

export function getInstallPrompt(): InstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  for (const key of PROMPT_KEYS) {
    const value = (window as any)[key];
    if (value?.prompt && value?.userChoice) return value as InstallPromptEvent;
  }
  return null;
}

export function setInstallPrompt(event: InstallPromptEvent) {
  if (typeof window === 'undefined') return;
  for (const key of PROMPT_KEYS) (window as any)[key] = event;
  logPwaInstall('prompt-captured', { platforms: event.platforms || [] });
  window.dispatchEvent(new CustomEvent('oracle:pwa-prompt-ready'));
}

export function clearInstallPrompt() {
  if (typeof window === 'undefined') return;
  for (const key of PROMPT_KEYS) (window as any)[key] = null;
}

export function waitForInstallPrompt(timeoutMs = 6500): Promise<InstallPromptEvent | null> {
  const existing = getInstallPrompt();
  if (existing) return Promise.resolve(existing);
  if (typeof window === 'undefined') return Promise.resolve(null);

  return new Promise(resolve => {
    let done = false;
    const finish = (prompt: InstallPromptEvent | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('beforeinstallprompt', onPrompt as EventListener);
      window.removeEventListener('oracle:pwa-prompt-ready', onReady as EventListener);
      clearTimeout(timer);
      resolve(prompt);
    };
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
      finish(e as InstallPromptEvent);
    };
    const onReady = () => finish(getInstallPrompt());
    const timer = window.setTimeout(() => finish(getInstallPrompt()), timeoutMs);
    window.addEventListener('beforeinstallprompt', onPrompt as EventListener, { once: true });
    window.addEventListener('oracle:pwa-prompt-ready', onReady as EventListener, { once: true });
  });
}

export async function ensureServiceWorkerReady() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    logPwaInstall('service-worker-unsupported');
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await reg.update().catch(() => {});
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => setTimeout(resolve, 2500)),
    ]);
    logPwaInstall('service-worker-ready', { scope: reg.scope, active: reg.active?.state || 'none' });
    return true;
  } catch (err: any) {
    logPwaInstall('service-worker-error', { message: err?.message || String(err) });
    return false;
  }
}

export async function resetPwaInstallState() {
  if (typeof window === 'undefined') return false;
  logPwaInstall('reset-install-state-start');
  try {
    document.cookie = 'pwa-installed=; path=/; max-age=0; SameSite=Lax';
    localStorage.removeItem('oracle-client-cache-version');
    localStorage.removeItem('oracle-pwa-install-pending');
    Object.keys(sessionStorage)
      .filter(key => key.startsWith('oracle-sw-reloaded-') || key.startsWith('oracle-client-reloaded-'))
      .forEach(key => sessionStorage.removeItem(key));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
      await Promise.all(regs.map(reg => reg.unregister().catch(() => false)));
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await reg.update().catch(() => {});
    }

    logPwaInstall('reset-install-state-done');
    return true;
  } catch (err: any) {
    logPwaInstall('reset-install-state-error', { message: err?.message || String(err) });
    return false;
  }
}

export async function openInstallPrompt(prompt: InstallPromptEvent) {
  logPwaInstall('prompt-open-start', { platforms: prompt.platforms || [] });
  await prompt.prompt();
  const choice = await prompt.userChoice;
  logPwaInstall('prompt-choice', choice || {});
  clearInstallPrompt();
  return choice;
}
