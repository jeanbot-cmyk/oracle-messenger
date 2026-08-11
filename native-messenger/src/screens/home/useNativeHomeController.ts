import { useMemo, useState } from 'react';
import { ANDROID_PACKAGE, NATIVE_BASELINE } from '@/config/env';
import { useNativeCallNotificationRouting } from '@/screens/home/useNativeCallNotificationRouting';
import { useNativeComposerController } from '@/screens/home/useNativeComposerController';
import { useNativeConversationBrowser } from '@/screens/home/useNativeConversationBrowser';
import { useNativeConversationController } from '@/screens/home/useNativeConversationController';
import { useNativeConversationState } from '@/screens/home/useNativeConversationState';
import { useNativeHomeShellProps } from '@/screens/home/useNativeHomeShellProps';
import { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeMediaSyncLifecycle } from '@/screens/home/useNativeMediaSyncLifecycle';
import { useNativeRealtimeEvents } from '@/screens/home/useNativeRealtimeEvents';
import { useNativeSessionLifecycle } from '@/screens/home/useNativeSessionLifecycle';
import { useVisibleTabs } from '@/screens/NativeFeaturePages';
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
  const visibleTabs = useVisibleTabs(session);
  const needsOnboarding = Boolean(session && (session.user.isNew || !session.user.phone));
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

  const headerSubtitle = useMemo(() => {
    if (session?.user?.name) return `${session.user.name} • ${ANDROID_PACKAGE}`;
    return `${ANDROID_PACKAGE} • baseline ${NATIVE_BASELINE}`;
  }, [session?.user?.name]);

  const shellProps = useNativeHomeShellProps({
    session,
    needsOnboarding,
    nativeCall,
    headerSubtitle,
    tabs: visibleTabs,
    activeTab: ui.activeTab,
    notice: ui.notice,
    conversations,
    selected,
    conversationSearch: ui.conversationSearch,
    busy: ui.busy,
    messageSearch: ui.messageSearch,
    messages: visibleMessages,
    localMediaByMessageId,
    composer,
    conversationsController,
    refreshConversations,
    logout,
    setActiveTab: ui.setActiveTab,
    setConversationSearch: ui.setConversationSearch,
    setMessageSearch: ui.setMessageSearch,
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
