import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { markConversationReadLocally, sortConversations } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { isMediaMessage, removeLocalGalleryItem } from '@/services/localMedia';
import { recordNativeDiagnostic } from '@/services/nativeDiagnostics';
import { clearCachedConversation, upsertCachedMessage, writeCachedConversations } from '@/services/nativeConversationCache';
import { nativeDebugLog, nativeDebugWarn } from '@/services/nativeLogger';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { AuthSession, Conversation, Message } from '@/types/messenger';
import { emitDeliveredAck, emitDeliveredAcks, latestIncomingMessage } from './nativeMessageReceipts';

type RefValue<T> = { current: T };

type UseNativeRealtimeEventsParams = {
  session: AuthSession | null;
  selectedConversationId?: string | null;
  messages: Message[];
  selectedRef: RefValue<Conversation | null>;
  sessionRef: RefValue<AuthSession | null>;
  upsertMessage: (message: Message) => void;
  upsertConversation: (conversation: Conversation) => void;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  markMessageDeleted: (conversationId: string, messageId: string) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setSelected: Dispatch<SetStateAction<Conversation | null>>;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
  handleTypingStart: (event: { conversationId: string; userId: string; userName?: string }) => void;
  handleTypingStop: (event: { conversationId: string; userId: string }) => void;
  handleUserOnline: (event: { userId: string; status?: string | null; lastSeen?: string | null; activeUntil?: string | null }) => void;
  handleUserOffline: (event: { userId: string; lastSeen?: string | null }) => void;
};

type PresenceSnapshotEvent = {
  conversationId?: string;
  participants?: {
    userId: string;
    status?: 'online' | 'offline' | string;
    lastSeen?: string | null;
    activeUntil?: string | null;
  }[];
};

const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
const ACTIVE_CONVERSATION_JOIN_THROTTLE_MS = 3_000;

