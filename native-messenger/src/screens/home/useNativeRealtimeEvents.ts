import { useEffect, type Dispatch, type SetStateAction } from 'react';
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
  handleUserOnline: (event: { userId: string }) => void;
  handleUserOffline: (event: { userId: string }) => void;
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

    const onMessageNew = (message: Message) => {
      upsertMessage(message);
      if (message.senderId !== sessionRef.current?.user.id) {
        socket.emit('message:delivered', { messageId: message.id });
        if (selectedRef.current?.id === message.conversationId) {
          socket.emit('message:read', { conversationId: message.conversationId, messageId: message.id });
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
        setConversations(current => current.map(item => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
        return;
      }
      setMessages(current => current.map(item => (
        item.conversationId === conversationId && item.senderId === sessionRef.current?.user.id
          ? { ...item, status: 'read' }
          : item
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
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('conversation:upsert', onConversationUpsert);
      socket.off('message:update', onMessageUpdate);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
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
