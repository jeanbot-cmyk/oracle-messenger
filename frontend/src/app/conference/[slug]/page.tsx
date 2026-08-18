'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  buildChromeInstallIntentUrl,
  installPageUrl,
  shouldOpenAndroidLinkInChrome,
} from '../../../lib/androidChrome';
import { BACKEND_URL } from '../../../lib/config';

const ACCENT = 'var(--brand)';

type PublicConferenceRoom = {
  title?: string;
  description?: string | null;
  coverUrl?: string | null;
  logoUrl?: string | null;
  speakerName?: string | null;
  status?: string;
};

function cleanSlug(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  try {
    return decodeURIComponent(String(raw || '')).trim().replace(/[^a-z0-9-_.]/gi, '');
  } catch {
    return String(raw || '').trim().replace(/[^a-z0-9-_.]/gi, '');
  }
}

export default function ConferenceLinkPage() {
  const params = useParams<{ slug?: string | string[] }>();
  const slug = cleanSlug(params?.slug);
  const [copied, setCopied] = useState(false);
  const [room, setRoom] = useState<PublicConferenceRoom | null>(null);

  const deepLink = useMemo(() => slug ? `oraclemessenger://conference/${encodeURIComponent(slug)}` : '', [slug]);
  const webPath = useMemo(() => slug ? `/conference/${encodeURIComponent(slug)}` : '/tools', [slug]);
  const installHref = useMemo(() => {
    if (!slug || typeof window === 'undefined') return '/install';
    const next = `/tools?conference=${encodeURIComponent(slug)}`;
    return shouldOpenAndroidLinkInChrome()
      ? buildChromeInstallIntentUrl({ conference: slug, next })
      : installPageUrl({ conference: slug, next });
  }, [slug]);

  useEffect(() => {
    if (!slug || typeof window === 'undefined') return;
    const next = `/tools?conference=${encodeURIComponent(slug)}`;
    sessionStorage.setItem('oracle-after-login', next);
    localStorage.setItem('oracle-after-login', next);
    localStorage.setItem('oracle-pending-conference-slug', slug);
    const timer = setTimeout(() => {
      window.location.assign(deepLink);
    }, 350);
    return () => clearTimeout(timer);
  }, [deepLink, slug]);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    fetch(`${BACKEND_URL}/conference/rooms/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (alive && data?.room) setRoom(data.room);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [slug]);

  async function copyLink() {
    if (!deepLink) return;
    const message = `${window.location.origin}${webPath}\n${deepLink}\nCode salle : ${slug}`;
    await navigator.clipboard?.writeText(message).catch(() => undefined);
    setCopied(true);
  }

  if (!slug) {
    return (
      <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: 24, fontFamily: 'system-ui,-apple-system,sans-serif' }}>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 750 }}>Lien de conference invalide.</p>
      </main>
    );
  }

  const title = room?.title || 'Salle de conférence Oracle';
  const speaker = room?.speakerName || 'Oracle Messenger';
  const description = room?.description || 'Ouvrez ce lien pour rejoindre la salle de conférence.';
  const cover = room?.coverUrl || room?.logoUrl || '';
  const status = room?.status === 'live' ? 'En direct' : room?.status === 'ended' ? 'Terminée' : 'En préparation';

  return (
    <main style={{ minHeight: '100dvh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <section style={{ width: '100%', maxWidth: 420, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 18, overflow: 'hidden', marginBottom: 18, background: '#102A2A', boxShadow: '0 18px 42px rgba(16,42,42,0.18)', position: 'relative' }}>
          {cover ? (
            <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <img src="/icons/icon-192-v20260809-premium.png" alt="" style={{ width: 92, height: 92, borderRadius: 26, position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.54))' }} />
          <span style={{ position: 'absolute', left: 14, top: 14, minHeight: 28, borderRadius: 14, padding: '5px 10px', background: room?.status === 'live' ? '#E11D48' : 'rgba(255,255,255,0.90)', color: room?.status === 'live' ? '#fff' : ACCENT, fontSize: 12, lineHeight: '16px', fontWeight: 900 }}>
            {status}
          </span>
        </div>
        <p style={{ margin: '0 0 8px', color: ACCENT, fontSize: 12, lineHeight: 16, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0 }}>
          Oracle Conference
        </p>
        <h1 style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: 28, lineHeight: 1.14, fontWeight: 900 }}>
          {title}
        </h1>
        <p style={{ margin: '0 0 8px', color: ACCENT, fontSize: 14, lineHeight: 19, fontWeight: 900 }}>
          {speaker}
        </p>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5, fontWeight: 700 }}>
          {description}
        </p>
        <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 14, boxSizing: 'border-box', background: '#F8FAFC', textAlign: 'left' }}>
          <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 16, fontWeight: 850 }}>Code salle</p>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16, lineHeight: 22, fontWeight: 900, wordBreak: 'break-word' }}>{slug}</p>
        </div>
        <div style={{ width: '100%', border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)', borderRadius: 14, padding: 14, marginBottom: 14, boxSizing: 'border-box', background: '#F8FAFC', textAlign: 'left' }}>
          <p style={{ margin: '0 0 6px', color: ACCENT, fontSize: 12, lineHeight: 16, fontWeight: 900, textTransform: 'uppercase' }}>Accès conférence</p>
          <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 18, fontWeight: 750 }}>
            Participants : ouvrez la salle dans Oracle Messenger, autorisez micro/caméra si nécessaire, puis attendez l’entrée du conférencier.
          </p>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 18, fontWeight: 750 }}>
            Conférencier : utilisez le même lien pour démarrer la salle, gérer les accès et maintenir la session active.
          </p>
        </div>
        <a href={deepLink}
          style={{ width: '100%', minHeight: 54, borderRadius: 27, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 16, fontWeight: 900, boxShadow: '0 10px 24px rgba(16,42,42,0.18)', boxSizing: 'border-box' }}>
          Ouvrir dans Oracle Messenger
        </a>
        <a href={installHref}
          style={{ marginTop: 10, width: '100%', minHeight: 48, borderRadius: 24, background: 'transparent', color: ACCENT, border: '1px solid color-mix(in srgb, var(--brand) 28%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 14, fontWeight: 850, boxSizing: 'border-box' }}>
          Installer l'application
        </a>
        <button onClick={copyLink}
          style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 22, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>
          {copied ? 'Invitation copiee' : 'Copier invitation'}
        </button>
      </section>
    </main>
  );
}
