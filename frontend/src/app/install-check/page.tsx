'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { getInstallPrompt, logPwaInstall, setInstallPrompt } from '../../lib/pwaInstall';

type CheckState = {
  prompt: boolean;
  standalone: boolean;
  sw: string;
  controlled: boolean;
  manifest: string;
  display?: string;
  startUrl?: string;
  icons?: number;
  ua: string;
};

export default function InstallCheckPage() {
  const [state, setState] = useState<CheckState | null>(null);

  async function readState(prompt = !!getInstallPrompt()) {
    let sw = 'unsupported';
    let controlled = false;
    if ('serviceWorker' in navigator) {
      controlled = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.getRegistration('/').catch(() => null);
      sw = reg?.active?.state || reg?.installing?.state || reg?.waiting?.state || 'none';
    }

    let manifest: any = {};
    await fetch('/manifest.json', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => { manifest = data; })
      .catch(() => {});

    const next = {
      prompt,
      standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true,
      sw,
      controlled,
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
      display: manifest.display,
      startUrl: manifest.start_url,
      icons: manifest.icons?.length || 0,
      ua: navigator.userAgent,
    };
    setState(next);
    logPwaInstall('install-check-state', next);
  }

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      readState(true).catch(() => {});
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    navigator.serviceWorker?.register('/sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update().catch(() => {}))
      .finally(() => readState().catch(() => {}));
    const timer = window.setTimeout(() => readState().catch(() => {}), 3500);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  return (
    <main style={{ minHeight: '100dvh', padding: 20, fontFamily: 'system-ui,sans-serif', background: '#fff', color: '#102A2A' }}>
      <h1 style={{ marginTop: 0 }}>Oracle Messenger install check</h1>
      <button onClick={() => readState().catch(() => {})} style={{ border: 'none', borderRadius: 999, padding: '12px 16px', background: '#102A2A', color: '#fff', fontWeight: 900 }}>
        Actualiser
      </button>
      <pre style={{ marginTop: 18, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#F4F7F6', borderRadius: 14, padding: 14, fontSize: 12, lineHeight: 1.5 }}>
        {JSON.stringify(state || { loading: true }, null, 2)}
      </pre>
    </main>
  );
}
