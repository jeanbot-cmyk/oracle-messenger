'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { buildChromeInstallIntentUrl, isAndroidDevice, isInstalledAppMode, isIosDevice, shouldOpenAndroidLinkInChrome } from '../lib/androidChrome';
import { ensureServiceWorkerReady, getInstallPrompt, logPwaInstall, openInstallPrompt, resetPwaInstallState, setInstallPrompt, waitForInstallPrompt } from '../lib/pwaInstall';

const ACCENT = 'var(--brand)';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return isInstalledAppMode();
}

function pendingRoute() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('oracle-after-login') || sessionStorage.getItem('oracle-after-login') || '';
}

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const promptRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState('');
  const [nativeMode, setNativeMode] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNativeMode(isStandalone());
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => reg.update().catch(() => {}))
        .catch(() => {});
    }
    if (getInstallPrompt()) promptRef.current = getInstallPrompt();
    const onPrompt = (e: any) => {
      e.preventDefault();
      promptRef.current = e;
      setInstallPrompt(e);
      setMessage('');
    };
    const onPromptReady = () => {
      promptRef.current = getInstallPrompt();
      setMessage('');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('oracle:pwa-prompt-ready', onPromptReady);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('oracle:pwa-prompt-ready', onPromptReady);
    };
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (nativeMode && status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated') {
      router.replace(pendingRoute() || '/chat');
    }
  }, [nativeMode, router, status]);

  async function install() {
    if (nativeMode) {
      router.replace(status === 'authenticated' ? (pendingRoute() || '/chat') : '/login');
      return;
    }
    setMessage('');
    setInstalling(true);
    logPwaInstall('home-install-click', { hasPrompt: !!getInstallPrompt(), android: isAndroidDevice() });
    if (shouldOpenAndroidLinkInChrome()) {
      logPwaInstall('home-open-chrome-intent');
      window.location.assign(buildChromeInstallIntentUrl());
      return;
    }
    try {
      await ensureServiceWorkerReady();
      const prompt = promptRef.current || getInstallPrompt() || await waitForInstallPrompt(6500);
      if (!prompt) {
        logPwaInstall('home-prompt-missing-after-wait');
        if (isAndroidDevice()) {
          await resetPwaInstallState();
          window.location.assign(buildChromeInstallIntentUrl({
            retry: '1',
            v: '197-20260808-playstore-stability',
            t: String(Date.now()),
          }));
          return;
        }
        if (isIosDevice()) {
          setMessage("Sur iPhone, touchez Partager puis Ajouter à l’écran d’accueil.");
          return;
        }
        setMessage("Installation non disponible sur ce navigateur.");
        return;
      }
      const choice = await openInstallPrompt(prompt);
      promptRef.current = null;
      if (choice?.outcome === 'accepted') {
        logPwaInstall('home-install-accepted-open-app', { entry: pendingRoute() || '/chat' });
        document.cookie = 'pwa-installed=1; path=/; max-age=31536000; SameSite=Lax';
        localStorage.setItem('oracle-pwa-install-pending', '1');
        router.replace(pendingRoute() || '/chat');
      } else {
        setMessage(isAndroidDevice() ? '' : 'Installation annulée.');
      }
    } catch (err: any) {
      logPwaInstall('home-install-error', { message: err?.message || String(err) });
      setMessage(isAndroidDevice() ? '' : 'Installation non disponible sur ce navigateur.');
    } finally {
      setInstalling(false);
    }
  }

  function openWithoutInstall() {
    logPwaInstall('home-open-without-install', { entry: pendingRoute() || '/chat' });
    router.replace(pendingRoute() || '/chat');
  }

  if (!mounted || nativeMode) {
    return (
      <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
        <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px max(20px, env(safe-area-inset-left)) calc(24px + env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-right))', boxSizing:'border-box', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <main style={{ width:'100%', maxWidth:390, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
        <img src="/icons/icon-192-v20260809-premium.png" alt="" style={{ width:96, height:96, borderRadius:26, marginBottom:20, boxShadow:'0 14px 34px rgba(16,42,42,0.14)' }} />
        <h1 style={{ margin:'0 0 8px', fontSize:28, lineHeight:1.12, fontWeight:900, color:'var(--text-primary)' }}>Oracle Messenger</h1>
        <p style={{ margin:'0 0 28px', maxWidth:300, fontSize:15, lineHeight:1.5, fontWeight:650, color:'var(--text-secondary)' }}>
          Messages, appels, outils créatifs IA et automatisation Business dans une seule application.
        </p>
        <button onClick={install} disabled={installing}
          style={{ width:'100%', minHeight:58, border:'none', borderRadius:999, background:installing ? 'var(--text-muted)' : ACCENT, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:10, fontSize:17, fontWeight:900, boxShadow:'0 12px 26px rgba(16,42,42,0.18)', cursor:installing ? 'wait' : 'pointer' }}>
          {nativeMode ? 'Commencer' : installing ? 'Installation...' : "Installer l'application"}
        </button>
        {!nativeMode && <button onClick={openWithoutInstall}
          style={{ marginTop:10, width:'100%', minHeight:46, border:'1px solid color-mix(in srgb, var(--brand) 28%, transparent)', borderRadius:999, background:'transparent', color:ACCENT, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:850, cursor:'pointer' }}>
          Accéder sans installer
        </button>}
        {message && !isAndroidDevice() && (
          <p style={{ margin:'16px 0 0', fontSize:13, lineHeight:1.45, color:'var(--text-secondary)', fontWeight:650 }}>
            {message}
          </p>
        )}
      </main>
    </div>
  );
}
