'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';

// Capturer le prompt natif le plus tôt possible
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    (window as any).__pwaPrompt = e;
  });
}

type Device = 'android' | 'samsung' | 'ios' | 'other';
function detectDevice(): Device {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/samsungbrowser/.test(ua)) return 'samsung';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

const MANUAL: Record<Device, { icon: string; text: string }[]> = {
  android: [
    { icon: '⋮', text: 'Appuyez sur les 3 points en haut à droite' },
    { icon: '📲', text: 'Sélectionnez "Installer l\'application"' },
    { icon: '✅', text: 'Confirmez — l\'app s\'ouvre automatiquement' },
  ],
  samsung: [
    { icon: '☰', text: 'Appuyez sur les 3 lignes du navigateur Samsung' },
    { icon: '➕', text: '"Ajouter page à" → "Écran d\'accueil"' },
    { icon: '✅', text: 'Appuyez sur "Ajouter"' },
  ],
  ios: [
    { icon: '⬆️', text: 'Bouton Partager en bas de Safari' },
    { icon: '➕', text: '"Sur l\'écran d\'accueil"' },
    { icon: '✅', text: '"Ajouter" en haut à droite' },
  ],
  other: [
    { icon: '📥', text: 'Icône d\'installation dans la barre d\'adresse' },
    { icon: '✅', text: 'Confirmez l\'installation' },
  ],
};

