export const dynamic = 'force-dynamic';
import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Oracle Messenger',
  description: 'Application de messagerie instantanée — chat, appels audio/vidéo, stories et suivi d\'entreprise.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Oracle Messenger' },
  icons: { icon: '/icons/icon.svg?v=20260803-crisp-icon', apple: '/icons/icon-192-v20260803.png' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Oracle Messenger',
    description: 'Application de messagerie instantanée — chat, appels audio/vidéo, stories.',
    url: 'https://messenger.oracle-plus.online',
    siteName: 'Oracle Messenger',
    images: [{ url: 'https://messenger.oracle-plus.online/icons/icon-1024-v20260803.png', width: 1024, height: 1024 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Oracle Messenger',
    description: 'Application de messagerie instantanée.',
    images: ['https://messenger.oracle-plus.online/icons/icon-1024-v20260803.png'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'var(--header-bg)' },
    { media: '(prefers-color-scheme: dark)',  color: 'var(--header-bg)' },
  ],
  width: 'device-width',
  initialScale: 1,
  // userScalable: false retiré — requis par Play Store accessibility policy
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Capture beforeinstallprompt as early as possible, before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__installPrompt = e;
            window.__pwaPrompt = e;
          });
        `}} />
      </head>
      <body style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg-app)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
