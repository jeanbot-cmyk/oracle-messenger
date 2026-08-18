import { useCallback, useEffect, useRef } from 'react';
import { CALL_RING_TIMEOUT_SECONDS } from '@/hooks/nativeCallUtils';

export type PendingNativeCallAction = {
  action: 'accept' | 'reject';
  callId?: string | null;
  conversationId?: string | null;
};

type UsePendingNativeCallActionParams = {
  answerNativeCall: (accepted: boolean) => Promise<void>;
  currentCallId: string | null;
  onNotice: (message: string) => void;
};

export function usePendingNativeCallAction({ answerNativeCall, currentCallId, onNotice }: UsePendingNativeCallActionParams) {
  const pendingCallActionRef = useRef<PendingNativeCallAction | null>(null);
  const pendingCallActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingCallAction = useCallback(() => {
    if (pendingCallActionTimerRef.current) clearTimeout(pendingCallActionTimerRef.current);
    pendingCallActionTimerRef.current = null;
    pendingCallActionRef.current = null;
  }, []);

  const queuePendingCallAction = useCallback((action: PendingNativeCallAction) => {
    if (!action.callId) {
      onNotice('Action appel invalide ou expirée.');
      return;
    }
    clearPendingCallAction();
    pendingCallActionRef.current = action;
    pendingCallActionTimerRef.current = setTimeout(() => {
      pendingCallActionRef.current = null;
      pendingCallActionTimerRef.current = null;
      onNotice('Appel entrant introuvable ou deja termine.');
    }, CALL_RING_TIMEOUT_SECONDS * 1000);
  }, [clearPendingCallAction, onNotice]);

  useEffect(() => {
    const pending = pendingCallActionRef.current;
    if (!pending || !currentCallId) return;
    if (pending.callId && pending.callId !== currentCallId) return;
    clearPendingCallAction();
    answerNativeCall(pending.action === 'accept').catch(error => {
      onNotice(error instanceof Error ? error.message : 'Action appel impossible.');
    });
  }, [answerNativeCall, clearPendingCallAction, currentCallId, onNotice]);

  useEffect(() => () => {
    clearPendingCallAction();
  }, [clearPendingCallAction]);

  return {
    clearPendingCallAction,
    queuePendingCallAction,
  };
}