export function useNativeRealtimeEvents({
  session,
  selectedConversationId,
  messages,
  selectedRef,
  sessionRef,
  upsertMessage,
  upsertConversation,
  patchMessage,
  markMessageDeleted,
  setConversations,
  setMessages,
  setSelected,
  runMediaSync,
  handleTypingStart,
  handleTypingStop,
  handleUserOnline,
  handleUserOffline,
}: UseNativeRealtimeEventsParams) {
  const summaryRefreshTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const activeConversationReadSyncRef = useRef<{ conversationId: string; at: number } | null>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!session?.token || !selectedConversationId) return;
    const socket = ensureNativeSocket(session.token);
    const joinSelectedConversation = () => {
      if (!socket.connected) socket.connect();
      socket.emit('conversation:join', { conversationId: selectedConversationId });
      activeConversationReadSyncRef.current = { conversationId: selectedConversationId, at: Date.now() };
    };
    joinSelectedConversation();
    socket.on('connect', joinSelectedConversation);
    return () => {
      socket.off('connect', joinSelectedConversation);
    };
  }, [selectedConversationId, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    const socket = ensureNativeSocket(session.token);
    const heartbeat = (nextState: AppStateStatus = AppState.currentState) => {
      if (!socket.connected) socket.connect();
      const isActive = nextState === 'active';
      socket.emit('presence:heartbeat', {
        state: isActive ? 'active' : 'background',
        at: new Date().toISOString(),
      });
      recordNativeDiagnostic(socket, {
        feature: 'presence',
        event: 'PRESENCE_HEARTBEAT_SENT',
        details: {
          state: isActive ? 'active' : 'background',
          appState: nextState,
        },
      });
      const selected = isActive ? selectedRef.current : null;
      if (selected?.id) {
        const last = activeConversationReadSyncRef.current;
        if (!last || last.conversationId !== selected.id || Date.now() - last.at > ACTIVE_CONVERSATION_JOIN_THROTTLE_MS) {
          activeConversationReadSyncRef.current = { conversationId: selected.id, at: Date.now() };
          socket.emit('conversation:join', { conversationId: selected.id });
          recordNativeDiagnostic(socket, {
            feature: 'socket',
            event: 'CONVERSATION_JOIN_SENT',
            conversationId: selected.id,
            details: { reason: 'presence-heartbeat-active' },
          });
        }
      }
    };
    const onConnect = () => heartbeat(AppState.currentState);
    heartbeat();
    socket.on('connect', onConnect);
    const timer = setInterval(() => heartbeat(), PRESENCE_HEARTBEAT_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener('change', heartbeat);

    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
      socket.off('connect', onConnect);
      socket.emit('presence:heartbeat', { state: 'background', at: new Date().toISOString() });
    };
  }, [selectedRef, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    const socket = ensureNativeSocket(session.token);
    const ownerId = session.user.id || session.user.email || session.token;

    const applyConversationSummary = (conversation: Conversation) => {
      const normalizedConversation = selectedRef.current?.id === conversation.id
        ? markConversationReadLocally(conversation)
        : conversation;
      setConversations(current => {
        const next = current.some(item => item.id === normalizedConversation.id)
          ? current.map(item => item.id === normalizedConversation.id ? normalizedConversation : item)
          : [normalizedConversation, ...current];
        const sorted = sortConversations(next);
        void writeCachedConversations(ownerId, sorted);
        return sorted;
      });
    };

    const syncOpenConversationReceipts = () => {
      const currentUserId = sessionRef.current?.user.id || session.user.id;
      const selected = selectedRef.current;
      const currentMessages = messagesRef.current;
      if (!currentUserId || !selected?.id || !currentMessages.length) return;
      const selectedMessages = currentMessages.filter(message => message.conversationId === selected.id);
      const deliveredCount = emitDeliveredAcks(socket, selectedMessages, currentUserId);
      if (deliveredCount) {
        recordNativeDiagnostic(socket, {
          feature: 'message',
          event: 'DELIVERY_ACK_BATCH_SENT',
          conversationId: selected.id,
          details: { count: deliveredCount },
        });
      }
      const lastIncoming = latestIncomingMessage(selectedMessages, currentUserId);
      if (!lastIncoming) return;
      socket.emit('message:read', { conversationId: selected.id, messageId: lastIncoming.id });
      recordNativeDiagnostic(socket, {
        feature: 'message',
        event: 'READ_ACK_SENT',
        conversationId: selected.id,
        messageId: lastIncoming.id,
        details: { reason: 'open-conversation-sync' },
      });
      api.markConversationRead(selected.id, session.token, lastIncoming.id)
        .then(updates => {
          if (!updates?.length) return;
          setMessages(current => current.map(message => {
            const update = updates.find(candidate => candidate.id === message.id);
            return update ? { ...message, status: update.status || message.status, updatedAt: update.updatedAt || message.updatedAt } : message;
          }));
        })
        .then(() => api.conversation(selected.id, session.token))
        .then(applyConversationSummary)
        .catch(() => undefined);
    };

    const scheduleConversationSummaryRefresh = (conversationId: string) => {
      if (!conversationId) return;
      const existing = summaryRefreshTimersRef.current[conversationId];
      if (existing) clearTimeout(existing);
      summaryRefreshTimersRef.current[conversationId] = setTimeout(() => {
        delete summaryRefreshTimersRef.current[conversationId];
        api.conversation(conversationId, session.token)
          .then(applyConversationSummary)
          .catch(() => undefined);
      }, 320);
    };

    const onMessageNew = (message: Message) => {
      recordNativeDiagnostic(socket, {
        feature: 'message',
        event: 'MESSAGE_EVENT_RECEIVED',
        conversationId: message.conversationId,
        messageId: message.id,
        details: {
          senderId: message.senderId,
          type: message.type,
          status: message.status,
          hasContent: Boolean(message.content),
          contentLength: typeof message.content === 'string' ? message.content.length : 0,
        },
      });
      const transport = (message as { transport?: { serverEmittedAt?: string; clientSentAt?: string; clientToServerMs?: number; serverCreateAndEmitMs?: number } }).transport;
      if (transport?.serverEmittedAt) {
        const serverToDeviceMs = Date.now() - Date.parse(transport.serverEmittedAt);
        nativeDebugLog('[NativeMessageLatency]', {
          messageId: message.id,
          conversationId: message.conversationId,
          clientToServerMs: transport.clientToServerMs,
          serverCreateAndEmitMs: transport.serverCreateAndEmitMs,
          serverToDeviceMs: Number.isFinite(serverToDeviceMs) ? Math.max(0, serverToDeviceMs) : undefined,
        });
      }
      upsertMessage(message);
      recordNativeDiagnostic(socket, {
        feature: 'ui',
        event: 'MESSAGE_STATE_UPSERTED',
        conversationId: message.conversationId,
        messageId: message.id,
        details: { selectedConversation: selectedRef.current?.id || null },
      });
      scheduleConversationSummaryRefresh(message.conversationId);
      const currentUserId = sessionRef.current?.user.id || session.user.id;
      if (message.senderId !== currentUserId) {
        const isSelectedConversation = selectedRef.current?.id === message.conversationId;
        const deliveredSent = emitDeliveredAck(socket, message, currentUserId, {
          serverEmittedAt: transport?.serverEmittedAt,
        });
        if (deliveredSent) {
          recordNativeDiagnostic(socket, {
            feature: 'message',
            event: 'DELIVERY_ACK_SENT',
            conversationId: message.conversationId,
            messageId: message.id,
            details: {
              serverEmittedAt: transport?.serverEmittedAt,
              reason: 'message-received-before-local-cache',
            },
          });
          void api.markMessageDelivered(message.id, session.token)
            .then(update => {
              recordNativeDiagnostic(socket, {
                feature: 'message',
                event: 'DELIVERY_ACK_HTTP_CONFIRMED',
                conversationId: update.conversationId,
                messageId: update.id,
                details: { status: update.status },
              });
              setMessages(current => current.map(item => (
                item.id === update.id
                  ? { ...item, status: update.status || item.status, updatedAt: update.updatedAt || item.updatedAt }
                  : item
              )));
            })
            .catch(error => {
              recordNativeDiagnostic(socket, {
                feature: 'message',
                event: 'DELIVERY_ACK_HTTP_FAILED',
                conversationId: message.conversationId,
                messageId: message.id,
                details: { error: error instanceof Error ? error.message : String(error) },
              });
            });
        }
        void upsertCachedMessage(ownerId, message.conversationId, message)
          .then(() => {
            recordNativeDiagnostic(socket, {
              feature: 'storage',
              event: 'MESSAGE_LOCAL_CACHE_SAVED',
              conversationId: message.conversationId,
              messageId: message.id,
            });
            if (isSelectedConversation) {
              socket.emit('message:read', { conversationId: message.conversationId, messageId: message.id });
              recordNativeDiagnostic(socket, {
                feature: 'message',
                event: 'READ_ACK_SENT',
                conversationId: message.conversationId,
                messageId: message.id,
                details: { reason: 'message-received-in-open-conversation' },
              });
              api.markConversationRead(message.conversationId, session.token, message.id)
                .then(updates => {
                  if (!updates?.length) return;
                  setMessages(current => current.map(item => {
                    const update = updates.find(candidate => candidate.id === item.id);
                    return update ? { ...item, status: update.status || item.status, updatedAt: update.updatedAt || item.updatedAt } : item;
                  }));
                })
                .then(() => api.conversation(message.conversationId, session.token))
                .then(applyConversationSummary)
                .catch(() => undefined);
              setConversations(current => sortConversations(current.map(item => (
                item.id === message.conversationId ? markConversationReadLocally(item) : item
              ))));
            }
            runMediaSync(session.token, session.user.id, [message]);
          })
          .catch(error => {
            nativeDebugWarn('[NativeMessageDeliveryAckSkipped]', {
              messageId: message.id,
              conversationId: message.conversationId,
              reason: deliveredSent ? 'cache-write-failed-after-delivery-ack' : 'cache-write-failed',
              message: error instanceof Error ? error.message : String(error),
            });
            recordNativeDiagnostic(socket, {
              feature: 'storage',
              event: 'MESSAGE_LOCAL_CACHE_FAILED',
              conversationId: message.conversationId,
              messageId: message.id,
              details: {
                ackSkipped: !deliveredSent,
                error: error instanceof Error ? error.message : String(error),
              },
            });
            if (isSelectedConversation) {
              socket.emit('message:read', { conversationId: message.conversationId, messageId: message.id });
              recordNativeDiagnostic(socket, {
                feature: 'message',
                event: 'READ_ACK_SENT',
                conversationId: message.conversationId,
                messageId: message.id,
                details: { reason: 'message-received-open-conversation-cache-failed' },
              });
            }
            runMediaSync(session.token, session.user.id, [message]);
          });
      }
    };

    const onConversationUpsert = (conversation: Conversation) => {
      upsertConversation(conversation);
    };

    const onMessageUpdate = ({ id, patch }: { id: string; patch: Partial<Message> }) => {
      recordNativeDiagnostic(socket, {
        feature: 'message',
        event: 'MESSAGE_STATUS_UPDATE_RECEIVED',
        messageId: id,
        conversationId: patch.conversationId,
        details: { status: patch.status, updatedAt: patch.updatedAt },
      });
      const existing = messagesRef.current.find(message => message.id === id);
      const updatedMessage = existing ? { ...existing, ...patch } : null;
      if (updatedMessage?.conversationId) {
        void upsertCachedMessage(session.user.id, updatedMessage.conversationId, updatedMessage).catch(() => undefined);
      }
      patchMessage(id, patch);
      if (updatedMessage && patch.content && isMediaMessage(updatedMessage)) {
        runMediaSync(session.token, session.user.id, [updatedMessage]);
      }
    };

    const onConversationRead = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      recordNativeDiagnostic(socket, {
        feature: 'message',
        event: 'READ_ACK_RECEIVED',
        conversationId,
        details: { readerId: userId },
      });
      if (userId === sessionRef.current?.user.id) {
        setConversations(current => sortConversations(current.map(item => item.id === conversationId ? markConversationReadLocally(item) : item)));
        api.conversation(conversationId, session.token).then(applyConversationSummary).catch(() => undefined);
        setMessages(current => current.map(message => (
          message.conversationId === conversationId && message.senderId !== userId
            ? { ...message, status: 'read' }
            : message
        )));
      }
    };

    const updateParticipantPresence = (event: { userId: string; status: 'online' | 'connected' | 'offline' | string; lastSeen?: string | null; activeUntil?: string | null }) => {
      const isOffline = event.status === 'offline';
      setConversations(current => sortConversations(current.map(conversation => ({
        ...conversation,
        participants: conversation.participants.map(participant => (
          participant.id === event.userId
            ? {
                ...participant,
                status: event.status,
                lastSeen: isOffline ? event.lastSeen ?? participant.lastSeen ?? null : participant.lastSeen ?? null,
                activeUntil: isOffline ? null : event.activeUntil ?? null,
              }
            : participant
        )),
      }))));
      setMessages(current => current.map(message => (
        message.sender?.id === event.userId
          ? {
              ...message,
              sender: {
                ...message.sender,
                status: event.status,
                lastSeen: isOffline ? event.lastSeen ?? message.sender.lastSeen ?? null : message.sender.lastSeen ?? null,
                activeUntil: isOffline ? null : event.activeUntil ?? null,
              },
            }
          : message
      )));
    };

    const onMessageDelete = ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      markMessageDeleted(conversationId, messageId);
      removeLocalGalleryItem(messageId).catch(() => null);
    };

    const onConversationDelete = ({ conversationId }: { conversationId: string }) => {
      setConversations(current => current.filter(conversation => conversation.id !== conversationId));
      clearCachedConversation(ownerId, conversationId).catch(() => undefined);
      if (selectedRef.current?.id === conversationId) {
        setSelected(null);
        setMessages([]);
      }
    };

    socket.on('message:new', onMessageNew);
    socket.on('connect', syncOpenConversationReceipts);
    socket.on('conversation:upsert', onConversationUpsert);
    socket.on('conversation:delete', onConversationDelete);
    socket.on('message:update', onMessageUpdate);
    socket.on('conversation:read', onConversationRead);
    socket.on('message:delete', onMessageDelete);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    const onUserOnline = (event: { userId: string; status?: string | null; lastSeen?: string | null; activeUntil?: string | null }) => {
      const status = event.status === 'connected' ? 'connected' : 'online';
      recordNativeDiagnostic(socket, {
        feature: 'presence',
        event: 'PRESENCE_USER_ONLINE_RECEIVED',
        details: { userId: event.userId, status, activeUntil: event.activeUntil || null },
      });
      updateParticipantPresence({ ...event, status });
      handleUserOnline({ ...event, status });
    };
    const onUserOffline = (event: { userId: string; lastSeen?: string | null }) => {
      recordNativeDiagnostic(socket, {
        feature: 'presence',
        event: 'PRESENCE_USER_OFFLINE_RECEIVED',
        details: { userId: event.userId, lastSeen: event.lastSeen || null },
      });
      updateParticipantPresence({ ...event, status: 'offline' });
      handleUserOffline(event);
    };
    const onPresenceSnapshot = (event: PresenceSnapshotEvent) => {
      if (!Array.isArray(event?.participants)) return;
      recordNativeDiagnostic(socket, {
        feature: 'presence',
        event: 'PRESENCE_SNAPSHOT_RECEIVED',
        conversationId: event.conversationId,
        details: {
          participants: event.participants.map(participant => ({
            userId: participant.userId,
            status: participant.status,
            activeUntil: participant.activeUntil || null,
          })),
        },
      });
      event.participants.forEach(participant => {
        if (!participant?.userId) return;
        if (participant.status === 'online' || participant.status === 'connected') {
          const onlineEvent = {
            userId: participant.userId,
            status: participant.status,
            lastSeen: participant.lastSeen ?? null,
            activeUntil: participant.activeUntil ?? null,
          };
          updateParticipantPresence({ ...onlineEvent, status: participant.status });
          handleUserOnline(onlineEvent);
          return;
        }
        const offlineEvent = {
          userId: participant.userId,
          lastSeen: participant.lastSeen ?? null,
        };
        updateParticipantPresence({ ...offlineEvent, status: 'offline' });
        handleUserOffline(offlineEvent);
      });
    };

    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);
    socket.on('presence:snapshot', onPresenceSnapshot);

    return () => {
      Object.values(summaryRefreshTimersRef.current).forEach(timer => clearTimeout(timer));
      summaryRefreshTimersRef.current = {};
      socket.off('message:new', onMessageNew);
      socket.off('connect', syncOpenConversationReceipts);
      socket.off('conversation:upsert', onConversationUpsert);
      socket.off('conversation:delete', onConversationDelete);
      socket.off('message:update', onMessageUpdate);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
      socket.off('presence:snapshot', onPresenceSnapshot);
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
    setSelected,
    upsertConversation,
    upsertMessage,
  ]);
}
