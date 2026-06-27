import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        try {
          const res = await fetch(`${process.env.BACKEND_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              googleId: (profile as any).sub,
              email:    token.email,
              name:     token.name,
              avatar:   token.picture,
            }),
          });
          const data = await res.json();
          token.backendToken = data.token;
          token.userId       = data.user?.id;
          token.username     = data.user?.username;
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id           = token.userId as string;
      session.user.username     = token.username as string;
      session.user.backendToken = token.backendToken as string;
      return session;
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};
