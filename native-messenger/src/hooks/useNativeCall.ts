import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStreamTrack,
} from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';
import {
  createNativeCallId,
  DEFAULT_ICE,
  emitSocketAck,
  type NativeCallInfo,
  type NativeCallState,
} from '@/hooks/nativeCallUtils';
import { useNativeCallAudioSession } from '@/hooks/useNativeCallAudioSession';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { cancelIncomingCallNotification, showIncomingCallNotification } from '@/services/notifications';
import type { AuthSession, Conversation } from '@/types/messenger';

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
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const getLocalStream = useCallback(async (type: 'audio' | 'video', facing: 'user' | 'environment') => {
    const stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: type === 'video'
        ? {
            facingMode: facing,
            width: 1280,
            height: 720,
            frameRate: 24,
          }
        : false,
    } as any);
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('Microphone indisponible.');
    }
    audioTracks.forEach(track => { track.enabled = true; });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMuted(false);
    setCameraOff(false);
    trace('media:local-ready', {
      type,
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      facing,
    });
    return stream;
  }, [trace]);

  const cleanup = useCallback((emitEnd = false) => {
    const info = callInfoRef.current;
    if (emitEnd && info) socketRef.current?.emit('call:end', { callId: info.callId });
    cancelIncomingCallNotification(info?.callId).catch(() => null);
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    pendingIceRef.current.clear();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams(new Map());
    setMuted(false);
    setCameraOff(false);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    stopAudioSession();
    setInfoSafe(null);
    setStateSafe('idle');
    trace('call:cleanup', { emitEnd });
  }, [setInfoSafe, setStateSafe, stopAudioSession, trace]);

  const addRemoteTrack = useCallback((userId: string, stream: MediaStream) => {
    setRemoteStreams(current => {
      const next = new Map(current);
      next.set(userId, stream);
      return next;
    });
  }, []);

  const createPeer = useCallback((targetUserId: string) => {
    const existing = peersRef.current.get(targetUserId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current } as any);
    peersRef.current.set(targetUserId, pc);

    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current as MediaStream);
    });

    (pc as any).onicecandidate = (event: any) => {
      if (event.candidate) {
        socketRef.current?.emit('webrtc:ice', {
          callId: callInfoRef.current?.callId,
          targetUserId,
          candidate: event.candidate,
        });
      }
    };

    (pc as any).ontrack = (event: any) => {
      const stream = event.streams?.[0];
      if (stream) addRemoteTrack(targetUserId, stream);
      trace('webrtc:track', { targetUserId, kind: event.track?.kind, streams: event.streams?.length ?? 0 });
    };

    (pc as any).onconnectionstatechange = () => {
      const state = pc.connectionState;
      trace('webrtc:connection-state', { targetUserId, state });
      if (state === 'connected') setStateSafe('connected');
      if (state === 'disconnected' || state === 'failed') {
        setStateSafe('reconnecting');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (callStateRef.current === 'reconnecting') {
            setCallNotice('Connexion instable. Tentative de récupération...');
            try {
              pc.restartIce?.();
              trace('webrtc:ice-restart', { targetUserId });
            } catch {}
          }
        }, 1200);
      }
    };

    (pc as any).oniceconnectionstatechange = () => {
      trace('webrtc:ice-state', { targetUserId, state: pc.iceConnectionState });
    };

    return pc;
  }, [addRemoteTrack, setStateSafe, trace]);

  const flushIce = useCallback(async (fromUserId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(fromUserId) ?? [];
    pendingIceRef.current.delete(fromUserId);
    for (const candidate of pending) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const sendOffer = useCallback(async (targetUserId: string) => {
    const info = callInfoRef.current;
    if (!info) return;
    const pc = createPeer(targetUserId);
    const offer = await pc.createOffer({ iceRestart: false } as any);
    await pc.setLocalDescription(offer);
    socketRef.current?.emit('webrtc:offer', {
      callId: info.callId,
      targetUserId,
      sdp: offer,
    });
    trace('webrtc:offer:sent', { targetUserId });
  }, [createPeer, trace]);

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
      const ice = await api.iceServers(session.token).catch(() => ({ iceServers: DEFAULT_ICE }));
      iceServersRef.current = ice.iceServers?.length ? ice.iceServers : DEFAULT_ICE;
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
  }, [cameraFacing, cleanup, getLocalStream, session, setInfoSafe, setStateSafe, startAudioSession, trace]);

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
  }, [session?.token, setInfoSafe, setStateSafe, trace]);

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
      const ice = await api.iceServers(session.token).catch(() => ({ iceServers: DEFAULT_ICE }));
      iceServersRef.current = ice.iceServers?.length ? ice.iceServers : DEFAULT_ICE;
      await emitSocketAck(socket, 'call:answer', { callId: info.callId, accepted: true });
      trace('call:answer:accepted');
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Réponse impossible.');
      cleanup(true);
    }
  }, [cameraFacing, cleanup, getLocalStream, session?.token, setStateSafe, startAudioSession, trace]);

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const nextMuted = tracks.some(track => track.enabled);
    tracks.forEach(track => { track.enabled = !nextMuted; });
    try { InCallManager.setMicrophoneMute(nextMuted); } catch {}
    setMuted(nextMuted);
    trace('audio:mute', { muted: nextMuted, tracks: tracks.length });
  }, [trace]);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const nextOff = tracks.some(track => track.enabled);
    tracks.forEach(track => { track.enabled = !nextOff; });
    setCameraOff(nextOff);
    trace('camera:toggle', { off: nextOff, tracks: tracks.length });
  }, [trace]);

  const switchCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0] as (MediaStreamTrack & { _switchCamera?: () => void }) | undefined;
    if (!track) {
      setCallNotice('Caméra indisponible.');
      return;
    }
    try {
      track._switchCamera?.();
      const next = cameraFacing === 'user' ? 'environment' : 'user';
      setCameraFacing(next);
      setCameraOff(false);
      trace('camera:switch', { facing: next, method: '_switchCamera-no-renegotiation' });
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Changement caméra impossible.');
      trace('camera:switch:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [cameraFacing, trace]);

  const toggleSpeaker = useCallback(() => {
    applyAudioRoute(!speakerOn);
  }, [applyAudioRoute, speakerOn]);

  useEffect(() => {
    if (!session?.token) return;
    const socket = ensureNativeSocket(session.token);
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
      if (!info || data.callId !== info.callId || data.userId === session.user.id) return;
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

    const onOffer = async (data: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId) return;
      try {
        const pc = createPeer(data.fromUserId);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
        await flushIce(data.fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { callId: data.callId, targetUserId: data.fromUserId, sdp: answer });
        trace('webrtc:answer:sent', { targetUserId: data.fromUserId });
      } catch (error) {
        trace('webrtc:offer:error', { message: error instanceof Error ? error.message : String(error) });
      }
    };

    const onAnswer = async (data: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId) return;
      const pc = peersRef.current.get(data.fromUserId);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
      await flushIce(data.fromUserId, pc);
      trace('webrtc:answer:received', { fromUserId: data.fromUserId });
    };

    const onIce = async (data: { callId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const info = callInfoRef.current;
      if (!info || data.callId !== info.callId) return;
      const pc = peersRef.current.get(data.fromUserId);
      if (!pc?.remoteDescription) {
        const list = pendingIceRef.current.get(data.fromUserId) ?? [];
        list.push(data.candidate);
        pendingIceRef.current.set(data.fromUserId, list);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
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
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice', onIce);
    socket.on('call:ended', onEnded);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice', onIce);
      socket.off('call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [cleanup, createPeer, flushIce, sendOffer, session?.token, session?.user.id, setInfoSafe, setStateSafe, trace]);

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
