import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never block these routes
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

  // Auto-set pwa-installed cookie when SW signals standalone mode
  const standaloneHeader = request.headers.get('X-PWA-Standalone');
  if (standaloneHeader === '1') {
    const res = NextResponse.next();
    res.cookies.set('pwa-installed', '1', { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return res;
  }

  // No install wall — everyone can access the app
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)'],
};
