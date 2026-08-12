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
  const [lastSeenByUser, setLastSeenByUser] = useState<Record<string, string | null>>({});
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatLastSeen = useCallback((value?: string | null) => {
    if (!value) return 'Hors ligne';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Hors ligne';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === today.toDateString()) return `dernière connexion aujourd’hui à ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `dernière connexion hier à ${time}`;
    return `dernière connexion le ${date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} à ${time}`;
  }, []);

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

  const handleUserOnline = useCallback(({ userId, lastSeen }: { userId: string; lastSeen?: string | null }) => {
    setOnlineUsers(current => new Set([...current, userId]));
    if (lastSeen !== undefined) {
      setLastSeenByUser(current => ({ ...current, [userId]: lastSeen }));
    }
  }, []);

  const handleUserOffline = useCallback(({ userId, lastSeen }: { userId: string; lastSeen?: string | null }) => {
    setOnlineUsers(current => {
      const next = new Set(current);
      next.delete(userId);
      return next;
    });
    setLastSeenByUser(current => ({ ...current, [userId]: lastSeen ?? new Date().toISOString() }));
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

  useEffect(() => {
    if (!selected || !currentUserId) return;
    const remoteParticipants = selected.participants.filter(user => user.id !== currentUserId);
    if (!remoteParticipants.length) return;
    setLastSeenByUser(current => {
      const next = { ...current };
      remoteParticipants.forEach(user => {
        if (user.lastSeen !== undefined) next[user.id] = user.lastSeen ?? null;
      });
      return next;
    });
  }, [currentUserId, selected]);

  const presenceText = useMemo(() => {
    if (!selected || !currentUserId) return 'Hors ligne';
    const typingNames = Object.values(typingByConversation[selected.id] || {});
    if (typingNames.length) return `${typingNames.slice(0, 2).join(', ')} écrit...`;
    const remoteParticipants = selected.participants.filter(user => user.id !== currentUserId);
    const selectedOnline = remoteParticipants.some(user => onlineUsers.has(user.id));
    if (selectedOnline) return 'En ligne';
    const lastSeen = remoteParticipants
      .map(user => lastSeenByUser[user.id] ?? user.lastSeen ?? null)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
    return formatLastSeen(lastSeen);
  }, [currentUserId, formatLastSeen, lastSeenByUser, onlineUsers, selected, typingByConversation]);

  return {
    presenceText,
    handleDraftChange,
    handleTypingStart,
    handleTypingStop,
    handleUserOnline,
    handleUserOffline,
  };
}
