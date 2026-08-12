import { useCallback } from 'react';
import { MediaStream } from '@livekit/react-native-webrtc';
import type { Socket } from 'socket.io-client';
import {
  CALL_OPERATION_TIMEOUT_MS,
  createNativeCallId,
  emitSocketAck,
  type NativeCallInfo,
  type NativeCallMediaProvider,
  type NativeCallState,
} from '@/hooks/nativeCallUtils';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { cancelIncomingCallNotification } from '@/services/notifications';
import type { AuthSession, Conversation } from '@/types/messenger';

type CameraFacing = 'user' | 'environment';
type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;

function waitForCallUiFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

type UseNativeCallActionsParams = {
  session: AuthSession | null;
  cameraFacing: CameraFacing;
  socketRef: RefValue<Socket | null>;
  callInfoRef: RefValue<NativeCallInfo | null>;
  callStateRef: RefValue<NativeCallState>;
  cleanup: (emitEnd?: boolean) => void;
  getLocalStream: (type: 'audio' | 'video', facing: CameraFacing) => Promise<MediaStream>;
  connectLiveKit: (info: NativeCallInfo, type: 'audio' | 'video', facing: CameraFacing) => Promise<boolean>;
  startAudioSession: (type: 'audio' | 'video') => void;
  startOutgoingRingback: () => void;
  stopIncomingRingtone: () => void;
  startForegroundCallService: (type: 'audio' | 'video') => void;
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
  connectLiveKit,
  startAudioSession,
  startOutgoingRingback,
  stopIncomingRingtone,
  startForegroundCallService,
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
    const targetUsers = conversation.participants.filter(user => targetUserIds.includes(user.id));
    const nextInfo: NativeCallInfo = {
      callId: createNativeCallId(),
      conversationId: conversation.id,
      callerId: session.user.id,
      callerName: session.user.name,
      calleeName: conversation.type === 'group'
        ? conversation.name || `${targetUserIds.length} participants`
        : targetUsers[0]?.name,
      calleeAvatar: conversation.type === 'group'
        ? conversation.avatar || null
        : targetUsers[0]?.avatar || null,
      type,
      participants: targetUserIds,
    };
    try {
      setCallNotice('');
      setInfoSafe(nextInfo);
      setStateSafe('calling');
      await waitForCallUiFrame();
      startAudioSession(type);
      startOutgoingRingback();
      const socket = ensureNativeSocket(session.token);
      socketRef.current = socket;
      const liveKitReady = await connectLiveKit(nextInfo, type, cameraFacing);
      const mediaProvider: NativeCallMediaProvider = liveKitReady ? 'livekit' : 'webrtc';
      const callInfo = { ...nextInfo, mediaProvider };
      setInfoSafe(callInfo);
      if (!liveKitReady) {
        await getLocalStream(type, cameraFacing);
        const ice = await api.iceServers(session.token).catch(() => null);
        setIceServers(ice?.iceServers);
      }
      startForegroundCallService(type);
      const response = await emitSocketAck<{ ok?: boolean; message?: string; callId?: string; targets?: number }>(socket, 'call:start', {
        callId: nextInfo.callId,
        conversationId: conversation.id,
        type,
        targetUserIds,
        mediaProvider,
      });
      if (response?.ok === false) {
        throw new Error(response.message || 'Appel refusé par le serveur.');
      }
      trace('call:start:ack', { targets: targetUserIds.length, mediaProvider });
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Appel impossible.');
      cleanup(true);
    }
  }, [
    cameraFacing,
    cleanup,
    getLocalStream,
    connectLiveKit,
    session,
    setCallNotice,
    setIceServers,
    setInfoSafe,
    setStateSafe,
    socketRef,
    startAudioSession,
    startOutgoingRingback,
    startForegroundCallService,
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
        CALL_OPERATION_TIMEOUT_MS,
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
    stopIncomingRingtone();
    if (!accepted) {
      socket.emit('call:answer', { callId: info.callId, accepted: false });
      cancelIncomingCallNotification(info.callId).catch(() => null);
      cleanup(false);
      return;
    }
    try {
      cancelIncomingCallNotification(info.callId).catch(() => null);
      setStateSafe('connecting');
      await waitForCallUiFrame();
      startAudioSession(info.type);
      const shouldTryLiveKit = info.mediaProvider !== 'webrtc';
      const liveKitReady = shouldTryLiveKit ? await connectLiveKit(info, info.type, cameraFacing) : false;
      const mediaProvider: NativeCallMediaProvider = liveKitReady ? 'livekit' : 'webrtc';
      if (info.mediaProvider === 'livekit' && !liveKitReady) {
        throw new Error('Connexion LiveKit impossible pour cet appel.');
      }
      if (!liveKitReady) {
        await getLocalStream(info.type, cameraFacing);
        const ice = await api.iceServers(session.token).catch(() => null);
        setIceServers(ice?.iceServers);
      }
      startForegroundCallService(info.type);
      setInfoSafe({ ...info, mediaProvider });
      const response = await emitSocketAck<{ ok?: boolean; message?: string; accepted?: boolean }>(
        socket,
        'call:answer',
        { callId: info.callId, accepted: true, mediaProvider },
      );
      if (response?.ok === false) {
        throw new Error(response.message || 'Réponse appel refusée par le serveur.');
      }
      trace('call:answer:accepted', { mediaProvider });
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Réponse impossible.');
      cleanup(true);
    }
  }, [
    callInfoRef,
    cameraFacing,
    cleanup,
    getLocalStream,
    connectLiveKit,
    session?.token,
    setCallNotice,
    setIceServers,
    setInfoSafe,
    setStateSafe,
    socketRef,
    startAudioSession,
    startForegroundCallService,
    stopIncomingRingtone,
    trace,
  ]);

  const addParticipants = useCallback(async (targetUserIds: string[]) => {
    const info = callInfoRef.current;
    if (!info || !session?.token || callStateRef.current === 'idle') return;
    const targets = [...new Set(targetUserIds)]
      .filter(userId => userId && userId !== session.user.id && !info.participants.includes(userId));
    if (!targets.length) {
      setCallNotice('Aucun nouveau participant à ajouter.');
      return;
    }
    try {
      const socket = ensureNativeSocket(session.token);
      socketRef.current = socket;
      const response = await emitSocketAck<{ ok?: boolean; message?: string; targets?: number }>(
        socket,
        'call:add-participants',
        { callId: info.callId, targetUserIds: targets },
        CALL_OPERATION_TIMEOUT_MS,
      );
      if (response?.ok === false) {
        setCallNotice(response.message || 'Ajout participant impossible.');
        return;
      }
      setInfoSafe({ ...info, participants: [...new Set([...info.participants, ...targets])] });
      setCallNotice(targets.length === 1 ? 'Invitation envoyée.' : `${targets.length} invitations envoyées.`);
      trace('call:add-participants:ack', { targets: targets.length });
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Ajout participant impossible.');
      trace('call:add-participants:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [callInfoRef, callStateRef, session?.token, session?.user.id, setCallNotice, setInfoSafe, socketRef, trace]);

  return {
    startCall,
    prepareIncomingCall,
    answerCall,
    addParticipants,
  };
}
