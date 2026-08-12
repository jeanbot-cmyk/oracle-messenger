import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, PanResponder, Platform, StyleSheet, Text } from 'react-native';
import { NativeChatComposer } from '@/screens/home/NativeChatComposer';
import { NativeChatHeader } from '@/screens/home/NativeChatHeader';
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
  busy: boolean;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onCallMessagePress: (type: 'audio' | 'video', message: Message) => void | Promise<void>;
  onMessageSearchChange: (value: string) => void;
  onShare: (messages: Message[]) => void | Promise<void>;
  onBeginForward: (messages: Message[]) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onClearForward: () => void;
  onForwardToConversation: (conversation: Conversation) => void | Promise<void>;
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
  onAskAiDraft: () => void | Promise<void>;
  onOpenAiTools: () => void;
  onSend: () => void | Promise<void>;
};

export function NativeChatPanel({
  conversation,
  conversations,
  session,
  presenceText,
  callNotice,
  notice,
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
  busy,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
  onCallMessagePress,
  onMessageSearchChange,
  onShare,
  onBeginForward,
  onDeleteSelected,
  onClearSelection,
  onClearForward,
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
  onAskAiDraft,
  onOpenAiTools,
  onSend,
}: NativeChatPanelProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const official = isOfficialConversation(conversation);

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
      Math.abs(gesture.dx) > 86 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
    ),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > 110 && Math.abs(gesture.dy) < 58) onBack();
    },
  }), [onBack]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={styles.chatPanel}
      {...panResponder.panHandlers}
    >
      <NativeChatHeader
        conversation={conversation}
        presenceText={presenceText}
        callNotice={callNotice}
        messageSearch={messageSearch}
        onBack={onBack}
        onStartAudioCall={onStartAudioCall}
        onStartVideoCall={onStartVideoCall}
        onMessageSearchChange={onMessageSearchChange}
      />
      {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}
      <NativeMessageActionPanels
        selectedCount={selectedMessageIds.length}
        selectedMessages={selectedMessages}
        forwardMessages={forwardMessages}
        conversations={conversations}
        activeConversationId={conversation.id}
        onShare={onShare}
        onBeginForward={onBeginForward}
        onDeleteSelected={onDeleteSelected}
        onClearSelection={onClearSelection}
        onClearForward={onClearForward}
        onForwardToConversation={onForwardToConversation}
      />
      <NativeMessageList
        conversationId={conversation.id}
        messages={messages}
        currentUserId={session.user.id}
        currentUserName={session.user.name}
        currentUserAvatar={session.user.avatar}
        selectedMessageIds={selectedMessageIds}
        localMediaByMessageId={localMediaByMessageId}
        messageSearch={messageSearch}
        onToggleSelection={onToggleSelection}
        onOpenMessageActions={onOpenMessageActions}
        onLoadOlderMessages={onLoadOlderMessages}
        onCallMessagePress={onCallMessagePress}
      />
      {official ? (
        <Text style={styles.officialNotice}>
          Conversation officielle O.Messenger. Les réponses sont désactivées pour ce canal.
        </Text>
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
        onAskAiDraft={onAskAiDraft}
        onOpenAiTools={onOpenAiTools}
        onSend={onSend}
      />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chatPanel: { flex: 1 },
  noticeBanner: { marginHorizontal: 10, marginTop: 8, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  officialNotice: { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#EAF4F1', borderTopWidth: 1, borderTopColor: 'rgba(16,42,42,0.14)', color: colors.header, fontSize: 13.5, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
});
