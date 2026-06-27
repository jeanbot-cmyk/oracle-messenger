'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isSamsung, setIsSamsung] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setMounted(true);
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsSamsung(/samsungbrowser/.test(ua));

    // Déjà installé en standalone ?
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setInstalled(true);
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
      setTimeout(() => { window.location.href = '/'; }, 1500);
    }

    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
      setTimeout(() => { window.location.href = '/'; }, 2000);
    });
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
    }
  }

  if (!mounted) return null;

  if (installed) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#00a884 0%,#008f72 100%)', padding:24, textAlign:'center' }}>
      <div style={{ fontSize:80, marginBottom:16 }}>✅</div>
      <h1 style={{ color:'#fff', fontSize:26, fontWeight:800, margin:'0 0 8px' }}>Installé !</h1>
      <p style={{ color:'rgba(255,255,255,.85)', fontSize:16 }}>Ouverture d'Oracle Messenger…</p>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#00a884 0%,#005c4b 100%)', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 20px 32px' }}>

      {/* Logo */}
      <div style={{ width:100, height:100, borderRadius:28, background:'rgba(255,255,255,.2)', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, boxShadow:'0 8px 32px rgba(0,0,0,.2)' }}>
        <svg width="56" height="56" fill="none" stroke="white" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>

      <h1 style={{ color:'#fff', fontSize:30, fontWeight:800, margin:'0 0 6px', textAlign:'center' }}>Oracle Messenger</h1>
      <p style={{ color:'rgba(255,255,255,.8)', fontSize:16, margin:'0 0 32px', textAlign:'center' }}>
        Messagerie souveraine · Gratuit · Sécurisé
      </p>

      {/* Bouton Android direct */}
      {deferredPrompt && (
        <button onClick={handleInstall} style={{
          width:'100%', maxWidth:360, padding:'18px 24px', borderRadius:16,
          background:'#fff', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:12,
          fontSize:18, fontWeight:700, color:'#00a884',
          boxShadow:'0 8px 32px rgba(0,0,0,.25)', marginBottom:24,
        }}>
          <span style={{ fontSize:28 }}>📲</span>
          Installer l'application
        </button>
      )}

      {/* Card instructions */}
      <div style={{ width:'100%', maxWidth:360, background:'rgba(255,255,255,.15)', backdropFilter:'blur(12px)', borderRadius:20, padding:24, border:'1px solid rgba(255,255,255,.25)' }}>

        {isIOS ? (
          <>
            <p style={{ color:'#fff', fontWeight:700, fontSize:17, margin:'0 0 20px', textAlign:'center' }}>
              📱 Installation sur iPhone / iPad
            </p>
            {[
              { icon:'⬆️', title:'Appuyez sur Partager', desc:'Le bouton en bas de Safari (carré avec flèche)' },
              { icon:'➕', title:'"Sur l\'écran d\'accueil"', desc:'Faites défiler et appuyez sur cette option' },
              { icon:'✅', title:'Appuyez sur "Ajouter"', desc:'L\'app apparaît sur votre écran d\'accueil' },
            ].map((s, i) => (
              <div key={i} style={{ display:'flex', gap:14, marginBottom: i < 2 ? 16 : 0 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{s.icon}</div>
                <div>
                  <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 2px' }}>{s.title}</p>
                  <p style={{ color:'rgba(255,255,255,.7)', fontSize:13, margin:0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </>
        ) : isSamsung ? (
          <>
            <p style={{ color:'#fff', fontWeight:700, fontSize:17, margin:'0 0 20px', textAlign:'center' }}>
              📱 Installation sur Samsung
            </p>
            {[
              { icon:'⋮', title:'Menu en haut à droite', desc:'Appuyez sur les 3 points du navigateur Samsung' },
              { icon:'➕', title:'"Ajouter page à"', desc:'Puis "Écran d\'accueil"' },
              { icon:'✅', title:'Confirmez', desc:'Appuyez sur "Ajouter" — c\'est fait !' },
            ].map((s, i) => (
              <div key={i} style={{ display:'flex', gap:14, marginBottom: i < 2 ? 16 : 0 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{s.icon}</div>
                <div>
                  <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 2px' }}>{s.title}</p>
                  <p style={{ color:'rgba(255,255,255,.7)', fontSize:13, margin:0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <p style={{ color:'#fff', fontWeight:700, fontSize:17, margin:'0 0 20px', textAlign:'center' }}>
              📱 Installation sur Android (Chrome)
            </p>
            {[
              { icon:'⋮', title:'Menu Chrome (3 points)', desc:'En haut à droite de votre navigateur' },
              { icon:'📲', title:'"Ajouter à l\'écran d\'accueil"', desc:'Ou "Installer l\'application"' },
              { icon:'✅', title:'Appuyez sur "Installer"', desc:'L\'app s\'ouvre automatiquement !' },
            ].map((s, i) => (
              <div key={i} style={{ display:'flex', gap:14, marginBottom: i < 2 ? 16 : 0 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{s.icon}</div>
                <div>
                  <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 2px' }}>{s.title}</p>
                  <p style={{ color:'rgba(255,255,255,.7)', fontSize:13, margin:0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pourquoi installer */}
      <div style={{ width:'100%', maxWidth:360, marginTop:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {[
          { icon:'⚡', label:'Ultra rapide' },
          { icon:'🔒', label:'100% sécurisé' },
          { icon:'📵', label:'Hors ligne' },
          { icon:'🔔', label:'Notifications' },
        ].map(f => (
          <div key={f.label} style={{ background:'rgba(255,255,255,.12)', borderRadius:14, padding:'14px 12px', display:'flex', alignItems:'center', gap:10, border:'1px solid rgba(255,255,255,.2)' }}>
            <span style={{ fontSize:24 }}>{f.icon}</span>
            <span style={{ color:'#fff', fontSize:14, fontWeight:600 }}>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Lien direct si déjà installé */}
      <button onClick={() => { document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax'; window.location.href = '/'; }}
        style={{ marginTop:24, background:'transparent', border:'1px solid rgba(255,255,255,.4)', borderRadius:12, padding:'10px 24px', color:'rgba(255,255,255,.8)', cursor:'pointer', fontSize:14 }}>
        J'ai déjà installé → Ouvrir
      </button>
    </div>
  );
}
