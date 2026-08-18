import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { deleteNativeDraft } from '@/services/nativeDrafts';
import { recordNativeDiagnostic } from '@/services/nativeDiagnostics';
import { nativeDebugLog } from '@/services/nativeLogger';
import { ensureNativeSocket } from '@/services/nativeSocket';
import {
  enqueueNativeTextMessage,
  markNativeTextMessageAttempt,
  readNativeTextOutbox,
  removeNativeTextMessageFromOutbox,
} from '@/services/nativeTextOutbox';
import type { Conversation, Message } from '@/types/messenger';

type UseNativeTextMessageSenderParams = {
  draft: string;
  editingMessage: Message | null;
  replyTo: Message | null;
  selected: Conversation | null;
  token?: string;
  currentUserId?: string;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  refreshConversations: () => Promise<void>;
  upsertMessage: (message: Message) => void;
  setDraft: Dispatch<SetStateAction<string>>;
  setEditingMessage: Dispatch<SetStateAction<Message | null>>;
  setNotice: (message: string) => void;
  setReplyTo: Dispatch<SetStateAction<Message | null>>;
  stopTyping?: () => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Envoi impossible.';
}

function isRetryableSendError(error: unknown) {
  const message = errorMessage(error);
  if (/HTTP 4\d\d/.test(message)) return false;
  return true;
}

async function sendTextMessage(
  token: string,
  payload: { conversationId: string; content: string; replyToId?: string | null; clientMessageId?: string | null },
) {
  const socket = ensureNativeSocket(token);
  const clientMessageId = payload.clientMessageId || undefined;
  const startedAt = Date.now();
  recordNativeDiagnostic(socket, {
    feature: 'message',
    event: 'MESSAGE_SEND_SOCKET_ATTEMPT',
    conversationId: payload.conversationId,
    messageId: clientMessageId,
    details: {
      clientMessageId,
      contentLength: payload.content.length,
      hasReply: Boolean(payload.replyToId),
    },
  });
  try {
    const message = await socketAck<Message>(socket, 'message:send', {
      conversationId: payload.conversationId,
      content: payload.content,
      type: 'text',
      replyToId: payload.replyToId || undefined,
      clientMessageId,
      clientSentAt: new Date().toISOString(),
    });
    nativeDebugLog('[NativeMessageSendLatency]', {
      conversationId: payload.conversationId,
      messageId: message.id,
      clientMessageId,
      transport: 'socket',
      ackMs: Date.now() - startedAt,
      socketConnected: socket.connected,
    });
    recordNativeDiagnostic(socket, {
      feature: 'message',
      event: 'MESSAGE_ACCEPTED_BY_SERVER',
      conversationId: payload.conversationId,
      messageId: message.id,
      details: {
        clientMessageId,
        ackMs: Date.now() - startedAt,
        transport: 'socket',
        status: message.status,
      },
    });
    return message;
  } catch (error) {
    recordNativeDiagnostic(socket, {
      feature: 'message',
      event: 'MESSAGE_SOCKET_SEND_FAILED',
      conversationId: payload.conversationId,
      messageId: clientMessageId,
      details: {
        clientMessageId,
        ackMs: Date.now() - startedAt,
        socketConnected: socket.connected,
        error: errorMessage(error),
      },
    });
    if (socket.connected) throw error;
    const message = await api.sendMessage(
      payload.conversationId,
      token,
      payload.content,
      'text',
      payload.replyToId || undefined,
      clientMessageId,
    );
    nativeDebugLog('[NativeMessageSendLatency]', {
      conversationId: payload.conversationId,
      messageId: message.id,
      clientMessageId,
      transport: 'http-fallback',
      ackMs: Date.now() - startedAt,
      socketConnected: socket.connected,
    });
    recordNativeDiagnostic(socket, {
      feature: 'message',
      event: 'MESSAGE_ACCEPTED_BY_SERVER',
      conversationId: payload.conversationId,
      messageId: message.id,
      details: {
        clientMessageId,
        ackMs: Date.now() - startedAt,
        transport: 'http-fallback',
        status: message.status,
      },
    });
    return message;
  }
}

