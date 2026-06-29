'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';

const ACCENT = '#128C7E';

type Device = 'ios' | 'samsung' | 'android' | 'other';

function detectDevice(): Device {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/samsungbrowser/.test(ua)) return 'samsung';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

// iOS step-by-step guide
const IOS_STEPS = [
  {
    title: 'Appuyez sur Partager',
    desc: 'En bas de Safari, appuyez sur le bouton Partager (carré avec une flèche vers le haut).',
    illustration: (
      <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 280 }}>
        {/* Phone frame */}
        <rect x="60" y="10" width="160" height="160" rx="18" fill="#f0f2f5" stroke="#e9edef" strokeWidth="2"/>
        {/* Screen */}
        <rect x="68" y="20" width="144" height="140" rx="12" fill="#fff"/>
        {/* Browser bar */}
        <rect x="68" y="20" width="144" height="28" rx="12" fill="#f8f9fa"/>
        <rect x="80" y="28" width="100" height="12" rx="6" fill="#e9edef"/>
        {/* Bottom bar */}
        <rect x="68" y="140" width="144" height="20" rx="0" fill="#f8f9fa"/>
        {/* Share button highlight */}
        <rect x="126" y="143" width="28" height="14" rx="4" fill={ACCENT} opacity="0.15"/>
        <rect x="132" y="145" width="16" height="10" rx="2" fill={ACCENT} opacity="0.3"/>
        {/* Share icon */}
        <rect x="137" y="147" width="6" height="6" rx="1" fill={ACCENT}/>
        <path d="M140 147 L140 143 M138 145 L140 143 L142 145" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Arrow pointing down to share */}
        <path d="M140 130 L140 138" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"/>
        <path d="M136 134 L140 138 L144 134" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Pulse ring */}
        <circle cx="140" cy="150" r="12" stroke={ACCENT} strokeWidth="1.5" opacity="0.4"/>
        <circle cx="140" cy="150" r="18" stroke={ACCENT} strokeWidth="1" opacity="0.2"/>
      </svg>
    ),
  },
  {
    title: 'Sur l\'écran d\'accueil',
    desc: 'Dans le menu Partager, faites défiler et appuyez sur "Sur l\'écran d\'accueil".',
    illustration: (
      <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 280 }}>
        {/* Share sheet */}
        <rect x="30" y="60" width="220" height="110" rx="16" fill="#fff" stroke="#e9edef" strokeWidth="1.5"/>
        <rect x="30" y="60" width="220" height="30" rx="16" fill="#f8f9fa"/>
        <rect x="100" y="72" width="80" height="8" rx="4" fill="#e9edef"/>
        {/* Menu items */}
        <rect x="46" y="100" width="188" height="32" rx="10" fill={ACCENT} opacity="0.12"/>
        <rect x="46" y="100" width="188" height="32" rx="10" stroke={ACCENT} strokeWidth="1.5"/>
        {/* Home icon */}
        <path d="M62 116 L68 110 L74 116 L74 122 L70 122 L70 118 L66 118 L66 122 L62 122 Z" fill={ACCENT}/>
        <rect x="78" y="112" width="80" height="8" rx="4" fill={ACCENT}/>
        {/* Other items dimmed */}
        <rect x="46" y="140" width="188" height="20" rx="8" fill="#f0f2f5"/>
        <rect x="62" y="147" width="100" height="6" rx="3" fill="#e9edef"/>
      </svg>
    ),
  },
  {
    title: 'Appuyez sur Ajouter',
    desc: 'En haut à droite de la fenêtre, appuyez sur "Ajouter" pour installer Oracle Messenger.',
    illustration: (
      <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 280 }}>
        {/* Dialog */}
        <rect x="30" y="30" width="220" height="120" rx="16" fill="#fff" stroke="#e9edef" strokeWidth="1.5"/>
        {/* Title bar */}
        <rect x="30" y="30" width="220" height="36" rx="16" fill="#f8f9fa"/>
        <rect x="46" y="42" width="60" height="10" rx="5" fill="#e9edef"/>
        {/* "Ajouter" button highlighted */}
        <rect x="186" y="36" width="50" height="24" rx="8" fill={ACCENT}/>
        <rect x="194" y="44" width="34" height="8" rx="4" fill="#fff"/>
        {/* App icon preview */}
        <rect x="110" y="80" width="60" height="60" rx="14" fill={ACCENT} opacity="0.15"/>
        <rect x="118" y="88" width="44" height="44" rx="10" fill={ACCENT} opacity="0.3"/>
        {/* Oracle O */}
        <circle cx="140" cy="110" r="12" stroke={ACCENT} strokeWidth="3" fill="none"/>
        <circle cx="140" cy="110" r="5" fill={ACCENT}/>
        {/* Arrow pointing to Ajouter */}
        <path d="M200 68 L210 48" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"/>
        <circle cx="210" cy="48" r="4" fill={ACCENT}/>
      </svg>
    ),
  },
  {
    title: 'C\'est installé !',
    desc: 'Oracle Messenger est maintenant sur votre écran d\'accueil. Ouvrez-le depuis là.',
    illustration: (
      <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 280 }}>
        {/* Home screen */}
        <rect x="60" y="10" width="160" height="160" rx="18" fill="#f0f2f5" stroke="#e9edef" strokeWidth="2"/>
        <rect x="68" y="20" width="144" height="140" rx="12" fill="#1a1a2e"/>
        {/* App icons grid */}
        {[0,1,2,3,4,5,6,7].map(i => (
          <rect key={i} x={84 + (i%4)*34} y={40 + Math.floor(i/4)*50} width="26" height="26" rx="6"
            fill={i === 4 ? ACCENT : '#ffffff22'}/>
        ))}
        {/* Oracle icon highlighted */}
        <circle cx="97" cy="103" r="8" stroke="#fff" strokeWidth="2" fill="none"/>
        <circle cx="97" cy="103" r="3" fill="#fff"/>
        {/* Checkmark */}
        <circle cx="200" cy="50" r="22" fill={ACCENT}/>
        <path d="M190 50 L197 57 L212 42" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function InstallPage() {
  const [device,     setDevice]     = useState<Device>('android');
  const [installing, setInstalling] = useState(false);
  const [installed,  setInstalled]  = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [iosStep,    setIosStep]    = useState(0); // for iOS guide

  useEffect(() => {
    setMounted(true);
    const d = detectDevice();
    setDevice(d);

    // Already installed → go to app
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true ||
      document.referrer.startsWith('android-app://')
    ) {
      window.location.replace('/');
      return;
    }

    const h = (e: any) => {
      e.preventDefault();
      (window as any).__installPrompt = e;
      (window as any).__pwaPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setTimeout(() => window.location.replace('/'), 1800);
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  async function handleAndroidInstall() {
    let prompt = (window as any).__installPrompt || (window as any).__pwaPrompt;

    if (!prompt) {
      // Wait up to 4s for the prompt
      setInstalling(true);
      await new Promise<void>(resolve => {
        const handler = (e: any) => {
          e.preventDefault();
          (window as any).__installPrompt = e;
          prompt = e;
          window.removeEventListener('beforeinstallprompt', handler);
          resolve();
        };
        window.addEventListener('beforeinstallprompt', handler);
        setTimeout(resolve, 4000);
      });
      setInstalling(false);
    }

    if (prompt) {
      setInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          setInstalled(true);
          setTimeout(() => window.location.replace('/'), 1800);
        }
      } catch {}
      setInstalling(false);
    }
    // If still no prompt, the browser will show its own UI or nothing — don't show an error
  }

  if (!mounted) return null;

  // ── Success screen ──
  if (installed) return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', gap: 20, padding: 32, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111b21', margin: 0 }}>Installation réussie !</h2>
      <p style={{ color: '#667781', fontSize: 15, margin: 0 }}>Ouverture d'Oracle Messenger…</p>
    </div>
  );

  // ── iOS guide ──
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
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: '#8696a0', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              iPhone / iPad · Étape {iosStep + 1} sur {IOS_STEPS.length}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ margin: '12px 24px 0', height: 4, background: '#f0f2f5', borderRadius: 2 }}>
          <div style={{ height: '100%', background: ACCENT, borderRadius: 2, width: `${((iosStep + 1) / IOS_STEPS.length) * 100}%`, transition: 'width 0.3s ease' }}/>
        </div>

        {/* Content */}
        <div key={iosStep} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', animation: 'fadeIn 0.25s ease', gap: 24 }}>
          <div style={{ width: '100%', maxWidth: 280 }}>
            {step.illustration}
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111b21', margin: '0 0 12px' }}>{step.title}</h2>
            <p style={{ fontSize: 15, color: '#667781', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
          </div>
        </div>

        {/* Bottom button */}
        <div style={{ padding: '0 24px 40px' }}>
          {isLast ? (
            <button onClick={() => window.location.replace('/')}
              style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <svg width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
              Ouvrir Oracle Messenger
            </button>
          ) : (
            <button onClick={() => setIosStep(s => s + 1)}
              style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              Suivant
              <svg width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Android / Samsung / Other — native prompt ──
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
        <a href="/terms" style={{ color: ACCENT, fontWeight: 600 }}>Conditions d'utilisation</a>
        {' '}et nos{' '}
        <a href="/privacy" style={{ color: ACCENT, fontWeight: 600 }}>Politiques de confidentialité</a>.
      </p>

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
          transition: 'background 0.2s',
        }}
      >
        {installing ? (
          <>
            <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
            Préparation…
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
    </div>
  );
}
