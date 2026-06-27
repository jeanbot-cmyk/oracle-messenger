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

// Client redirect component
export default function UserLandingPage({ params }: Props) {
  const { username } = params;
  const appUrl = 'https://messenger.oracle-plus.online';
  const deepLink = `${appUrl}/contacts?from=${username}`;

  return (
    <html lang="fr">
      <head>
        <meta httpEquiv="refresh" content={`0; url=${deepLink}`} />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 40 }}>
            💬
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111b21', margin: '0 0 8px' }}>Oracle Messenger</h1>
          <p style={{ fontSize: 15, color: '#667781', margin: '0 0 24px' }}>
            <strong>@{username}</strong> vous invite à discuter
          </p>
          <a href={deepLink}
            style={{ display: 'inline-block', background: '#00a884', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 16, fontWeight: 700 }}>
            Ouvrir la conversation
          </a>
          <p style={{ fontSize: 12, color: '#8696a0', marginTop: 16 }}>
            Redirection automatique…
          </p>
        </div>
      </body>
    </html>
  );
}
