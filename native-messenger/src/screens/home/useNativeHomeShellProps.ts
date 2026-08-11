import type { Dispatch, SetStateAction } from 'react';
import type { useNativeCall } from '@/hooks/useNativeCall';
import type { NativeHomeShellProps } from '@/screens/home/NativeHomeShell';
import type { useNativeComposerController } from '@/screens/home/useNativeComposerController';
import type { useNativeConversationController } from '@/screens/home/useNativeConversationController';
import type { LocalGalleryItem } from '@/services/localMedia';
import type { AuthSession, Conversation, Message } from '@/types/messenger';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';

type NativeCallController = ReturnType<typeof useNativeCall>;
type NativeComposerController = ReturnType<typeof useNativeComposerController>;
type NativeConversationController = ReturnType<typeof useNativeConversationController>;

type UseNativeHomeShellPropsParams = {
  session: AuthSession | null;
  needsOnboarding: boolean;
  nativeCall: NativeCallController;
  headerSubtitle: string;
  tabs: { key: NativeTabKey; label: string }[];
  activeTab: NativeTabKey;
  notice: string;
  conversations: Conversation[];
  selected: Conversation | null;
  conversationSearch: string;
  busy: boolean;
  messageSearch: string;
  messages: Message[];
  localMediaByMessageId: Record<string, LocalGalleryItem>;
  composer: NativeComposerController;
  conversationsController: NativeConversationController;
  refreshConversations: () => Promise<void>;
  logout: () => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<NativeTabKey>>;
  setConversationSearch: Dispatch<SetStateAction<string>>;
  setMessageSearch: Dispatch<SetStateAction<string>>;
  setSelected: Dispatch<SetStateAction<Conversation | null>>;
};

export function useNativeHomeShellProps({
  session,
  needsOnboarding,
  nativeCall,
  headerSubtitle,
  tabs,
  activeTab,
  notice,
  conversations,
  selected,
  conversationSearch,
  busy,
  messageSearch,
  messages,
  localMediaByMessageId,
  composer,
  conversationsController,
  refreshConversations,
  logout,
  setActiveTab,
  setConversationSearch,
  setMessageSearch,
  setSelected,
}: UseNativeHomeShellPropsParams): NativeHomeShellProps | null {
  if (!session || needsOnboarding) return null;

  return {
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
    presenceText: composer.presenceText,
    messageSearch,
    messages,
    selectedMessageIds: conversationsController.selectedMessageIds,
    selectedMessages: conversationsController.selectedMessages,
    forwardMessages: conversationsController.forwardMessages,
    localMediaByMessageId,
    draft: composer.draft,
    replyTo: composer.replyTo,
    editingMessage: composer.editingMessage,
    voiceRecording: composer.voiceRecording,
    voiceStartedAt: composer.voiceStartedAt,
    aiBusy: composer.aiBusy,
    onRefreshConversations: refreshConversations,
    onTabPress: tab => {
      setActiveTab(tab);
      if (tab !== 'chats') setSelected(null);
    },
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
    onDraftChange: composer.handleDraftChange,
    onClearComposerContext: composer.clearComposerContext,
    onCancelVoiceRecording: composer.cancelVoiceRecording,
    onAttachImage: composer.attachImage,
    onAttachDocument: composer.attachDocument,
    onToggleVoiceRecording: composer.toggleVoiceRecording,
    onAskAiDraft: composer.askAiDraft,
    onSend: composer.send,
    onConversationSearchChange: setConversationSearch,
    onOpenConversationFromList: conversation => {
      setActiveTab('chats');
      conversationsController.loadMessages(conversation);
    },
    onConversationActions: conversationsController.openConversationActions,
  };
}
