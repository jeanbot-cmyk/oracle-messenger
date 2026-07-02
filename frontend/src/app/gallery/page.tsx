'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MediaLightbox } from '../../components/ui/MediaLightbox';
import { GALLERY_KEY, type MediaItem } from '../../lib/gallery';

const ACCENT = '#128C7E';

export default function GalleryPage() {
  const { status } = useSession();
  const router     = useRouter();
  const [items,    setItems]    = useState<MediaItem[]>([]);
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [mounted,  setMounted]  = useState(false);
  const [tab,      setTab]      = useState<'all' | 'image' | 'video'>('all');

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  const reload = useCallback(() => {
    try {
      const saved: MediaItem[] = JSON.parse(localStorage.getItem(GALLERY_KEY) ?? '[]');
      setItems(saved);
    } catch {}
  }, []);

  useEffect(() => { if (mounted) reload(); }, [mounted, reload]);

  function handleDelete(item: MediaItem) {
    const updated = items.filter(i => i.src !== item.src);
    setItems(updated);
    localStorage.setItem(GALLERY_KEY, JSON.stringify(updated));
    if (lightbox?.src === item.src) setLightbox(null);
  }

  function handleEdit(item: MediaItem) {
    sessionStorage.setItem('photo-edit-src', item.src);
    router.push('/gallery/edit');
  }

  function downloadToPhone(item: MediaItem) {
    try {
      const a = document.createElement('a');
      a.href = item.src;
      a.download = item.name ?? `oracle-${item.type}-${Date.now()}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  }

  if (!mounted) return null;

  const filtered = tab === 'all' ? items : items.filter(i => i.type === tab);
  const imgCount = items.filter(i => i.type === 'image').length;
  const vidCount = items.filter(i => i.type === 'video').length;

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f2f5' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e9edef', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f0f2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111b21', margin: 0, flex: 1 }}>Galerie</h1>
        <span style={{ fontSize: 13, color: '#8696a0' }}>{items.length} média{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e9edef' }}>
        {([['all', `Tout (${items.length})`], ['image', `Photos (${imgCount})`], ['video', `Vidéos (${vidCount})`]] as [string,string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === id ? ACCENT : '#f0f2f5', color: tab === id ? '#fff' : '#667781' }}>
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100dvh - 120px)', gap: 16, color: '#8696a0', padding: 24, textAlign: 'center' }}>
          <svg width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#111b21', margin: 0 }}>Galerie vide</p>
          <p style={{ fontSize: 13, margin: 0, maxWidth: 260, lineHeight: 1.6 }}>Les photos et vidéos reçues dans vos conversations apparaîtront ici automatiquement.</p>
        </div>
      ) : (
        <div style={{ padding: 3, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
          {filtered.map((item, i) => (
            <div key={i} onClick={() => setLightbox(item)} style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', position: 'relative', background: '#000' }}>
              {item.type === 'image' ? (
                <img src={item.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <video src={item.src} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                </>
              )}
              <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '2px 5px' }}>
                <span style={{ fontSize: 9, color: '#fff' }}>{new Date(item.savedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <>
          <MediaLightbox src={lightbox.src} type={lightbox.type} onClose={() => setLightbox(null)} onSave={() => downloadToPhone(lightbox)} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001, display: 'flex', gap: 10, padding: '12px 16px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}>
            <button onClick={() => downloadToPhone(lightbox)}
              style={{ flex: 1, background: '#fff', color: '#111b21', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Enregistrer sur le téléphone
            </button>
            {lightbox.type === 'image' && (
              <button onClick={() => { setLightbox(null); handleEdit(lightbox); }}
                style={{ flex: 1, background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                ✏️ Retoucher
              </button>
            )}
            <button onClick={() => handleDelete(lightbox)}
              style={{ width: 48, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
