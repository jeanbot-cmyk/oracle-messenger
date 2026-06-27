'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { api } from '../../lib/api';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../../types';
import clsx from 'clsx';
import Image from 'next/image';

export function ChatWindow() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';

  const { activeConvId, conversations, messages, typingUsers, onlineUsers, setMessages, addMessage, deleteMessage, updateMessage, markRead, loadLocalMessages } = useChatStore();
  const { joinConversation, sendTyping, sendMessage, markRead: socketMarkRead } = useSocket();

  const [input, setInput]       = useState('');
  const [replyTo, setReplyTo]   = useState<Message | null>(null);
  const [editMsg, setEditMsg]   = useState<Message | null>(null);
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  const conv = conversations.find(c => c.id === activeConvId);
  const convMessages = activeConvId ? (messages[activeConvId] ?? []) : [];
  const typingList = activeConvId ? (typingUsers[activeConvId] ?? []) : [];
  const other = conv?.participants?.[0];
  const isOnline = other && onlineUsers.has(other.id);

  // Charger messages au changement de conversation
  useEffect(() => {
    if (!activeConvId || !token) return;
    loadLocalMessages(activeConvId);
    joinConversation(activeConvId);
    api.messages.list(activeConvId, token).then(msgs => {
      setMessages(activeConvId, msgs);
      markRead(activeConvId);
    }).catch(() => {});
  }, [activeConvId, token]);

  // Scroll bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convMessages.length]);

  // Indicateur frappe
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
    setInput('');
    setSending(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    sendTyping(activeConvId, false);

    if (editMsg) {
      try {
        const updated = await api.messages.edit(editMsg.id, content, token);
        updateMessage(editMsg.id, { content, isEdited: true });
      } catch {}
      setEditMsg(null);
    } else {
      sendMessage(activeConvId, content, 'text');
    }
    setSending(false);
  }

  async function handleDelete(msgId: string) {
    if (!activeConvId) return;
    try {
      await api.messages.delete(msgId, token);
      deleteMessage(activeConvId, msgId);
    } catch {}
  }

  if (!activeConvId || !conv) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-oracle-night text-oracle-muted gap-4">
        <div className="w-20 h-20 rounded-full bg-oracle-surface flex items-center justify-center">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-sm">Sélectionnez une conversation</p>
      </div>
    );
  }

  const name = conv.type === 'group' ? conv.name : other?.name ?? 'Inconnu';
  const avatar = conv.type === 'group' ? conv.avatar : other?.avatar;

  return (
    <div className="flex-1 flex flex-col h-full bg-oracle-night">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-oracle-border bg-oracle-surface/50 backdrop-blur-sm flex-shrink-0">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-oracle-blue/20 flex items-center justify-center overflow-hidden">
            {avatar ? (
              <Image src={avatar} alt={name ?? ''} width={40} height={40} className="object-cover" />
            ) : (
              <span className="font-semibold text-oracle-accent">{(name ?? '?')[0].toUpperCase()}</span>
            )}
          </div>
          {isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-oracle-night" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white truncate">{name}</p>
          <p className="text-[11px] text-oracle-muted">
            {typingList.length > 0 ? (
              <span className="text-oracle-accent">en train d'écrire…</span>
            ) : isOnline ? 'en ligne' : 'hors ligne'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-oracle-border/30 text-oracle-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-oracle-border/30 text-oracle-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {convMessages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.senderId === userId}
            onReply={setReplyTo}
            onDelete={handleDelete}
            onEdit={setEditMsg}
          />
        ))}
        {typingList.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="bubble-in px-4 py-3 flex gap-1 items-center">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply/Edit bar */}
      {(replyTo || editMsg) && (
        <div className="px-4 py-2 border-t border-oracle-border bg-oracle-surface/30 flex items-center gap-3">
          <div className="flex-1 border-l-2 border-oracle-accent pl-3">
            <p className="text-[11px] text-oracle-accent font-medium">
              {editMsg ? 'Modifier le message' : `Répondre à ${replyTo?.sender?.name}`}
            </p>
            <p className="text-xs text-oracle-muted truncate">{editMsg?.content ?? replyTo?.content}</p>
          </div>
          <button onClick={() => { setReplyTo(null); setEditMsg(null); }}
            className="text-oracle-muted hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-oracle-border bg-oracle-surface/30 flex-shrink-0">
        <div className="flex items-end gap-2">
          <button className="w-10 h-10 flex items-center justify-center text-oracle-muted hover:text-white transition-colors flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <div className="flex-1 bg-oracle-surface border border-oracle-border rounded-3xl px-4 py-2.5 flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Message…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-white placeholder-oracle-muted outline-none resize-none max-h-32 leading-relaxed"
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 128) + 'px';
              }}
            />
            <button className="text-oracle-muted hover:text-white transition-colors flex-shrink-0 mb-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 flex items-center justify-center bg-oracle-blue hover:bg-oracle-accent disabled:opacity-40 rounded-full transition-all active:scale-90 flex-shrink-0"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
