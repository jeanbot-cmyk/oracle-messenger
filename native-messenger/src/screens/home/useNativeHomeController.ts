import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useNativeCallNotificationRouting } from '@/screens/home/useNativeCallNotificationRouting';
import { useNativeHomeMessaging } from '@/screens/home/useNativeHomeMessaging';
import { useNativeHomeSessionController } from '@/screens/home/useNativeHomeSessionController';
import { useNativeHomeSessionState } from '@/screens/home/useNativeHomeSessionState';
import { useNativeHomeUiState } from '@/screens/home/useNativeHomeUiState';
import { useNativeHomeViewModel } from '@/screens/home/useNativeHomeViewModel';
import { useNativeMediaSync } from '@/screens/home/useNativeMediaSync';
import { useNativeMediaSyncLifecycle } from '@/screens/home/useNativeMediaSyncLifecycle';
import { rememberPendingConference } from '@/services/pendingConference';

type RouteParam = string | string[] | undefined;

function firstRouteParam(value: RouteParam) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanRouteSlug(value: RouteParam) {
  const raw = firstRouteParam(value)?.trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

export function useNativeHomeController() {
  const routeParams = useLocalSearchParams<{ open?: RouteParam; conference?: RouteParam }>();
  const handledConferenceRouteRef = useRef('');
  const { session, setSession } = useNativeHomeSessionState();
  const ui = useNativeHomeUiState();
  const { localMediaByMessageId, refreshLocalMediaIndex, clearMediaRefreshTimers, runMediaSync } = useNativeMediaSync();
  const messaging = useNativeHomeMessaging({
    session,
    ui,
    runMediaSync,
  });
  const { setActiveTab, setNotice } = ui;
  const { setSelected } = messaging;

  useEffect(() => {
    const openTarget = firstRouteParam(routeParams.open);
    const conferenceSlug = cleanRouteSlug(routeParams.conference);
    if (openTarget !== 'conference' && !conferenceSlug) return;
    const key = conferenceSlug || 'conference';
    if (handledConferenceRouteRef.current === key) return;
    handledConferenceRouteRef.current = key;
    if (conferenceSlug) void rememberPendingConference(conferenceSlug);
    setSelected(null);
    setActiveTab('meeting');
    setNotice(conferenceSlug ? 'Lien reçu. Ouverture de la salle de conférence...' : 'Salle de conférence ouverte.');
    router.replace('/');
  }, [routeParams.conference, routeParams.open, setActiveTab, setNotice, setSelected]);

  const nativeCall = useNativeCallNotificationRouting({
    session,
    selectedRef: messaging.selectedRef,
    openConversationById: messaging.conversationsController.openConversationById,
    refreshConversations: messaging.refreshConversations,
    setActiveTab: ui.setActiveTab,
    setSelected: messaging.setSelected,
    setBusy: ui.setBusy,
    setNotice: ui.setNotice,
  });

  useNativeMediaSyncLifecycle({
    session,
    refreshLocalMediaIndex,
    clearMediaRefreshTimers,
    runMediaSync,
  });

  const { completeOnboarding, signInWithGoogle, logout } = useNativeHomeSessionController({
    messaging,
    ui,
    refreshLocalMediaIndex,
    runMediaSync,
    setSession,
  });

  const { needsOnboarding, shellProps } = useNativeHomeViewModel({
    session,
    nativeCall,
    conversations: messaging.conversations,
    selected: messaging.selected,
    visibleMessages: messaging.visibleMessages,
    localMediaByMessageId,
    composer: messaging.composer,
    conversationsController: messaging.conversationsController,
    refreshConversations: messaging.refreshConversations,
    logout,
    ui,
    setSelected: messaging.setSelected,
  });

  return {
    loading: ui.loading,
    session,
    needsOnboarding,
    notice: ui.notice,
    busy: ui.busy,
    completeOnboarding,
    signInWithGoogle,
    logout,
    shellProps,
  };
}
