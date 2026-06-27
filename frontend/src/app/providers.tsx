'use client';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // SessionProvider doit toujours envelopper les children pour que
  // useSession() fonctionne même avant le montage côté client
  return (
    <SessionProvider>
      {mounted ? (
        <>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: { background: '#1a2035', color: '#e2e8f0', border: '1px solid #1e2d4a', borderRadius: '12px' },
              duration: 3000,
            }}
          />
        </>
      ) : (
        <div className="h-screen flex items-center justify-center bg-oracle-night">
          <div className="w-8 h-8 border-2 border-oracle-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </SessionProvider>
  );
}
