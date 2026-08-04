'use client';
import { useState } from 'react';
import { useChatStore } from '../../store/chat';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { format } from 'date-fns';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MediaLightbox } from '../ui/MediaLightbox';

interface Props {
  search?: string;
  filter?: 'all' | 'unread' | 'fav' | 'groups';
  onSelect?: (convId: string) => void;
  onDelete?: (convId: string, name: string) => void;
}

function attachmentUrl(content?: string) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') return parsed.url.trim();
  } catch {}
  return trimmed;
}

function attachmentCaption(content?: string) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.caption === 'string') {
      return parsed.caption.trim();
    }
  } catch {}
  return '';
}

function messagePreview(message: any) {
  const lang = useSettings.getState().lang;
  if (!message) return '';
  if (message.isDeleted) return t(lang, 'chat.deleted');
  const src = attachmentUrl(message.content);
  const caption = attachmentCaption(message.content);
  const type = message.type;
  const withCaption = (label: string) => caption ? `${label} · ${caption}` : label;
  if (type === 'image' || src.startsWith('data:image')) return withCaption(t(lang, 'common.photo'));
  if (type === 'video' || src.startsWith('data:video')) return withCaption(t(lang, 'common.video'));
  if (type === 'audio' || type === 'voice' || src.startsWith('data:audio')) return withCaption(t(lang, 'common.audio'));
  if (type === 'file' || type === 'document' || src.startsWith('data:') || (src.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(src))) return withCaption(t(lang, 'common.file'));
  return message.content ?? '';
}

