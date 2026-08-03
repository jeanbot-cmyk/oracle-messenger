'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const ACCENT = 'var(--brand)';
const ACCENT_TEXT = 'var(--accent-text)';

type OS = 'android' | 'ios' | 'other';

function detectOS(): OS {
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

function isCapacitorNative() {
  if (typeof window === 'undefined') return false;
  // Capacitor injecte window.Capacitor quand l'app tourne en natif (APK)
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

function pendingRoute() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('oracle-after-login') || sessionStorage.getItem('oracle-after-login') || '';
}

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const [os, setOs] = useState<OS>('other');
  const [mounted, setMounted] = useState(false);
  const [iosStep, setIosStep] = useState(0);
  const [showIos, setShowIos] = useState(false);
  const promptRef = useRef<any>(null);
  const [installing, setInstalling] = useState(false);
  const [manualInstall, setManualInstall] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOs(detectOS());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(r => r.update()).catch(() => {});
    }

    if ((window as any).__installPrompt) {
      promptRef.current = (window as any).__installPrompt;
    }

    const handler = (e: any) => { e.preventDefault(); promptRef.current = e; };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Redirection si déjà connecté, standalone ou APK natif
  useEffect(() => {
    if (status === 'loading') return;
    // APK Capacitor natif → aller directement au chat ou login
    if (isCapacitorNative()) {
      const pending = pendingRoute();
      router.replace(status === 'authenticated' ? (pending || '/chat') : '/login');
      return;
    }
    const pending = pendingRoute();
    if (status === 'authenticated') { router.replace(pending || '/chat'); return; }
    if (isStandalone()) { router.replace('/login'); return; }
  }, [status]);

  function handleOpen() {
    router.replace(status === 'authenticated' ? '/chat' : '/login');
  }

  function handleAndroidPWA() {
    const prompt = promptRef.current || (window as any).__installPrompt || (window as any).__pwaPrompt;
    setManualInstall(false);
    if (prompt) {
      setInstalling(true);
      prompt.prompt();
      prompt.userChoice.finally(() => setInstalling(false));
    } else {
      setManualInstall(true);
      router.push('/install');
    }
  }

  if (!mounted) return null;

  // ── iOS : guide PWA ────────────────────────────────────────────────────────
  if (showIos) {
    const steps = [
      { icon: '📤', title: 'Appuyez sur Partager', desc: 'En bas de Safari, appuyez sur le bouton Partager (carré avec flèche vers le haut).' },
      { icon: '➕', title: '"Sur l\'écran d\'accueil"', desc: 'Faites défiler le menu et appuyez sur "Sur l\'écran d\'accueil".' },
      { icon: '✅', title: 'Appuyez sur "Ajouter"', desc: 'En haut à droite, appuyez sur "Ajouter". Oracle Messenger est maintenant sur votre écran d\'accueil !' },
    ];
    const step = steps[iosStep];
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => iosStep > 0 ? setIosStep(s => s - 1) : setShowIos(false)}
            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--bg-input)', cursor: 'pointer', fontSize: 18 }}>←</button>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            iPhone · Étape {iosStep + 1} / {steps.length}
          </p>
        </div>
        <div style={{ margin: '12px 24px 0', height: 4, background: 'var(--bg-input)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: ACCENT, borderRadius: 2, width: `${((iosStep + 1) / steps.length) * 100}%`, transition: 'width 0.3s' }} />
        </div>
        <div key={iosStep} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, animation: 'fadeIn 0.25s ease', gap: 24, textAlign: 'center' }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(201,168,76,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>{step.icon}</div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>{step.title}</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
          </div>
        </div>
        <div style={{ padding: '0 24px 44px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {iosStep < steps.length - 1
            ? <button onClick={() => setIosStep(s => s + 1)} style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 28, padding: 18, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>Suivant →</button>
            : <button onClick={handleOpen} style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 28, padding: 18, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>Ouvrir Oracle Messenger →</button>
          }
          <button onClick={handleOpen} style={{ width: '100%', background: 'transparent', color: 'var(--text-muted)', border: '1.5px solid var(--border)', borderRadius: 28, padding: 14, fontSize: 14, cursor: 'pointer' }}>
            Accéder sans installer
          </button>
        </div>
      </div>
    );
  }

  // ── Page principale avec détection OS ─────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Hero */}
      <div style={{ background: `linear-gradient(160deg,${ACCENT} 0%,var(--header-bg) 100%)`, padding: '60px 32px 72px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 96, height: 96, borderRadius: 28, background: 'rgba(255,255,255,0.15)', marginBottom: 20, animation: 'float 3s ease-in-out infinite', border: '1.5px solid rgba(255,255,255,0.2)' }}>
          <svg width="54" height="54" fill="none" viewBox="0 0 24 24">
            <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
            <circle cx="8.5" cy="12" r="1.4" fill={ACCENT} /><circle cx="12" cy="12" r="1.4" fill={ACCENT} /><circle cx="15.5" cy="12" r="1.4" fill={ACCENT} />
          </svg>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: '#fff', margin: '0 0 10px', letterSpacing: -0.5 }}>Oracle Messenger</h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.88)', margin: '0 0 6px' }}>Messagerie · Appels · Entreprise</p>

        {/* Badge OS détecté */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 14px' }}>
          <span style={{ fontSize: 16 }}>{os === 'android' ? '🤖' : os === 'ios' ? '🍎' : '💻'}</span>
          <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
            {os === 'android' ? 'Android détecté' : os === 'ios' ? 'iPhone détecté' : 'Navigateur détecté'}
          </span>
        </div>
      </div>

      {/* Contenu selon OS */}
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── ANDROID ── */}
        {os === 'android' && (
          <>
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>🤖 Android</p>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Installer l'application</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Installe Oracle Messenger sur l'écran d'accueil sans télécharger d'APK.
              </p>
            </div>

            {/* Option 1 : PWA — installation sûre */}
            <button onClick={handleAndroidPWA} disabled={installing}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', background: ACCENT, borderRadius: 20, border: 'none', textDecoration: 'none', color: '#fff', cursor: installing ? 'wait' : 'pointer', textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="26" height="26" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 2px' }}>{installing ? 'Installation...' : 'Installer l’application'}</p>
                <p style={{ fontSize: 12, margin: 0, opacity: 0.85 }}>Méthode recommandée · Sans alerte APK</p>
              </div>
              <svg style={{ marginLeft: 'auto' }} width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>

            {manualInstall && (
              <div style={{ background: '#fff8e1', border: '1px solid #f3d58b', borderRadius: 16, padding: 14 }}>
                <p style={{ fontSize: 13, color: '#5f4a13', margin: 0, lineHeight: 1.5, fontWeight: 650 }}>
                  Aucun APK n’est utilisé. Si Chrome ne lance pas l’installation automatique, utilise le menu ⋮ puis “Installer l’application”.
                </p>
              </div>
            )}

            {/* Guide installation PWA */}
            <div style={{ background: '#f8fffe', border: '1px solid #e8f5f3', borderRadius: 16, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: ACCENT, margin: '0 0 10px' }}>📋 Installation recommandée</p>
              {[
                '1. Clique sur "Installer l’application"',
                '2. Confirme l’ajout proposé par Chrome',
                '3. Oracle Messenger apparaît sur ton écran d’accueil',
                '4. Ouvre l’icône pour revenir directement dans l’app',
              ].map((s, i) => (
                <p key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{s}</p>
              ))}
            </div>

          </>
        )}

        {/* ── iOS ── */}
        {os === 'ios' && (
          <>
            <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>🍎 iPhone</p>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Installer sur iPhone</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Ajoute Oracle Messenger sur ton écran d'accueil en 3 étapes simples via Safari.
              </p>
            </div>

            <button onClick={() => setShowIos(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', background: 'var(--text-primary)', borderRadius: 20, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 26 }}>📲</span>
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 2px' }}>Guide d'installation</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0 }}>3 étapes · 30 secondes</p>
              </div>
              <svg style={{ marginLeft: 'auto' }} width="20" height="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                ⚠️ Utilise <strong>Safari</strong> pour installer. Chrome et Firefox ne supportent pas l'installation sur iPhone.
              </p>
            </div>
          </>
        )}

        {/* ── Desktop / Autre ── */}
        {os === 'other' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Choisissez votre plateforme</h2>
            <button onClick={handleAndroidPWA}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 16, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
              <span style={{ fontSize: 32 }}>📲</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>Android — Installer la PWA</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Installation sécurisée depuis le navigateur</p>
              </div>
            </button>
            <button onClick={() => setShowIos(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 16, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
              <span style={{ fontSize: 32 }}>🍎</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>iPhone — Guide PWA</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Ajouter à l'écran d'accueil via Safari</p>
              </div>
            </button>
          </>
        )}
      </div>

      {/* Bouton accéder */}
      <div style={{ padding: '0 24px 44px' }}>
        <button onClick={handleOpen}
          style={{ width: '100%', background: 'transparent', color: 'var(--text-muted)', border: '1.5px solid var(--border)', borderRadius: 28, padding: 14, fontSize: 15, cursor: 'pointer' }}>
          Accéder sans installer
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.6 }}>
          En continuant, vous acceptez nos <a href="/terms" style={{ color: ACCENT }}>Conditions</a> et <a href="/privacy" style={{ color: ACCENT }}>Politique de confidentialité</a>.
        </p>
      </div>
    </div>
  );
}
