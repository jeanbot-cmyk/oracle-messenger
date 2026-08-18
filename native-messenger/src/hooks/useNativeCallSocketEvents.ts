import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { emitSocketAck, type NativeCallInfo, type NativeCallState } from '@/hooks/nativeCallUtils';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { showIncomingCallNotification } from '@/services/notifications';

type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;
const CALL_REJECT_ACK_TIMEOUT_MS = 5_000;

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

type ActiveCallSyncResponse = {
  ok?: boolean;
  message?: string;
  call?: NativeCallInfo & {
    answered?: boolean;
    answeredUserIds?: string[];
  };
};

type UseNativeCallSocketEventsParams = {
  sessionToken?: string;
  currentUserId?: string;
  cameraFacing: 'user' | 'environment';
  socketRef: RefValue<Socket | null>;
  callInfoRef: RefValue<NativeCallInfo | null>;
  callStateRef: RefValue<NativeCallState>;
  cleanup: (emitEnd?: boolean, finalNotice?: string) => void;
  setInfoSafe: (next: NativeCallInfo | null) => void;
  setStateSafe: (next: NativeCallState) => void;
  setCallNotice: (message: string) => void;
  startIncomingRingtone: (type: 'audio' | 'video') => void;
  stopIncomingRingtone: () => void;
  playCallFailureCue: (reason?: string) => void;
  sendOffer: (targetUserId: string) => Promise<void>;
  isLiveKitActive: () => boolean;
  hasLiveKitRemotePeer: () => boolean;
  connectLiveKit: (info: NativeCallInfo, type: 'audio' | 'video', facing: 'user' | 'environment') => Promise<boolean>;
  handleOffer: (data: WebRtcSessionEvent) => Promise<void>;
  handleAnswer: (data: WebRtcSessionEvent) => Promise<void>;
  handleIce: (data: WebRtcIceEvent) => Promise<void>;
  removePeerConnection: (targetUserId: string) => void;
  removeRemoteParticipantStream: (targetUserId: string) => void;
  trace: NativeCallTrace;
};

