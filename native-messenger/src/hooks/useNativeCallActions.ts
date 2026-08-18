import { useCallback, useRef } from 'react';
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
import { ensureNativeSocket } from '@/services/nativeSocket';
import { cancelIncomingCallNotification } from '@/services/notifications';
import { api } from '@/services/api';
import type { AuthSession, Conversation } from '@/types/messenger';

type CameraFacing = 'user' | 'environment';
type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;
const CALL_ANSWER_ACK_TIMEOUT_MS = 20_000;
const CALL_REJECT_ACK_TIMEOUT_MS = 5_000;
const CALL_START_ACK_TIMEOUT_MS = 12_000;
const CALL_PREPARE_ACK_TIMEOUT_MS = 5_000;
const CALL_PREPARE_RETRY_DELAYS_MS = [0, 300, 900];
const SFU_STATUS_CACHE_MS = 30_000;

type SfuStatus = Awaited<ReturnType<typeof api.sfuStatus>>;

let cachedSfuStatus: { token: string; value: SfuStatus; at: number } | null = null;
let cachedSfuStatusPromise: Promise<SfuStatus> | null = null;

function waitForCallUiFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

function getCachedSfuStatus(token: string) {
  const now = Date.now();
  if (cachedSfuStatus?.token === token && now - cachedSfuStatus.at < SFU_STATUS_CACHE_MS) {
    return Promise.resolve(cachedSfuStatus.value);
  }
  if (cachedSfuStatusPromise) return cachedSfuStatusPromise;
  cachedSfuStatusPromise = api.sfuStatus(token)
    .then(value => {
      cachedSfuStatus = { token, value, at: Date.now() };
      return value;
    })
    .finally(() => {
      cachedSfuStatusPromise = null;
    });
  return cachedSfuStatusPromise;
}

