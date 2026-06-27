'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';

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
    { icon: '⋮', text: 'Appuyez sur les 3 points en haut à droite' },
    { icon: '📲', text: 'Sélectionnez "Installer l\'application"' },
    { icon: '✅', text: 'Confirmez — l\'app s\'ouvre automatiquement' },
  ],
  samsung: [
    { icon: '⋮', text: 'Appuyez sur les 3 lignes du navigateur Samsung' },
    { icon: '➕', text: 'Choisissez "Ajouter page à" → "Écran d\'accueil"' },
    { icon: '✅', text: 'Appuyez sur "Ajouter" pour confirmer' },
  ],
  ios: [
    { icon: '⬆️', text: 'Appuyez sur le bouton Partager (barre du bas)' },
    { icon: '➕', text: 'Faites défiler et choisissez "Sur l\'écran d\'accueil"' },
    { icon: '✅', text: 'Appuyez sur "Ajouter" en haut à droite' },
  ],
  desktop: [
    { icon: '🖥️', text: 'Cliquez sur l\'icône d\'installation dans la barre d\'adresse' },
    { icon: '📲', text: 'Ou utilisez le menu → "Installer Oracle Messenger"' },
    { icon: '✅', text: 'Confirmez l\'installation' },
  ],
};

export default function InstallPage() {
  const [prompt, setPrompt]     = useState<any>(null);
  const [device, setDevice]     = useState<Device>('android-chrome');
  const [installed, setInstalled] = useState(false);
  const [mounted, setMounted]   = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDevice(detectDevice());

    // Déjà en standalone → poser cookie et rediriger
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;

    if (isStandalone) {
      document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
      window.location.replace('/');
      return;
    }

    // Capturer le prompt d'installation natif (Android Chrome)
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);

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
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
        setInstalled(true);
      }
    } else {
      setShowSteps(true);
    }
  }

  function handleAlreadyInstalled() {
    document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
    window.location.replace('/');
  }

  if (!mounted) return null;

  if (installed) return (
    <div style={styles.fullCenter}>
      <div style={styles.successIcon}>✅</div>
      <h2 style={styles.successTitle}>Installation réussie !</h2>
      <p style={styles.successSub}>Ouverture d'Oracle Messenger…</p>
      <style>{spin}</style>
    </div>
  );

  return (
    <div style={styles.root}>
      <style>{spin}</style>

      {/* Logo + nom */}
      <div style={styles.hero}>
        <div style={styles.logoWrap}>
          {/* Icône bulle de chat SVG */}
          <svg width="52" height="52" fill="none" viewBox="0 0 24 24">
            <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
            <circle cx="8.5" cy="12" r="1.2" fill="#00a884"/>
            <circle cx="12" cy="12" r="1.2" fill="#00a884"/>
            <circle cx="15.5" cy="12" r="1.2" fill="#00a884"/>
          </svg>
        </div>
        <h1 style={styles.appName}>Oracle Messenger</h1>
        <p style={styles.appSub}>Messagerie privée · Gratuite · Sécurisée</p>

        {/* Badges */}
        <div style={styles.badges}>
          {['⚡ Rapide', '🔒 Privé', '📵 Hors-ligne', '🔔 Notifs'].map(b => (
            <span key={b} style={styles.badge}>{b}</span>
          ))}
        </div>
      </div>

      {/* Bouton principal */}
      <div style={styles.cta}>
        <button onClick={handleInstall} style={styles.installBtn}>
          <span style={{ fontSize: 26 }}>📲</span>
          <span>Installer l'application</span>
        </button>

        {/* Instructions manuelles si pas de prompt natif */}
        {showSteps && (
          <div style={styles.stepsCard}>
            <p style={styles.stepsTitle}>
              {device === 'ios' ? '📱 iPhone / iPad' :
               device === 'samsung' ? '📱 Samsung Browser' :
               device === 'desktop' ? '🖥️ Bureau' : '📱 Android Chrome'}
            </p>
            {STEPS[device].map((s, i) => (
              <div key={i} style={styles.step}>
                <div style={styles.stepNum}>{i + 1}</div>
                <div style={styles.stepIcon}>{s.icon}</div>
                <p style={styles.stepText}>{s.text}</p>
              </div>
            ))}
          </div>
        )}

        <button onClick={handleAlreadyInstalled} style={styles.skipBtn}>
          J'ai déjà installé → Continuer
        </button>
      </div>
    </div>
  );
}

const spin = `@keyframes spin{to{transform:rotate(360deg)}}`;

const styles: Record<string, React.CSSProperties> = {
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
    width: 96,
    height: 96,
    borderRadius: 28,
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
    fontSize: 32,
    fontWeight: 800,
    margin: 0,
    letterSpacing: -0.5,
    textShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
  appSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    margin: 0,
    fontWeight: 400,
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
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
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
  },
  installBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    background: '#fff',
    border: 'none',
    borderRadius: 18,
    padding: '20px 28px',
    fontSize: 20,
    fontWeight: 700,
    color: '#00a884',
    cursor: 'pointer',
    boxShadow: '0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.1)',
    letterSpacing: -0.2,
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  stepsCard: {
    width: '100%',
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: '20px 20px',
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
  stepIcon: {
    fontSize: 22,
    flexShrink: 0,
  },
  stepText: {
    color: 'rgba(255,255,255,0.9)',
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
    gap: 12,
  },
  successIcon: { fontSize: 72 },
  successTitle: { color: '#fff', fontSize: 26, fontWeight: 800, margin: 0 },
  successSub: { color: 'rgba(255,255,255,0.8)', fontSize: 16, margin: 0 },
};
