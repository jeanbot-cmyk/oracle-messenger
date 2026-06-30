'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const ACCENT = '#128C7E';

type Device = 'ios' | 'android' | 'other';

function detectDevice(): Device {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const promptRef = useRef<any>(null);
  const [device, setDevice] = useState<Device>('android');
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [iosStep, setIosStep] = useState(0);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    setMounted(true);
    const d = detectDevice();
    setDevice(d);

    // Already running as installed PWA → go to app
    if (isStandalone()) {
      router.replace(status === 'authenticated' ? '/chat' : '/login');
      return;
    }

    const handler = (e: any) => { e.preventDefault(); promptRef.current = e; (window as any).__installPrompt = e; };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setTimeout(() => router.replace(status === 'authenticated' ? '/chat' : '/onboarding'), 1500);
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && isStandalone()) router.replace('/chat');
  }, [status]);

  function handleInstall() {
    if (detectDevice() === 'ios') { setShowIos(true); return; }
    const prompt = promptRef.current || (window as any).__installPrompt;
    if (prompt) {
      prompt.prompt();
      setInstalling(true);
      prompt.userChoice.then((c: any) => {
        if (c.outcome === 'accepted') { setInstalled(true); setTimeout(() => router.replace(status === 'authenticated' ? '/chat' : '/onboarding'), 1500); }
        setInstalling(false);
      }).catch(() => setInstalling(false));
      return;
    }
    setInstalling(true);
    const wait = (e: any) => {
      e.preventDefault(); promptRef.current = e; window.removeEventListener('beforeinstallprompt', wait);
      e.prompt();
      e.userChoice.then((c: any) => {
        if (c.outcome === 'accepted') { setInstalled(true); setTimeout(() => router.replace(status === 'authenticated' ? '/chat' : '/onboarding'), 1500); }
        setInstalling(false);
      }).catch(() => setInstalling(false));
    };
    window.addEventListener('beforeinstallprompt', wait);
    setTimeout(() => { window.removeEventListener('beforeinstallprompt', wait); setInstalling(false); }, 8000);
  }

  function handleOpen() { router.replace(status === 'authenticated' ? '/chat' : '/login'); }

  if (!mounted) return null;

  if (installed) return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#fff', gap:20, padding:32, textAlign:'center', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:ACCENT, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <h2 style={{ fontSize:24, fontWeight:800, color:'#111b21', margin:0 }}>Installé !</h2>
      <p style={{ color:'#667781', fontSize:15, margin:0 }}>Ouverture d'Oracle Messenger…</p>
    </div>
  );

  if (showIos) {
    const steps = [
      { icon:'📤', title:'Appuyez sur Partager', desc:'En bas de Safari, appuyez sur le bouton Partager (carré avec une flèche vers le haut).' },
      { icon:'➕', title:'"Sur l\'écran d\'accueil"', desc:'Faites défiler le menu Partager vers le bas et appuyez sur "Sur l\'écran d\'accueil".' },
      { icon:'✅', title:'Appuyez sur "Ajouter"', desc:'En haut à droite de la fenêtre, appuyez sur "Ajouter". Oracle Messenger est installé !' },
    ];
    const step = steps[iosStep];
    return (
      <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#fff', fontFamily:'system-ui,-apple-system,sans-serif' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ padding:'20px 24px 0', display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => iosStep > 0 ? setIosStep(s=>s-1) : setShowIos(false)}
            style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'#f0f2f5', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>←</button>
          <p style={{ fontSize:12, color:'#8696a0', margin:0, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>iPhone · Étape {iosStep+1} / {steps.length}</p>
        </div>
        <div style={{ margin:'12px 24px 0', height:4, background:'#f0f2f5', borderRadius:2 }}>
          <div style={{ height:'100%', background:ACCENT, borderRadius:2, width:`${((iosStep+1)/steps.length)*100}%`, transition:'width 0.3s' }}/>
        </div>
        <div key={iosStep} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px', animation:'fadeIn 0.25s ease', gap:24, textAlign:'center' }}>
          <div style={{ width:90, height:90, borderRadius:'50%', background:`${ACCENT}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:48 }}>{step.icon}</div>
          <div>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#111b21', margin:'0 0 12px' }}>{step.title}</h2>
            <p style={{ fontSize:15, color:'#667781', lineHeight:1.6, margin:0 }}>{step.desc}</p>
          </div>
        </div>
        <div style={{ padding:'0 24px 44px', display:'flex', flexDirection:'column', gap:12 }}>
          {iosStep < steps.length-1
            ? <button onClick={() => setIosStep(s=>s+1)} style={{ width:'100%', background:ACCENT, color:'#fff', border:'none', borderRadius:28, padding:'18px', fontSize:17, fontWeight:700, cursor:'pointer' }}>Suivant →</button>
            : <button onClick={handleOpen} style={{ width:'100%', background:ACCENT, color:'#fff', border:'none', borderRadius:28, padding:'18px', fontSize:17, fontWeight:700, cursor:'pointer' }}>Ouvrir Oracle Messenger →</button>
          }
          <button onClick={handleOpen} style={{ width:'100%', background:'transparent', color:'#8696a0', border:'1.5px solid #e9edef', borderRadius:28, padding:'14px', fontSize:14, cursor:'pointer' }}>Accéder sans installer</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', flexDirection:'column', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Hero */}
      <div style={{ background:`linear-gradient(160deg,${ACCENT} 0%,#075E54 100%)`, padding:'64px 32px 80px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }}/>
        <div style={{ position:'absolute', bottom:-60, left:-30, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>
        <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:96, height:96, borderRadius:28, background:'rgba(255,255,255,0.15)', marginBottom:22, animation:'float 3s ease-in-out infinite', border:'1.5px solid rgba(255,255,255,0.2)' }}>
          <svg width="54" height="54" fill="none" viewBox="0 0 24 24">
            <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
            <circle cx="8.5" cy="12" r="1.4" fill={ACCENT}/><circle cx="12" cy="12" r="1.4" fill={ACCENT}/><circle cx="15.5" cy="12" r="1.4" fill={ACCENT}/>
          </svg>
        </div>
        <h1 style={{ fontSize:30, fontWeight:900, color:'#fff', margin:'0 0 10px', letterSpacing:-0.5 }}>Oracle Messenger</h1>
        <p style={{ fontSize:16, color:'rgba(255,255,255,0.88)', margin:'0 0 6px', lineHeight:1.5 }}>Votre application de messagerie<br/>et de gestion d'entreprise</p>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', margin:0 }}>Rapide · Sécurisée · Professionnelle</p>
      </div>

      {/* Features */}
      <div style={{ padding:'28px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        {[
          { icon:'💬', title:'Messagerie instantanée', desc:'Messages, photos, vidéos et fichiers en temps réel' },
          { icon:'📞', title:'Appels audio & vidéo', desc:'Appels HD individuels et en groupe' },
          { icon:'🏢', title:'Outils entreprise', desc:'Gestion clients, rappels, broadcast et plus' },
          { icon:'🔒', title:'Privé & sécurisé', desc:'Vos données restent sur votre appareil' },
        ].map((f,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'#f8fffe', borderRadius:16, border:'1px solid #e8f5f3' }}>
            <div style={{ width:46, height:46, borderRadius:13, background:`${ACCENT}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{f.icon}</div>
            <div>
              <p style={{ fontSize:15, fontWeight:700, color:'#111b21', margin:'0 0 2px' }}>{f.title}</p>
              <p style={{ fontSize:13, color:'#8696a0', margin:0 }}>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding:'8px 24px 48px', display:'flex', flexDirection:'column', gap:12, marginTop:'auto' }}>
        <button onClick={handleInstall} disabled={installing}
          style={{ width:'100%', background:installing?'#8696a0':ACCENT, color:'#fff', border:'none', borderRadius:28, padding:'20px 24px', fontSize:18, fontWeight:800, cursor:installing?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:12, boxShadow:`0 6px 24px ${ACCENT}55` }}>
          {installing ? (
            <><div style={{ width:22, height:22, border:'3px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>Installation…</>
          ) : device === 'ios' ? (
            <><svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16"/></svg>Ajouter à l'écran d'accueil</>
          ) : (
            <><svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Installer l'application</>
          )}
        </button>
        <button onClick={handleOpen}
          style={{ width:'100%', background:'transparent', color:'#667781', border:'1.5px solid #e9edef', borderRadius:28, padding:'14px', fontSize:15, fontWeight:500, cursor:'pointer' }}>
          Accéder sans installer
        </button>
        <p style={{ fontSize:11, color:'#8696a0', textAlign:'center', margin:'4px 0 0', lineHeight:1.6 }}>
          En continuant, vous acceptez nos <a href="/terms" style={{ color:ACCENT }}>Conditions</a> et <a href="/privacy" style={{ color:ACCENT }}>Politique de confidentialité</a>.
        </p>
      </div>
    </div>
  );
}
