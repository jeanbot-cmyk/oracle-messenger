'use client';
export const dynamic = 'force-dynamic';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const ACCENT = 'var(--accent)';
const DEEP = 'var(--header-bg)';

function Spinner() {
  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recovery, setRecovery] = useState<{ found: boolean; name?: string; emailHint?: string; message: string } | null>(null);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from');
    if (from) {
      const next = `/contacts?from=${encodeURIComponent(from)}`;
      sessionStorage.setItem('oracle-after-login', next);
      localStorage.setItem('oracle-after-login', next);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const afterLogin = sessionStorage.getItem('oracle-after-login') || localStorage.getItem('oracle-after-login');
    if (afterLogin) {
      sessionStorage.removeItem('oracle-after-login');
      localStorage.removeItem('oracle-after-login');
      router.replace(afterLogin);
      return;
    }
    router.replace((session?.user as any)?.isNew ? '/onboarding' : '/chat');
  }, [status, session, router]);

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    try {
      await signIn('google', { callbackUrl: '/login' });
    } catch {
      setError('Connexion Google impossible. Vérifiez votre connexion puis réessayez.');
      setLoading(false);
    }
  }

  async function handleRecoverPhone() {
    if (!phone.trim()) {
      setRecovery({ found: false, message: 'Entrez votre numéro avec indicatif, puis réessayez.' });
      return;
    }
    setRecovering(true);
    setRecovery(null);
    setError('');
    try {
      const result = await api.auth.recoverByPhone(phone.trim());
      setRecovery(result);
    } catch {
      setRecovery({ found: false, message: 'Vérification impossible maintenant. Réessayez avec une connexion stable.' });
    } finally {
      setRecovering(false);
    }
  }

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', boxSizing:'border-box', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ width:72, height:72, borderRadius:22, background:DEEP, border:'1px solid rgba(16,42,42,0.14)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, boxShadow:`0 8px 24px rgba(16,42,42,0.22)` }}>
        <svg width="38" height="38" fill="none" viewBox="0 0 24 24">
          <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
          <circle cx="8.5" cy="12" r="1.3" fill={ACCENT}/>
          <circle cx="12" cy="12" r="1.3" fill={ACCENT}/>
          <circle cx="15.5" cy="12" r="1.3" fill={ACCENT}/>
        </svg>
      </div>

      <h1 style={{ fontSize:26, fontWeight:800, color:'var(--text-primary)', margin:'0 0 6px', textAlign:'center' }}>Oracle Messenger</h1>
      <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'0 0 24px', textAlign:'center', maxWidth:340, lineHeight:1.5 }}>
        Connectez-vous avec Google. Votre numéro sera demandé ensuite pour aider vos contacts à vous retrouver.
      </p>

      {error && (
        <div style={{ width:'100%', maxWidth:360, margin:'0 0 14px', padding:'12px 16px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, color:'#dc2626', fontSize:13, textAlign:'center' }}>
          {error}
        </div>
      )}

      <button onClick={handleGoogleLogin} disabled={loading}
        style={{ width:'100%', maxWidth:360, background:DEEP, color:'#fff', border:'none', borderRadius:28, padding:'16px 22px', fontSize:16, fontWeight:800, cursor:loading?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:12, boxShadow:'0 8px 22px rgba(16,42,42,0.22)' }}>
        {loading ? (
          <div style={{ width:20, height:20, border:'3px solid rgba(255,255,255,0.35)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        ) : (
          <>
            <span style={{ width:24, height:24, borderRadius:'50%', background:'#fff', color:'var(--text-primary)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:900 }}>G</span>
            Continuer avec Google
          </>
        )}
      </button>

      <div style={{ width:'100%', maxWidth:360, marginTop:18, border:'1px solid var(--border)', borderRadius:18, padding:14, background:'#F8FAFC', boxSizing:'border-box' }}>
        <p style={{ margin:'0 0 5px', fontSize:14, fontWeight:900, color:'var(--text-primary)' }}>Retrouver mon compte</p>
        <p style={{ margin:'0 0 10px', fontSize:12.5, lineHeight:1.45, color:'var(--text-muted)', fontWeight:650 }}>
          Entrez votre numéro. Si ce numéro est lié à un compte, Oracle affiche le Gmail masqué à utiliser.
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+225 07..."
            inputMode="tel"
            style={{ flex:1, minWidth:0, border:'1px solid var(--border)', borderRadius:14, padding:'11px 12px', fontSize:14, outline:'none', color:'var(--text-primary)', background:'#fff', boxSizing:'border-box' }}
          />
          <button
            onClick={handleRecoverPhone}
            disabled={recovering}
            style={{ border:'none', borderRadius:14, padding:'0 13px', minWidth:86, background:DEEP, color:'#fff', fontSize:13, fontWeight:900, cursor:recovering?'default':'pointer', opacity:recovering ? .7 : 1 }}
          >
            {recovering ? '...' : 'Vérifier'}
          </button>
        </div>
        {recovery && (
          <div style={{ marginTop:10, borderRadius:12, padding:'10px 11px', background:recovery.found ? '#ECFDF5' : '#FEF2F2', border:`1px solid ${recovery.found ? '#BBF7D0' : '#FECACA'}` }}>
            {recovery.found && recovery.emailHint && (
              <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:900, color:'#065F46' }}>
                Gmail associé : {recovery.emailHint}
              </p>
            )}
            <p style={{ margin:0, fontSize:12.5, lineHeight:1.45, color:recovery.found ? '#047857' : '#B91C1C', fontWeight:700 }}>
              {recovery.message}
            </p>
          </div>
        )}
      </div>

      <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', lineHeight:1.6, maxWidth:320, margin:'22px 0 0' }}>
        Le numéro aide à retrouver le bon compte Google. La connexion reste protégée par Google.
      </p>
    </div>
  );
}

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <Spinner />;
  return <LoginContent />;
}
