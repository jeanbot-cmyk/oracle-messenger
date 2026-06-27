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

  if (!mounted) return <>{children}</>;

  return (
    <SessionProvider>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#1a2035', color: '#e2e8f0', border: '1px solid #1e2d4a', borderRadius: '12px' },
          duration: 3000,
        }}
      />
    </SessionProvider>
  );
}
