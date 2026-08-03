import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [
    // Google is the only trusted identity provider. Phone numbers are profile data.
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async jwt({ token, account, profile, trigger, session }) {
      if (trigger === 'update' && (session as any)?.user) {
        const updated = (session as any).user;
        if (updated.name !== undefined) token.name = updated.name;
        if (updated.image !== undefined) token.picture = updated.image;
        if (updated.phone !== undefined) {
          token.phone = updated.phone;
          token.isNew = !updated.phone;
        }
        if (updated.username !== undefined) token.username = updated.username;
      }

      // ── Google OAuth ──────────────────────────────────────────────────
      if (account?.provider === 'google' && profile) {
        const googleId  = (profile as any).sub;
        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
        if (googleId && backendUrl && account.id_token) {
          try {
            const res = await fetch(`${backendUrl}/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken: account.id_token,
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
              token.phone        = data.user?.phone ?? '';
              token.isNew        = !data.user?.phone;
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
      if (token.picture) session.user.image = token.picture as string;
      if (token.phone) (session.user as any).phone = token.phone as string;
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
