import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { ANDROID_PACKAGE, NATIVE_BASELINE } from '@/config/env';
import type { useNativeCall } from '@/hooks/useNativeCall';
import { useNativeHomeShellProps } from '@/screens/home/useNativeHomeShellProps';
import type { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import type { useNativeComposerController } from '@/screens/home/useNativeComposerController';
import type { useNativeConversationController } from '@/screens/home/useNativeConversationController';
import { useVisibleTabs } from '@/screens/NativeFeaturePages';
import type { LocalGalleryItem } from '@/services/localMedia';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type NativeCallController = ReturnType<typeof useNativeCall>;
type NativeComposerController = ReturnType<typeof useNativeComposerController>;
type NativeConversationController = ReturnType<typeof useNativeConversationController>;
type NativeHomeUiState = ReturnType<typeof useNativeHomeUiState>;

type UseNativeHomeViewModelParams = {
  session: AuthSession | null;
  nativeCall: NativeCallController;
  conversations: Conversation[];
  selected: Conversation | null;
  visibleMessages: Message[];
  localMediaByMessageId: Record<string, LocalGalleryItem>;
  composer: NativeComposerController;
  conversationsController: NativeConversationController;
  refreshConversations: () => Promise<void>;
  logout: () => Promise<void>;
  ui: NativeHomeUiState;
  setSelected: Dispatch<SetStateAction<Conversation | null>>;
};

export function useNativeHomeViewModel({
  session,
  nativeCall,
  conversations,
  selected,
  visibleMessages,
  localMediaByMessageId,
  composer,
  conversationsController,
  refreshConversations,
  logout,
  ui,
  setSelected,
}: UseNativeHomeViewModelParams) {
  const tabs = useVisibleTabs(session);
  const needsOnboarding = Boolean(session && (session.user.isNew || !session.user.phone));
  const headerSubtitle = useMemo(() => {
    if (session?.user?.name) return `${session.user.name} • ${ANDROID_PACKAGE}`;
    return `${ANDROID_PACKAGE} • baseline ${NATIVE_BASELINE}`;
  }, [session?.user?.name]);

  const shellProps = useNativeHomeShellProps({
    session,
    needsOnboarding,
    nativeCall,
    headerSubtitle,
    tabs,
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
    needsOnboarding,
    shellProps,
  };
}