type UseNativeCallActionsParams = {
  session: AuthSession | null;
  cameraFacing: CameraFacing;
  socketRef: RefValue<Socket | null>;
  callInfoRef: RefValue<NativeCallInfo | null>;
  callStateRef: RefValue<NativeCallState>;
  cleanup: (emitEnd?: boolean, finalNotice?: string) => void;
  ensureMediaPermissions: (type: 'audio' | 'video') => Promise<void>;
  getLocalStream: (type: 'audio' | 'video', facing: CameraFacing) => Promise<MediaStream>;
  connectLiveKit: (info: NativeCallInfo, type: 'audio' | 'video', facing: CameraFacing) => Promise<boolean>;
  startAudioSession: (type: 'audio' | 'video') => void;
  startOutgoingRingback: () => void;
  playCallFailureCue: (reason?: string) => void;
  stopIncomingRingtone: () => void;
  startForegroundCallService: (type: 'audio' | 'video') => void;
  setIceServers: (iceServers?: RTCIceServer[] | null) => void;
  localMediaReadyRef: RefValue<Promise<boolean> | null>;
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
  ensureMediaPermissions,
  getLocalStream,
  connectLiveKit,
  startAudioSession,
  startOutgoingRingback,
  playCallFailureCue,
  stopIncomingRingtone,
  startForegroundCallService,
  setIceServers,
  localMediaReadyRef,
  setInfoSafe,
  setStateSafe,
  setCallNotice,
  trace,
}: UseNativeCallActionsParams) {
  const startInFlightRef = useRef(false);
  const answerInFlightRef = useRef(false);

  const startCall = useCallback(async (conversation: Conversation, type: 'audio' | 'video', requestedPeerId?: string) => {
    if (!session?.token || !session.user?.id) return;
    if (startInFlightRef.current || callStateRef.current !== 'idle') {
      setCallNotice('Un appel est déjà en cours.');
      trace('call:start:blocked-in-flight', {
        conversationId: conversation.id,
        callState: callStateRef.current,
        startInFlight: startInFlightRef.current,
      });
      return;
    }
    startInFlightRef.current = true;
    const initialTargetUserIds = conversation.participants.map(user => user.id).filter(id => id && id !== session.user.id);
    const explicitPeerId = requestedPeerId && requestedPeerId !== session.user.id ? requestedPeerId : undefined;
    let freshConversation = conversation;
    if (!initialTargetUserIds.length && !explicitPeerId) {
      freshConversation = await api.conversation(conversation.id, session.token).catch(error => {
        trace('call:start:conversation-refresh-error', {
          conversationId: conversation.id,
          message: error instanceof Error ? error.message : String(error),
        });
        return conversation;
      });
    } else {
      api.conversation(conversation.id, session.token)
        .then(refreshed => {
          trace('call:start:conversation-refresh-background', {
            conversationId: refreshed.id,
            participants: refreshed.participants.length,
          });
        })
        .catch(error => {
          trace('call:start:conversation-refresh-background-error', {
            conversationId: conversation.id,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }
    const refreshedTargetUserIds = freshConversation.participants.map(user => user.id).filter(id => id && id !== session.user.id);
    const targetUserIds = [...new Set([
      ...(explicitPeerId ? [explicitPeerId] : []),
      ...refreshedTargetUserIds,
    ])];
    if (!targetUserIds.length) {
      trace('call:start:no-target', {
        conversationId: conversation.id,
        requestedPeerId: explicitPeerId,
        localParticipants: conversation.participants.map(user => user.id).filter(Boolean),
        refreshedParticipants: freshConversation.participants.map(user => user.id).filter(Boolean),
      });
      setCallNotice('Aucun destinataire valide pour cet appel.');
      startInFlightRef.current = false;
      return;
    }
    const targetUsers = freshConversation.participants.filter(user => targetUserIds.includes(user.id));
    const nextInfo: NativeCallInfo = {
      callId: createNativeCallId(),
      conversationId: freshConversation.id,
      callerId: session.user.id,
      callerName: session.user.name,
      callerPhone: session.user.phone || null,
      calleeName: freshConversation.type === 'group'
        ? freshConversation.name || `${targetUserIds.length} participants`
        : targetUsers[0]?.phone || targetUsers[0]?.name,
      calleePhone: freshConversation.type === 'group' ? null : targetUsers[0]?.phone || null,
      calleeAvatar: freshConversation.type === 'group'
        ? freshConversation.avatar || null
        : targetUsers[0]?.avatar || null,
      type,
      participants: targetUserIds,
      requestedPeerId: explicitPeerId,
    };
    try {
      setCallNotice('');
      localMediaReadyRef.current = null;
      const socket = ensureNativeSocket(session.token);
      socketRef.current = socket;
      setInfoSafe(nextInfo);
      setStateSafe('searching');
      trace('CALL_CREATED', {
        callId: nextInfo.callId,
        callerId: session.user.id,
        receiverIds: targetUserIds,
        requestedPeerId: explicitPeerId,
        initialTargetUserIds,
        conversationId: freshConversation.id,
        type,
      });
      trace('call:start:begin', {
        callId: nextInfo.callId,
        callerId: session.user.id,
        receiverIds: targetUserIds,
        requestedPeerId: explicitPeerId,
        initialTargetUserIds,
        conversationId: freshConversation.id,
        callState: 'initiating',
        type,
      });
      startOutgoingRingback();
      const sfuStatusPromise = getCachedSfuStatus(session.token).catch(error => {
        trace('livekit:status:error', { message: error instanceof Error ? error.message : String(error) });
        return {
          enabled: false,
          strictRealtime: false,
          privateTurnConfigured: false,
          industrialReady: false,
          reason: 'Statut LiveKit indisponible.',
          maxAudioParticipants: undefined,
          maxVideoParticipants: undefined,
        };
      });
      await waitForCallUiFrame();
      setCallNotice(type === 'video' ? 'Préparation appel vidéo...' : 'Préparation appel audio...');
      await ensureMediaPermissions(type);
      setCallNotice('');
      startAudioSession(type);
      startOutgoingRingback();
      const sfuStatus = await sfuStatusPromise;
      if (sfuStatus.strictRealtime && !sfuStatus.industrialReady) {
        throw new Error(sfuStatus.reason || 'Appels indisponibles : LiveKit/SFU et TURN privé doivent être configurés.');
      }
      const mediaProvider: NativeCallMediaProvider = sfuStatus.enabled ? 'livekit' : 'webrtc';
      const callInfo = { ...nextInfo, mediaProvider };
      setInfoSafe(callInfo);
      trace('media:provider:selected', {
        callId: nextInfo.callId,
        mediaProvider,
        reason: mediaProvider === 'webrtc' ? sfuStatus.reason || 'fallback-webrtc' : 'livekit-sfu',
        strictRealtime: Boolean(sfuStatus.strictRealtime),
        industrialReady: Boolean(sfuStatus.industrialReady),
        privateTurnConfigured: Boolean(sfuStatus.privateTurnConfigured),
        maxAudioParticipants: sfuStatus.maxAudioParticipants,
        maxVideoParticipants: sfuStatus.maxVideoParticipants,
      });
      let localMediaPromise: Promise<boolean> | null = null;
      if (mediaProvider === 'webrtc') {
        trace('media:local-request', {
          callId: nextInfo.callId,
          type,
          phase: 'caller-before-signal',
        });
        localMediaPromise = (async () => {
          try {
            await getLocalStream(type, cameraFacing);
            if (callInfoRef.current?.callId !== nextInfo.callId || ['idle', 'ended'].includes(callStateRef.current)) {
              trace('media:local-ready:stale-call', { callId: nextInfo.callId });
              return false;
            }
            const ice = await api.iceServers(session.token).catch(error => {
              trace('ice:servers:error', { message: error instanceof Error ? error.message : String(error) });
              return null;
            });
            if (callInfoRef.current?.callId !== nextInfo.callId || ['idle', 'ended'].includes(callStateRef.current)) {
              trace('ice:servers:stale-call', { callId: nextInfo.callId });
              return false;
            }
            setIceServers(ice?.iceServers);
            return true;
          } catch (error) {
            trace('media:local-error', {
              callId: nextInfo.callId,
              phase: 'caller-before-signal',
              message: error instanceof Error ? error.message : String(error),
            });
            return false;
          }
        })();
        localMediaReadyRef.current = localMediaPromise;
      }
      startForegroundCallService(type);
      setStateSafe('calling');
      const response = await emitSocketAck<{ ok?: boolean; message?: string; callId?: string; targets?: number; mediaProvider?: string }>(socket, 'call:start', {
        callId: nextInfo.callId,
        conversationId: freshConversation.id,
        type,
        targetUserIds,
        requestedPeerId: explicitPeerId,
        mediaProvider,
      }, CALL_START_ACK_TIMEOUT_MS);
      if (response?.ok === false) {
        throw new Error(response.message || 'Appel refusé par le serveur.');
      }
      const acceptedMediaProvider = response?.mediaProvider === 'livekit' ? 'livekit' : mediaProvider;
      if (response?.mediaProvider && response.mediaProvider !== mediaProvider) {
        trace('media:provider:server-adjusted', {
          requested: mediaProvider,
          accepted: response.mediaProvider,
        });
      }
      const acceptedCallInfo = { ...callInfo, mediaProvider: acceptedMediaProvider };
      setInfoSafe(acceptedCallInfo);
      trace('call:start:ack', {
        callId: response?.callId || nextInfo.callId,
        callerId: session.user.id,
        receiverIds: targetUserIds,
        requestedPeerId: explicitPeerId,
        targets: targetUserIds.length,
        mediaProvider: acceptedMediaProvider,
        callState: 'calling',
      });
      trace('CALL_SIGNAL_SENT', {
        callId: response?.callId || nextInfo.callId,
        receiverIds: targetUserIds,
        requestedPeerId: explicitPeerId,
        targets: targetUserIds.length,
        mediaProvider: acceptedMediaProvider,
      });
      if (acceptedMediaProvider === 'livekit') {
        const liveKitReady = await connectLiveKit(acceptedCallInfo, type, cameraFacing);
        if (!liveKitReady) throw new Error('Connexion LiveKit impossible pour cet appel.');
        trace('call:start:caller-media-ready', {
          callId: response?.callId || nextInfo.callId,
          mediaProvider: acceptedMediaProvider,
        });
      } else {
        const localMediaReady = await (localMediaPromise ?? localMediaReadyRef.current ?? Promise.resolve(false));
        if (!localMediaReady) {
          throw new Error(type === 'video' ? 'Caméra ou microphone indisponible.' : 'Microphone indisponible.');
        }
        trace('call:start:caller-media-ready', {
          callId: response?.callId || nextInfo.callId,
          mediaProvider: acceptedMediaProvider,
          waitingForAnswer: true,
        });
      }
      startInFlightRef.current = false;
    } catch (error) {
      startInFlightRef.current = false;
      const message = error instanceof Error ? error.message : 'Appel impossible.';
      setCallNotice(message);
      trace('call:start:error', { message });
      cleanup(true, message);
      playCallFailureCue('start-error');
    }
  }, [
    cameraFacing,
    callInfoRef,
    callStateRef,
    cleanup,
    ensureMediaPermissions,
    getLocalStream,
    connectLiveKit,
    session,
    setCallNotice,
    setIceServers,
    localMediaReadyRef,
    setInfoSafe,
    setStateSafe,
    socketRef,
    startAudioSession,
    startOutgoingRingback,
    playCallFailureCue,
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
      trace('call:incoming:prepare:begin', { callId: requestedCallId });
      const socket = ensureNativeSocket(session.token);
      socketRef.current = socket;
      let response: { ok: boolean; message?: string; call?: NativeCallInfo } | null = null;
      for (let attempt = 0; attempt < CALL_PREPARE_RETRY_DELAYS_MS.length; attempt += 1) {
        const delayMs = CALL_PREPARE_RETRY_DELAYS_MS[attempt];
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
        response = await emitSocketAck<{ ok: boolean; message?: string; call?: NativeCallInfo }>(
          socket,
          'call:get-active',
          { callId: requestedCallId },
          CALL_PREPARE_ACK_TIMEOUT_MS,
        ).catch(error => {
          trace('call:incoming:prepare:attempt-error', {
            callId: requestedCallId,
            attempt: attempt + 1,
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
        trace('call:incoming:prepare:attempt', {
          callId: requestedCallId,
          attempt: attempt + 1,
          ok: Boolean(response?.ok),
          message: response?.message,
        });
        if (response?.ok && response.call) break;
      }
      if (!response?.ok || !response.call) {
        setCallNotice(response?.message || 'Appel introuvable ou termine.');
        return false;
      }
      const incomingCallInfo: NativeCallInfo = {
        ...response.call,
        mediaProvider: response.call.mediaProvider === 'livekit' ? 'livekit' : 'webrtc',
      };
      setInfoSafe(incomingCallInfo);
      setStateSafe('incoming');
      socket.emit('call:incoming:received', {
        callId: incomingCallInfo.callId,
        conversationId: incomingCallInfo.conversationId,
      });
      trace('CALL_SIGNAL_RECEIVED', {
        callId: incomingCallInfo.callId,
        callerId: incomingCallInfo.callerId,
        receiverId: session.user.id,
        signal: 'call:get-active',
      });
      trace('CALL_RINGING', {
        callId: incomingCallInfo.callId,
        callerId: incomingCallInfo.callerId,
        receiverId: session.user.id,
      });
      trace('call:incoming:prepared', {
        callId: incomingCallInfo.callId,
        callerId: incomingCallInfo.callerId,
        receiverId: session.user.id,
        conversationId: incomingCallInfo.conversationId,
        mediaProvider: incomingCallInfo.mediaProvider,
        callState: 'incoming',
      });
      return true;
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Synchronisation appel impossible.');
      trace('call:incoming:prepare:error', { message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }, [callInfoRef, callStateRef, session?.token, session?.user.id, setCallNotice, setInfoSafe, setStateSafe, socketRef, trace]);

  const answerCall = useCallback(async (accepted: boolean) => {
    const info = callInfoRef.current;
    if (!info || !session?.token) return;
    if (answerInFlightRef.current) {
      trace('call:answer:blocked-in-flight', {
        callId: info.callId,
        accepted,
        callState: callStateRef.current,
      });
      return;
    }
    answerInFlightRef.current = true;
    const socket = ensureNativeSocket(session.token);
    socketRef.current = socket;
    stopIncomingRingtone();
    trace('call:answer:begin', {
      callId: info.callId,
      callerId: info.callerId,
      receiverId: session.user.id,
      accepted,
      mediaProvider: info.mediaProvider,
    });
    if (!accepted) {
      emitSocketAck<{ ok?: boolean; message?: string }>(
        socket,
        'call:answer',
        { callId: info.callId, accepted: false },
        CALL_REJECT_ACK_TIMEOUT_MS,
      )
        .then(response => {
          answerInFlightRef.current = false;
          trace('call:answer:rejected:ack', {
            callId: info.callId,
            ok: response?.ok !== false,
            message: response?.message,
          });
        })
        .catch(error => {
          answerInFlightRef.current = false;
          trace('call:answer:rejected:ack-error', {
            callId: info.callId,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      cancelIncomingCallNotification(info.callId).catch(() => null);
      trace('call:answer:rejected', { callId: info.callId, receiverId: session.user.id });
      cleanup(false, 'Appel refusé.');
      answerInFlightRef.current = false;
      return;
    }
    try {
      cancelIncomingCallNotification(info.callId).catch(() => null);
      localMediaReadyRef.current = null;
      setStateSafe('connecting');
      await waitForCallUiFrame();
      setCallNotice('Connexion de l’appel...');
      await ensureMediaPermissions(info.type);
      setCallNotice('');
      startAudioSession(info.type);
      const mediaProvider: NativeCallMediaProvider = info.mediaProvider === 'livekit' ? 'livekit' : 'webrtc';
      const acceptedInfo = { ...info, mediaProvider };
      setInfoSafe(acceptedInfo);
      trace('call:answer:ack:request', {
        callId: info.callId,
        receiverId: session.user.id,
        mediaProvider,
        callState: 'connecting',
      });
      let localMediaPromise: Promise<boolean> | null = null;
      if (mediaProvider === 'webrtc') {
        trace('media:local-request', {
          callId: info.callId,
          type: info.type,
          phase: 'receiver-before-answer',
        });
        localMediaPromise = (async () => {
          try {
            await getLocalStream(info.type, cameraFacing);
            if (callInfoRef.current?.callId !== info.callId || ['idle', 'ended'].includes(callStateRef.current)) {
              trace('media:local-ready:stale-call', { callId: info.callId });
              return false;
            }
            const ice = await api.iceServers(session.token).catch(error => {
              trace('ice:servers:error', { message: error instanceof Error ? error.message : String(error) });
              return null;
            });
            if (callInfoRef.current?.callId !== info.callId || ['idle', 'ended'].includes(callStateRef.current)) {
              trace('ice:servers:stale-call', { callId: info.callId });
              return false;
            }
            setIceServers(ice?.iceServers);
            return true;
          } catch (error) {
            trace('media:local-error', {
              callId: info.callId,
              phase: 'receiver-before-answer',
              message: error instanceof Error ? error.message : String(error),
            });
            return false;
          }
        })();
        localMediaReadyRef.current = localMediaPromise;
      }
      const response = await emitSocketAck<{
        ok?: boolean;
        message?: string;
        accepted?: boolean;
        mediaProvider?: NativeCallMediaProvider;
        room?: string;
      }>(
        socket,
        'call:answer',
        { callId: info.callId, accepted: true, mediaProvider },
        CALL_ANSWER_ACK_TIMEOUT_MS,
      );
      if (response?.ok === false) {
        throw new Error(response.message || 'Réponse appel refusée par le serveur.');
      }
      if (response?.mediaProvider && response.mediaProvider !== mediaProvider) {
        trace('media:provider:server-adjusted', {
          requested: mediaProvider,
          accepted: response.mediaProvider,
        });
      }
      trace('call:answer:ack:ok', {
        callId: info.callId,
        receiverId: session.user.id,
        mediaProvider,
        room: response?.room,
        callState: 'connecting',
      });
      trace('CALL_ACCEPTED', {
        callId: info.callId,
        receiverId: session.user.id,
        mediaProvider,
      });
      if (mediaProvider === 'webrtc') {
        const localMediaReady = await (localMediaPromise ?? localMediaReadyRef.current ?? Promise.resolve(false));
        if (!localMediaReady) {
          throw new Error(info.type === 'video' ? 'Caméra ou microphone indisponible.' : 'Microphone indisponible.');
        }
        trace('call:answer:receiver-media-ready', {
          callId: info.callId,
          receiverId: session.user.id,
          mediaProvider,
        });
      }
      if (mediaProvider === 'livekit') {
        const liveKitReady = await connectLiveKit(acceptedInfo, info.type, cameraFacing);
        if (!liveKitReady) throw new Error('Connexion LiveKit impossible pour cet appel.');
      }
      startForegroundCallService(info.type);
      trace('call:answer:media-ready', {
        callId: info.callId,
        receiverId: session.user.id,
        mediaProvider,
        room: response?.room || info.callId,
      });
      answerInFlightRef.current = false;
    } catch (error) {
      answerInFlightRef.current = false;
      const message = error instanceof Error ? error.message : 'Réponse impossible.';
      setCallNotice(message);
      trace('call:answer:error', { callId: info.callId, message });
      cleanup(true, message);
    }
  }, [
    callInfoRef,
    callStateRef,
    cameraFacing,
    cleanup,
    ensureMediaPermissions,
    getLocalStream,
    connectLiveKit,
    session?.token,
    session?.user.id,
    setCallNotice,
    setIceServers,
    localMediaReadyRef,
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
    if (info.mediaProvider !== 'livekit') {
      setCallNotice('Ajout impossible : les appels doivent passer par LiveKit/SFU.');
      trace('call:add-participants:blocked-non-livekit', { targets: targets.length });
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
