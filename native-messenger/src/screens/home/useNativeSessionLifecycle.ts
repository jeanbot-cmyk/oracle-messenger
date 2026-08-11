import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import * as Haptics from 'expo-haptics';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@/config/env';
import { api } from '@/services/api';
import { clearSession, loadSession, saveSession } from '@/services/session';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

type UseNativeSessionLifecycleParams = {
  cancelVoiceRecording: (notify?: boolean) => Promise<void>;
  refreshConversations: (activeToken?: string) => Promise<void>;
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
  const completeOnboarding = useCallback(async (nextSession: AuthSession) => {
    await saveSession(nextSession);
    setSession(nextSession);
    setNotice('');
    setSelected(null);
    setActiveTab('chats');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await refreshConversations(nextSession.token);
    runMediaSync(nextSession.token, nextSession.user.id);
  }, [refreshConversations, runMediaSync, setActiveTab, setNotice, setSelected, setSession]);

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
  }, [refreshConversations, refreshLocalMediaIndex, runMediaSync, setLoading, setSession]);

  useEffect(() => {
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
