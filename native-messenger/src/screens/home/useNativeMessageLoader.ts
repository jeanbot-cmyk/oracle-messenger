import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { markConversationReadLocally, sortConversations } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { readCachedConversationsAny, readCachedMessagesAny, writeCachedConversations, writeCachedMessages } from '@/services/nativeConversationCache';
import { filterHiddenMessages } from '@/services/nativeHiddenMessages';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { AuthSession, Conversation, Message } from '@/types/messenger';
import { emitDeliveredAcks, latestIncomingMessage } from './nativeMessageReceipts';

type RefValue<T> = { current: T };

type UseNativeMessageLoaderParams = {
  token?: string;
  currentUserId?: string;
  ownerId?: string;
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
  ownerId,
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
  const selectedConversationIdRef = useRef<string | null>(selected?.id ?? null);
  const loadMessagesRequestRef = useRef(0);

  useEffect(() => {
    selectedConversationIdRef.current = selected?.id ?? null;
  }, [selected?.id]);

  const applyConversationSummary = useCallback((conversation: Conversation, activeToken: string) => {
    const cacheOwnerId = ownerId || sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken;
    const normalizedConversation = selectedConversationIdRef.current === conversation.id
      ? markConversationReadLocally(conversation)
      : conversation;
    setConversations(current => {
      const next = current.some(item => item.id === normalizedConversation.id)
        ? current.map(item => item.id === normalizedConversation.id ? normalizedConversation : item)
        : [normalizedConversation, ...current];
      const sorted = sortConversations(next);
      void writeCachedConversations(cacheOwnerId, sorted);
      return sorted;
    });
    setSelected(current => current?.id === normalizedConversation.id ? { ...current, ...normalizedConversation } : current);
  }, [ownerId, sessionRef, setConversations, setSelected]);

  const refreshConversationSummary = useCallback(async (conversationId: string, activeToken: string) => {
    const summary = await api.conversation(conversationId, activeToken);
    applyConversationSummary(summary, activeToken);
  }, [applyConversationSummary]);

  const loadMessages = useCallback(async (conversation: Conversation, activeToken = token) => {
    if (!activeToken) return;
    const requestId = loadMessagesRequestRef.current + 1;
    loadMessagesRequestRef.current = requestId;
    const cacheOwnerId = ownerId || sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken;
    const switchingConversation = selected?.id !== conversation.id;
    setActiveTab('chats');
    const openedConversation = markConversationReadLocally(conversation);
    selectedConversationIdRef.current = conversation.id;
    setMessageSearch('');
    resetMessageActions();
    setSelected(openedConversation);
    setConversations(current => sortConversations(current.map(item => (
      item.id === conversation.id ? markConversationReadLocally(item) : item
    ))));
    if (switchingConversation) {
      setMessages([]);
      setBusy(false);
    }
    const cachedMessages = await filterHiddenMessages(
      conversation.id,
      await readCachedMessagesAny([cacheOwnerId, ownerId, sessionRef.current?.user.id, sessionRef.current?.user.email, activeToken], conversation.id),
      cacheOwnerId,
    );
    if (loadMessagesRequestRef.current !== requestId || selectedConversationIdRef.current !== conversation.id) return;
    if (cachedMessages.length) {
      setMessages(cachedMessages);
      setNotice('');
    } else if (switchingConversation) {
      setMessages([]);
    }
    setBusy(false);
    try {
      const socket = ensureNativeSocket(activeToken);
      socket.emit('conversation:join', { conversationId: conversation.id });
      const items = await filterHiddenMessages(conversation.id, await api.messages(conversation.id, activeToken), cacheOwnerId);
      if (loadMessagesRequestRef.current !== requestId || selectedConversationIdRef.current !== conversation.id) return;
      const localCandidates = selected?.id === conversation.id ? [...messages, ...cachedMessages] : cachedMessages;
      const mergedItems = mergeMessagesKeepingLocalMedia(localCandidates, items);
      setMessages(mergedItems);
      await writeCachedMessages(cacheOwnerId, conversation.id, mergedItems);
      const viewerId = sessionRef.current?.user.id || currentUserId;
      emitDeliveredAcks(socket, mergedItems, viewerId);
      const lastIncoming = latestIncomingMessage(mergedItems, viewerId);
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
      if (loadMessagesRequestRef.current !== requestId || selectedConversationIdRef.current !== conversation.id) return;
      await refreshConversationSummary(conversation.id, activeToken).catch(() => undefined);
      setNotice('');
      void runMediaSync(activeToken, currentUserId, mergedItems);
    } catch (error) {
      if (loadMessagesRequestRef.current !== requestId || selectedConversationIdRef.current !== conversation.id) return;
      setNotice(cachedMessages.length
        ? 'Mode hors connexion : messages affichés depuis le téléphone.'
        : error instanceof Error ? error.message : 'Messages indisponibles.');
    } finally {
      if (loadMessagesRequestRef.current === requestId) setBusy(false);
    }
  }, [
    currentUserId,
    messages,
    ownerId,
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
    const cacheOwnerId = ownerId || sessionRef.current?.user.id || sessionRef.current?.user.email || token;
    const oldest = messages[0];
    if (!oldest?.createdAt) return;
    loadingOlderRef.current = true;
    try {
      const older = await filterHiddenMessages(selected.id, await api.messages(selected.id, token, oldest.createdAt), cacheOwnerId);
      if (!older.length) return;
      setMessages(current => {
        const byId = new Map<string, Message>();
        for (const message of [...older, ...current]) byId.set(message.id, message);
        const next = [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        void writeCachedMessages(cacheOwnerId, selected.id, next);
        return next;
      });
      runMediaSync(token, currentUserId, older);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Chargement des anciens messages impossible.');
    } finally {
      loadingOlderRef.current = false;
    }
  }, [currentUserId, messages, ownerId, runMediaSync, selected, sessionRef, setMessages, setNotice, token]);

  const openConversationById = useCallback(async (conversationId: string, activeToken = token) => {
    if (!activeToken || !conversationId) return;
    setBusy(true);
    setNotice('');
    try {
      const items = await api.conversations(activeToken);
      const sortedItems = sortConversations(items);
      setConversations(sortedItems);
      const cacheOwnerId = ownerId || sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken;
      await writeCachedConversations(cacheOwnerId, sortedItems);
      const conversation = sortedItems.find(item => item.id === conversationId);
      if (!conversation) {
        setActiveTab('chats');
        setSelected(null);
        setNotice('Conversation introuvable ou non autorisee pour ce compte.');
        return;
      }
      await loadMessages(conversation, activeToken);
    } catch (error) {
      const cacheOwnerId = ownerId || sessionRef.current?.user.id || sessionRef.current?.user.email || activeToken;
      const cached = await readCachedConversationsAny([cacheOwnerId, ownerId, sessionRef.current?.user.id, sessionRef.current?.user.email, activeToken]);
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
  }, [loadMessages, ownerId, sessionRef, setActiveTab, setBusy, setConversations, setNotice, setSelected, token]);

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
