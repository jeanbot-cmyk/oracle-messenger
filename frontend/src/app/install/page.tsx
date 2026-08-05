'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { buildChromeInstallIntentUrl, shouldOpenAndroidLinkInChrome } from '../../lib/androidChrome';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

const ACCENT = 'var(--brand)';
const ACCENT_TEXT = 'var(--accent-text)';
const INSTALL_VERSION = '116-20260805-install-system-expiry';
const INSTALL_RESET_KEY = `oracle-install-reset-${INSTALL_VERSION}`;

type Device = 'ios' | 'android' | 'other';
type Inviter = { id: string; name: string; username: string; avatar?: string; phone?: string };
type InstallDiagnostic = {
  ok: boolean;
  lines: string[];
  errors: string[];
};
function detectDevice(): Device {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'other';
}

function appEntry() {
  if (typeof window === 'undefined') return '/chat';
  return localStorage.getItem('oracle-after-login') || sessionStorage.getItem('oracle-after-login') || '/chat';
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

async function resetInstallCacheState() {
  document.cookie = 'pwa-installed=; path=/; max-age=0; SameSite=Lax';
  localStorage.removeItem('oracle-client-cache-version');
  localStorage.removeItem('oracle-pwa-install-pending');
  sessionStorage.removeItem('oracle-install-reload-attempted');
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('oracle-sw-reloaded-'))
    .forEach(key => sessionStorage.removeItem(key));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(regs.map(reg => reg.unregister().catch(() => false)));
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await reg.update().catch(() => {});
  }
}

function readPwaLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem('oracle-pwa-install-log') || '[]');
    return Array.isArray(parsed) ? parsed.slice(-12) : [];
  } catch {
    return [];
  }
}

async function runInstallDiagnostics(promptAvailable: boolean): Promise<InstallDiagnostic> {
  const lines: string[] = [];
  const errors: string[] = [];
  const add = (label: string, value: string | boolean | number) => lines.push(`${label}: ${String(value)}`);
  const ua = navigator.userAgent;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  const isAndroid = /android/i.test(ua);
  const isChrome = /chrome\//i.test(ua) && !/samsungbrowser|edg\/|opr\/|opera|firefox|wv/i.test(ua);

  add('Version PWA', INSTALL_VERSION);
  add('Navigateur', ua);
  add('Mode installé', standalone ? 'oui' : 'non');
  add('Android', isAndroid ? 'oui' : 'non');
  add('Chrome compatible', isAndroid ? (isChrome ? 'oui' : 'non') : 'non requis');
  add('beforeinstallprompt reçu', promptAvailable ? 'oui' : 'non');
  add('Service Worker supporté', 'serviceWorker' in navigator ? 'oui' : 'non');
  add('Cache API supportée', 'caches' in window ? 'oui' : 'non');

  try {
    const pageHead = await fetch('/install', { method: 'HEAD', cache: 'no-store' });
    add('Page install HTTP', `${pageHead.status} ${pageHead.headers.get('content-type') || ''}`.trim());
    add('HSTS', pageHead.headers.get('strict-transport-security') || 'absent');
    add('CSP', pageHead.headers.get('content-security-policy') ? 'présente' : 'absente');
    add('nosniff', pageHead.headers.get('x-content-type-options') || 'absent');
  } catch (err: any) {
    errors.push(`Lecture headers impossible: ${err?.message || 'erreur inconnue'}`);
  }

  try {
    const manifestRes = await fetch('/manifest.json', { cache: 'no-store' });
    add('manifest.json HTTP', `${manifestRes.status} ${manifestRes.headers.get('content-type') || ''}`.trim());
    if (!manifestRes.ok) errors.push(`manifest.json inaccessible (${manifestRes.status})`);
    const manifest = await manifestRes.json();
    add('Manifest name', manifest.name || '');
    add('Manifest start_url', manifest.start_url || '');
    add('Manifest scope', manifest.scope || '');
    add('Manifest display', manifest.display || '');
    add('Manifest id', manifest.id || '');
    if (!manifest.name) errors.push('Manifest sans name');
    if (!manifest.start_url) errors.push('Manifest sans start_url');
    if (!manifest.scope) errors.push('Manifest sans scope');
    if (!manifest.icons?.length) errors.push('Manifest sans icônes');
    const requiredIcons = ['/icons/icon-192-v20260804.png', '/icons/icon-512-v20260804.png'];
    for (const icon of requiredIcons) {
      const res = await fetch(icon, { method: 'HEAD', cache: 'no-store' });
      add(`Icône ${icon}`, `${res.status} ${res.headers.get('content-type') || ''}`.trim());
      if (!res.ok) errors.push(`Icône manquante: ${icon}`);
    }
  } catch (err: any) {
    errors.push(`Manifest invalide: ${err?.message || 'erreur inconnue'}`);
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      add('SW enregistré', reg ? 'oui' : 'non');
      add('SW controller', navigator.serviceWorker.controller ? 'oui' : 'non');
      if (reg) {
        add('SW scope', reg.scope);
        add('SW active', reg.active?.state || 'non');
        add('SW installing', reg.installing?.state || 'non');
        add('SW waiting', reg.waiting?.state || 'non');
      }
    }
  } catch (err: any) {
    errors.push(`Diagnostic SW impossible: ${err?.message || 'erreur inconnue'}`);
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      add('Caches navigateur', keys.join(', ') || 'aucun');
    }
  } catch (err: any) {
    errors.push(`Lecture cache impossible: ${err?.message || 'erreur inconnue'}`);
  }

  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota) {
      add('Stockage utilisé', `${Math.round((estimate.usage || 0) / 1024 / 1024)} Mo / ${Math.round(estimate.quota / 1024 / 1024)} Mo`);
    }
  } catch {}

  readPwaLog().forEach((entry: any) => {
    if (entry?.event) lines.push(`Log ${entry.event}: ${entry.time || ''}`);
  });

  return { ok: errors.length === 0, lines, errors };
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

