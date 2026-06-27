'use client';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';
import { detectLanguage } from '../lib/i18n';

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

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Import contacts automatique — déclenché après un court délai
    // pour ne pas bloquer le rendu initial
    const t = setTimeout(() => autoImportContacts(), 2000);
    return () => clearTimeout(t);
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <SessionProvider>
      <ThemeApplier />
      {mounted ? (
        <>
          {children}
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
