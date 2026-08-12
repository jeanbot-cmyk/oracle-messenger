import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppState } from 'react-native';
import { socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
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
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Envoi impossible.';
}

function isRetryableSendError(error: unknown) {
  const message = errorMessage(error);
  if (/HTTP 4\d\d/.test(message)) return false;
  return true;
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
}: UseNativeTextMessageSenderParams) {
  const flushingOutboxRef = useRef(false);

  const flushTextOutbox = useCallback(async () => {
    if (!token || flushingOutboxRef.current) return;
    flushingOutboxRef.current = true;
    try {
      const pending = await readNativeTextOutbox();
      if (!pending.length) return;
      const socket = ensureNativeSocket(token);
      let sentCount = 0;

      for (const item of pending) {
        try {
          const message = await socketAck<Message>(socket, 'message:send', {
            conversationId: item.conversationId,
            content: item.content,
            type: 'text',
            replyToId: item.replyToId,
          }).catch(() => api.sendMessage(item.conversationId, token, item.content, 'text', item.replyToId));
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
    void flushTextOutbox();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void flushTextOutbox();
    });
    return () => subscription.remove();
  }, [flushTextOutbox, token]);

  return useCallback(async () => {
    const clean = draft.trim();
    if (!clean || !selected || !token) return;
    let localMessageId = '';
    const pendingReplyTo = replyTo;
    setDraft('');
    try {
      if (editingMessage) {
        const socket = ensureNativeSocket(token);
        socket.emit('message:edit', { messageId: editingMessage.id, content: clean });
        const message = await api.editMessage(editingMessage.id, token, clean);
        patchMessage(editingMessage.id, { content: message.content, isEdited: true, updatedAt: message.updatedAt });
        setEditingMessage(null);
      } else {
        localMessageId = `local-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticMessage: Message = {
          id: localMessageId,
          conversationId: selected.id,
          senderId: currentUserId || 'local-user',
          content: clean,
          type: 'text',
          status: 'sending',
          createdAt: new Date().toISOString(),
          replyTo: pendingReplyTo || undefined,
          replyToId: pendingReplyTo?.id,
        };
        upsertMessage(optimisticMessage);
        setReplyTo(null);
        const socket = ensureNativeSocket(token);
        const message = await socketAck<Message>(socket, 'message:send', {
          conversationId: selected.id,
          content: clean,
          type: 'text',
          replyToId: pendingReplyTo?.id,
        }).catch(() => api.sendMessage(selected.id, token, clean, 'text', pendingReplyTo?.id));
        patchMessage(localMessageId, { ...message, status: message.status || 'sent', replyTo: pendingReplyTo || message.replyTo });
      }
      void refreshConversations().catch(() => undefined);
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
    refreshConversations,
    replyTo,
    selected,
    setDraft,
    setEditingMessage,
    setNotice,
    setReplyTo,
    token,
    upsertMessage,
  ]);
}
