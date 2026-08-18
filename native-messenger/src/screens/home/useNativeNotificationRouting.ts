import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppState, Linking } from 'react-native';
import { useLocalSearchParams, usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  parseCallActionDeepLink,
  parseConferenceDeepLink,
  parseConversationTarget,
  parseInviteTarget,
  parsePaystackDeepLink,
} from '@/screens/home/homeUtils';
import type { PendingNativeCallAction } from '@/screens/home/usePendingNativeCallAction';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import { nativeDebugLog } from '@/services/nativeLogger';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { configureAndroidNotifications, consumePendingIncomingCallAction, registerPushToken } from '@/services/notifications';
import { rememberPendingConference } from '@/services/pendingConference';
import { clearPendingInvite, readPendingInvite, rememberPendingInvite } from '@/services/pendingInvite';
import { clearPendingPaystackPayment, verifyPaystackScope } from '@/services/pendingPaystack';
import type { AuthSession, Conversation } from '@/types/messenger';

type RefValue<T> = { current: T };
type RouteParam = string | string[] | undefined;

function firstRouteParam(value: RouteParam) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCallAction(value: RouteParam): 'accept' | 'reject' | 'open' {
  const action = firstRouteParam(value);
  return action === 'accept' || action === 'reject' || action === 'open' ? action : 'open';
}

function buildCallDeepLinkFromRoute(pathname: string, params: {
  open?: RouteParam;
  action?: RouteParam;
  callAction?: RouteParam;
  callId?: RouteParam;
  conversationId?: RouteParam;
  conv?: RouteParam;
}) {
  const openTarget = firstRouteParam(params.open);
  if (pathname !== '/call' && openTarget !== 'call' && firstRouteParam(params.callAction) == null) return null;
  const action = normalizeCallAction(params.callAction ?? params.action);
  const callId = firstRouteParam(params.callId);
  const conversationId = firstRouteParam(params.conversationId) || firstRouteParam(params.conv);
  const query = new URLSearchParams({ action });
  if (callId) query.set('callId', callId);
  if (conversationId) query.set('conversationId', conversationId);
  return `oraclemessenger://call?${query.toString()}`;
}

function tabForPaystackScope(scope: 'ai' | 'flyer' | 'video' | 'business' | 'conference' | 'conference-book'): NativeTabKey {
  if (scope === 'ai') return 'ai';
  if (scope === 'flyer') return 'flyers';
  if (scope === 'video') return 'videos';
  if (scope === 'conference' || scope === 'conference-book') return 'meeting';
  return 'business';
}

type UseNativeNotificationRoutingParams = {
  session: AuthSession | null;
  selectedRef: RefValue<Conversation | null>;
  currentCallId: string | null;
  answerNativeCall: (accepted: boolean) => Promise<void>;
  prepareIncomingCall: (callId: string) => Promise<boolean>;
  clearPendingCallAction: () => void;
  queuePendingCallAction: (action: PendingNativeCallAction) => void;
  openConversationById: (conversationId: string, activeToken?: string) => Promise<void>;
  refreshConversations: (activeToken?: string) => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<NativeTabKey>>;
  setSelected: (conversation: Conversation | null) => void;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
};

