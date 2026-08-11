import { useState } from 'react';
import { useNativeCallNotificationRouting } from '@/screens/home/useNativeCallNotificationRouting';
import { useNativeHomeMessaging } from '@/screens/home/useNativeHomeMessaging';
import { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import { useNativeHomeViewModel } from '@/screens/home/useNativeHomeViewModel';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeMediaSyncLifecycle } from '@/screens/home/useNativeMediaSyncLifecycle';
import { useNativeSessionLifecycle } from '@/screens/home/useNativeSessionLifecycle';
import type { AuthSession } from '@/types/messenger';

export function useNativeHomeController() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const ui = useNativeHomeUiState();
  const { localMediaByMessageId, refreshLocalMediaIndex, clearMediaRefreshTimers, runMediaSync } = useNativeMediaSync();
  const messaging = useNativeHomeMessaging({
    session,
    ui,
    runMediaSync,
  });

  const nativeCall = useNativeCallNotificationRouting({
    session,
    selectedRef: messaging.selectedRef,
    openConversationById: messaging.conversationsController.openConversationById,
    refreshConversations: messaging.refreshConversations,
    setActiveTab: ui.setActiveTab,
    setSelected: messaging.setSelected,
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
    cancelVoiceRecording: messaging.composer.cancelVoiceRecording,
    refreshConversations: messaging.refreshConversations,
    refreshLocalMediaIndex,
    resetMessageActions: messaging.conversationsController.resetMessageActions,
    runMediaSync,
    setActiveTab: ui.setActiveTab,
    setBusy: ui.setBusy,
    setConversations: messaging.setConversations,
    setEditingMessage: messaging.composer.setEditingMessage,
    setLoading: ui.setLoading,
    setMessageSearch: ui.setMessageSearch,
    setMessages: messaging.setMessages,
    setNotice: ui.setNotice,
    setReplyTo: messaging.composer.setReplyTo,
    setSelected: messaging.setSelected,
    setSession,
  });

  const { needsOnboarding, shellProps } = useNativeHomeViewModel({
    session,
    nativeCall,
    conversations: messaging.conversations,
    selected: messaging.selected,
    visibleMessages: messaging.visibleMessages,
    localMediaByMessageId,
    composer: messaging.composer,
    conversationsController: messaging.conversationsController,
    refreshConversations: messaging.refreshConversations,
    logout,
    ui,
    setSelected: messaging.setSelected,
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
