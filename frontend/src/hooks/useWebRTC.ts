'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getExistingSocket } from '../lib/socket';
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

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

async function getIceServers(token: string): Promise<RTCIceServer[]> {
  try {
    const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
    const res = await fetch(`${BASE}/calls/ice-servers`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); return d.iceServers ?? DEFAULT_ICE; }
  } catch {}
  return DEFAULT_ICE;
}

// L'historique des appels est persisté côté serveur (CallLog en base).
// Le gateway NestJS enregistre automatiquement chaque appel à la fin.

export function useWebRTC(userId: string, token = '') {
  const [callState, setCallState]       = useState<CallState>('idle');
  const [callInfo, setCallInfo]         = useState<CallInfo | null>(null);
  const [localStream, setLocalStream]   = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted]   = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  // Refs — toujours à jour, accessibles dans les closures socket sans re-render
  const callStateRef   = useRef<CallState>('idle');
  const callInfoRef    = useRef<CallInfo | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef  = useRef<RTCIceServer[]>(DEFAULT_ICE);
  const pcs            = useRef<Map<string, RTCPeerConnection>>(new Map());
  const callStartRef   = useRef<number>(0);
  const iceBuf         = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const { notifyIncomingCall, notifyMissedCall, stopRingtone } = useNotifications();

  // Sync refs
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { callInfoRef.current = callInfo; }, [callInfo]);

  function _setState(s: CallState) { callStateRef.current = s; setCallState(s); }
  function _setInfo(i: CallInfo | null) { callInfoRef.current = i; setCallInfo(i); }

  function createPC(targetUserId: string): RTCPeerConnection {
    pcs.current.get(targetUserId)?.close();
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    // Ajouter les tracks locaux — le stream est garanti présent ici car
    // answerCall() attend getMediaStream() avant d'appeler createPC via webrtc:offer
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setRemoteStreams(prev => { const m = new Map(prev); m.set(targetUserId, stream); return m; });
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      getExistingSocket()?.emit('webrtc:ice', {
        callId: callInfoRef.current?.callId,
        targetUserId,
        candidate: e.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { callStartRef.current = Date.now(); _setState('connected'); }
      if (pc.connectionState === 'failed') {
        console.warn('[WebRTC] connection failed, restarting ICE');
        pc.restartIce();
      }
    };

    pcs.current.set(targetUserId, pc);

    // Vider le buffer ICE
    (iceBuf.current.get(targetUserId) ?? []).forEach(c => { try { pc.addIceCandidate(c); } catch {} });
    iceBuf.current.delete(targetUserId);

    return pc;
  }

  const endCall = useCallback((logOutgoing = false) => {
    const info = callInfoRef.current;
    stopRingtone();
    if (info?.callId) getExistingSocket()?.emit('call:end', { callId: info.callId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcs.current.forEach(pc => pc.close());
    pcs.current.clear();
    iceBuf.current.clear();
    setLocalStream(null);
    setRemoteStreams(new Map());
    _setState('ended');
    _setInfo(null);
    setTimeout(() => _setState('idle'), 500);
  }, []);

  const startCall = useCallback(async (conversationId: string, targetUserIds: string[], type: 'audio' | 'video') => {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      iceServersRef.current = await getIceServers(token);
      const stream = await getMediaStream({ audio: true, video: type === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const info: CallInfo = { callId, conversationId, callerId: userId, type, participants: targetUserIds };
      _setInfo(info);
      _setState('calling');
      const socket = getExistingSocket();
      socket?.emit('call:start', { callId, conversationId, type, targetUserIds });
      for (const tid of targetUserIds) {
        const pc = createPC(tid);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc:offer', { callId, targetUserId: tid, sdp: offer });
      }
    } catch (err) { console.error('[WebRTC] startCall:', err); endCall(); }
  }, [userId, token, endCall]);

  const answerCall = useCallback(async (accepted: boolean) => {
    const info = callInfoRef.current;
    if (!info) return;
    stopRingtone();
    const socket = getExistingSocket();
    if (!accepted) {
      socket?.emit('call:answer', { callId: info.callId, accepted: false });
      _setState('ended');
      setTimeout(() => _setState('idle'), 800);
      return;
    }
    try {
      iceServersRef.current = await getIceServers(token);
      // Obtenir le stream LOCAL avant d'avertir le caller.
      // Ainsi quand le caller envoie webrtc:offer, localStreamRef est déjà prêt
      // et createPC() peut ajouter les tracks immédiatement.
      const stream = await getMediaStream({ audio: true, video: info.type === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      // Seulement maintenant on notifie le caller → il va envoyer l'offer
      socket?.emit('call:answer', { callId: info.callId, accepted: true });
      _setState('connected');
      callStartRef.current = Date.now();
    } catch (err) {
      console.error('[WebRTC] answerCall — impossible d\'obtenir le stream:', err);
      // Refuser proprement si le micro/caméra est inaccessible
      socket?.emit('call:answer', { callId: info.callId, accepted: false });
      endCall();
    }
  }, [token, endCall]);

  const toggleMute   = useCallback(() => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setIsMuted(v => !v); }, []);
  const toggleCamera = useCallback(() => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setIsCamOff(v => !v); }, []);

  // ── Attacher les listeners socket — polling jusqu'à ce que le socket existe ──
  useEffect(() => {
    let cancelled = false;

    function attach() {
      if (cancelled) return;
      const socket = getExistingSocket();
      if (!socket) { setTimeout(attach, 300); return; }

      // Nettoyer les anciens listeners
      socket.off('call:incoming');
      socket.off('call:answered');
      socket.off('call:ended');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice');

      socket.on('call:incoming', (data: CallInfo) => {
        console.log('[WebRTC] incoming call from', data.callerName);
        _setInfo(data);
        _setState('incoming');
        notifyIncomingCall(data.callerName ?? 'Quelqu\'un', data.type);
      });

      socket.on('call:answered', (data: { callId: string; userId: string; accepted: boolean }) => {
        if (data.accepted) {
          stopRingtone();
          // Fallback si onconnectionstatechange ne se déclenche pas
          setTimeout(() => { if (callStateRef.current === 'calling') _setState('connected'); }, 4000);
        } else {
          endCall();
        }
      });

      socket.on('call:ended', () => {
        const info = callInfoRef.current;
        const state = callStateRef.current;
        if (state === 'incoming' && info) {
          notifyMissedCall(info.callerName ?? 'Quelqu\'un');
        }
        endCall();
      });

      socket.on('webrtc:offer', async (data: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
        console.log('[WebRTC] offer from', data.fromUserId);
        try {
          // Attendre que le stream local soit prêt (récepteur vient d'accepter)
          let waited = 0;
          while (!localStreamRef.current && waited < 5000) {
            await new Promise(r => setTimeout(r, 200));
            waited += 200;
          }
          const pc = createPC(data.fromUserId);
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:answer', { callId: data.callId, targetUserId: data.fromUserId, sdp: answer });
        } catch (err) { console.error('[WebRTC] offer error:', err); }
      });

      socket.on('webrtc:answer', async (data: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
        const pc = pcs.current.get(data.fromUserId);
        if (pc) { try { await pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); } catch (err) { console.error('[WebRTC] answer error:', err); } }
      });

      socket.on('webrtc:ice', async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
        const pc = pcs.current.get(data.fromUserId);
        if (pc?.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        } else {
          const buf = iceBuf.current.get(data.fromUserId) ?? [];
          buf.push(data.candidate);
          iceBuf.current.set(data.fromUserId, buf);
        }
      });

      // Si le socket se reconnecte, ré-attacher
      socket.once('connect', () => { if (!cancelled) attach(); });
    }

    attach();
    return () => {
      cancelled = true;
      const socket = getExistingSocket();
      if (socket) {
        socket.off('call:incoming');
        socket.off('call:answered');
        socket.off('call:ended');
        socket.off('webrtc:offer');
        socket.off('webrtc:answer');
        socket.off('webrtc:ice');
      }
    };
  }, []); // [] — une seule fois, tout passe par les refs

  return { callState, callInfo, localStream, remoteStreams, isMuted, isCamOff, startCall, answerCall, endCall, toggleMute, toggleCamera };
}
