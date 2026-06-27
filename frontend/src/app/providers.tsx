'use client';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';
import { detectLanguage } from '../lib/i18n';

function ThemeApplier() {
  const { theme, lang, setLang } = useSettings();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    // Détecter la langue du navigateur au premier chargement
    const stored = localStorage.getItem('oracle-settings');
    const parsed = stored ? JSON.parse(stored) : null;
    if (!parsed?.state?.lang || parsed.state.lang === 'fr') {
      setLang(detectLanguage());
    }
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, setLang]);

  useEffect(() => {
    // Détecter mode standalone PWA et poser le cookie
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
    }
    // Enregistrer le SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
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
          <Toaster position="top-center" toastOptions={{
            style: { background:'var(--bg-surface)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:12 },
            duration: 3000,
          }} />
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