export default function InstallPage() {
  const { lang } = useSettings();
  const [device,     setDevice]     = useState<Device>('android');
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [installed,  setInstalled]  = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [manualInstall, setManualInstall] = useState(false);
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [contactSaved, setContactSaved] = useState(false);
  const [diagnostic, setDiagnostic] = useState<InstallDiagnostic | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const promptRef = useRef<any>(null);

  async function refreshDiagnostic(promptAvailable = !!(promptRef.current || (window as any).__installPrompt || (window as any).__pwaPrompt)) {
    const result = await runInstallDiagnostics(promptAvailable);
    setDiagnostic(result);
    return result;
  }

  useEffect(() => {
    setMounted(true);
    setDevice(detectDevice());
    const params = new URLSearchParams(window.location.search);
    const explicitReset = params.has('reset') && params.get('reset') !== 'done';
    if (
      explicitReset &&
      !window.matchMedia('(display-mode: standalone)').matches &&
      (navigator as any).standalone !== true &&
      sessionStorage.getItem(INSTALL_RESET_KEY) !== '1'
    ) {
      sessionStorage.setItem(INSTALL_RESET_KEY, '1');
      resetInstallCacheState().catch(() => {});
    }
    const inviteUsername = rememberInviteFromUrl();
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
      (window as any).__pwaPrompt = e;
      setInstallMessage('');
      setManualInstall(false);
      refreshDiagnostic(true).catch(() => {});
    };
    window.addEventListener('beforeinstallprompt', handler);
    const onInstalled = () => {
      setInstalled(true);
      promptRef.current = null;
      (window as any).__installPrompt = null;
      (window as any).__pwaPrompt = null;
      sessionStorage.removeItem('oracle-install-reload-attempted');
      setTimeout(goToAppEntry, 1800);
    };
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => reg.update().catch(() => {}))
        .catch(() => {})
        .finally(() => refreshDiagnostic().catch(() => {}));
    } else {
      refreshDiagnostic().catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function handleAndroidInstall() {
    if (shouldOpenAndroidLinkInChrome()) {
      setInstallMessage('Ouverture dans Chrome pour lancer une installation sûre...');
      window.location.assign(buildChromeInstallIntentUrl());
      return;
    }
    const prompt = promptRef.current || (window as any).__installPrompt || (window as any).__pwaPrompt;
    setManualInstall(false);
    setInstallMessage('');

    if (prompt) {
      // Must be called before any await, otherwise Chrome can lose the user gesture.
      setInstalling(true);
      try {
        prompt.prompt();
        const choice = await prompt.userChoice;
        promptRef.current = null;
        (window as any).__installPrompt = null;
        (window as any).__pwaPrompt = null;
        if (choice.outcome === 'accepted') {
          setInstalled(true);
          sessionStorage.removeItem('oracle-install-reload-attempted');
          setTimeout(goToAppEntry, 1800);
        } else {
          setManualInstall(true);
          setInstallMessage("Installation annulée. Appuie à nouveau sur Installer l'application pour réessayer.");
        }
      } catch {
        promptRef.current = null;
        (window as any).__installPrompt = null;
        (window as any).__pwaPrompt = null;
        setManualInstall(true);
        setInstallMessage("Chrome n'a pas pu ouvrir la fenêtre d'installation. Réessaie depuis Chrome.");
      } finally {
        setInstalling(false);
      }
      return;
    }

    await refreshDiagnostic(false);
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        reg.update().catch(() => {});
      } catch {}
    }
    setManualInstall(true);
    setInstallMessage("Si la fenêtre d'installation ne s'ouvre pas automatiquement, Chrome ne l'autorise pas maintenant. Appuie sur ⋮ en haut à droite, puis sur Installer l'application ou Ajouter à l'écran d'accueil.");
  }

  if (!mounted) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

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

  // ── iOS — Safari ne permet pas l'invite native PWA, donc on affiche
  // uniquement l'instruction utile.
  if (device === 'ios') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent:'center', background: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif', padding:'28px 24px', boxSizing:'border-box' }}>
        <div style={{ maxWidth:420, margin:'0 auto', width:'100%', textAlign:'center' }}>
          <img src="/icons/icon-192-v20260804.png" alt="" style={{ width:82, height:82, borderRadius:22, marginBottom:18 }} />
          <h1 style={{ fontSize:26, lineHeight:1.15, margin:'0 0 10px', color:'var(--text-primary)', fontWeight:900 }}>Oracle Messenger</h1>
          <p style={{ fontSize:15, lineHeight:1.45, margin:'0 0 24px', color:'var(--text-secondary)', fontWeight:650 }}>
            Installez l’application depuis Safari.
          </p>
          <button onClick={goToAppEntry}
            style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 28, padding: '18px 24px', fontSize: 17, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Ouvrir Oracle Messenger
          </button>
          <button onClick={goToAppEntry}
            style={{ width: '100%', background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: 28, padding: '14px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop:8 }}>
            Continuer sans installer
          </button>
        </div>
      </div>
    );
  }

  // ── Android / Other — native prompt ──
  const needsChrome = device === 'android' && shouldOpenAndroidLinkInChrome();
  const chromeInstallHref = buildChromeInstallIntentUrl();

  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 22px 30px', boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,sans-serif', WebkitOverflowScrolling: 'touch' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <main style={{ width: '100%', maxWidth: 390, minHeight: 'calc(100dvh - 58px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <img src="/icons/icon-192-v20260804.png" alt="" style={{ width: 92, height: 92, borderRadius: 26, marginBottom: 18, boxShadow: '0 14px 34px rgba(16,42,42,0.14)' }} />

      <h1 style={{ fontSize: 27, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.12 }}>
        Oracle Messenger
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0 0 22px', maxWidth: 285, fontWeight: 650 }}>
        Une installation rapide pour discuter et recevoir vos appels.
      </p>
      {inviter && (
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '0 0 18px', color: 'var(--text-secondary)' }}>
          <img src={inviter.avatar || '/icons/icon-96-v20260804.png'} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-input)' }} />
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>Invitation de</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 850, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{inviter.name}</p>
          </div>
        </div>
      )}

      {contactSaved && inviter && (
        <p style={{ margin: '-6px 0 12px', fontSize: 12, lineHeight: 1.4, fontWeight: 800, color: '#047857' }}>
          Contact préparé. Confirmez l’enregistrement si le téléphone le demande.
        </p>
      )}

      {inviter && normalizeInternationalPhone(inviter.phone || '') && (
        <button onClick={() => { saveContact(inviter); setContactSaved(true); }}
          style={{ border: 'none', background: 'transparent', color: 'var(--brand)', padding: '0 12px 14px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
          Enregistrer le contact
        </button>
      )}

      {/* Install button */}
      {needsChrome ? (
        <a
          href={chromeInstallHref}
          style={{
            width: '100%',
            background: ACCENT,
            color: '#fff', border: 'none', borderRadius: 28,
            padding: '17px 18px',
            fontSize: 'clamp(15px, 4.15vw, 17px)',
            fontWeight: 850,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 10px 24px rgba(16,42,42,0.18)',
            marginBottom: 14,
            textDecoration:'none',
            boxSizing:'border-box',
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="21" height="21" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Installer Oracle Messenger
        </a>
      ) : (
        <button
          onClick={handleAndroidInstall}
          disabled={installing}
          style={{
          width: '100%',
          background: installing ? 'var(--text-muted)' : ACCENT,
          color: '#fff', border: 'none', borderRadius: 28,
          padding: '17px 18px',
          fontSize: 'clamp(15px, 4.15vw, 17px)',
          fontWeight: 850,
          cursor: installing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: '0 10px 24px rgba(16,42,42,0.18)',
          marginBottom: 14,
          whiteSpace: 'nowrap',
          }}
        >
          {installing ? (
            <>
              <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
              {t(lang, 'install.inProgress')}
            </>
          ) : (
            <>
              <svg width="21" height="21" fill="none" stroke="#fff" strokeWidth="2.2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Installer Oracle Messenger
            </>
          )}
        </button>
      )}

      <button
        onClick={goToAppEntry}
        style={{
          width: '100%',
          background: 'transparent', color: 'var(--text-muted)',
          border: 'none', borderRadius: 28,
          padding: '12px 24px', fontSize: 14, fontWeight: 800,
          cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        Ouvrir sans installer
      </button>

      {(installMessage || manualInstall) && (
        <div style={{ width: '100%', background: '#EAF4F1', border: '1px solid rgba(16,42,42,0.14)', borderRadius: 18, padding: 16, marginBottom: 14, color: '#102A2A', textAlign: 'left' }}>
          <p style={{ fontSize: 14, fontWeight: 800, margin: '0 0 8px' }}>
            {t(lang, 'install.secureBrowserOnly')}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            {installMessage || t(lang, 'install.manualHelp')}
          </p>
        </div>
      )}

      <button onClick={() => setShowHelp(value => !value)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 850, padding: '8px 12px', cursor: 'pointer' }}>
        {showHelp ? 'Masquer l’aide' : 'Besoin d’aide ?'}
      </button>

      {showHelp && (
      <div style={{ width:'100%', border:'1px solid var(--border)', borderRadius:18, padding:14, marginTop:6, background:'#F8FAFC', color:'var(--text-primary)', textAlign: 'left' }}>
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:10 }}>
          <button
            onClick={() => {
              setInstallMessage(t(lang, 'install.cleaning'));
              resetInstallCacheState()
                .then(() => {
                  setManualInstall(true);
                  setInstallMessage(t(lang, 'install.cacheCleaned'));
                  refreshDiagnostic().catch(() => {});
                })
                .catch(() => {
                  setManualInstall(true);
                  setInstallMessage(t(lang, 'install.partialClean'));
                  refreshDiagnostic().catch(() => {});
                });
            }}
            style={{ border:'none', borderRadius:999, background:'var(--header-bg)', color:'#fff', padding:'10px 12px', fontSize:12, fontWeight:900, cursor:'pointer' }}
          >
            Nettoyer le cache et réessayer
          </button>
          <a href="/reset-pwa.html?next=/install" style={{ border:'1px solid var(--border)', borderRadius:999, background:'#fff', color:'var(--header-bg)', padding:'10px 12px', fontSize:12, fontWeight:900, cursor:'pointer', textAlign:'center', textDecoration:'none' }}>
            Réparer une page blanche
          </a>
          {diagnostic?.errors?.length ? (
            <div style={{ background:'#FEF2F2', color:'#991B1B', borderRadius:12, padding:10, fontSize:12, lineHeight:1.45, fontWeight:750 }}>
              {diagnostic.errors.map((err, index) => <div key={index}>{err}</div>)}
            </div>
          ) : (
            <p style={{ margin:0, color:'var(--text-secondary)', fontSize:12, lineHeight:1.45 }}>
              Aucun blocage manifeste détecté. Si l’invite ne s’ouvre pas, le navigateur peut exiger Chrome, un geste utilisateur, ou un nettoyage du cache.
            </p>
          )}
          <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0, maxHeight:220, overflow:'auto', background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:10, fontSize:11, lineHeight:1.45, color:'#0F172A' }}>
            {(diagnostic?.lines || ['Diagnostic en préparation...']).join('\n')}
          </pre>
          <button
            onClick={() => {
              const text = [
                'Diagnostic Oracle Messenger PWA',
                ...(diagnostic?.errors?.length ? ['Erreurs:', ...diagnostic.errors] : []),
                'Détails:',
                ...(diagnostic?.lines || []),
              ].join('\n');
              navigator.clipboard?.writeText(text).catch(() => {});
              setInstallMessage('Diagnostic copié. Envoie ce texte pour comparer le téléphone qui échoue avec celui qui fonctionne.');
            }}
            style={{ border:'none', borderRadius:999, background:'var(--header-bg)', color:'#fff', padding:'10px 12px', fontSize:12, fontWeight:900, cursor:'pointer' }}
          >
            Copier le diagnostic
          </button>
        </div>
      </div>
      )}
      </main>
    </div>
  );
}
