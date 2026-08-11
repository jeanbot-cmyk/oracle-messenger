import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { NativeChatComposer } from '@/screens/home/NativeChatComposer';
import { NativeChatHeader } from '@/screens/home/NativeChatHeader';
import { NativeMessageActionPanels } from '@/screens/home/NativeMessageActionPanels';
import { NativeMessageList } from '@/screens/home/NativeMessageList';
import type { LocalGalleryItem } from '@/services/localMedia';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type NativeChatPanelProps = {
  conversation: Conversation;
  conversations: Conversation[];
  session: AuthSession;
  presenceText: string;
  callNotice?: string;
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
  busy: boolean;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
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
  onAttachImage: () => void | Promise<void>;
  onAttachDocument: () => void | Promise<void>;
  onToggleVoiceRecording: () => void | Promise<void>;
  onAskAiDraft: () => void | Promise<void>;
  onSend: () => void | Promise<void>;
};

export function NativeChatPanel({
  conversation,
  conversations,
  session,
  presenceText,
  callNotice,
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
  busy,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
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
  onAttachImage,
  onAttachDocument,
  onToggleVoiceRecording,
  onAskAiDraft,
  onSend,
}: NativeChatPanelProps) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatPanel}>
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
      />
      <NativeChatComposer
        draft={draft}
        replyTo={replyTo}
        editingMessage={editingMessage}
        voiceRecording={voiceRecording}
        voiceStartedAt={voiceStartedAt}
        busy={busy}
        aiBusy={aiBusy}
        onDraftChange={onDraftChange}
        onClearContext={onClearContext}
        onCancelVoiceRecording={onCancelVoiceRecording}
        onAttachImage={onAttachImage}
        onAttachDocument={onAttachDocument}
        onToggleVoiceRecording={onToggleVoiceRecording}
        onAskAiDraft={onAskAiDraft}
        onSend={onSend}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chatPanel: { flex: 1 },
});
