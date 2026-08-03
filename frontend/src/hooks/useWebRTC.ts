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
const CALL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
};
const CALL_VIDEO_CONSTRAINTS = (facingMode: 'user' | 'environment'): MediaTrackConstraints => ({
  facingMode: { ideal: facingMode },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 24, max: 30 },
});

async function getIceServers(token: string): Promise<RTCIceServer[]> {
  try {
    const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
    const res = await fetch(`${BASE}/calls/ice-servers`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); return d.iceServers ?? DEFAULT_ICE; }
  } catch {}
  return DEFAULT_ICE;
}

async function getCallStream(type: 'audio' | 'video', facingMode: 'user' | 'environment') {
  return getMediaStream({
    audio: CALL_AUDIO_CONSTRAINTS,
    video: type === 'video' ? CALL_VIDEO_CONSTRAINTS(facingMode) : false,
  });
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
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');

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
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    // Ajouter les tracks locaux — le stream est garanti présent ici car
    // answerCall() attend getMediaStream() avant d'appeler createPC via webrtc:offer
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    pc.ontrack = (e) => {
      setRemoteStreams(prev => {
        const m = new Map(prev);
        const existing = m.get(targetUserId);
        const stream = existing ?? e.streams[0] ?? new MediaStream();
        if (!stream.getTracks().some(track => track.id === e.track.id)) stream.addTrack(e.track);
        m.set(targetUserId, stream);
        return m;
      });
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

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        callStartRef.current = Date.now();
        _setState('connected');
      }
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        try { pc.restartIce(); } catch {}
      }
    };

    pcs.current.set(targetUserId, pc);

    // Vider le buffer ICE
    (iceBuf.current.get(targetUserId) ?? []).forEach(c => { try { pc.addIceCandidate(c); } catch {} });
    iceBuf.current.delete(targetUserId);

    return pc;
  }

  async function sendOfferTo(targetUserId: string) {
    const socket = getExistingSocket();
    const info = callInfoRef.current;
    if (!socket || !info?.callId) return;
    const pc = createPC(targetUserId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: info.type === 'video' });
    await pc.setLocalDescription(offer);
    socket.emit('webrtc:offer', { callId: info.callId, targetUserId, sdp: offer });
  }

  const endCall = useCallback((notifyServer = true) => {
    const info = callInfoRef.current;
    stopRingtone();
    if (notifyServer && info?.callId) getExistingSocket()?.emit('call:end', { callId: info.callId });
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
      const stream = await getCallStream(type, cameraFacing);
      localStreamRef.current = stream;
      setLocalStream(stream);
      const info: CallInfo = { callId, conversationId, callerId: userId, type, participants: targetUserIds };
      _setInfo(info);
      _setState('calling');
      const socket = getExistingSocket();
      socket?.emit('call:start', { callId, conversationId, type, targetUserIds });
    } catch (err) { console.error('[WebRTC] startCall:', err); endCall(); }
  }, [userId, token, endCall, cameraFacing]);

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
      const stream = await getCallStream(info.type, cameraFacing);
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
      endCall(false);
    }
  }, [token, endCall, cameraFacing]);

  const toggleMute   = useCallback(() => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setIsMuted(v => !v); }, []);
  const toggleCamera = useCallback(() => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setIsCamOff(v => !v); }, []);
  const switchCamera = useCallback(async () => {
    const info = callInfoRef.current;
    if (!info || info.type !== 'video') return;
    const currentStream = localStreamRef.current;
    if (!currentStream) return;

    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false,
      });
      const nextVideoTrack = nextStream.getVideoTracks()[0];
      if (!nextVideoTrack) {
        nextStream.getTracks().forEach(t => t.stop());
        return;
      }

      const oldVideoTracks = currentStream.getVideoTracks();
      oldVideoTracks.forEach(track => currentStream.removeTrack(track));
      oldVideoTracks.forEach(track => track.stop());
      currentStream.addTrack(nextVideoTrack);

      pcs.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        sender?.replaceTrack(nextVideoTrack).catch(() => {});
      });

      setLocalStream(new MediaStream(currentStream.getTracks()));
      localStreamRef.current = currentStream;
      setCameraFacing(nextFacing);
      setIsCamOff(false);
    } catch (err) {
      console.error('[WebRTC] switchCamera:', err);
    }
  }, [cameraFacing]);

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
      socket.off('call:error');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice');

      socket.on('call:incoming', (data: CallInfo) => {
        console.log('[WebRTC] incoming call from', data.callerName);
        _setInfo(data);
        _setState('incoming');
        notifyIncomingCall(data.callerName ?? 'Quelqu\'un', data.type, data.conversationId);
      });

      socket.on('call:answered', (data: { callId: string; userId: string; accepted: boolean }) => {
        if (data.accepted) {
          stopRingtone();
          if (callStateRef.current === 'calling') {
            sendOfferTo(data.userId).catch(err => console.error('[WebRTC] offer after answer:', err));
          }
          // Fallback si onconnectionstatechange ne se déclenche pas
          setTimeout(() => { if (callStateRef.current === 'calling') _setState('connected'); }, 4000);
        } else {
          endCall(false);
        }
      });

      socket.on('call:ended', () => {
        const info = callInfoRef.current;
        const state = callStateRef.current;
        if (state === 'incoming' && info) {
          notifyMissedCall(info.callerName ?? 'Quelqu\'un');
        }
        endCall(false);
      });

      socket.on('call:error', (data: { message?: string }) => {
        console.error('[WebRTC] call error:', data?.message ?? 'Erreur appel');
        endCall(false);
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
        socket.off('call:error');
        socket.off('webrtc:offer');
        socket.off('webrtc:answer');
        socket.off('webrtc:ice');
      }
    };
  }, []); // [] — une seule fois, tout passe par les refs

  return { callState, callInfo, localStream, remoteStreams, isMuted, isCamOff, startCall, answerCall, endCall, toggleMute, toggleCamera, switchCamera };
}
