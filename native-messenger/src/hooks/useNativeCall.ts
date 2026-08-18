import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { MediaStream } from '@livekit/react-native-webrtc';
import type { Socket } from 'socket.io-client';
import { CALL_RING_TIMEOUT_SECONDS, type NativeCallDiagnosticEntry, type NativeCallInfo, type NativeCallState } from '@/hooks/nativeCallUtils';
import { useNativeCallActions } from '@/hooks/useNativeCallActions';
import { useNativeCallAudioSession } from '@/hooks/useNativeCallAudioSession';
import { useNativeLiveKitCall } from '@/hooks/useNativeLiveKitCall';
import { useNativeCallMediaControls } from '@/hooks/useNativeCallMediaControls';
import { useNativeCallPeerConnections } from '@/hooks/useNativeCallPeerConnections';
import { useNativeCallSocketEvents } from '@/hooks/useNativeCallSocketEvents';
import { isNativeDebugEnabled, nativeDebugLog } from '@/services/nativeLogger';
import { cancelIncomingCallNotification } from '@/services/notifications';
import type { AuthSession } from '@/types/messenger';

export type { NativeCallInfo, NativeCallState } from '@/hooks/nativeCallUtils';

function shouldKeepCallTrace(event: string) {
  if (isNativeDebugEnabled()) return true;
  return /fail|error|reject|timeout|disconnect|watchdog|busy|unavailable|permission/i.test(event);
}

