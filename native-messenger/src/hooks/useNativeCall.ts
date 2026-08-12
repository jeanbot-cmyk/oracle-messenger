import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { MediaStream } from '@livekit/react-native-webrtc';
import type { Socket } from 'socket.io-client';
import { type NativeCallDiagnosticEntry, type NativeCallInfo, type NativeCallState } from '@/hooks/nativeCallUtils';
import { useNativeCallActions } from '@/hooks/useNativeCallActions';
import { useNativeCallAudioSession } from '@/hooks/useNativeCallAudioSession';
import { useNativeLiveKitCall } from '@/hooks/useNativeLiveKitCall';
import { useNativeCallMediaControls } from '@/hooks/useNativeCallMediaControls';
import { useNativeCallPeerConnections } from '@/hooks/useNativeCallPeerConnections';
import { useNativeCallSocketEvents } from '@/hooks/useNativeCallSocketEvents';
import { cancelIncomingCallNotification } from '@/services/notifications';
import type { AuthSession } from '@/types/messenger';

export type { NativeCallInfo, NativeCallState } from '@/hooks/nativeCallUtils';

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
  const cleanupInProgressRef = useRef(false);

  const trace = useCallback((event: string, details: Record<string, unknown> = {}) => {
    const payload = {
      callId: callInfoRef.current?.callId,
      conversationId: callInfoRef.current?.conversationId,
      state: callStateRef.current,
      event,
      details,
      at: new Date().toISOString(),
    };
    setCallDiagnostics(current => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    }, ...current].slice(0, 80));
    console.info('[NativeCall]', payload);
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
    startIncomingRingtone,
    stopIncomingRingtone,
    startForegroundCallService,
    stopAudioSession,
  } = useNativeCallAudioSession({
    callInfoRef,
    setSpeakerOn,
    trace,
  });

  const { getLocalStream, toggleMute, toggleCamera, switchCamera } = useNativeCallMediaControls({
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
    callInfoRef,
    callStateRef,
    setRemoteStreams,
    setStateSafe,
    setCallNotice,
    trace,
  });

  const cleanup = useCallback((emitEnd = false) => {
    const info = callInfoRef.current;
    if (!info && callStateRef.current === 'idle') return;
    if (cleanupInProgressRef.current) return;
    cleanupInProgressRef.current = true;
    if (emitEnd && info) socketRef.current?.emit('call:end', { callId: info.callId });
    cancelIncomingCallNotification(info?.callId).catch(() => null);
    stopIncomingRingtone();
    setCallNotice('Appel terminé.');
    if (callStateRef.current !== 'idle') setStateSafe('ended');

    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    cleanupTimerRef.current = setTimeout(() => {
      const wasLiveKitActive = disconnectLiveKit(true);
      resetPeerConnections();
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
      trace('call:cleanup', { emitEnd });
    }, 140);
  }, [disconnectLiveKit, resetPeerConnections, setInfoSafe, setStateSafe, stopAudioSession, stopIncomingRingtone, trace]);

  useEffect(() => () => {
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
  }, []);

  const { startCall, prepareIncomingCall, answerCall, addParticipants } = useNativeCallActions({
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
  });

  const toggleSpeaker = useCallback(() => {
    applyAudioRoute(!speakerOn);
  }, [applyAudioRoute, speakerOn]);

  useNativeCallSocketEvents({
    sessionToken: session?.token,
    currentUserId: session?.user.id,
    socketRef,
    callInfoRef,
    callStateRef,
    cleanup,
    setInfoSafe,
    setStateSafe,
    setCallNotice,
    startIncomingRingtone,
    stopIncomingRingtone,
    sendOffer,
    isLiveKitActive,
    handleOffer,
    handleAnswer,
    handleIce,
    removePeerConnection,
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
    if (liveKitActiveRef.current) {
      toggleLiveKitCamera().catch(error => {
        setCallNotice(error instanceof Error ? error.message : 'Caméra indisponible.');
      });
      return;
    }
    toggleCamera();
  }, [liveKitActiveRef, setCallNotice, toggleCamera, toggleLiveKitCamera]);

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
    endCall: () => cleanup(true),
    toggleMute: toggleMuteControl,
    toggleCamera: toggleCameraControl,
    switchCamera: switchCameraControl,
    toggleSpeaker,
    callDiagnostics,
    clearCallDiagnostics: () => setCallDiagnostics([]),
  };
}
