'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Shown once after Google login if the user has no phone number on record.
 * Saves the number to the backend with a 3-second fake verification delay.
 */
export function PhoneOnboarding({ onDone }: { onDone: () => void }) {
  const { data: session } = useSession();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'form' | 'verifying' | 'done'>('form');
  const [error, setError] = useState('');

  async function handleSubmit() {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length < 8) {
      setError('Veuillez entrer un numéro valide (minimum 8 chiffres).');
      return;
    }
    setError('');
    setStep('verifying');

    // Save to backend in background during the 3s fake verification
    const token = session?.user?.backendToken;
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/me/phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: cleaned }),
      }).catch(() => {});
    }
    // Also persist locally
    try {
      const local = JSON.parse(localStorage.getItem('oracle-profile') ?? '{}');
      localStorage.setItem('oracle-profile', JSON.stringify({ ...local, phone: cleaned }));
    } catch {}

    // 3-second fake verification delay
    await new Promise(r => setTimeout(r, 3000));
    setStep('done');
    onDone();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 32,
    }}>
      {step === 'verifying' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, border: '4px solid #e9edef', borderTopColor: '#128C7E',
            borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 24px',
          }} />
          <p style={{ fontSize: 16, color: '#111B21', fontWeight: 600, margin: '0 0 8px' }}>
            Vérification automatique de la ligne...
          </p>
          <p style={{ fontSize: 13, color: '#667781', margin: 0 }}>
            Veuillez patienter quelques instants
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <>
          {/* Logo */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: '#128C7E',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 28, flexShrink: 0,
          }}>
            <svg width="36" height="36" fill="white" viewBox="0 0 24 24">
              <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>
            </svg>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111B21', margin: '0 0 10px', textAlign: 'center' }}>
            Associez votre numéro
          </h1>
          <p style={{ fontSize: 14, color: '#667781', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.6, maxWidth: 320 }}>
            Veuillez renseigner le numéro de téléphone actif dans cet appareil.
          </p>
          <p style={{ fontSize: 13, color: '#667781', textAlign: 'center', fontStyle: 'italic', margin: '0 0 32px', maxWidth: 320, lineHeight: 1.5 }}>
            Une vérification automatique de la conformité de votre ligne va être effectuée en arrière-plan.
          </p>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
              padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16, width: '100%', maxWidth: 360,
            }}>
              {error}
            </div>
          )}

          <div style={{ width: '100%', maxWidth: 360, marginBottom: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 0,
              border: '1.5px solid #e9edef', borderRadius: 12, overflow: 'hidden',
              background: '#F8F9FA',
            }}>
              <div style={{
                padding: '14px 14px', background: '#F8F9FA', borderRight: '1px solid #e9edef',
                fontSize: 20, flexShrink: 0,
              }}>
                📱
              </div>
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="+225 07 00 00 00 00"
                autoFocus
                style={{
                  flex: 1, border: 'none', outline: 'none', padding: '14px 16px',
                  fontSize: 16, color: '#111B21', background: 'transparent',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
              />
            </div>
            <p style={{ fontSize: 12, color: '#8696a0', margin: '8px 0 0 4px' }}>
              Format international recommandé : +225 07 XX XX XX XX
            </p>
          </div>

          <button
            onClick={handleSubmit}
            style={{
              width: '100%', maxWidth: 360,
              background: '#128C7E', color: '#fff', border: 'none',
              borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', marginBottom: 16,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Valider et continuer
          </button>

          <button
            onClick={onDone}
            style={{
              background: 'none', border: 'none', color: '#8696a0',
              fontSize: 13, cursor: 'pointer', padding: '8px',
            }}
          >
            Ignorer pour l'instant
          </button>
        </>
      )}
    </div>
  );
}
