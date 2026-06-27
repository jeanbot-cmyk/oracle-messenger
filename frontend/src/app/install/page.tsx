'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

export default function InstallPage() {
  const { lang } = useSettings();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') window.location.href = '/';
    }
  }

  if (!mounted) return null;

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-app)', padding:24, textAlign:'center' }}>
      <div style={{ width:96, height:96, borderRadius:24, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:24, boxShadow:'0 8px 32px rgba(0,168,132,.3)' }}>
        <svg width="52" height="52" fill="none" stroke="white" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h1 style={{ fontSize:26, fontWeight:700, color:'var(--text-primary)', margin:'0 0 8px' }}>Oracle Messenger</h1>
      <p style={{ color:'var(--text-muted)', fontSize:15, margin:'0 0 32px', maxWidth:320 }}>{t(lang,'pwa.install.sub')}</p>
      {isIOS ? (
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, maxWidth:340, boxShadow:'0 2px 16px rgba(0,0,0,.08)' }}>
          <p style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:16, fontSize:16 }}>Installation sur iPhone / iPad</p>
          <div style={{ display:'flex', flexDirection:'column', gap:12, textAlign:'left' }}>
            {[['⬆️','Appuyez sur le bouton Partager'],['➕','"Sur l\'écran d\'accueil"'],['✅','Appuyez sur "Ajouter"']].map(([icon,label]) => (
              <div key={icon} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:22 }}>{icon}</span>
                <span style={{ fontSize:14, color:'var(--text-primary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : deferredPrompt ? (
        <button onClick={handleInstall} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:14, padding:'16px 40px', fontSize:16, fontWeight:600, cursor:'pointer' }}>
          📲 {t(lang,'pwa.install.btn')}
        </button>
      ) : (
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, maxWidth:340 }}>
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Menu du navigateur → <strong>"Ajouter à l'écran d'accueil"</strong></p>
        </div>
      )}
    </div>
  );
}
