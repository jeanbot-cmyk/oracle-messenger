import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isOfficialExpired, mergeMessagePatch, mergeMessageStatus, sortConversations, sortMessages } from '@/screens/home/homeUtils';
import { writeCachedConversations, writeCachedMessages } from '@/services/nativeConversationCache';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type UseNativeConversationStateParams = {
  session: AuthSession | null;
  messageSearch: string;
};

function mergeMessageKeepingLocalMedia(current: Message, incoming: Message): Message {
  const localUri = localUriFromContent(current.content);
  if (!localUri || localUriFromContent(incoming.content)) {
    return { ...current, ...incoming, status: mergeMessageStatus(current.status, incoming.status) };
  }
  const mergedContent = addLocalUriToContent(incoming.content, localUri);
  return { ...current, ...incoming, content: mergedContent, status: mergeMessageStatus(current.status, incoming.status) };
}

function localUriFromContent(content?: string | null) {
  try {
    const parsed = JSON.parse(String(content || ''));
    const localUri = typeof parsed?.localUri === 'string' ? parsed.localUri.trim() : '';
    return /^(file|content):\/\//i.test(localUri) ? localUri : '';
  } catch {
    return '';
  }
}

function addLocalUriToContent(content: string, localUri: string) {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') return content;
    return JSON.stringify({ ...parsed, localUri });
  } catch {
    return content;
  }
}

export function useNativeConversationState({ session, messageSearch }: UseNativeConversationStateParams) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const selectedRef = useRef<Conversation | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const ownerId = session?.user.id || session?.user.email || session?.token;
    if (!ownerId || !selected?.id || !messages.length) return;
    void writeCachedMessages(ownerId, selected.id, messages);
  }, [messages, selected?.id, session?.token, session?.user.email, session?.user.id]);

  useEffect(() => {
    const ownerId = session?.user.id || session?.user.email || session?.token;
    if (!ownerId || !conversations.length) return;
    void writeCachedConversations(ownerId, sortConversations(conversations));
  }, [conversations, session?.token, session?.user.email, session?.user.id]);

  useEffect(() => {
    const expiries = conversations
      .filter(conversation => !conversation.unreadCount && conversation.officialExpiresAt)
      .map(conversation => new Date(conversation.officialExpiresAt || '').getTime())
      .filter(Number.isFinite);
    if (!expiries.length) return;

    const nextExpiry = Math.min(...expiries);
    const delay = Math.max(0, nextExpiry - Date.now() + 250);
    const timer = setTimeout(() => {
      setConversations(current => {
        if (!current.some(isOfficialExpired)) return current;
        const next = sortConversations(current);
        if (next.length === current.length && next.every((item, index) => item === current[index])) return current;
        return next;
      });
    }, Math.min(delay, 2_147_483_647));

    return () => clearTimeout(timer);
  }, [conversations]);

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations(current => {
      const exists = current.some(item => item.id === conversation.id);
      const next = exists
        ? current.map(item => {
            if (item.id !== conversation.id) return item;
            const lastMessage = item.lastMessage && conversation.lastMessage?.id === item.lastMessage.id
              ? mergeMessageKeepingLocalMedia(item.lastMessage, conversation.lastMessage)
              : conversation.lastMessage;
            return { ...item, ...conversation, lastMessage };
          })
        : [conversation, ...current];
      return sortConversations(next);
    });
  }, []);

  const upsertMessage = useCallback((message: Message) => {
    setMessages(current => {
      const active = selectedRef.current;
      if (!active || active.id !== message.conversationId) return current;
      const exists = current.some(item => item.id === message.id);
      return sortMessages(exists ? current.map(item => item.id === message.id ? mergeMessageKeepingLocalMedia(item, message) : item) : [...current, message]);
    });
    setConversations(current => {
      let found = false;
      const next = current.map(conversation => {
        if (conversation.id !== message.conversationId) return conversation;
        found = true;
        const isCurrentOpen = selectedRef.current?.id === message.conversationId;
        const isOwn = message.senderId === sessionRef.current?.user.id;
        const sameLastMessage = conversation.lastMessage?.id === message.id;
        return {
          ...conversation,
          lastMessage: sameLastMessage && conversation.lastMessage
            ? mergeMessageKeepingLocalMedia(conversation.lastMessage, message)
            : message,
          unreadCount: isCurrentOpen || isOwn ? 0 : sameLastMessage ? conversation.unreadCount : (conversation.unreadCount || 0) + 1,
          updatedAt: message.createdAt || conversation.updatedAt,
        };
      });
      if (!found) return current;
      return sortConversations(next);
    });
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages(current => {
      const patched = current.map(item => item.id === id ? mergeMessagePatch(item, patch) : item);
      if (!patch.id || patch.id === id) return patched;
      const seenIds = new Set<string>();
      const deduped: Message[] = [];
      for (let index = patched.length - 1; index >= 0; index -= 1) {
        const item = patched[index];
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        deduped.unshift(item);
      }
      return deduped;
    });
    setConversations(current => current.map(conversation => (
      conversation.lastMessage?.id === id
        ? { ...conversation, lastMessage: mergeMessagePatch(conversation.lastMessage, patch) }
        : conversation
    )));
  }, []);

  const markMessageDeleted = useCallback((conversationId: string, messageId: string) => {
    setMessages(current => current.filter(item => item.id !== messageId));
    setConversations(current => current.map(conversation => (
      conversation.id === conversationId && conversation.lastMessage?.id === messageId
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, isDeleted: true, content: 'Ce message a été supprimé' } }
        : conversation
    )));
  }, []);

  const visibleMessages = useMemo(() => {
    const needle = messageSearch.trim().toLowerCase();
    const availableMessages = messages.filter(message => !message.isDeleted);
    if (!needle) return availableMessages;
    return availableMessages.filter(message => {
      const haystack = [
        message.content,
        message.sender?.name,
        message.type,
        message.replyTo?.content,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [messageSearch, messages]);

  return {
    conversations,
    setConversations,
    selected,
    setSelected,
    messages,
    setMessages,
    selectedRef,
    sessionRef,
    upsertConversation,
    upsertMessage,
    patchMessage,
    markMessageDeleted,
    visibleMessages,
  };
}
