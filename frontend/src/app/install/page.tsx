'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';

// Stocker le prompt globalement dès que possible (avant le mount React)
// car beforeinstallprompt peut se déclencher très tôt
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    (window as any).__pwaPrompt = e;
  });
}

type Device = 'android-chrome' | 'samsung' | 'ios' | 'desktop';

function detectDevice(): Device {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/samsungbrowser/.test(ua)) return 'samsung';
  if (/android/.test(ua)) return 'android-chrome';
  return 'desktop';
}

const STEPS: Record<Device, { icon: string; text: string }[]> = {
  'android-chrome': [
    { icon: '⋮', text: 'Appuyez sur les 3 points en haut à droite de Chrome' },
    { icon: '📲', text: 'Sélectionnez "Installer l\'application"' },
    { icon: '✅', text: 'Confirmez — l\'app s\'ouvre automatiquement' },
  ],
  samsung: [
    { icon: '☰', text: 'Appuyez sur les 3 lignes du navigateur Samsung' },
    { icon: '➕', text: 'Choisissez "Ajouter page à" → "Écran d\'accueil"' },
    { icon: '✅', text: 'Appuyez sur "Ajouter" pour confirmer' },
  ],
  ios: [
    { icon: '⬆️', text: 'Appuyez sur le bouton Partager (barre du bas Safari)' },
    { icon: '➕', text: 'Faites défiler et choisissez "Sur l\'écran d\'accueil"' },
    { icon: '✅', text: 'Appuyez sur "Ajouter" en haut à droite' },
  ],
  desktop: [
    { icon: '📥', text: 'Cliquez sur l\'icône d\'installation dans la barre d\'adresse' },
    { icon: '📲', text: 'Ou menu → "Installer Oracle Messenger"' },
    { icon: '✅', text: 'Confirmez l\'installation' },
  ],
};

export default function InstallPage() {
  const [device, setDevice]       = useState<Device>('android-chrome');
  const [hasPrompt, setHasPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [mounted, setMounted]     = useState(false);

  useEffect(() => {
    setMounted(true);
    setDevice(detectDevice());

    // Déjà en standalone → cookie + redirect
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (isStandalone) {
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
      window.location.replace('/');
      return;
    }

    // Vérifier si le prompt global est déjà capturé
    if ((window as any).__pwaPrompt) setHasPrompt(true);

    // Écouter si le prompt arrive après le mount
    const handler = (e: any) => {
      e.preventDefault();
      (window as any).__pwaPrompt = e;
      setHasPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Appel installé
    window.addEventListener('appinstalled', () => {
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
      setInstalled(true);
      setTimeout(() => window.location.replace('/'), 1800);
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    const prompt = (window as any).__pwaPrompt;

    if (prompt) {
      // Android Chrome — installation native directe
      setInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
          setInstalled(true);
          setTimeout(() => window.location.replace('/'), 1800);
        }
      } catch {}
      setInstalling(false);
    } else {
      // iOS / Samsung / autre → afficher les étapes manuelles
      setShowSteps(true);
    }
  }

  function handleAlreadyInstalled() {
    document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
    window.location.replace('/');
  }

  if (!mounted) return null;

  if (installed) return (
    <div style={S.fullCenter}>
      <div style={{ fontSize: 80 }}>✅</div>
      <h2 style={S.successTitle}>Installation réussie !</h2>
      <p style={S.successSub}>Ouverture d'Oracle Messenger…</p>
    </div>
  );

  return (
    <div style={S.root}>
      {/* Logo + nom */}
      <div style={S.hero}>
        <div style={S.logoWrap}>
          <svg width="54" height="54" fill="none" viewBox="0 0 24 24">
            <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
            <circle cx="8.5" cy="12" r="1.3" fill="#00a884"/>
            <circle cx="12"  cy="12" r="1.3" fill="#00a884"/>
            <circle cx="15.5" cy="12" r="1.3" fill="#00a884"/>
          </svg>
        </div>
        <h1 style={S.appName}>Oracle Messenger</h1>
        <p style={S.appSub}>Messagerie privée · Gratuite · Sécurisée</p>
        <div style={S.badges}>
          {['⚡ Rapide', '🔒 Privé', '📵 Hors-ligne', '🔔 Notifs'].map(b => (
            <span key={b} style={S.badge}>{b}</span>
          ))}
        </div>
      </div>

      {/* Zone CTA */}
      <div style={S.cta}>

        {/* Bouton principal — toujours visible et cliquable */}
        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            ...S.installBtn,
            opacity: installing ? 0.8 : 1,
            transform: installing ? 'scale(0.97)' : 'scale(1)',
          }}
        >
          {installing ? (
            <>
              <div style={S.spinner} />
              <span>Installation…</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 28 }}>📲</span>
              <span>Installer l'application</span>
            </>
          )}
        </button>

        {/* Étapes manuelles (iOS / Samsung) */}
        {showSteps && (
          <div style={S.stepsCard}>
            <p style={S.stepsTitle}>
              {device === 'ios'     ? '📱 iPhone / iPad — Safari' :
               device === 'samsung' ? '📱 Samsung Browser' :
               device === 'desktop' ? '🖥️ Navigateur bureau' :
                                      '📱 Android Chrome'}
            </p>
            {STEPS[device].map((s, i) => (
              <div key={i} style={S.step}>
                <div style={S.stepNum}>{i + 1}</div>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{s.icon}</span>
                <p style={S.stepText}>{s.text}</p>
              </div>
            ))}
          </div>
        )}

        <button onClick={handleAlreadyInstalled} style={S.skipBtn}>
          J'ai déjà installé → Continuer
        </button>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100dvh',
    background: 'linear-gradient(170deg, #00a884 0%, #017561 55%, #004d3d 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '48px 24px 40px',
    boxSizing: 'border-box',
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    justifyContent: 'center',
  },
  logoWrap: {
    width: 100,
    height: 100,
    borderRadius: 30,
    background: 'rgba(255,255,255,0.18)',
    backdropFilter: 'blur(12px)',
    border: '1.5px solid rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  appName: {
    color: '#fff',
    fontSize: 34,
    fontWeight: 800,
    margin: 0,
    letterSpacing: -0.5,
    textShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
  appSub: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    margin: 0,
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
  },
  badge: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 20,
    padding: '6px 14px',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    backdropFilter: 'blur(8px)',
  },
  cta: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    alignItems: 'center',
  },
  installBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    background: '#ffffff',
    border: 'none',
    borderRadius: 20,
    padding: '22px 28px',
    fontSize: 20,
    fontWeight: 800,
    color: '#00a884',
    cursor: 'pointer',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.1)',
    letterSpacing: -0.2,
    transition: 'transform 0.15s, opacity 0.15s',
  },
  spinner: {
    width: 22,
    height: 22,
    border: '3px solid rgba(0,168,132,0.3)',
    borderTopColor: '#00a884',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  stepsCard: {
    width: '100%',
    background: 'rgba(255,255,255,0.13)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 20,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  stepsTitle: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    margin: 0,
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.25)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    margin: 0,
    lineHeight: 1.4,
  },
  skipBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 12,
    padding: '12px 24px',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  fullCenter: {
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(170deg, #00a884 0%, #004d3d 100%)',
    gap: 14,
  },
  successTitle: { color: '#fff', fontSize: 28, fontWeight: 800, margin: 0 },
  successSub:   { color: 'rgba(255,255,255,0.8)', fontSize: 16, margin: 0 },
};
