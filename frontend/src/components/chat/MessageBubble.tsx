'use client';
import { useState, useRef } from 'react';
import { format } from 'date-fns';
import type { Message } from '../../types';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

interface Props {
  message: Message;
  isOwn: boolean;
  onReply: (m: Message) => void;
  onDelete: (id: string) => void;
  onEdit: (m: Message) => void;
}

function StatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'sending')   return <span style={{ fontSize: 10, opacity: .5 }}>⏳</span>;
  if (status === 'sent')      return <span style={{ fontSize: 12, opacity: .6, color: '#667781' }}>✓</span>;
  if (status === 'delivered') return <span style={{ fontSize: 12, opacity: .7, color: '#667781' }}>✓✓</span>;
  if (status === 'read')      return <span style={{ fontSize: 12, color: '#53bdeb', fontWeight: 700 }}>✓✓</span>;
  return null;
}

function isBase64(s: string) {
  return typeof s === 'string' && s.startsWith('data:');
}

function detectType(content: string, declaredType: string): 'image' | 'video' | 'audio' | 'file' | 'text' {
  if (declaredType === 'image' || (isBase64(content) && content.startsWith('data:image'))) return 'image';
  if (declaredType === 'video' || (isBase64(content) && content.startsWith('data:video'))) return 'video';
  if (declaredType === 'audio' || (isBase64(content) && content.startsWith('data:audio'))) return 'audio';
  if (declaredType === 'file' || declaredType === 'document') return 'file';
  if (isBase64(content)) {
    if (content.includes('image/')) return 'image';
    if (content.includes('video/')) return 'video';
    if (content.includes('audio/')) return 'audio';
    return 'file';
  }
  return 'text';
}

