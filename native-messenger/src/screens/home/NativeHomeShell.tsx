import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, PanResponder, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeBottomTabs } from '@/screens/home/NativeBottomTabs';
import { NativeChatPanel } from '@/screens/home/NativeChatPanel';
import { NativeCallOverlay } from '@/screens/home/NativeCallOverlay';
import { NativeConversationList } from '@/screens/home/NativeConversationList';
import { NativeFeatureShell } from '@/screens/home/NativeFeatureShell';
import { NativeHeaderOverflowMenu } from '@/screens/home/NativeHeaderOverflowMenu';
import { NativeHomeShellHeader } from '@/screens/home/NativeHomeShellHeader';
import { isAdminSession, NativeFeaturePage, type NativeTabKey } from '@/screens/NativeFeaturePages';
import type { useNativeCall } from '@/hooks/useNativeCall';
import { api } from '@/services/api';
import { selectionHaptic } from '@/services/haptics';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message } from '@/types/messenger';
import type { VoicePreview } from './useNativeVoiceRecorder';

export type NativeHomeShellProps = {
  session: AuthSession;
  nativeCall: ReturnType<typeof useNativeCall>;
  headerSubtitle: string;
  tabs: { key: NativeTabKey; label: string }[];
  activeTab: NativeTabKey;
  notice: string;
  conversations: Conversation[];
  selected: Conversation | null;
  conversationSearch: string;
  busy: boolean;
  presenceText: string;
  messageSearch: string;
  messages: Message[];
  selectedMessageIds: string[];
  selectedMessages: Message[];
  forwardMessages: Message[];
  localMediaByMessageId: Record<string, LocalGalleryItem>;
  draft: string;
  replyTo: Message | null;
  editingMessage: Message | null;
  voiceRecording: boolean;
  voiceStartedAt: number | null;
  voiceLocked: boolean;
  voicePreview: VoicePreview | null;
  voiceSending: boolean;
  aiBusy: boolean;
  onRefreshConversations: () => Promise<void>;
  onTabPress: (tab: NativeTabKey) => void;
  onOpenConversationFromFeature: (conversation: Conversation) => void;
  onLogout: () => Promise<void>;
  onBackFromChat: () => void;
  onMessageSearchChange: (value: string) => void;
  onShareMessages: (messages: Message[]) => void | Promise<void>;
  onBeginForward: (messages: Message[]) => void;
  onDeleteSelectedMessages: () => void;
  onClearMessageSelection: () => void;
  onClearForwardMessages: () => void;
  onForwardToConversation: (conversation: Conversation) => void | Promise<void>;
  onToggleMessageSelection: (messageId: string) => void;
  onOpenMessageActions: (message: Message) => void;
  onLoadOlderMessages: () => void | Promise<void>;
  onDraftChange: (value: string) => void;
  onClearComposerContext: () => void;
  onCancelVoiceRecording: () => void | Promise<void>;
  onAttachCamera: () => void | Promise<void>;
  onAttachImage: () => void | Promise<void>;
  onAttachDocument: () => void | Promise<void>;
  onStartVoiceRecording: () => void | Promise<void>;
  onStopVoiceRecording: () => void | Promise<unknown>;
  onLockVoiceRecording: () => void;
  onSendVoicePreview: () => void | Promise<void>;
  onAskAiDraft: () => void | Promise<void>;
  onOpenAiTools?: () => void;
  onSend: () => void | Promise<void>;
  onConversationSearchChange: (value: string) => void;
  onOpenConversationFromList: (conversation: Conversation) => void;
  onConversationActions: (conversation: Conversation) => void;
};

const TAB_GROUPS: Partial<Record<NativeTabKey, NativeTabKey>> = {
  storyCamera: 'stories',
  meeting: 'tools',
  translate: 'tools',
  notes: 'tools',
  events: 'tools',
  ai: 'tools',
  flyers: 'tools',
  videos: 'tools',
  contacts: 'menu',
  gallery: 'menu',
  web: 'menu',
  spirituality: 'menu',
  payments: 'menu',
  business: 'menu',
  profile: 'menu',
  admin: 'menu',
};

function rootTabFor(tab: NativeTabKey) {
  return TAB_GROUPS[tab] || tab;
}

const DIRECT_FEATURE_TABS: NativeTabKey[] = ['calls', 'stories', 'tools', 'menu', 'business', 'admin', 'contacts', 'profile'];
const ROOT_HEADER_TABS: NativeTabKey[] = ['chats', 'calls', 'tools', 'menu'];
const HIDDEN_BOTTOM_TABS: NativeTabKey[] = ['profile'];

function usesDirectFeatureLayout(tab: NativeTabKey) {
  return DIRECT_FEATURE_TABS.includes(tab);
}

function usesRootHeader(tab: NativeTabKey) {
  return ROOT_HEADER_TABS.includes(tab);
}

