import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Tout ce qui ne doit jamais être bloqué
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/install') ||
    pathname.startsWith('/login') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  ) return NextResponse.next();

  // Cookie PWA posé → accès libre
  const isPWA = request.cookies.get('pwa-installed')?.value === '1';
  if (isPWA) return NextResponse.next();

  // Mode standalone détecté via header Sec-Fetch-Mode ou display-mode
  const ua = request.headers.get('user-agent') ?? '';
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);

  // Sur mobile sans cookie → page d'installation
  if (isMobile) {
    return NextResponse.redirect(new URL('/install', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)'],
};
