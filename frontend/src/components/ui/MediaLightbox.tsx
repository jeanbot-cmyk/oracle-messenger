'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  type: 'image' | 'video';
  onClose: () => void;
  onSave?: () => void;   // déclenche le téléchargement
}

export function MediaLightbox({ src, type, onClose, onSave }: Props) {
  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const lastTouch  = useRef<{ x: number; y: number } | null>(null);
  const lastDist   = useRef<number>(0);
  const dragStart  = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

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

  // ── Pinch-to-zoom (touch) ──────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
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
    } else if (e.touches.length === 1 && scale > 1 && lastTouch.current) {
      const dx = e.touches[0].clientX - lastTouch.current.x;
      const dy = e.touches[0].clientY - lastTouch.current.y;
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
    }
  }

  function onTouchEnd() {
    if (scale <= 1) setOffset({ x: 0, y: 0 });
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
      a.download = type === 'video' ? 'video.mp4' : 'image.jpg';
      a.click();
    } catch {}
    onSave?.();
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.96)',
        display: 'flex', flexDirection: 'column',
        touchAction: 'none',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Barre du haut */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
      }}>
        <button onClick={onClose} style={{
          width: 40, height: 40, borderRadius: '50%', border: 'none',
          background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22,
        }}>✕</button>
        <button onClick={handleDownload} style={{
          width: 40, height: 40, borderRadius: '50%', border: 'none',
          background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" fill="white" viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </button>
      </div>

      {/* Contenu */}
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
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
            alt="media"
            draggable={false}
            style={{
              maxWidth: '100vw', maxHeight: '100vh',
              objectFit: 'contain',
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: dragging ? 'none' : 'transform 0.15s ease',
              cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
              userSelect: 'none',
            }}
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            style={{ maxWidth: '100vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        )}
      </div>

      {/* Hint zoom (image seulement) */}
      {type === 'image' && scale === 1 && (
        <div style={{
          position: 'absolute', bottom: 24, left: 0, right: 0,
          textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12, pointerEvents: 'none',
        }}>
          Double-tap pour zoomer · Pincer pour agrandir
        </div>
      )}
    </div>
  );
}
