import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortMessages } from '@/screens/home/homeUtils';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type UseNativeConversationStateParams = {
  session: AuthSession | null;
  messageSearch: string;
};

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

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations(current => {
      const exists = current.some(item => item.id === conversation.id);
      const next = exists
        ? current.map(item => item.id === conversation.id ? { ...item, ...conversation } : item)
        : [conversation, ...current];
      return next.sort((a, b) => new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime());
    });
  }, []);

  const upsertMessage = useCallback((message: Message) => {
    setMessages(current => {
      const active = selectedRef.current;
      if (!active || active.id !== message.conversationId) return current;
      const exists = current.some(item => item.id === message.id);
      return sortMessages(exists ? current.map(item => item.id === message.id ? { ...item, ...message } : item) : [...current, message]);
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
          unreadCount: isCurrentOpen || isOwn ? conversation.unreadCount || 0 : (conversation.unreadCount || 0) + 1,
          updatedAt: message.createdAt || conversation.updatedAt,
        };
      });
      if (!found) return current;
      return next.sort((a, b) => new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime());
    });
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    setConversations(current => current.map(conversation => (
      conversation.lastMessage?.id === id
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, ...patch } }
        : conversation
    )));
  }, []);

  const markMessageDeleted = useCallback((conversationId: string, messageId: string) => {
    setMessages(current => current.map(item => item.id === messageId ? { ...item, isDeleted: true, content: '' } : item));
    setConversations(current => current.map(conversation => (
      conversation.id === conversationId && conversation.lastMessage?.id === messageId
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, isDeleted: true, content: '' } }
        : conversation
    )));
  }, []);

  const visibleMessages = useMemo(() => {
    const needle = messageSearch.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter(message => {
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
