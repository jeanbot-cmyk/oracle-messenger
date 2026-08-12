import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from '@livekit/react-native-webrtc';
import type { Socket } from 'socket.io-client';
import { DEFAULT_ICE, type NativeCallInfo, type NativeCallState } from '@/hooks/nativeCallUtils';

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

type UseNativeCallPeerConnectionsParams = {
  socketRef: RefValue<Socket | null>;
  localStreamRef: RefValue<MediaStream | null>;
  callInfoRef: RefValue<NativeCallInfo | null>;
  callStateRef: RefValue<NativeCallState>;
  setRemoteStreams: Dispatch<SetStateAction<Map<string, MediaStream>>>;
  setStateSafe: (next: NativeCallState) => void;
  setCallNotice: (message: string) => void;
  trace: NativeCallTrace;
};

export function useNativeCallPeerConnections({
  socketRef,
  localStreamRef,
  callInfoRef,
  callStateRef,
  setRemoteStreams,
  setStateSafe,
  setCallNotice,
  trace,
}: UseNativeCallPeerConnectionsParams) {
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setIceServers = useCallback((iceServers?: RTCIceServer[] | null) => {
    iceServersRef.current = iceServers?.length ? iceServers : DEFAULT_ICE;
  }, []);

  const resetPeerConnections = useCallback(() => {
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    pendingIceRef.current.clear();
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    setRemoteStreams(new Map());
  }, [setRemoteStreams]);

  const removePeerConnection = useCallback((targetUserId: string) => {
    const peer = peersRef.current.get(targetUserId);
    peer?.close();
    peersRef.current.delete(targetUserId);
    pendingIceRef.current.delete(targetUserId);
    setRemoteStreams(current => {
      const next = new Map(current);
      next.delete(targetUserId);
      return next;
    });
    trace('webrtc:peer-removed', { targetUserId });
  }, [setRemoteStreams, trace]);

  const addRemoteTrack = useCallback((userId: string, stream: MediaStream) => {
    setRemoteStreams(current => {
      const next = new Map(current);
      next.set(userId, stream);
      return next;
    });
  }, [setRemoteStreams]);

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
      if (callStateRef.current === 'idle' || callStateRef.current === 'ended') return;
      if (state === 'connected') setStateSafe('connected');
      if (state === 'disconnected' || state === 'failed') {
        setStateSafe('reconnecting');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (callStateRef.current === 'reconnecting' && peersRef.current.get(targetUserId) === pc) {
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
  }, [addRemoteTrack, callInfoRef, callStateRef, localStreamRef, setCallNotice, setStateSafe, socketRef, trace]);

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
  }, [callInfoRef, createPeer, socketRef, trace]);

  const handleOffer = useCallback(async (data: WebRtcSessionEvent) => {
    const info = callInfoRef.current;
    if (!info || data.callId !== info.callId) return;
    try {
      const pc = createPeer(data.fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
      await flushIce(data.fromUserId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('webrtc:answer', { callId: data.callId, targetUserId: data.fromUserId, sdp: answer });
      trace('webrtc:answer:sent', { targetUserId: data.fromUserId });
    } catch (error) {
      trace('webrtc:offer:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [callInfoRef, createPeer, flushIce, socketRef, trace]);

  const handleAnswer = useCallback(async (data: WebRtcSessionEvent) => {
    const info = callInfoRef.current;
    if (!info || data.callId !== info.callId) return;
    const pc = peersRef.current.get(data.fromUserId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
    await flushIce(data.fromUserId, pc);
    trace('webrtc:answer:received', { fromUserId: data.fromUserId });
  }, [callInfoRef, flushIce, trace]);

  const handleIce = useCallback(async (data: WebRtcIceEvent) => {
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
  }, [callInfoRef]);

  return {
    setIceServers,
    resetPeerConnections,
    removePeerConnection,
    sendOffer,
    handleOffer,
    handleAnswer,
    handleIce,
  };
}