export function useNativeCallSocketEvents({
  sessionToken,
  currentUserId,
  cameraFacing,
  socketRef,
  callInfoRef,
  callStateRef,
  cleanup,
  setInfoSafe,
  setStateSafe,
  setCallNotice,
  startIncomingRingtone,
  stopIncomingRingtone,
  playCallFailureCue,
  sendOffer,
  isLiveKitActive,
  hasLiveKitRemotePeer,
  connectLiveKit,
  handleOffer,
  handleAnswer,
  handleIce,
  removePeerConnection,
  removeRemoteParticipantStream,
  trace,
}: UseNativeCallSocketEventsParams) {
  useEffect(() => {
    if (!sessionToken) return;
    const socket = ensureNativeSocket(sessionToken);
    socketRef.current = socket;

    const resyncActiveCall = (reason: string) => {
      const info = callInfoRef.current;
      if (!info || callStateRef.current === 'idle' || callStateRef.current === 'ended') return;
      emitSocketAck<ActiveCallSyncResponse>(
        socket,
        'call:get-active',
        { callId: info.callId },
        8000,
      )
        .then(response => {
          if (!response?.ok || !response.call) {
            trace('call:resync:missing', {
              callId: info.callId,
              reason,
              message: response?.message,
            });
            return;
          }
          const syncedInfo = {
            ...info,
            ...response.call,
            mediaProvider: response.call.mediaProvider === 'livekit' ? 'livekit' : 'webrtc',
          } as NativeCallInfo;
          setInfoSafe(syncedInfo);
          trace('call:resync:ok', {
            callId: syncedInfo.callId,
            reason,
            mediaProvider: syncedInfo.mediaProvider,
            localRole: syncedInfo.callerId === currentUserId ? 'caller' : 'receiver',
            participants: syncedInfo.participants.length,
          });
          if (syncedInfo.mediaProvider === 'webrtc' && syncedInfo.callerId === currentUserId) {
            const answeredUserIds = Array.isArray(response.call.answeredUserIds)
              ? response.call.answeredUserIds
              : [];
            if (!answeredUserIds.length) {
              trace('call:resync:offer-skipped', {
                callId: syncedInfo.callId,
                reason: 'no-answered-participant',
              });
              return;
            }
            answeredUserIds
              .filter(userId => userId && userId !== currentUserId)
              .forEach(userId => {
                sendOffer(userId).catch(error => {
                  trace('call:resync:offer-error', {
                    callId: syncedInfo.callId,
                    targetUserId: userId,
                    message: error instanceof Error ? error.message : String(error),
                  });
                });
              });
          } else if (syncedInfo.callerId !== currentUserId) {
            socket.emit('call:incoming:received', {
              callId: syncedInfo.callId,
              conversationId: syncedInfo.conversationId,
            });
          }
        })
        .catch(error => {
          trace('call:resync:error', {
            callId: info.callId,
            reason,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    };

    const onIncoming = (data: NativeCallInfo) => {
      if (callInfoRef.current?.callId === data.callId) {
        socket.emit('call:incoming:received', { callId: data.callId, conversationId: data.conversationId });
        trace('call:incoming:duplicate', {
          callId: data.callId,
          callerId: data.callerId,
          receiverId: currentUserId,
        });
        return;
      }
      if (callStateRef.current !== 'idle') {
        emitSocketAck<{ ok?: boolean; message?: string }>(
          socket,
          'call:answer',
          { callId: data.callId, accepted: false, reason: 'busy' },
          CALL_REJECT_ACK_TIMEOUT_MS,
        )
          .then(response => {
            trace('call:incoming:auto-reject-busy:ack', {
              callId: data.callId,
              ok: response?.ok !== false,
              message: response?.message,
            });
          })
          .catch(error => {
            trace('call:incoming:auto-reject-busy:ack-error', {
              callId: data.callId,
              message: error instanceof Error ? error.message : String(error),
            });
          });
        trace('call:incoming:auto-reject-busy', {
          callId: data.callId,
          callerId: data.callerId,
          receiverId: currentUserId,
          localState: callStateRef.current,
        });
        return;
      }
      const incomingInfo = { ...data, mediaProvider: data.mediaProvider === 'livekit' ? 'livekit' : 'webrtc' } as NativeCallInfo;
      setInfoSafe(incomingInfo);
      setStateSafe('incoming');
      startIncomingRingtone(data.type);
      socket.emit('call:incoming:received', { callId: data.callId, conversationId: data.conversationId });
      trace('CALL_SIGNAL_RECEIVED', {
        callId: data.callId,
        callerId: data.callerId,
        receiverId: currentUserId,
        signal: 'call:incoming',
      });
      trace('CALL_RINGING', {
        callId: data.callId,
        callerId: data.callerId,
        receiverId: currentUserId,
      });
      trace('notification:incoming:show:begin', {
        callId: data.callId,
        callerId: data.callerId,
        receiverId: currentUserId,
        notificationState: 'show-requested',
      });
      showIncomingCallNotification({
        callId: data.callId,
        conversationId: data.conversationId,
        callerName: data.callerName,
        callerPhone: data.callerPhone,
        type: data.type,
      }).then(() => {
        trace('notification:incoming:show:ok', {
          callId: data.callId,
          receiverId: currentUserId,
          notificationState: 'shown',
        });
      }).catch(error => {
        trace('notification:incoming:error', {
          callId: data.callId,
          receiverId: currentUserId,
          notificationState: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      });
      trace('call:incoming', {
        callId: data.callId,
        callerId: data.callerId,
        receiverId: currentUserId,
        type: data.type,
        mediaProvider: incomingInfo.mediaProvider,
        callState: 'incoming',
      });
    };

    const onAnswered = (data: { callId: string; userId: string; accepted: boolean; ended?: boolean; mediaProvider?: 'livekit' | 'webrtc'; reason?: 'busy' | 'refused' }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId || data.userId === currentUserId) return;
      trace('call:answered', data);
      stopIncomingRingtone();
      if (!data.accepted) {
        const refusedNotice = data.reason === 'busy' ? 'Votre correspondant est actuellement occupé.' : 'Appel refusé.';
        playCallFailureCue(data.reason === 'busy' ? 'busy' : 'refused');
        if (data.ended) {
          cleanup(false, refusedNotice);
          return;
        }
        setInfoSafe({ ...info, participants: info.participants.filter(userId => userId !== data.userId) });
        setCallNotice(data.reason === 'busy' ? 'Votre correspondant est actuellement occupé.' : 'Un participant a refusé l’appel.');
        return;
      }
      if (!['searching', 'calling', 'ringing', 'connecting', 'connected', 'reconnecting'].includes(callStateRef.current)) {
        trace('call:answered:ignored-unjoined-participant', { responderId: data.userId, localState: callStateRef.current });
        return;
      }
      setStateSafe('connecting');
      if (info.mediaProvider === 'webrtc' || data.mediaProvider === 'webrtc') {
        setInfoSafe({ ...info, mediaProvider: 'webrtc' });
        sendOffer(data.userId).catch(error => {
          setCallNotice(error instanceof Error ? error.message : 'Connexion média impossible.');
          trace('webrtc:offer:send-error', { message: error instanceof Error ? error.message : String(error) });
        });
        return;
      }
      if (isLiveKitActive()) {
        const hasRemotePeer = hasLiveKitRemotePeer();
        trace('livekit:answer-media-path', { responderId: data.userId, hasRemotePeer });
        if (hasRemotePeer) setStateSafe('connected');
        return;
      }
      connectLiveKit({ ...info, mediaProvider: 'livekit' }, info.type, cameraFacing)
        .then(ready => {
          trace('livekit:answer-connect', { responderId: data.userId, ready });
          if (!ready) setCallNotice('Connexion LiveKit impossible.');
        })
        .catch(error => {
          setCallNotice(error instanceof Error ? error.message : 'Connexion LiveKit impossible.');
          trace('livekit:answer-connect:error', { message: error instanceof Error ? error.message : String(error) });
        });
    };

    const onEnded = (data: { callId: string; reason?: 'ended' | 'no-answer' | 'missed' | 'refused' | 'cancelled' }) => {
      if (data.callId === callInfoRef.current?.callId) {
        const finalNotice = data.reason === 'no-answer' || data.reason === 'missed'
          ? 'Appel sans réponse.'
          : data.reason === 'refused'
            ? 'Appel refusé.'
            : data.reason === 'cancelled'
              ? 'Appel annulé.'
              : 'Appel terminé.';
        trace('call:ended:received', { callId: data.callId, reason: data.reason, finalNotice });
        trace('CALL_ENDED', { callId: data.callId, reason: data.reason || 'ended' });
        stopIncomingRingtone();
        cleanup(false, finalNotice);
      }
    };

    const onParticipantsAdded = (data: { callId: string; userIds?: string[] }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId) return;
      const nextParticipants = [...new Set([...info.participants, ...(data.userIds || [])])];
      setInfoSafe({ ...info, participants: nextParticipants });
      trace('call:participants-added', { count: data.userIds?.length || 0 });
    };

    const onIncomingReceived = (data: { callId: string; userId?: string; conversationId?: string; receivedAt?: string }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId || data.userId === currentUserId) return;
      trace('call:incoming:received', {
        callId: data.callId,
        receiverId: data.userId,
        conversationId: data.conversationId,
        receivedAt: data.receivedAt,
      });
      if (callStateRef.current === 'searching' || callStateRef.current === 'calling') setStateSafe('ringing');
      trace('CALL_RINGING', {
        callId: data.callId,
        receiverId: data.userId,
        receivedAt: data.receivedAt,
      });
    };

    const onDelivery = (data: {
      callId: string;
      receiverId?: string;
      socketCount?: number;
      activeSocketCount?: number;
      pushTargets?: number;
      pushDelivered?: number;
      pushFailed?: number;
      reachable?: boolean;
      error?: string;
      at?: string;
    }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId) return;
      trace('call:delivery', {
        receiverId: data.receiverId,
        socketCount: data.socketCount,
        activeSocketCount: data.activeSocketCount,
        pushTargets: data.pushTargets,
        pushDelivered: data.pushDelivered,
        pushFailed: data.pushFailed,
        reachable: data.reachable,
        error: data.error,
        at: data.at,
      });
      trace('CALL_SIGNAL_SENT', {
        callId: data.callId,
        receiverId: data.receiverId,
        socketCount: data.socketCount,
        activeSocketCount: data.activeSocketCount,
        pushDelivered: data.pushDelivered,
        reachable: data.reachable,
      });
      if (data.reachable === false) {
        setCallNotice('Appel envoyé. En attente de réponse.');
      } else if ((data.socketCount ?? 0) === 0 && (data.activeSocketCount ?? 0) === 0 && (data.pushDelivered ?? 0) === 0) {
        setCallNotice('Appel envoyé. En attente de réponse.');
      }
    };

    const onParticipantLeft = (data: { callId: string; userId?: string }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId || !data.userId) return;
      setInfoSafe({ ...info, participants: info.participants.filter(userId => userId !== data.userId) });
      removePeerConnection(data.userId);
      removeRemoteParticipantStream(data.userId);
      trace('call:participant-left', { userId: data.userId });
    };

    const onCallError = (data: { message?: string; code?: string }) => {
      if (data?.message) setCallNotice(data.message);
      if (data?.code === 'participant_busy' || /deja en appel|déjà en appel|occupe|occupé/i.test(String(data?.message || ''))) {
        playCallFailureCue('busy');
      }
      trace('call:error', { message: data?.message, code: data?.code });
    };

    const onOffer = (data: WebRtcSessionEvent) => {
      if (isLiveKitActive() && callInfoRef.current?.mediaProvider === 'livekit') {
        trace('webrtc:offer:ignored-livekit', { callId: data.callId, fromUserId: data.fromUserId });
        return;
      }
      handleOffer(data).catch(error => {
        trace('webrtc:offer:handler-error', { message: error instanceof Error ? error.message : String(error) });
      });
    };

    const onAnswer = (data: WebRtcSessionEvent) => {
      if (isLiveKitActive() && callInfoRef.current?.mediaProvider === 'livekit') {
        trace('webrtc:answer:ignored-livekit', { callId: data.callId, fromUserId: data.fromUserId });
        return;
      }
      handleAnswer(data).catch(error => {
        trace('webrtc:answer:handler-error', { message: error instanceof Error ? error.message : String(error) });
      });
    };

    const onIce = (data: WebRtcIceEvent) => {
      if (isLiveKitActive() && callInfoRef.current?.mediaProvider === 'livekit') return;
      handleIce(data).catch(error => {
        trace('webrtc:ice:handler-error', { message: error instanceof Error ? error.message : String(error) });
      });
    };

    const onDisconnect = (reason: string) => {
      if (callStateRef.current !== 'idle' && callStateRef.current !== 'ended') {
        setStateSafe('reconnecting');
        trace('socket:disconnect', { reason });
      }
    };

    const onConnect = () => {
      if (callStateRef.current === 'reconnecting' && callInfoRef.current) {
        setStateSafe('connecting');
        trace('socket:connect', { restoredSignaling: true, mediaStillVerifying: true });
        resyncActiveCall('socket-reconnect');
        return;
      }
      trace('socket:connect');
      resyncActiveCall('socket-connect');
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered', onAnswered);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice', onIce);
    socket.on('call:ended', onEnded);
    socket.on('call:participants-added', onParticipantsAdded);
    socket.on('call:incoming:received', onIncomingReceived);
    socket.on('call:delivery', onDelivery);
    socket.on('call:participant-left', onParticipantLeft);
    socket.on('call:error', onCallError);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice', onIce);
      socket.off('call:ended', onEnded);
      socket.off('call:participants-added', onParticipantsAdded);
      socket.off('call:incoming:received', onIncomingReceived);
      socket.off('call:delivery', onDelivery);
      socket.off('call:participant-left', onParticipantLeft);
      socket.off('call:error', onCallError);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [
    callInfoRef,
    callStateRef,
    cameraFacing,
    connectLiveKit,
    cleanup,
    currentUserId,
    handleAnswer,
    handleIce,
    handleOffer,
    isLiveKitActive,
    hasLiveKitRemotePeer,
    removePeerConnection,
    removeRemoteParticipantStream,
    sendOffer,
    sessionToken,
    setCallNotice,
    setInfoSafe,
    setStateSafe,
    startIncomingRingtone,
    stopIncomingRingtone,
    playCallFailureCue,
    socketRef,
    trace,
  ]);
}
