import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { conversationName } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { removeLocalGalleryItem } from '@/services/localMedia';
import { clearCachedConversation, readCachedMessages } from '@/services/nativeConversationCache';
import type { Conversation, Message } from '@/types/messenger';

type UseNativeConversationActionsParams = {
  token?: string;
  ownerId?: string;
  selectedId?: string;
  loadMessages: (conversation: Conversation) => void | Promise<void>;
  refreshConversations: () => Promise<void>;
  setActiveTab: (tab: NativeTabKey) => void;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
  setSelected: (conversation: Conversation | null) => void;
  setMessages: (messages: Message[]) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
};

export function useNativeConversationActions({
  token,
  ownerId,
  selectedId,
  loadMessages,
  refreshConversations,
  setActiveTab,
  setBusy,
  setNotice,
  setSelected,
  setMessages,
  setConversations,
}: UseNativeConversationActionsParams) {
  const removeConversationForCurrentUser = useCallback(async (conversation: Conversation) => {
    if (!token) return;
    if (conversation.type === 'group') await api.leaveGroup(token, conversation.id);
    else await api.deleteConversation(conversation.id, token);
    if (selectedId === conversation.id) {
      setSelected(null);
      setMessages([]);
    }
    setConversations(current => current.filter(item => item.id !== conversation.id));
    const owner = ownerId || token;
    const cachedMessages = await readCachedMessages(owner, conversation.id);
    await Promise.all(cachedMessages.map(message => removeLocalGalleryItem(message.id).catch(() => null)));
    await clearCachedConversation(owner, conversation.id);
  }, [ownerId, selectedId, setConversations, setMessages, setSelected, token]);

  const deleteConversation = useCallback((conversation: Conversation) => {
    if (!token) return;
    const isGroup = conversation.type === 'group';
    Alert.alert(
      isGroup ? 'Quitter le groupe' : 'Supprimer la conversation',
      isGroup
        ? `Quitter "${conversationName(conversation)}" ? Vous ne recevrez plus les nouveaux messages du groupe.`
        : `La conversation "${conversationName(conversation)}" sera retirée de ce compte. Les autres participants ne seront pas supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: isGroup ? 'Quitter' : 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setNotice('');
            removeConversationForCurrentUser(conversation)
              .then(refreshConversations)
              .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression conversation impossible.'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }, [refreshConversations, removeConversationForCurrentUser, setBusy, setNotice, token]);

  const deleteConversations = useCallback((conversations: Conversation[]) => {
    if (!token) return;
    const valid = conversations.filter(conversation => conversation.type !== 'official' && !conversation.isOfficial);
    if (!valid.length) {
      setNotice('Aucune conversation supprimable sélectionnée.');
      return;
    }
    Alert.alert(
      'Effacer les conversations',
      `${valid.length} conversation(s) seront retirées de ce compte. Les autres participants ne seront pas supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setNotice('');
            Promise.all(valid.map(conversation => removeConversationForCurrentUser(conversation)))
              .then(refreshConversations)
              .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression des conversations impossible.'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }, [refreshConversations, removeConversationForCurrentUser, setBusy, setNotice, token]);

  const openConversationActions = useCallback((conversation: Conversation) => {
    Alert.alert('Conversation', conversationName(conversation), [
      { text: 'Ouvrir', onPress: () => { setActiveTab('chats'); loadMessages(conversation); } },
      { text: 'Supprimer de mon compte', style: 'destructive', onPress: () => deleteConversation(conversation) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [deleteConversation, loadMessages, setActiveTab]);

  return {
    openConversationActions,
    deleteConversations,
  };
}
