'use client';
export const dynamic = 'force-dynamic';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { lang } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/chat');
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) { setError(err); setLoading(false); }
  }, [status, router]);

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    await signIn('google', { callbackUrl: `${window.location.origin}/chat` });
  }

  if (status === 'loading') return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-app)', padding:'24px 16px' }}>
      {/* Logo */}
      <div style={{ marginBottom:32, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
        <div style={{ width:80, height:80, borderRadius:24, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 32px rgba(0,168,132,.3)' }}>
          <svg width="40" height="40" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div style={{ textAlign:'center' }}>
          <h1 style={{ fontSize:28, fontWeight:700, color:'var(--text-primary)', margin:0 }}>{t(lang,'app.name')}</h1>
          <p style={{ color:'var(--text-muted)', marginTop:4, fontSize:14 }}>{t(lang,'app.tagline')}</p>
        </div>
      </div>

      {/* Card */}
      <div style={{ width:'100%', maxWidth:360, background:'var(--bg-surface)', borderRadius:16, padding:32, boxShadow:'0 2px 16px rgba(0,0,0,.08)' }}>
        <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', margin:'0 0 4px' }}>{t(lang,'login.title')}</h2>
        <p style={{ color:'var(--text-muted)', fontSize:14, margin:'0 0 24px' }}>{t(lang,'login.subtitle')}</p>

        {error && (
          <div style={{ marginBottom:16, padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, color:'#dc2626', fontSize:13 }}>
            {error === 'OAuthCallback' || error === 'google' ? 'Connexion Google échouée. Réessayez.' : error}
          </div>
        )}

        <button onClick={handleGoogle} disabled={loading} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:12, background:'#fff', border:'1px solid #e0e0e0', borderRadius:12, padding:'14px 20px', fontSize:15, fontWeight:500, color:'#3c4043', cursor:loading?'not-allowed':'pointer', opacity:loading?.7:1, boxShadow:'0 1px 4px rgba(0,0,0,.1)', transition:'box-shadow .2s' }}>
          {loading ? (
            <div style={{ width:20, height:20, border:'2px solid #ccc', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? t(lang,'login.connecting') : t(lang,'login.google')}
        </button>

        <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, marginTop:20, lineHeight:1.6 }}>
          {t(lang,'login.terms')}{' '}
          <a href="/terms" style={{ color:'var(--accent)' }}>{t(lang,'login.terms.link')}</a>
          {' '}{t(lang,'login.privacy')}{' '}
          <a href="/privacy" style={{ color:'var(--accent)' }}>{t(lang,'login.privacy.link')}</a>.
        </p>
      </div>

      {/* Features */}
      <div style={{ marginTop:32, display:'flex', gap:32, textAlign:'center' }}>
        {[['🔒','Chiffré'],['⚡','Temps réel'],['📱','PWA']].map(([icon,label]) => (
          <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:22 }}>{icon}</span>
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  return <LoginContent />;
}
