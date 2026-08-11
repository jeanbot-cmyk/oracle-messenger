import type { Dispatch, SetStateAction } from 'react';
import type { useNativeHomeMessaging } from '@/screens/home/useNativeHomeMessaging';
import type { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import { useNativeSessionLifecycle } from '@/screens/home/useNativeSessionLifecycle';
import type { AuthSession, Message } from '@/types/messenger';

type NativeHomeMessaging = ReturnType<typeof useNativeHomeMessaging>;
type NativeHomeUiState = ReturnType<typeof useNativeHomeUiState>;

type UseNativeHomeSessionControllerParams = {
  messaging: NativeHomeMessaging;
  ui: NativeHomeUiState;
  refreshLocalMediaIndex: () => Promise<void>;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
  setSession: Dispatch<SetStateAction<AuthSession | null>>;
};

export function useNativeHomeSessionController({
  messaging,
  ui,
  refreshLocalMediaIndex,
  runMediaSync,
  setSession,
}: UseNativeHomeSessionControllerParams) {
  return useNativeSessionLifecycle({
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
}