export function useNativeCall(session: AuthSession | null) {
  const [callState, setCallState] = useState<NativeCallState>('idle');
  const [callInfo, setCallInfo] = useState<NativeCallInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setMuted] = useState(false);
  const [isCameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [callNotice, setCallNotice] = useState('');
  const [callDiagnostics, setCallDiagnostics] = useState<NativeCallDiagnosticEntry[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callInfoRef = useRef<NativeCallInfo | null>(null);
  const callStateRef = useRef<NativeCallState>('idle');
  const speakerOnRef = useRef(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupInProgressRef = useRef(false);
  const localMediaReadyRef = useRef<Promise<boolean> | null>(null);

  const trace = useCallback((event: string, details: Record<string, unknown> = {}) => {
    const shouldKeep = shouldKeepCallTrace(event);
    const payload = {
      callId: callInfoRef.current?.callId,
      conversationId: callInfoRef.current?.conversationId,
      state: callStateRef.current,
      event,
      details,
      at: new Date().toISOString(),
    };
    if (!shouldKeep) return;
    setCallDiagnostics(current => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    }, ...current].slice(0, isNativeDebugEnabled() ? 80 : 24));
    nativeDebugLog('[NativeCall]', payload);
    socketRef.current?.emit('call:diagnostic', payload);
  }, []);

  const setStateSafe = useCallback((next: NativeCallState) => {
    callStateRef.current = next;
    setCallState(next);
  }, []);

  const setInfoSafe = useCallback((next: NativeCallInfo | null) => {
    callInfoRef.current = next;
    setCallInfo(next);
  }, []);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);

  const getSpeakerOn = useCallback(() => speakerOnRef.current, []);

  const {
    applyAudioRoute,
    startAudioSession,
    startOutgoingRingback,
    playCallFailureCue,
    startIncomingRingtone,
    stopIncomingRingtone,
    startForegroundCallService,
    stopAudioSession,
  } = useNativeCallAudioSession({
    callInfoRef,
    setSpeakerOn,
    trace,
  });

  const { ensureMediaPermissions, getLocalStream, toggleMute, toggleCamera, switchCamera } = useNativeCallMediaControls({
    localStreamRef,
    cameraFacing,
    setLocalStream,
    setMuted,
    setCameraOff,
    setCameraFacing,
    setCallNotice,
    trace,
  });

  const {
    liveKitActiveRef,
    isLiveKitActive,
    hasLiveKitRemotePeer,
    connectLiveKit,
    disconnectLiveKit,
    toggleLiveKitMute,
    toggleLiveKitCamera,
    switchLiveKitCamera,
  } = useNativeLiveKitCall({
    session,
    localStreamRef,
    callInfoRef,
    callStateRef,
    cameraFacing,
    setLocalStream,
    setRemoteStreams,
    setMuted,
    setCameraOff,
    setCameraFacing,
    setStateSafe,
    setCallNotice,
    getSpeakerOn,
    applyAudioRoute,
    trace,
  });

  const {
    setIceServers,
    resetPeerConnections,
    removePeerConnection,
    sendOffer,
    handleOffer,
    handleAnswer,
    handleIce,
  } = useNativeCallPeerConnections({
    socketRef,
    localStreamRef,
    localMediaReadyRef,
    callInfoRef,
    callStateRef,
    setRemoteStreams,
    setStateSafe,
    setCallNotice,
    trace,
  });

  const resetRemoteStreams = useCallback(() => {
    setRemoteStreams(new Map());
  }, []);

  const removeRemoteParticipantStream = useCallback((targetUserId: string) => {
    setRemoteStreams(current => {
      const next = new Map(current);
      next.delete(targetUserId);
      return next;
    });
    trace('livekit:remote-participant-stream-removed', { targetUserId });
  }, [trace]);

  const cleanup = useCallback((emitEnd = false, finalNotice = 'Appel terminé.') => {
    const info = callInfoRef.current;
    if (!info && callStateRef.current === 'idle') return;
    if (cleanupInProgressRef.current) return;
    cleanupInProgressRef.current = true;
    if (emitEnd && info) socketRef.current?.emit('call:end', { callId: info.callId });
    cancelIncomingCallNotification(info?.callId).catch(() => null);
    stopIncomingRingtone();
    setCallNotice(finalNotice);
    if (callStateRef.current !== 'idle') setStateSafe('ended');

    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    cleanupTimerRef.current = setTimeout(() => {
      const wasLiveKitActive = disconnectLiveKit(true);
      resetPeerConnections();
      resetRemoteStreams();
      localMediaReadyRef.current = null;
      if (!wasLiveKitActive) localStreamRef.current?.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setMuted(false);
      setCameraOff(false);
      stopAudioSession();
      setInfoSafe(null);
      setStateSafe('idle');
      setCallNotice('');
      cleanupInProgressRef.current = false;
      cleanupTimerRef.current = null;
      trace('call:cleanup', { emitEnd, finalNotice });
    }, 1200);
  }, [disconnectLiveKit, resetPeerConnections, resetRemoteStreams, setInfoSafe, setStateSafe, stopAudioSession, stopIncomingRingtone, trace]);

  useEffect(() => () => {
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    if (stateWatchdogTimerRef.current) clearTimeout(stateWatchdogTimerRef.current);
  }, []);

  useEffect(() => {
    if (stateWatchdogTimerRef.current) {
      clearTimeout(stateWatchdogTimerRef.current);
      stateWatchdogTimerRef.current = null;
    }

    const watchdogByState: Partial<Record<NativeCallState, { timeoutMs: number; notice: string }>> = {
      searching: {
        timeoutMs: 25_000,
        notice: 'Recherche appel trop longue. Vérifiez la connexion puis réessayez.',
      },
      connecting: {
        timeoutMs: 45_000,
        notice: 'Connexion média impossible. L’appel a été arrêté proprement.',
      },
      reconnecting: {
        timeoutMs: 45_000,
        notice: 'Reconnexion média impossible. L’appel a été arrêté proprement.',
      },
      calling: {
        timeoutMs: (CALL_RING_TIMEOUT_SECONDS + 8) * 1000,
        notice: 'Appel sans réponse.',
      },
      ringing: {
        timeoutMs: (CALL_RING_TIMEOUT_SECONDS + 8) * 1000,
        notice: 'Appel sans réponse.',
      },
    };
    const watchdog = watchdogByState[callState];
    if (!watchdog) return;

    stateWatchdogTimerRef.current = setTimeout(() => {
      if (callStateRef.current !== callState) return;
      setCallNotice(watchdog.notice);
      trace('call:state-watchdog:timeout', {
        callState,
        timeoutMs: watchdog.timeoutMs,
        callId: callInfoRef.current?.callId,
      });
      cleanup(true, watchdog.notice);
    }, watchdog.timeoutMs);

    return () => {
      if (stateWatchdogTimerRef.current) {
        clearTimeout(stateWatchdogTimerRef.current);
        stateWatchdogTimerRef.current = null;
      }
    };
  }, [callState, cleanup, trace]);

  const { startCall, prepareIncomingCall, answerCall, addParticipants } = useNativeCallActions({
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
  });

  const toggleSpeaker = useCallback(() => {
    applyAudioRoute(!speakerOn);
  }, [applyAudioRoute, speakerOn]);

  useNativeCallSocketEvents({
    sessionToken: session?.token,
    currentUserId: session?.user.id,
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
  });

  const toggleMuteControl = useCallback(() => {
    if (liveKitActiveRef.current) {
      toggleLiveKitMute().catch(error => {
        setCallNotice(error instanceof Error ? error.message : 'Microphone indisponible.');
      });
      return;
    }
    toggleMute();
  }, [liveKitActiveRef, setCallNotice, toggleLiveKitMute, toggleMute]);

  const toggleCameraControl = useCallback(() => {
    const currentInfo = callInfoRef.current;
    if (currentInfo?.type === 'video') {
      const switchToAudio = () => {
        const latest = callInfoRef.current;
        if (latest) setInfoSafe({ ...latest, type: 'audio' });
        localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = false; });
        setCameraOff(true);
        setCallNotice('Mode audio activé.');
        trace('media:mode-switch', { type: 'audio' });
      };
      if (liveKitActiveRef.current) {
        const disableCamera = isCameraOff ? Promise.resolve(true) : toggleLiveKitCamera();
        disableCamera
          .then((handled) => {
            if (!handled) return;
            switchToAudio();
          })
          .catch(error => {
            setCallNotice(error instanceof Error ? error.message : 'Passage en audio impossible.');
          });
        return;
      }
      switchToAudio();
      return;
    }
    if (liveKitActiveRef.current) {
      toggleLiveKitCamera().then((handled) => {
        if (!handled) return;
        const info = callInfoRef.current;
        if (info && info.type !== 'video') {
          setInfoSafe({ ...info, type: 'video' });
          setCallNotice('Vidéo activée.');
        }
      }).catch(error => {
        setCallNotice(error instanceof Error ? error.message : 'Caméra indisponible.');
      });
      return;
    }
    const info = callInfoRef.current;
    if (info?.type !== 'video') {
      getLocalStream('video', cameraFacing)
        .then(() => {
          const latest = callInfoRef.current;
          if (latest) setInfoSafe({ ...latest, type: 'video' });
          setCameraOff(false);
          setCallNotice('Vidéo activée.');
          const participants = latest?.participants ?? [];
          participants.forEach(targetUserId => {
            if (targetUserId && targetUserId !== session?.user.id) {
              sendOffer(targetUserId).catch(error => {
                trace('webrtc:video-upgrade:offer-error', {
                  targetUserId,
                  message: error instanceof Error ? error.message : String(error),
                });
              });
            }
          });
          trace('webrtc:video-upgrade:started', { participants: participants.length });
        })
        .catch(error => {
          setCallNotice(error instanceof Error ? error.message : 'Caméra indisponible.');
        });
      return;
    }
    toggleCamera();
  }, [cameraFacing, getLocalStream, isCameraOff, liveKitActiveRef, sendOffer, session?.user.id, setCallNotice, setCameraOff, setInfoSafe, toggleCamera, toggleLiveKitCamera, trace]);

  const switchCameraControl = useCallback(() => {
    if (liveKitActiveRef.current) {
      switchLiveKitCamera().catch(error => {
        setCallNotice(error instanceof Error ? error.message : 'Changement caméra impossible.');
      });
      return;
    }
    switchCamera();
  }, [liveKitActiveRef, setCallNotice, switchCamera, switchLiveKitCamera]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      trace('android:app-state', { state });
      // Do not end active calls on background/lock. Media resources are released only by cleanup/end.
    });
    return () => sub.remove();
  }, [trace]);

  return {
    callState,
    callInfo,
    callNotice,
    localStream,
    remoteStreams,
    isMuted,
    isCameraOff,
    speakerOn,
    startCall,
    prepareIncomingCall,
    answerCall,
    addParticipants,
    endCall: () => cleanup(
      true,
      ['searching', 'calling', 'ringing', 'incoming'].includes(callStateRef.current)
        ? 'Appel annulé.'
        : 'Appel terminé.',
    ),
    toggleMute: toggleMuteControl,
    toggleCamera: toggleCameraControl,
    switchCamera: switchCameraControl,
    toggleSpeaker,
    callDiagnostics,
    clearCallDiagnostics: () => setCallDiagnostics([]),
  };
}
