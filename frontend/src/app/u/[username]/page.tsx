import type { Metadata } from 'next';

interface Props {
  params: { username: string };
}

// Server component — generates OG meta for social sharing
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = params;
  const appUrl = 'https://messenger.oracle-plus.online';
  const title = `Écris-moi sur Oracle Messenger`;
  const description = `@${username} t'invite à discuter sur Oracle Messenger. Clique pour ouvrir la conversation.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl}/u/${username}`,
      siteName: 'Oracle Messenger',
      images: [{ url: `${appUrl}/icons/icon-512.png`, width: 512, height: 512, alt: 'Oracle Messenger' }],
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [`${appUrl}/icons/icon-512.png`],
    },
  };
}

'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// Client redirect component — préserve le paramètre `from` après login
export default function UserLandingPage({ params }: Props) {
  const { username } = params;
  const { status } = useSession();
  const router = useRouter();
  const appUrl = 'https://messenger.oracle-plus.online';

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      // Déjà connecté → ouvrir directement la conversation
      router.replace(`/contacts?from=${username}`);
    } else {
      // Pas connecté → login puis retour vers la conversation
      // Stocker la destination pour après le login
      sessionStorage.setItem('oracle-after-login', `/contacts?from=${username}`);
      router.replace(`/login?from=${username}`);
    }
  }, [status]);

  return (
    <div style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#128C7E', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 40 }}>
          💬
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111b21', margin: '0 0 8px' }}>Oracle Messenger</h1>
        <p style={{ fontSize: 15, color: '#667781', margin: '0 0 24px' }}>
          <strong>@{username}</strong> vous invite à discuter
        </p>
        <div style={{ width: 32, height: 32, border: '3px solid #e9edef', borderTopColor: '#128C7E', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ fontSize: 12, color: '#8696a0', marginTop: 16 }}>Chargement…</p>
      </div>
    </div>
  );
}
