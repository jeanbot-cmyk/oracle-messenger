import { useCallback, useMemo, useState } from 'react';
import { Alert, Share } from 'react-native';
import { messagePreview, socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation, Message } from '@/types/messenger';

type UseNativeMessageActionsParams = {
  messages: Message[];
  selected: Conversation | null;
  token?: string;
  currentUserId?: string;
  refreshConversations: () => Promise<void>;
  markMessageDeleted: (conversationId: string, messageId: string) => void;
  upsertMessage: (message: Message) => void;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
  setReplyTo: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  setDraft: (draft: string) => void;
};

export function useNativeMessageActions({
  messages,
  selected,
  token,
  currentUserId,
  refreshConversations,
  markMessageDeleted,
  upsertMessage,
  setBusy,
  setNotice,
  setReplyTo,
  setEditingMessage,
  setDraft,
}: UseNativeMessageActionsParams) {
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);

  const clearMessageSelection = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  const clearForwardMessages = useCallback(() => {
    setForwardMessages([]);
  }, []);

  const resetMessageActions = useCallback(() => {
    setSelectedMessageIds([]);
    setForwardMessages([]);
  }, []);

  const deleteOwnMessage = useCallback((message: Message) => {
    if (!token || message.senderId !== currentUserId) return;
    const socket = ensureNativeSocket(token);
    socket.emit('message:delete', { conversationId: message.conversationId, messageId: message.id });
    api.deleteMessage(message.id, token)
      .then(() => {
        markMessageDeleted(message.conversationId, message.id);
        refreshConversations().catch(() => null);
      })
      .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression impossible.'));
  }, [currentUserId, markMessageDeleted, refreshConversations, setNotice, token]);

  const selectedMessages = useMemo(() => {
    if (!selectedMessageIds.length) return [];
    const ids = new Set(selectedMessageIds);
    return messages.filter(message => ids.has(message.id));
  }, [messages, selectedMessageIds]);

  const reactToMessage = useCallback((message: Message, emoji: string | null) => {
    if (!token) return;
    const socket = ensureNativeSocket(token);
    socket.emit('message:react', { messageId: message.id, emoji });
  }, [token]);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(current => (
      current.includes(messageId)
        ? current.filter(id => id !== messageId)
        : [...current, messageId]
    ));
  }, []);

  const shareMessages = useCallback(async (items: Message[]) => {
    const body = items.map(message => messagePreview(message) === message.content ? message.content : `${messagePreview(message)}: ${message.content}`).join('\n\n');
    if (!body.trim()) return;
    try {
      await Share.share({ message: body });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage impossible.');
    }
  }, [setNotice]);

  const beginForward = useCallback((items: Message[]) => {
    const valid = items.filter(message => !message.isDeleted);
    if (!valid.length) return;
    setForwardMessages(valid.slice(0, 50));
    setSelectedMessageIds([]);
  }, []);

  const forwardToConversation = useCallback(async (conversation: Conversation) => {
    if (!token || !forwardMessages.length) return;
    setBusy(true);
    setNotice('');
    try {
      const socket = ensureNativeSocket(token);
      for (const message of forwardMessages) {
        const forwarded = await socketAck<Message>(socket, 'message:send', {
          conversationId: conversation.id,
          content: message.content,
          type: message.type,
        }).catch(() => api.sendMessage(conversation.id, token, message.content, message.type));
        if (selected?.id === conversation.id) upsertMessage({ ...forwarded, status: forwarded.status || 'sent' });
      }
      setForwardMessages([]);
      await refreshConversations();
      setNotice(forwardMessages.length > 1 ? 'Messages transférés.' : 'Message transféré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Transfert impossible.');
    } finally {
      setBusy(false);
    }
  }, [forwardMessages, refreshConversations, selected?.id, setBusy, setNotice, token, upsertMessage]);

  const deleteSelectedOwnMessages = useCallback(() => {
    const own = selectedMessages.filter(message => message.senderId === currentUserId && !message.isDeleted);
    if (!own.length) {
      setNotice('Aucun message sélectionné ne peut être supprimé par ce compte.');
      return;
    }
    Alert.alert('Supprimer', `${own.length} message(s) seront supprimés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          own.forEach(message => deleteOwnMessage(message));
          setSelectedMessageIds([]);
        },
      },
    ]);
  }, [currentUserId, deleteOwnMessage, selectedMessages, setNotice]);

  const openMessageActions = useCallback((message: Message) => {
    const mine = message.senderId === currentUserId;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Répondre', onPress: () => { setReplyTo(message); setEditingMessage(null); } },
      { text: 'Réagir ❤️', onPress: () => reactToMessage(message, '❤️') },
      { text: 'Sélectionner', onPress: () => toggleMessageSelection(message.id) },
      { text: 'Transférer', onPress: () => beginForward([message]) },
      { text: 'Partager', onPress: () => shareMessages([message]) },
    ];
    if (mine && message.type === 'text' && !message.isDeleted) {
      buttons.push({ text: 'Modifier', onPress: () => { setEditingMessage(message); setReplyTo(null); setDraft(message.content); } });
      buttons.push({ text: 'Supprimer', style: 'destructive', onPress: () => deleteOwnMessage(message) });
    }
    buttons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Message', messagePreview(message), buttons);
  }, [beginForward, currentUserId, deleteOwnMessage, reactToMessage, setDraft, setEditingMessage, setReplyTo, shareMessages, toggleMessageSelection]);

  return {
    selectedMessageIds,
    selectedMessages,
    forwardMessages,
    clearMessageSelection,
    clearForwardMessages,
    resetMessageActions,
    toggleMessageSelection,
    shareMessages,
    beginForward,
    forwardToConversation,
    deleteSelectedOwnMessages,
    openMessageActions,
  };
}