export default function InstallPage() {
  const [device, setDevice]       = useState<Device>('android');
  const [hasPrompt, setHasPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [mounted, setMounted]     = useState(false);

  useEffect(() => {
    setMounted(true);
    setDevice(detectDevice());

    // Déjà en standalone → redirect (no cookie — allows reinstall)
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    ) {
      window.location.replace('/');
      return;
    }

    // Support both __pwaPrompt (legacy) and __installPrompt (new)
    if ((window as any).__pwaPrompt || (window as any).__installPrompt) setHasPrompt(true);

    const h = (e: any) => {
      e.preventDefault();
      (window as any).__pwaPrompt = e;
      (window as any).__installPrompt = e;
      setHasPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', () => {
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
      setInstalled(true);
      setTimeout(() => window.location.replace('/'), 1600);
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  async function handleInstall() {
    const prompt = (window as any).__pwaPrompt || (window as any).__installPrompt;
    if (prompt) {
      setInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
          setInstalled(true);
          setTimeout(() => window.location.replace('/'), 1600);
        }
      } catch {}
      setInstalling(false);
    } else {
      setShowManual(true);
    }
  }

  if (!mounted) return null;

  if (installed) return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#fff', gap:16 }}>
      <div style={{ fontSize:72 }}>✅</div>
      <h2 style={{ fontSize:24, fontWeight:700, color:'#111b21' }}>Installation réussie !</h2>
      <p style={{ color:'#667781', fontSize:15 }}>Ouverture d'Oracle Messenger…</p>
    </div>
  );

  return (
    <div style={{ minHeight:'100dvh', background:'#ffffff', display:'flex', flexDirection:'column', alignItems:'center', padding:'0 24px 40px', boxSizing:'border-box' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>

      {/* Illustration SVG originale */}
      <div style={{ marginTop:60, marginBottom:32, animation:'float 3s ease-in-out infinite' }}>
        <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
          {/* Bulle principale */}
          <rect x="30" y="40" width="130" height="90" rx="20" fill="#d9fdd3" stroke="#00a884" strokeWidth="2"/>
          {/* Queue bulle */}
          <path d="M50 130 L35 150 L70 130Z" fill="#d9fdd3" stroke="#00a884" strokeWidth="1.5" strokeLinejoin="round"/>
          {/* Lignes texte */}
          <rect x="50" y="65" width="90" height="8" rx="4" fill="#00a884" opacity="0.5"/>
          <rect x="50" y="82" width="70" height="8" rx="4" fill="#00a884" opacity="0.35"/>
          <rect x="50" y="99" width="50" height="8" rx="4" fill="#00a884" opacity="0.25"/>
          {/* Bulle secondaire */}
          <rect x="110" y="20" width="90" height="60" rx="16" fill="#f0f2f5" stroke="#e9edef" strokeWidth="1.5"/>
          <path d="M190 80 L200 95 L175 80Z" fill="#f0f2f5" stroke="#e9edef" strokeWidth="1" strokeLinejoin="round"/>
          <rect x="125" y="38" width="60" height="7" rx="3.5" fill="#8696a0" opacity="0.5"/>
          <rect x="125" y="52" width="45" height="7" rx="3.5" fill="#8696a0" opacity="0.35"/>
          {/* Cadenas */}
          <rect x="148" y="130" width="36" height="30" rx="6" fill="#00a884"/>
          <path d="M155 130 V122 a11 11 0 0 1 22 0 V130" stroke="#00a884" strokeWidth="4" fill="none" strokeLinecap="round"/>
          <circle cx="166" cy="145" r="4" fill="white"/>
          <rect x="164" y="145" width="4" height="7" rx="2" fill="white"/>
          {/* Cœur */}
          <path d="M68 28 C68 24 72 20 76 24 C80 20 84 24 84 28 C84 34 76 40 76 40 C76 40 68 34 68 28Z" fill="#00a884"/>
          {/* Globe */}
          <circle cx="185" cy="50" r="18" fill="none" stroke="#00a884" strokeWidth="2"/>
          <ellipse cx="185" cy="50" rx="8" ry="18" fill="none" stroke="#00a884" strokeWidth="1.5"/>
          <line x1="167" y1="50" x2="203" y2="50" stroke="#00a884" strokeWidth="1.5"/>
          <line x1="170" y1="38" x2="200" y2="38" stroke="#00a884" strokeWidth="1"/>
          <line x1="170" y1="62" x2="200" y2="62" stroke="#00a884" strokeWidth="1"/>
          {/* Téléphone */}
          <rect x="32" y="18" width="22" height="36" rx="5" fill="none" stroke="#00a884" strokeWidth="2"/>
          <line x1="38" y1="48" x2="48" y2="48" stroke="#00a884" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Texte */}
      <h1 style={{ fontSize:26, fontWeight:800, color:'#111b21', textAlign:'center', margin:'0 0 12px', lineHeight:1.2 }}>
        Bienvenue sur<br/>Oracle Messenger
      </h1>
      <p style={{ fontSize:14, color:'#667781', textAlign:'center', lineHeight:1.6, margin:'0 0 8px', maxWidth:300 }}>
        Votre application de messagerie rapide et sécurisée.
      </p>
      <p style={{ fontSize:12, color:'#8696a0', textAlign:'center', margin:'0 0 36px', maxWidth:320, lineHeight:1.5 }}>
        Consultez nos{' '}
        <a href="/privacy" style={{ color:'#00a884', fontWeight:600 }}>Politiques de confidentialité</a>.
        En continuant, vous acceptez nos{' '}
        <a href="/terms" style={{ color:'#00a884', fontWeight:600 }}>Conditions d'utilisation</a>.
      </p>

      {/* Bouton principal */}
      <button
        onClick={handleInstall}
        disabled={installing}
        style={{
          width:'100%', maxWidth:380,
          background:'#00a884', color:'#fff',
          border:'none', borderRadius:28,
          padding:'18px 24px',
          fontSize:17, fontWeight:700,
          cursor: installing ? 'not-allowed' : 'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:12,
          boxShadow:'0 4px 20px rgba(0,168,132,0.35)',
          opacity: installing ? 0.85 : 1,
          transition:'transform 0.1s, opacity 0.1s',
          marginBottom: 16,
        }}
      >
        {installing ? (
          <><div style={{ width:20, height:20, border:'3px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> Installation…</>
        ) : (
          <><span style={{ fontSize:22 }}>📲</span> Installer l'application</>
        )}
      </button>

      {/* Instructions manuelles */}
      {showManual && (
        <div style={{ width:'100%', maxWidth:380, background:'#f0f2f5', borderRadius:16, padding:20, marginBottom:16 }}>
          <p style={{ fontWeight:700, fontSize:15, color:'#111b21', marginBottom:14, textAlign:'center' }}>
            {device === 'ios' ? '📱 iPhone / iPad' : device === 'samsung' ? '📱 Samsung Browser' : '📱 Android Chrome'}
          </p>
          {MANUAL[device].map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, marginBottom: i < MANUAL[device].length-1 ? 12 : 0 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'#00a884', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, flexShrink:0 }}>{i+1}</div>
              <span style={{ fontSize:20, flexShrink:0 }}>{s.icon}</span>
              <p style={{ fontSize:14, color:'#111b21', margin:0, lineHeight:1.4 }}>{s.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Déjà installé */}
      <button
        onClick={() => { document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax'; window.location.replace('/'); }}
        style={{ background:'transparent', border:'none', color:'#8696a0', cursor:'pointer', fontSize:14, padding:'8px 0' }}
      >
        J'ai déjà installé → Continuer
      </button>
    </div>
  );
}
