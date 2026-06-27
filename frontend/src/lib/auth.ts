import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Désactiver PKCE — les cookies SameSite=Lax sont perdus derrière le proxy Coolify
      checks: ['state'],
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Appel backend uniquement lors du premier login (account présent)
      if (account?.provider === 'google' && profile) {
        const googleId = (profile as any).sub;
        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
        if (googleId && backendUrl) {
          try {
            const res = await fetch(`${backendUrl}/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                googleId,
                email:  token.email  ?? '',
                name:   token.name   ?? '',
                avatar: token.picture ?? '',
              }),
            });
            if (res.ok) {
              const data = await res.json();
              token.backendToken = data.token;
              token.userId       = data.user?.id;
              token.username     = data.user?.username;
            }
          } catch (e) {
            console.error('[NextAuth] Backend call failed:', e);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id           = (token.userId       as string) ?? '';
      session.user.username     = (token.username     as string) ?? '';
      session.user.backendToken = (token.backendToken as string) ?? '';
      return session;
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  // Cookies explicites pour survivre derrière un reverse proxy
  cookies: {
    pkceCodeVerifier: {
      name: '__Secure-next-auth.pkce.code_verifier',
      options: { httpOnly: true, sameSite: 'none', path: '/', secure: true },
    },
    state: {
      name: '__Secure-next-auth.state',
      options: { httpOnly: true, sameSite: 'none', path: '/', secure: true, maxAge: 900 },
    },
    callbackUrl: {
      name: '__Secure-next-auth.callback-url',
      options: { httpOnly: true, sameSite: 'none', path: '/', secure: true },
    },
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: { httpOnly: true, sameSite: 'none', path: '/', secure: true },
    },
    csrfToken: {
      name: '__Host-next-auth.csrf-token',
      options: { httpOnly: true, sameSite: 'none', path: '/', secure: true },
    },
  },
};
