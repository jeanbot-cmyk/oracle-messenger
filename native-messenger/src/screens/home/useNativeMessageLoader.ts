import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type RefValue<T> = { current: T };

type UseNativeMessageLoaderParams = {
  token?: string;
  currentUserId?: string;
  selected: Conversation | null;
  messages: Message[];
  sessionRef: RefValue<AuthSession | null>;
  resetMessageActions: () => void;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
  setActiveTab: Dispatch<SetStateAction<NativeTabKey>>;
  setBusy: (busy: boolean) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setMessageSearch: (search: string) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setNotice: (message: string) => void;
  setSelected: (conversation: Conversation | null) => void;
};

export function useNativeMessageLoader({
  token,
  currentUserId,
  selected,
  messages,
  sessionRef,
  resetMessageActions,
  runMediaSync,
  setActiveTab,
  setBusy,
  setConversations,
  setMessageSearch,
  setMessages,
  setNotice,
  setSelected,
}: UseNativeMessageLoaderParams) {
  const loadingOlderRef = useRef(false);

  const loadMessages = useCallback(async (conversation: Conversation, activeToken = token) => {
    if (!activeToken) return;
    setActiveTab('chats');
    setSelected(conversation);
    setMessageSearch('');
    resetMessageActions();
    setBusy(true);
    try {
      const socket = ensureNativeSocket(activeToken);
      socket.emit('conversation:join', { conversationId: conversation.id });
      const items = await api.messages(conversation.id, activeToken);
      setMessages(items);
      const lastIncoming = [...items].reverse().find(item => item.senderId !== sessionRef.current?.user.id);
      if (lastIncoming) socket.emit('message:read', { conversationId: conversation.id, messageId: lastIncoming.id });
      setConversations(current => current.map(item => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
      setNotice('');
      runMediaSync(activeToken, currentUserId, items);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Messages indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [
    currentUserId,
    resetMessageActions,
    runMediaSync,
    sessionRef,
    setActiveTab,
    setBusy,
    setConversations,
    setMessageSearch,
    setMessages,
    setNotice,
    setSelected,
    token,
  ]);

  const loadOlderMessages = useCallback(async () => {
    if (!token || !selected || !messages.length || loadingOlderRef.current) return;
    const oldest = messages[0];
    if (!oldest?.createdAt) return;
    loadingOlderRef.current = true;
    try {
      const older = await api.messages(selected.id, token, oldest.createdAt);
      if (!older.length) return;
      setMessages(current => {
        const byId = new Map<string, Message>();
        for (const message of [...older, ...current]) byId.set(message.id, message);
        return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      });
      runMediaSync(token, currentUserId, older);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Chargement des anciens messages impossible.');
    } finally {
      loadingOlderRef.current = false;
    }
  }, [currentUserId, messages, runMediaSync, selected, setMessages, setNotice, token]);

  const openConversationById = useCallback(async (conversationId: string, activeToken = token) => {
    if (!activeToken || !conversationId) return;
    setBusy(true);
    setNotice('');
    try {
      const items = await api.conversations(activeToken);
      setConversations(items);
      const conversation = items.find(item => item.id === conversationId);
      if (!conversation) {
        setActiveTab('chats');
        setSelected(null);
        setNotice('Conversation introuvable ou non autorisee pour ce compte.');
        return;
      }
      await loadMessages(conversation, activeToken);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ouverture conversation impossible.');
    } finally {
      setBusy(false);
    }
  }, [loadMessages, setActiveTab, setBusy, setConversations, setNotice, setSelected, token]);

  const openConversationFromFeature = useCallback((conversation: Conversation) => {
    setActiveTab('chats');
    void loadMessages(conversation);
  }, [loadMessages, setActiveTab]);

  return {
    loadMessages,
    loadOlderMessages,
    openConversationById,
    openConversationFromFeature,
  };
}
