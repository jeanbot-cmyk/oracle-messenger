'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import type { Message } from '../../types';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

interface Props { message: Message; isOwn: boolean; onReply:(m:Message)=>void; onDelete:(id:string)=>void; onEdit:(m:Message)=>void; }

function StatusIcon({ status }: { status: Message['status'] }) {
  if (status==='sending')   return <span style={{ fontSize:10, opacity:.5 }}>⏳</span>;
  if (status==='sent')      return <span style={{ fontSize:10, opacity:.6 }}>✓</span>;
  if (status==='delivered') return <span style={{ fontSize:10, opacity:.7 }}>✓✓</span>;
  if (status==='read')      return <span style={{ fontSize:10, color:'#53bdeb' }}>✓✓</span>;
  return null;
}

export function MessageBubble({ message, isOwn, onReply, onDelete, onEdit }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const { lang } = useSettings();

  if (message.isDeleted) return (
    <div style={{ display:'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
      <div style={{ padding:'8px 14px', borderRadius:8, background:'var(--bg-input)', border:'1px solid var(--border)' }}>
        <p style={{ fontSize:13, color:'var(--text-muted)', fontStyle:'italic' }}>{t(lang,'chat.deleted')}</p>
      </div>
    </div>
  );

  const menuStyle: React.CSSProperties = { position:'absolute', zIndex:50, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.15)', minWidth:150, ...(isOwn ? { right:0 } : { left:0 }), bottom:'100%', marginBottom:4 };
  const menuItemStyle: React.CSSProperties = { width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' as const };

  return (
    <div style={{ display:'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}
      onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}>
      <div style={{ position:'relative', maxWidth:'72%' }}>
        {/* Reply preview */}
        {message.replyTo && (
          <div style={{ marginBottom:4, padding:'6px 10px', borderRadius:8, borderLeft:'3px solid var(--accent)', background:'var(--bg-input)', fontSize:12, color:'var(--text-muted)' }}>
            <p style={{ fontWeight:600, color:'var(--accent)', fontSize:11, margin:'0 0 2px' }}>{message.replyTo.sender?.name}</p>
            <p style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{message.replyTo.content}</p>
          </div>
        )}

        {/* Bubble */}
        <div className={isOwn ? 'bubble-out' : 'bubble-in'} style={{ padding:'8px 12px' }}>
          <p style={{ fontSize:14, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0 }}>{message.content}</p>
          <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize:11, color: isOwn ? 'rgba(0,0,0,.45)' : 'var(--text-muted)' }}>
              {format(new Date(message.createdAt), 'HH:mm')}
            </span>
            {message.isEdited && <span style={{ fontSize:10, color: isOwn ? 'rgba(0,0,0,.4)' : 'var(--text-muted)' }}>{t(lang,'chat.edited')}</span>}
            {isOwn && <StatusIcon status={message.status} />}
          </div>
        </div>

        {/* Context menu */}
        {showMenu && (
          <>
            <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setShowMenu(false)} />
            <div style={menuStyle}>
              <button style={menuItemStyle} onClick={() => { onReply(message); setShowMenu(false); }}>↩️ {t(lang,'chat.reply')}</button>
              {isOwn && <>
                <button style={menuItemStyle} onClick={() => { onEdit(message); setShowMenu(false); }}>✏️ {t(lang,'chat.edit')}</button>
                <button style={{ ...menuItemStyle, color:'#dc2626' }} onClick={() => { onDelete(message.id); setShowMenu(false); }}>🗑️ {t(lang,'chat.delete')}</button>
              </>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
