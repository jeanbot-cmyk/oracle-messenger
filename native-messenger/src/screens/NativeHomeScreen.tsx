import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, NativeModules, PermissionsAndroid, Platform, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { RefreshCcw } from 'lucide-react-native';
import { ANDROID_PACKAGE, GOOGLE_WEB_CLIENT_ID, NATIVE_BASELINE } from '@/config/env';
import { useNativeCall } from '@/hooks/useNativeCall';
import { NativeChatComposer } from '@/screens/home/NativeChatComposer';
import { NativeChatHeader } from '@/screens/home/NativeChatHeader';
import { NativeCallOverlay } from '@/screens/home/NativeCallOverlay';
import { NativeConversationList } from '@/screens/home/NativeConversationList';
import { NativeMessageActionPanels } from '@/screens/home/NativeMessageActionPanels';
import { NativeMessageList } from '@/screens/home/NativeMessageList';
import { NativeOnboarding } from '@/screens/home/NativeOnboarding';
import { conversationName, messagePreview, parseCallActionDeepLink, parseConversationTarget, parsePaystackDeepLink, socketAck, sortMessages } from '@/screens/home/homeUtils';
import { NativeFeaturePage, type NativeTabKey, useVisibleTabs } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import { readLocalGalleryItems, type LocalGalleryItem } from '@/services/localMedia';
import { syncPendingMedia, type MediaSyncResult } from '@/services/mediaSync';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { configureAndroidNotifications, registerPushToken } from '@/services/notifications';
import { clearSession, loadSession, saveSession } from '@/services/session';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

async function fileToDataUrl(uri: string, mime = 'application/octet-stream') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

type VoiceRecordingResult = { uri: string; name: string; mime: string; size: number; durationMs: number };
type PendingCallAction = { action: 'accept' | 'reject'; callId?: string | null; conversationId?: string | null };

