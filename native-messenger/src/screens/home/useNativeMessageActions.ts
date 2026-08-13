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
        removeLocalGalleryItem(message.id).catch(() => null);
        refreshConversations().catch(() => null);
      })
      .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression impossible.'));
  }, [currentUserId, markMessageDeleted, refreshConversations, setNotice, token]);

  const deleteMessageForMe = useCallback((message: Message) => {
    if (!message.conversationId || !message.id) return;
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

  const copyMessage = useCallback(async (message: Message) => {
    const text = message.type === 'text' ? message.content : messagePreview(message);
    if (!text.trim()) return;
    try {
      await Clipboard.setStringAsync(text);
      setNotice('Message copié.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Copie impossible.');
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
        });
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
    const mine = message.senderId === currentUserId;
    const currentReaction = message.reactions?.find(reaction => reaction.userId === currentUserId)?.emoji || '';
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Répondre', onPress: () => { setReplyTo(message); setEditingMessage(null); } },
      ...QUICK_REACTIONS.map(emoji => ({
        text: currentReaction === emoji ? `Retirer ${emoji}` : `Réagir ${emoji}`,
        onPress: () => reactToMessage(message, currentReaction === emoji ? null : emoji),
      })),
      { text: 'Copier', onPress: () => copyMessage(message) },
      { text: 'Sélectionner', onPress: () => toggleMessageSelection(message.id) },
      { text: 'Transférer', onPress: () => beginForward([message]) },
      { text: 'Partager', onPress: () => shareMessages([message]) },
    ];
    if (mine && message.type === 'text' && !message.isDeleted) {
      buttons.push({ text: 'Modifier', onPress: () => { setEditingMessage(message); setReplyTo(null); setDraft(message.content); } });
    }
    if (!message.isDeleted) {
      buttons.push({ text: 'Supprimer pour moi', style: 'destructive', onPress: () => deleteMessageForMe(message) });
    }
    if (mine && !message.isDeleted) {
      buttons.push({ text: 'Supprimer pour tous', style: 'destructive', onPress: () => deleteOwnMessageWithConfirm(message) });
    }
    buttons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Message', messagePreview(message), buttons);
  }, [beginForward, copyMessage, currentUserId, deleteMessageForMe, deleteOwnMessageWithConfirm, reactToMessage, setDraft, setEditingMessage, setReplyTo, shareMessages, toggleMessageSelection]);

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
