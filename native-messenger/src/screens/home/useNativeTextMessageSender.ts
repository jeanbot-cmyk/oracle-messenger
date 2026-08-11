import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation, Message } from '@/types/messenger';

type UseNativeTextMessageSenderParams = {
  draft: string;
  editingMessage: Message | null;
  replyTo: Message | null;
  selected: Conversation | null;
  token?: string;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  refreshConversations: () => Promise<void>;
  upsertMessage: (message: Message) => void;
  setDraft: Dispatch<SetStateAction<string>>;
  setEditingMessage: Dispatch<SetStateAction<Message | null>>;
  setNotice: (message: string) => void;
  setReplyTo: Dispatch<SetStateAction<Message | null>>;
};

export function useNativeTextMessageSender({
  draft,
  editingMessage,
  replyTo,
  selected,
  token,
  patchMessage,
  refreshConversations,
  upsertMessage,
  setDraft,
  setEditingMessage,
  setNotice,
  setReplyTo,
}: UseNativeTextMessageSenderParams) {
  return useCallback(async () => {
    const clean = draft.trim();
    if (!clean || !selected || !token) return;
    setDraft('');
    try {
      const socket = ensureNativeSocket(token);
      if (editingMessage) {
        socket.emit('message:edit', { messageId: editingMessage.id, content: clean });
        const message = await api.editMessage(editingMessage.id, token, clean);
        patchMessage(editingMessage.id, { content: message.content, isEdited: true, updatedAt: message.updatedAt });
        setEditingMessage(null);
      } else {
        const message = await socketAck<Message>(socket, 'message:send', {
          conversationId: selected.id,
          content: clean,
          type: 'text',
          replyToId: replyTo?.id,
        }).catch(() => api.sendMessage(selected.id, token, clean, 'text', replyTo?.id));
        upsertMessage({ ...message, status: message.status || 'sent', replyTo: replyTo || message.replyTo });
        setReplyTo(null);
      }
      await refreshConversations();
    } catch (error) {
      setDraft(clean);
      setNotice(error instanceof Error ? error.message : 'Envoi impossible.');
    }
  }, [
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
