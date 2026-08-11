import type { Dispatch, SetStateAction } from 'react';
import { useNativeCall } from '@/hooks/useNativeCall';
import { useNativeNotificationRouting } from '@/screens/home/useNativeNotificationRouting';
import { usePendingNativeCallAction } from '@/screens/home/usePendingNativeCallAction';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import type { AuthSession, Conversation } from '@/types/messenger';

type RefValue<T> = { current: T };

type UseNativeCallNotificationRoutingParams = {
  session: AuthSession | null;
  selectedRef: RefValue<Conversation | null>;
  openConversationById: (conversationId: string, activeToken?: string) => Promise<void>;
  refreshConversations: (activeToken?: string) => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<NativeTabKey>>;
  setSelected: Dispatch<SetStateAction<Conversation | null>>;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
};

export function useNativeCallNotificationRouting({
  session,
  selectedRef,
  openConversationById,
  refreshConversations,
  setActiveTab,
  setSelected,
  setBusy,
  setNotice,
}: UseNativeCallNotificationRoutingParams) {
  const nativeCall = useNativeCall(session);
  const currentCallId = nativeCall.callInfo?.callId ?? null;
  const answerNativeCall = nativeCall.answerCall;
  const prepareIncomingCall = nativeCall.prepareIncomingCall;

  const { clearPendingCallAction, queuePendingCallAction } = usePendingNativeCallAction({
    answerNativeCall,
    currentCallId,
    onNotice: setNotice,
  });

  useNativeNotificationRouting({
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
  });

  return nativeCall;
}
