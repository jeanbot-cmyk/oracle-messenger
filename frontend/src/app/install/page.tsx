'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';

const ACCENT = '#128C7E';

type Device = 'ios' | 'android' | 'other';
function detectDevice(): Device {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

const IOS_STEPS = [
  {
    title: 'Appuyez sur Partager',
    desc: 'En bas de Safari, appuyez sur le bouton Partager (carré avec une flèche vers le haut).',
    svg: (
      <svg viewBox="0 0 280 200" fill="none" style={{ width: '100%', maxWidth: 260 }}>
        <rect x="60" y="10" width="160" height="180" rx="18" fill="#f0f2f5" stroke="#e9edef" strokeWidth="2"/>
        <rect x="68" y="20" width="144" height="160" rx="12" fill="#fff"/>
        <rect x="68" y="20" width="144" height="28" rx="12" fill="#f8f9fa"/>
        <rect x="80" y="28" width="100" height="12" rx="6" fill="#e9edef"/>
        <rect x="68" y="158" width="144" height="22" rx="0" fill="#f8f9fa"/>
        {/* Share button */}
        <rect x="128" y="161" width="24" height="16" rx="4" fill={ACCENT} opacity="0.2"/>
        <rect x="134" y="163" width="12" height="8" rx="2" fill={ACCENT} opacity="0.5"/>
        <path d="M140 163 L140 158 M137 160 L140 157 L143 160" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Arrow */}
        <path d="M140 140 L140 152" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M135 147 L140 152 L145 147" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="140" cy="169" r="14" stroke={ACCENT} strokeWidth="1.5" opacity="0.3"/>
      </svg>
    ),
  },
  {
    title: '"Sur l\'écran d\'accueil"',
    desc: 'Dans le menu Partager, faites défiler vers le bas et appuyez sur "Sur l\'écran d\'accueil".',
    svg: (
      <svg viewBox="0 0 280 200" fill="none" style={{ width: '100%', maxWidth: 260 }}>
        <rect x="20" y="80" width="240" height="110" rx="16" fill="#fff" stroke="#e9edef" strokeWidth="1.5"/>
        <rect x="20" y="80" width="240" height="32" rx="16" fill="#f8f9fa"/>
        <rect x="100" y="90" width="80" height="10" rx="5" fill="#e9edef"/>
        {/* Highlighted row */}
        <rect x="36" y="122" width="208" height="36" rx="10" fill={ACCENT} opacity="0.1"/>
        <rect x="36" y="122" width="208" height="36" rx="10" stroke={ACCENT} strokeWidth="1.5"/>
        <path d="M56 140 L62 133 L68 140 L68 147 L64 147 L64 143 L60 143 L60 147 L56 147 Z" fill={ACCENT}/>
        <rect x="76" y="136" width="90" height="8" rx="4" fill={ACCENT}/>
        {/* Other rows */}
        <rect x="36" y="166" width="208" height="18" rx="8" fill="#f0f2f5"/>
        <rect x="52" y="172" width="100" height="6" rx="3" fill="#e9edef"/>
      </svg>
    ),
  },
  {
    title: 'Appuyez sur "Ajouter"',
    desc: 'En haut à droite de la fenêtre qui s\'ouvre, appuyez sur "Ajouter".',
    svg: (
      <svg viewBox="0 0 280 200" fill="none" style={{ width: '100%', maxWidth: 260 }}>
        <rect x="30" y="40" width="220" height="130" rx="16" fill="#fff" stroke="#e9edef" strokeWidth="1.5"/>
        <rect x="30" y="40" width="220" height="38" rx="16" fill="#f8f9fa"/>
        <rect x="46" y="52" width="60" height="10" rx="5" fill="#e9edef"/>
        {/* Ajouter button */}
        <rect x="188" y="46" width="48" height="26" rx="8" fill={ACCENT}/>
        <rect x="196" y="54" width="32" height="8" rx="4" fill="#fff"/>
        {/* App icon */}
        <rect x="110" y="95" width="60" height="60" rx="14" fill={ACCENT} opacity="0.15"/>
        <rect x="118" y="103" width="44" height="44" rx="10" fill={ACCENT} opacity="0.3"/>
        <circle cx="140" cy="125" r="11" stroke={ACCENT} strokeWidth="2.5" fill="none"/>
        <circle cx="140" cy="125" r="4" fill={ACCENT}/>
        {/* Arrow to button */}
        <path d="M200 72 L212 56" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"/>
        <circle cx="213" cy="54" r="5" fill={ACCENT}/>
      </svg>
    ),
  },
  {
    title: 'C\'est installé !',
    desc: 'Oracle Messenger est maintenant sur votre écran d\'accueil. Appuyez sur l\'icône pour l\'ouvrir.',
    svg: (
      <svg viewBox="0 0 280 200" fill="none" style={{ width: '100%', maxWidth: 260 }}>
        <rect x="60" y="10" width="160" height="180" rx="18" fill="#1a1a2e" stroke="#333" strokeWidth="2"/>
        <rect x="68" y="20" width="144" height="160" rx="12" fill="#1a1a2e"/>
        {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => (
          <rect key={i} x={82+(i%4)*34} y={38+Math.floor(i/4)*44} width="26" height="26" rx="6"
            fill={i===8 ? ACCENT : '#ffffff18'}/>
        ))}
        <circle cx="95" cy="173" r="4" fill="#ffffff44"/>
        <circle cx="140" cy="173" r="5" fill="#fff"/>
        <circle cx="185" cy="173" r="4" fill="#ffffff44"/>
        {/* Oracle icon */}
        <circle cx="95" cy="173" r="0" fill="none"/>
        <circle cx="140" cy="51" r="8" stroke="#fff" strokeWidth="2" fill="none"/>
        <circle cx="140" cy="51" r="3" fill="#fff"/>
        {/* Big checkmark */}
        <circle cx="196" cy="56" r="24" fill={ACCENT}/>
        <path d="M185 56 L193 64 L209 48" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function InstallPage() {
  const [device,     setDevice]     = useState<Device>('android');
  const [installing, setInstalling] = useState(false);
  const [installed,  setInstalled]  = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [iosStep,    setIosStep]    = useState(0);
  const promptRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    setDevice(detectDevice());

    // Already installed → go straight to app
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    ) {
      window.location.replace('/');
      return;
    }

    // Capture prompt (may already be set by layout.tsx inline script)
    if ((window as any).__installPrompt) {
      promptRef.current = (window as any).__installPrompt;
    }

    const handler = (e: any) => {
      e.preventDefault();
      promptRef.current = e;
      (window as any).__installPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setTimeout(() => window.location.replace('/'), 1800);
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function handleAndroidInstall() {
    const prompt = promptRef.current || (window as any).__installPrompt;

    if (prompt) {
      // Call synchronously — must stay in user gesture context
      prompt.prompt();
      prompt.userChoice
        .then((choice: any) => {
          if (choice.outcome === 'accepted') {
            setInstalled(true);
            setTimeout(() => window.location.replace('/'), 1800);
          }
          setInstalling(false);
        })
        .catch(() => setInstalling(false));
      setInstalling(true);
      return;
    }

    // Prompt not yet available — show spinner and wait for it
    setInstalling(true);
    const waitHandler = (e: any) => {
      e.preventDefault();
      promptRef.current = e;
      (window as any).__installPrompt = e;
      window.removeEventListener('beforeinstallprompt', waitHandler);
      // Call immediately — we are inside the event (user gesture still valid)
      e.prompt();
      e.userChoice
        .then((choice: any) => {
          if (choice.outcome === 'accepted') {
            setInstalled(true);
            setTimeout(() => window.location.replace('/'), 1800);
          }
          setInstalling(false);
        })
        .catch(() => setInstalling(false));
    };
    window.addEventListener('beforeinstallprompt', waitHandler);
    // After 8s give up — show access button
    setTimeout(() => {
      window.removeEventListener('beforeinstallprompt', waitHandler);
      setInstalling(false);
    }, 8000);
  }

  if (!mounted) return null;

  // ── Success ──
  if (installed) return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', gap: 20, padding: 32, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111b21', margin: 0 }}>Installé !</h2>
      <p style={{ color: '#667781', fontSize: 15, margin: 0 }}>Ouverture d'Oracle Messenger…</p>
    </div>
  );

  // ── iOS step-by-step ──
  if (device === 'ios') {
    const step = IOS_STEPS[iosStep];
    const isLast = iosStep === IOS_STEPS.length - 1;
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          {iosStep > 0 && (
            <button onClick={() => setIosStep(s => s - 1)}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f0f2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#111b21', flexShrink: 0 }}>
              ←
            </button>
          )}
          <p style={{ fontSize: 12, color: '#8696a0', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            iPhone / iPad · Étape {iosStep + 1} / {IOS_STEPS.length}
          </p>
        </div>

        {/* Progress */}
        <div style={{ margin: '12px 24px 0', height: 4, background: '#f0f2f5', borderRadius: 2 }}>
          <div style={{ height: '100%', background: ACCENT, borderRadius: 2, width: `${((iosStep + 1) / IOS_STEPS.length) * 100}%`, transition: 'width 0.3s ease' }}/>
        </div>

        {/* Content */}
        <div key={iosStep} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', animation: 'fadeIn 0.25s ease', gap: 24 }}>
          {step.svg}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111b21', margin: '0 0 12px' }}>{step.title}</h2>
            <p style={{ fontSize: 15, color: '#667781', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ padding: '0 24px 44px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isLast ? (
            <button onClick={() => window.location.replace('/')}
              style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              Ouvrir Oracle Messenger →
            </button>
          ) : (
            <button onClick={() => setIosStep(s => s + 1)}
              style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              Suivant →
            </button>
          )}
          <button onClick={() => window.location.replace('/login')}
            style={{ width: '100%', background: 'transparent', color: '#8696a0', border: '1.5px solid #e9edef', borderRadius: 28, padding: '14px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Accéder sans installer
          </button>
        </div>
      </div>
    );
  }

  // ── Android / Other — native prompt ──
  return (
    <div style={{ minHeight: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px 48px', boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>

      {/* Illustration */}
      <div style={{ marginTop: 56, marginBottom: 28, animation: 'float 3s ease-in-out infinite' }}>
        <svg width="200" height="160" viewBox="0 0 200 160" fill="none">
          <rect x="20" y="30" width="120" height="85" rx="18" fill="#d9fdd3" stroke={ACCENT} strokeWidth="2"/>
          <path d="M40 115 L28 135 L60 115Z" fill="#d9fdd3" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round"/>
          <rect x="38" y="52" width="84" height="7" rx="3.5" fill={ACCENT} opacity="0.5"/>
          <rect x="38" y="67" width="64" height="7" rx="3.5" fill={ACCENT} opacity="0.35"/>
          <rect x="38" y="82" width="44" height="7" rx="3.5" fill={ACCENT} opacity="0.2"/>
          <rect x="100" y="12" width="84" height="56" rx="14" fill="#f0f2f5" stroke="#e9edef" strokeWidth="1.5"/>
          <path d="M176 68 L184 82 L162 68Z" fill="#f0f2f5" stroke="#e9edef" strokeWidth="1" strokeLinejoin="round"/>
          <rect x="114" y="28" width="56" height="6" rx="3" fill="#8696a0" opacity="0.4"/>
          <rect x="114" y="42" width="40" height="6" rx="3" fill="#8696a0" opacity="0.25"/>
          <rect x="136" y="118" width="34" height="28" rx="6" fill={ACCENT}/>
          <path d="M143 118 V111 a9 9 0 0 1 18 0 V118" stroke={ACCENT} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <circle cx="153" cy="132" r="3.5" fill="white"/>
          <rect x="151" y="132" width="4" height="6" rx="2" fill="white"/>
        </svg>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111b21', textAlign: 'center', margin: '0 0 10px', lineHeight: 1.2 }}>
        Oracle Messenger
      </h1>
      <p style={{ fontSize: 14, color: '#667781', textAlign: 'center', lineHeight: 1.6, margin: '0 0 6px', maxWidth: 300 }}>
        Messagerie rapide et sécurisée.
      </p>
      <p style={{ fontSize: 12, color: '#8696a0', textAlign: 'center', margin: '0 0 36px', maxWidth: 300, lineHeight: 1.5 }}>
        En continuant, vous acceptez nos{' '}
        <a href="/terms" style={{ color: ACCENT, fontWeight: 600 }}>Conditions</a>
        {' '}et{' '}
        <a href="/privacy" style={{ color: ACCENT, fontWeight: 600 }}>Politique de confidentialité</a>.
      </p>

      {/* Install button */}
      <button
        onClick={handleAndroidInstall}
        disabled={installing}
        style={{
          width: '100%', maxWidth: 380,
          background: installing ? '#8696a0' : ACCENT,
          color: '#fff', border: 'none', borderRadius: 28,
          padding: '18px 24px', fontSize: 17, fontWeight: 700,
          cursor: installing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          boxShadow: `0 4px 20px ${ACCENT}55`,
          marginBottom: 14,
        }}
      >
        {installing ? (
          <>
            <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
            Installation en cours…
          </>
        ) : (
          <>
            <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Installer l'application
          </>
        )}
      </button>

      {/* Fallback — never block access */}
      <button
        onClick={() => window.location.replace('/login')}
        style={{
          width: '100%', maxWidth: 380,
          background: 'transparent', color: '#8696a0',
          border: '1.5px solid #e9edef', borderRadius: 28,
          padding: '14px 24px', fontSize: 14, fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Accéder sans installer
      </button>
    </div>
  );
}
