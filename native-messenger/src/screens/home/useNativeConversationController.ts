import type { Dispatch, SetStateAction } from 'react';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { useNativeConversationActions } from '@/screens/home/useNativeConversationActions';
import { useNativeMessageActions } from '@/screens/home/useNativeMessageActions';
import { useNativeMessageLoader } from '@/screens/home/useNativeMessageLoader';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type RefValue<T> = { current: T };

type UseNativeConversationControllerParams = {
  messages: Message[];
  selected: Conversation | null;
  token?: string;
  currentUserId?: string;
  sessionRef: RefValue<AuthSession | null>;
  refreshConversations: () => Promise<void>;
  markMessageDeleted: (conversationId: string, messageId: string) => void;
  upsertMessage: (message: Message) => void;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
  setActiveTab: Dispatch<SetStateAction<NativeTabKey>>;
  setBusy: (busy: boolean) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setDraft: (draft: string) => void;
  setEditingMessage: (message: Message | null) => void;
  setMessageSearch: (search: string) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setNotice: (message: string) => void;
  setReplyTo: (message: Message | null) => void;
  setSelected: (conversation: Conversation | null) => void;
};

export function useNativeConversationController({
  messages,
  selected,
  token,
  currentUserId,
  sessionRef,
  refreshConversations,
  markMessageDeleted,
  upsertMessage,
  runMediaSync,
  setActiveTab,
  setBusy,
  setConversations,
  setDraft,
  setEditingMessage,
  setMessageSearch,
  setMessages,
  setNotice,
  setReplyTo,
  setSelected,
}: UseNativeConversationControllerParams) {
  const messageActions = useNativeMessageActions({
    messages,
    selected,
    token,
    currentUserId,
    refreshConversations,
    markMessageDeleted,
    upsertMessage,
    setBusy,
    setNotice,
    setReplyTo,
    setEditingMessage,
    setDraft,
  });

  const messageLoader = useNativeMessageLoader({
    token,
    currentUserId,
    sessionRef,
    resetMessageActions: messageActions.resetMessageActions,
    runMediaSync,
    setActiveTab,
    setBusy,
    setConversations,
    setMessageSearch,
    setMessages,
    setNotice,
    setSelected,
  });

  const conversationActions = useNativeConversationActions({
    token,
    selectedId: selected?.id,
    loadMessages: messageLoader.loadMessages,
    refreshConversations,
    setActiveTab,
    setBusy,
    setNotice,
    setSelected,
    setMessages,
    setConversations,
  });

  return {
    ...messageActions,
    ...messageLoader,
    ...conversationActions,
  };
}
