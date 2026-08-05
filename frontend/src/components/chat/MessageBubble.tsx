'use client';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import type { Message } from '../../types';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { MediaLightbox } from '../ui/MediaLightbox';
import { saveToGallery } from '../../lib/gallery';

interface Props {
  message: Message;
  isOwn: boolean;
  currentUserId: string;
  onReply: (m: Message) => void;
  onDelete: (id: string) => void;
  onEdit: (m: Message) => void;
  onForward: (m: Message) => void;
  onSelect: (m: Message) => void;
  onReact: (messageId: string, emoji?: string | null) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onMediaLoad?: () => void;
  onCallMessageClick?: (type: 'audio' | 'video') => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '😡'];
const LONG_PRESS_MS = 430;
const LONG_PRESS_CANCEL_PX = 18;
const SWIPE_REPLY_TRIGGER_PX = 66;
const SYNTHETIC_MOUSE_SUPPRESS_MS = 750;

function StatusIcon({ status, tone = 'default' }: { status: Message['status']; tone?: 'default' | 'light' }) {
  const muted = tone === 'light' ? 'rgba(255,255,255,.78)' : 'var(--text-muted)';
  if (status === 'sending')   return <span style={{ fontSize: 10, opacity: .72, color: muted }}>⏳</span>;
  if (status === 'sent')      return <span style={{ fontSize: 12, opacity: .82, color: muted }}>✓</span>;
  if (status === 'delivered') return <span style={{ fontSize: 12, opacity: .9, color: muted }}>✓✓</span>;
  if (status === 'read')      return <span style={{ fontSize: 12, color: '#53bdeb', fontWeight: 700 }}>✓✓</span>;
  return null;
}

function attachmentUrl(content: string) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') return parsed.url.trim();
  } catch {}
  return trimmed;
}

function isDataUrl(s: string) {
  return typeof s === 'string' && s.trim().startsWith('data:');
}

function looksLikeRawEncodedMedia(s: string) {
  const trimmed = typeof s === 'string' ? s.trim() : '';
  return trimmed.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed);
}

function detectType(content: string, declaredType: string): 'image' | 'video' | 'audio' | 'file' | 'text' {
  const src = attachmentUrl(content);
  if (declaredType === 'image' || declaredType === 'gif' || declaredType === 'sticker' || (isDataUrl(src) && src.startsWith('data:image'))) return 'image';
  if (declaredType === 'video' || (isDataUrl(src) && src.startsWith('data:video'))) return 'video';
  if (declaredType === 'audio' || declaredType === 'voice' || (isDataUrl(src) && src.startsWith('data:audio'))) return 'audio';
  if (declaredType === 'file' || declaredType === 'document') return 'file';
  if (isDataUrl(src)) {
    if (src.includes('image/')) return 'image';
    if (src.includes('video/')) return 'video';
    if (src.includes('audio/')) return 'audio';
    return 'file';
  }
  if (looksLikeRawEncodedMedia(content)) return 'file';
  return 'text';
}

function messagePreview(message?: Message | null) {
  const lang = useSettings.getState().lang;
  if (!message) return '';
  if (message.isDeleted) return t(lang, 'chat.deleted');
  const src = attachmentUrl(message.content);
  const effective = detectType(message.content, message.type ?? 'text');
  if (effective === 'image') return t(lang, 'common.photo');
  if (effective === 'video') return t(lang, 'common.video');
  if (effective === 'audio') return t(lang, 'common.audio');
  if (effective === 'file') return t(lang, 'common.file');
  return src.length > 90 ? `${src.slice(0, 90)}…` : src;
}

function parseFilePayload(content: string) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
      return {
        url: parsed.url as string,
        name: typeof parsed.name === 'string' ? parsed.name : t(useSettings.getState().lang, 'chat.attachedFile'),
        size: typeof parsed.size === 'number' ? parsed.size : undefined,
        mime: typeof parsed.mime === 'string' ? parsed.mime : '',
        caption: typeof parsed.caption === 'string' ? parsed.caption.trim() : '',
        thumbnail: typeof parsed.thumbnail === 'string' ? parsed.thumbnail : '',
        duration: typeof parsed.duration === 'number' ? parsed.duration : undefined,
        width: typeof parsed.width === 'number' ? parsed.width : undefined,
        height: typeof parsed.height === 'number' ? parsed.height : undefined,
        waveform: Array.isArray(parsed.waveform) ? parsed.waveform.filter((value: unknown): value is number => typeof value === 'number') : undefined,
      };
    }
  } catch {}
  return { url: attachmentUrl(content), name: t(useSettings.getState().lang, 'chat.attachedFile'), size: undefined as number | undefined, mime: '', caption: '', thumbnail: '', duration: undefined as number | undefined, width: undefined as number | undefined, height: undefined as number | undefined, waveform: undefined as number[] | undefined };
}

