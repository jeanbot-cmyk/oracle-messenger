'use client';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';
import { detectLanguage } from '../lib/i18n';

function ThemeApplier() {
  const { theme, lang, setLang } = useSettings();

  useEffect(() => {
    // Appliquer le thème sur <html>
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    // Détecter la langue du navigateur au premier chargement
    const stored = localStorage.getItem('oracle-settings');
    if (!stored || JSON.parse(stored)?.state?.lang === 'fr') {
      const detected = detectLanguage();
      setLang(detected);
    }
    // Appliquer la direction RTL pour l'arabe
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, setLang]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

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
                borderRadius: '12px',
              },
              duration: 3000,
            }}
          />
        </>
      ) : (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
          <div style={{ width: 32, height: 32, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </SessionProvider>
  );
}