export function useNativeNotificationRouting({
  session,
  selectedRef,
  currentCallId,
  answerNativeCall,
  prepareIncomingCall,
  clearPendingCallAction,
  queuePendingCallAction,
  openConversationById,
  refreshConversations,
  setActiveTab,
  setSelected,
  setBusy,
  setNotice,
}: UseNativeNotificationRoutingParams) {
  const routeParams = useLocalSearchParams<{
    open?: RouteParam;
    action?: RouteParam;
    callAction?: RouteParam;
    callId?: RouteParam;
    conversationId?: RouteParam;
    conv?: RouteParam;
  }>();
  const pathname = usePathname();
  const sessionRef = useRef<AuthSession | null>(null);
  const initialDeepLinkHandledRef = useRef(false);
  const initialNotificationResponseHandledRef = useRef(false);
  const pendingCallDeepLinkRef = useRef<string | null>(null);
  const handledCallActionRef = useRef({ key: '', at: 0 });

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    configureAndroidNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    registerPushToken(session.token)
      .catch(error => {
        nativeDebugLog('[NativeNotifications]', {
          event: 'push-register-error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [session?.token]);

  const verifyPaystackReturn = useCallback(async (url: string) => {
    const parsed = parsePaystackDeepLink(url);
    const activeSession = sessionRef.current;
    if (!parsed || !activeSession?.token) return;
    setBusy(true);
    setNotice('Vérification Paystack en cours...');
    try {
      await verifyPaystackScope(activeSession.token, parsed.scope, parsed.reference);
      await clearPendingPaystackPayment(parsed.reference);
      setActiveTab(tabForPaystackScope(parsed.scope));
      setSelected(null);
      setNotice('Paiement vérifié côté serveur, service débloqué.');
      await refreshConversations(activeSession.token);
    } catch (error) {
      setActiveTab('payments');
      setSelected(null);
      setNotice(error instanceof Error ? error.message : 'Vérification Paystack impossible.');
    } finally {
      setBusy(false);
    }
  }, [refreshConversations, setActiveTab, setBusy, setNotice, setSelected]);

  const openInviteTarget = useCallback(async (url: string) => {
    const inviteTarget = parseInviteTarget(url);
    const activeSession = sessionRef.current;
    if (!inviteTarget) return false;
    if (!activeSession?.token) {
      await rememberPendingInvite(inviteTarget.username);
      setNotice(`Invitation @${inviteTarget.username} gardée. Connectez-vous pour ouvrir la conversation.`);
      return true;
    }
    setBusy(true);
    setActiveTab('chats');
    setNotice(`Recherche de @${inviteTarget.username}...`);
    try {
      const invitedBy = await api.byUsername(inviteTarget.username);
      if (!invitedBy?.id) {
        setNotice('Inviteur introuvable sur Oracle Messenger.');
        return true;
      }
      if (invitedBy.id === activeSession.user.id) {
        setNotice('Ce lien est votre propre invitation.');
        return true;
      }
      const conversation = await api.createConversation(invitedBy.id, activeSession.token);
      await refreshConversations(activeSession.token);
      await openConversationById(conversation.id, activeSession.token);
      await clearPendingInvite();
      setNotice('');
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ouverture de l’invitation impossible.');
      return true;
    } finally {
      setBusy(false);
    }
  }, [openConversationById, refreshConversations, setActiveTab, setBusy, setNotice]);

  const openConferenceTarget = useCallback(async (url: string) => {
    const target = parseConferenceDeepLink(url);
    if (!target) return false;
    await rememberPendingConference(target.slug);
    setSelected(null);
    setActiveTab('meeting');
    setNotice('Salle de conférence prête à ouvrir.');
    return true;
  }, [setActiveTab, setNotice, setSelected]);

  const handleNativeDeepLink = useCallback(async (url: string) => {
    const callAction = parseCallActionDeepLink(url);
    if (callAction) {
      if (!sessionRef.current?.token) {
        pendingCallDeepLinkRef.current = url;
        setNotice('Appel entrant en cours de synchronisation...');
        return;
      }
      const actionKey = `${callAction.action}:${callAction.callId || ''}:${callAction.conversationId || ''}`;
      const handled = handledCallActionRef.current;
      if (handled.key === actionKey && Date.now() - handled.at < 1500) return;
      const markCallActionHandled = () => {
        handledCallActionRef.current = { key: actionKey, at: Date.now() };
      };
      nativeDebugLog('[NativeNotifications]', {
        event: 'call-deeplink',
        action: callAction.action,
        callId: callAction.callId,
        conversationId: callAction.conversationId,
      });
      setActiveTab('chats');
      setSelected(null);
      if (callAction.action === 'open') {
        if (callAction.callId) {
          const prepared = await prepareIncomingCall(callAction.callId);
          nativeDebugLog('[NativeNotifications]', {
            event: 'call-open-prepared',
            callId: callAction.callId,
            prepared,
          });
          setNotice(prepared ? 'Appel ouvert depuis la notification.' : 'Appel entrant introuvable ou deja termine.');
          if (prepared) markCallActionHandled();
        } else {
          setNotice('');
          markCallActionHandled();
        }
        return;
      }
      if (callAction.action === 'accept') {
        if (currentCallId && (!callAction.callId || callAction.callId === currentCallId)) {
          clearPendingCallAction();
          await answerNativeCall(true);
          markCallActionHandled();
        } else if (callAction.callId && await prepareIncomingCall(callAction.callId)) {
          clearPendingCallAction();
          nativeDebugLog('[NativeNotifications]', { event: 'call-accept-prepared', callId: callAction.callId });
          await answerNativeCall(true);
          markCallActionHandled();
        } else {
          queuePendingCallAction({ action: 'accept', callId: callAction.callId, conversationId: callAction.conversationId });
          setNotice('Appel entrant en cours de synchronisation...');
        }
      } else if (callAction.action === 'reject') {
        if (currentCallId && (!callAction.callId || callAction.callId === currentCallId)) {
          clearPendingCallAction();
          await answerNativeCall(false);
          markCallActionHandled();
        } else if (callAction.callId && await prepareIncomingCall(callAction.callId)) {
          clearPendingCallAction();
          nativeDebugLog('[NativeNotifications]', { event: 'call-reject-prepared', callId: callAction.callId });
          await answerNativeCall(false);
          markCallActionHandled();
        } else {
          queuePendingCallAction({ action: 'reject', callId: callAction.callId, conversationId: callAction.conversationId });
          setNotice('Refus de l’appel en attente de synchronisation...');
        }
      }
      return;
    }
    if (await openConferenceTarget(url)) return;
    if (await openInviteTarget(url)) return;
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
  }, [
    answerNativeCall,
    clearPendingCallAction,
    currentCallId,
    openConversationById,
    openConferenceTarget,
    openInviteTarget,
    prepareIncomingCall,
    queuePendingCallAction,
    setActiveTab,
    setNotice,
    setSelected,
    verifyPaystackReturn,
  ]);

  useEffect(() => {
    const callRouteDeepLink = buildCallDeepLinkFromRoute(pathname, routeParams);
    if (!callRouteDeepLink) return;
    void handleNativeDeepLink(callRouteDeepLink);
  }, [handleNativeDeepLink, pathname, routeParams]);

  const consumePendingNativeCallAction = useCallback(() => {
    if (!sessionRef.current?.token) return;
    consumePendingIncomingCallAction()
      .then(pending => {
        if (pending?.url) void handleNativeDeepLink(pending.url);
      })
      .catch(() => null);
  }, [handleNativeDeepLink]);

  const handleNotificationResponse = useCallback((response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data || {};
    const url = typeof data.url === 'string' ? data.url : null;
    const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null;
    const callId = typeof data.callId === 'string' ? data.callId : null;
    const type = typeof data.type === 'string' ? data.type : '';
    nativeDebugLog('[NativeNotifications]', {
      event: 'notification-response',
      type,
      callId,
      conversationId,
      hasUrl: Boolean(url),
    });
    if (url) {
      void handleNativeDeepLink(url);
    } else if ((type === 'call' || type === 'call-sync') && callId) {
      void handleNativeDeepLink(`oraclemessenger://call?action=open&callId=${encodeURIComponent(callId)}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`);
    } else if (type === 'official-message' && conversationId) {
      setActiveTab('chats');
      setSelected(null);
      void openConversationById(conversationId);
    } else if (conversationId) {
      setActiveTab('chats');
      void openConversationById(conversationId);
    } else if (callId) {
      void handleNativeDeepLink(`oraclemessenger://call?action=open&callId=${encodeURIComponent(callId)}`);
    }
  }, [handleNativeDeepLink, openConversationById, setActiveTab, setSelected]);

  useEffect(() => {
    if (initialDeepLinkHandledRef.current) return;
    initialDeepLinkHandledRef.current = true;
    Linking.getInitialURL()
      .then(url => {
        if (url) void handleNativeDeepLink(url);
      })
      .catch(() => null);
  }, [handleNativeDeepLink]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', event => {
      void handleNativeDeepLink(event.url);
    });
    return () => subscription.remove();
  }, [handleNativeDeepLink]);

  useEffect(() => {
    if (!session?.token) return;
    const pendingCallDeepLink = pendingCallDeepLinkRef.current;
    if (pendingCallDeepLink) {
      pendingCallDeepLinkRef.current = null;
      void handleNativeDeepLink(pendingCallDeepLink);
    }
    consumePendingNativeCallAction();
    readPendingInvite()
      .then(username => {
        if (username) void openInviteTarget(`oraclemessenger://invite/${encodeURIComponent(username)}`);
      })
      .catch(() => undefined);
  }, [consumePendingNativeCallAction, handleNativeDeepLink, openInviteTarget, session?.token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') consumePendingNativeCallAction();
    });
    return () => subscription.remove();
  }, [consumePendingNativeCallAction]);

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
      nativeDebugLog('[NativeNotifications]', {
        event: 'notification-received',
        type,
        callId: typeof data.callId === 'string' ? data.callId : null,
        conversationId,
        selectedConversationId: selectedRef.current?.id,
      });
      if ((type === 'message' || type === 'official-message') && conversationId && selectedRef.current?.id === conversationId && session.token) {
        const socket = ensureNativeSocket(session.token);
        socket.emit('conversation:join', { conversationId });
      }
    });
    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [handleNotificationResponse, selectedRef, session?.token]);
}
