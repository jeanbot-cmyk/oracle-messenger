import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation } from '@/types/messenger';

type UseNativeTypingPresenceParams = {
  selected: Conversation | null;
  token?: string;
  currentUserId?: string;
  setDraft: (value: string) => void;
};

const LOCAL_TYPING_STOP_DELAY_MS = 1800;
const LOCAL_TYPING_REFRESH_MS = 6000;
const REMOTE_TYPING_EXPIRY_MS = 4500;
const CONNECTED_PRESENCE_EXPIRY_MS = 45_000;

export function useNativeTypingPresence({ selected, token, currentUserId, setDraft }: UseNativeTypingPresenceParams) {
  const [typingByConversation, setTypingByConversation] = useState<Record<string, Record<string, string>>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [connectedUsers, setConnectedUsers] = useState<Set<string>>(new Set());
  const [lastSeenByUser, setLastSeenByUser] = useState<Record<string, string | null>>({});
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingExpiryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const onlineExpiryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const connectedExpiryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const localTypingRef = useRef<{ conversationId: string | null; active: boolean; lastStartAt: number }>({
    conversationId: null,
    active: false,
    lastStartAt: 0,
  });

  const clearRemoteTyping = useCallback((conversationId: string, userId: string) => {
    const key = `${conversationId}:${userId}`;
    const timer = typingExpiryTimersRef.current[key];
    if (timer) clearTimeout(timer);
    delete typingExpiryTimersRef.current[key];
    setTypingByConversation(current => {
      const currentForConversation = current[conversationId] || {};
      if (!currentForConversation[userId]) return current;
      const nextForConversation = { ...currentForConversation };
      delete nextForConversation[userId];
      return { ...current, [conversationId]: nextForConversation };
    });
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
    const key = `${conversationId}:${userId}`;
    const existingTimer = typingExpiryTimersRef.current[key];
    if (existingTimer) clearTimeout(existingTimer);
    typingExpiryTimersRef.current[key] = setTimeout(() => {
      clearRemoteTyping(conversationId, userId);
    }, REMOTE_TYPING_EXPIRY_MS);
  }, [clearRemoteTyping, currentUserId]);

  const handleTypingStop = useCallback(({ conversationId, userId }: { conversationId: string; userId: string }) => {
    clearRemoteTyping(conversationId, userId);
  }, [clearRemoteTyping]);

  const handleUserOnline = useCallback(({ userId, status, lastSeen, activeUntil }: { userId: string; status?: string | null; lastSeen?: string | null; activeUntil?: string | null }) => {
    const isActiveOnline = status !== 'connected';
    setConnectedUsers(current => new Set([...current, userId]));
    const existingConnectedTimer = connectedExpiryTimersRef.current[userId];
    if (existingConnectedTimer) clearTimeout(existingConnectedTimer);
    connectedExpiryTimersRef.current[userId] = setTimeout(() => {
      delete connectedExpiryTimersRef.current[userId];
      setConnectedUsers(current => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }, CONNECTED_PRESENCE_EXPIRY_MS);
    setOnlineUsers(current => {
      const next = new Set(current);
      if (isActiveOnline) next.add(userId);
      else next.delete(userId);
      return next;
    });
    if (lastSeen) {
      setLastSeenByUser(current => ({ ...current, [userId]: lastSeen }));
    }
    const existingTimer = onlineExpiryTimersRef.current[userId];
    if (existingTimer) clearTimeout(existingTimer);
    delete onlineExpiryTimersRef.current[userId];
    if (isActiveOnline) {
      const until = activeUntil ? Date.parse(activeUntil) : Number.NaN;
      const timeoutMs = Number.isFinite(until) ? Math.max(12_000, until - Date.now() + 1500) : 82_000;
      onlineExpiryTimersRef.current[userId] = setTimeout(() => {
        delete onlineExpiryTimersRef.current[userId];
        setOnlineUsers(current => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
      }, timeoutMs);
    }
  }, []);

  const handleUserOffline = useCallback(({ userId, lastSeen }: { userId: string; lastSeen?: string | null }) => {
    const existingConnectedTimer = connectedExpiryTimersRef.current[userId];
    if (existingConnectedTimer) {
      clearTimeout(existingConnectedTimer);
      delete connectedExpiryTimersRef.current[userId];
    }
    const existingTimer = onlineExpiryTimersRef.current[userId];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete onlineExpiryTimersRef.current[userId];
    }
    Object.keys(typingExpiryTimersRef.current).forEach(key => {
      if (!key.endsWith(`:${userId}`)) return;
      const timer = typingExpiryTimersRef.current[key];
      if (timer) clearTimeout(timer);
      delete typingExpiryTimersRef.current[key];
    });
    setTypingByConversation(current => {
      const next: Record<string, Record<string, string>> = {};
      Object.entries(current).forEach(([conversationId, users]) => {
        const nextUsers = { ...users };
        delete nextUsers[userId];
        next[conversationId] = nextUsers;
      });
      return next;
    });
    setOnlineUsers(current => {
      const next = new Set(current);
      next.delete(userId);
      return next;
    });
    setConnectedUsers(current => {
      const next = new Set(current);
      next.delete(userId);
      return next;
    });
    setLastSeenByUser(current => ({ ...current, [userId]: lastSeen ?? new Date().toISOString() }));
  }, []);

  const stopTypingNow = useCallback((conversationId = localTypingRef.current.conversationId) => {
    if (!conversationId || !token) return;
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    const socket = ensureNativeSocket(token);
    socket.emit('typing:stop', { conversationId });
    if (localTypingRef.current.conversationId === conversationId) {
      localTypingRef.current = { conversationId, active: false, lastStartAt: 0 };
    }
  }, [token]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (!token || !selected) return;
    const conversationId = selected.id;
    const hasText = Boolean(value.trim());
    if (localTypingRef.current.conversationId && localTypingRef.current.conversationId !== conversationId && localTypingRef.current.active) {
      stopTypingNow(localTypingRef.current.conversationId);
    }
    localTypingRef.current.conversationId = conversationId;

    if (!hasText) {
      stopTypingNow(conversationId);
      return;
    }

    const socket = ensureNativeSocket(token);
    const now = Date.now();
    if (!localTypingRef.current.active || now - localTypingRef.current.lastStartAt >= LOCAL_TYPING_REFRESH_MS) {
      socket.emit('typing:start', { conversationId });
      localTypingRef.current = { conversationId, active: true, lastStartAt: now };
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      stopTypingNow(conversationId);
    }, LOCAL_TYPING_STOP_DELAY_MS);
  }, [selected, setDraft, stopTypingNow, token]);

  useEffect(() => {
    const activeConversationId = localTypingRef.current.conversationId;
    if (activeConversationId && activeConversationId !== selected?.id && localTypingRef.current.active) {
      stopTypingNow(activeConversationId);
    }
  }, [selected?.id, stopTypingNow]);

  useEffect(() => () => {
    if (localTypingRef.current.active) stopTypingNow(localTypingRef.current.conversationId);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    Object.values(typingExpiryTimersRef.current).forEach(timer => clearTimeout(timer));
    typingExpiryTimersRef.current = {};
    Object.values(onlineExpiryTimersRef.current).forEach(timer => clearTimeout(timer));
    onlineExpiryTimersRef.current = {};
    Object.values(connectedExpiryTimersRef.current).forEach(timer => clearTimeout(timer));
    connectedExpiryTimersRef.current = {};
  }, [stopTypingNow]);

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
    if (!selected || !currentUserId) return '';
    const typingNames = Object.values(typingByConversation[selected.id] || {});
    if (typingNames.length) return `${typingNames.slice(0, 2).join(', ')} écrit...`;
    const remoteParticipants = selected.participants.filter(user => user.id !== currentUserId);
    const selectedOnline = remoteParticipants.some(user => onlineUsers.has(user.id));
    if (selectedOnline) return 'En ligne';
    const selectedConnected = remoteParticipants.some(user => connectedUsers.has(user.id));
    if (selectedConnected) return 'Connecté';
    const lastSeen = remoteParticipants
      .map(user => lastSeenByUser[user.id] ?? user.lastSeen ?? null)
      .filter(Boolean)
      .map(value => new Date(String(value)))
      .filter(date => Number.isFinite(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    if (!lastSeen) return 'Hors ligne';
    const now = Date.now();
    const diffMinutes = Math.max(0, Math.floor((now - lastSeen.getTime()) / 60000));
    if (diffMinutes < 1) return 'Vu à l’instant';
    if (diffMinutes < 60) return `Vu il y a ${diffMinutes} min`;
    if (diffMinutes < 24 * 60) {
      return `Vu aujourd’hui à ${lastSeen.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `Vu le ${lastSeen.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`;
  }, [connectedUsers, currentUserId, lastSeenByUser, onlineUsers, selected, typingByConversation]);

  return {
    presenceText,
    handleDraftChange,
    handleTypingStart,
    handleTypingStop,
    handleUserOnline,
    handleUserOffline,
    stopTypingNow,
  };
}
