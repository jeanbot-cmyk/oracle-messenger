import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Linking, Platform, SafeAreaView, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { ANDROID_PACKAGE, GOOGLE_WEB_CLIENT_ID, NATIVE_BASELINE } from '@/config/env';
import { useNativeCall } from '@/hooks/useNativeCall';
import { NativeChatComposer } from '@/screens/home/NativeChatComposer';
import { NativeChatHeader } from '@/screens/home/NativeChatHeader';
import { NativeCallOverlay } from '@/screens/home/NativeCallOverlay';
import { NativeConversationList } from '@/screens/home/NativeConversationList';
import { NativeHomeShellHeader } from '@/screens/home/NativeHomeShellHeader';
import { NativeLoginScreen } from '@/screens/home/NativeLoginScreen';
import { NativeLoadingScreen } from '@/screens/home/NativeLoadingScreen';
import { NativeMessageActionPanels } from '@/screens/home/NativeMessageActionPanels';
import { NativeMessageList } from '@/screens/home/NativeMessageList';
import { NativeOnboarding } from '@/screens/home/NativeOnboarding';
import { parseCallActionDeepLink, parseConversationTarget, parsePaystackDeepLink, socketAck, sortMessages } from '@/screens/home/homeUtils';
import { useNativeConversationActions } from '@/screens/home/useNativeConversationActions';
import { useNativeMessageActions } from '@/screens/home/useNativeMessageActions';
import { usePendingNativeCallAction } from '@/screens/home/usePendingNativeCallAction';
import { useNativeMessageMedia } from '@/screens/home/useNativeMessageMedia';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeTypingPresence } from '@/screens/home/useNativeTypingPresence';
import { useNativeVoiceRecorder } from '@/screens/home/useNativeVoiceRecorder';
import { NativeFeaturePage, type NativeTabKey, useVisibleTabs } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { configureAndroidNotifications, registerPushToken } from '@/services/notifications';
import { clearSession, loadSession, saveSession } from '@/services/session';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

