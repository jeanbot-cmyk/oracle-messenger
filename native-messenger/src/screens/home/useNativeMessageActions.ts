import { useCallback, useMemo, useState } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { messagePreview, socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { removeLocalGalleryItem } from '@/services/localMedia';
import { hideMessagesForMe } from '@/services/nativeHiddenMessages';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation, Message } from '@/types/messenger';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
const MAX_FORWARD_TARGETS = 25;

type UseNativeMessageActionsParams = {
  messages: Message[];
  selected: Conversation | null;
  token?: string;
  currentUserId?: string;
  ownerId?: string;
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
  ownerId,
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
  const [actionMessage, setActionMessage] = useState<Message | null>(null);

  const clearMessageSelection = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  const clearForwardMessages = useCallback(() => {
    setForwardMessages([]);
  }, []);

  const resetMessageActions = useCallback(() => {
    setSelectedMessageIds([]);
    setForwardMessages([]);
    setActionMessage(null);
  }, []);

  const deleteOwnMessage = useCallback((message: Message) => {
    if (!token || message.senderId !== currentUserId) return;
    api.deleteMessage(message.id, token)
      .then(() => {
        markMessageDeleted(message.conversationId, message.id);
        removeLocalGalleryItem(message.id).catch(() => null);
        refreshConversations().catch(() => null);
      })
      .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression impossible.'));
  }, [currentUserId, markMessageDeleted, refreshConversations, setNotice, token]);

  const deleteMessageForMe = useCallback((message: Message) => {
    if (!message.conversationId || !message.id) return;
    setActionMessage(null);
    markMessageDeleted(message.conversationId, message.id);
    removeLocalGalleryItem(message.id).catch(() => null);
    hideMessagesForMe(message.conversationId, [message.id], ownerId || currentUserId)
      .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression locale impossible.'));
  }, [currentUserId, markMessageDeleted, ownerId, setNotice]);

  const selectedMessages = useMemo(() => {
    if (!selectedMessageIds.length) return [];
    const ids = new Set(selectedMessageIds);
    return messages.filter(message => ids.has(message.id));
  }, [messages, selectedMessageIds]);

  const closeMessageActions = useCallback(() => {
    setActionMessage(null);
  }, []);

  const reactToMessage = useCallback(async (message: Message, emoji: string | null) => {
    if (!token || !currentUserId) return;
    const previousReactions = Array.isArray(message.reactions) ? message.reactions : [];
    const optimisticReactions = emoji
      ? [
          ...previousReactions.filter(reaction => reaction.userId !== currentUserId),
          { emoji, userId: currentUserId, updatedAt: new Date().toISOString() },
        ]
      : previousReactions.filter(reaction => reaction.userId !== currentUserId);
    setBusy(true);
    upsertMessage({ ...message, reactions: optimisticReactions });
    setActionMessage(current => current?.id === message.id ? { ...current, reactions: optimisticReactions } : current);
    try {
      const socket = ensureNativeSocket(token);
      const response = await socketAck<{ ok?: boolean; message?: string; id?: string; patch?: Partial<Message> }>(socket, 'message:react', {
        messageId: message.id,
        emoji,
      });
      if (response?.ok === false) throw new Error(response.message || 'Réaction refusée.');
      const patch = response?.patch || {};
      upsertMessage({ ...message, reactions: optimisticReactions, ...patch, id: response?.id || message.id });
      setActionMessage(null);
    } catch (error) {
      upsertMessage({ ...message, reactions: previousReactions });
      setNotice(error instanceof Error ? error.message : 'Réaction impossible.');
    } finally {
      setBusy(false);
    }
  }, [currentUserId, setBusy, setNotice, token, upsertMessage]);

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
      setActionMessage(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage impossible.');
    }
  }, [setNotice]);

  const copyMessage = useCallback(async (message: Message) => {
    const text = message.type === 'text' ? message.content : messagePreview(message);
    if (!text.trim()) return;
    try {
      await Clipboard.setStringAsync(text);
      setNotice('Message copié.');
      setActionMessage(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Copie impossible.');
    }
  }, [setNotice]);

  const replyToMessage = useCallback((message: Message) => {
    setReplyTo(message);
    setEditingMessage(null);
    setActionMessage(null);
  }, [setEditingMessage, setReplyTo]);

  const editMessage = useCallback((message: Message) => {
    setEditingMessage(message);
    setReplyTo(null);
    setDraft(message.content);
    setActionMessage(null);
  }, [setDraft, setEditingMessage, setReplyTo]);

  const beginForward = useCallback((items: Message[]) => {
    const valid = items.filter(message => !message.isDeleted);
    if (!valid.length) return;
    setForwardMessages(valid.slice(0, 50));
    setSelectedMessageIds([]);
    setActionMessage(null);
  }, []);

  const forwardToConversation = useCallback(async (target: Conversation | Conversation[]) => {
    if (!token || !forwardMessages.length) return;
    const targets = (Array.isArray(target) ? target : [target])
      .filter((conversation, index, items) => conversation?.id && items.findIndex(item => item.id === conversation.id) === index)
      .slice(0, MAX_FORWARD_TARGETS);
    if (!targets.length) {
      setNotice('Choisissez au moins un contact.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const socket = ensureNativeSocket(token);
      let sentCount = 0;
      for (const conversation of targets) {
        for (const message of forwardMessages) {
          const clientMessageId = `local-forward-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          let forwarded: Message;
          try {
            forwarded = await socketAck<Message>(socket, 'message:send', {
              conversationId: conversation.id,
              content: message.content,
              type: message.type,
              clientMessageId,
              clientSentAt: new Date().toISOString(),
            });
          } catch (error) {
            if (socket.connected) throw error;
            forwarded = await api.sendMessage(conversation.id, token, message.content, message.type, undefined, clientMessageId);
          }
          sentCount += 1;
          if (selected?.id === conversation.id) upsertMessage({ ...forwarded, status: forwarded.status || 'sent' });
        }
      }
      setForwardMessages([]);
      await refreshConversations();
      const targetLabel = targets.length > 1 ? `${targets.length} contacts` : conversationNameForNotice(targets[0]);
      setNotice(`${sentCount} transfert${sentCount > 1 ? 's' : ''} envoyé${sentCount > 1 ? 's' : ''} vers ${targetLabel}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Transfert impossible.');
    } finally {
      setBusy(false);
    }
  }, [forwardMessages, refreshConversations, selected?.id, setBusy, setNotice, token, upsertMessage]);

  const deleteSelectedOwnMessages = useCallback(() => {
    if (!selectedMessages.length) return;
    const own = selectedMessages.filter(message => message.senderId === currentUserId && !message.isDeleted);
    const valid = selectedMessages.filter(message => !message.isDeleted);
    const hideForMe = () => {
      const ids = valid.map(message => message.id);
      const conversationIds = new Set(valid.map(message => message.conversationId).filter(Boolean));
      valid.forEach(message => markMessageDeleted(message.conversationId, message.id));
      valid.forEach(message => removeLocalGalleryItem(message.id).catch(() => null));
      Promise.all([...conversationIds].map(conversationId => hideMessagesForMe(
        conversationId,
        ids.filter(id => valid.some(message => message.id === id && message.conversationId === conversationId)),
        ownerId || currentUserId,
      )))
        .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression locale impossible.'));
      setSelectedMessageIds([]);
      setNotice(valid.length > 1 ? 'Messages supprimés pour moi.' : 'Message supprimé pour moi.');
    };
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer pour moi', style: 'destructive', onPress: hideForMe },
    ];
    if (own.length) {
      buttons.push({
        text: own.length === valid.length ? 'Supprimer pour tous' : `Supprimer pour tous (${own.length})`,
        style: 'destructive',
        onPress: () => {
          own.forEach(message => deleteOwnMessage(message));
          setSelectedMessageIds([]);
        },
      });
    }
    Alert.alert('Supprimer', `${valid.length} message(s) sélectionné(s).`, buttons);
  }, [currentUserId, deleteOwnMessage, markMessageDeleted, ownerId, selectedMessages, setNotice]);

  const deleteOwnMessageWithConfirm = useCallback((message: Message) => {
    setActionMessage(null);
    Alert.alert('Supprimer', 'Supprimer ce message pour tous les participants ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer pour tous',
        style: 'destructive',
        onPress: () => deleteOwnMessage(message),
      },
    ]);
  }, [deleteOwnMessage]);

  const openMessageActions = useCallback((message: Message) => {
    setActionMessage(message);
  }, []);

  return {
    selectedMessageIds,
    selectedMessages,
    forwardMessages,
    actionMessage,
    quickReactions: QUICK_REACTIONS,
    clearMessageSelection,
    clearForwardMessages,
    closeMessageActions,
    resetMessageActions,
    reactToMessage,
    replyToMessage,
    copyMessage,
    editMessage,
    deleteMessageForMe,
    deleteOwnMessageWithConfirm,
    toggleMessageSelection,
    shareMessages,
    beginForward,
    forwardToConversation,
    deleteSelectedOwnMessages,
    openMessageActions,
  };
}

function conversationNameForNotice(conversation: Conversation) {
  const name = conversation.name || conversation.participants?.find(participant => participant.name)?.name || conversation.participants?.find(participant => participant.username)?.username;
  return name || 'ce contact';
}
