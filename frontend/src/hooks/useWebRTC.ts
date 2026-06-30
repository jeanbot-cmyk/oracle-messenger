'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { useNotifications } from './useNotifications';
import { getMediaStream } from '../lib/media';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export interface CallInfo {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName?: string;
  type: 'audio' | 'video';
  participants: string[];
}

// Default ICE servers — STUN only (works on same network)
// TURN servers are fetched dynamically from backend for cross-network calls
const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Public TURN servers (limited bandwidth but free)
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

async function getIceServers(token: string): Promise<RTCIceServer[]> {
  try {
    const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
    const res = await fetch(`${BASE}/calls/ice-servers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return data.iceServers ?? DEFAULT_ICE;
    }
  } catch {}
  return DEFAULT_ICE;
}

// ── Call log helpers ──────────────────────────────────────────────────────────
export interface CallLogEntry {
  id: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  name: string;
  at: string; // ISO timestamp
  duration?: number; // seconds
}

function loadCallLog(): CallLogEntry[] {
  try { return JSON.parse(localStorage.getItem('oracle-call-log') ?? '[]'); } catch { return []; }
}
function saveCallLog(log: CallLogEntry[]) {
  localStorage.setItem('oracle-call-log', JSON.stringify(log.slice(0, 200)));
}
function addCallLog(entry: Omit<CallLogEntry, 'id'>) {
  const log = loadCallLog();
  log.unshift({ ...entry, id: Date.now().toString() });
  saveCallLog(log);
}

export function useWebRTC(userId: string, token = '') {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callInfo, setCallInfo]   = useState<CallInfo | null>(null);
  const [localStream, setLocalStream]   = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const callStartRef = useRef<number>(0);
  const [isMuted, setIsMuted]   = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const callInfoRef = useRef<CallInfo | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE);

  const { notifyIncomingCall, notifyMissedCall, stopRingtone } = useNotifications();

  const socket = getSocket();

  // Garder callInfoRef synchronisé
  useEffect(() => { callInfoRef.current = callInfo; }, [callInfo]);

  function createPC(targetUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

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
      // Fetch TURN servers before starting
      iceServersRef.current = await getIceServers(token);
      const stream = await getMediaStream({ audio: true, video: type === 'video' });
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
      iceServersRef.current = await getIceServers(token);
      const stream = await getMediaStream({ audio: true, video: info.type === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      socket?.emit('call:answer', { callId: info.callId, accepted: true });
      setCallState('connected');
    } catch {
      endCall();
    }
  }, [socket]);

  const endCall = useCallback((logOutgoing = false) => {
    const info = callInfoRef.current;
    stopRingtone();
    // Log appel sortant raccroché
    if (logOutgoing && info && callStartRef.current) {
      const duration = Math.round((Date.now() - callStartRef.current) / 1000);
      addCallLog({ type: info.type, direction: 'outgoing', name: info.callerName ?? 'Inconnu', at: new Date().toISOString(), duration });
      callStartRef.current = 0;
    }
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
        callStartRef.current = Date.now();
        setCallState('connected');
      } else {
        const info = callInfoRef.current;
        if (info) addCallLog({ type: info.type, direction: 'outgoing', name: info.callerName ?? 'Inconnu', at: new Date().toISOString() });
        endCall();
      }
    });

    // Appel terminé par l'autre
    socket.on('call:ended', () => {
      const info = callInfoRef.current;
      if (callState === 'incoming' && info) {
        // Appel manqué
        notifyMissedCall(info.callerName ?? 'Quelqu\'un');
        addCallLog({ type: info.type, direction: 'missed', name: info.callerName ?? 'Inconnu', at: new Date().toISOString() });
      } else if (info && callStartRef.current) {
        const duration = Math.round((Date.now() - callStartRef.current) / 1000);
        addCallLog({ type: info.type, direction: 'incoming', name: info.callerName ?? 'Inconnu', at: new Date().toISOString(), duration });
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
