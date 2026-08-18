export const dynamic = 'force-dynamic';
import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Oracle Messenger',
  description: 'Messagerie, appels audio/vidéo, outils créatifs IA et automatisation Business.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Oracle Messenger' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '192x192' },
      { url: '/icons/icon.svg?v=20260806-logo-no-badge', type: 'image/svg+xml' },
      { url: '/icons/icon-192-v20260809-premium.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '192x192', type: 'image/png' }],
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Oracle Messenger',
    description: 'Messagerie, appels audio/vidéo, outils créatifs IA et automatisation Business.',
    url: 'https://messenger.oracle-plus.online',
    siteName: 'Oracle Messenger',
    images: [{ url: 'https://messenger.oracle-plus.online/icons/icon-1024-v20260809-premium.png', width: 1024, height: 1024 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Oracle Messenger',
    description: 'Messagerie, appels, outils créatifs IA et Business.',
    images: ['https://messenger.oracle-plus.online/icons/icon-1024-v20260809-premium.png'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#102A2A' },
    { media: '(prefers-color-scheme: dark)',  color: '#102A2A' },
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
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Capture the install prompt without starting diagnostics or cache work on every page. */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__installPrompt = e;
            window.__pwaPrompt = e;
            window.dispatchEvent(new CustomEvent('oracle:pwa-prompt-ready'));
          });
        `}} />
      </head>
      <body style={{ minHeight: '100dvh', overflowX: 'hidden', background: 'var(--bg-app)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
