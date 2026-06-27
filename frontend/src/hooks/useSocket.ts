'use client';
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '../lib/socket';
import { useChatStore } from '../store/chat';
import { useNotifications } from './useNotifications';
import type { Message } from '../types';

export function useSocket() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;
  const userId = session?.user?.id ?? '';
  const store = useChatStore();
  const joined = useRef<Set<string>>(new Set());
  const { notifyMessage, requestPermission } = useNotifications();

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;

    // Demander permission notifs dès la connexion
    requestPermission();

    socket.on('connect', () => {
      console.log('[Socket] connected');
    });

    socket.on('message:new', (msg: Message) => {
      store.addMessage(msg);
      // Notifier seulement si le message vient de quelqu'un d'autre
      if (msg.senderId !== userId) {
        const senderName = msg.sender?.name ?? 'Nouveau message';
        const content = msg.isDeleted ? 'Message supprimé' : msg.content;
        notifyMessage(senderName, content, msg.conversationId);
      }
    });

    socket.on('message:update', ({ id, patch }: { id: string; patch: Partial<Message> }) => {
      store.updateMessage(id, patch);
    });

    socket.on('message:delete', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      store.deleteMessage(conversationId, messageId);
    });

    socket.on('typing:start', ({ conversationId, userId: uid, userName }: any) => {
      store.setTyping(conversationId, uid, true, userName);
    });
    socket.on('typing:stop', ({ conversationId, userId: uid }: any) => {
      store.setTyping(conversationId, uid, false);
    });

    socket.on('user:online',  ({ userId: uid }: any) => store.setOnline(uid, true));
    socket.on('user:offline', ({ userId: uid }: any) => store.setOnline(uid, false));

    return () => {
      socket.off('connect');
      socket.off('message:new');
      socket.off('message:update');
      socket.off('message:delete');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('user:online');
      socket.off('user:offline');
    };
  }, [token, userId]);

  function joinConversation(convId: string) {
    if (!token || joined.current.has(convId)) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('conversation:join', { conversationId: convId });
    joined.current.add(convId);
  }

  function sendTyping(convId: string, isTyping: boolean) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId: convId });
  }

  function sendMessage(convId: string, content: string, type = 'text') {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('message:send', { conversationId: convId, content, type });
  }

  function markRead(convId: string, messageId: string) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('message:read', { conversationId: convId, messageId });
  }

  return { joinConversation, sendTyping, sendMessage, markRead };
}
