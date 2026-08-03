'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Props { params: { username: string }; }

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

function normalizeUsername(value: string) {
  return decodeSafe(value).trim().replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
}

// Client component — gère la session et redirige correctement
export default function UserLandingPage({ params }: Props) {
  const username = normalizeUsername(params.username);
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!username) {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated') {
      router.replace(`/contacts?from=${encodeURIComponent(username)}`);
    } else {
      const next = `/contacts?from=${encodeURIComponent(username)}`;
      sessionStorage.setItem('oracle-after-login', next);
      localStorage.setItem('oracle-after-login', next);
      router.replace(`/login?from=${encodeURIComponent(username)}`);
    }
  }, [status, username, router]);

  return (
    <div style={{ margin:0, fontFamily:'system-ui,sans-serif', background:'var(--bg-app)', display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign:'center', padding:32 }}>
        <div style={{ width:80, height:80, borderRadius:'28px', background:'var(--brand)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:40, boxShadow:'var(--shadow-soft)' }}>
          💬
        </div>
        <h1 style={{ fontSize:22, fontWeight:800, color:'var(--text-primary)', margin:'0 0 8px' }}>Oracle Messenger</h1>
        <p style={{ fontSize:15, color:'var(--text-secondary)', margin:'0 0 24px' }}>
          <strong>@{username}</strong> vous invite à discuter
        </p>
        <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:'var(--brand)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }}/>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:16 }}>Chargement…</p>
      </div>
    </div>
  );
}
