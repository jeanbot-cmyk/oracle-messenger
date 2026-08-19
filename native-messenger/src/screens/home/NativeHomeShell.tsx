import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, BackHandler, InteractionManager, PanResponder, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeBottomTabs } from '@/screens/home/NativeBottomTabs';
import { NativeChatPanel } from '@/screens/home/NativeChatPanel';
import type { NativeVisualMessageAsset } from '@/screens/home/NativeChatComposer';
import { NativeCallOverlay } from '@/screens/home/NativeCallOverlay';
import { NativeConversationList } from '@/screens/home/NativeConversationList';
import { NativeFeatureShell } from '@/screens/home/NativeFeatureShell';
import { NativeHeaderOverflowMenu } from '@/screens/home/NativeHeaderOverflowMenu';
import { NativeHomeShellHeader } from '@/screens/home/NativeHomeShellHeader';
import { isAdminSession, NativeFeaturePage, type NativeTabKey } from '@/screens/NativeFeaturePages';
import type { useNativeCall } from '@/hooks/useNativeCall';
import { api } from '@/services/api';
import { selectionHaptic } from '@/services/haptics';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { LocalGalleryItem } from '@/services/localMedia';
import {
  loadLocalPhoneContactsForIdentity,
  loadOracleUsersFromPhoneContacts,
  type LocalPhoneContact,
} from '@/services/nativePhoneContacts';
import {
  applyContactPrivacyToConversation,
  applyContactPrivacyToConversations,
  applyContactPrivacyToMessage,
  applyContactPrivacyToMessages,
  applyContactPrivacyToParticipants,
} from '@/services/nativeContactPrivacy';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message, Participant } from '@/types/messenger';
import { parseMediaPayload } from './homeUtils';
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
  autoTranslateMode?: 'unknown' | 'enabled' | 'disabled';
  autoTranslateTargetLanguage?: string;
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
  onCloseMessageActions: () => void;
  onReactMessage: (message: Message, emoji: string | null) => void | Promise<void>;
  onReplyMessage: (message: Message) => void;
  onCopyMessage: (message: Message) => void | Promise<void>;
  onEditMessage: (message: Message) => void;
  onDeleteMessageForMe: (message: Message) => void;
  onDeleteMessageForAll: (message: Message) => void;
  onForwardToConversation: (conversation: Conversation | Conversation[]) => void | Promise<void>;
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
  onSendVisualAsset: (asset: NativeVisualMessageAsset) => void | Promise<void>;
  onAskAiDraft: () => void | Promise<void>;
  onOpenAiTools?: () => void;
  onSend: () => void | Promise<void>;
  onSetAutoTranslateMode?: (mode: 'enabled' | 'disabled') => void | Promise<void>;
  onConversationSearchChange: (value: string) => void;
  onOpenConversationFromList: (conversation: Conversation) => void;
  onConversationActions: (conversation: Conversation) => void;
  onDeleteConversations: (conversations: Conversation[]) => void;
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

type StoryAuthorIndicators = Record<string, { hasUnread?: boolean } | undefined>;

type StoryIndicatorSource = {
  id?: string | null;
  authorId?: string | null;
  type?: string | null;
  content?: string | null;
  expiresAt?: string | null;
  seen?: boolean;
  views?: string[];
};

function isDisplayableStory(story: StoryIndicatorSource) {
  const authorId = String(story.authorId || '').trim();
  const type = String(story.type || '').toLowerCase();
  const content = String(story.content || '').trim();
  if (!story.id || !authorId || !content) return false;
  if (story.expiresAt && Date.parse(story.expiresAt) <= Date.now()) return false;
  if (type === 'text') return Boolean(content.trim());
  if (type === 'image') return /^data:image\/|^https?:\/\//i.test(content);
  if (type === 'video') return /^data:video\/|^https?:\/\//i.test(content);
  return false;
}

function isStorySeenByUser(story: StoryIndicatorSource, userId: string) {
  return Boolean(story.seen || story.views?.includes(userId));
}

