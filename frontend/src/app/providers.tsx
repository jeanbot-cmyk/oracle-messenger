'use client';
import { SessionProvider, useSession } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';
import { detectLanguage } from '../lib/i18n';
import { PhoneOnboarding } from '../components/PhoneOnboarding';
import { openCurrentAndroidLinkInChrome } from '../lib/androidChrome';

const CLIENT_CACHE_VERSION = '20260803-local-phone-import';

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
    openCurrentAndroidLinkInChrome('global');

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
              .then(() => {
                const reloadKey = `oracle-cache-reloaded-${CLIENT_CACHE_VERSION}`;
                if (!sessionStorage.getItem(reloadKey)) {
                  sessionStorage.setItem(reloadKey, '1');
                  window.location.reload();
                }
              })
              .catch(() => localStorage.setItem('oracle-client-cache-version', CLIENT_CACHE_VERSION));
          }
          // Check for updates every time the page loads
          reg.update().catch(() => {});

          // When a new SW takes over, reload to get fresh assets
          navigator.serviceWorker.addEventListener('message', e => {
            if (e.data?.type === 'SW_UPDATED') {
              window.location.reload();
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
        fetch('/api/admin/pwa-install', { method: 'POST' }).catch(() => {});
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
  }, []);

  return null;
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    !!(window as any).Capacitor?.isNativePlatform?.();
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
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:2000, background:'var(--header-bg)', color:'#fff', borderBottom:'1px solid rgba(200,168,90,0.28)', boxShadow:'0 6px 20px rgba(0,0,0,0.18)', padding:'8px 10px env(safe-area-inset-top)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, maxWidth:720, margin:'0 auto' }}>
        <div style={{ width:34, height:34, borderRadius:10, background:'rgba(200,168,90,0.16)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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

function PhoneGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [needsPhone, setNeedsPhone] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') { setChecked(true); return; }
    const token = (session?.user as any)?.backendToken;
    if (!token) { setChecked(true); return; }

    // Check local cache first
    try {
      const local = JSON.parse(localStorage.getItem('oracle-profile') ?? '{}');
      if (local.phone) { setChecked(true); return; }
    } catch {}

    // Check backend — if it fails, assume phone is needed (safe default)
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/me/has-phone`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setNeedsPhone(!d.hasPhone);
        setChecked(true);
      })
      .catch(() => {
        // Backend unreachable — require phone to be safe
        setNeedsPhone(true);
        setChecked(true);
      });
  }, [status, session]);

  if (!checked) return null;
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
          <PhoneGate>
            {children}
          </PhoneGate>
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
