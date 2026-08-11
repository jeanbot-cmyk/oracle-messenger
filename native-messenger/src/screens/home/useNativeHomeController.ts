import { useState } from 'react';
import { useNativeCallNotificationRouting } from '@/screens/home/useNativeCallNotificationRouting';
import { useNativeComposerController } from '@/screens/home/useNativeComposerController';
import { useNativeConversationBrowser } from '@/screens/home/useNativeConversationBrowser';
import { useNativeConversationController } from '@/screens/home/useNativeConversationController';
import { useNativeConversationState } from '@/screens/home/useNativeConversationState';
import { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import { useNativeHomeViewModel } from '@/screens/home/useNativeHomeViewModel';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeMediaSyncLifecycle } from '@/screens/home/useNativeMediaSyncLifecycle';
import { useNativeRealtimeEvents } from '@/screens/home/useNativeRealtimeEvents';
import { useNativeSessionLifecycle } from '@/screens/home/useNativeSessionLifecycle';
import type { AuthSession } from '@/types/messenger';

export function useNativeHomeController() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const ui = useNativeHomeUiState();
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
  const { localMediaByMessageId, refreshLocalMediaIndex, clearMediaRefreshTimers, runMediaSync } = useNativeMediaSync();

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
    cancelVoiceRecording,
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

  const nativeCall = useNativeCallNotificationRouting({
    session,
    selectedRef,
    openConversationById: conversationsController.openConversationById,
    refreshConversations,
    setActiveTab: ui.setActiveTab,
    setSelected,
    setBusy: ui.setBusy,
    setNotice: ui.setNotice,
  });

  useNativeMediaSyncLifecycle({
    session,
    refreshLocalMediaIndex,
    clearMediaRefreshTimers,
    runMediaSync,
  });

  const { completeOnboarding, signInWithGoogle, logout } = useNativeSessionLifecycle({
    cancelVoiceRecording,
    refreshConversations,
    refreshLocalMediaIndex,
    resetMessageActions: conversationsController.resetMessageActions,
    runMediaSync,
    setActiveTab: ui.setActiveTab,
    setBusy: ui.setBusy,
    setConversations,
    setEditingMessage,
    setLoading: ui.setLoading,
    setMessageSearch: ui.setMessageSearch,
    setMessages,
    setNotice: ui.setNotice,
    setReplyTo,
    setSelected,
    setSession,
  });

  const { needsOnboarding, shellProps } = useNativeHomeViewModel({
    session,
    nativeCall,
    conversations,
    selected,
    visibleMessages,
    localMediaByMessageId,
    composer,
    conversationsController,
    refreshConversations,
    logout,
    ui,
    setSelected,
  });

  return {
    loading: ui.loading,
    session,
    needsOnboarding,
    notice: ui.notice,
    busy: ui.busy,
    completeOnboarding,
    signInWithGoogle,
    logout,
    shellProps,
  };
}
