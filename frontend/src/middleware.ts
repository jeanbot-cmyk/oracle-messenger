import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Laisser passer : assets, API, install page, manifest, sw
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/install' ||
    pathname.startsWith('/install')
  ) return NextResponse.next();

  // Détecter si l'app est ouverte en mode standalone (PWA installée)
  // Le header sec-fetch-dest ou display-mode ne sont pas disponibles côté serveur
  // On utilise un cookie posé par le SW au lancement PWA
  const isPWA = request.cookies.get('pwa-installed')?.value === '1';
  const ua = request.headers.get('user-agent') ?? '';

  // Sur mobile (Android/iOS), forcer l'installation si pas PWA
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);

  if (isMobile && !isPWA) {
    return NextResponse.redirect(new URL('/install', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
