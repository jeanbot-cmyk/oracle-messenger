'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { ensureSocket, getExistingSocket, waitForSocket } from '../lib/socket';
import { useNotifications } from './useNotifications';
import { getMediaStream } from '../lib/media';
import { BACKEND_URL } from '../lib/config';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended';

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
const CALL_SOCKET_TIMEOUT_MS = 15_000;

function emitWithAck<T = any>(socket: any, event: string, payload: any, timeoutMs = CALL_SOCKET_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, response: T) => {
        if (err) {
          reject(new Error('Le serveur appel ne répond pas. Vérifiez la connexion et réessayez.'));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Envoi appel impossible'));
    }
  });
}

async function getIceServers(token: string): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/calls/ice-servers`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); return d.iceServers ?? DEFAULT_ICE; }
  } catch {}
  return DEFAULT_ICE;
}

async function getSfuSession(token: string, room: string, name?: string): Promise<{ enabled: boolean; url?: string; token?: string; reason?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/calls/sfu-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ room, name }),
    });
    if (!res.ok) return { enabled: false, reason: `SFU HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { enabled: false, reason: err instanceof Error ? err.message : 'SFU indisponible' };
  }
}

async function getCallStream(type: 'audio' | 'video', facingMode: 'user' | 'environment') {
  try {
    const stream = await getMediaStream({
      audio: CALL_AUDIO_CONSTRAINTS,
      video: type === 'video' ? CALL_VIDEO_CONSTRAINTS(facingMode) : false,
    });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("Aucun microphone disponible. Activez le micro pour continuer l'appel.");
    }
    audioTracks.forEach(track => { track.enabled = true; });
    return stream;
  } catch (err) {
    throw err instanceof Error
      ? err
      : new Error('Votre caméra ou microphone est désactivé. Activez les autorisations pour continuer.');
  }
}

async function getVideoTrackForFacing(facingMode: 'user' | 'environment') {
  const attempts: MediaStreamConstraints[] = [
    { video: { ...CALL_VIDEO_CONSTRAINTS(facingMode), facingMode: { exact: facingMode } }, audio: false },
    { video: CALL_VIDEO_CONSTRAINTS(facingMode), audio: false },
  ];

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === 'videoinput');
    const labelPattern = facingMode === 'environment'
      ? /(back|rear|environment|arrière|arri[eè]re|dos)/i
      : /(front|user|face|avant|selfie)/i;
    const preferred = cameras.find(camera => labelPattern.test(camera.label)) ??
      (facingMode === 'environment' ? cameras[cameras.length - 1] : cameras[0]);
    if (preferred?.deviceId) {
      attempts.push({
        video: { ...CALL_VIDEO_CONSTRAINTS(facingMode), deviceId: { exact: preferred.deviceId } },
        audio: false,
      });
    }
  } catch {}

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      if (track) return { stream, track };
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Impossible de basculer la caméra.');
}

// L'historique des appels est persisté côté serveur (CallLog en base).
// Le gateway NestJS enregistre automatiquement chaque appel à la fin.

