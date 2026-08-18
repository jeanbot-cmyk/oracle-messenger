import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@/config/env';
import { api } from '@/services/api';
import { disconnectNativeSocket } from '@/services/nativeSocket';
import { clearSession, loadSession, saveSession } from '@/services/session';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type UseNativeSessionLifecycleParams = {
  cancelVoiceRecording: (notify?: boolean) => Promise<void>;
  refreshConversations: (activeToken?: string, activeOwnerId?: string) => Promise<void>;
  refreshLocalMediaIndex: () => Promise<void>;
  resetMessageActions: () => void;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
  setActiveTab: Dispatch<SetStateAction<NativeTabKey>>;
  setBusy: (busy: boolean) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setEditingMessage: (message: Message | null) => void;
  setLoading: (loading: boolean) => void;
  setMessageSearch: (search: string) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setNotice: (message: string) => void;
  setReplyTo: (message: Message | null) => void;
  setSelected: (conversation: Conversation | null) => void;
  setSession: Dispatch<SetStateAction<AuthSession | null>>;
};

function isInvalidSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /HTTP 401|HTTP 403|Unauthorized|Forbidden|jwt expired|invalid token|No auth token/i.test(message);
}

export function useNativeSessionLifecycle({
  cancelVoiceRecording,
  refreshConversations,
  refreshLocalMediaIndex,
  resetMessageActions,
  runMediaSync,
  setActiveTab,
  setBusy,
  setConversations,
  setEditingMessage,
  setLoading,
  setMessageSearch,
  setMessages,
  setNotice,
  setReplyTo,
  setSelected,
  setSession,
}: UseNativeSessionLifecycleParams) {
  const restoreStartedRef = useRef(false);

  const completeOnboarding = useCallback(async (nextSession: AuthSession) => {
    await saveSession(nextSession);
    setSession(nextSession);
    setNotice('');
    setSelected(null);
    setActiveTab('chats');
    await refreshConversations(nextSession.token, nextSession.user.id || nextSession.user.email);
    runMediaSync(nextSession.token, nextSession.user.id);
  }, [refreshConversations, runMediaSync, setActiveTab, setNotice, setSelected, setSession]);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      const saved = await loadSession();
      if (saved) {
        await refreshLocalMediaIndex();
        setSession(saved);
        setLoading(false);
        void refreshConversations(saved.token, saved.user.id || saved.user.email);
        void runMediaSync(saved.token, saved.user.id);
        try {
          const serverUser = await api.me(saved.token);
          const verifiedSession: AuthSession = {
            ...saved,
            user: { ...saved.user, ...serverUser },
          };
          await saveSession(verifiedSession);
          setSession(verifiedSession);
          void refreshConversations(verifiedSession.token, verifiedSession.user.id || verifiedSession.user.email);
          void runMediaSync(verifiedSession.token, verifiedSession.user.id);
        } catch (error) {
          if (isInvalidSessionError(error)) {
            await clearSession();
            disconnectNativeSocket();
            setSession(null);
            setNotice('Session expirée. Reconnectez-vous avec Google.');
            return;
          }
          setNotice('Mode hors connexion : session locale non vérifiée.');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [refreshConversations, refreshLocalMediaIndex, runMediaSync, setLoading, setNotice, setSession]);

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    void restore();
  }, [restore]);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
      profileImageSize: 240,
    });
  }, []);

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
      await refreshConversations(next.token, next.user.id || next.user.email);
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      const message = error instanceof Error ? error.message : 'Connexion Google impossible.';
      setNotice(message.includes('DEVELOPER_ERROR')
        ? 'Connexion Google bloquée par la configuration Google Cloud.'
        : message);
    } finally {
      setBusy(false);
    }
  }, [refreshConversations, setBusy, setNotice, setSession]);

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
  }, [
    cancelVoiceRecording,
    resetMessageActions,
    setActiveTab,
    setConversations,
    setEditingMessage,
    setMessageSearch,
    setMessages,
    setReplyTo,
    setSelected,
    setSession,
  ]);

  return {
    completeOnboarding,
    signInWithGoogle,
    logout,
  };
}
