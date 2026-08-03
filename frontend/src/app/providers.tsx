'use client';
import { SessionProvider, useSession } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';
import { detectLanguage } from '../lib/i18n';
import { PhoneOnboarding } from '../components/PhoneOnboarding';
import { buildChromeIntentUrl, openCurrentAndroidLinkInChrome, shouldOpenAndroidLinkInChrome } from '../lib/androidChrome';
import { clearOldTextMessages } from '../lib/db';

const CLIENT_CACHE_VERSION = '63-20260803-forward-message-50';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://api-messenger.oracle-plus.online';
const PWA_INSTALL_PENDING_KEY = 'oracle-pwa-install-pending';

function ThemeApplier() {
  const { theme, lang, setLang } = useSettings();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const stored = localStorage.getItem('oracle-settings');
    const parsed = stored ? JSON.parse(stored) : null;
    if (!parsed?.state?.lang || parsed.state.lang === 'fr') {
      setLang(detectLanguage());
    }
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, setLang]);

  useEffect(() => {
    // Cookie PWA si mode standalone
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
    }

    // Service Worker — register and handle updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => {
          const storedVersion = localStorage.getItem('oracle-client-cache-version');
          if (storedVersion !== CLIENT_CACHE_VERSION && 'caches' in window) {
            caches.keys()
              .then(keys => Promise.all(keys.map(key => caches.delete(key))))
              .then(() => localStorage.setItem('oracle-client-cache-version', CLIENT_CACHE_VERSION))
              .then(() => {
                navigator.serviceWorker.controller?.postMessage({ type: 'force-update' });
                return reg.update().catch(() => {});
              })
              .catch(() => localStorage.setItem('oracle-client-cache-version', CLIENT_CACHE_VERSION));
          }
          // Check for updates every time the page loads
          reg.update().catch(() => {});

          // When a new SW takes over, reload to get fresh assets
          navigator.serviceWorker.addEventListener('message', e => {
            if (e.data?.type === 'SW_UPDATED') {
              const reloadKey = `oracle-sw-reloaded-${CLIENT_CACHE_VERSION}`;
              if (!sessionStorage.getItem(reloadKey)) {
                sessionStorage.setItem(reloadKey, '1');
                window.location.reload();
              }
            }
          });
        })
        .catch(() => {});

      // Persist the install prompt so the user can reinstall after uninstall
      window.addEventListener('beforeinstallprompt', (e: any) => {
        e.preventDefault();
        (window as any).__installPrompt = e;
      });

      // Track PWA installs
      window.addEventListener('appinstalled', () => {
        localStorage.setItem(PWA_INSTALL_PENDING_KEY, '1');
        fetch('/api/admin/pwa-install', { method: 'POST' })
          .then(res => { if (res.ok) localStorage.removeItem(PWA_INSTALL_PENDING_KEY); })
          .catch(() => {});
      });
    }

    // Storage quota alert — warn if < 10% free
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(({ usage = 0, quota = 1 }) => {
        const pctFree = ((quota - usage) / quota) * 100;
        if (pctFree < 10 && Notification.permission === 'granted') {
          new Notification('Oracle Messenger — Stockage', {
            body: "Votre téléphone est presque plein. Supprimez quelques fichiers dans Oracle Messenger pour libérer de l'espace.",
            icon: '/icons/icon-192.png',
          });
        }
      }).catch(() => {});
    }

    // Contacts are imported only from /contacts after an explicit user tap.
    // Browsers display a native contact picker that cannot be styled by the app.
    clearOldTextMessages(5).catch(() => {});
  }, []);

  return null;
}

function PwaInstallTracker() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (localStorage.getItem(PWA_INSTALL_PENDING_KEY) !== '1') return;
    fetch('/api/admin/pwa-install', { method: 'POST' })
      .then(res => { if (res.ok) localStorage.removeItem(PWA_INSTALL_PENDING_KEY); })
      .catch(() => {});
  }, [status]);

  return null;
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    !!(window as any).Capacitor?.isNativePlatform?.();
}

function AndroidChromeGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!shouldOpenAndroidLinkInChrome()) {
      setBlocked(false);
      return;
    }
    setBlocked(true);
    const timer = setTimeout(() => openCurrentAndroidLinkInChrome('android-chrome-gate'), 120);
    return () => clearTimeout(timer);
  }, []);

  function openChrome() {
    window.location.href = buildChromeIntentUrl(window.location.href);
  }

  if (!blocked) return <>{children}</>;

  return (
    <div style={{ minHeight:'100dvh', background:'#F7F8F6', display:'flex', alignItems:'center', justifyContent:'center', padding:24, boxSizing:'border-box', fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ width:'min(420px, 100%)', background:'#fff', border:'1px solid rgba(15,23,42,0.08)', borderRadius:24, padding:24, textAlign:'center', boxShadow:'0 18px 42px rgba(15,23,42,0.12)' }}>
        <img src="/icons/icon-96-v20260803.png" alt="" style={{ width:64, height:64, borderRadius:18, marginBottom:16 }} />
        <h1 style={{ margin:'0 0 8px', fontSize:22, lineHeight:1.18, fontWeight:900, color:'#111827' }}>Ouvrir avec Chrome</h1>
        <p style={{ margin:'0 0 20px', fontSize:15, lineHeight:1.5, fontWeight:650, color:'#374151' }}>
          Sur Android, Oracle Messenger fonctionne uniquement avec Chrome pour les contacts, l’installation et les conversations.
        </p>
        <button onClick={openChrome}
          style={{ width:'100%', minHeight:50, border:'none', borderRadius:999, background:'#0F766E', color:'#fff', fontSize:16, fontWeight:900, cursor:'pointer', boxShadow:'0 10px 24px rgba(15,118,110,0.24)' }}>
          Continuer dans Chrome
        </button>
        <p style={{ margin:'14px 0 0', fontSize:12, lineHeight:1.45, color:'#6B7280' }}>
          Si Chrome n’est pas installé, Android ouvrira la page Chrome du Play Store.
        </p>
      </div>
    </div>
  );
}

