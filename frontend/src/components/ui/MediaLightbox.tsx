'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  type: 'image' | 'video' | 'document';
  onClose: () => void;
  onSave?: () => void;   // déclenche le téléchargement
  title?: string;
  subtitle?: string;
  fileName?: string;
  mime?: string;
  qualityMode?: 'media' | 'profile';
  profileActions?: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
}

function isPreviewableDocument(mime = '', fileName = '') {
  const lower = `${mime} ${fileName} ${srcSafeExt(fileName)}`.toLowerCase();
  return lower.includes('pdf') || lower.includes('text/') || lower.endsWith('.txt');
}

function srcSafeExt(fileName: string) {
  const match = fileName.match(/\.[a-z0-9]{2,8}$/i);
  return match?.[0] ?? '';
}

export function MediaLightbox({ src, type, onClose, onSave, title, subtitle, fileName, mime, qualityMode = 'media', profileActions = [] }: Props) {
  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const lastTouch  = useRef<{ x: number; y: number } | null>(null);
  const lastDist   = useRef<number>(0);
  const dragStart  = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const singleTouchStart = useRef<{ x: number; y: number } | null>(null);

  // Fermer avec Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Bloquer le scroll body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setNaturalSize(null);
  }, [src]);

  // ── Pinch-to-zoom (touch) ──────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
      singleTouchStart.current = null;
    } else if (e.touches.length === 1) {
      const touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouch.current = touch;
      singleTouchStart.current = touch;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / (lastDist.current || dist);
      lastDist.current = dist;
      setScale(s => Math.min(Math.max(s * ratio, 1), 5));
    } else if (e.touches.length === 1 && lastTouch.current) {
      const dx = e.touches[0].clientX - lastTouch.current.x;
      const dy = e.touches[0].clientY - lastTouch.current.y;
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (scale > 1) {
        setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
      } else if (type === 'image' && singleTouchStart.current) {
        const totalY = e.touches[0].clientY - singleTouchStart.current.y;
        const totalX = Math.abs(e.touches[0].clientX - singleTouchStart.current.x);
        if (Math.abs(totalY) > totalX && totalY > 0) {
          setOffset({ x: 0, y: Math.min(totalY, 180) });
        }
      }
    }
  }

  function onTouchEnd() {
    if (scale <= 1) {
      if (offset.y > 110) {
        onClose();
        return;
      }
      setOffset({ x: 0, y: 0 });
    }
    singleTouchStart.current = null;
  }

  // Double-tap pour reset zoom
  const lastTap = useRef(0);
  function onDoubleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setScale(s => s > 1 ? 1 : 2.5);
      setOffset({ x: 0, y: 0 });
    }
    lastTap.current = now;
  }

  // ── Mouse drag (desktop) ───────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragStart.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  }
  function onMouseUp() { dragStart.current = null; setDragging(false); }

  function handleDownload() {
    try {
      const a = document.createElement('a');
      a.href = src;
      a.download = fileName || (type === 'video' ? 'video.mp4' : type === 'document' ? 'document' : 'image.jpg');
      a.click();
    } catch {}
    onSave?.();
  }

  function handleOpenExternal() {
    window.open(src, '_blank', 'noopener,noreferrer');
  }

  const canPreviewDocument = type === 'document' && isPreviewableDocument(mime, fileName);
  const isProfileImage = type === 'image' && qualityMode === 'profile';
  const profileMaxUpscale = 1.35;
  const mediaImageBox = {
    width: 'auto',
    height: 'auto',
    maxWidth: 'calc(100dvw - 18px)',
    maxHeight: 'calc(100dvh - 118px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
  };
  const profileImageBox = qualityMode === 'profile' && naturalSize
    ? {
        width: `min(100dvw, ${Math.round(naturalSize.width * profileMaxUpscale)}px)`,
        height: `min(${profileActions.length ? 'calc(100dvh - 112px)' : '100dvh'}, ${Math.round(naturalSize.height * profileMaxUpscale)}px)`,
      }
    : mediaImageBox;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: type === 'image' || type === 'video' ? '#000' : `rgba(0,0,0,${Math.max(0.78, 0.98 - Math.abs(offset.y) / 520)})`,
        display: 'flex', flexDirection: 'column',
        touchAction: type === 'document' ? 'auto' : 'none',
        animation: 'omLightboxIn 160ms ease both',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {isProfileImage && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(28px)',
            transform: 'scale(1.12)',
            opacity: 0.34,
          }}
        />
      )}
      {isProfileImage && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.72), rgba(0,0,0,.2) 44%, rgba(0,0,0,.86))' }} />
      )}
      {/* Barre du haut */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(12px + env(safe-area-inset-top, 0px)) 14px 18px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.82), rgba(0,0,0,0.42), transparent)',
      }}>
        <button onClick={onClose} style={{
          width: 40, height: 40, borderRadius: '50%', border: 'none',
          background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22,
          flexShrink: 0,
        }} aria-label="Fermer">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div style={{ minWidth: 0, flex: 1, color: '#fff' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 850, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || (type === 'document' ? fileName || 'Document' : type === 'video' ? 'Vidéo' : 'Photo')}
          </p>
          {subtitle && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subtitle}
            </p>
          )}
        </div>
        {type === 'document' && (
          <button onClick={handleOpenExternal} style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            flexShrink: 0,
          }} aria-label="Ouvrir">
            <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/></svg>
          </button>
        )}
        <button onClick={handleDownload} style={{
          width: 40, height: 40, borderRadius: '50%', border: 'none',
          background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }} aria-label="Télécharger">
          <svg width="20" height="20" fill="white" viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </button>
      </div>

      {/* Contenu */}
      <div
        style={{ flex: 1, width: '100dvw', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: type === 'document' ? '82px 12px 18px' : isProfileImage && profileActions.length ? '74px 0 102px' : '74px 9px calc(44px + env(safe-area-inset-bottom, 0px))', zIndex: 1 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={dragging ? onMouseMove : undefined}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onDoubleTap}
      >
        {type === 'image' ? (
          <img
            src={src}
            alt={title || 'media'}
            draggable={false}
            onLoad={event => {
              const img = event.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              }
            }}
            style={{
              ...(isProfileImage ? profileImageBox : mediaImageBox),
              objectFit: 'contain',
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: dragging ? 'none' : 'transform 0.16s ease',
              cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
              userSelect: 'none',
              imageRendering: 'auto',
              borderRadius: isProfileImage ? 18 : 0,
              boxShadow: isProfileImage ? '0 20px 70px rgba(0,0,0,.48)' : undefined,
            }}
          />
        ) : type === 'video' ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            style={{ width: '100vw', maxWidth: '100vw', maxHeight: '100dvh', objectFit: 'contain', background: '#000' }}
          />
        ) : (
          <div style={{ width: 'min(100%, 980px)', height: 'min(100%, 78dvh)', borderRadius: 12, overflow: 'hidden', background: '#111', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 18px 48px rgba(0,0,0,0.32)' }}>
            {canPreviewDocument ? (
              <iframe
                src={src}
                title={title || fileName || 'Document'}
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', color: '#fff' }}>
                <div style={{ width: 76, height: 76, borderRadius: 22, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <svg width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13H7a2 2 0 01-2-2V5a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6h5"/></svg>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 850, maxWidth: 520, overflowWrap: 'anywhere' }}>{fileName || title || 'Document'}</p>
                {subtitle && <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.68)' }}>{subtitle}</p>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button onClick={handleOpenExternal} style={{ minHeight: 42, border: 'none', borderRadius: 999, background: '#fff', color: '#111', padding: '10px 16px', fontWeight: 850, cursor: 'pointer' }}>Ouvrir</button>
                  <button onClick={handleDownload} style={{ minHeight: 42, border: '1px solid rgba(255,255,255,0.22)', borderRadius: 999, background: 'rgba(255,255,255,0.10)', color: '#fff', padding: '10px 16px', fontWeight: 850, cursor: 'pointer' }}>Télécharger</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isProfileImage && profileActions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 12,
            padding: '12px 10px calc(12px + env(safe-area-inset-bottom, 0px))',
            background: 'linear-gradient(to top, rgba(0,0,0,.88), rgba(0,0,0,.48), transparent)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(profileActions.length, 7)}, minmax(0, 1fr))`, gap: 6, maxWidth: 720, margin: '0 auto' }}>
            {profileActions.map(action => (
              <button
                key={action.key}
                onClick={action.onClick}
                disabled={action.disabled}
                style={{
                  minWidth: 0,
                  minHeight: 58,
                  border: 'none',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,.10)',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  cursor: action.disabled ? 'not-allowed' : 'pointer',
                  opacity: action.disabled ? 0.42 : 1,
                  fontSize: 10.5,
                  fontWeight: 760,
                  lineHeight: 1.1,
                  backdropFilter: 'blur(10px)',
                }}
                aria-label={action.label}
                title={action.label}
              >
                <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{action.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes omLightboxIn{from{opacity:.65;transform:scale(.985)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
