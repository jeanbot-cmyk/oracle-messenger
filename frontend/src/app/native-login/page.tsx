import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

function publicOrigin() {
  return (process.env.NEXTAUTH_URL || process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online').replace(/\/+$/, '');
}

export default function NativeLoginPage() {
  const origin = publicOrigin();
  const callbackUrl = `${origin}/native-auth-callback`;
  redirect(`/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}
