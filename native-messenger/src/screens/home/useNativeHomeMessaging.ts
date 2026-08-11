import { useNativeComposerController } from '@/screens/home/useNativeComposerController';
import { useNativeConversationBrowser } from '@/screens/home/useNativeConversationBrowser';
import { useNativeConversationController } from '@/screens/home/useNativeConversationController';
import { useNativeConversationState } from '@/screens/home/useNativeConversationState';
import type { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import { useNativeRealtimeEvents } from '@/screens/home/useNativeRealtimeEvents';
import type { AuthSession, Message } from '@/types/messenger';

type NativeHomeUiState = ReturnType<typeof useNativeHomeUiState>;

type UseNativeHomeMessagingParams = {
  session: AuthSession | null;
  ui: NativeHomeUiState;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
};

export function useNativeHomeMessaging({ session, ui, runMediaSync }: UseNativeHomeMessagingParams) {
  const {
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
  } = useNativeConversationState({ session, messageSearch: ui.messageSearch });

  const token = session?.token;

  const { refreshConversations } = useNativeConversationBrowser({
    activeTab: ui.activeTab,
    conversationSearch: ui.conversationSearch,
    selected,
    token,
    setBusy: ui.setBusy,
    setConversations,
    setNotice: ui.setNotice,
  });

  const composer = useNativeComposerController({
    selected,
    token,
    currentUserId: session?.user.id,
    patchMessage,
    refreshConversations,
    upsertMessage,
    setBusy: ui.setBusy,
    setNotice: ui.setNotice,
  });

  const {
    setDraft,
    setReplyTo,
    setEditingMessage,
    handleTypingStart,
    handleTypingStop,
    handleUserOnline,
    handleUserOffline,
  } = composer;

  useNativeRealtimeEvents({
    session,
    selectedRef,
    sessionRef,
    upsertMessage,
    upsertConversation,
    patchMessage,
    markMessageDeleted,
    setConversations,
    setMessages,
    runMediaSync,
    handleTypingStart,
    handleTypingStop,
    handleUserOnline,
    handleUserOffline,
  });

  const conversationsController = useNativeConversationController({
    messages,
    selected,
    token,
    currentUserId: session?.user.id,
    sessionRef,
    refreshConversations,
    markMessageDeleted,
    upsertMessage,
    runMediaSync,
    setActiveTab: ui.setActiveTab,
    setBusy: ui.setBusy,
    setConversations,
    setDraft,
    setEditingMessage,
    setMessageSearch: ui.setMessageSearch,
    setMessages,
    setNotice: ui.setNotice,
    setReplyTo,
    setSelected,
  });

  return {
    conversations,
    setConversations,
    selected,
    setSelected,
    setMessages,
    selectedRef,
    visibleMessages,
    composer,
    conversationsController,
    refreshConversations,
  };
}
