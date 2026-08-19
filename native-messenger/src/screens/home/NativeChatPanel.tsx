import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeChatComposer, type NativeVisualMessageAsset } from '@/screens/home/NativeChatComposer';
import { NativeChatHeader } from '@/screens/home/NativeChatHeader';
import { NativeGroupInfoModal } from '@/screens/home/NativeGroupInfoModal';
import { NativeMessageActionPanels } from '@/screens/home/NativeMessageActionPanels';
import { NativeMessageList } from '@/screens/home/NativeMessageList';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message } from '@/types/messenger';
import { isOfficialConversation } from './homeUtils';
import type { VoicePreview } from './useNativeVoiceRecorder';

type NativeChatPanelProps = {
  conversation: Conversation;
  conversations: Conversation[];
  session: AuthSession;
  presenceText: string;
  callNotice?: string;
  notice?: string;
  messageSearch: string;
  storyAuthors?: Record<string, { hasUnread?: boolean } | undefined>;
  messages: Message[];
  selectedMessageIds: string[];
  selectedMessages: Message[];
  forwardMessages: Message[];
  actionMessage: Message | null;
  quickReactions: readonly string[];
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
  busy: boolean;
  autoTranslateMode?: 'unknown' | 'enabled' | 'disabled';
  autoTranslateTargetLanguage?: string;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onConversationActions: () => void;
  onOpenStoryAuthor?: (authorId: string) => void;
  onCallMessagePress: (type: 'audio' | 'video', message: Message) => void | Promise<void>;
  onAddImageToStory?: (message: Message, sourceUrl: string) => void | Promise<void>;
  onMessageSearchChange: (value: string) => void;
  onShare: (messages: Message[]) => void | Promise<void>;
  onBeginForward: (messages: Message[]) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onClearForward: () => void;
  onCloseMessageActions: () => void;
  onReactMessage: (message: Message, emoji: string | null) => void | Promise<void>;
  onReplyMessage: (message: Message) => void;
  onCopyMessage: (message: Message) => void | Promise<void>;
  onEditMessage: (message: Message) => void;
  onDeleteMessageForMe: (message: Message) => void;
  onDeleteMessageForAll: (message: Message) => void;
  onForwardToConversation: (conversation: Conversation | Conversation[]) => void | Promise<void>;
  onToggleSelection: (messageId: string) => void;
  onOpenMessageActions: (message: Message) => void;
  onLoadOlderMessages: () => void | Promise<void>;
  onDraftChange: (value: string) => void;
  onClearContext: () => void;
  onCancelVoiceRecording: () => void | Promise<void>;
  onAttachCamera: () => void | Promise<void>;
  onAttachImage: () => void | Promise<void>;
  onAttachDocument: () => void | Promise<void>;
  onStartVoiceRecording: () => void | Promise<void>;
  onStopVoiceRecording: () => void | Promise<unknown>;
  onLockVoiceRecording: () => void;
  onSendVoicePreview: () => void | Promise<void>;
  onSendVisualAsset: (asset: NativeVisualMessageAsset) => void | Promise<void>;
  onAskAiDraft: () => void | Promise<void>;
  onOpenAiTools: () => void;
  onSend: () => void | Promise<void>;
  onSetAutoTranslateMode?: (mode: 'enabled' | 'disabled') => void | Promise<void>;
  onGroupChanged: (conversation: Conversation) => void | Promise<void>;
  onGroupLeft: () => void | Promise<void>;
};

