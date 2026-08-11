import { useMemo, useState } from 'react';
import { ANDROID_PACKAGE, NATIVE_BASELINE } from '@/config/env';
import { useNativeCall } from '@/hooks/useNativeCall';
import { NativeHomeShell } from '@/screens/home/NativeHomeShell';
import { NativeLoginScreen } from '@/screens/home/NativeLoginScreen';
import { NativeLoadingScreen } from '@/screens/home/NativeLoadingScreen';
import { NativeOnboarding } from '@/screens/home/NativeOnboarding';
import { useNativeComposerController } from '@/screens/home/useNativeComposerController';
import { useNativeConversationActions } from '@/screens/home/useNativeConversationActions';
import { useNativeConversationBrowser } from '@/screens/home/useNativeConversationBrowser';
import { useNativeConversationState } from '@/screens/home/useNativeConversationState';
import { useNativeMessageActions } from '@/screens/home/useNativeMessageActions';
import { useNativeMessageLoader } from '@/screens/home/useNativeMessageLoader';
import { usePendingNativeCallAction } from '@/screens/home/usePendingNativeCallAction';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeMediaSyncLifecycle } from '@/screens/home/useNativeMediaSyncLifecycle';
import { useNativeNotificationRouting } from '@/screens/home/useNativeNotificationRouting';
import { useNativeRealtimeEvents } from '@/screens/home/useNativeRealtimeEvents';
import { useNativeSessionLifecycle } from '@/screens/home/useNativeSessionLifecycle';
import { type NativeTabKey, useVisibleTabs } from '@/screens/NativeFeaturePages';
import type { AuthSession } from '@/types/messenger';

export function NativeHomeScreen() {
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

  const {
    selectedMessageIds,
    selectedMessages,
    forwardMessages,
    clearMessageSelection,
    clearForwardMessages,
    resetMessageActions,
    toggleMessageSelection,
    shareMessages,
    beginForward,
    forwardToConversation,
    deleteSelectedOwnMessages,
    openMessageActions,
  } = useNativeMessageActions({
    messages,
    selected,
    token,
    currentUserId: session?.user.id,
    refreshConversations,
    markMessageDeleted,
    upsertMessage,
    setBusy,
    setNotice,
    setReplyTo,
    setEditingMessage,
    setDraft,
  });

  const { loadMessages, openConversationById, openConversationFromFeature } = useNativeMessageLoader({
    token,
    currentUserId: session?.user.id,
    sessionRef,
    resetMessageActions,
    runMediaSync,
    setActiveTab,
    setBusy,
    setConversations,
    setMessageSearch,
    setMessages,
    setNotice,
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
    openConversationById,
    refreshConversations,
    setActiveTab,
    setSelected,
    setBusy,
    setNotice,
  });

  const { openConversationActions } = useNativeConversationActions({
    token,
    selectedId: selected?.id,
    loadMessages,
    refreshConversations,
    setActiveTab,
    setBusy,
    setNotice,
    setSelected,
    setMessages,
    setConversations,
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
    resetMessageActions,
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

  if (loading) {
    return <NativeLoadingScreen />;
  }

  if (!session) {
    return <NativeLoginScreen notice={notice} busy={busy} onSignIn={signInWithGoogle} />;
  }

  if (needsOnboarding) {
    return (
      <NativeOnboarding
        session={session}
        onComplete={completeOnboarding}
        onLogout={logout}
      />
    );
  }

  return (
    <NativeHomeShell
      session={session}
      nativeCall={nativeCall}
      headerSubtitle={headerSubtitle}
      tabs={visibleTabs}
      activeTab={activeTab}
      notice={notice}
      conversations={conversations}
      selected={selected}
      conversationSearch={conversationSearch}
      busy={busy}
      presenceText={presenceText}
      messageSearch={messageSearch}
      messages={visibleMessages}
      selectedMessageIds={selectedMessageIds}
      selectedMessages={selectedMessages}
      forwardMessages={forwardMessages}
      localMediaByMessageId={localMediaByMessageId}
      draft={draft}
      replyTo={replyTo}
      editingMessage={editingMessage}
      voiceRecording={voiceRecording}
      voiceStartedAt={voiceStartedAt}
      onRefreshConversations={refreshConversations}
      onTabPress={tab => { setActiveTab(tab); if (tab !== 'chats') setSelected(null); }}
      onOpenConversationFromFeature={openConversationFromFeature}
      onLogout={logout}
      onBackFromChat={() => setSelected(null)}
      onMessageSearchChange={setMessageSearch}
      onShareMessages={shareMessages}
      onBeginForward={beginForward}
      onDeleteSelectedMessages={deleteSelectedOwnMessages}
      onClearMessageSelection={clearMessageSelection}
      onClearForwardMessages={clearForwardMessages}
      onForwardToConversation={forwardToConversation}
      onToggleMessageSelection={toggleMessageSelection}
      onOpenMessageActions={openMessageActions}
      onDraftChange={handleDraftChange}
      onClearComposerContext={clearComposerContext}
      onCancelVoiceRecording={cancelVoiceRecording}
      onAttachImage={attachImage}
      onAttachDocument={attachDocument}
      onToggleVoiceRecording={toggleVoiceRecording}
      onSend={send}
      onConversationSearchChange={setConversationSearch}
      onOpenConversationFromList={conversation => { setActiveTab('chats'); loadMessages(conversation); }}
      onConversationActions={openConversationActions}
    />
  );
}
