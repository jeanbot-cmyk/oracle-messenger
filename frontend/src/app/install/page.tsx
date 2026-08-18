'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { buildChromeInstallIntentUrl, isInstalledAppMode, shouldOpenAndroidLinkInChrome } from '../../lib/androidChrome';
import { clearInstallPrompt, ensureServiceWorkerReady, getInstallPrompt, logPwaInstall, openInstallPrompt, setInstallPrompt, waitForInstallPrompt } from '../../lib/pwaInstall';

const ACCENT = 'var(--brand)';
const ACCENT_TEXT = 'var(--accent-text)';
const INSTALL_VERSION = '197-20260808-playstore-stability';
const INSTALL_RESET_KEY = `oracle-install-reset-${INSTALL_VERSION}`;

type Device = 'ios' | 'android' | 'other';

function detectDevice(): Device {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

function appEntry() {
  if (typeof window === 'undefined') return '/chat';
  return localStorage.getItem('oracle-after-login') || sessionStorage.getItem('oracle-after-login') || '/chat';
}

function normalizeInviteUsername(value: string) {
  try {
    return decodeURIComponent(value || '').trim().replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  } catch {
    return (value || '').trim().replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  }
}

function normalizeConferenceSlug(value: string) {
  try {
    return decodeURIComponent(value || '').trim().replace(/[^a-z0-9-_.]/gi, '');
  } catch {
    return (value || '').trim().replace(/[^a-z0-9-_.]/gi, '');
  }
}

function rememberConferenceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const slug = normalizeConferenceSlug(params.get('conference') || '');
  const nextParam = params.get('next') || '';
  const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '';
  const next = slug ? `/tools?conference=${encodeURIComponent(slug)}` : safeNext;
  if (!next) return '';
  sessionStorage.setItem('oracle-after-login', next);
  localStorage.setItem('oracle-after-login', next);
  if (slug) localStorage.setItem('oracle-pending-conference-slug', slug);
  return slug || next;
}

function rememberInviteFromUrl() {
  const from = normalizeInviteUsername(new URLSearchParams(window.location.search).get('from') || '');
  if (!from) return '';
  const next = `/contacts?from=${encodeURIComponent(from)}`;
  sessionStorage.setItem('oracle-after-login', next);
  localStorage.setItem('oracle-after-login', next);
  return from;
}

function goToAppEntry() {
  window.location.replace(appEntry());
}

function openWithoutInstall() {
  logPwaInstall('install-page-open-without-install', { entry: appEntry() });
  goToAppEntry();
}

function markInstalledAndOpenApp(source: string) {
  logPwaInstall('install-complete-open-app', { source, entry: appEntry() });
  document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
  localStorage.setItem('oracle-pwa-install-pending', '1');
  sessionStorage.removeItem('oracle-install-reload-attempted');
  setTimeout(goToAppEntry, 250);
}

