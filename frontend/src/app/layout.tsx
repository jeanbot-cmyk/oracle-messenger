export const dynamic = 'force-dynamic';
import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Oracle Messenger',
  description: 'Messagerie souveraine nouvelle génération',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Oracle Messenger' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0e1a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="h-screen overflow-hidden bg-oracle-night">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
