'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { api } from '../../lib/api';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../../types';
import Image from 'next/image';

export function ChatWindow() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';
  const { lang } = useSettings();

  const { activeConvId, conversations, messages, typingUsers, onlineUsers, setMessages, addMessage, deleteMessage, updateMessage, markRead, loadLocalMessages } = useChatStore();
  const { joinConversation, sendTyping, sendMessage } = useSocket();

  const [input, setInput]     = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMsg, setEditMsg] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  const conv = conversations.find(c => c.id === activeConvId);
  const convMessages = activeConvId ? (messages[activeConvId] ?? []) : [];
  const typingList = activeConvId ? (typingUsers[activeConvId] ?? []) : [];
  const other = conv?.participants?.[0];
  const isOnline = other && onlineUsers.has(other.id);

  useEffect(() => {
    if (!activeConvId || !token) return;
    loadLocalMessages(activeConvId);
    joinConversation(activeConvId);
    api.messages.list(activeConvId, token).then(msgs => { setMessages(activeConvId, msgs); markRead(activeConvId); }).catch(() => {});
  }, [activeConvId, token]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [convMessages.length]);

  function handleInputChange(val: string) {
    setInput(val);
    if (!activeConvId) return;
    sendTyping(activeConvId, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(activeConvId, false), 2000);
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || !activeConvId || sending) return;
    setInput(''); setSending(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    sendTyping(activeConvId, false);
    if (editMsg) {
      try { await api.messages.edit(editMsg.id, content, token); updateMessage(editMsg.id, { content, isEdited:true }); } catch {}
      setEditMsg(null);
    } else {
      sendMessage(activeConvId, content, 'text');
    }
    setSending(false);
  }

  async function handleDelete(msgId: string) {
    if (!activeConvId) return;
    try { await api.messages.delete(msgId, token); deleteMessage(activeConvId, msgId); } catch {}
  }

  const name = conv?.type === 'group' ? conv.name : other?.name ?? 'Inconnu';
  const avatar = conv?.type === 'group' ? conv.avatar : other?.avatar;

  if (!activeConvId || !conv) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-elevated)', color:'var(--text-muted)', gap:16 }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:'var(--bg-input)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <p style={{ fontSize:14 }}>{t(lang,'chat.select')}</p>
    </div>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg-elevated)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', background:'var(--header-bg)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ position:'relative' }}>
          <div style={{ width:42, height:42, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
            {avatar ? <Image src={avatar} alt={name??''} width={42} height={42} style={{ objectFit:'cover' }} /> : (
              <span style={{ fontWeight:600, color:'#fff', fontSize:18 }}>{(name??'?')[0].toUpperCase()}</span>
            )}
          </div>
          {isOnline && <span style={{ position:'absolute', bottom:1, right:1, width:11, height:11, background:'var(--online-dot)', borderRadius:'50%', border:'2px solid var(--header-bg)' }} />}
        </div>
        <div style={{ flex:1 }}>
          <p style={{ fontWeight:600, fontSize:15, color:'var(--text-primary)', margin:0 }}>{name}</p>
          <p style={{ fontSize:12, color: typingList.length > 0 ? 'var(--accent)' : 'var(--text-muted)', margin:0 }}>
            {typingList.length > 0 ? t(lang,'chat.typing') : isOnline ? t(lang,'chat.online') : t(lang,'chat.offline')}
          </p>
        </div>
        <button style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)' }}>
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:4 }}>
        {convMessages.map(msg => (
          <MessageBubble key={msg.id} message={msg} isOwn={msg.senderId === userId} onReply={setReplyTo} onDelete={handleDelete} onEdit={setEditMsg} />
        ))}
        {typingList.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className="bubble-in" style={{ padding:'10px 14px', display:'flex', gap:4, alignItems:'center' }}>
              <div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply/Edit bar */}
      {(replyTo || editMsg) && (
        <div style={{ padding:'8px 16px', borderTop:'1px solid var(--border)', background:'var(--bg-surface)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, borderLeft:'3px solid var(--accent)', paddingLeft:10 }}>
            <p style={{ fontSize:12, color:'var(--accent)', fontWeight:600, margin:0 }}>
              {editMsg ? t(lang,'chat.edit.msg') : `${t(lang,'chat.reply.to')} ${replyTo?.sender?.name}`}
            </p>
            <p style={{ fontSize:12, color:'var(--text-muted)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{editMsg?.content ?? replyTo?.content}</p>
          </div>
          <button onClick={() => { setReplyTo(null); setEditMsg(null); }} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', fontSize:18 }}>×</button>
        </div>
      )}

      {/* Input */}
      <div style={{ padding:'8px 12px', background:'var(--bg-app)', flexShrink:0, display:'flex', alignItems:'flex-end', gap:8 }}>
        <button style={{ width:42, height:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', flexShrink:0 }}>
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <div style={{ flex:1, background:'var(--bg-surface)', borderRadius:24, padding:'10px 16px', display:'flex', alignItems:'flex-end', gap:8, border:'1px solid var(--border)' }}>
          <textarea value={input} onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={t(lang,'chat.placeholder')} rows={1}
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:15, color:'var(--text-primary)', resize:'none', maxHeight:128, lineHeight:1.5 }}
            onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,128)+'px'; }}
          />
          <button style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', flexShrink:0 }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <button onClick={handleSend} disabled={!input.trim()||sending}
          style={{ width:42, height:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--accent)', cursor:input.trim()?'pointer':'not-allowed', opacity:input.trim()?1:.5, flexShrink:0, transition:'opacity .2s' }}>
          <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
