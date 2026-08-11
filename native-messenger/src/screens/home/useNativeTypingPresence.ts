import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation } from '@/types/messenger';

type UseNativeTypingPresenceParams = {
  selected: Conversation | null;
  token?: string;
  currentUserId?: string;
  setDraft: (value: string) => void;
};

export function useNativeTypingPresence({ selected, token, currentUserId, setDraft }: UseNativeTypingPresenceParams) {
  const [typingByConversation, setTypingByConversation] = useState<Record<string, Record<string, string>>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTypingStart = useCallback(({ conversationId, userId, userName }: { conversationId: string; userId: string; userName?: string }) => {
    if (userId === currentUserId) return;
    setTypingByConversation(current => ({
      ...current,
      [conversationId]: {
        ...(current[conversationId] || {}),
        [userId]: userName || 'Contact',
      },
    }));
  }, [currentUserId]);

  const handleTypingStop = useCallback(({ conversationId, userId }: { conversationId: string; userId: string }) => {
    setTypingByConversation(current => {
      const nextForConversation = { ...(current[conversationId] || {}) };
      delete nextForConversation[userId];
      return { ...current, [conversationId]: nextForConversation };
    });
  }, []);

  const handleUserOnline = useCallback(({ userId }: { userId: string }) => {
    setOnlineUsers(current => new Set([...current, userId]));
  }, []);

  const handleUserOffline = useCallback(({ userId }: { userId: string }) => {
    setOnlineUsers(current => {
      const next = new Set(current);
      next.delete(userId);
      return next;
    });
  }, []);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (!token || !selected) return;
    const socket = ensureNativeSocket(token);
    socket.emit(value.trim() ? 'typing:start' : 'typing:stop', { conversationId: selected.id });
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (value.trim()) {
      typingStopTimerRef.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId: selected.id });
      }, 1800);
    }
  }, [selected, setDraft, token]);

  useEffect(() => () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
  }, []);

  const presenceText = useMemo(() => {
    if (!selected || !currentUserId) return 'Hors ligne';
    const typingNames = Object.values(typingByConversation[selected.id] || {});
    if (typingNames.length) return `${typingNames.slice(0, 2).join(', ')} écrit...`;
    const selectedOnline = selected.participants.some(user => user.id !== currentUserId && onlineUsers.has(user.id));
    return selectedOnline ? 'En ligne' : 'Hors ligne';
  }, [currentUserId, onlineUsers, selected, typingByConversation]);

  return {
    presenceText,
    handleDraftChange,
    handleTypingStart,
    handleTypingStop,
    handleUserOnline,
    handleUserOffline,
  };
}
