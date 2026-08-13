import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { markConversationReadLocally, sortConversations } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type RefValue<T> = { current: T };

type UseNativeRealtimeEventsParams = {
  session: AuthSession | null;
  selectedRef: RefValue<Conversation | null>;
  sessionRef: RefValue<AuthSession | null>;
  upsertMessage: (message: Message) => void;
  upsertConversation: (conversation: Conversation) => void;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  markMessageDeleted: (conversationId: string, messageId: string) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
  handleTypingStart: (event: { conversationId: string; userId: string; userName?: string }) => void;
  handleTypingStop: (event: { conversationId: string; userId: string }) => void;
  handleUserOnline: (event: { userId: string; lastSeen?: string | null; activeUntil?: string | null }) => void;
  handleUserOffline: (event: { userId: string; lastSeen?: string | null }) => void;
};

export function useNativeRealtimeEvents({
  session,
  selectedRef,
  sessionRef,
  upsertMessage,
  upsertConversation,
  patchMessage,
  markMessageDeleted,
  setConversations,
  setMessages,
  runMediaSync,
  handleTypingStart,
  handleTypingStop,
  handleUserOnline,
  handleUserOffline,
}: UseNativeRealtimeEventsParams) {
  useEffect(() => {
    if (!session?.token) return;
    const socket = ensureNativeSocket(session.token);
    const heartbeat = (nextState: AppStateStatus = AppState.currentState) => {
      socket.emit('presence:heartbeat', {
        state: nextState === 'active' ? 'active' : 'background',
        at: new Date().toISOString(),
      });
    };
    const onConnect = () => heartbeat('active');
    heartbeat();
    socket.on('connect', onConnect);
    const timer = setInterval(() => heartbeat(), 25_000);
    const appStateSubscription = AppState.addEventListener('change', heartbeat);

    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
      socket.off('connect', onConnect);
      socket.emit('presence:heartbeat', { state: 'background', at: new Date().toISOString() });
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    const socket = ensureNativeSocket(session.token);

    const onMessageNew = (message: Message) => {
      upsertMessage(message);
      if (message.senderId !== sessionRef.current?.user.id) {
        socket.emit('message:delivered', { messageId: message.id });
        if (selectedRef.current?.id === message.conversationId) {
          socket.emit('message:read', { conversationId: message.conversationId, messageId: message.id });
          api.markConversationRead(message.conversationId, session.token, message.id).catch(() => undefined);
          setConversations(current => sortConversations(current.map(item => (
            item.id === message.conversationId ? markConversationReadLocally(item) : item
          ))));
        }
        runMediaSync(session.token, session.user.id, [message]);
      }
    };

    const onConversationUpsert = (conversation: Conversation) => {
      upsertConversation(conversation);
    };

    const onMessageUpdate = ({ id, patch }: { id: string; patch: Partial<Message> }) => {
      patchMessage(id, patch);
    };

    const onConversationRead = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (userId === sessionRef.current?.user.id) {
        setConversations(current => sortConversations(current.map(item => item.id === conversationId ? markConversationReadLocally(item) : item)));
        setMessages(current => current.map(message => (
          message.conversationId === conversationId && message.senderId !== userId
            ? { ...message, status: 'read' }
            : message
        )));
      }
    };

    const updateParticipantPresence = (event: { userId: string; status: 'online' | 'offline'; lastSeen?: string | null; activeUntil?: string | null }) => {
      setConversations(current => sortConversations(current.map(conversation => ({
        ...conversation,
        participants: conversation.participants.map(participant => (
          participant.id === event.userId
            ? { ...participant, status: event.status, lastSeen: event.lastSeen ?? participant.lastSeen ?? null }
            : participant
        )),
      }))));
      setMessages(current => current.map(message => (
        message.sender?.id === event.userId
          ? { ...message, sender: { ...message.sender, status: event.status, lastSeen: event.lastSeen ?? message.sender.lastSeen ?? null } }
          : message
      )));
    };

    const onMessageDelete = ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      markMessageDeleted(conversationId, messageId);
    };

    socket.on('message:new', onMessageNew);
    socket.on('conversation:upsert', onConversationUpsert);
    socket.on('message:update', onMessageUpdate);
    socket.on('conversation:read', onConversationRead);
    socket.on('message:delete', onMessageDelete);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    const onUserOnline = (event: { userId: string; lastSeen?: string | null; activeUntil?: string | null }) => {
      updateParticipantPresence({ ...event, status: 'online' });
      handleUserOnline(event);
    };
    const onUserOffline = (event: { userId: string; lastSeen?: string | null }) => {
      updateParticipantPresence({ ...event, status: 'offline' });
      handleUserOffline(event);
    };

    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('conversation:upsert', onConversationUpsert);
      socket.off('message:update', onMessageUpdate);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
    };
  }, [
    handleTypingStart,
    handleTypingStop,
    handleUserOffline,
    handleUserOnline,
    markMessageDeleted,
    patchMessage,
    runMediaSync,
    selectedRef,
    session,
    session?.token,
    session?.user.id,
    sessionRef,
    setConversations,
    setMessages,
    upsertConversation,
    upsertMessage,
  ]);
}
