'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { buildChromeIntentUrl, openCurrentAndroidLinkInChrome, shouldOpenAndroidLinkInChrome } from '../../../lib/androidChrome';

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

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

// Client component — gère la session et redirige correctement
export default function UserLandingPage({ params }: Props) {
  const username = normalizeUsername(params.username);
  const { status } = useSession();
  const router = useRouter();
  const [sessionTimedOut, setSessionTimedOut] = useState(false);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setSessionTimedOut(true), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const effectiveStatus = status === 'loading' && sessionTimedOut ? 'unauthenticated' : status;
    if (effectiveStatus === 'loading') return;
    if (openCurrentAndroidLinkInChrome()) return;
    if (!username) {
      router.replace('/login');
      return;
    }
    const next = `/contacts?from=${encodeURIComponent(username)}`;
    sessionStorage.setItem('oracle-after-login', next);
    localStorage.setItem('oracle-after-login', next);
    if (!isStandaloneMode()) {
      router.replace(`/install?from=${encodeURIComponent(username)}`);
      return;
    }
    if (effectiveStatus === 'authenticated') {
      router.replace(next);
    } else {
      router.replace(`/login?from=${encodeURIComponent(username)}`);
    }
  }, [status, sessionTimedOut, username, router]);

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
        {typeof window !== 'undefined' && shouldOpenAndroidLinkInChrome() && (
          <a href={buildChromeIntentUrl()}
            style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', margin:'0 0 18px', padding:'12px 18px', borderRadius:999, background:'var(--brand)', color:'var(--accent-text)', fontSize:14, fontWeight:900, textDecoration:'none' }}>
            Ouvrir dans Chrome
          </a>
        )}
        <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:'var(--brand)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }}/>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:16 }}>Chargement…</p>
      </div>
    </div>
  );
}
