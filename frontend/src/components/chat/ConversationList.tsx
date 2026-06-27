'use client';
import { useChatStore } from '../../store/chat';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { format } from 'date-fns';
import Image from 'next/image';

interface Props {
  search?: string;
  filter?: 'all' | 'unread' | 'fav' | 'groups';
  onSelect?: () => void;
}

export function ConversationList({ search = '', filter = 'all', onSelect }: Props) {
  const { conversations, activeConvId, setActiveConv, onlineUsers } = useChatStore();
  const { lang } = useSettings();

  const filtered = conversations.filter(c => {
    const name = c.type === 'group' ? c.name : c.participants?.[0]?.name;
    if (search && !name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'unread' && c.unreadCount === 0) return false;
    if (filter === 'groups' && c.type !== 'group') return false;
    return true;
  });

  if (filtered.length === 0) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#8696a0', gap:12, padding:32, textAlign:'center' }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:'#f0f2f5', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="32" height="32" fill="none" stroke="#8696a0" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
      </div>
      <p style={{ fontSize:14 }}>{t(lang, 'chat.empty')}</p>
    </div>
  );

  return (
    <ul style={{ flex:1, overflowY:'auto', listStyle:'none', margin:0, padding:0 }}>
      {filtered.map(conv => {
        const other    = conv.participants?.[0];
        const isOnline = other && onlineUsers.has(other.id);
        const isActive = conv.id === activeConvId;
        const name     = conv.type === 'group' ? conv.name : other?.name ?? 'Inconnu';
        const avatar   = conv.type === 'group' ? conv.avatar : other?.avatar;
        const lastMsg  = conv.lastMessage;
        const timeStr  = lastMsg ? format(new Date(lastMsg.createdAt), 'HH:mm') : '';

        return (
          <li key={conv.id}>
            <button
              onClick={() => { setActiveConv(conv.id); onSelect?.(); }}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:12,
                padding:'10px 16px', border:'none',
                background: isActive ? '#f0f2f5' : 'transparent',
                cursor:'pointer', textAlign:'left',
              }}
            >
              {/* Avatar */}
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{ width:52, height:52, borderRadius:'50%', background:'#00a884', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {avatar
                    ? <Image src={avatar} alt={name ?? ''} width={52} height={52} style={{ objectFit:'cover' }}/>
                    : <span style={{ fontSize:22, fontWeight:700, color:'#fff' }}>{(name ?? '?')[0].toUpperCase()}</span>
                  }
                </div>
                {isOnline && (
                  <span style={{ position:'absolute', bottom:1, right:1, width:13, height:13, background:'#00a884', borderRadius:'50%', border:'2px solid #fff' }}/>
                )}
              </div>

              {/* Infos */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontWeight:600, fontSize:15, color:'#111b21', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{name}</span>
                  <span style={{ fontSize:12, color: conv.unreadCount > 0 ? '#00a884' : '#8696a0', flexShrink:0, marginLeft:8 }}>{timeStr}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <p style={{ fontSize:13, color:'#667781', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, margin:0 }}>
                    {lastMsg?.isDeleted
                      ? <em style={{ color:'#8696a0' }}>Message supprimé</em>
                      : (lastMsg?.content ?? '')}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span style={{ marginLeft:8, flexShrink:0, minWidth:20, height:20, background:'#00a884', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#fff', fontWeight:700, padding:'0 5px' }}>
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
            {/* Séparateur */}
            <div style={{ height:1, background:'#f0f2f5', marginLeft:80 }}/>
          </li>
        );
      })}
    </ul>
  );
}
