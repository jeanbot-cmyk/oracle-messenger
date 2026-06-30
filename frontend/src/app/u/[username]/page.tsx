'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Props { params: { username: string }; }

// Client component — gère la session et redirige correctement
export default function UserLandingPage({ params }: Props) {
  const { username } = params;
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      router.replace(`/contacts?from=${username}`);
    } else {
      sessionStorage.setItem('oracle-after-login', `/contacts?from=${username}`);
      router.replace(`/login?from=${username}`);
    }
  }, [status, username]);

  return (
    <div style={{ margin:0, fontFamily:'system-ui,sans-serif', background:'#f0f2f5', display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign:'center', padding:32 }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:'#128C7E', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:40 }}>
          💬
        </div>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#111b21', margin:'0 0 8px' }}>Oracle Messenger</h1>
        <p style={{ fontSize:15, color:'#667781', margin:'0 0 24px' }}>
          <strong>@{username}</strong> vous invite à discuter
        </p>
        <div style={{ width:32, height:32, border:'3px solid #e9edef', borderTopColor:'#128C7E', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }}/>
        <p style={{ fontSize:12, color:'#8696a0', marginTop:16 }}>Chargement…</p>
      </div>
    </div>
  );
}