export function useWebRTC(userId: string, token = '') {
  const [callState, setCallState]       = useState<CallState>('idle');
  const [callInfo, setCallInfo]         = useState<CallInfo | null>(null);
  const [callError, setCallError]       = useState('');
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
  const userIdRef      = useRef(userId);
  const tokenRef       = useRef(token);
  const startingRef    = useRef(false);
  const answeringRef   = useRef(false);
  const offerRetryTimers = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());
  const connectionWatchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const iceRestartTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sfuRoomRef = useRef<any>(null);
  const sfuActiveRef = useRef(false);
  const sfuConnectingRef = useRef(false);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const { notifyIncomingCall, notifyMissedCall, stopRingtone } = useNotifications();

  // Sync refs
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { callInfoRef.current = callInfo; }, [callInfo]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  function _setState(s: CallState) { callStateRef.current = s; setCallState(s); }
  function _setInfo(i: CallInfo | null) { callInfoRef.current = i; setCallInfo(i); }
  function failCall(message: string) {
    setCallError(message);
    setTimeout(() => setCallError(''), 6500);
  }

  function activateMicrophone(stream = localStreamRef.current) {
    const audioTracks = stream?.getAudioTracks() ?? [];
    audioTracks.forEach(track => { track.enabled = true; });
    setIsMuted(false);
    return audioTracks.length > 0;
  }

  function traceCall(event: string, details: Record<string, unknown> = {}) {
    const info = callInfoRef.current;
    const payload = {
      callId: info?.callId,
      conversationId: info?.conversationId,
      state: callStateRef.current,
      event,
      details,
      at: new Date().toISOString(),
    };
    console.info('[CallTrace]', payload);
    try {
      const socket = tokenRef.current ? ensureSocket(tokenRef.current) : getExistingSocket();
      socket?.emit('call:diagnostic', payload);
    } catch {}
  }

  function clearOfferRetries(targetUserId?: string) {
    const entries = targetUserId
      ? [[targetUserId, offerRetryTimers.current.get(targetUserId) ?? []] as const]
      : Array.from(offerRetryTimers.current.entries());
    entries.forEach(([uid, timers]) => {
      timers.forEach(timer => clearTimeout(timer));
      offerRetryTimers.current.delete(uid);
    });
  }

  function clearConnectionWatch(targetUserId?: string) {
    const entries = targetUserId
      ? [[targetUserId, connectionWatchTimers.current.get(targetUserId)] as const]
      : Array.from(connectionWatchTimers.current.entries());
    entries.forEach(([uid, timer]) => {
      if (timer) clearTimeout(timer);
      connectionWatchTimers.current.delete(uid);
    });
  }

  function clearIceRestartTimer(targetUserId?: string) {
    const entries = targetUserId
      ? [[targetUserId, iceRestartTimers.current.get(targetUserId)] as const]
      : Array.from(iceRestartTimers.current.entries());
    entries.forEach(([uid, timer]) => {
      if (timer) clearTimeout(timer);
      iceRestartTimers.current.delete(uid);
    });
  }

  function shouldUseSfu(info: CallInfo | null) {
    return Boolean(info && info.participants.length > 1);
  }

  function upsertRemoteTrack(participantId: string, track: MediaStreamTrack) {
    setRemoteStreams(prev => {
      const next = new Map(prev);
      const stream = next.get(participantId) ?? new MediaStream();
      stream.getTracks()
        .filter(existing => existing.kind === track.kind && existing.id !== track.id)
        .forEach(existing => {
          stream.removeTrack(existing);
          try { existing.stop(); } catch {}
        });
      if (!stream.getTracks().some(existing => existing.id === track.id)) stream.addTrack(track);
      next.set(participantId, stream);
      return next;
    });
  }

  async function disconnectSfu() {
    sfuActiveRef.current = false;
    sfuConnectingRef.current = false;
    const room = sfuRoomRef.current;
    sfuRoomRef.current = null;
    if (room) {
      try { room.disconnect(); } catch {}
    }
  }

  async function connectSfuIfAvailable(info: CallInfo, stream: MediaStream) {
    if (!tokenRef.current || !shouldUseSfu(info) || sfuRoomRef.current || sfuConnectingRef.current) return false;
    sfuConnectingRef.current = true;
    try {
      const session = await getSfuSession(tokenRef.current, info.callId, info.callerName);
      if (!session.enabled || !session.url || !session.token) {
        console.info('[LiveKit] SFU disabled:', session.reason ?? 'not configured');
        return false;
      }

      const livekit = await import('livekit-client');
      const room = new livekit.Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          simulcast: info.type === 'video',
          videoSimulcastLayers: info.type === 'video'
            ? [livekit.VideoPresets.h180, livekit.VideoPresets.h360, livekit.VideoPresets.h720]
            : undefined,
        },
      });

      room
        .on(livekit.RoomEvent.TrackSubscribed, (track: any, _publication: any, participant: any) => {
          const mediaTrack = track?.mediaStreamTrack;
          if (!mediaTrack || participant?.identity === userIdRef.current) return;
          upsertRemoteTrack(participant.identity, mediaTrack);
          callStartRef.current = Date.now();
          _setState('connected');
        })
        .on(livekit.RoomEvent.TrackUnsubscribed, (track: any, _publication: any, participant: any) => {
          const mediaTrack = track?.mediaStreamTrack;
          if (!mediaTrack || !participant?.identity) return;
          setRemoteStreams(prev => {
            const next = new Map(prev);
            const stream = next.get(participant.identity);
            if (stream) {
              stream.removeTrack(mediaTrack);
              if (!stream.getTracks().length) next.delete(participant.identity);
            }
            return next;
          });
        })
        .on(livekit.RoomEvent.ParticipantDisconnected, (participant: any) => {
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(participant.identity);
            return next;
          });
        })
        .on(livekit.RoomEvent.Disconnected, () => {
          sfuActiveRef.current = false;
        });

      await room.connect(session.url, session.token, { autoSubscribe: true });
      sfuRoomRef.current = room;
      sfuActiveRef.current = true;
      traceCall('sfu:connected', { room: info.callId, url: session.url });

      for (const track of stream.getTracks()) {
        await room.localParticipant.publishTrack(track, {
          source: track.kind === 'video' ? livekit.Track.Source.Camera : livekit.Track.Source.Microphone,
          simulcast: track.kind === 'video',
        });
      }

      room.remoteParticipants?.forEach((participant: any) => {
        participant.trackPublications?.forEach((publication: any) => {
          const mediaTrack = publication?.track?.mediaStreamTrack;
          if (mediaTrack) upsertRemoteTrack(participant.identity, mediaTrack);
        });
      });

      console.info('[LiveKit] connected to SFU room', info.callId);
      return true;
    } catch (err) {
      console.error('[LiveKit] connection failed:', err);
      traceCall('sfu:error', { message: err instanceof Error ? err.message : 'SFU connection failed' });
      await disconnectSfu();
      return false;
    } finally {
      sfuConnectingRef.current = false;
    }
  }

  function startConnectionWatch(targetUserId: string) {
    clearConnectionWatch(targetUserId);
    const timer = setTimeout(() => {
      const state = callStateRef.current;
      const pc = pcs.current.get(targetUserId);
      const connected =
        state === 'connected' ||
        pc?.connectionState === 'connected' ||
        pc?.iceConnectionState === 'connected' ||
        pc?.iceConnectionState === 'completed';
      if (connected) return;
      traceCall('media:connect-timeout', {
        targetUserId,
        pcConnectionState: pc?.connectionState,
        iceConnectionState: pc?.iceConnectionState,
      });
      failCall('L’appel a sonné, mais le son/vidéo ne s’est pas connecté. Réessayez avec un meilleur réseau.');
      endCall();
    }, 22_000);
    connectionWatchTimers.current.set(targetUserId, timer);
  }

  function emitOfferWithRetries(targetUserId: string, sdp: RTCSessionDescriptionInit) {
    const info = callInfoRef.current;
    const socket = tokenRef.current ? ensureSocket(tokenRef.current) : getExistingSocket();
    if (!socket || !info?.callId) return;
    clearOfferRetries(targetUserId);

    const emit = () => {
      const current = callInfoRef.current;
      const state = callStateRef.current;
      if (!current?.callId || current.callId !== info.callId) return;
      if (state === 'idle' || state === 'ended') return;
      socket.emit('webrtc:offer', { callId: current.callId, targetUserId, sdp });
    };

    emit();
    const timers = [1500, 4000].map(delay => setTimeout(emit, delay));
    offerRetryTimers.current.set(targetUserId, timers);
  }

  function scheduleIceRestart(targetUserId: string, reason: string) {
    const info = callInfoRef.current;
    if (!info || sfuActiveRef.current || sfuConnectingRef.current) return;
    // Pour éviter les collisions d'offres, seul l'appelant relance l'ICE.
    if (info.callerId !== userIdRef.current) return;
    if (iceRestartTimers.current.has(targetUserId)) return;
    const timer = setTimeout(() => {
      iceRestartTimers.current.delete(targetUserId);
      const state = callStateRef.current;
      if (state === 'idle' || state === 'ended') return;
      const pc = pcs.current.get(targetUserId);
      if (!pc || pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return;
      traceCall('ice:restart-offer', { targetUserId, reason, connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState });
      sendOfferTo(targetUserId, true).catch(err => {
        traceCall('ice:restart-offer-error', { targetUserId, message: err instanceof Error ? err.message : 'restart failed' });
      });
    }, 1200);
    iceRestartTimers.current.set(targetUserId, timer);
  }

  function createPC(targetUserId: string): RTCPeerConnection {
    pcs.current.get(targetUserId)?.close();
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 8,
    });
    traceCall('pc:create', { targetUserId, iceServers: iceServersRef.current.length });

    // Ajouter les tracks locaux — le stream est garanti présent ici car
    // answerCall() attend getMediaStream() avant d'appeler createPC via webrtc:offer
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => {
        pc.addTrack(t, localStreamRef.current!);
        t.onended = () => traceCall('local-track:ended', { targetUserId, kind: t.kind });
      });
    }

    pc.ontrack = (e) => {
      traceCall('remote-track', { targetUserId, kind: e.track.kind, streams: e.streams.length });
      clearOfferRetries(targetUserId);
      clearConnectionWatch(targetUserId);
      clearIceRestartTimer(targetUserId);
      _setState('connected');
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
      traceCall('ice:candidate', {
        targetUserId,
        candidateType: e.candidate.type,
        protocol: e.candidate.protocol,
      });
      const socket = tokenRef.current ? ensureSocket(tokenRef.current) : getExistingSocket();
      socket?.emit('webrtc:ice', {
        callId: callInfoRef.current?.callId,
        targetUserId,
        candidate: e.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      console.info('[WebRTC] connectionState', targetUserId, pc.connectionState);
      traceCall('pc:connection-state', { targetUserId, state: pc.connectionState });
      if (pc.connectionState === 'connected') { clearConnectionWatch(targetUserId); callStartRef.current = Date.now(); _setState('connected'); }
      if (pc.connectionState === 'failed') {
        console.warn('[WebRTC] connection failed, restarting ICE');
        failCall('Connexion appel instable. Tentative de reconnexion...');
        scheduleIceRestart(targetUserId, 'pc-failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.info('[WebRTC] iceConnectionState', targetUserId, pc.iceConnectionState);
      traceCall('pc:ice-state', { targetUserId, state: pc.iceConnectionState });
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearConnectionWatch(targetUserId);
        clearIceRestartTimer(targetUserId);
        callStartRef.current = Date.now();
        _setState('connected');
      }
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        if (pc.iceConnectionState === 'failed') {
          failCall('Relais appel instable. Tentative de reconnexion...');
        }
        scheduleIceRestart(targetUserId, `ice-${pc.iceConnectionState}`);
      }
    };

    pc.onicegatheringstatechange = () => {
      traceCall('pc:ice-gathering', { targetUserId, state: pc.iceGatheringState });
    };
    pc.onsignalingstatechange = () => {
      traceCall('pc:signaling-state', { targetUserId, state: pc.signalingState });
    };

    pcs.current.set(targetUserId, pc);

    // Vider le buffer ICE
    (iceBuf.current.get(targetUserId) ?? []).forEach(c => { try { pc.addIceCandidate(c); } catch {} });
    iceBuf.current.delete(targetUserId);

    return pc;
  }

  async function sendOfferTo(targetUserId: string, iceRestart = false) {
    const socket = tokenRef.current ? ensureSocket(tokenRef.current) : getExistingSocket();
    const info = callInfoRef.current;
    if (!socket || !info?.callId) return;
    const pc = createPC(targetUserId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: info.type === 'video', iceRestart });
    await pc.setLocalDescription(offer);
    traceCall('webrtc:offer:send', { targetUserId, iceRestart, type: info.type });
    emitOfferWithRetries(targetUserId, offer);
  }

  const endCall = useCallback((notifyServer = true) => {
    const info = callInfoRef.current;
    stopRingtone();
    startingRef.current = false;
    answeringRef.current = false;
    clearOfferRetries();
    clearConnectionWatch();
    clearIceRestartTimer();
    disconnectSfu().catch(() => {});
    if (notifyServer && info?.callId) {
      const socket = tokenRef.current ? ensureSocket(tokenRef.current) : getExistingSocket();
      socket?.emit('call:end', { callId: info.callId });
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
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
    if (startingRef.current || callStateRef.current !== 'idle') return;
    startingRef.current = true;
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const info: CallInfo = { callId, conversationId, callerId: userId, type, participants: targetUserIds };
    try {
      setCallError('');
      if (!token) throw new Error('Session appel indisponible');
      _setInfo(info);
      _setState('calling');
      if (type === 'video') {
        setCallError('Préparation de la caméra...');
      }
      const socket = await waitForSocket(token, CALL_SOCKET_TIMEOUT_MS);
      iceServersRef.current = await getIceServers(token);
      const stream = await getCallStream(type, cameraFacing);
      traceCall('media:local-ready', { type, audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });
      localStreamRef.current = stream;
      activateMicrophone(stream);
      setLocalStream(stream);
      setIsCamOff(false);
      setCallError('');
      await connectSfuIfAvailable(info, stream);
      const ack = await emitWithAck<{ ok?: boolean; message?: string; targets?: number }>(
        socket,
        'call:start',
        { callId, conversationId, type, targetUserIds },
      );
      if (ack?.ok === false) {
        throw new Error(ack.message ?? 'Aucun destinataire disponible pour cet appel.');
      }
      console.info('[WebRTC] call:start ack', { callId, targets: ack?.targets ?? targetUserIds.length });
      traceCall('call:start:ack', { targets: ack?.targets ?? targetUserIds.length });
    } catch (err) {
      console.error('[WebRTC] startCall:', err);
      failCall(err instanceof Error ? err.message : 'Impossible de démarrer cet appel.');
      endCall(false);
    } finally {
      startingRef.current = false;
    }
  }, [userId, token, endCall, cameraFacing]);

  const answerCall = useCallback(async (accepted: boolean) => {
    if (answeringRef.current) return;
    const info = callInfoRef.current;
    if (!info) return;
    answeringRef.current = true;
    stopRingtone();
    if (!accepted) {
      stopRingtone();
      const socket = token
        ? await waitForSocket(token, CALL_SOCKET_TIMEOUT_MS).catch(() => getExistingSocket())
        : getExistingSocket();
      socket?.emit('call:answer', { callId: info.callId, accepted: false });
      _setState('ended');
      setTimeout(() => _setState('idle'), 800);
      answeringRef.current = false;
      return;
    }
    try {
      setCallError('');
      if (!token) throw new Error('Session appel indisponible');
      _setState('connecting');
      const socket = await waitForSocket(token, CALL_SOCKET_TIMEOUT_MS);
      iceServersRef.current = await getIceServers(token);
      // Obtenir le stream LOCAL avant d'avertir le caller.
      // Ainsi quand le caller envoie webrtc:offer, localStreamRef est déjà prêt
      // et createPC() peut ajouter les tracks immédiatement.
      const stream = await getCallStream(info.type, cameraFacing);
      traceCall('media:local-ready', { type: info.type, audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });
      localStreamRef.current = stream;
      activateMicrophone(stream);
      setLocalStream(stream);
      setIsCamOff(false);
      const usingSfu = await connectSfuIfAvailable(info, stream);
      // Seulement maintenant on notifie le caller → il va envoyer l'offer
      const ack = await emitWithAck<{ ok?: boolean; message?: string; accepted?: boolean }>(
        socket,
        'call:answer',
        { callId: info.callId, accepted: true },
      );
      if (ack?.ok === false) {
        throw new Error(ack.message ?? 'Réponse appel refusée par le serveur.');
      }
      if (!usingSfu) startConnectionWatch(info.callerId);
      traceCall('call:answer:ack', { usingSfu });
      callStartRef.current = Date.now();
    } catch (err) {
      console.error('[WebRTC] answerCall — impossible d\'obtenir le stream:', err);
      failCall(err instanceof Error ? err.message : 'Impossible de répondre à cet appel.');
      // Refuser proprement si le micro/caméra est inaccessible
      const socket = token
        ? await waitForSocket(token, CALL_SOCKET_TIMEOUT_MS).catch(() => getExistingSocket())
        : getExistingSocket();
      socket?.emit('call:answer', { callId: info.callId, accepted: false });
      endCall(false);
    } finally {
      answeringRef.current = false;
    }
  }, [token, endCall, cameraFacing]);

  const toggleMute = useCallback(() => {
    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    if (!audioTracks.length) {
      failCall("Microphone indisponible. Autorisez le micro dans Android puis relancez l'appel.");
      setIsMuted(true);
      return;
    }
    const shouldMute = audioTracks.some(track => track.enabled);
    audioTracks.forEach(track => { track.enabled = !shouldMute; });
    setIsMuted(shouldMute);
    traceCall('microphone:toggle', { muted: shouldMute, tracks: audioTracks.length });
  }, []);
  const toggleCamera = useCallback(() => {
    const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (!videoTracks.length) {
      failCall("Caméra indisponible. Autorisez la caméra dans Android puis relancez l'appel vidéo.");
      setIsCamOff(true);
      return;
    }
    const shouldDisable = videoTracks.some(track => track.enabled);
    videoTracks.forEach(track => { track.enabled = !shouldDisable; });
    setIsCamOff(shouldDisable);
    traceCall('camera:toggle', { disabled: shouldDisable, tracks: videoTracks.length });
  }, []);
  const switchCamera = useCallback(async () => {
    const info = callInfoRef.current;
    if (!info || info.type !== 'video') return;
    const currentStream = localStreamRef.current;
    if (!currentStream) return;

    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    try {
      const { stream: nextStream, track: nextVideoTrack } = await getVideoTrackForFacing(nextFacing);

      const oldVideoTracks = currentStream.getVideoTracks();
      oldVideoTracks.forEach(track => currentStream.removeTrack(track));
      oldVideoTracks.forEach(track => track.stop());
      currentStream.addTrack(nextVideoTrack);

      pcs.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        sender?.replaceTrack(nextVideoTrack).catch(() => {});
      });
      const room = sfuRoomRef.current;
      if (room?.localParticipant) {
        const publications = Array.from(room.localParticipant.trackPublications?.values?.() ?? []);
        publications
          .filter((publication: any) => publication?.track?.mediaStreamTrack?.kind === 'video')
          .forEach((publication: any) => {
            try { room.localParticipant.unpublishTrack(publication.track, true); } catch {}
          });
        try {
          const livekit = await import('livekit-client');
          await room.localParticipant.publishTrack(nextVideoTrack, {
            source: livekit.Track.Source.Camera,
            simulcast: true,
          });
        } catch {}
      }

      setLocalStream(new MediaStream(currentStream.getTracks()));
      localStreamRef.current = currentStream;
      setCameraFacing(nextFacing);
      setIsCamOff(false);
    } catch (err) {
      console.error('[WebRTC] switchCamera:', err);
      failCall(err instanceof Error ? err.message : 'Impossible de basculer la caméra.');
    }
  }, [cameraFacing]);

  const startScreenShare = useCallback(async () => {
    const info = callInfoRef.current;
    const currentStream = localStreamRef.current;
    if (!info || !currentStream || callStateRef.current === 'idle' || callStateRef.current === 'ended') return;
    const mediaDevices: any = navigator.mediaDevices;
    if (!mediaDevices?.getDisplayMedia) {
      failCall('Le partage d’écran n’est pas disponible sur ce téléphone ou ce navigateur.');
      traceCall('screen-share:unsupported');
      return;
    }
    try {
      const displayStream: MediaStream = await mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 24 } },
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error('Aucune piste écran disponible');

      const previousScreenTrack = screenTrackRef.current;
      if (previousScreenTrack) previousScreenTrack.stop();
      screenTrackRef.current = screenTrack;

      const videoTracks = currentStream.getVideoTracks();
      videoTracks.forEach(track => {
        currentStream.removeTrack(track);
        track.stop();
      });
      currentStream.addTrack(screenTrack);

      const replacements = Array.from(pcs.current.values()).map(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        return sender ? sender.replaceTrack(screenTrack) : Promise.resolve();
      });
      await Promise.allSettled(replacements);

      const room = sfuRoomRef.current;
      if (room?.localParticipant) {
        const livekit = await import('livekit-client');
        await room.localParticipant.publishTrack(screenTrack, {
          source: livekit.Track.Source.ScreenShare,
          simulcast: false,
        });
      }

      screenTrack.onended = () => {
        traceCall('screen-share:ended');
        screenTrackRef.current = null;
        if (info.type === 'video') switchCamera().catch(() => {});
      };

      setLocalStream(new MediaStream(currentStream.getTracks()));
      localStreamRef.current = currentStream;
      setIsCamOff(false);
      traceCall('screen-share:started');
    } catch (err) {
      console.error('[WebRTC] startScreenShare:', err);
      failCall(err instanceof Error ? err.message : 'Partage d’écran impossible.');
      traceCall('screen-share:error', { message: err instanceof Error ? err.message : 'screen share failed' });
    }
  }, [switchCamera]);

  // ── Attacher les listeners socket — polling jusqu'à ce que le socket existe ──
  useEffect(() => {
    let cancelled = false;

    function attach() {
      if (cancelled) return;
      const socket = tokenRef.current ? ensureSocket(tokenRef.current) : getExistingSocket();
      if (!socket) { setTimeout(attach, 300); return; }

      // Nettoyer les anciens listeners
      socket.off('call:incoming');
      socket.off('call:incoming:received');
      socket.off('call:answered');
      socket.off('call:participants-added');
      socket.off('call:participant-left');
      socket.off('call:ended');
      socket.off('call:error');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice');
      socket.off('disconnect');

      socket.on('call:incoming', (data: CallInfo) => {
        traceCall('call:incoming', { callId: data.callId, type: data.type, participants: data.participants?.length ?? 0 });
        const current = callInfoRef.current;
        const state = callStateRef.current;
        if (current?.callId === data.callId && state !== 'idle' && state !== 'ended') {
          socket.emit('call:incoming:received', {
            callId: data.callId,
            conversationId: data.conversationId,
          });
          return;
        }
        _setInfo(data);
        _setState('incoming');
        socket.emit('call:incoming:received', {
          callId: data.callId,
          conversationId: data.conversationId,
        });
        notifyIncomingCall(data.callerName ?? 'Quelqu\'un', data.type, data.conversationId);
      });

      socket.on('call:incoming:received', (data: { callId: string; userId: string; receivedAt?: string }) => {
        if (data.callId !== callInfoRef.current?.callId) return;
        console.info('[WebRTC] incoming call received by peer:', data.userId, data.receivedAt ?? '');
      });

      socket.on('call:answered', (data: { callId: string; userId: string; accepted: boolean; ended?: boolean }) => {
        if (data.callId !== callInfoRef.current?.callId) return;
        if (data.userId === userIdRef.current) return;
        traceCall('call:answered', { userId: data.userId, accepted: data.accepted, ended: data.ended });
        if (data.accepted) {
          stopRingtone();
          if (callStateRef.current === 'calling') _setState('connecting');
          if (sfuActiveRef.current || sfuConnectingRef.current) return;
          if ((callStateRef.current === 'calling' || callStateRef.current === 'connecting' || callStateRef.current === 'connected') && localStreamRef.current) {
            startConnectionWatch(data.userId);
            sendOfferTo(data.userId).catch(err => console.error('[WebRTC] offer after answer:', err));
          }
        } else {
          if (data.ended === false) return;
          endCall(false);
        }
      });

      socket.on('call:participants-added', (data: { callId: string; userIds: string[] }) => {
        const current = callInfoRef.current;
        if (!current || data.callId !== current.callId) return;
        const nextInfo = {
          ...current,
          participants: [...new Set([...current.participants, ...(data.userIds ?? [])])],
        };
        _setInfo(nextInfo);
        if (localStreamRef.current && shouldUseSfu(nextInfo)) {
          connectSfuIfAvailable(nextInfo, localStreamRef.current)
            .then(connected => {
              if (connected) traceCall('sfu:enabled-after-participant-added', { participants: nextInfo.participants.length });
            })
            .catch(err => traceCall('sfu:enable-after-participant-added-error', {
              message: err instanceof Error ? err.message : 'SFU enable failed',
            }));
        }
      });

      socket.on('call:participant-left', (data: { callId: string; userId: string }) => {
        if (data.callId !== callInfoRef.current?.callId) return;
        const pc = pcs.current.get(data.userId);
        if (pc) {
          pc.close();
          pcs.current.delete(data.userId);
        }
        iceBuf.current.delete(data.userId);
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
      });

      socket.on('call:ended', (data?: { callId?: string; userId?: string; reason?: string }) => {
        const info = callInfoRef.current;
        if (data?.callId && info?.callId && data.callId !== info.callId) return;
        const state = callStateRef.current;
        traceCall('call:ended:received', { fromUserId: data?.userId, reason: data?.reason });
        if (state === 'incoming' && info) {
          notifyMissedCall(info.callerName ?? 'Quelqu\'un');
        }
        endCall(false);
      });

      socket.on('call:error', (data: { message?: string }) => {
        console.error('[WebRTC] call error:', data?.message ?? 'Erreur appel');
        failCall(data?.message ?? 'Erreur appel');
        endCall(false);
      });

      socket.on('webrtc:offer', async (data: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
        if (data.callId !== callInfoRef.current?.callId) return;
        try {
          traceCall('webrtc:offer:received', { fromUserId: data.fromUserId });
          if (callStateRef.current !== 'connected') _setState('connecting');
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
          traceCall('webrtc:answer:send', { targetUserId: data.fromUserId });
          socket.emit('webrtc:answer', { callId: data.callId, targetUserId: data.fromUserId, sdp: answer });
        } catch (err) { console.error('[WebRTC] offer error:', err); }
      });

      socket.on('webrtc:answer', async (data: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
        if ((data as any).callId && (data as any).callId !== callInfoRef.current?.callId) return;
        traceCall('webrtc:answer:received', { fromUserId: data.fromUserId });
        clearOfferRetries(data.fromUserId);
        const pc = pcs.current.get(data.fromUserId);
        if (pc) { try { await pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); } catch (err) { console.error('[WebRTC] answer error:', err); } }
      });

      socket.on('webrtc:ice', async (data: { callId?: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
        if (data.callId && data.callId !== callInfoRef.current?.callId) return;
        const pc = pcs.current.get(data.fromUserId);
        if (pc?.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        } else {
          const buf = iceBuf.current.get(data.fromUserId) ?? [];
          buf.push(data.candidate);
          iceBuf.current.set(data.fromUserId, buf);
        }
      });

      socket.on('disconnect', reason => {
        if (callStateRef.current !== 'idle' && callStateRef.current !== 'ended') {
          traceCall('socket:disconnect', { reason });
          failCall('Connexion serveur interrompue. Reconnexion en cours...');
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
        socket.off('call:incoming:received');
        socket.off('call:answered');
        socket.off('call:participants-added');
        socket.off('call:participant-left');
        socket.off('call:ended');
        socket.off('call:error');
        socket.off('webrtc:offer');
        socket.off('webrtc:answer');
        socket.off('webrtc:ice');
        socket.off('disconnect');
      }
    };
  }, [token]); // token change after login; refs keep call data fresh

  const addParticipants = useCallback((targetUserIds: string[]) => {
    const info = callInfoRef.current;
    if (!info?.callId || !targetUserIds.length) return;
    const socket = tokenRef.current ? ensureSocket(tokenRef.current) : getExistingSocket();
    if (!socket) {
      failCall('Connexion appel indisponible.');
      return;
    }
    emitWithAck<{ ok?: boolean; message?: string }>(
      socket,
      'call:add-participants',
      { callId: info.callId, targetUserIds },
    ).then(ack => {
      if (ack?.ok === false) failCall(ack.message ?? 'Impossible d’ajouter ce participant.');
    }).catch(err => {
      failCall(err instanceof Error ? err.message : 'Impossible d’ajouter ce participant.');
    });
  }, []);

  return { callState, callInfo, callError, localStream, remoteStreams, isMuted, isCamOff, startCall, answerCall, endCall, addParticipants, toggleMute, toggleCamera, switchCamera, startScreenShare };
}
