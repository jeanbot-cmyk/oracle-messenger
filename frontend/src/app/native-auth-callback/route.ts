import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '../../lib/auth';

export const dynamic = 'force-dynamic';

function publicOrigin(req: Request) {
  const configured = process.env.NEXTAUTH_URL || process.env.FRONTEND_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) return `${proto}://${host}`;

  return 'https://messenger.oracle-plus.online';
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const origin = publicOrigin(req);
  const token = (session?.user as any)?.backendToken;

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=native_session', origin));
  }

  const fallback = new URL('/native-auth', origin);
  fallback.searchParams.set('token', token);
  const appUrl = `online.oracle_plus.messenger://native-auth?token=${encodeURIComponent(token)}`;
  const intentUrl =
    `intent://native-auth?token=${encodeURIComponent(token)}` +
    `#Intent;scheme=online.oracle_plus.messenger;package=online.oracle_plus.messenger;` +
    `S.browser_fallback_url=${encodeURIComponent(fallback.toString())};end`;

  return new NextResponse(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Oracle Messenger</title>
  <script>
    location.replace(${JSON.stringify(intentUrl)});
    setTimeout(function(){ location.replace(${JSON.stringify(appUrl)}); }, 450);
    setTimeout(function(){ location.replace(${JSON.stringify(fallback.toString())}); }, 1800);
  </script>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;color:#102A2A">
  <main>
    <h1>Ouverture Oracle Messenger</h1>
    <p>Retour dans l'application en cours...</p>
  </main>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
