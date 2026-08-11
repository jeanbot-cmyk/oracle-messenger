import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { type NativeCallInfo, type NativeCallState } from '@/hooks/nativeCallUtils';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { showIncomingCallNotification } from '@/services/notifications';

type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;

type WebRtcSessionEvent = {
  callId: string;
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
};

type WebRtcIceEvent = {
  callId: string;
  fromUserId: string;
  candidate: RTCIceCandidateInit;
};

type UseNativeCallSocketEventsParams = {
  sessionToken?: string;
  currentUserId?: string;
  socketRef: RefValue<Socket | null>;
  callInfoRef: RefValue<NativeCallInfo | null>;
  callStateRef: RefValue<NativeCallState>;
  cleanup: (emitEnd?: boolean) => void;
  setInfoSafe: (next: NativeCallInfo | null) => void;
  setStateSafe: (next: NativeCallState) => void;
  setCallNotice: (message: string) => void;
  sendOffer: (targetUserId: string) => Promise<void>;
  handleOffer: (data: WebRtcSessionEvent) => Promise<void>;
  handleAnswer: (data: WebRtcSessionEvent) => Promise<void>;
  handleIce: (data: WebRtcIceEvent) => Promise<void>;
  trace: NativeCallTrace;
};

export function useNativeCallSocketEvents({
  sessionToken,
  currentUserId,
  socketRef,
  callInfoRef,
  callStateRef,
  cleanup,
  setInfoSafe,
  setStateSafe,
  setCallNotice,
  sendOffer,
  handleOffer,
  handleAnswer,
  handleIce,
  trace,
}: UseNativeCallSocketEventsParams) {
  useEffect(() => {
    if (!sessionToken) return;
    const socket = ensureNativeSocket(sessionToken);
    socketRef.current = socket;

    const onIncoming = (data: NativeCallInfo) => {
      if (callInfoRef.current?.callId === data.callId) {
        socket.emit('call:incoming:received', { callId: data.callId, conversationId: data.conversationId });
        return;
      }
      if (callStateRef.current !== 'idle') {
        socket.emit('call:answer', { callId: data.callId, accepted: false });
        return;
      }
      setInfoSafe(data);
      setStateSafe('incoming');
      socket.emit('call:incoming:received', { callId: data.callId, conversationId: data.conversationId });
      showIncomingCallNotification({
        callId: data.callId,
        conversationId: data.conversationId,
        callerName: data.callerName,
        type: data.type,
      }).catch(error => {
        trace('notification:incoming:error', { message: error instanceof Error ? error.message : String(error) });
      });
      trace('call:incoming', { callId: data.callId, type: data.type });
    };

    const onAnswered = (data: { callId: string; userId: string; accepted: boolean }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId || data.userId === currentUserId) return;
      trace('call:answered', data);
      if (!data.accepted) {
        cleanup(false);
        return;
      }
      setStateSafe('connecting');
      sendOffer(data.userId).catch(error => {
        setCallNotice(error instanceof Error ? error.message : 'Connexion média impossible.');
      });
    };

    const onEnded = (data: { callId: string }) => {
      if (data.callId === callInfoRef.current?.callId) cleanup(false);
    };

    const onDisconnect = (reason: string) => {
      if (callStateRef.current !== 'idle') {
        setStateSafe('reconnecting');
        trace('socket:disconnect', { reason });
      }
    };

    const onConnect = () => {
      if (callStateRef.current === 'reconnecting') setStateSafe('connected');
      trace('socket:connect');
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered', onAnswered);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice', handleIce);
    socket.on('call:ended', onEnded);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice', handleIce);
      socket.off('call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [
    callInfoRef,
    callStateRef,
    cleanup,
    currentUserId,
    handleAnswer,
    handleIce,
    handleOffer,
    sendOffer,
    sessionToken,
    setCallNotice,
    setInfoSafe,
    setStateSafe,
    socketRef,
    trace,
  ]);
}