function attachmentCaption(content: string) {
  return parseFilePayload(content).caption;
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatBytes(size?: number) {
  if (!size) return '';
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileIcon(mime: string, name: string) {
  const lower = `${mime} ${name}`.toLowerCase();
  if (lower.includes('pdf')) return 'PDF';
  if (lower.includes('word') || lower.includes('.doc')) return 'DOC';
  if (lower.includes('excel') || lower.includes('sheet') || lower.includes('.xls')) return 'XLS';
  if (lower.includes('zip') || lower.includes('rar')) return 'ZIP';
  return 'FILE';
}

function linkifyPhones(text: string, keyPrefix: string) {
  const parts = text.split(/((?:\+?\d[\d\s().-]{6,}\d))/g);
  return parts.map((part, index) => {
    const digits = part.replace(/\D+/g, '');
    if (digits.length < 8 || !/^\+?[\d\s().-]+$/.test(part)) return part;
    const href = `tel:${part.trim().startsWith('+') ? '+' : ''}${digits}`;
    return (
      <a
        key={`${keyPrefix}-phone-${index}`}
        href={href}
        onClick={(event) => event.stopPropagation()}
        style={{ color: '#0B63CE', textDecoration: 'underline', fontWeight: 600, overflowWrap: 'anywhere' }}
      >
        {part}
      </a>
    );
  });
}

function linkifyText(text: string) {
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s<]+)/gi);
  return parts.flatMap((part, index) => {
    if (!/^(https?:\/\/|www\.)/i.test(part)) return linkifyPhones(part, `text-${index}`);
    const href = part.startsWith('www.') ? `https://${part}` : part;
    return (
      <a
        key={`${part}-${index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        style={{ color: '#0B63CE', textDecoration: 'underline', fontWeight: 600, overflowWrap: 'anywhere' }}
      >
        {part}
      </a>
    );
  });
}

function parseCallTraceMessage(content: string): { type: 'audio' | 'video'; label: string } | null {
  const value = String(content ?? '').trim();
  const withoutIcon = value.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (!/^Appel\s+(audio|vidéo|video)\s+/i.test(withoutIcon)) return null;
  const type = /Appel\s+vid[ée]o/i.test(value) ? 'video' : 'audio';
  const label = withoutIcon;
  return { type, label };
}

function AudioPlayer({ src, timeRow, waveform, declaredDuration }: { src: string; timeRow: React.ReactNode; waveform?: number[]; declaredDuration?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const normalizedSrc = src.replace(/^data:(audio\/[^;]+);codecs=[^;]+;base64,/i, 'data:$1;base64,');
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(declaredDuration ?? 0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== normalizedSrc) audio.src = normalizedSrc;
    audio.defaultPlaybackRate = 1;
    audio.playbackRate = 1;
    const onLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : declaredDuration ?? 0);
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onEnded = () => setPlaying(false);
    const onError = () => setError(true);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [normalizedSrc, declaredDuration]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  function fmt(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || error) return;
    try {
      if (audio.paused) {
        await audio.play();
        audio.playbackRate = speed;
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
      }
    } catch {
      setError(true);
    }
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const bars = waveform?.length ? waveform.slice(0, 48) : Array.from({ length: 36 }, (_, index) => 24 + ((index * 17) % 64));
  const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;

  return (
    <div style={{ padding: '7px 9px', minWidth: 244, maxWidth: 340 }}>
      <audio ref={audioRef} src={normalizedSrc} preload="metadata" />
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <button onClick={toggle} disabled={error}
          style={{ width:40, height:40, borderRadius:'50%', border:'none', background:error ? 'var(--bg-app)' : 'transparent', color:error ? 'var(--text-muted)' : '#5F6B70', cursor:error ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {playing ? (
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ height:30, display:'flex', alignItems:'center', gap:2, marginBottom:4, overflow:'hidden' }}>
            {bars.map((height, index) => {
              const active = (index / Math.max(1, bars.length - 1)) * 100 <= pct;
              return (
                <span
                  key={index}
                  style={{
                    width:3,
                    height:`${Math.max(5, Math.min(26, Math.round((height / 100) * 26)))}px`,
                    borderRadius:999,
                    background: active ? '#5F6B70' : 'rgba(16,42,42,0.18)',
                    flex:'0 0 3px',
                    transition:'background .12s ease',
                  }}
                />
              );
            })}
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{fmt(current)}</span>
            <button
              type="button"
              onClick={() => setSpeed(nextSpeed)}
              style={{ border:'none', borderRadius:999, background:'rgba(16,42,42,0.08)', color:'#5F6B70', fontSize:11, lineHeight:1, fontWeight:900, padding:'4px 7px', cursor:'pointer' }}
            >
              {speed}x
            </button>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{duration ? fmt(duration) : t(useSettings.getState().lang, 'chat.voiceMessage')}</span>
          </div>
        </div>
      </div>
      {error && (
        <div style={{ marginTop:8, padding:'8px 10px', borderRadius:10, background:'rgba(220,38,38,0.08)', color:'#991b1b', fontSize:12, lineHeight:1.4 }}>
          {t(useSettings.getState().lang, 'chat.mediaUnavailable')} <a href={normalizedSrc} download="message-vocal" style={{ color:'#991b1b', fontWeight:800 }}>{t(useSettings.getState().lang, 'common.audio')}</a>
        </div>
      )}
      {timeRow}
    </div>
  );
}

export function MessageBubble({ message, isOwn, currentUserId, onReply, onDelete, onEdit, onForward, onSelect, onReact, selectionMode = false, selected = false, onMediaLoad, onCallMessageClick }: Props) {
  const [showMenu, setShowMenu]       = useState(false);
  const [imgError, setImgError]       = useState(false);
  const [lightbox, setLightbox]       = useState(false);
  const [fileViewer, setFileViewer]   = useState<ReturnType<typeof parseFilePayload> | null>(null);
  const [swipeX, setSwipeX]           = useState(0);
  const [swiping, setSwiping]         = useState(false);
  const [copied, setCopied]           = useState(false);
  const [menuPos, setMenuPos]         = useState<{ top: number; left: number; width: number } | null>(null);
  const longPressTimer                = useRef<NodeJS.Timeout | null>(null);
  const longPressFired                = useRef(false);
  const suppressNextClick             = useRef(false);
  const lastTapRef                    = useRef(0);
  const wrapRef                       = useRef<HTMLDivElement | null>(null);
  const touchActiveRef                = useRef(false);
  const ignoreMouseUntilRef           = useRef(0);

  const effectiveTypeEarly = detectType(message.content, message.type ?? 'text');
  const mediaSrcEarly = attachmentUrl(message.content);

  // Auto-save silencieux des médias reçus dans la galerie.
  // Doit rester dans un effet React: écrire dans localStorage pendant le rendu
  // peut provoquer des ralentissements et des écritures répétées.
  useEffect(() => {
    if (isOwn || message.isDeleted || !mediaSrcEarly) return;
    if (effectiveTypeEarly === 'image' || effectiveTypeEarly === 'video' || effectiveTypeEarly === 'audio' || effectiveTypeEarly === 'file') {
      let name: string | undefined;
      let mime: string | undefined;
      let size: number | undefined;
      if (effectiveTypeEarly === 'file') {
        try {
          const parsed = JSON.parse(message.content);
          if (parsed && typeof parsed === 'object') {
            name = typeof parsed.name === 'string' ? parsed.name : undefined;
            mime = typeof parsed.mime === 'string' ? parsed.mime : undefined;
            size = typeof parsed.size === 'number' ? parsed.size : undefined;
          }
        } catch {}
      }
      saveToGallery(mediaSrcEarly, effectiveTypeEarly, name, { mime, size, source: 'conversation' });
    }
  }, [isOwn, message.id, message.isDeleted, mediaSrcEarly, effectiveTypeEarly]);

  // Double-tap → répondre
  function handleTap() {
    if (selectionMode) {
      onSelect(message);
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onReply(message);
    }
    lastTapRef.current = now;
  }

  // Long-press → menu de réactions rapide, comme les apps de messagerie modernes.
  function openMenu() {
    longPressFired.current = true;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(318, Math.max(250, window.innerWidth - 18));
      const preferredLeft = isOwn ? rect.right - width : rect.left;
      const left = Math.max(9, Math.min(preferredLeft, window.innerWidth - width - 9));
      const top = Math.max(8, rect.top - 72);
      setMenuPos({ top, left, width });
    }
    setShowMenu(true);
    if ('vibrate' in navigator) navigator.vibrate(30);
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePressStart() {
    if (selectionMode || message.isDeleted) return;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressFired.current = false;
    longPressTimer.current = setTimeout(openMenu, LONG_PRESS_MS);
  }

  function handlePressEnd() {
    clearLongPress();
  }

  // Copier le texte
  function copyText() {
    if (message.content && effectiveTypeEarly === 'text') {
      navigator.clipboard?.writeText(message.content).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {});
    }
    setShowMenu(false);
  }

  function addFavorite() {
    try {
      const key = 'oracle-favorite-message-ids';
      const current = JSON.parse(localStorage.getItem(key) || '[]');
      const ids = Array.isArray(current) ? current.filter((id): id is string => typeof id === 'string') : [];
      if (!ids.includes(message.id)) ids.unshift(message.id);
      localStorage.setItem(key, JSON.stringify(ids.slice(0, 500)));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
    setShowMenu(false);
  }

  async function shareMessage() {
    const text = effectiveTypeEarly === 'text' ? message.content : mediaSrcEarly;
    try {
      if (navigator.share) await navigator.share({ title: 'Oracle Messenger', text });
      else if (text) await navigator.clipboard?.writeText(text);
    } catch {}
    setShowMenu(false);
  }

  function showInfo() {
    const file = parseFilePayload(message.content);
    const lines = [
      `Type : ${effectiveType}`,
      `Heure : ${timeStr}`,
      `Statut : ${message.status ?? '-'}`,
      file.name && effectiveType !== 'text' ? `Fichier : ${file.name}` : '',
      file.size ? `Taille : ${formatBytes(file.size)}` : '',
    ].filter(Boolean);
    window.alert(lines.join('\n'));
    setShowMenu(false);
  }
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeTriggered = useRef(false);
  const { lang } = useSettings();

  // ── Swipe to reply (WhatsApp style) ──────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    touchActiveRef.current = true;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeTriggered.current = false;
    setSwiping(true);
    handlePressStart();
  }

  function onTouchMove(e: React.TouchEvent) {
    if (selectionMode) {
      handlePressEnd();
      return;
    }
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > LONG_PRESS_CANCEL_PX || dy > LONG_PRESS_CANCEL_PX) handlePressEnd();
    // Ignorer si scroll vertical dominant
    if (dy > Math.abs(dx)) return;
    // Swipe droite uniquement (répondre)
    if (dx > 0 && dx < 80) {
      setSwipeX(dx);
    }
    if (dx >= SWIPE_REPLY_TRIGGER_PX && !swipeTriggered.current) {
      swipeTriggered.current = true;
      // Vibration légère
      if ('vibrate' in navigator) navigator.vibrate(30);
    }
  }

  function onTouchEnd() {
    touchActiveRef.current = false;
    ignoreMouseUntilRef.current = Date.now() + SYNTHETIC_MOUSE_SUPPRESS_MS;
    handlePressEnd();
    if (longPressFired.current) {
      longPressFired.current = false;
      suppressNextClick.current = true;
      setTimeout(() => { suppressNextClick.current = false; }, 320);
      setSwiping(false);
      setSwipeX(0);
      return;
    }
    if (selectionMode) {
      setSwiping(false);
      setSwipeX(0);
      return;
    }
    setSwiping(false);
    if (swipeTriggered.current) {
      onReply(message);
    }
    // Retour animé
    setSwipeX(0);
  }

  function onTouchCancel() {
    touchActiveRef.current = false;
    ignoreMouseUntilRef.current = Date.now() + SYNTHETIC_MOUSE_SUPPRESS_MS;
    handlePressEnd();
    setSwiping(false);
    setSwipeX(0);
  }

  function onMousePressStart(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (touchActiveRef.current || Date.now() < ignoreMouseUntilRef.current) return;
    handlePressStart();
  }

  function onPointerPressEnd() {
    handlePressEnd();
    if (longPressFired.current) {
      longPressFired.current = false;
      suppressNextClick.current = true;
      setTimeout(() => { suppressNextClick.current = false; }, 320);
    }
  }

  function handleRowClick() {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    handleTap();
  }

  // Messages supprimés : ne rien afficher du tout
  if (message.isDeleted) return null;

  const effectiveType = detectType(message.content, message.type ?? 'text');
  const callTrace = effectiveType === 'text' ? parseCallTraceMessage(message.content) : null;
  const mediaSrc = attachmentUrl(message.content);
  const mediaMeta = parseFilePayload(message.content);
  const mediaPreviewSrc = mediaMeta.thumbnail || mediaSrc;
  const mediaAspectRatio = mediaMeta.width && mediaMeta.height
    ? Math.max(0.62, Math.min(1.78, mediaMeta.width / mediaMeta.height))
    : undefined;
  const caption = attachmentCaption(message.content);
  const missingLocalMedia = effectiveType !== 'text' && !mediaSrc;
  const timeStr = (() => { try { return format(new Date(message.createdAt), 'HH:mm'); } catch { return ''; } })();
  const myReaction = message.reactions?.find(reaction => reaction.userId === currentUserId)?.emoji ?? '';
  const reactionGroups = (message.reactions ?? []).reduce<Array<{ emoji: string; count: number; mine: boolean }>>((acc, reaction) => {
    const existing = acc.find(item => item.emoji === reaction.emoji);
    if (existing) {
      existing.count += 1;
      if (reaction.userId === currentUserId) existing.mine = true;
    } else {
      acc.push({ emoji: reaction.emoji, count: 1, mine: reaction.userId === currentUserId });
    }
    return acc;
  }, []);

  const menuStyle: React.CSSProperties = {
    position: 'fixed', zIndex: 2147483001,
    background: '#FFFFFF', border: '1px solid rgba(16,42,42,0.10)',
    borderRadius: 18, boxShadow: '0 22px 70px rgba(15,23,42,.28)', minWidth: 160,
    width: menuPos?.width ?? 230,
    left: menuPos?.left ?? 8,
    top: menuPos?.top ?? 80,
    overflowX: 'hidden',
    overflowY: 'auto',
    maxHeight: 'min(76dvh, 620px)',
    overscrollBehavior: 'contain',
    isolation: 'isolate',
  };
  const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px', border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)', textAlign: 'left' as const,
  };

  const TimeRow = () => (
    <div className="om-message-time-row" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 1, minHeight: 13 }}>
      <span style={{ fontSize: 10.4, color: isOwn ? 'rgba(0,0,0,.46)' : 'var(--text-muted)', lineHeight: 1 }}>{timeStr}</span>
      {message.isEdited && <span style={{ fontSize: 12, color: isOwn ? 'rgba(0,0,0,.4)' : 'var(--text-muted)' }}>modifié</span>}
      {isOwn && <StatusIcon status={message.status} />}
    </div>
  );

  const MediaTimeOverlay = () => (
    <div className="om-media-time-overlay">
      {effectiveType === 'video' && mediaMeta.duration && <span>{formatDuration(mediaMeta.duration)}</span>}
      <span>{timeStr}</span>
      {isOwn && <StatusIcon status={message.status} tone="light" />}
    </div>
  );

  function openFileViewer(file = mediaMeta) {
    if (!file.url) return;
    setFileViewer(file);
  }

  function handleCallTraceClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (!callTrace || selectionMode || !onCallMessageClick) return;
    onCallMessageClick(callTrace.type);
  }

  const CaptionBlock = () => caption ? (
    <div style={{ padding: effectiveType === 'image' || effectiveType === 'video' ? '7px 9px 4px' : '6px 0 0' }}>
      <p className="om-message-text" style={{ fontSize: 14.5, lineHeight: 1.34, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', margin: 0, letterSpacing: 0 }}>
        {linkifyText(caption)}
      </p>
      <TimeRow />
    </div>
  ) : null;

  // longPressTimer est géré via useRef ci-dessus

  return (
    <div
      className={`om-message-row ${isOwn ? 'om-message-row-own' : 'om-message-row-in'} ${selectionMode ? 'om-message-row-selecting' : ''} ${selected ? 'om-message-row-selected' : ''}`}
      style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', position: 'relative', padding: '1.5px 0', background: 'transparent', borderRadius: 0 }}
      ref={wrapRef}
      onContextMenu={e => {
        e.preventDefault();
        if (touchActiveRef.current || Date.now() < ignoreMouseUntilRef.current) return;
        openMenu();
      }}
      onClick={handleRowClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onMouseDown={onMousePressStart}
      onMouseUp={onPointerPressEnd}
      onMouseLeave={handlePressEnd}
    >
      {selectionMode && (
        <button
          type="button"
          aria-label={selected ? t(lang, 'chat.messageSelected') : t(lang, 'chat.selectThisMessage')}
          onClick={e => { e.stopPropagation(); onSelect(message); }}
          style={{
            position:'absolute',
            left:10,
            top:'50%',
            transform:'translateY(-50%)',
            width:22,
            height:22,
            borderRadius:'50%',
            border:selected ? '2px solid #fff' : '2px solid rgba(16,42,42,0.28)',
            background:selected ? 'var(--header-bg)' : 'var(--bg-surface)',
            color:selected ? '#fff' : 'transparent',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            zIndex:2,
            cursor:'pointer',
            boxShadow:'0 2px 8px rgba(16,42,42,0.22)',
          }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
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
        position: 'relative',
        maxWidth: effectiveType === 'image' || effectiveType === 'video' ? 'min(72vw, 350px)' : 'min(73vw, 520px)',
        minWidth: effectiveType === 'image' || effectiveType === 'video' ? 'min(54vw, 232px)' : effectiveType === 'text' ? 48 : undefined,
        transform: swipeX ? `translateX(${swipeX}px)` : undefined,
        transition: swiping ? 'none' : 'transform 0.2s ease',
      }}>

        {message.replyTo && (
          <div style={{ marginBottom: 4, padding: '6px 10px', borderRadius: 8, borderLeft: '3px solid var(--accent)', background: 'var(--bg-input)', fontSize: 12, color: 'var(--text-muted)' }}>
            <p style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 12, margin: '0 0 2px' }}>{message.replyTo.sender?.name}</p>
            <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{messagePreview(message.replyTo)}</p>
          </div>
        )}

        <div
          className={`om-message-bubble ${isOwn ? 'bubble-out' : 'bubble-in'}`}
          style={{ padding: effectiveType === 'image' || effectiveType === 'video' ? 2 : '7px 10px 4px 10px', overflow: 'hidden' }}
          onDoubleClick={() => onReply(message)}
        >
          {missingLocalMedia && (
            <div style={{ padding: '10px 12px', minWidth: 220 }}>
              <p style={{ fontSize: 13, lineHeight: 1.35, color: 'var(--text-muted)', margin: 0 }}>
                {t(lang, 'chat.mediaUnavailable')}
              </p>
              <TimeRow />
            </div>
          )}

          {/* IMAGE */}
          {effectiveType === 'image' && !missingLocalMedia && !imgError && (
            <div className="om-media-card" style={mediaAspectRatio ? { aspectRatio: `${mediaAspectRatio}` } : undefined}>
              <img src={mediaPreviewSrc} alt="image" onError={() => setImgError(true)}
                className="om-media-content"
                style={{ cursor: 'zoom-in', objectFit: mediaAspectRatio && mediaAspectRatio > 1.15 ? 'contain' : 'cover' }}
                onLoad={onMediaLoad}
                onClick={event => {
                  event.stopPropagation();
                  if (selectionMode) {
                    event.preventDefault();
                    return;
                  }
                  setLightbox(true);
                }} />
              <MediaTimeOverlay />
            </div>
          )}
          {effectiveType === 'image' && !missingLocalMedia && !imgError && <CaptionBlock />}
          {effectiveType === 'image' && !missingLocalMedia && imgError && (
            <div style={{ padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>🖼️ {t(lang, 'chat.imageUnavailable')}</p>
              <TimeRow />
            </div>
          )}

          {/* VIDEO */}
          {effectiveType === 'video' && !missingLocalMedia && (
            <div className="om-media-card" style={mediaAspectRatio ? { aspectRatio: `${mediaAspectRatio}` } : undefined}>
              <div style={{ position: 'relative', cursor: 'pointer', width: '100%', height: '100%' }} onClick={event => {
                event.stopPropagation();
                if (selectionMode) {
                  event.preventDefault();
                  return;
                }
                setLightbox(true);
              }}>
                <video src={mediaSrc} playsInline muted poster={mediaMeta.thumbnail || undefined} onLoadedMetadata={onMediaLoad}
                  className="om-media-content"
                  style={{ pointerEvents: 'none' }} />
                {/* Bouton play overlay */}
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10,
                }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.42)', backdropFilter:'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" fill="white" viewBox="0 0 24 24" style={{ marginLeft:2 }}><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
              </div>
              <MediaTimeOverlay />
            </div>
          )}
          {effectiveType === 'video' && !missingLocalMedia && <CaptionBlock />}

          {/* AUDIO */}
          {effectiveType === 'audio' && !missingLocalMedia && (
            <div>
              <AudioPlayer src={mediaSrc} timeRow={caption ? null : <TimeRow />} waveform={mediaMeta.waveform} declaredDuration={mediaMeta.duration} />
              <CaptionBlock />
            </div>
          )}

          {/* FILE */}
          {effectiveType === 'file' && !missingLocalMedia && (
            <div style={{ padding: '8px 12px' }}>
              {(() => {
                const file = parseFilePayload(message.content);
                return (
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  if (selectionMode) return;
                  openFileViewer(file);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', minWidth:220, width:'100%', border:'none', background:'transparent', padding:0, cursor:'pointer', textAlign:'left' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,42,42,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color:'var(--header-bg)', fontSize:10, fontWeight:900 }}>
                  {fileIcon(file.mime, file.name)}
                </div>
                <div style={{ minWidth: 0, flex:1 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, margin: 0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:210 }}>{file.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    {[file.mime || t(lang, 'common.document'), formatBytes(file.size)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span aria-hidden="true" style={{ width:28, height:28, borderRadius:'50%', background:'rgba(16,42,42,0.06)', color:'var(--text-secondary)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/></svg>
                </span>
              </button>
                );
              })()}
              {caption ? <CaptionBlock /> : <TimeRow />}
            </div>
          )}

          {/* TEXT */}
          {effectiveType === 'text' && callTrace && (
            <>
              <button
                type="button"
                onClick={handleCallTraceClick}
                title={callTrace.type === 'video' ? 'Relancer l’appel vidéo' : 'Relancer l’appel audio'}
                style={{
                  width: '100%',
                  border: 'none',
                  background: onCallMessageClick && !selectionMode ? (isOwn ? 'rgba(16,42,42,.045)' : 'rgba(16,42,42,.035)') : 'transparent',
                  color: 'inherit',
                  padding: onCallMessageClick && !selectionMode ? '8px 10px' : 0,
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  minWidth: 220,
                  textAlign: 'left',
                  cursor: onCallMessageClick && !selectionMode ? 'pointer' : 'default',
                  borderRadius: 14,
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                  {message.content.trim().startsWith('📵') ? '📵' : callTrace.type === 'video' ? '📹' : '📞'}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 16.2, lineHeight: 1.2, fontWeight: 850, letterSpacing: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {callTrace.label}
                  </span>
                  {onCallMessageClick && !selectionMode && (
                    <span style={{ display: 'block', marginTop: 3, fontSize: 12, lineHeight: 1.15, color: isOwn ? 'rgba(0,0,0,.54)' : 'var(--text-muted)', fontWeight: 820 }}>
                      Appuyer pour rappeler
                    </span>
                  )}
                </span>
                {onCallMessageClick && !selectionMode && (
                  <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', background: isOwn ? 'rgba(16,42,42,0.08)' : 'rgba(16,42,42,0.07)', color: 'var(--header-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
                      {callTrace.type === 'video'
                        ? <path d="M3 7a3 3 0 013-3h8a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7zm15 3.2l3.2-2A.5.5 0 0122 8.6v6.8a.5.5 0 01-.8.4L18 13.8v-3.6z"/>
                        : <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>}
                    </svg>
                  </span>
                )}
              </button>
              <TimeRow />
            </>
          )}

          {effectiveType === 'text' && !callTrace && (
            <>
              <p className="om-message-text" style={{ fontSize: 14.8, lineHeight: 1.36, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', margin: 0, letterSpacing: 0 }}>
                {linkifyText(message.content)}
              </p>
              <TimeRow />
            </>
          )}
        </div>

        {reactionGroups.length > 0 && (
          <div
            className="om-message-reactions"
            style={{
              display:'flex',
              justifyContent:isOwn ? 'flex-end' : 'flex-start',
              marginTop:-2,
              padding:isOwn ? '0 8px 0 0' : '0 0 0 8px',
              gap:4,
              flexWrap:'wrap',
            }}
          >
            {reactionGroups.map(group => (
              <button
                key={group.emoji}
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onReact(message.id, group.mine ? null : group.emoji);
                }}
                aria-label={`Réaction ${group.emoji}`}
                style={{
                  border:'1px solid rgba(16,42,42,0.10)',
                  background:group.mine ? '#EAF4F1' : 'var(--bg-surface)',
                  color:'var(--text-primary)',
                  borderRadius:999,
                  minHeight:24,
                  padding:'2px 7px',
                  display:'inline-flex',
                  alignItems:'center',
                  gap:4,
                  fontSize:13,
                  lineHeight:1,
                  cursor:'pointer',
                  boxShadow:'0 2px 8px rgba(16,42,42,0.08)',
                }}
              >
                <span>{group.emoji}</span>
                {group.count > 1 && <span style={{ fontSize:11, fontWeight:800, color:'var(--text-secondary)' }}>{group.count}</span>}
              </button>
            ))}
          </div>
        )}

      {showMenu && typeof document !== 'undefined' && createPortal(
          <>
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2147483000,
                background: 'rgba(15,23,42,0.10)',
                backdropFilter: 'blur(1.5px)',
              }}
              onClick={() => setShowMenu(false)}
            />
            <div style={menuStyle}>
              <div style={{
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
                gap:2,
                padding:'8px 8px 7px',
                background:'var(--bg-surface)',
                borderBottom:'1px solid var(--border)',
              }}>
                {REACTION_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(message.id, myReaction === emoji ? null : emoji);
                      setShowMenu(false);
                    }}
                    aria-label={`Réagir ${emoji}`}
                    style={{
                      width:36,
                      height:36,
                      minHeight:36,
                      borderRadius:'50%',
                      border:myReaction === emoji ? '2px solid var(--brand)' : '1px solid transparent',
                      background:myReaction === emoji ? 'var(--brand-soft)' : 'transparent',
                      cursor:'pointer',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      fontSize:22,
                      transform:myReaction === emoji ? 'scale(1.06)' : 'scale(1)',
                      transition:'transform .12s ease, background .12s ease, border-color .12s ease',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button style={menuItemStyle} onClick={() => { onSelect(message); setShowMenu(false); }}>
                ☑️ {t(lang, 'chat.selectMessage')}
              </button>
              <button style={menuItemStyle} onClick={() => { onReply(message); setShowMenu(false); }}>
                ↩️ {t(lang, 'chat.reply')}
              </button>
              <button style={menuItemStyle} onClick={() => { onForward(message); setShowMenu(false); }}>
                ↪️ {t(lang, 'chat.forward')}
              </button>
              <button style={menuItemStyle} onClick={shareMessage}>
                📤 Partager
              </button>
              {/* Copier le texte */}
              {effectiveType === 'text' && (
                <button style={menuItemStyle} onClick={copyText}>
                  {copied ? `✅ ${t(lang, 'common.copied')}` : `📋 ${t(lang, 'common.copy')}`}
                </button>
              )}
              {/* Ouvrir en plein écran pour image/vidéo */}
              {(effectiveType === 'image' || effectiveType === 'video') && (
                <button style={menuItemStyle} onClick={() => { setLightbox(true); setShowMenu(false); }}>
                  🔍 {t(lang, 'chat.viewFullscreen')}
                </button>
              )}
              {effectiveType === 'file' && (
                <button style={menuItemStyle} onClick={() => { openFileViewer(); setShowMenu(false); }}>
                  🔍 Ouvrir le document
                </button>
              )}
              <button style={menuItemStyle} onClick={addFavorite}>
                ⭐ Ajouter aux favoris
              </button>
              <button style={menuItemStyle} onClick={showInfo}>
                ℹ️ Informations du message
              </button>
              {isOwn && (
                <>
                  {effectiveType === 'text' && (
                    <button style={menuItemStyle} onClick={() => { onEdit(message); setShowMenu(false); }}>
                      ✏️ {t(lang, 'chat.edit')}
                    </button>
                  )}
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 12px' }} />
                  <button style={{ ...menuItemStyle, color: '#dc2626' }} onClick={() => { onDelete(message.id); setShowMenu(false); }}>
                    🗑️ Supprimer pour tous
                  </button>
                </>
              )}
              {!isOwn && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 12px' }} />
                  <button style={{ ...menuItemStyle, color: '#dc2626' }} onClick={() => { onDelete(message.id); setShowMenu(false); }}>
                    🗑️ Supprimer pour moi
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        )}
      </div>

      {/* Lightbox plein écran */}
      {lightbox && (effectiveType === 'image' || effectiveType === 'video') && typeof document !== 'undefined' && createPortal(
        <MediaLightbox
          src={mediaSrc}
          type={effectiveType}
          title={caption || (effectiveType === 'video' ? t(lang, 'common.video') : t(lang, 'common.photo'))}
          subtitle={timeStr}
          onClose={() => setLightbox(false)}
          onSave={() => {
            saveToGallery(mediaSrc, effectiveType as 'image' | 'video');
          }}
        />,
        document.body
      )}
      {fileViewer && typeof document !== 'undefined' && createPortal(
        <MediaLightbox
          src={fileViewer.url}
          type="document"
          title={fileViewer.name}
          subtitle={[fileViewer.mime || t(lang, 'common.document'), formatBytes(fileViewer.size)].filter(Boolean).join(' · ')}
          fileName={fileViewer.name}
          mime={fileViewer.mime}
          onClose={() => setFileViewer(null)}
        />,
        document.body
      )}
    </div>
  );
}