function reloadOnceWhenServiceWorkerControlsPage() {
  if (!('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) return;

  const url = new URL(window.location.href);
  if (url.searchParams.get('pwaReady') === INSTALL_VERSION) return;

  navigator.serviceWorker.ready
    .then(() => {
      url.searchParams.set('pwaReady', INSTALL_VERSION);
      url.searchParams.set('t', String(Date.now()));
      window.location.replace(url.toString());
    })
    .catch(() => {});
}

async function resetInstallCacheState() {
  document.cookie = 'pwa-installed=; path=/; max-age=0; SameSite=Lax';
  localStorage.removeItem('oracle-client-cache-version');
  localStorage.removeItem('oracle-pwa-install-pending');
  sessionStorage.removeItem('oracle-install-reload-attempted');
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('oracle-sw-reloaded-'))
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
}

export default function InstallPage() {
  const [device, setDevice] = useState<Device>('android');
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [installed, setInstalled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const promptRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    setDevice(detectDevice());
    logPwaInstall('install-page-mounted', {
      version: INSTALL_VERSION,
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      hasPrompt: !!getInstallPrompt(),
      hasServiceWorker: 'serviceWorker' in navigator,
      controlled: !!navigator.serviceWorker?.controller,
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
    });
    const params = new URLSearchParams(window.location.search);
    const explicitReset = params.has('reset') && params.get('reset') !== 'done';
    if (
      explicitReset &&
      !isInstalledAppMode() &&
      sessionStorage.getItem(INSTALL_RESET_KEY) !== '1'
    ) {
      sessionStorage.setItem(INSTALL_RESET_KEY, '1');
      resetInstallCacheState().catch(() => {});
    }
    if (!rememberConferenceFromUrl()) rememberInviteFromUrl();

    if (
      isInstalledAppMode()
    ) {
      goToAppEntry();
      return;
    }

    if (getInstallPrompt()) {
      promptRef.current = getInstallPrompt();
    }

    const handler = (e: any) => {
      e.preventDefault();
      promptRef.current = e;
      setInstallPrompt(e);
      setInstallMessage('');
    };
    const onPromptReady = () => {
      promptRef.current = getInstallPrompt();
      setInstallMessage('');
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('oracle:pwa-prompt-ready', onPromptReady);
    const onInstalled = () => {
      setInstalled(true);
      promptRef.current = null;
      clearInstallPrompt();
      markInstalledAndOpenApp('appinstalled');
    };
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => reg.update().catch(() => {}).finally(reloadOnceWhenServiceWorkerControlsPage))
        .catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('oracle:pwa-prompt-ready', onPromptReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function handleAndroidInstall() {
    logPwaInstall('install-page-click', { hasPrompt: !!getInstallPrompt(), device });
    setInstalling(true);
    if (shouldOpenAndroidLinkInChrome()) {
      logPwaInstall('install-page-open-chrome-intent');
      window.location.assign(buildChromeInstallIntentUrl({ v: INSTALL_VERSION, t: String(Date.now()) }));
      return;
    }
    setInstallMessage('');

    try {
      await ensureServiceWorkerReady();
      const prompt = promptRef.current || getInstallPrompt() || await waitForInstallPrompt(6500);
      if (!prompt) {
        logPwaInstall('install-page-prompt-missing-after-wait');
        if (device === 'android') {
          await resetInstallCacheState().catch(() => {});
          window.location.assign(buildChromeInstallIntentUrl({
            retry: '1',
            v: INSTALL_VERSION,
            t: String(Date.now()),
          }));
        } else {
          setInstallMessage('Installation non disponible sur ce navigateur.');
        }
        return;
      }

      const choice = await openInstallPrompt(prompt);
      promptRef.current = null;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        markInstalledAndOpenApp('prompt-accepted');
      } else {
        setInstallMessage(device === 'android' ? '' : "Installation annulée. Appuie à nouveau sur Installer l'application pour réessayer.");
      }
    } catch (err: any) {
      logPwaInstall('install-page-error', { message: err?.message || String(err) });
      promptRef.current = null;
      clearInstallPrompt();
      setInstallMessage(device === 'android' ? '' : 'Installation non disponible sur ce navigateur.');
    } finally {
      setInstalling(false);
    }
  }

  if (!mounted) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (installed) return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', gap: 20, padding: 32, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Installé !</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: 0 }}>Ouverture d'Oracle Messenger...</p>
    </div>
  );

  if (device === 'ios') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent:'center', background: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif', padding:'28px 24px', boxSizing:'border-box' }}>
        <div style={{ maxWidth:420, margin:'0 auto', width:'100%', textAlign:'center' }}>
          <img src="/icons/icon-192-v20260809-premium.png" alt="" style={{ width:82, height:82, borderRadius:22, marginBottom:18 }} />
          <h1 style={{ fontSize:26, lineHeight:1.15, margin:'0 0 10px', color:'var(--text-primary)', fontWeight:900 }}>Oracle Messenger</h1>
          <p style={{ fontSize:15, lineHeight:1.45, margin:'0 0 24px', color:'var(--text-secondary)', fontWeight:650 }}>
            Ajoutez Oracle Messenger à l’écran d’accueil.
          </p>
          <button onClick={() => setInstallMessage('Touchez Partager, puis Ajouter à l’écran d’accueil.')}
            style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Ajouter à l’écran d’accueil
          </button>
          <button onClick={openWithoutInstall}
            style={{ marginTop: 10, width: '100%', background: 'transparent', color: ACCENT, border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)', borderRadius: 24, padding: '12px 18px', fontSize: 14, fontWeight: 850, cursor: 'pointer' }}>
            Accéder sans installer
          </button>
          {installMessage && (
            <p style={{ margin:'14px 0 0', fontSize:13, lineHeight:1.45, color:'var(--text-secondary)', fontWeight:750 }}>
              {installMessage}
            </p>
          )}
        </div>
      </div>
    );
  }

  const needsChrome = device === 'android' && shouldOpenAndroidLinkInChrome();
  const chromeInstallHref = buildChromeInstallIntentUrl({ v: INSTALL_VERSION, t: String(Date.now()) });

  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 22px 30px', boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,sans-serif', WebkitOverflowScrolling: 'touch' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <main style={{ width: '100%', maxWidth: 390, minHeight: 'calc(100dvh - 58px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', paddingBlock: 18 }}>
        <img src="/icons/icon-192-v20260809-premium.png" alt="" style={{ width: 92, height: 92, borderRadius: 26, marginBottom: 18, boxShadow: '0 14px 34px rgba(16,42,42,0.14)' }} />

        <h1 style={{ fontSize: 27, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.12 }}>
          Oracle Messenger
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0 0 24px', maxWidth: 285, fontWeight: 650 }}>
          Discutez, appelez et restez proche de vos contacts.
        </p>
        {needsChrome ? (
          <a
            href={chromeInstallHref}
            style={{
              width: '100%',
              background: ACCENT,
              color: '#fff',
              border: 'none',
              borderRadius: 28,
              padding: '17px 18px',
              fontSize: 'clamp(15px, 4.15vw, 17px)',
              fontWeight: 850,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 10px 24px rgba(16,42,42,0.18)',
              marginBottom: 12,
              textDecoration:'none',
              boxSizing:'border-box',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="21" height="21" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            Installer l'application
          </a>
        ) : (
          <button
            onClick={handleAndroidInstall}
            disabled={installing}
            style={{
              width: '100%',
              background: installing ? 'var(--text-muted)' : ACCENT,
              color: '#fff',
              border: 'none',
              borderRadius: 28,
              padding: '17px 18px',
              fontSize: 'clamp(15px, 4.15vw, 17px)',
              fontWeight: 850,
              cursor: installing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 10px 24px rgba(16,42,42,0.18)',
              marginBottom: 12,
              whiteSpace: 'nowrap',
            }}
          >
            {installing ? (
              <>
                <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
                Installation...
              </>
            ) : (
              <>
                <svg width="21" height="21" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Installer l'application
              </>
            )}
          </button>
        )}
        <button
          onClick={openWithoutInstall}
          style={{
            width: '100%',
            background: 'transparent',
            color: ACCENT,
            border: '1px solid color-mix(in srgb, var(--brand) 28%, transparent)',
            borderRadius: 24,
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 850,
            cursor: 'pointer',
          }}
        >
          Accéder sans installer
        </button>
        {installMessage && device !== 'android' && (
          <p style={{ margin:'14px 0 0', fontSize:13, lineHeight:1.45, color:'var(--text-secondary)', fontWeight:750 }}>
            {installMessage}
          </p>
        )}
      </main>
    </div>
  );
}
