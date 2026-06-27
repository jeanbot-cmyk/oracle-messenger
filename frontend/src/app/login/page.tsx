'use client';
export const dynamic = 'force-dynamic';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/chat');
    const p = new URLSearchParams(window.location.search);
    const err = p.get('error');
    if (err) { setError(err); setLoading(false); }
  }, [status, router]);

  async function handleGoogle() {
    setLoading(true); setError(null);
    await signIn('google', { callbackUrl: `${window.location.origin}/chat` });
  }

  if (status === 'loading') return <Spinner />;

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', boxSizing:'border-box' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Logo */}
      <div style={{ width:72, height:72, borderRadius:22, background:'#00a884', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, boxShadow:'0 8px 24px rgba(0,168,132,0.3)' }}>
        <svg width="38" height="38" fill="none" viewBox="0 0 24 24">
          <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
          <circle cx="8.5" cy="12" r="1.3" fill="#00a884"/>
          <circle cx="12"  cy="12" r="1.3" fill="#00a884"/>
          <circle cx="15.5" cy="12" r="1.3" fill="#00a884"/>
        </svg>
      </div>

      <h1 style={{ fontSize:26, fontWeight:800, color:'#111b21', margin:'0 0 6px', textAlign:'center' }}>Oracle Messenger</h1>
      <p style={{ color:'#667781', fontSize:14, margin:'0 0 40px', textAlign:'center' }}>Connectez-vous pour continuer</p>

      {error && (
        <div style={{ width:'100%', maxWidth:340, marginBottom:20, padding:'12px 16px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, color:'#dc2626', fontSize:13, textAlign:'center' }}>
          Connexion échouée. Réessayez.
        </div>
      )}

      {/* Bouton Google */}
      <button
        onClick={handleGoogle}
        disabled={loading}
        style={{
          width:'100%', maxWidth:340,
          display:'flex', alignItems:'center', justifyContent:'center', gap:12,
          background:'#fff', border:'1.5px solid #e9edef',
          borderRadius:28, padding:'16px 24px',
          fontSize:16, fontWeight:600, color:'#111b21',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          boxShadow:'0 2px 8px rgba(0,0,0,0.08)',
          transition:'box-shadow 0.2s',
          marginBottom:32,
        }}
      >
        {loading ? (
          <div style={{ width:22, height:22, border:'2.5px solid #e9edef', borderTopColor:'#00a884', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        {loading ? 'Connexion…' : 'Continuer avec Google'}
      </button>

      <p style={{ fontSize:12, color:'#8696a0', textAlign:'center', lineHeight:1.6, maxWidth:300 }}>
        En vous connectant, vous acceptez nos{' '}
        <a href="/terms" style={{ color:'#00a884' }}>conditions d'utilisation</a>{' '}
        et notre{' '}
        <a href="/privacy" style={{ color:'#00a884' }}>politique de confidentialité</a>.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid #e9edef', borderTopColor:'#00a884', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <Spinner />;
  return <LoginContent />;
}