export function useNativeTextMessageSender({
  draft,
  editingMessage,
  replyTo,
  selected,
  token,
  currentUserId,
  patchMessage,
  refreshConversations,
  upsertMessage,
  setDraft,
  setEditingMessage,
  setNotice,
  setReplyTo,
  stopTyping,
}: UseNativeTextMessageSenderParams) {
  const flushingOutboxRef = useRef(false);
  const refreshAfterSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleConversationRefreshAfterSend = useCallback(() => {
    if (refreshAfterSendTimerRef.current) clearTimeout(refreshAfterSendTimerRef.current);
    refreshAfterSendTimerRef.current = setTimeout(() => {
      refreshAfterSendTimerRef.current = null;
      InteractionManager.runAfterInteractions(() => {
        void refreshConversations().catch(() => undefined);
      });
    }, 900);
  }, [refreshConversations]);

  const flushTextOutbox = useCallback(async () => {
    if (!token || flushingOutboxRef.current) return;
    flushingOutboxRef.current = true;
    try {
      const pending = await readNativeTextOutbox();
      if (!pending.length) return;
      let sentCount = 0;

      for (const item of pending) {
        try {
          const message = await sendTextMessage(token, {
            conversationId: item.conversationId,
            content: item.content,
            replyToId: item.replyToId,
            clientMessageId: item.localMessageId || item.id,
          });
          await removeNativeTextMessageFromOutbox(item.id);
          sentCount += 1;
          if (selected?.id === item.conversationId) {
            if (item.localMessageId) {
              patchMessage(item.localMessageId, { ...message, status: message.status || 'sent' });
            } else {
              upsertMessage({ ...message, status: message.status || 'sent' });
            }
          }
        } catch (error) {
          await markNativeTextMessageAttempt(item.id, errorMessage(error));
          if (item.localMessageId && selected?.id === item.conversationId) {
            patchMessage(item.localMessageId, { status: 'failed', updatedAt: new Date().toISOString() });
          }
          if (!isRetryableSendError(error)) {
            await removeNativeTextMessageFromOutbox(item.id);
          }
          break;
        }
      }

      if (sentCount) {
        await refreshConversations();
        setNotice(sentCount === 1 ? 'Message hors connexion envoyé.' : `${sentCount} messages hors connexion envoyés.`);
      }
    } finally {
      flushingOutboxRef.current = false;
    }
  }, [patchMessage, refreshConversations, selected?.id, setNotice, token, upsertMessage]);

  useEffect(() => {
    if (!token) return;
    const socket = ensureNativeSocket(token);
    void flushTextOutbox();
    socket.on('connect', flushTextOutbox);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void flushTextOutbox();
    });
    return () => {
      socket.off('connect', flushTextOutbox);
      subscription.remove();
    };
  }, [flushTextOutbox, token]);

  useEffect(() => () => {
    if (refreshAfterSendTimerRef.current) clearTimeout(refreshAfterSendTimerRef.current);
  }, []);

  return useCallback(async () => {
    const clean = draft.trim();
    if (!clean || !selected || !token) return;
    let localMessageId = '';
    const pendingReplyTo = replyTo;
    stopTyping?.();
    setDraft('');
    try {
      if (editingMessage) {
        const message = await api.editMessage(editingMessage.id, token, clean);
        patchMessage(editingMessage.id, { content: message.content, isEdited: true, updatedAt: message.updatedAt });
        setEditingMessage(null);
      } else {
        localMessageId = `local-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticMessage: Message = {
          id: localMessageId,
          clientMessageId: localMessageId,
          conversationId: selected.id,
          senderId: currentUserId || 'local-user',
          content: clean,
          type: 'text',
          status: 'sending',
          createdAt: new Date().toISOString(),
          replyTo: pendingReplyTo || undefined,
          replyToId: pendingReplyTo?.id,
        };
        const socket = ensureNativeSocket(token);
        recordNativeDiagnostic(socket, {
          feature: 'message',
          event: 'MESSAGE_SEND_TAP',
          conversationId: selected.id,
          messageId: localMessageId,
          details: {
            contentLength: clean.length,
            hasReply: Boolean(pendingReplyTo?.id),
            keyboardWasOpen: true,
          },
        });
        upsertMessage(optimisticMessage);
        recordNativeDiagnostic(socket, {
          feature: 'ui',
          event: 'MESSAGE_OPTIMISTIC_INSERTED',
          conversationId: selected.id,
          messageId: localMessageId,
          details: {
            status: optimisticMessage.status,
          },
        });
        setReplyTo(null);
        const message = await sendTextMessage(token, {
          conversationId: selected.id,
          content: clean,
          replyToId: pendingReplyTo?.id,
          clientMessageId: localMessageId,
        });
        patchMessage(localMessageId, { ...message, status: message.status || 'sent', replyTo: pendingReplyTo || message.replyTo });
        recordNativeDiagnostic(socket, {
          feature: 'ui',
          event: 'MESSAGE_LOCAL_STATUS_PATCHED',
          conversationId: selected.id,
          messageId: message.id,
          details: {
            localMessageId,
            status: message.status || 'sent',
          },
        });
      }
      void deleteNativeDraft(currentUserId || 'local', selected.id);
      scheduleConversationRefreshAfterSend();
    } catch (error) {
      if (!editingMessage && localMessageId) {
        patchMessage(localMessageId, { status: 'failed', updatedAt: new Date().toISOString() });
        if (!isRetryableSendError(error)) {
          setNotice(errorMessage(error));
          return;
        }
        await enqueueNativeTextMessage({
          localMessageId,
          conversationId: selected.id,
          content: clean,
          replyToId: pendingReplyTo?.id,
          lastError: errorMessage(error),
        });
        recordNativeDiagnostic(ensureNativeSocket(token), {
          feature: 'message',
          event: 'MESSAGE_QUEUED_OFFLINE',
          conversationId: selected.id,
          messageId: localMessageId,
          details: {
            retryable: true,
            error: errorMessage(error),
          },
        });
        setReplyTo(null);
        setNotice('Message gardé hors connexion. Il sera envoyé automatiquement à la reprise.');
        return;
      }
      setDraft(clean);
      setNotice(errorMessage(error));
    }
  }, [
    currentUserId,
    draft,
    editingMessage,
    patchMessage,
    replyTo,
    selected,
    setDraft,
    setEditingMessage,
    setNotice,
    setReplyTo,
    stopTyping,
    scheduleConversationRefreshAfterSend,
    token,
    upsertMessage,
  ]);
}
