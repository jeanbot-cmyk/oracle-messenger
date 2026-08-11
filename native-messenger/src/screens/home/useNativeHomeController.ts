import { useNativeCallNotificationRouting } from '@/screens/home/useNativeCallNotificationRouting';
import { useNativeHomeMessaging } from '@/screens/home/useNativeHomeMessaging';
import { useNativeHomeSessionController } from '@/screens/home/useNativeHomeSessionController';
import { useNativeHomeSessionState } from '@/screens/home/useNativeHomeSessionState';
import { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import { useNativeHomeViewModel } from '@/screens/home/useNativeHomeViewModel';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeMediaSyncLifecycle } from '@/screens/home/useNativeMediaSyncLifecycle';

export function useNativeHomeController() {
  const { session, setSession } = useNativeHomeSessionState();
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

  const { completeOnboarding, signInWithGoogle, logout } = useNativeHomeSessionController({
    messaging,
    ui,
    refreshLocalMediaIndex,
    runMediaSync,
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
