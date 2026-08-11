import { useCallback } from 'react';
import { MediaStream } from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';
import {
  createNativeCallId,
  emitSocketAck,
  type NativeCallInfo,
  type NativeCallState,
} from '@/hooks/nativeCallUtils';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { cancelIncomingCallNotification } from '@/services/notifications';
import type { AuthSession, Conversation } from '@/types/messenger';

type CameraFacing = 'user' | 'environment';
type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;

type UseNativeCallActionsParams = {
  session: AuthSession | null;
  cameraFacing: CameraFacing;
  socketRef: RefValue<Socket | null>;
  callInfoRef: RefValue<NativeCallInfo | null>;
  callStateRef: RefValue<NativeCallState>;
  cleanup: (emitEnd?: boolean) => void;
  getLocalStream: (type: 'audio' | 'video', facing: CameraFacing) => Promise<MediaStream>;
  startAudioSession: (type: 'audio' | 'video') => void;
  setIceServers: (iceServers?: RTCIceServer[] | null) => void;
  setInfoSafe: (next: NativeCallInfo | null) => void;
  setStateSafe: (next: NativeCallState) => void;
  setCallNotice: (message: string) => void;
  trace: NativeCallTrace;
};

export function useNativeCallActions({
  session,
  cameraFacing,
  socketRef,
  callInfoRef,
  callStateRef,
  cleanup,
  getLocalStream,
  startAudioSession,
  setIceServers,
  setInfoSafe,
  setStateSafe,
  setCallNotice,
  trace,
}: UseNativeCallActionsParams) {
  const startCall = useCallback(async (conversation: Conversation, type: 'audio' | 'video') => {
    if (!session?.token || !session.user?.id) return;
    const targetUserIds = conversation.participants.map(user => user.id).filter(id => id && id !== session.user.id);
    if (!targetUserIds.length) {
      setCallNotice('Aucun destinataire valide pour cet appel.');
      return;
    }
    const nextInfo: NativeCallInfo = {
      callId: createNativeCallId(),
      conversationId: conversation.id,
      callerId: session.user.id,
      callerName: session.user.name,
      type,
      participants: targetUserIds,
    };
    try {
      setCallNotice('');
      setInfoSafe(nextInfo);
      setStateSafe('calling');
      startAudioSession(type);
      await getLocalStream(type, cameraFacing);
      const socket = ensureNativeSocket(session.token);
      socketRef.current = socket;
      const ice = await api.iceServers(session.token).catch(() => null);
      setIceServers(ice?.iceServers);
      await emitSocketAck(socket, 'call:start', {
        callId: nextInfo.callId,
        conversationId: conversation.id,
        type,
        targetUserIds,
      });
      trace('call:start:ack', { targets: targetUserIds.length });
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Appel impossible.');
      cleanup(true);
    }
  }, [
    cameraFacing,
    cleanup,
    getLocalStream,
    session,
    setCallNotice,
    setIceServers,
    setInfoSafe,
    setStateSafe,
    socketRef,
    startAudioSession,
    trace,
  ]);

  const prepareIncomingCall = useCallback(async (requestedCallId: string) => {
    if (!session?.token || !requestedCallId) return false;
    const current = callInfoRef.current;
    if (current?.callId === requestedCallId) return true;
    if (current && current.callId !== requestedCallId && callStateRef.current !== 'idle') {
      setCallNotice('Un autre appel est deja en cours.');
      return false;
    }
    try {
      const socket = ensureNativeSocket(session.token);
      socketRef.current = socket;
      const response = await emitSocketAck<{ ok: boolean; message?: string; call?: NativeCallInfo }>(
        socket,
        'call:get-active',
        { callId: requestedCallId },
        10000,
      );
      if (!response.ok || !response.call) {
        setCallNotice(response.message || 'Appel introuvable ou termine.');
        return false;
      }
      setInfoSafe(response.call);
      setStateSafe('incoming');
      socket.emit('call:incoming:received', {
        callId: response.call.callId,
        conversationId: response.call.conversationId,
      });
      trace('call:incoming:prepared', { callId: response.call.callId });
      return true;
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Synchronisation appel impossible.');
      trace('call:incoming:prepare:error', { message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }, [callInfoRef, callStateRef, session?.token, setCallNotice, setInfoSafe, setStateSafe, socketRef, trace]);

  const answerCall = useCallback(async (accepted: boolean) => {
    const info = callInfoRef.current;
    if (!info || !session?.token) return;
    const socket = ensureNativeSocket(session.token);
    socketRef.current = socket;
    if (!accepted) {
      socket.emit('call:answer', { callId: info.callId, accepted: false });
      cancelIncomingCallNotification(info.callId).catch(() => null);
      cleanup(false);
      return;
    }
    try {
      cancelIncomingCallNotification(info.callId).catch(() => null);
      setStateSafe('connecting');
      startAudioSession(info.type);
      await getLocalStream(info.type, cameraFacing);
      const ice = await api.iceServers(session.token).catch(() => null);
      setIceServers(ice?.iceServers);
      await emitSocketAck(socket, 'call:answer', { callId: info.callId, accepted: true });
      trace('call:answer:accepted');
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Réponse impossible.');
      cleanup(true);
    }
  }, [
    callInfoRef,
    cameraFacing,
    cleanup,
    getLocalStream,
    session?.token,
    setCallNotice,
    setIceServers,
    setStateSafe,
    socketRef,
    startAudioSession,
    trace,
  ]);

  return {
    startCall,
    prepareIncomingCall,
    answerCall,
  };
}
