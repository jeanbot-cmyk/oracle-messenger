'use client';
import { useChatStore } from '../../store/chat';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS, es, ar, zhCN, ptBR, ru, hi, de, ja, type Locale } from 'date-fns/locale';
import Image from 'next/image';

const LOCALES: Record<string, Locale> = { fr, en:enUS, es, ar, zh:zhCN, pt:ptBR, ru, hi, de, ja };

export function ConversationList({ search = '' }: { search?: string }) {
  const { conversations, activeConvId, setActiveConv, onlineUsers } = useChatStore();
  const { lang } = useSettings();
  const locale = LOCALES[lang] ?? fr;

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const name = c.type === 'group' ? c.name : c.participants?.[0]?.name;
    return name?.toLowerCase().includes(search.toLowerCase());
  });

  if (filtered.length === 0) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', gap:12, padding:24, textAlign:'center' }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--bg-input)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <p style={{ fontSize:14, whiteSpace:'pre-line' }}>{t(lang,'chat.empty')}</p>
    </div>
  );

  return (
    <ul style={{ flex:1, overflowY:'auto', listStyle:'none', margin:0, padding:0 }}>
      {filtered.map(conv => {
        const other = conv.participants?.[0];
        const isOnline = other && onlineUsers.has(other.id);
        const isActive = conv.id === activeConvId;
        const name = conv.type === 'group' ? conv.name : other?.name ?? 'Inconnu';
        const avatar = conv.type === 'group' ? conv.avatar : other?.avatar;
        const lastMsg = conv.lastMessage;

        return (
          <li key={conv.id}>
            <button onClick={() => setActiveConv(conv.id)} style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'10px 16px', border:'none', background: isActive ? 'var(--bg-input)' : 'transparent', cursor:'pointer', textAlign:'left' }}>
              {/* Avatar */}
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{ width:50, height:50, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {avatar ? <Image src={avatar} alt={name??''} width={50} height={50} style={{ objectFit:'cover' }} /> : (
                    <span style={{ fontSize:20, fontWeight:600, color:'#fff' }}>{(name??'?')[0].toUpperCase()}</span>
                  )}
                </div>
                {isOnline && <span style={{ position:'absolute', bottom:1, right:1, width:12, height:12, background:'var(--online-dot)', borderRadius:'50%', border:'2px solid var(--bg-surface)' }} />}
              </div>
              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontWeight:600, fontSize:15, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                  {lastMsg && <span style={{ fontSize:11, color: conv.unreadCount > 0 ? 'var(--accent)' : 'var(--text-muted)', flexShrink:0, marginLeft:8 }}>
                    {formatDistanceToNow(new Date(lastMsg.createdAt), { locale, addSuffix:false })}
                  </span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:2 }}>
                  <p style={{ fontSize:13, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                    {lastMsg?.isDeleted ? <em>{t(lang,'chat.deleted')}</em> : (lastMsg?.content ?? t(lang,'chat.empty').split('\n')[0])}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span style={{ marginLeft:8, flexShrink:0, minWidth:20, height:20, background:'var(--unread-bg)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#fff', fontWeight:700, padding:'0 5px' }}>
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