function VerifiedSeal({ size = 18 }: { size?: number }) {
  return (
    <span title="Compte officiel certifié" style={{ width:size, height:size, display:'inline-flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display:'block', filter:'drop-shadow(0 1px 2px rgba(15,23,42,.18))' }}>
        <path
          fill="#1D9BF0"
          d="M12 1.5l2.08 1.78 2.72-.32 1.15 2.49 2.56.98-.08 2.74 1.58 2.24-1.58 2.24.08 2.74-2.56.98-1.15 2.49-2.72-.32L12 22.5l-2.08-1.78-2.72.32-1.15-2.49-2.56-.98.08-2.74L1.99 12.6l1.58-2.24-.08-2.74 2.56-.98L7.2 4.15l2.72.32L12 1.5z"
        />
        <path d="M7.35 12.25l3.05 3.05 6.25-6.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function readFavoriteConversationIds() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = JSON.parse(localStorage.getItem('oracle-favorite-conversations') ?? '[]');
    return new Set<string>(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

export function ConversationList({ search = '', filter = 'all', onSelect, onDelete }: Props) {
  const { conversations, activeConvId, setActiveConv, onlineUsers } = useChatStore();
  const { lang } = useSettings();
  const router = useRouter();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ src: string; name: string } | null>(null);
  const favoriteIds = readFavoriteConversationIds();

  const filtered = conversations.filter(c => {
    const isOfficial = Boolean((c as any).isOfficial || c.type === 'official');
    const name = isOfficial ? (c.name ?? 'Oracle Messenger') : c.type === 'group' ? c.name : c.participants?.[0]?.name;
    if (search && !name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'unread' && (c.unreadCount ?? 0) === 0) return false;
    if (filter === 'groups' && c.type !== 'group') return false;
    if (filter === 'fav' && !((c as any).isFavorite || (c as any).favorite || favoriteIds.has(c.id))) return false;
    return true;
  });

  const emptyCopy = (() => {
    if (search.trim()) return {
      title: 'Aucun résultat',
      subtitle: 'Aucune conversation ne correspond à cette recherche.',
      button: 'Effacer la recherche',
      action: undefined,
    };
    if (filter === 'unread') return {
      title: 'Aucune non lue',
      subtitle: 'Les nouveaux messages apparaîtront ici dès leur réception.',
      button: t(lang, 'chat.importContacts'),
      action: () => router.push('/contacts'),
    };
    if (filter === 'fav') return {
      title: 'Aucun favori',
      subtitle: 'Marquez vos conversations importantes comme favorites pour les retrouver ici.',
      button: t(lang, 'chat.importContacts'),
      action: () => router.push('/contacts'),
    };
    if (filter === 'groups') return {
      title: 'Aucun groupe',
      subtitle: 'Créez ou ouvrez un groupe pour le retrouver dans cette rubrique.',
      button: t(lang, 'chat.importContacts'),
      action: () => router.push('/contacts'),
    };
    return {
      title: t(lang, 'chat.noDiscussion'),
      subtitle: t(lang, 'chat.importToStart'),
      button: t(lang, 'chat.importContacts'),
      action: () => router.push('/contacts'),
    };
  })();

  if (filtered.length === 0) return (
    <div className="om-fade-in" style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', gap:12, padding:'32px 28px 104px', textAlign:'center' }}>
      <div style={{ width:88, height:88, borderRadius:28, background:'linear-gradient(145deg, var(--brand-soft), #FFFFFF)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'var(--shadow-soft)' }}>
        <svg width="42" height="42" fill="none" stroke="var(--brand)" strokeWidth="1.7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 7.5h11M6.5 11.5h7M4 4.8A2.8 2.8 0 016.8 2h10.4A2.8 2.8 0 0120 4.8v7.4a2.8 2.8 0 01-2.8 2.8H10l-5.6 4.4V4.8z"/>
        </svg>
      </div>
      <p style={{ fontSize:22, lineHeight:1.18, fontWeight:850, color:'var(--text-primary)', margin:'4px 0 0' }}>{emptyCopy.title}</p>
      <p style={{ fontSize:15, lineHeight:1.5, maxWidth:310, margin:0, color:'var(--text-secondary)', fontWeight:450 }}>
        {emptyCopy.subtitle}
      </p>
      <button onClick={emptyCopy.action ?? (() => {})}
        className="om-primary-button"
        style={{ marginTop:8, minWidth:220, display: emptyCopy.action ? 'inline-flex' : 'none' }}>
        {emptyCopy.button}
      </button>
    </div>
  );

  return (
    <>
    <ul className="om-fade-in" style={{ flex:1, overflowY:'auto', listStyle:'none', margin:0, padding:'4px 0 8px' }}>
      {filtered.map(conv => {
        const isOfficial = Boolean((conv as any).isOfficial || conv.type === 'official');
        const isVerified = Boolean((conv as any).isVerified || isOfficial);
        const other    = conv.participants?.[0];
        const isOnline = !isOfficial && other && onlineUsers.has(other.id);
        const isActive = conv.id === activeConvId;
        const name     = isOfficial ? (conv.name ?? 'Oracle Messenger') : conv.type === 'group' ? conv.name : other?.name ?? t(lang, 'common.unknown');
        const avatar   = isOfficial ? (conv.avatar ?? '/icons/icon-192.png') : conv.type === 'group' ? conv.avatar : other?.avatar;
        const lastMsg  = conv.lastMessage;
        const timeStr  = lastMsg ? format(new Date(lastMsg.createdAt), 'HH:mm') : '';

        return (
          <li key={conv.id} style={{ position:'relative' }}>
            <button
              onClick={() => { setOpenMenuId(null); setActiveConv(conv.id); onSelect?.(conv.id); }}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:12,
                padding:'11px 10px 11px 16px', border:'none',
                background: isActive ? 'var(--brand-soft)' : isOfficial ? 'rgba(16,42,42,0.035)' : 'transparent',
                cursor:'pointer', textAlign:'left',
                borderRadius:0,
              }}
            >
              {/* Avatar */}
              <div
                role={avatar ? 'button' : undefined}
                aria-label={avatar ? `${t(lang, 'chat.enlargePhoto')} ${name}` : undefined}
                title={avatar ? `${t(lang, 'chat.enlargePhoto')} ${name}` : undefined}
                onClick={(event) => {
                  if (!avatar) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setPhotoPreview({ src: avatar, name: name ?? t(lang, 'profile.title') });
                }}
                style={{ position:'relative', flexShrink:0, cursor: avatar ? 'zoom-in' : 'inherit' }}
              >
                <div style={{ width:52, height:52, borderRadius:'50%', background: isOfficial ? '#102A2A' : 'var(--brand-soft)', border: isOfficial ? '2px solid rgba(217,183,91,0.82)' : '1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', boxShadow: isOfficial ? '0 4px 14px rgba(16,42,42,0.18)' : 'none' }}>
                  {avatar
                    ? <Image src={avatar} alt={name ?? ''} width={52} height={52} style={{ objectFit:'cover' }}/>
                    : <span style={{ fontSize:20, fontWeight:800, color:'var(--brand)' }}>{(name ?? '?')[0].toUpperCase()}</span>
                  }
                </div>
                {isVerified && (
                  <span style={{ position:'absolute', bottom:-1, right:-1, width:21, height:21, borderRadius:'50%', background:'var(--bg-surface)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <VerifiedSeal size={18} />
                  </span>
                )}
                {isOnline && (
                  <span style={{ position:'absolute', bottom:2, right:2, width:12, height:12, background:'var(--online-dot)', borderRadius:'50%', border:'2px solid var(--bg-surface)' }}/>
                )}
              </div>

              {/* Infos */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontWeight: isOfficial ? 850 : 720, fontSize:16, lineHeight:1.25, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, display:'inline-flex', alignItems:'center', gap:6, minWidth:0 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                    {isVerified && (
                      <VerifiedSeal size={16} />
                    )}
                  </span>
                  <span style={{ fontSize:12, color: conv.unreadCount > 0 ? 'var(--brand)' : 'var(--text-muted)', flexShrink:0, marginLeft:8, fontWeight: conv.unreadCount > 0 ? 750 : 500 }}>{timeStr}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <p style={{ fontSize:14, lineHeight:1.35, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, margin:0, fontWeight:450 }}>
                    {lastMsg?.isDeleted
                      ? <em style={{ color:'var(--text-muted)' }}>{t(lang, 'chat.deleted')}</em>
                      : messagePreview(lastMsg)}
                  </p>
                  {isOfficial && (conv.unreadCount ?? 0) === 0 && (
                    <span style={{ marginLeft:8, flexShrink:0, borderRadius:999, background:'rgba(29,155,240,0.10)', color:'#1D4ED8', fontSize:10.5, fontWeight:900, padding:'3px 7px', letterSpacing:0 }}>
                      OFFICIEL
                    </span>
                  )}
                  {conv.unreadCount > 0 && (
                    <span style={{ marginLeft:8, flexShrink:0, minWidth:21, height:21, background:'var(--unread-bg)', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11.5, color:'var(--accent-text)', fontWeight:850, padding:'0 6px' }}>
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>

              {!isOfficial && (
              <span
                role="button"
                aria-label={`${t(lang, 'chat.options')} ${name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenMenuId(openMenuId === conv.id ? null : conv.id);
                }}
                style={{ width:34, height:34, minHeight:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', flexShrink:0 }}
              >
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
                </svg>
              </span>
              )}
            </button>
            {openMenuId === conv.id && !isOfficial && (
              <>
                <button
                  aria-label={t(lang, 'common.close')}
                  onClick={() => setOpenMenuId(null)}
                  style={{ position:'fixed', inset:0, zIndex:50, border:'none', background:'transparent', minHeight:0, cursor:'default' }}
                />
                <div style={{ position:'absolute', right:12, top:54, zIndex:60, minWidth:210, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, boxShadow:'0 14px 34px rgba(16,42,42,0.18)', overflow:'hidden' }}>
                  <button
                    onClick={() => {
                      setOpenMenuId(null);
                      onDelete?.(conv.id, name ?? 'cette conversation');
                    }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'13px 15px', border:'none', background:'transparent', color:'#B42318', cursor:'pointer', textAlign:'left', fontSize:14, fontWeight:800 }}
                  >
                    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>
                    </svg>
	                    {t(lang, 'chat.deleteDiscussion')}
                  </button>
                </div>
              </>
            )}
            {/* Séparateur */}
            <div style={{ height:1, background:'var(--border)', marginLeft:80 }}/>
          </li>
        );
      })}
    </ul>
    {photoPreview && (
      <MediaLightbox
        src={photoPreview.src}
        type="image"
        onClose={() => setPhotoPreview(null)}
      />
    )}
    </>
  );
}
