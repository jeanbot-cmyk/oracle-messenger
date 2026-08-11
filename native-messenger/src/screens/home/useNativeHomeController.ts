import { useMemo, useState } from 'react';
import { ANDROID_PACKAGE, NATIVE_BASELINE } from '@/config/env';
import { useNativeCall } from '@/hooks/useNativeCall';
import type { NativeHomeShellProps } from '@/screens/home/NativeHomeShell';
import { useNativeComposerController } from '@/screens/home/useNativeComposerController';
import { useNativeConversationBrowser } from '@/screens/home/useNativeConversationBrowser';
import { useNativeConversationController } from '@/screens/home/useNativeConversationController';
import { useNativeConversationState } from '@/screens/home/useNativeConversationState';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeMediaSyncLifecycle } from '@/screens/home/useNativeMediaSyncLifecycle';
import { useNativeNotificationRouting } from '@/screens/home/useNativeNotificationRouting';
import { useNativeRealtimeEvents } from '@/screens/home/useNativeRealtimeEvents';
import { useNativeSessionLifecycle } from '@/screens/home/useNativeSessionLifecycle';
import { usePendingNativeCallAction } from '@/screens/home/usePendingNativeCallAction';
import { type NativeTabKey, useVisibleTabs } from '@/screens/NativeFeaturePages';
import type { AuthSession } from '@/types/messenger';

export function useNativeHomeController() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [activeTab, setActiveTab] = useState<NativeTabKey>('chats');
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
  } = useNativeConversationState({ session, messageSearch });
  const nativeCall = useNativeCall(session);

  const token = session?.token;
  const currentCallId = nativeCall.callInfo?.callId ?? null;
  const answerNativeCall = nativeCall.answerCall;
  const prepareIncomingCall = nativeCall.prepareIncomingCall;
  const visibleTabs = useVisibleTabs(session);
  const needsOnboarding = Boolean(session && (session.user.isNew || !session.user.phone));
  const { localMediaByMessageId, refreshLocalMediaIndex, clearMediaRefreshTimers, runMediaSync } = useNativeMediaSync();
  const { clearPendingCallAction, queuePendingCallAction } = usePendingNativeCallAction({
    answerNativeCall,
    currentCallId,
    onNotice: setNotice,
  });

  const { refreshConversations } = useNativeConversationBrowser({
    activeTab,
    conversationSearch,
    selected,
    token,
    setBusy,
    setConversations,
    setNotice,
  });

  const {
    draft,
    setDraft,
    replyTo,
    setReplyTo,
    editingMessage,
    setEditingMessage,
    presenceText,
    handleDraftChange,
    handleTypingStart,
    handleTypingStop,
    handleUserOnline,
    handleUserOffline,
    send,
    attachImage,
    attachDocument,
    voiceRecording,
    voiceStartedAt,
    toggleVoiceRecording,
    cancelVoiceRecording,
    clearComposerContext,
  } = useNativeComposerController({
    selected,
    token,
    currentUserId: session?.user.id,
    patchMessage,
    refreshConversations,
    upsertMessage,
    setBusy,
    setNotice,
  });

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
  });

  useNativeNotificationRouting({
    session,
    selectedRef,
    currentCallId,
    answerNativeCall,
    prepareIncomingCall,
    clearPendingCallAction,
    queuePendingCallAction,
    openConversationById: conversationsController.openConversationById,
    refreshConversations,
    setActiveTab,
    setSelected,
    setBusy,
    setNotice,
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
    setActiveTab,
    setBusy,
    setConversations,
    setEditingMessage,
    setLoading,
    setMessageSearch,
    setMessages,
    setNotice,
    setReplyTo,
    setSelected,
    setSession,
  });

  const headerSubtitle = useMemo(() => {
    if (session?.user?.name) return `${session.user.name} • ${ANDROID_PACKAGE}`;
    return `${ANDROID_PACKAGE} • baseline ${NATIVE_BASELINE}`;
  }, [session?.user?.name]);

  const shellProps: NativeHomeShellProps | null = !session || needsOnboarding ? null : {
    session,
    nativeCall,
    headerSubtitle,
    tabs: visibleTabs,
    activeTab,
    notice,
    conversations,
    selected,
    conversationSearch,
    busy,
    presenceText,
    messageSearch,
    messages: visibleMessages,
    selectedMessageIds: conversationsController.selectedMessageIds,
    selectedMessages: conversationsController.selectedMessages,
    forwardMessages: conversationsController.forwardMessages,
    localMediaByMessageId,
    draft,
    replyTo,
    editingMessage,
    voiceRecording,
    voiceStartedAt,
    onRefreshConversations: refreshConversations,
    onTabPress: tab => { setActiveTab(tab); if (tab !== 'chats') setSelected(null); },
    onOpenConversationFromFeature: conversationsController.openConversationFromFeature,
    onLogout: logout,
    onBackFromChat: () => setSelected(null),
    onMessageSearchChange: setMessageSearch,
    onShareMessages: conversationsController.shareMessages,
    onBeginForward: conversationsController.beginForward,
    onDeleteSelectedMessages: conversationsController.deleteSelectedOwnMessages,
    onClearMessageSelection: conversationsController.clearMessageSelection,
    onClearForwardMessages: conversationsController.clearForwardMessages,
    onForwardToConversation: conversationsController.forwardToConversation,
    onToggleMessageSelection: conversationsController.toggleMessageSelection,
    onOpenMessageActions: conversationsController.openMessageActions,
    onDraftChange: handleDraftChange,
    onClearComposerContext: clearComposerContext,
    onCancelVoiceRecording: cancelVoiceRecording,
    onAttachImage: attachImage,
    onAttachDocument: attachDocument,
    onToggleVoiceRecording: toggleVoiceRecording,
    onSend: send,
    onConversationSearchChange: setConversationSearch,
    onOpenConversationFromList: conversation => { setActiveTab('chats'); conversationsController.loadMessages(conversation); },
    onConversationActions: conversationsController.openConversationActions,
  };

  return {
    loading,
    session,
    needsOnboarding,
    notice,
    busy,
    completeOnboarding,
    signInWithGoogle,
    logout,
    shellProps,
  };
}
