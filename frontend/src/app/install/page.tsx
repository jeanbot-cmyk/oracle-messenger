'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { openCurrentAndroidLinkInChrome } from '../../lib/androidChrome';

const ACCENT = 'var(--brand)';
const ACCENT_TEXT = 'var(--accent-text)';
const MANUAL_CONTACTS_KEY = 'oracle-manual-contacts';

type Device = 'ios' | 'android' | 'other';
type Inviter = { id: string; name: string; username: string; avatar?: string; phone?: string };
function detectDevice(): Device {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

function appEntry() {
  if (typeof window === 'undefined') return '/';
  return localStorage.getItem('oracle-after-login') || sessionStorage.getItem('oracle-after-login') || '/';
}

function normalizeInviteUsername(value: string) {
  try {
    return decodeURIComponent(value || '').trim().replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  } catch {
    return (value || '').trim().replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  }
}

function rememberInviteFromUrl() {
  const from = normalizeInviteUsername(new URLSearchParams(window.location.search).get('from') || '');
  if (!from) return '';
  const next = `/contacts?from=${encodeURIComponent(from)}`;
  sessionStorage.setItem('oracle-after-login', next);
  localStorage.setItem('oracle-after-login', next);
  return from;
}

function goToAppEntry() {
  window.location.replace(appEntry());
}

function escapeVcard(value = '') {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function normalizeInternationalPhone(phone = '') {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

function rememberOracleContact(inviter: Inviter) {
  const phone = normalizeInternationalPhone(inviter.phone || '');
  const contact = {
    name: inviter.name || inviter.username || 'Oracle Messenger',
    phones: phone ? [phone] : [],
    emails: [],
    avatar: inviter.avatar || null,
  };
  try {
    const current = JSON.parse(localStorage.getItem(MANUAL_CONTACTS_KEY) || '[]');
    const exists = current.some((c: any) =>
      c?.name === contact.name ||
      (phone && Array.isArray(c?.phones) && c.phones.some((p: string) => normalizeInternationalPhone(p) === phone))
    );
    if (!exists) {
      localStorage.setItem(MANUAL_CONTACTS_KEY, JSON.stringify([contact, ...current]));
    }
  } catch {
    localStorage.setItem(MANUAL_CONTACTS_KEY, JSON.stringify([contact]));
  }
}

function saveContact(inviter: Inviter) {
  const name = inviter.name || inviter.username || 'Oracle Messenger';
  const phone = normalizeInternationalPhone(inviter.phone || '');
  const profileUrl = `https://messenger.oracle-plus.online/u/${encodeURIComponent(inviter.username)}`;
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVcard(name)}`,
    phone ? `TEL;TYPE=CELL:${phone}` : '',
    `URL:${profileUrl}`,
    'NOTE:Contact Oracle Messenger',
    'END:VCARD',
  ].filter(Boolean).join('\n');
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${inviter.username || 'oracle-contact'}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function openDiscussionWithInviter(inviter: Inviter | null) {
  if (inviter) rememberOracleContact(inviter);
  goToAppEntry();
}

const IOS_STEPS = [
  {
    title: 'Appuyez sur Partager',
    desc: 'En bas de Safari, appuyez sur le bouton Partager (carré avec une flèche vers le haut).',
    svg: (
      <svg viewBox="0 0 280 200" fill="none" style={{ width: '100%', maxWidth: 260 }}>
        <rect x="60" y="10" width="160" height="180" rx="18" fill="var(--bg-input)" stroke="var(--border)" strokeWidth="2"/>
        <rect x="68" y="20" width="144" height="160" rx="12" fill="#fff"/>
        <rect x="68" y="20" width="144" height="28" rx="12" fill="#f8f9fa"/>
        <rect x="80" y="28" width="100" height="12" rx="6" fill="var(--border)"/>
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
        <rect x="20" y="80" width="240" height="110" rx="16" fill="#fff" stroke="var(--border)" strokeWidth="1.5"/>
        <rect x="20" y="80" width="240" height="32" rx="16" fill="#f8f9fa"/>
        <rect x="100" y="90" width="80" height="10" rx="5" fill="var(--border)"/>
        {/* Highlighted row */}
        <rect x="36" y="122" width="208" height="36" rx="10" fill={ACCENT} opacity="0.1"/>
        <rect x="36" y="122" width="208" height="36" rx="10" stroke={ACCENT} strokeWidth="1.5"/>
        <path d="M56 140 L62 133 L68 140 L68 147 L64 147 L64 143 L60 143 L60 147 L56 147 Z" fill={ACCENT}/>
        <rect x="76" y="136" width="90" height="8" rx="4" fill={ACCENT}/>
        {/* Other rows */}
        <rect x="36" y="166" width="208" height="18" rx="8" fill="var(--bg-input)"/>
        <rect x="52" y="172" width="100" height="6" rx="3" fill="var(--border)"/>
      </svg>
    ),
  },
  {
    title: 'Appuyez sur "Ajouter"',
    desc: 'En haut à droite de la fenêtre qui s\'ouvre, appuyez sur "Ajouter".',
    svg: (
      <svg viewBox="0 0 280 200" fill="none" style={{ width: '100%', maxWidth: 260 }}>
        <rect x="30" y="40" width="220" height="130" rx="16" fill="#fff" stroke="var(--border)" strokeWidth="1.5"/>
        <rect x="30" y="40" width="220" height="38" rx="16" fill="#f8f9fa"/>
        <rect x="46" y="52" width="60" height="10" rx="5" fill="var(--border)"/>
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
  const [manualInstall, setManualInstall] = useState(false);
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const promptRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    setDevice(detectDevice());
    const inviteUsername = rememberInviteFromUrl();
    if (openCurrentAndroidLinkInChrome()) return;
    if (inviteUsername) {
      api.users.byUsername(inviteUsername)
        .then(user => setInviter(user?.id ? user : null))
        .catch(() => setInviter(null));
    }

    // Already installed → go straight to app
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    ) {
      goToAppEntry();
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
      setTimeout(goToAppEntry, 1800);
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function handleAndroidInstall() {
    const prompt = promptRef.current || (window as any).__installPrompt;
    setManualInstall(false);

    if (prompt) {
      // Call synchronously — must stay in user gesture context
      prompt.prompt();
      prompt.userChoice
        .then((choice: any) => {
          if (choice.outcome === 'accepted') {
            setInstalled(true);
            setTimeout(goToAppEntry, 1800);
          }
          setInstalling(false);
        })
        .catch(() => setInstalling(false));
      setInstalling(true);
      return;
    }

    // Prompt not yet available — show spinner and wait briefly.
    // Chrome may hide beforeinstallprompt when the app is already installed,
    // recently dismissed, or opened inside an in-app browser.
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
            setTimeout(goToAppEntry, 1800);
          }
          setInstalling(false);
        })
        .catch(() => setInstalling(false));
    };
    window.addEventListener('beforeinstallprompt', waitHandler);
    // After 3s show safe PWA manual instructions. Never fall back to APK.
    setTimeout(() => {
      window.removeEventListener('beforeinstallprompt', waitHandler);
      setInstalling(false);
      setManualInstall(true);
    }, 3000);
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
      <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Installé !</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: 0 }}>Ouverture d'Oracle Messenger…</p>
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
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--text-primary)', flexShrink: 0 }}>
              ←
            </button>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            iPhone / iPad · Étape {iosStep + 1} / {IOS_STEPS.length}
          </p>
        </div>

        {/* Progress */}
        <div style={{ margin: '12px 24px 0', height: 4, background: 'var(--bg-input)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: ACCENT, borderRadius: 2, width: `${((iosStep + 1) / IOS_STEPS.length) * 100}%`, transition: 'width 0.3s ease' }}/>
        </div>

        {/* Content */}
        <div key={iosStep} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', animation: 'fadeIn 0.25s ease', gap: 24 }}>
          {step.svg}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>{step.title}</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ padding: '0 24px 44px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isLast ? (
            <button onClick={goToAppEntry}
              style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              Ouvrir Oracle Messenger →
            </button>
          ) : (
            <button onClick={() => setIosStep(s => s + 1)}
              style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              Suivant →
            </button>
          )}
          <button onClick={goToAppEntry}
            style={{ width: '100%', background: 'transparent', color: 'var(--text-muted)', border: '1.5px solid var(--border)', borderRadius: 28, padding: '14px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
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
          <rect x="100" y="12" width="84" height="56" rx="14" fill="var(--bg-input)" stroke="var(--border)" strokeWidth="1.5"/>
          <path d="M176 68 L184 82 L162 68Z" fill="var(--bg-input)" stroke="var(--border)" strokeWidth="1" strokeLinejoin="round"/>
          <rect x="114" y="28" width="56" height="6" rx="3" fill="var(--text-muted)" opacity="0.4"/>
          <rect x="114" y="42" width="40" height="6" rx="3" fill="var(--text-muted)" opacity="0.25"/>
          <rect x="136" y="118" width="34" height="28" rx="6" fill={ACCENT}/>
          <path d="M143 118 V111 a9 9 0 0 1 18 0 V118" stroke={ACCENT} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <circle cx="153" cy="132" r="3.5" fill="white"/>
          <rect x="151" y="132" width="4" height="6" rx="2" fill="white"/>
        </svg>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', margin: '0 0 10px', lineHeight: 1.2 }}>
        Oracle Messenger
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 6px', maxWidth: 300 }}>
        Messagerie rapide et sécurisée.
      </p>
      {inviter && (
        <div style={{ width: '100%', maxWidth: 380, background: '#f8fbfa', border: '1px solid var(--border)', borderRadius: 22, padding: 14, margin: '8px 0 18px', boxShadow: '0 8px 22px rgba(16,42,42,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <img src={inviter.avatar || '/icons/icon-96-v20260803.png'} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-input)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviter.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{inviter.username}</p>
            </div>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
            Cette personne t’a invité. Enregistre son contact en un clic ou continue directement vers la discussion Oracle Messenger.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: normalizeInternationalPhone(inviter.phone || '') ? '1fr 1fr' : '1fr', gap: 8 }}>
            {normalizeInternationalPhone(inviter.phone || '') && (
              <button onClick={() => saveContact(inviter)}
                style={{ border: 'none', borderRadius: 999, background: 'var(--header-bg)', color: '#fff', padding: '11px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                Enregistrer contact
              </button>
            )}
            <button onClick={() => openDiscussionWithInviter(inviter)}
              style={{ border: 'none', borderRadius: 999, background: ACCENT, color: ACCENT_TEXT, padding: '11px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              Ouvrir discussion
            </button>
          </div>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 36px', maxWidth: 300, lineHeight: 1.5 }}>
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
          background: installing ? 'var(--text-muted)' : ACCENT,
          color: '#fff', border: 'none', borderRadius: 28,
          padding: '18px 24px', fontSize: 17, fontWeight: 700,
          cursor: installing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          boxShadow: '0 10px 24px rgba(201,168,76,0.20)',
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

      {manualInstall && (
        <div style={{ width: '100%', maxWidth: 380, background: '#fff8e1', border: '1px solid #f3d58b', borderRadius: 18, padding: 16, marginBottom: 14, color: '#5f4a13' }}>
          <p style={{ fontSize: 14, fontWeight: 800, margin: '0 0 8px' }}>
            Installation sécurisée uniquement depuis le navigateur
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            Si le bouton automatique ne s’affiche pas, ouvre cette page dans Chrome, appuie sur le menu ⋮ puis choisis “Installer l’application” ou “Ajouter à l’écran d’accueil”.
          </p>
        </div>
      )}

      {/* Fallback — never block access */}
      <button
        onClick={goToAppEntry}
        style={{
          width: '100%', maxWidth: 380,
          background: 'transparent', color: 'var(--text-muted)',
          border: '1.5px solid var(--border)', borderRadius: 28,
          padding: '14px 24px', fontSize: 14, fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Accéder sans installer
      </button>
    </div>
  );
}