export function NativeHomeScreen() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationSearch, setConversationSearch] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageSearch, setMessageSearch] = useState('');
  const [activeTab, setActiveTab] = useState<NativeTabKey>('chats');
  const conversationSearchRequestRef = useRef(0);
  const selectedRef = useRef<Conversation | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const initialDeepLinkHandledRef = useRef(false);
  const initialNotificationResponseHandledRef = useRef(false);
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
  const {
    presenceText,
    handleDraftChange,
    handleTypingStart,
    handleTypingStop,
    handleUserOnline,
    handleUserOffline,
  } = useNativeTypingPresence({
    selected,
    token,
    currentUserId: session?.user.id,
    setDraft,
  });

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations(current => {
      const exists = current.some(item => item.id === conversation.id);
      const next = exists
        ? current.map(item => item.id === conversation.id ? { ...item, ...conversation } : item)
        : [conversation, ...current];
      return next.sort((a, b) => new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime());
    });
  }, []);

  const upsertMessage = useCallback((message: Message) => {
    setMessages(current => {
      const active = selectedRef.current;
      if (!active || active.id !== message.conversationId) return current;
      const exists = current.some(item => item.id === message.id);
      return sortMessages(exists ? current.map(item => item.id === message.id ? { ...item, ...message } : item) : [...current, message]);
    });
    setConversations(current => {
      let found = false;
      const next = current.map(conversation => {
        if (conversation.id !== message.conversationId) return conversation;
        found = true;
        const isCurrentOpen = selectedRef.current?.id === message.conversationId;
        const isOwn = message.senderId === sessionRef.current?.user.id;
        return {
          ...conversation,
          lastMessage: message,
          unreadCount: isCurrentOpen || isOwn ? conversation.unreadCount || 0 : (conversation.unreadCount || 0) + 1,
          updatedAt: message.createdAt || conversation.updatedAt,
        };
      });
      if (!found) return current;
      return next.sort((a, b) => new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime());
    });
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    setConversations(current => current.map(conversation => (
      conversation.lastMessage?.id === id
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, ...patch } }
        : conversation
    )));
  }, []);

  const markMessageDeleted = useCallback((conversationId: string, messageId: string) => {
    setMessages(current => current.map(item => item.id === messageId ? { ...item, isDeleted: true, content: '' } : item));
    setConversations(current => current.map(conversation => (
      conversation.id === conversationId && conversation.lastMessage?.id === messageId
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, isDeleted: true, content: '' } }
        : conversation
    )));
  }, []);

  const refreshConversations = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    setBusy(true);
    try {
      const query = conversationSearch.trim();
      const items = query ? await api.searchConversations(query, activeToken) : await api.conversations(activeToken);
      setConversations(items);
      setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Chargement conversations impossible.');
    } finally {
      setBusy(false);
    }
  }, [conversationSearch, token]);

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

  useEffect(() => {
    if (!token || activeTab !== 'chats' || selected) return;
    const query = conversationSearch.trim();
    const requestId = conversationSearchRequestRef.current + 1;
    conversationSearchRequestRef.current = requestId;
    const timer = setTimeout(() => {
      setBusy(true);
      (query ? api.searchConversations(query, token) : api.conversations(token))
        .then(items => {
          if (conversationSearchRequestRef.current !== requestId) return;
          setConversations(items);
          setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
        })
        .catch(error => {
          if (conversationSearchRequestRef.current !== requestId) return;
          setNotice(error instanceof Error ? error.message : 'Recherche conversations impossible.');
        })
        .finally(() => {
          if (conversationSearchRequestRef.current === requestId) setBusy(false);
        });
    }, query ? 280 : 0);
    return () => clearTimeout(timer);
  }, [activeTab, conversationSearch, selected, token]);

  const completeOnboarding = useCallback(async (nextSession: AuthSession) => {
    await saveSession(nextSession);
    setSession(nextSession);
    setNotice('');
    setSelected(null);
    setActiveTab('chats');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await refreshConversations(nextSession.token);
    runMediaSync(nextSession.token, nextSession.user.id);
  }, [refreshConversations, runMediaSync]);

  const loadMessages = useCallback(async (conversation: Conversation, activeToken = token) => {
    if (!activeToken) return;
    setActiveTab('chats');
    setSelected(conversation);
    setMessageSearch('');
    resetMessageActions();
    setBusy(true);
    try {
      const socket = ensureNativeSocket(activeToken);
      socket.emit('conversation:join', { conversationId: conversation.id });
      const items = await api.messages(conversation.id, activeToken);
      setMessages(items);
      const lastIncoming = [...items].reverse().find(item => item.senderId !== sessionRef.current?.user.id);
      if (lastIncoming) socket.emit('message:read', { conversationId: conversation.id, messageId: lastIncoming.id });
      setConversations(current => current.map(item => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
      setNotice('');
      runMediaSync(activeToken, session?.user.id, items);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Messages indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [resetMessageActions, runMediaSync, session?.user.id, token]);

  const openConversationById = useCallback(async (conversationId: string, activeToken = token) => {
    if (!activeToken || !conversationId) return;
    setBusy(true);
    setNotice('');
    try {
      const items = await api.conversations(activeToken);
      setConversations(items);
      const conversation = items.find(item => item.id === conversationId);
      if (!conversation) {
        setActiveTab('chats');
        setSelected(null);
        setNotice('Conversation introuvable ou non autorisee pour ce compte.');
        return;
      }
      await loadMessages(conversation, activeToken);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ouverture conversation impossible.');
    } finally {
      setBusy(false);
    }
  }, [loadMessages, token]);

  const openConversationFromFeature = useCallback((conversation: Conversation) => {
    setActiveTab('chats');
    void loadMessages(conversation);
  }, [loadMessages]);

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

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      const saved = await loadSession();
      if (saved) {
        setSession(saved);
        await refreshConversations(saved.token);
        await refreshLocalMediaIndex();
        runMediaSync(saved.token, saved.user.id);
      }
    } finally {
      setLoading(false);
    }
  }, [refreshConversations, refreshLocalMediaIndex, runMediaSync]);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    configureAndroidNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
      profileImageSize: 240,
    });
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    registerPushToken(session.token)
      .catch(error => {
        console.info('[NativeNotifications]', {
          event: 'push-register-error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    refreshLocalMediaIndex().catch(() => null);
    runMediaSync(session.token, session.user.id);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runMediaSync(session.token, session.user.id);
      }
    });
    return () => subscription.remove();
  }, [refreshLocalMediaIndex, runMediaSync, session?.token, session?.user.id]);

  const verifyPaystackReturn = useCallback(async (url: string) => {
    const parsed = parsePaystackDeepLink(url);
    const activeSession = sessionRef.current;
    if (!parsed || !activeSession?.token) return;
    setBusy(true);
    setNotice('Vérification Paystack en cours...');
    try {
      if (parsed.scope === 'ai') await api.aiAutoVerifyPaystack(activeSession.token, parsed.reference);
      else if (parsed.scope === 'flyer') await api.aiFlyerVerifyPaystack(activeSession.token, parsed.reference);
      else if (parsed.scope === 'video') await api.aiVideoVerifyPaystack(activeSession.token, parsed.reference);
      else await api.businessVerifyPaystack(activeSession.token, parsed.reference);
      setActiveTab(parsed.scope === 'business' ? 'business' : 'payments');
      setSelected(null);
      setNotice('Paiement vérifié côté serveur.');
      await refreshConversations(activeSession.token);
    } catch (error) {
      setActiveTab('payments');
      setSelected(null);
      setNotice(error instanceof Error ? error.message : 'Vérification Paystack impossible.');
    } finally {
      setBusy(false);
    }
  }, [refreshConversations]);

  const handleNativeDeepLink = useCallback(async (url: string) => {
    const callAction = parseCallActionDeepLink(url);
    if (callAction) {
      setSelected(null);
      setActiveTab('chats');
      if (callAction.conversationId) {
        openConversationById(callAction.conversationId).catch(() => null);
      }
      if (callAction.action === 'open') {
        if (callAction.callId) {
          const prepared = await prepareIncomingCall(callAction.callId);
          setNotice(prepared ? 'Appel ouvert depuis la notification.' : 'Appel entrant introuvable ou deja termine.');
        } else {
          setNotice('');
        }
        return;
      }
      if (callAction.action === 'accept') {
        if (currentCallId && (!callAction.callId || callAction.callId === currentCallId)) {
          clearPendingCallAction();
          await answerNativeCall(true);
        } else if (callAction.callId && await prepareIncomingCall(callAction.callId)) {
          clearPendingCallAction();
          await answerNativeCall(true);
        } else {
          queuePendingCallAction({ action: 'accept', callId: callAction.callId, conversationId: callAction.conversationId });
          setNotice('Appel entrant en cours de synchronisation...');
        }
      } else if (callAction.action === 'reject') {
        if (currentCallId && (!callAction.callId || callAction.callId === currentCallId)) {
          clearPendingCallAction();
          await answerNativeCall(false);
        } else if (callAction.callId && await prepareIncomingCall(callAction.callId)) {
          clearPendingCallAction();
          await answerNativeCall(false);
        } else {
          queuePendingCallAction({ action: 'reject', callId: callAction.callId, conversationId: callAction.conversationId });
          setNotice('Refus de l’appel en attente de synchronisation...');
        }
      }
      return;
    }
    const conversationTarget = parseConversationTarget(url);
    if (conversationTarget) {
      await openConversationById(conversationTarget.conversationId);
      if (conversationTarget.callId) {
        const prepared = await prepareIncomingCall(conversationTarget.callId);
        setNotice(prepared ? 'Appel ouvert depuis la notification.' : 'Appel entrant introuvable ou deja termine.');
      }
      return;
    }
    await verifyPaystackReturn(url);
  }, [answerNativeCall, clearPendingCallAction, currentCallId, openConversationById, prepareIncomingCall, queuePendingCallAction, verifyPaystackReturn]);

  const handleNotificationResponse = useCallback((response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data || {};
    const url = typeof data.url === 'string' ? data.url : null;
    const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null;
    const callId = typeof data.callId === 'string' ? data.callId : null;
    const type = typeof data.type === 'string' ? data.type : '';
    if (url) {
      void handleNativeDeepLink(url);
    } else if ((type === 'call' || type === 'call-sync') && callId) {
      void handleNativeDeepLink(`oraclemessenger://call?action=open&callId=${encodeURIComponent(callId)}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`);
    } else if (conversationId) {
      void openConversationById(conversationId);
    } else if (callId) {
      void handleNativeDeepLink(`oraclemessenger://call?action=open&callId=${encodeURIComponent(callId)}`);
    }
  }, [handleNativeDeepLink, openConversationById]);

  useEffect(() => {
    if (!session?.token) return;
    if (initialDeepLinkHandledRef.current) return;
    initialDeepLinkHandledRef.current = true;
    Linking.getInitialURL()
      .then(url => {
        if (url) void handleNativeDeepLink(url);
      })
      .catch(() => null);
  }, [handleNativeDeepLink, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    const subscription = Linking.addEventListener('url', event => {
      void handleNativeDeepLink(event.url);
    });
    return () => subscription.remove();
  }, [handleNativeDeepLink, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    if (!initialNotificationResponseHandledRef.current) {
      initialNotificationResponseHandledRef.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then(response => {
          if (response) handleNotificationResponse(response);
        })
        .catch(() => null);
    }
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data || {};
      const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null;
      const type = typeof data.type === 'string' ? data.type : '';
      if (type === 'message' && conversationId && selectedRef.current?.id === conversationId) {
        const socket = ensureNativeSocket(session.token);
        socket.emit('conversation:join', { conversationId });
      }
    });
    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [handleNotificationResponse, session?.token]);

  useEffect(() => () => {
    clearMediaRefreshTimers();
  }, [clearMediaRefreshTimers]);

  useEffect(() => {
    if (!session?.token) return;
    const socket = ensureNativeSocket(session.token);

    const onMessageNew = (message: Message) => {
      upsertMessage(message);
      if (message.senderId !== sessionRef.current?.user.id) {
        socket.emit('message:delivered', { messageId: message.id });
        if (selectedRef.current?.id === message.conversationId) {
          socket.emit('message:read', { conversationId: message.conversationId, messageId: message.id });
        }
        runMediaSync(session.token, session.user.id, [message]);
      }
    };

    const onConversationUpsert = (conversation: Conversation) => {
      upsertConversation(conversation);
    };

    const onMessageUpdate = ({ id, patch }: { id: string; patch: Partial<Message> }) => {
      patchMessage(id, patch);
    };

    const onConversationRead = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (userId === sessionRef.current?.user.id) {
        setConversations(current => current.map(item => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
        return;
      }
      setMessages(current => current.map(item => (
        item.conversationId === conversationId && item.senderId === sessionRef.current?.user.id
          ? { ...item, status: 'read' }
          : item
      )));
    };

    const onMessageDelete = ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      markMessageDeleted(conversationId, messageId);
    };

    socket.on('message:new', onMessageNew);
    socket.on('conversation:upsert', onConversationUpsert);
    socket.on('message:update', onMessageUpdate);
    socket.on('conversation:read', onConversationRead);
    socket.on('message:delete', onMessageDelete);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('conversation:upsert', onConversationUpsert);
      socket.off('message:update', onMessageUpdate);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
    };
  }, [handleTypingStart, handleTypingStop, handleUserOffline, handleUserOnline, markMessageDeleted, patchMessage, runMediaSync, session?.token, session?.user.id, upsertConversation, upsertMessage]);

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setNotice('');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signOut().catch(() => {});
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken;
      if (!idToken) {
        setNotice('Google n’a pas renvoyé de jeton de connexion.');
        return;
      }
      const next = await api.authGoogle(idToken);
      await saveSession(next);
      setSession(next);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshConversations(next.token);
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      const message = error instanceof Error ? error.message : 'Connexion Google impossible.';
      setNotice(message.includes('DEVELOPER_ERROR')
        ? 'Connexion Google bloquée par la configuration Google Cloud.'
        : message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [refreshConversations]);

  const send = useCallback(async () => {
    const clean = draft.trim();
    if (!clean || !selected || !token) return;
    setDraft('');
    try {
      const socket = ensureNativeSocket(token);
      if (editingMessage) {
        socket.emit('message:edit', { messageId: editingMessage.id, content: clean });
        const message = await api.editMessage(editingMessage.id, token, clean);
        patchMessage(editingMessage.id, { content: message.content, isEdited: true, updatedAt: message.updatedAt });
        setEditingMessage(null);
      } else {
        const message = await socketAck<Message>(socket, 'message:send', {
          conversationId: selected.id,
          content: clean,
          type: 'text',
          replyToId: replyTo?.id,
        }).catch(() => api.sendMessage(selected.id, token, clean, 'text', replyTo?.id));
        upsertMessage({ ...message, status: message.status || 'sent', replyTo: replyTo || message.replyTo });
        setReplyTo(null);
      }
      await refreshConversations();
    } catch (error) {
      setDraft(clean);
      setNotice(error instanceof Error ? error.message : 'Envoi impossible.');
    }
  }, [draft, editingMessage, patchMessage, refreshConversations, replyTo, selected, token, upsertMessage]);

  const { sendMedia, attachImage, attachDocument } = useNativeMessageMedia({
    selected,
    token,
    refreshConversations,
    upsertMessage,
    setBusy,
    setNotice,
  });

  const { voiceRecording, voiceStartedAt, toggleVoiceRecording, cancelVoiceRecording } = useNativeVoiceRecorder({
    enabled: Boolean(selected && token),
    sendMedia,
    setBusy,
    setNotice,
  });

  const logout = useCallback(async () => {
    await cancelVoiceRecording(false);
    await clearSession();
    setSession(null);
    setSelected(null);
    setReplyTo(null);
    setEditingMessage(null);
    setMessageSearch('');
    resetMessageActions();
    setActiveTab('chats');
    setMessages([]);
    setConversations([]);
  }, [cancelVoiceRecording, resetMessageActions]);

  const headerSubtitle = useMemo(() => {
    if (session?.user?.name) return `${session.user.name} • ${ANDROID_PACKAGE}`;
    return `${ANDROID_PACKAGE} • baseline ${NATIVE_BASELINE}`;
  }, [session?.user?.name]);

  const visibleMessages = useMemo(() => {
    const needle = messageSearch.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter(message => {
      const haystack = [
        message.content,
        message.sender?.name,
        message.type,
        message.replyTo?.content,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [messageSearch, messages]);

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
    <SafeAreaView style={styles.app}>
      <NativeCallOverlay call={nativeCall} />
      <NativeHomeShellHeader
        subtitle={headerSubtitle}
        tabs={visibleTabs}
        activeTab={activeTab}
        onRefresh={() => refreshConversations()}
        onTabPress={tab => { setActiveTab(tab); if (tab !== 'chats') setSelected(null); }}
      />

      {notice ? <Text style={styles.banner}>{notice}</Text> : null}

      {activeTab !== 'chats' && session ? (
        <NativeFeaturePage
          tab={activeTab}
          session={session}
          onOpenConversation={openConversationFromFeature}
          onRefreshConversations={() => refreshConversations()}
          onLogout={logout}
        />
      ) : selected ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatPanel}>
          <NativeChatHeader
            presenceText={presenceText}
            callNotice={nativeCall.callNotice}
            messageSearch={messageSearch}
            onBack={() => setSelected(null)}
            onStartAudioCall={() => nativeCall.startCall(selected, 'audio')}
            onStartVideoCall={() => nativeCall.startCall(selected, 'video')}
            onMessageSearchChange={setMessageSearch}
          />
          <NativeMessageActionPanels
            selectedCount={selectedMessageIds.length}
            selectedMessages={selectedMessages}
            forwardMessages={forwardMessages}
            conversations={conversations}
            activeConversationId={selected.id}
            onShare={shareMessages}
            onBeginForward={beginForward}
            onDeleteSelected={deleteSelectedOwnMessages}
            onClearSelection={clearMessageSelection}
            onClearForward={clearForwardMessages}
            onForwardToConversation={forwardToConversation}
          />
          <NativeMessageList
            messages={visibleMessages}
            currentUserId={session.user.id}
            currentUserName={session.user.name}
            currentUserAvatar={session.user.avatar}
            selectedMessageIds={selectedMessageIds}
            localMediaByMessageId={localMediaByMessageId}
            messageSearch={messageSearch}
            onToggleSelection={toggleMessageSelection}
            onOpenMessageActions={openMessageActions}
          />
          <NativeChatComposer
            draft={draft}
            replyTo={replyTo}
            editingMessage={editingMessage}
            voiceRecording={voiceRecording}
            voiceStartedAt={voiceStartedAt}
            busy={busy}
            onDraftChange={handleDraftChange}
            onClearContext={() => { setReplyTo(null); setEditingMessage(null); setDraft(''); }}
            onCancelVoiceRecording={cancelVoiceRecording}
            onAttachImage={attachImage}
            onAttachDocument={attachDocument}
            onToggleVoiceRecording={toggleVoiceRecording}
            onSend={send}
          />
        </KeyboardAvoidingView>
      ) : (
        <NativeConversationList
          conversations={conversations}
          search={conversationSearch}
          busy={busy}
          onSearchChange={setConversationSearch}
          onOpenConversation={conversation => { setActiveTab('chats'); loadMessages(conversation); }}
          onConversationActions={openConversationActions}
          onLogout={logout}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  banner: { margin: 12, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
  chatPanel: { flex: 1 },
});
