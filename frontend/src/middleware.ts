import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Laisser passer tout ce qui n'est pas une page utilisateur
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/install') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  ) return NextResponse.next();

  // Si le cookie pwa-installed est présent → laisser passer
  const isPWA = request.cookies.get('pwa-installed')?.value === '1';
  if (isPWA) return NextResponse.next();

  // Détecter mode standalone via header (Coolify/proxy peut le transmettre)
  const ua = request.headers.get('user-agent') ?? '';
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);
  const isSamsungBrowser = /samsungbrowser/i.test(ua);

  // Sur mobile sans cookie PWA → rediriger vers /install
  // SAUF si c'est déjà /login (pour ne pas bloquer la connexion)
  if (isMobile && pathname !== '/login') {
    return NextResponse.redirect(new URL('/install', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)'],
};
