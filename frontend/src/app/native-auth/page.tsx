'use client';

import { useEffect, useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function Spinner() {
  return (
    <div style={{ width:34, height:34, border:'3px solid #D7E3DF', borderTopColor:'#102A2A', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
  );
}

export default function NativeAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams?.get('token') ?? '';
    if (!token) {
      setError('Session Google introuvable. Reconnectez-vous avec Google.');
      return;
    }

    let cancelled = false;
    async function finishNativeLogin() {
      try {
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch {}

        const result = await signIn('native-token', {
          token,
          redirect: false,
        });
        if (cancelled) return;
        if (!result?.ok) {
          setError('Connexion Messenger impossible. Reconnectez-vous avec Google.');
          return;
        }

        const session = await getSession();
        router.replace((session?.user as any)?.isNew ? '/onboarding' : '/chat');
      } catch {
        if (!cancelled) setError('Connexion Messenger impossible. Réessayez avec une connexion stable.');
      }
    }

    finishNativeLogin();
    return () => { cancelled = true; };
  }, [router, searchParams]);

  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:24, textAlign:'center', background:'#fff', color:'#102A2A' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {!error && <Spinner />}
      <h1 style={{ margin:0, fontSize:20, fontWeight:900 }}>{error ? 'Connexion à reprendre' : 'Ouverture Oracle Messenger'}</h1>
      <p style={{ margin:0, maxWidth:320, fontSize:14, lineHeight:1.45, color:error ? '#B42318' : '#5E6D69', fontWeight:700 }}>
        {error || 'Votre session est en cours de validation.'}
      </p>
      {error && (
        <button onClick={() => router.replace('/login')} style={{ border:'none', borderRadius:24, background:'#102A2A', color:'#fff', padding:'12px 18px', fontSize:14, fontWeight:900 }}>
          Retour connexion
        </button>
      )}
    </div>
  );
}
