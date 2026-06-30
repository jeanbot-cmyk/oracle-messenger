import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    // ── Phone login (no OTP) ──────────────────────────────────────────────
    CredentialsProvider({
      id: 'phone',
      name: 'Phone',
      credentials: {
        backendToken: { type: 'text' },
        userId:       { type: 'text' },
        username:     { type: 'text' },
        isNew:        { type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.backendToken || !credentials?.userId) return null;
        return {
          id:           credentials.userId,
          backendToken: credentials.backendToken,
          username:     credentials.username ?? '',
          isNew:        credentials.isNew === 'true',
        };
      },
    }),

    // ── Google OAuth (comptes existants) ─────────────────────────────────
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Désactiver PKCE — les cookies SameSite=Lax sont perdus derrière le proxy Coolify
      checks: ['state'],
    }),
  ],

  callbacks: {
    async jwt({ token, user, account, profile }) {
      // ── Phone credentials ─────────────────────────────────────────────
      if (account?.provider === 'phone' && user) {
        token.backendToken = (user as any).backendToken;
        token.userId       = user.id;
        token.username     = (user as any).username;
        token.isNew        = (user as any).isNew;
      }

      // ── Google OAuth ──────────────────────────────────────────────────
      if (account?.provider === 'google' && profile) {
        const googleId  = (profile as any).sub;
        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
        if (googleId && backendUrl) {
          try {
            const res = await fetch(`${backendUrl}/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                googleId,
                email:  token.email   ?? '',
                name:   token.name    ?? '',
                avatar: token.picture ?? '',
              }),
            });
            if (res.ok) {
              const data = await res.json();
              token.backendToken = data.token;
              token.userId       = data.user?.id;
              token.username     = data.user?.username;
              token.isNew        = false; // Google users are never "new" in onboarding sense
            }
          } catch (e) {
            console.error('[NextAuth] Backend call failed:', e);
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id           = (token.userId       as string)  ?? '';
      session.user.username     = (token.username     as string)  ?? '';
      session.user.backendToken = (token.backendToken as string)  ?? '';
      session.user.isNew        = (token.isNew        as boolean) ?? false;
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
