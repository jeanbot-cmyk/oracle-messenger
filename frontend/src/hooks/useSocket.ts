'use client';
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket, disconnectSocket } from '../lib/socket';
import { useChatStore } from '../store/chat';
import type { Message } from '../types';

export function useSocket() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;
  const store  = useChatStore();
  const joined = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);

    socket.on('connect', () => {
      console.log('[Socket] connected');
    });

    // Nouveau message reçu
    socket.on('message:new', (msg: Message) => {
      store.addMessage(msg);
    });

    // Message mis à jour (édition, statut lu/reçu)
    socket.on('message:update', ({ id, patch }: { id: string; patch: Partial<Message> }) => {
      store.updateMessage(id, patch);
    });

    // Message supprimé
    socket.on('message:delete', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      store.deleteMessage(conversationId, messageId);
    });

    // Indicateur de frappe
    socket.on('typing:start', ({ conversationId, userId }: any) => {
      store.setTyping(conversationId, userId, true);
    });
    socket.on('typing:stop', ({ conversationId, userId }: any) => {
      store.setTyping(conversationId, userId, false);
    });

    // Présence
    socket.on('user:online',  ({ userId }: any) => store.setOnline(userId, true));
    socket.on('user:offline', ({ userId }: any) => store.setOnline(userId, false));

    return () => {
      socket.off('message:new');
      socket.off('message:update');
      socket.off('message:delete');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('user:online');
      socket.off('user:offline');
    };
  }, [token]);

  function joinConversation(convId: string) {
    if (!token || joined.current.has(convId)) return;
    const socket = getSocket(token);
    socket.emit('conversation:join', { conversationId: convId });
    joined.current.add(convId);
  }

  function sendTyping(convId: string, isTyping: boolean) {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId: convId });
  }

  function sendMessage(convId: string, content: string, type = 'text') {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('message:send', { conversationId: convId, content, type });
  }

  function markRead(convId: string, messageId: string) {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('message:read', { conversationId: convId, messageId });
  }

  return { joinConversation, sendTyping, sendMessage, markRead };
}
