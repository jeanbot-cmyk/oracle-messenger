'use client';
import { SessionProvider, useSession } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';
import { detectLanguage } from '../lib/i18n';
import { PhoneOnboarding } from '../components/PhoneOnboarding';

// Import contacts automatique au lancement (Android Chrome 80+)
async function autoImportContacts() {
  try {
    // Vérifier support API Contacts
    if (!('contacts' in navigator) || !('ContactsManager' in window)) return;

    // Ne pas redemander si déjà importé aujourd'hui
    const lastImport = localStorage.getItem('oracle-contacts-imported');
    const today = new Date().toDateString();
    if (lastImport === today) return;

    const props = ['name', 'tel', 'email', 'icon'];
    const opts  = { multiple: true };
    const raw   = await (navigator as any).contacts.select(props, opts);

    if (!raw || raw.length === 0) return;

    const parsed = raw.map((c: any) => ({
      name:   c.name?.[0] ?? 'Inconnu',
      phones: c.tel   ?? [],
      emails: c.email ?? [],
      // Photo contact en base64 si disponible
      avatar: c.icon?.[0] ? URL.createObjectURL(c.icon[0]) : null,
    }));

    localStorage.setItem('oracle-contacts', JSON.stringify(parsed));
    localStorage.setItem('oracle-contacts-imported', today);
    console.log(`[Contacts] ${parsed.length} contacts importés`);
  } catch (err) {
    // L'utilisateur a refusé ou l'API n'est pas disponible — silencieux
    console.log('[Contacts] import ignoré:', err);
  }
}

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

    // Auto-import contacts — skip on /install and /login (user not authenticated yet)
    const path = window.location.pathname;
    if (!path.startsWith('/install') && !path.startsWith('/login')) {
      const t = setTimeout(() => autoImportContacts(), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  return null;
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
