import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { markConversationReadLocally, sortConversations } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { readCachedConversations, readCachedMessages, writeCachedConversations, writeCachedMessages } from '@/services/nativeConversationCache';
import { filterHiddenMessages } from '@/services/nativeHiddenMessages';
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
    const ownerId = sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken;
    const switchingConversation = selected?.id !== conversation.id;
    setActiveTab('chats');
    if (switchingConversation) {
      setMessages([]);
      setBusy(true);
    }
    setSelected(conversation);
    setMessageSearch('');
    resetMessageActions();
    const cachedMessages = await filterHiddenMessages(conversation.id, await readCachedMessages(ownerId, conversation.id));
    if (cachedMessages.length) {
      setMessages(cachedMessages);
      setNotice('');
    }
    setBusy(!cachedMessages.length);
    try {
      const socket = ensureNativeSocket(activeToken);
      socket.emit('conversation:join', { conversationId: conversation.id });
      const items = await filterHiddenMessages(conversation.id, await api.messages(conversation.id, activeToken));
      setMessages(items);
      await writeCachedMessages(ownerId, conversation.id, items);
      const lastIncoming = [...items].reverse().find(item => item.senderId !== sessionRef.current?.user.id);
      if (lastIncoming) socket.emit('message:read', { conversationId: conversation.id, messageId: lastIncoming.id });
      setConversations(current => sortConversations(current.map(item => item.id === conversation.id ? markConversationReadLocally(item) : item)));
      setNotice('');
      runMediaSync(activeToken, currentUserId, items);
    } catch (error) {
      setNotice(cachedMessages.length
        ? 'Mode hors connexion : messages affichés depuis le téléphone.'
        : error instanceof Error ? error.message : 'Messages indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [
    currentUserId,
    resetMessageActions,
    runMediaSync,
    sessionRef,
    selected?.id,
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
    const ownerId = sessionRef.current?.user.id || sessionRef.current?.user.email || token;
    const oldest = messages[0];
    if (!oldest?.createdAt) return;
    loadingOlderRef.current = true;
    try {
      const older = await filterHiddenMessages(selected.id, await api.messages(selected.id, token, oldest.createdAt));
      if (!older.length) return;
      setMessages(current => {
        const byId = new Map<string, Message>();
        for (const message of [...older, ...current]) byId.set(message.id, message);
        const next = [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        void writeCachedMessages(ownerId, selected.id, next);
        return next;
      });
      runMediaSync(token, currentUserId, older);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Chargement des anciens messages impossible.');
    } finally {
      loadingOlderRef.current = false;
    }
  }, [currentUserId, messages, runMediaSync, selected, sessionRef, setMessages, setNotice, token]);

  const openConversationById = useCallback(async (conversationId: string, activeToken = token) => {
    if (!activeToken || !conversationId) return;
    setBusy(true);
    setNotice('');
    try {
      const items = await api.conversations(activeToken);
      const sortedItems = sortConversations(items);
      setConversations(sortedItems);
      await writeCachedConversations(sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken, sortedItems);
      const conversation = sortedItems.find(item => item.id === conversationId);
      if (!conversation) {
        setActiveTab('chats');
        setSelected(null);
        setNotice('Conversation introuvable ou non autorisee pour ce compte.');
        return;
      }
      await loadMessages(conversation, activeToken);
    } catch (error) {
      const cached = await readCachedConversations(sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken);
      const sortedCached = sortConversations(cached);
      const conversation = sortedCached.find(item => item.id === conversationId);
      if (conversation) {
        await loadMessages(conversation, activeToken);
        setNotice('Mode hors connexion : conversation ouverte depuis le téléphone.');
      } else {
        setNotice(error instanceof Error ? error.message : 'Ouverture conversation impossible.');
      }
    } finally {
      setBusy(false);
    }
  }, [loadMessages, sessionRef, setActiveTab, setBusy, setConversations, setNotice, setSelected, token]);

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