function buildStoryAuthorIndicators(stories: StoryIndicatorSource[], userId: string): StoryAuthorIndicators {
  const next: StoryAuthorIndicators = {};
  stories.filter(isDisplayableStory).forEach(story => {
    const authorId = String(story.authorId || '');
    if (!authorId || authorId === userId) return;
    const previousUnread = Boolean(next[authorId]?.hasUnread);
    next[authorId] = { hasUnread: previousUnread || !isStorySeenByUser(story, userId) };
  });
  return next;
}

function inferStoryImageMime(sourceUrl: string, payloadMime?: string | null) {
  const explicit = String(payloadMime || '').toLowerCase();
  if (explicit.startsWith('image/')) return explicit;
  const dataMatch = sourceUrl.match(/^data:(image\/[a-z0-9.+-]+);/i);
  if (dataMatch?.[1]) return dataMatch[1].toLowerCase();
  const clean = sourceUrl.split('?')[0]?.split('#')[0]?.toLowerCase() || '';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.heic')) return 'image/heic';
  if (clean.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function imageExtensionFromMime(mime: string) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('heif')) return 'heif';
  return 'jpg';
}

async function imageSourceToStoryDataUrl(sourceUrl: string, mime: string) {
  if (/^data:image\//i.test(sourceUrl)) return sourceUrl;
  if (/^data:/i.test(sourceUrl)) throw new Error('Ce média ne peut pas être publié comme image.');
  let readableUri = sourceUrl;
  if (/^https?:\/\//i.test(sourceUrl)) {
    const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDirectory) throw new Error('Stockage local indisponible.');
    const target = `${baseDirectory}story-${Date.now()}.${imageExtensionFromMime(mime)}`;
    const downloaded = await FileSystem.downloadAsync(sourceUrl, target);
    readableUri = downloaded.uri;
  }
  const base64 = await FileSystem.readAsStringAsync(readableUri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
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
  autoTranslateMode,
  autoTranslateTargetLanguage,
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
  onCloseMessageActions,
  onReactMessage,
  onReplyMessage,
  onCopyMessage,
  onEditMessage,
  onDeleteMessageForMe,
  onDeleteMessageForAll,
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
  onSendVisualAsset,
  onAskAiDraft,
  onOpenAiTools,
  onSend,
  onSetAutoTranslateMode,
  onConversationSearchChange,
  onOpenConversationFromList,
  onConversationActions,
  onDeleteConversations,
}: NativeHomeShellProps) {
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [contactsAutoImportKey, setContactsAutoImportKey] = useState(0);
  const [callContacts, setCallContacts] = useState<Participant[]>([]);
  const [callContactsLoading, setCallContactsLoading] = useState(false);
  const [localIdentityContacts, setLocalIdentityContacts] = useState<LocalPhoneContact[]>([]);
  const [storyAuthors, setStoryAuthors] = useState<StoryAuthorIndicators>({});
  const [storyTarget, setStoryTarget] = useState<{ authorId: string; key: number } | null>(null);
  const privateConversations = useMemo(
    () => applyContactPrivacyToConversations(conversations, session.user.id, localIdentityContacts),
    [conversations, localIdentityContacts, session.user.id],
  );
  const privateSelected = useMemo(
    () => selected ? applyContactPrivacyToConversation(selected, session.user.id, localIdentityContacts) : null,
    [localIdentityContacts, selected, session.user.id],
  );
  const privateMessages = useMemo(
    () => applyContactPrivacyToMessages(messages, session.user.id, localIdentityContacts),
    [localIdentityContacts, messages, session.user.id],
  );
  const privateSelectedMessages = useMemo(
    () => applyContactPrivacyToMessages(selectedMessages, session.user.id, localIdentityContacts),
    [localIdentityContacts, selectedMessages, session.user.id],
  );
  const privateForwardMessages = useMemo(
    () => applyContactPrivacyToMessages(forwardMessages, session.user.id, localIdentityContacts),
    [forwardMessages, localIdentityContacts, session.user.id],
  );
  const privateCallContacts = useMemo(
    () => applyContactPrivacyToParticipants(callContacts, session.user.id, localIdentityContacts),
    [callContacts, localIdentityContacts, session.user.id],
  );
  const privateActionMessage = useMemo(
    () => actionMessage ? applyContactPrivacyToMessage(actionMessage, session.user.id, localIdentityContacts) : null,
    [actionMessage, localIdentityContacts, session.user.id],
  );
  const privateReplyTo = useMemo(
    () => replyTo ? applyContactPrivacyToMessage(replyTo, session.user.id, localIdentityContacts) : null,
    [localIdentityContacts, replyTo, session.user.id],
  );
  const privateEditingMessage = useMemo(
    () => editingMessage ? applyContactPrivacyToMessage(editingMessage, session.user.id, localIdentityContacts) : null,
    [editingMessage, localIdentityContacts, session.user.id],
  );
  const knownCallParticipants = useMemo<Participant[]>(() => {
    const byId = new Map<string, Participant>();
    privateConversations.forEach(conversation => {
      if (conversation.isOfficial || conversation.type === 'official') return;
      conversation.participants.forEach(participant => {
        if (!participant?.id || participant.id === session.user.id) return;
        byId.set(participant.id, participant);
      });
    });
    privateCallContacts.forEach(participant => {
      if (!participant?.id || participant.id === session.user.id) return;
      byId.set(participant.id, participant);
    });
    return Array.from(byId.values());
  }, [privateCallContacts, privateConversations, session.user.id]);

  const refreshStoryIndicators = useCallback(async () => {
    try {
      const activeStories = await api.stories(session.token);
      const next = buildStoryAuthorIndicators(activeStories, session.user.id);
      setStoryAuthors(next);
      return activeStories.filter(isDisplayableStory);
    } catch {
      setStoryAuthors({});
      return [];
    }
  }, [session.token, session.user.id]);

  const openStoriesForAuthor = useCallback(async (authorId: string) => {
    if (!authorId) return;
    const activeStories = await refreshStoryIndicators();
    if (!activeStories.some(story => story.authorId === authorId)) {
      setStoryAuthors(current => {
        if (!current[authorId]) return current;
        const next = { ...current };
        delete next[authorId];
        return next;
      });
      Alert.alert('Aucun statut actif', 'Ce contact n’a pas de story active pour le moment.');
      return;
    }
    setStoryTarget({ authorId, key: Date.now() });
    onTabPress('stories');
  }, [onTabPress, refreshStoryIndicators]);

  const addImageToStory = useCallback(async (message: Message, sourceUrl: string) => {
    const publish = async () => {
      const payload = parseMediaPayload(message.content);
      const mime = inferStoryImageMime(sourceUrl, payload?.mime);
      const content = await imageSourceToStoryDataUrl(sourceUrl, mime);
      await api.createStory(session.token, {
        content,
        caption: payload?.caption?.trim() || undefined,
        type: 'image',
      });
      await refreshStoryIndicators();
      setStoryTarget({ authorId: session.user.id, key: Date.now() });
      onTabPress('stories');
    };
    try {
      Alert.alert(
        'Publier en story ?',
        'Cette image sera visible pendant 24 heures par tes contacts Oracle Messenger.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Publier',
            onPress: () => {
              publish().catch(error => {
                Alert.alert('Story impossible', error instanceof Error ? error.message : 'Cette image ne peut pas être ajoutée à la story.');
              });
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Story impossible', error instanceof Error ? error.message : 'Cette image ne peut pas être ajoutée à la story.');
    }
  }, [onTabPress, refreshStoryIndicators, session.token, session.user.id]);

  const startCallFromPeer = async (peerId: string, type: 'audio' | 'video') => {
    if (!peerId) return;
    const existing = conversations.find(conversation => conversation.type === 'direct' && conversation.participants.some(participant => participant.id === peerId));
    const conversation = existing || await api.createConversation(peerId, session.token);
    void api.conversation(conversation.id, session.token)
      .then(freshConversation => {
        if (freshConversation?.id) void onRefreshConversations().catch(() => undefined);
      })
      .catch(() => undefined);
    await nativeCall.startCall(conversation, type, peerId);
  };
  const startCallFromConversation = async (conversation: Conversation, type: 'audio' | 'video') => {
    const directPeerId = conversation.type === 'direct'
      ? conversation.participants.find(participant => participant.id && participant.id !== session.user.id)?.id
      : undefined;
    void api.conversation(conversation.id, session.token)
      .then(freshConversation => {
        if (freshConversation?.id) void onRefreshConversations().catch(() => undefined);
      })
      .catch(() => undefined);
    await nativeCall.startCall(conversation, type, directPeerId);
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

  const openContactsAndImport = useCallback(() => {
    setContactsAutoImportKey(current => current + 1);
    onTabPress('contacts');
  }, [onTabPress]);

  const loadCallContacts = useCallback(async () => {
    if (callContactsLoading) return;
    setCallContactsLoading(true);
    try {
      const contacts = await loadOracleUsersFromPhoneContacts(session.token, session.user.id);
      setCallContacts(contacts);
    } catch {
      // Keep conversation participants available even if phone contacts cannot be loaded.
    } finally {
      setCallContactsLoading(false);
    }
  }, [callContactsLoading, session.token, session.user.id]);

  useEffect(() => {
    let active = true;
    const refreshLocalContacts = () => {
      InteractionManager.runAfterInteractions(() => {
        loadLocalPhoneContactsForIdentity(session.user.id)
          .then(contacts => {
            if (active) setLocalIdentityContacts(contacts);
          })
          .catch(() => undefined);
      });
    };
    refreshLocalContacts();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshLocalContacts();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [contactsAutoImportKey, session.user.id]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void refreshStoryIndicators();
    });
    return () => task.cancel();
  }, [refreshStoryIndicators]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        InteractionManager.runAfterInteractions(() => {
          void refreshStoryIndicators();
        });
      }
    });
    return () => subscription.remove();
  }, [refreshStoryIndicators]);

  useEffect(() => {
    if (!session.token) return undefined;
    const socket = ensureNativeSocket(session.token);
    const reloadStories = () => {
      void refreshStoryIndicators();
    };
    socket.on('story:changed', reloadStories);
    socket.on('story:viewed', reloadStories);
    return () => {
      socket.off('story:changed', reloadStories);
      socket.off('story:viewed', reloadStories);
    };
  }, [refreshStoryIndicators, session.token]);

  const rootSwipeGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-34, 34])
    .failOffsetY([-34, 34])
    .onEnd(event => {
      if (Math.abs(event.translationX) > 68 || Math.abs(event.velocityX) > 145) {
        runOnJS(handleRootSwipe)(event.translationX < 0 ? 'next' : 'previous');
      }
    }), [handleRootSwipe]);

  const tabSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 54 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
    ),
    onPanResponderRelease: (_, gesture) => {
      if ((Math.abs(gesture.dx) > 72 || Math.abs(gesture.vx) > 0.62) && Math.abs(gesture.dy) < 76) {
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
      if (actionMessage) {
        onCloseMessageActions();
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
    actionMessage,
    forwardMessages.length,
    headerMenuOpen,
    nativeCall.callState,
    onBackFromChat,
    onClearForwardMessages,
    onClearMessageSelection,
    onCloseMessageActions,
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
      <NativeCallOverlay
        call={nativeCall}
        conversation={privateSelected}
        knownCallParticipants={knownCallParticipants}
        currentUserId={session.user.id}
        callParticipantsLoading={callContactsLoading}
        onLoadCallParticipants={loadCallContacts}
      />
      <NativeHeaderOverflowMenu
        visible={headerMenuOpen}
        isAdmin={isAdminSession(session)}
        onClose={() => setHeaderMenuOpen(false)}
        onOpenTab={onTabPress}
        onLogout={onLogout}
      />
      {activeTab === 'chats' && selected ? (
        <NativeChatPanel
          conversation={privateSelected || selected}
          conversations={privateConversations}
          session={session}
          presenceText={presenceText}
          callNotice={nativeCall.callState === 'idle' ? undefined : nativeCall.callNotice}
          notice={notice}
          messageSearch={messageSearch}
          storyAuthors={storyAuthors}
          messages={privateMessages}
          selectedMessageIds={selectedMessageIds}
          selectedMessages={privateSelectedMessages}
          forwardMessages={privateForwardMessages}
          actionMessage={privateActionMessage}
          quickReactions={quickReactions}
          localMediaByMessageId={localMediaByMessageId}
          draft={draft}
          replyTo={privateReplyTo}
          editingMessage={privateEditingMessage}
          voiceRecording={voiceRecording}
          voiceStartedAt={voiceStartedAt}
          voiceLocked={voiceLocked}
          voicePreview={voicePreview}
          voiceSending={voiceSending}
          aiBusy={aiBusy}
          autoTranslateMode={autoTranslateMode}
          autoTranslateTargetLanguage={autoTranslateTargetLanguage}
          busy={busy}
          onBack={onBackFromChat}
          onStartAudioCall={() => startCallFromConversation(selected, 'audio')}
          onStartVideoCall={() => startCallFromConversation(selected, 'video')}
          onConversationActions={() => onConversationActions(selected)}
          onOpenStoryAuthor={openStoriesForAuthor}
          onCallMessagePress={(type) => startCallFromConversation(selected, type)}
          onAddImageToStory={addImageToStory}
          onMessageSearchChange={onMessageSearchChange}
          onShare={onShareMessages}
          onBeginForward={onBeginForward}
          onDeleteSelected={onDeleteSelectedMessages}
          onClearSelection={onClearMessageSelection}
          onClearForward={onClearForwardMessages}
          onCloseMessageActions={onCloseMessageActions}
          onReactMessage={onReactMessage}
          onReplyMessage={onReplyMessage}
          onCopyMessage={onCopyMessage}
          onEditMessage={onEditMessage}
          onDeleteMessageForMe={onDeleteMessageForMe}
          onDeleteMessageForAll={onDeleteMessageForAll}
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
          onSendVisualAsset={onSendVisualAsset}
          onAskAiDraft={onAskAiDraft}
          onOpenAiTools={onOpenAiTools || (() => onTabPress('ai'))}
          onSend={onSend}
          onSetAutoTranslateMode={onSetAutoTranslateMode}
          onGroupChanged={async conversation => {
            await onRefreshConversations();
            onOpenConversationFromList(conversation);
          }}
          onGroupLeft={async () => {
            onBackFromChat();
            await onRefreshConversations();
          }}
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
                contactsAutoImportKey={contactsAutoImportKey}
                callDiagnostics={nativeCall.callDiagnostics}
                onClearCallDiagnostics={nativeCall.clearCallDiagnostics}
                initialStoryAuthorId={storyTarget?.authorId}
                initialStoryOpenKey={storyTarget?.key}
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
                contactsAutoImportKey={contactsAutoImportKey}
                callDiagnostics={nativeCall.callDiagnostics}
                onClearCallDiagnostics={nativeCall.clearCallDiagnostics}
                initialStoryAuthorId={storyTarget?.authorId}
                initialStoryOpenKey={storyTarget?.key}
                isAdmin={isAdminSession(session)}
              />
            </NativeFeatureShell>
          ) : (
            <NativeConversationList
              token={session.token}
              ownerId={session.user.id}
              currentUserName={session.user.name || session.user.username || session.user.email}
              conversations={privateConversations}
              search={conversationSearch}
              busy={busy}
              onSearchChange={onConversationSearchChange}
              onOpenConversation={onOpenConversationFromList}
              onDeleteConversations={onDeleteConversations}
              onOpenContacts={() => onTabPress('contacts')}
              onFindFriends={openContactsAndImport}
              storyAuthors={storyAuthors}
              onOpenStoryAuthor={openStoriesForAuthor}
              onStartCallFromPeer={startCallFromPeer}
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