export function NativeHomeShell({
  session,
  nativeCall,
  headerSubtitle,
  tabs,
  activeTab,
  notice,
  conversations,
  selected,
  conversationSearch,
  busy,
  presenceText,
  messageSearch,
  messages,
  selectedMessageIds,
  selectedMessages,
  forwardMessages,
  localMediaByMessageId,
  draft,
  replyTo,
  editingMessage,
  voiceRecording,
  voiceStartedAt,
  voiceLocked,
  voicePreview,
  voiceSending,
  aiBusy,
  onRefreshConversations,
  onTabPress,
  onOpenConversationFromFeature,
  onLogout,
  onBackFromChat,
  onMessageSearchChange,
  onShareMessages,
  onBeginForward,
  onDeleteSelectedMessages,
  onClearMessageSelection,
  onClearForwardMessages,
  onForwardToConversation,
  onToggleMessageSelection,
  onOpenMessageActions,
  onLoadOlderMessages,
  onDraftChange,
  onClearComposerContext,
  onCancelVoiceRecording,
  onAttachCamera,
  onAttachImage,
  onAttachDocument,
  onStartVoiceRecording,
  onStopVoiceRecording,
  onLockVoiceRecording,
  onSendVoicePreview,
  onAskAiDraft,
  onOpenAiTools,
  onSend,
  onConversationSearchChange,
  onOpenConversationFromList,
  onConversationActions,
}: NativeHomeShellProps) {
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const startCallFromPeer = async (peerId: string, type: 'audio' | 'video') => {
    if (!peerId) return;
    const existing = conversations.find(conversation => conversation.type === 'direct' && conversation.participants.some(participant => participant.id === peerId));
    const conversation = existing || await api.createConversation(peerId, session.token);
    void onRefreshConversations().catch(() => undefined);
    await nativeCall.startCall(conversation, type);
  };

  const openAdjacentRootTab = useCallback((direction: 'next' | 'previous') => {
    const visibleTabs = tabs.map(tab => tab.key);
    const currentRoot = rootTabFor(activeTab);
    const currentIndex = visibleTabs.indexOf(currentRoot);
    const nextTab = visibleTabs[direction === 'next' ? currentIndex + 1 : currentIndex - 1];
    if (nextTab) onTabPress(nextTab);
  }, [activeTab, onTabPress, tabs]);

  const handleRootSwipe = useCallback((direction: 'next' | 'previous') => {
    selectionHaptic();
    openAdjacentRootTab(direction);
  }, [openAdjacentRootTab]);

  const rootSwipeGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-42, 42])
    .failOffsetY([-30, 30])
    .onEnd(event => {
      if (Math.abs(event.translationX) > 82 && Math.abs(event.velocityX) > 180) {
        runOnJS(handleRootSwipe)(event.translationX < 0 ? 'next' : 'previous');
      }
    }), [handleRootSwipe]);

  const tabSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 72 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35
    ),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > 86 && Math.abs(gesture.dy) < 54) {
        selectionHaptic();
        openAdjacentRootTab(gesture.dx < 0 ? 'next' : 'previous');
      }
    },
  }), [openAdjacentRootTab]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (headerMenuOpen) {
        setHeaderMenuOpen(false);
        return true;
      }
      if (nativeCall.callState !== 'idle') return true;
      if (selectedMessageIds.length) {
        onClearMessageSelection();
        return true;
      }
      if (forwardMessages.length) {
        onClearForwardMessages();
        return true;
      }
      if (activeTab === 'chats' && selected) {
        onBackFromChat();
        return true;
      }
      if (activeTab !== 'chats') {
        onTabPress('chats');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [
    activeTab,
    forwardMessages.length,
    headerMenuOpen,
    nativeCall.callState,
    onBackFromChat,
    onClearForwardMessages,
    onClearMessageSelection,
    onTabPress,
    selected,
    selectedMessageIds.length,
  ]);

  return (
    <SafeAreaView edges={['top']} style={styles.app}>
      <StatusBar
        style="dark"
        backgroundColor={colors.surface}
        translucent={false}
      />
      <NativeCallOverlay call={nativeCall} conversation={selected} currentUserId={session.user.id} />
      <NativeHeaderOverflowMenu
        visible={headerMenuOpen}
        isAdmin={isAdminSession(session)}
        onClose={() => setHeaderMenuOpen(false)}
        onOpenTab={onTabPress}
        onLogout={onLogout}
      />
      {activeTab === 'chats' && selected ? (
        <NativeChatPanel
          conversation={selected}
          conversations={conversations}
          session={session}
          presenceText={presenceText}
          callNotice={nativeCall.callState === 'idle' ? undefined : nativeCall.callNotice}
          notice={notice}
          messageSearch={messageSearch}
          messages={messages}
          selectedMessageIds={selectedMessageIds}
          selectedMessages={selectedMessages}
          forwardMessages={forwardMessages}
          localMediaByMessageId={localMediaByMessageId}
          draft={draft}
          replyTo={replyTo}
          editingMessage={editingMessage}
          voiceRecording={voiceRecording}
          voiceStartedAt={voiceStartedAt}
          voiceLocked={voiceLocked}
          voicePreview={voicePreview}
          voiceSending={voiceSending}
          aiBusy={aiBusy}
          busy={busy}
          onBack={onBackFromChat}
          onStartAudioCall={() => nativeCall.startCall(selected, 'audio')}
          onStartVideoCall={() => nativeCall.startCall(selected, 'video')}
          onCallMessagePress={(type) => nativeCall.startCall(selected, type)}
          onMessageSearchChange={onMessageSearchChange}
          onShare={onShareMessages}
          onBeginForward={onBeginForward}
          onDeleteSelected={onDeleteSelectedMessages}
          onClearSelection={onClearMessageSelection}
          onClearForward={onClearForwardMessages}
          onForwardToConversation={onForwardToConversation}
          onToggleSelection={onToggleMessageSelection}
          onOpenMessageActions={onOpenMessageActions}
          onLoadOlderMessages={onLoadOlderMessages}
          onDraftChange={onDraftChange}
          onClearContext={onClearComposerContext}
          onCancelVoiceRecording={onCancelVoiceRecording}
          onAttachCamera={onAttachCamera}
          onAttachImage={onAttachImage}
          onAttachDocument={onAttachDocument}
          onStartVoiceRecording={onStartVoiceRecording}
          onStopVoiceRecording={onStopVoiceRecording}
          onLockVoiceRecording={onLockVoiceRecording}
          onSendVoicePreview={onSendVoicePreview}
          onAskAiDraft={onAskAiDraft}
          onOpenAiTools={onOpenAiTools || (() => onTabPress('ai'))}
          onSend={onSend}
        />
      ) : (
        <GestureDetector gesture={rootSwipeGesture}>
        <View style={styles.app}>
          {usesRootHeader(activeTab) ? (
            <NativeHomeShellHeader
              title="Oracle Messenger"
              subtitle={headerSubtitle}
              onRefresh={onRefreshConversations}
              onTabPress={onTabPress}
              onMenuPress={() => {
                selectionHaptic();
                setHeaderMenuOpen(true);
              }}
            />
          ) : null}

          {notice ? <Text style={styles.banner}>{notice}</Text> : null}

          {usesDirectFeatureLayout(activeTab) ? (
            <View style={styles.swipePage} {...tabSwipeResponder.panHandlers}>
              <NativeFeaturePage
                tab={activeTab}
                session={session}
                onOpenConversation={onOpenConversationFromFeature}
                onStartCallFromPeer={startCallFromPeer}
                onRefreshConversations={onRefreshConversations}
                onLogout={onLogout}
                onOpenTab={onTabPress}
                onBackToChats={() => onTabPress('chats')}
                callDiagnostics={nativeCall.callDiagnostics}
                onClearCallDiagnostics={nativeCall.clearCallDiagnostics}
                isAdmin={isAdminSession(session)}
              />
            </View>
          ) : activeTab !== 'chats' ? (
            <NativeFeatureShell
              tab={activeTab}
              onBackToChats={() => onTabPress('chats')}
              onSwipeTab={openAdjacentRootTab}
            >
              <NativeFeaturePage
                tab={activeTab}
                session={session}
                onOpenConversation={onOpenConversationFromFeature}
                onStartCallFromPeer={startCallFromPeer}
                onRefreshConversations={onRefreshConversations}
                onLogout={onLogout}
                onOpenTab={onTabPress}
                onBackToChats={() => onTabPress('chats')}
                callDiagnostics={nativeCall.callDiagnostics}
                onClearCallDiagnostics={nativeCall.clearCallDiagnostics}
                isAdmin={isAdminSession(session)}
              />
            </NativeFeatureShell>
          ) : (
            <NativeConversationList
              token={session.token}
              ownerId={session.user.id}
              conversations={conversations}
              search={conversationSearch}
              busy={busy}
              onSearchChange={onConversationSearchChange}
              onOpenConversation={onOpenConversationFromList}
              onConversationActions={onConversationActions}
              onOpenContacts={() => onTabPress('contacts')}
              onGroupChanged={async conversation => {
                await onRefreshConversations();
                onOpenConversationFromList(conversation);
              }}
              onSwipeTab={openAdjacentRootTab}
            />
          )}
          {HIDDEN_BOTTOM_TABS.includes(activeTab) ? null : <NativeBottomTabs tabs={tabs} activeTab={rootTabFor(activeTab)} onTabPress={onTabPress} />}
        </View>
        </GestureDetector>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  swipePage: { flex: 1 },
  banner: { margin: 12, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
});
