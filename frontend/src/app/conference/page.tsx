'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const ACCENT = 'var(--brand)';

function cleanReference(value: string | null) {
  return String(value || '').trim().replace(/[^a-z0-9-_.]/gi, '');
}

export default function ConferencePage() {
  const params = useSearchParams();
  const reference = cleanReference(params?.get('reference') ?? null);
  const deepLink = useMemo(() => reference ? `oraclemessenger://paystack?scope=conference&reference=${encodeURIComponent(reference)}` : '', [reference]);

  useEffect(() => {
    if (!reference || typeof window === 'undefined') return;
    const next = '/tools?conferencePayment=verify';
    sessionStorage.setItem('oracle-after-login', next);
    localStorage.setItem('oracle-after-login', next);
    const timer = setTimeout(() => window.location.assign(deepLink), 300);
    return () => clearTimeout(timer);
  }, [deepLink, reference]);

  return (
    <main style={{ minHeight: '100dvh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <section style={{ width: '100%', maxWidth: 390, textAlign: 'center' }}>
        <img src="/icons/icon-192-v20260809-premium.png" alt="" style={{ width: 82, height: 82, borderRadius: 23, marginBottom: 18, boxShadow: '0 14px 34px rgba(16,42,42,0.14)' }} />
        <h1 style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: 27, lineHeight: 1.14, fontWeight: 900 }}>
          Oracle Conference
        </h1>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5, fontWeight: 700 }}>
          {reference ? "Verification en cours dans l'application." : 'Ouvrez Oracle Messenger pour gerer vos salles de conference.'}
        </p>
        <div style={{ textAlign: 'left', border: '1px solid var(--border)', borderRadius: 16, padding: 14, marginBottom: 16, background: '#F8FAFC' }}>
          <p style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 13.5, lineHeight: 18, fontWeight: 900 }}>
            Utilisation de la salle
          </p>
          <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 18, fontWeight: 750 }}>
            Le conférencier crée la salle dans Oracle Messenger, partage le lien, puis démarre la session à l’heure prévue.
          </p>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 18, fontWeight: 750 }}>
            Le participant ouvre le lien, rejoint la salle depuis l’application et suit les consignes audio, vidéo et présence.
          </p>
        </div>
        {reference && deepLink ? (
          <a href={deepLink}
            style={{ width: '100%', minHeight: 52, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 15, fontWeight: 900, boxSizing: 'border-box' }}>
            Ouvrir Oracle Messenger
          </a>
        ) : (
          <Link href="/tools"
            style={{ width: '100%', minHeight: 52, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 15, fontWeight: 900, boxSizing: 'border-box' }}>
            Aller aux outils
          </Link>
        )}
      </section>
    </main>
  );
}
