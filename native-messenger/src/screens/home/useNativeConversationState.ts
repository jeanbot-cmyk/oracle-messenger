import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortConversations, sortMessages } from '@/screens/home/homeUtils';
import { writeCachedMessages } from '@/services/nativeConversationCache';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type UseNativeConversationStateParams = {
  session: AuthSession | null;
  messageSearch: string;
};

function mergeMessageKeepingLocalMedia(current: Message, incoming: Message): Message {
  const localUri = localUriFromContent(current.content);
  if (!localUri || localUriFromContent(incoming.content)) return { ...current, ...incoming };
  const mergedContent = addLocalUriToContent(incoming.content, localUri);
  return { ...current, ...incoming, content: mergedContent };
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

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations(current => {
      const exists = current.some(item => item.id === conversation.id);
      const next = exists
        ? current.map(item => item.id === conversation.id ? { ...item, ...conversation } : item)
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
        return {
          ...conversation,
          lastMessage: message,
          unreadCount: isCurrentOpen || isOwn ? 0 : (conversation.unreadCount || 0) + 1,
          updatedAt: message.createdAt || conversation.updatedAt,
        };
      });
      if (!found) return current;
      return sortConversations(next);
    });
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages(current => {
      const patched = current.map(item => item.id === id ? { ...item, ...patch } : item);
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
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, ...patch } }
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
