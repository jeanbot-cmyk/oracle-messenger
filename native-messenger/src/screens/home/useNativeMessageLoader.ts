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
  setSelected: Dispatch<SetStateAction<Conversation | null>>;
};

function localUriFromMessage(message?: Message | null) {
  try {
    const parsed = JSON.parse(String(message?.content || ''));
    const localUri = typeof parsed?.localUri === 'string' ? parsed.localUri.trim() : '';
    return /^(file|content):\/\//i.test(localUri) ? localUri : '';
  } catch {
    return '';
  }
}

function addLocalUriToMessage(message: Message, localUri: string) {
  if (!localUri) return message;
  try {
    const parsed = JSON.parse(message.content);
    if (!parsed || typeof parsed !== 'object') return message;
    return { ...message, content: JSON.stringify({ ...parsed, localUri }) };
  } catch {
    return message;
  }
}

function mergeMessagesKeepingLocalMedia(localCandidates: Message[], serverMessages: Message[]) {
  const localUrisById = new Map<string, string>();
  for (const message of localCandidates) {
    const localUri = localUriFromMessage(message);
    if (localUri) localUrisById.set(message.id, localUri);
  }
  return serverMessages.map(message => (
    localUriFromMessage(message) ? message : addLocalUriToMessage(message, localUrisById.get(message.id) || '')
  ));
}

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

  const applyConversationSummary = useCallback((conversation: Conversation, activeToken: string) => {
    const ownerId = sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken;
    setConversations(current => {
      const next = current.some(item => item.id === conversation.id)
        ? current.map(item => item.id === conversation.id ? conversation : item)
        : [conversation, ...current];
      const sorted = sortConversations(next);
      void writeCachedConversations(ownerId, sorted);
      return sorted;
    });
    setSelected(current => current?.id === conversation.id ? { ...current, ...conversation } : current);
  }, [sessionRef, setConversations, setSelected]);

  const refreshConversationSummary = useCallback(async (conversationId: string, activeToken: string) => {
    const summary = await api.conversation(conversationId, activeToken);
    applyConversationSummary(summary, activeToken);
  }, [applyConversationSummary]);

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
      const localCandidates = selected?.id === conversation.id ? [...messages, ...cachedMessages] : cachedMessages;
      const mergedItems = mergeMessagesKeepingLocalMedia(localCandidates, items);
      setMessages(mergedItems);
      await writeCachedMessages(ownerId, conversation.id, mergedItems);
      const lastIncoming = [...mergedItems].reverse().find(item => item.senderId !== sessionRef.current?.user.id);
      let markReadPromise: Promise<unknown>;
      if (lastIncoming) {
        socket.emit('message:read', { conversationId: conversation.id, messageId: lastIncoming.id });
        markReadPromise = api.markConversationRead(conversation.id, activeToken, lastIncoming.id)
          .then(updates => {
            if (!updates?.length) return;
            setMessages(current => current.map(message => {
              const update = updates.find(item => item.id === message.id);
              return update ? { ...message, status: update.status || message.status, updatedAt: update.updatedAt || message.updatedAt } : message;
            }));
          });
      } else {
        markReadPromise = api.markConversationRead(conversation.id, activeToken);
      }
      setConversations(current => sortConversations(current.map(item => item.id === conversation.id ? markConversationReadLocally(item) : item)));
      await markReadPromise.catch(() => undefined);
      await refreshConversationSummary(conversation.id, activeToken).catch(() => undefined);
      setNotice('');
      runMediaSync(activeToken, currentUserId, mergedItems);
    } catch (error) {
      setNotice(cachedMessages.length
        ? 'Mode hors connexion : messages affichés depuis le téléphone.'
        : error instanceof Error ? error.message : 'Messages indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [
    currentUserId,
    messages,
    resetMessageActions,
    runMediaSync,
    sessionRef,
    selected?.id,
    refreshConversationSummary,
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
