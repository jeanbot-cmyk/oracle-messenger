import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  parseCallActionDeepLink,
  parseConversationTarget,
  parseInviteTarget,
  parsePaystackDeepLink,
} from '@/screens/home/homeUtils';
import type { PendingNativeCallAction } from '@/screens/home/usePendingNativeCallAction';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { configureAndroidNotifications, registerPushToken } from '@/services/notifications';
import { clearPendingInvite, readPendingInvite, rememberPendingInvite } from '@/services/pendingInvite';
import type { AuthSession, Conversation } from '@/types/messenger';

type RefValue<T> = { current: T };

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
  const sessionRef = useRef<AuthSession | null>(null);
  const initialDeepLinkHandledRef = useRef(false);
  const initialNotificationResponseHandledRef = useRef(false);

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
        console.info('[NativeNotifications]', {
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
    openInviteTarget,
    prepareIncomingCall,
    queuePendingCallAction,
    setActiveTab,
    setNotice,
    setSelected,
    verifyPaystackReturn,
  ]);

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
    readPendingInvite()
      .then(username => {
        if (username) void openInviteTarget(`oraclemessenger://invite/${encodeURIComponent(username)}`);
      })
      .catch(() => undefined);
  }, [openInviteTarget, session?.token]);

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
      if (type === 'message' && conversationId && selectedRef.current?.id === conversationId && session.token) {
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
