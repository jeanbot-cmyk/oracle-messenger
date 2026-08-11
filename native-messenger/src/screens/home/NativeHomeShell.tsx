import { SafeAreaView, StyleSheet, Text } from 'react-native';
import { NativeBottomTabs } from '@/screens/home/NativeBottomTabs';
import { NativeChatPanel } from '@/screens/home/NativeChatPanel';
import { NativeCallOverlay } from '@/screens/home/NativeCallOverlay';
import { NativeConversationList } from '@/screens/home/NativeConversationList';
import { NativeHomeShellHeader } from '@/screens/home/NativeHomeShellHeader';
import { NativeFeaturePage, type NativeTabKey } from '@/screens/NativeFeaturePages';
import type { useNativeCall } from '@/hooks/useNativeCall';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

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
  onAttachImage: () => void | Promise<void>;
  onAttachDocument: () => void | Promise<void>;
  onToggleVoiceRecording: () => void | Promise<void>;
  onAskAiDraft: () => void | Promise<void>;
  onSend: () => void | Promise<void>;
  onConversationSearchChange: (value: string) => void;
  onOpenConversationFromList: (conversation: Conversation) => void;
  onConversationActions: (conversation: Conversation) => void;
};

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
  onAttachImage,
  onAttachDocument,
  onToggleVoiceRecording,
  onAskAiDraft,
  onSend,
  onConversationSearchChange,
  onOpenConversationFromList,
  onConversationActions,
}: NativeHomeShellProps) {
  return (
    <SafeAreaView style={styles.app}>
      <NativeCallOverlay call={nativeCall} conversation={selected} currentUserId={session.user.id} />
      {activeTab === 'chats' && selected ? (
        <NativeChatPanel
          conversation={selected}
          conversations={conversations}
          session={session}
          presenceText={presenceText}
          callNotice={nativeCall.callNotice}
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
          aiBusy={aiBusy}
          busy={busy}
          onBack={onBackFromChat}
          onStartAudioCall={() => nativeCall.startCall(selected, 'audio')}
          onStartVideoCall={() => nativeCall.startCall(selected, 'video')}
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
          onAttachImage={onAttachImage}
          onAttachDocument={onAttachDocument}
          onToggleVoiceRecording={onToggleVoiceRecording}
          onAskAiDraft={onAskAiDraft}
          onSend={onSend}
        />
      ) : (
        <>
          {activeTab === 'chats' ? (
            <NativeHomeShellHeader
              title="Oracle Messenger"
              subtitle={headerSubtitle}
              onRefresh={onRefreshConversations}
              onTabPress={onTabPress}
            />
          ) : null}

          {notice ? <Text style={styles.banner}>{notice}</Text> : null}

          {activeTab !== 'chats' ? (
            <NativeFeaturePage
              tab={activeTab}
              session={session}
              onOpenConversation={onOpenConversationFromFeature}
              onRefreshConversations={onRefreshConversations}
              onLogout={onLogout}
              onOpenTab={onTabPress}
            />
          ) : (
            <NativeConversationList
              ownerId={session.user.id}
              conversations={conversations}
              search={conversationSearch}
              busy={busy}
              onSearchChange={onConversationSearchChange}
              onOpenConversation={onOpenConversationFromList}
              onConversationActions={onConversationActions}
              onOpenContacts={() => onTabPress('contacts')}
            />
          )}
          <NativeBottomTabs tabs={tabs} activeTab={activeTab} onTabPress={onTabPress} />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  banner: { margin: 12, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
});
