import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';
import { type NativeCallInfo, type NativeCallState } from '@/hooks/nativeCallUtils';
import { useNativeCallActions } from '@/hooks/useNativeCallActions';
import { useNativeCallAudioSession } from '@/hooks/useNativeCallAudioSession';
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

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callInfoRef = useRef<NativeCallInfo | null>(null);
  const callStateRef = useRef<NativeCallState>('idle');

  const trace = useCallback((event: string, details: Record<string, unknown> = {}) => {
    const payload = {
      callId: callInfoRef.current?.callId,
      conversationId: callInfoRef.current?.conversationId,
      state: callStateRef.current,
      event,
      details,
      at: new Date().toISOString(),
    };
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

  const { applyAudioRoute, startAudioSession, stopAudioSession } = useNativeCallAudioSession({
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
    setIceServers,
    resetPeerConnections,
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
    if (emitEnd && info) socketRef.current?.emit('call:end', { callId: info.callId });
    cancelIncomingCallNotification(info?.callId).catch(() => null);
    resetPeerConnections();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setMuted(false);
    setCameraOff(false);
    stopAudioSession();
    setInfoSafe(null);
    setStateSafe('idle');
    trace('call:cleanup', { emitEnd });
  }, [resetPeerConnections, setInfoSafe, setStateSafe, stopAudioSession, trace]);

  const { startCall, prepareIncomingCall, answerCall } = useNativeCallActions({
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
    sendOffer,
    handleOffer,
    handleAnswer,
    handleIce,
    trace,
  });

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
    endCall: () => cleanup(true),
    toggleMute,
    toggleCamera,
    switchCamera,
    toggleSpeaker,
  };
}
