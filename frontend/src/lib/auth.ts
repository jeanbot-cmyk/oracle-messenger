import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    // Google is the only trusted identity provider. Phone numbers are profile data.
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      id: 'native-token',
      name: 'Oracle Messenger Android',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        const backendToken = credentials?.token?.trim();
        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendToken || !backendUrl) return null;

        const res = await fetch(`${backendUrl}/users/me`, {
          headers: { Authorization: `Bearer ${backendToken}` },
          cache: 'no-store',
        }).catch(() => null);
        if (!res?.ok) return null;

        const user = await res.json();
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          username: user.username,
          phone: user.phone ?? '',
          isNew: !user.phone,
          backendToken,
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account, profile, trigger, session, user }) {
      if (trigger === 'update' && (session as any)?.user) {
        const updated = (session as any).user;
        if (updated.name !== undefined) token.name = updated.name;
        if (updated.image !== undefined) token.picture = updated.image;
        if (updated.phone !== undefined) {
          token.phone = updated.phone;
          token.isNew = !updated.phone;
        }
        if (updated.backendToken !== undefined) token.backendToken = updated.backendToken;
        if (updated.id !== undefined) token.userId = updated.id;
        if (updated.isNew !== undefined) token.isNew = updated.isNew;
        if (updated.username !== undefined) token.username = updated.username;
      }

      if (account?.provider === 'native-token' && user) {
        token.backendToken = (user as any).backendToken;
        token.userId       = (user as any).id;
        token.username     = (user as any).username;
        token.phone        = (user as any).phone ?? '';
        token.isNew        = !(user as any).phone;
        token.email        = (user as any).email;
        token.name         = (user as any).name;
        token.picture      = (user as any).image;
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
              if (data.user?.name) token.name = data.user.name;
              if (data.user?.avatar !== undefined) token.picture = data.user.avatar ?? '';
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
      if (token.name) session.user.name = token.name as string;
      if (token.picture !== undefined) session.user.image = token.picture as string;
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
