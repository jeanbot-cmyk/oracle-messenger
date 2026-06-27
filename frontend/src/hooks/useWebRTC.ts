'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export interface CallInfo {
  callId: string;
  conversationId: string;
  callerId: string;
  type: 'audio' | 'video';
  participants: string[];
}

// STUN servers publics — aucun coût serveur, P2P direct
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function useWebRTC(userId: string) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  // Map userId → RTCPeerConnection (pour appels groupés)
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const socket = getSocket();

  function createPC(targetUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Ajouter les tracks locaux
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // Recevoir les tracks distants
    pc.ontrack = (e) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(targetUserId, e.streams[0]);
        return next;
      });
    };

    // Envoyer les ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && callInfo?.callId) {
        socket?.emit('webrtc:ice', {
          callId: callInfo.callId,
          targetUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pcs.current.set(targetUserId, pc);
    return pc;
  }

  // Démarrer un appel
  const startCall = useCallback(async (
    conversationId: string,
    targetUserIds: string[],
    type: 'audio' | 'video'
  ) => {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const info: CallInfo = { callId, conversationId, callerId: userId, type, participants: targetUserIds };
      setCallInfo(info);
      setCallState('calling');

      socket?.emit('call:start', { callId, conversationId, type, targetUserIds });

      // Créer une PC pour chaque participant
      for (const targetId of targetUserIds) {
        const pc = createPC(targetId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc:offer', { callId, targetUserId: targetId, sdp: offer });
      }
    } catch (err) {
      console.error('Erreur démarrage appel:', err);
      endCall();
    }
  }, [userId, socket, callInfo]);

  // Répondre à un appel entrant
  const answerCall = useCallback(async (accepted: boolean) => {
    if (!callInfo) return;
    if (!accepted) {
      socket?.emit('call:answer', { callId: callInfo.callId, accepted: false });
      setCallState('ended');
      setTimeout(() => setCallState('idle'), 1000);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callInfo.type === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      socket?.emit('call:answer', { callId: callInfo.callId, accepted: true });
      setCallState('connected');
    } catch {
      endCall();
    }
  }, [callInfo, socket]);

  // Raccrocher
  const endCall = useCallback(() => {
    if (callInfo?.callId) {
      socket?.emit('call:end', { callId: callInfo.callId });
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcs.current.forEach(pc => pc.close());
    pcs.current.clear();
    setLocalStream(null);
    setRemoteStreams(new Map());
    setCallState('ended');
    setCallInfo(null);
    setTimeout(() => setCallState('idle'), 500);
  }, [callInfo, socket]);

  // Toggle micro
  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(v => !v);
  }, []);

  // Toggle caméra
  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCamOff(v => !v);
  }, []);

  // Écouter les événements Socket.IO
  useEffect(() => {
    if (!socket) return;

    socket.on('call:incoming', (data: CallInfo) => {
      setCallInfo(data);
      setCallState('incoming');
    });

    socket.on('call:answered', async (data: { callId: string; userId: string; accepted: boolean }) => {
      if (data.accepted) setCallState('connected');
      else endCall();
    });

    socket.on('call:ended', () => endCall());

    socket.on('webrtc:offer', async (data: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = createPC(data.fromUserId);
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { callId: data.callId, targetUserId: data.fromUserId, sdp: answer });
    });

    socket.on('webrtc:answer', async (data: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = pcs.current.get(data.fromUserId);
      if (pc) await pc.setRemoteDescription(data.sdp);
    });

    socket.on('webrtc:ice', async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const pc = pcs.current.get(data.fromUserId);
      if (pc) await pc.addIceCandidate(data.candidate);
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:answered');
      socket.off('call:ended');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice');
    };
  }, [socket, callInfo]);

  return {
    callState, callInfo, localStream, remoteStreams,
    isMuted, isCamOff,
    startCall, answerCall, endCall, toggleMute, toggleCamera,
  };
}
