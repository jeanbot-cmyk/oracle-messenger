'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const ACCENT = '#128C7E';

export default function GalleryPage() {
  const { status } = useSession();
  const router = useRouter();
  const [photos, setPhotos] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = JSON.parse(localStorage.getItem('oracle-gallery') ?? '[]');
      setPhotos(saved);
    } catch {}
  }, [mounted]);

  function handleDelete(idx: number) {
    const updated = photos.filter((_, i) => i !== idx);
    setPhotos(updated);
    localStorage.setItem('oracle-gallery', JSON.stringify(updated));
    if (selected === photos[idx]) setSelected(null);
  }

  function handleEdit(photo: string) {
    sessionStorage.setItem('photo-edit-src', photo);
    router.push('/gallery/edit');
  }

  if (!mounted) return null;

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f2f5', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e9edef', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f0f2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111b21', margin: 0, flex: 1 }}>Ma Galerie</h1>
        <span style={{ fontSize: 13, color: '#8696a0' }}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
      </div>

      {photos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100dvh - 65px)', gap: 16, color: '#8696a0' }}>
          <svg width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p style={{ fontSize: 15, margin: 0 }}>Aucune photo retouchée</p>
          <p style={{ fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 240 }}>
            Utilisez l'outil "Retouche Photo" pour modifier et sauvegarder des photos ici.
          </p>
        </div>
      ) : (
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
          {photos.map((photo, i) => (
            <div key={i} onClick={() => setSelected(photo)}
              style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', borderRadius: 4, position: 'relative' }}>
              <img src={photo} alt={`Photo ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 100, display: 'flex', flexDirection: 'column' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', flexShrink: 0 }}>
            <button onClick={() => setSelected(null)}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ✕
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleEdit(selected)}
                style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                ✏️ Retoucher
              </button>
              <button onClick={() => handleDelete(photos.indexOf(selected))}
                style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                🗑 Supprimer
              </button>
            </div>
          </div>
          {/* Image */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <img src={selected} alt="Aperçu"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          </div>
          {/* Download */}
          <div style={{ padding: '16px 20px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
            <a href={selected} download={`oracle-photo-${Date.now()}.jpg`}
              style={{ padding: '12px 32px', borderRadius: 24, background: '#fff', color: '#111b21', fontSize: 15, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Télécharger
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