function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (path.startsWith('/install') || isStandaloneMode()) return;

    const showTimer = setTimeout(() => setVisible(!isStandaloneMode()), 900);
    const onPrompt = (e: any) => {
      e.preventDefault();
      (window as any).__installPrompt = e;
      setVisible(!isStandaloneMode());
    };
    const onInstalled = () => {
      setVisible(false);
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
      const pending = localStorage.getItem('oracle-after-login') || sessionStorage.getItem('oracle-after-login');
      window.location.replace(pending || '/chat');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      clearTimeout(showTimer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    const prompt = (window as any).__installPrompt;
    if (prompt?.prompt) {
      setInstalling(true);
      try {
        prompt.prompt();
        await prompt.userChoice;
      } finally {
        setInstalling(false);
      }
      return;
    }
    window.location.href = '/install';
  }

  if (!visible) return null;
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:2000, background:'var(--header-bg)', color:'#fff', borderBottom:'1px solid rgba(255,255,255,0.12)', boxShadow:'0 6px 20px rgba(0,0,0,0.18)', padding:'8px 10px env(safe-area-inset-top)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, maxWidth:720, margin:'0 auto' }}>
        <div style={{ width:34, height:34, borderRadius:10, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <img src="/icons/icon-72-v20260803.png" alt="" style={{ width:26, height:26, borderRadius:7 }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:900, lineHeight:1.25 }}>Installer Oracle Messenger</p>
          <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.72)', lineHeight:1.25 }}>Ouvrir sans barre d'adresse et recevoir les appels.</p>
        </div>
        <button onClick={install} disabled={installing}
          style={{ border:'none', borderRadius:999, background:'var(--accent)', color:'var(--accent-text)', padding:'8px 12px', fontSize:12, fontWeight:900, cursor:'pointer', whiteSpace:'nowrap' }}>
          {installing ? 'Installation…' : 'Installer'}
        </button>
        <button onClick={() => setVisible(false)} aria-label="Fermer"
          style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.10)', color:'#fff', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
      </div>
    </div>
  );
}

function AppLoadingScreen({ text = 'Ouverture d’Oracle Messenger...' }: { text?: string }) {
  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, background:'var(--bg-app)', color:'var(--text-primary)', fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding:24, textAlign:'center' }}>
      <div style={{ width:52, height:52, borderRadius:16, background:'var(--header-bg)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 10px 28px rgba(16,42,42,0.18)' }}>
        <img src="/icons/icon-72-v20260803.png" alt="" style={{ width:36, height:36, borderRadius:10 }} />
      </div>
      <div style={{ width:34, height:34, border:'3px solid var(--border)', borderTopColor:'var(--brand)', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <p style={{ margin:0, fontSize:14, lineHeight:1.45, fontWeight:800 }}>{text}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function PhoneGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [needsPhone, setNeedsPhone] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (status === 'loading') {
      setChecked(false);
      setNeedsPhone(false);
      return;
    }
    setChecked(false);
    if (status !== 'authenticated') { setChecked(true); return; }
    const token = (session?.user as any)?.backendToken;
    if (!token) { setChecked(true); return; }

    // Check local cache first
    try {
      const local = JSON.parse(localStorage.getItem('oracle-profile') ?? '{}');
      if (local.phone) { setChecked(true); return; }
    } catch {}

    // Check backend — if it fails, assume phone is needed (safe default)
    fetch(`${BACKEND_URL}/users/me/has-phone`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setNeedsPhone(!d.hasPhone);
        setChecked(true);
      })
      .catch(() => {
        // En cas de réseau faible, ne pas afficher une fausse étape qui fait clignoter l'app.
        setNeedsPhone(false);
        setChecked(true);
      });
  }, [status, session]);

  if (!checked) return <AppLoadingScreen />;
  if (needsPhone) return <PhoneOnboarding onDone={() => setNeedsPhone(false)} />;
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <SessionProvider>
      <ThemeApplier />
      {mounted ? (
        <>
          <PwaInstallTracker />
          <AndroidChromeGate>
            <PhoneGate>{children}</PhoneGate>
          </AndroidChromeGate>
          <InstallBanner />
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
              },
              duration: 3000,
            }}
          />
        </>
      ) : (
        <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
          <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
    </SessionProvider>
  );
}
