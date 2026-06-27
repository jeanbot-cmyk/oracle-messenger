'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { useNotifications } from './useNotifications';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export interface CallInfo {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName?: string;
  type: 'audio' | 'video';
  participants: string[];
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function useWebRTC(userId: string) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callInfo, setCallInfo]   = useState<CallInfo | null>(null);
  const [localStream, setLocalStream]   = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted]   = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const callInfoRef = useRef<CallInfo | null>(null);

  const { notifyIncomingCall, notifyMissedCall, stopRingtone } = useNotifications();

  const socket = getSocket();

  // Garder callInfoRef synchronisé
  useEffect(() => { callInfoRef.current = callInfo; }, [callInfo]);

  function createPC(targetUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.ontrack = (e) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(targetUserId, e.streams[0]);
        return next;
      });
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && callInfoRef.current?.callId) {
        socket?.emit('webrtc:ice', {
          callId: callInfoRef.current.callId,
          targetUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pcs.current.set(targetUserId, pc);
    return pc;
  }

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
      callInfoRef.current = info;
      setCallState('calling');

      socket?.emit('call:start', { callId, conversationId, type, targetUserIds });

      for (const targetId of targetUserIds) {
        const pc = createPC(targetId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc:offer', { callId, targetUserId: targetId, sdp: offer });
      }
    } catch (err) {
      console.error('[WebRTC] startCall error:', err);
      endCall();
    }
  }, [userId, socket]);

  const answerCall = useCallback(async (accepted: boolean) => {
    const info = callInfoRef.current;
    if (!info) return;

    stopRingtone(); // Arrêter la sonnerie dans tous les cas

    if (!accepted) {
      socket?.emit('call:answer', { callId: info.callId, accepted: false });
      // Notifier l'appelant que c'est refusé
      setCallState('ended');
      setTimeout(() => setCallState('idle'), 800);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: info.type === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      socket?.emit('call:answer', { callId: info.callId, accepted: true });
      setCallState('connected');
    } catch {
      endCall();
    }
  }, [socket]);

  const endCall = useCallback(() => {
    const info = callInfoRef.current;
    stopRingtone();
    if (info?.callId) socket?.emit('call:end', { callId: info.callId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcs.current.forEach(pc => pc.close());
    pcs.current.clear();
    setLocalStream(null);
    setRemoteStreams(new Map());
    setCallState('ended');
    setCallInfo(null);
    callInfoRef.current = null;
    setTimeout(() => setCallState('idle'), 500);
  }, [socket]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(v => !v);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCamOff(v => !v);
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Appel entrant → sonnerie + notif
    socket.on('call:incoming', (data: CallInfo) => {
      setCallInfo(data);
      callInfoRef.current = data;
      setCallState('incoming');
      notifyIncomingCall(data.callerName ?? 'Quelqu\'un', data.type);
    });

    // Réponse de l'appelé
    socket.on('call:answered', (data: { callId: string; userId: string; accepted: boolean }) => {
      if (data.accepted) {
        stopRingtone();
        setCallState('connected');
      } else {
        endCall();
      }
    });

    // Appel terminé par l'autre
    socket.on('call:ended', () => {
      const info = callInfoRef.current;
      // Si on était en sonnerie (incoming non répondu) → appel manqué
      if (callState === 'incoming' && info) {
        notifyMissedCall(info.callerName ?? 'Quelqu\'un');
      }
      endCall();
    });

    // Signaling WebRTC
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
      if (pc) {
        try { await pc.addIceCandidate(data.candidate); } catch {}
      }
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:answered');
      socket.off('call:ended');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice');
    };
  }, [socket]);

  return {
    callState, callInfo, localStream, remoteStreams,
    isMuted, isCamOff,
    startCall, answerCall, endCall, toggleMute, toggleCamera,
  };
}