export function NativeChatPanel({
  conversation,
  conversations,
  session,
  presenceText,
  callNotice,
  notice,
  messageSearch,
  storyAuthors,
  messages,
  selectedMessageIds,
  selectedMessages,
  forwardMessages,
  actionMessage,
  quickReactions,
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
  busy,
  autoTranslateMode,
  autoTranslateTargetLanguage,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
  onConversationActions,
  onOpenStoryAuthor,
  onCallMessagePress,
  onAddImageToStory,
  onMessageSearchChange,
  onShare,
  onBeginForward,
  onDeleteSelected,
  onClearSelection,
  onClearForward,
  onCloseMessageActions,
  onReactMessage,
  onReplyMessage,
  onCopyMessage,
  onEditMessage,
  onDeleteMessageForMe,
  onDeleteMessageForAll,
  onForwardToConversation,
  onToggleSelection,
  onOpenMessageActions,
  onLoadOlderMessages,
  onDraftChange,
  onClearContext,
  onCancelVoiceRecording,
  onAttachCamera,
  onAttachImage,
  onAttachDocument,
  onStartVoiceRecording,
  onStopVoiceRecording,
  onLockVoiceRecording,
  onSendVoicePreview,
  onSendVisualAsset,
  onAskAiDraft,
  onOpenAiTools,
  onSend,
  onSetAutoTranslateMode,
  onGroupChanged,
  onGroupLeft,
}: NativeChatPanelProps) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const official = isOfficialConversation(conversation);
  const groupReadOnly = conversation.type === 'group' && conversation.currentUserCanSendMessages === false;
  const groupReadOnlyText = conversation.messagePolicy === 'ADMINS_ONLY'
    ? 'Seuls les administrateurs peuvent envoyer des messages dans ce groupe.'
    : 'Vous êtes actuellement en lecture seule dans ce groupe.';

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      gesture.x0 <= 34 && gesture.dx > 112 && gesture.dx > Math.abs(gesture.dy) * 1.75
    ),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.x0 <= 34 && gesture.dx > 142 && Math.abs(gesture.dy) < 52) onBack();
    },
  }), [onBack]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={0}
      style={styles.chatPanel}
      {...panResponder.panHandlers}
    >
      <NativeChatHeader
        conversation={conversation}
        currentUserId={session.user.id}
        presenceText={presenceText}
        callNotice={callNotice}
        messageSearch={messageSearch}
        storyAuthors={storyAuthors}
        onBack={onBack}
        onStartAudioCall={onStartAudioCall}
        onStartVideoCall={onStartVideoCall}
        onConversationActions={onConversationActions}
        onMessageSearchChange={onMessageSearchChange}
        onOpenStoryAuthor={onOpenStoryAuthor}
        onOpenGroupInfo={conversation.type === 'group' ? () => setGroupInfoOpen(true) : undefined}
      />
      {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}
      <NativeMessageActionPanels
        selectedCount={selectedMessageIds.length}
        selectedMessages={selectedMessages}
        forwardMessages={forwardMessages}
        actionMessage={actionMessage}
        quickReactions={quickReactions}
        conversations={conversations}
        activeConversationId={conversation.id}
        currentUserId={session.user.id}
        onShare={onShare}
        onBeginForward={onBeginForward}
        onDeleteSelected={onDeleteSelected}
        onClearSelection={onClearSelection}
        onClearForward={onClearForward}
        onCloseMessageActions={onCloseMessageActions}
        onReactMessage={onReactMessage}
        onReplyMessage={onReplyMessage}
        onCopyMessage={onCopyMessage}
        onEditMessage={onEditMessage}
        onDeleteMessageForMe={onDeleteMessageForMe}
        onDeleteMessageForAll={onDeleteMessageForAll}
        onToggleSelection={onToggleSelection}
        onForwardToConversation={onForwardToConversation}
      />
      <NativeMessageList
        conversationId={conversation.id}
        token={session.token}
        messages={messages}
        currentUserId={session.user.id}
        currentUserName={session.user.name}
        currentUserAvatar={session.user.avatar}
        selectedMessageIds={selectedMessageIds}
        localMediaByMessageId={localMediaByMessageId}
        messageSearch={messageSearch}
        onToggleSelection={onToggleSelection}
        onOpenMessageActions={onOpenMessageActions}
        onReplyMessage={onReplyMessage}
        onLoadOlderMessages={onLoadOlderMessages}
        onCallMessagePress={onCallMessagePress}
        onAddImageToStory={onAddImageToStory}
      />
      {official ? (
        <View style={[styles.officialNoticeWrap, { paddingBottom: Math.max(insets.bottom + 16, 42) }]}>
          <Text style={styles.officialNotice}>
            Conversation officielle O.Messenger. Les réponses sont désactivées pour ce canal.
          </Text>
        </View>
      ) : groupReadOnly ? (
        <View style={[styles.officialNoticeWrap, { paddingBottom: Math.max(insets.bottom + 16, 42) }]}>
          <Text style={styles.officialNotice}>{groupReadOnlyText}</Text>
        </View>
      ) : <NativeChatComposer
        draft={draft}
        replyTo={replyTo}
        editingMessage={editingMessage}
        voiceRecording={voiceRecording}
        voiceStartedAt={voiceStartedAt}
        voiceLocked={voiceLocked}
        voicePreview={voicePreview}
        voiceSending={voiceSending}
        busy={busy}
        aiBusy={aiBusy}
        autoTranslateMode={autoTranslateMode}
        autoTranslateTargetLanguage={autoTranslateTargetLanguage}
        keyboardVisible={keyboardVisible}
        onDraftChange={onDraftChange}
        onClearContext={onClearContext}
        onCancelVoiceRecording={onCancelVoiceRecording}
        onAttachCamera={onAttachCamera}
        onAttachImage={onAttachImage}
        onAttachDocument={onAttachDocument}
        onStartVoiceRecording={onStartVoiceRecording}
        onStopVoiceRecording={onStopVoiceRecording}
        onLockVoiceRecording={onLockVoiceRecording}
        onSendVoicePreview={onSendVoicePreview}
        onSendVisualAsset={onSendVisualAsset}
        onAskAiDraft={onAskAiDraft}
        onOpenAiTools={onOpenAiTools}
        onSend={onSend}
        onSetAutoTranslateMode={onSetAutoTranslateMode}
      />}
      {conversation.type === 'group' ? (
        <NativeGroupInfoModal
          visible={groupInfoOpen}
          token={session.token}
          currentUserId={session.user.id}
          conversation={conversation}
          conversations={conversations}
          onClose={() => setGroupInfoOpen(false)}
          onGroupChanged={onGroupChanged}
          onGroupLeft={onGroupLeft}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chatPanel: { flex: 1 },
  noticeBanner: { marginHorizontal: 10, marginTop: 8, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  officialNoticeWrap: { backgroundColor: '#EAF4F1', borderTopWidth: 1, borderTopColor: 'rgba(16,42,42,0.14)', paddingTop: 12, paddingHorizontal: 14 },
  officialNotice: { color: colors.header, fontSize: 13.5, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
});