export function MessageBubble({ message, isOwn, onReply, onDelete, onEdit }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeTriggered = useRef(false);
  const { lang } = useSettings();

  // ── Swipe to reply (WhatsApp style) ──────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeTriggered.current = false;
    setSwiping(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    // Ignorer si scroll vertical dominant
    if (dy > Math.abs(dx)) return;
    // Swipe droite uniquement (répondre)
    if (dx > 0 && dx < 80) {
      setSwipeX(dx);
    }
    if (dx >= 60 && !swipeTriggered.current) {
      swipeTriggered.current = true;
      // Vibration légère
      if ('vibrate' in navigator) navigator.vibrate(30);
    }
  }

  function onTouchEnd() {
    setSwiping(false);
    if (swipeTriggered.current) {
      onReply(message);
    }
    // Retour animé
    setSwipeX(0);
  }

  // Messages supprimés : ne rien afficher du tout
  if (message.isDeleted) return null;

  const effectiveType = detectType(message.content, message.type ?? 'text');
  const timeStr = (() => { try { return format(new Date(message.createdAt), 'HH:mm'); } catch { return ''; } })();

  const menuStyle: React.CSSProperties = {
    position: 'absolute', zIndex: 50,
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.18)', minWidth: 160,
    ...(isOwn ? { right: 0 } : { left: 0 }), bottom: '100%', marginBottom: 6, overflow: 'hidden',
  };
  const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px', border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)', textAlign: 'left' as const,
  };

  const TimeRow = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
      <span style={{ fontSize: 12, color: isOwn ? 'rgba(0,0,0,.45)' : 'var(--text-muted)' }}>{timeStr}</span>
      {message.isEdited && <span style={{ fontSize: 12, color: isOwn ? 'rgba(0,0,0,.4)' : 'var(--text-muted)' }}>modifié</span>}
      {isOwn && <StatusIcon status={message.status} />}
    </div>
  );

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  return (
    <div
      style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', position: 'relative' }}
      onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Icône répondre qui apparaît au swipe */}
      <div style={{
        position: 'absolute', left: isOwn ? 'auto' : 8, right: isOwn ? 8 : 'auto',
        top: '50%', transform: `translateY(-50%)`,
        opacity: Math.min(swipeX / 60, 1),
        transition: swiping ? 'none' : 'opacity 0.2s',
        pointerEvents: 'none',
        width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
          <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
        </svg>
      </div>

      <div style={{
        position: 'relative', maxWidth: '78%',
        transform: `translateX(${swipeX}px)`,
        transition: swiping ? 'none' : 'transform 0.2s ease',
      }}>

        {message.replyTo && (
          <div style={{ marginBottom: 4, padding: '6px 10px', borderRadius: 8, borderLeft: '3px solid var(--accent)', background: 'var(--bg-input)', fontSize: 12, color: 'var(--text-muted)' }}>
            <p style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 12, margin: '0 0 2px' }}>{message.replyTo.sender?.name}</p>
            <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{message.replyTo.content}</p>
          </div>
        )}

        <div
          className={isOwn ? 'bubble-out' : 'bubble-in'}
          style={{ padding: effectiveType === 'image' || effectiveType === 'video' ? '4px' : '8px 12px', overflow: 'hidden' }}
          onTouchStart={e => { longPressTimer = setTimeout(() => setShowMenu(true), 500); }}
          onTouchEnd={() => { if (longPressTimer) clearTimeout(longPressTimer); }}
          onTouchMove={() => { if (longPressTimer) clearTimeout(longPressTimer); }}
        >
          {/* IMAGE */}
          {effectiveType === 'image' && !imgError && (
            <div>
              <img src={message.content} alt="image" onError={() => setImgError(true)}
                style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 10, display: 'block', cursor: 'pointer', objectFit: 'cover' }}
                onClick={() => window.open(message.content, '_blank')} />
              <div style={{ padding: '4px 8px 2px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: isOwn ? 'rgba(0,0,0,.45)' : 'var(--text-muted)' }}>{timeStr}</span>
                {isOwn && <StatusIcon status={message.status} />}
              </div>
            </div>
          )}
          {effectiveType === 'image' && imgError && (
            <div style={{ padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>🖼️ Image non disponible</p>
              <TimeRow />
            </div>
          )}

          {/* VIDEO */}
          {effectiveType === 'video' && (
            <div>
              <video src={message.content} controls playsInline
                style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 10, display: 'block' }} />
              <div style={{ padding: '4px 8px 2px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: isOwn ? 'rgba(0,0,0,.45)' : 'var(--text-muted)' }}>{timeStr}</span>
                {isOwn && <StatusIcon status={message.status} />}
              </div>
            </div>
          )}

          {/* AUDIO */}
          {effectiveType === 'audio' && (
            <div style={{ padding: '8px 12px' }}>
              <audio src={message.content} controls style={{ width: '100%', maxWidth: 260 }} />
              <TimeRow />
            </div>
          )}

          {/* FILE */}
          {effectiveType === 'file' && (
            <div style={{ padding: '8px 12px' }}>
              <a href={message.content} download style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Fichier joint</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Appuyer pour télécharger</p>
                </div>
              </a>
              <TimeRow />
            </div>
          )}

          {/* TEXT */}
          {effectiveType === 'text' && (
            <>
              <p style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                {message.content}
              </p>
              <TimeRow />
            </>
          )}
        </div>

        {showMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowMenu(false)} />
            <div style={menuStyle}>
              <button style={menuItemStyle} onClick={() => { onReply(message); setShowMenu(false); }}>
                ↩️ {t(lang, 'chat.reply')}
              </button>
              {isOwn && (
                <>
                  <button style={menuItemStyle} onClick={() => { onEdit(message); setShowMenu(false); }}>
                    ✏️ {t(lang, 'chat.edit')}
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 12px' }} />
                  <button style={{ ...menuItemStyle, color: '#dc2626' }} onClick={() => { onDelete(message.id); setShowMenu(false); }}>
                    🗑️ {t(lang, 'chat.delete')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