const OracleVoiceRecorder = NativeModules.OracleVoiceRecorder as {
  start?: () => Promise<{ uri: string; startedAt: number }>;
  stop?: () => Promise<VoiceRecordingResult>;
  cancel?: () => Promise<boolean>;
} | undefined;

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
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [localMediaByMessageId, setLocalMediaByMessageId] = useState<Record<string, LocalGalleryItem>>({});
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceStartedAt, setVoiceStartedAt] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<NativeTabKey>('chats');
  const [typingByConversation, setTypingByConversation] = useState<Record<string, Record<string, string>>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingCallActionRef = useRef<PendingCallAction | null>(null);
  const pendingCallActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const refreshLocalMediaIndex = useCallback(async () => {
    try {
      const items = await readLocalGalleryItems();
      setLocalMediaByMessageId(Object.fromEntries(items.map(item => [item.messageId, item])));
    } catch {
      setLocalMediaByMessageId({});
    }
  }, []);

  const clearMediaRefreshTimers = useCallback(() => {
    for (const timer of mediaRefreshTimersRef.current) clearTimeout(timer);
    mediaRefreshTimersRef.current = [];
  }, []);

  const clearPendingCallAction = useCallback(() => {
    if (pendingCallActionTimerRef.current) clearTimeout(pendingCallActionTimerRef.current);
    pendingCallActionTimerRef.current = null;
    pendingCallActionRef.current = null;
  }, []);

  const queuePendingCallAction = useCallback((action: PendingCallAction) => {
    if (!action.callId) {
      setNotice('Action appel invalide ou expirée.');
      return;
    }
    clearPendingCallAction();
    pendingCallActionRef.current = action;
    pendingCallActionTimerRef.current = setTimeout(() => {
      pendingCallActionRef.current = null;
      pendingCallActionTimerRef.current = null;
      setNotice('Appel entrant introuvable ou deja termine.');
    }, 45000);
  }, [clearPendingCallAction]);

  const scheduleMediaIndexRefreshes = useCallback((result?: MediaSyncResult) => {
    if (!result?.queuedNativeMessageIds.length) return;
    clearMediaRefreshTimers();
    mediaRefreshTimersRef.current = [1500, 5000, 12000, 30000].map(delay => (
      setTimeout(() => {
        refreshLocalMediaIndex().catch(() => null);
      }, delay)
    ));
  }, [clearMediaRefreshTimers, refreshLocalMediaIndex]);

  const runMediaSync = useCallback((activeToken: string, currentUserId?: string, knownMessages: Message[] = []) => (
    syncPendingMedia(activeToken, currentUserId, knownMessages)
      .then(result => {
        scheduleMediaIndexRefreshes(result);
        return result;
      })
      .finally(() => refreshLocalMediaIndex().catch(() => null))
      .catch(() => null)
  ), [refreshLocalMediaIndex, scheduleMediaIndexRefreshes]);

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
    setSelectedMessageIds([]);
    setForwardMessages([]);
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
  }, [runMediaSync, session?.user.id, token]);

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

  useEffect(() => {
    const pending = pendingCallActionRef.current;
    if (!pending || !currentCallId) return;
    if (pending.callId && pending.callId !== currentCallId) return;
    clearPendingCallAction();
    answerNativeCall(pending.action === 'accept').catch(error => {
      setNotice(error instanceof Error ? error.message : 'Action appel impossible.');
    });
  }, [answerNativeCall, clearPendingCallAction, currentCallId]);

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
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    clearMediaRefreshTimers();
    clearPendingCallAction();
  }, [clearMediaRefreshTimers, clearPendingCallAction]);

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

    const onTypingStart = ({ conversationId, userId, userName }: { conversationId: string; userId: string; userName?: string }) => {
      if (userId === sessionRef.current?.user.id) return;
      setTypingByConversation(current => ({
        ...current,
        [conversationId]: {
          ...(current[conversationId] || {}),
          [userId]: userName || 'Contact',
        },
      }));
    };

    const onTypingStop = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      setTypingByConversation(current => {
        const nextForConversation = { ...(current[conversationId] || {}) };
        delete nextForConversation[userId];
        return { ...current, [conversationId]: nextForConversation };
      });
    };

    const onOnline = ({ userId }: { userId: string }) => {
      setOnlineUsers(current => new Set([...current, userId]));
    };

    const onOffline = ({ userId }: { userId: string }) => {
      setOnlineUsers(current => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    };

    socket.on('message:new', onMessageNew);
    socket.on('conversation:upsert', onConversationUpsert);
    socket.on('message:update', onMessageUpdate);
    socket.on('conversation:read', onConversationRead);
    socket.on('message:delete', onMessageDelete);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('user:online', onOnline);
    socket.on('user:offline', onOffline);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('conversation:upsert', onConversationUpsert);
      socket.off('message:update', onMessageUpdate);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('user:online', onOnline);
      socket.off('user:offline', onOffline);
    };
  }, [markMessageDeleted, patchMessage, refreshLocalMediaIndex, runMediaSync, session?.token, session?.user.id, upsertConversation, upsertMessage]);

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

  const sendMedia = useCallback(async (input: { uri: string; name?: string; mime?: string; kind: 'image' | 'file' | 'video' | 'audio' | 'voice' }) => {
    if (!selected || !token) return false;
    setBusy(true);
    setNotice('');
    try {
      const mime = input.mime || 'application/octet-stream';
      const uploaded = await api.mediaUpload(token, {
        dataUrl: await fileToDataUrl(input.uri, mime),
        name: input.name,
        mime,
        kind: input.kind,
      });
      const payload = JSON.stringify({
        url: uploaded.url,
        size: uploaded.size,
        checksum: uploaded.checksum,
        mime: uploaded.mime,
        name: uploaded.name,
      });
      const socket = ensureNativeSocket(token);
      const message = await socketAck<Message>(socket, 'message:send', {
        conversationId: selected.id,
        content: payload,
        type: input.kind,
      }).catch(() => api.sendMessage(selected.id, token, payload, input.kind));
      upsertMessage({ ...message, status: message.status || 'sent' });
      await refreshConversations();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Envoi média impossible.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshConversations, selected, token, upsertMessage]);

  const attachImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour envoyer une image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.86,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      name: asset.fileName || `media-${Date.now()}`,
      mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: asset.type === 'video' ? 'video' : 'image',
    });
  }, [sendMedia]);

  const attachDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType || 'application/octet-stream',
      kind: asset.mimeType?.startsWith('audio/') ? 'audio' : 'file',
    });
  }, [sendMedia]);

  const ensureRecordAudioPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted) return true;
    const response = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone',
      message: 'Oracle Messenger utilise le microphone pour enregistrer les messages vocaux.',
      buttonPositive: 'Autoriser',
      buttonNegative: 'Refuser',
    });
    return response === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const toggleVoiceRecording = useCallback(async () => {
    if (!selected || !token) return;
    if (!OracleVoiceRecorder?.start || !OracleVoiceRecorder?.stop) {
      setNotice('Enregistrement vocal natif indisponible sur cette build.');
      return;
    }
    if (!voiceRecording) {
      const permitted = await ensureRecordAudioPermission();
      if (!permitted) {
        setNotice('Permission microphone refusee. Message vocal impossible.');
        return;
      }
      try {
        const started = await OracleVoiceRecorder.start();
        setVoiceRecording(true);
        setVoiceStartedAt(started.startedAt || Date.now());
        setNotice('Enregistrement vocal en cours.');
      } catch (error) {
        setVoiceRecording(false);
        setVoiceStartedAt(null);
        setNotice(error instanceof Error ? error.message : 'Demarrage vocal impossible.');
      }
      return;
    }

    setBusy(true);
    try {
      const recording = await OracleVoiceRecorder.stop();
      setVoiceRecording(false);
      setVoiceStartedAt(null);
      if (!recording.uri || !recording.size) {
        setNotice('Message vocal vide.');
        return;
      }
      const sent = await sendMedia({
        uri: recording.uri,
        name: recording.name || `voice-${Date.now()}.m4a`,
        mime: recording.mime || 'audio/mp4',
        kind: 'voice',
      });
      if (sent) setNotice('Message vocal envoye.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Envoi vocal impossible.');
    } finally {
      setBusy(false);
    }
  }, [ensureRecordAudioPermission, selected, sendMedia, token, voiceRecording]);

  const cancelVoiceRecording = useCallback(async () => {
    await OracleVoiceRecorder?.cancel?.().catch(() => null);
    setVoiceRecording(false);
    setVoiceStartedAt(null);
    setNotice('Enregistrement vocal annule.');
  }, []);

  const deleteOwnMessage = useCallback((message: Message) => {
    if (!token || message.senderId !== session?.user.id) return;
    const socket = ensureNativeSocket(token);
    socket.emit('message:delete', { conversationId: message.conversationId, messageId: message.id });
    api.deleteMessage(message.id, token)
      .then(() => {
        markMessageDeleted(message.conversationId, message.id);
        refreshConversations().catch(() => null);
      })
      .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression impossible.'));
  }, [markMessageDeleted, refreshConversations, session?.user.id, token]);

  const selectedMessages = useMemo(() => {
    if (!selectedMessageIds.length) return [];
    const ids = new Set(selectedMessageIds);
    return messages.filter(message => ids.has(message.id));
  }, [messages, selectedMessageIds]);

  const reactToMessage = useCallback((message: Message, emoji: string | null) => {
    if (!token) return;
    const socket = ensureNativeSocket(token);
    socket.emit('message:react', { messageId: message.id, emoji });
  }, [token]);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(current => (
      current.includes(messageId)
        ? current.filter(id => id !== messageId)
        : [...current, messageId]
    ));
  }, []);

  const shareMessages = useCallback(async (items: Message[]) => {
    const body = items.map(message => messagePreview(message) === message.content ? message.content : `${messagePreview(message)}: ${message.content}`).join('\n\n');
    if (!body.trim()) return;
    try {
      await Share.share({ message: body });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage impossible.');
    }
  }, []);

  const beginForward = useCallback((items: Message[]) => {
    const valid = items.filter(message => !message.isDeleted);
    if (!valid.length) return;
    setForwardMessages(valid.slice(0, 50));
    setSelectedMessageIds([]);
  }, []);

  const forwardToConversation = useCallback(async (conversation: Conversation) => {
    if (!token || !forwardMessages.length) return;
    setBusy(true);
    setNotice('');
    try {
      const socket = ensureNativeSocket(token);
      for (const message of forwardMessages) {
        const forwarded = await socketAck<Message>(socket, 'message:send', {
          conversationId: conversation.id,
          content: message.content,
          type: message.type,
        }).catch(() => api.sendMessage(conversation.id, token, message.content, message.type));
        if (selected?.id === conversation.id) upsertMessage({ ...forwarded, status: forwarded.status || 'sent' });
      }
      setForwardMessages([]);
      await refreshConversations();
      setNotice(forwardMessages.length > 1 ? 'Messages transférés.' : 'Message transféré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Transfert impossible.');
    } finally {
      setBusy(false);
    }
  }, [forwardMessages, refreshConversations, selected?.id, token, upsertMessage]);

  const deleteSelectedOwnMessages = useCallback(() => {
    const own = selectedMessages.filter(message => message.senderId === session?.user.id && !message.isDeleted);
    if (!own.length) {
      setNotice('Aucun message sélectionné ne peut être supprimé par ce compte.');
      return;
    }
    Alert.alert('Supprimer', `${own.length} message(s) seront supprimés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          own.forEach(message => deleteOwnMessage(message));
          setSelectedMessageIds([]);
        },
      },
    ]);
  }, [deleteOwnMessage, selectedMessages, session?.user.id]);

  const openMessageActions = useCallback((message: Message) => {
    const mine = message.senderId === session?.user.id;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Répondre', onPress: () => { setReplyTo(message); setEditingMessage(null); } },
      { text: 'Réagir ❤️', onPress: () => reactToMessage(message, '❤️') },
      { text: 'Sélectionner', onPress: () => toggleMessageSelection(message.id) },
      { text: 'Transférer', onPress: () => beginForward([message]) },
      { text: 'Partager', onPress: () => shareMessages([message]) },
    ];
    if (mine && message.type === 'text' && !message.isDeleted) {
      buttons.push({ text: 'Modifier', onPress: () => { setEditingMessage(message); setReplyTo(null); setDraft(message.content); } });
      buttons.push({ text: 'Supprimer', style: 'destructive', onPress: () => deleteOwnMessage(message) });
    }
    buttons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Message', messagePreview(message), buttons);
  }, [beginForward, deleteOwnMessage, reactToMessage, session?.user.id, shareMessages, toggleMessageSelection]);

  const deleteConversation = useCallback((conversation: Conversation) => {
    if (!token) return;
    Alert.alert(
      'Supprimer la conversation',
      `La conversation "${conversationName(conversation)}" sera retirée de ce compte. Les autres participants ne seront pas supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setNotice('');
            api.deleteConversation(conversation.id, token)
              .then(async () => {
                if (selected?.id === conversation.id) {
                  setSelected(null);
                  setMessages([]);
                }
                setConversations(current => current.filter(item => item.id !== conversation.id));
                await refreshConversations();
              })
              .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression conversation impossible.'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }, [refreshConversations, selected?.id, token]);

  const openConversationActions = useCallback((conversation: Conversation) => {
    Alert.alert('Conversation', conversationName(conversation), [
      { text: 'Ouvrir', onPress: () => { setActiveTab('chats'); loadMessages(conversation); } },
      { text: 'Supprimer de mon compte', style: 'destructive', onPress: () => deleteConversation(conversation) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [deleteConversation, loadMessages]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (!token || !selected) return;
    const socket = ensureNativeSocket(token);
    socket.emit(value.trim() ? 'typing:start' : 'typing:stop', { conversationId: selected.id });
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (value.trim()) {
      typingStopTimerRef.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId: selected.id });
      }, 1800);
    }
  }, [selected, token]);

  const logout = useCallback(async () => {
    await OracleVoiceRecorder?.cancel?.().catch(() => null);
    await clearSession();
    setSession(null);
    setSelected(null);
    setReplyTo(null);
    setEditingMessage(null);
    setMessageSearch('');
    setSelectedMessageIds([]);
    setForwardMessages([]);
    setVoiceRecording(false);
    setVoiceStartedAt(null);
    setActiveTab('chats');
    setMessages([]);
    setConversations([]);
  }, []);

  const headerSubtitle = useMemo(() => {
    if (session?.user?.name) return `${session.user.name} • ${ANDROID_PACKAGE}`;
    return `${ANDROID_PACKAGE} • baseline ${NATIVE_BASELINE}`;
  }, [session?.user?.name]);

  const selectedTypingNames = useMemo(() => {
    if (!selected) return [];
    return Object.values(typingByConversation[selected.id] || {});
  }, [selected, typingByConversation]);

  const selectedOnline = useMemo(() => {
    if (!selected || !session?.user.id) return false;
    return selected.participants.some(user => user.id !== session.user.id && onlineUsers.has(user.id));
  }, [onlineUsers, selected, session?.user.id]);

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
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#FFFFFF" />
        <Text style={styles.loadingText}>Ouverture d&apos;Oracle Messenger...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.loginContent}>
          <View style={styles.loginHero}>
            <View style={styles.logo}>
              <View style={styles.logoBubble}>
                <Text style={styles.logoText}>O</Text>
              </View>
            </View>
            <Text style={styles.title}>Oracle Messenger</Text>
            <Text style={styles.subtitle}>
              Bienvenue. Connectez-vous pour retrouver vos messages.
            </Text>
            <View style={styles.heroLine} />
          </View>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Pressable
            disabled={busy}
            style={[styles.primaryButton, busy && styles.disabledButton]}
            onPress={signInWithGoogle}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.googleMark}>G</Text>}
            <Text style={styles.primaryButtonText}>Continuer avec Google</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
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
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Oracle Messenger</Text>
          <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
        </View>
        <Pressable style={styles.headerButton} onPress={() => refreshConversations()}>
          <RefreshCcw size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.tabWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {visibleTabs.map(tab => (
            <Pressable key={tab.key} onPress={() => { setActiveTab(tab.key); if (tab.key !== 'chats') setSelected(null); }} style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

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
            presenceText={selectedTypingNames.length
              ? `${selectedTypingNames.slice(0, 2).join(', ')} écrit...`
              : selectedOnline ? 'En ligne' : 'Hors ligne'}
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
            onClearSelection={() => setSelectedMessageIds([])}
            onClearForward={() => setForwardMessages([])}
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
  safe: { flex: 1, backgroundColor: colors.header },
  app: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  loginContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 34 },
  loginHero: { alignItems: 'flex-start', marginBottom: 8 },
  logo: { width: 112, height: 112, borderRadius: 30, backgroundColor: '#10998C', alignItems: 'center', justifyContent: 'center', marginBottom: 30, shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 18, elevation: 8 },
  logoBubble: { width: 66, height: 66, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#0E6F66', fontSize: 38, lineHeight: 43, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: 0, maxWidth: 330 },
  subtitle: { color: 'rgba(255,255,255,0.76)', fontSize: 16, lineHeight: 24, marginTop: 12, fontWeight: '700', maxWidth: 340 },
  heroLine: { width: 54, height: 4, borderRadius: 2, backgroundColor: '#E7C86A', marginTop: 22 },
  notice: { color: '#FEE2E2', fontSize: 13, fontWeight: '800', marginTop: 16, lineHeight: 19 },
  primaryButton: { marginTop: 30, minHeight: 58, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 14, elevation: 5 },
  disabledButton: { opacity: 0.55 },
  googleMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', color: colors.brand, textAlign: 'center', lineHeight: 24, fontSize: 15, fontWeight: '900' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  header: { backgroundColor: colors.header, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  headerSubtitle: { color: 'rgba(255,255,255,0.68)', marginTop: 3, fontSize: 12, fontWeight: '700' },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  tabWrap: { backgroundColor: colors.header, paddingBottom: 10 },
  tabBar: { paddingHorizontal: 12, gap: 8 },
  tabItem: { minHeight: 38, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  tabItemActive: { backgroundColor: colors.brand },
  tabText: { color: 'rgba(255,255,255,0.76)', fontSize: 12.5, fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
  banner: { margin: 12, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
  avatarImage: { width: '100%', height: '100%' },
  chatPanel: { flex: 1 },
});
