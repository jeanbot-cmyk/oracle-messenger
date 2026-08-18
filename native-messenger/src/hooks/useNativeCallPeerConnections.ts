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
const WEBRTC_SIGNAL_ACK_TIMEOUT_MS = 5_000;
const WEBRTC_STATS_INTERVAL_MS = 5_000;

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
  localMediaReadyRef: RefValue<Promise<boolean> | null>;
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
  localMediaReadyRef,
  callInfoRef,
  callStateRef,
  setRemoteStreams,
  setStateSafe,
  setCallNotice,
  trace,
}: UseNativeCallPeerConnectionsParams) {
	  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
	  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingAnswerRef = useRef<Map<string, WebRtcSessionEvent>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const previousStatsRef = useRef<Map<string, { at: number; bytesSent: number; bytesReceived: number }>>(new Map());

  const setIceServers = useCallback((iceServers?: RTCIceServer[] | null) => {
    iceServersRef.current = iceServers?.length ? iceServers : DEFAULT_ICE;
  }, []);

	  const resetPeerConnections = useCallback(() => {
	    peersRef.current.forEach(pc => pc.close());
	    peersRef.current.clear();
	    pendingIceRef.current.clear();
	    pendingAnswerRef.current.clear();
	    statsTimersRef.current.forEach(timer => clearInterval(timer));
	    statsTimersRef.current.clear();
	    previousStatsRef.current.clear();
	    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
	    reconnectTimerRef.current = null;
	    setRemoteStreams(new Map());
  }, [setRemoteStreams]);

  const removePeerConnection = useCallback((targetUserId: string) => {
	    const peer = peersRef.current.get(targetUserId);
	    peer?.close();
	    peersRef.current.delete(targetUserId);
	    pendingIceRef.current.delete(targetUserId);
	    pendingAnswerRef.current.delete(targetUserId);
	    const statsTimer = statsTimersRef.current.get(targetUserId);
	    if (statsTimer) clearInterval(statsTimer);
	    statsTimersRef.current.delete(targetUserId);
	    previousStatsRef.current.delete(targetUserId);
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

  const waitForLocalMedia = useCallback(async (phase: string) => {
    if (localMediaReadyRef.current) {
      trace('media:local-wait', { phase });
      const ready = await localMediaReadyRef.current;
      if (!ready) throw new Error('Microphone ou caméra indisponible.');
    }
    const info = callInfoRef.current;
    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
	    if (!audioTracks.length) {
	      throw new Error('Microphone indisponible.');
	    }
    if (info?.type === 'video' && !videoTracks.length) {
      throw new Error('Caméra indisponible.');
    }
    trace('media:local-ready-check', {
      phase,
      callType: info?.type,
      audioTracks: audioTracks.length,
      videoTracks: videoTracks.length,
    });
	  }, [callInfoRef, localMediaReadyRef, localStreamRef, trace]);

	  const emitSignaling = useCallback((
	    event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice',
	    payload: Record<string, unknown>,
	    details: Record<string, unknown>,
	  ) => {
	    const socket = socketRef.current;
	    if (!socket) {
	      trace(`${event}:emit-skipped`, { ...details, reason: 'no-socket' });
	      return;
	    }
	    try {
	      socket.timeout(WEBRTC_SIGNAL_ACK_TIMEOUT_MS).emit(
	        event,
	        payload,
	        (error: Error | null, response?: { ok?: boolean; message?: string; sockets?: number }) => {
	          if (error) {
	            trace(`${event}:ack-timeout`, {
	              ...details,
	              message: error.message || String(error),
	            });
	            return;
	          }
	          if (response?.ok === false) {
	            trace(`${event}:ack-error`, {
	              ...details,
	              message: response.message,
	              sockets: response.sockets ?? 0,
	            });
	            return;
	          }
	          trace(`${event}:ack`, {
	            ...details,
	            sockets: response?.sockets ?? 0,
	          });
	        },
	      );
	    } catch (error) {
	      trace(`${event}:emit-error`, {
	        ...details,
	        message: error instanceof Error ? error.message : String(error),
	      });
	    }
	  }, [socketRef, trace]);

  const readReportValues = useCallback((report: any) => {
    let bytesSent = 0;
    let bytesReceived = 0;
    let packetsSent = 0;
    let packetsReceived = 0;
    let packetsLost = 0;
    let jitterMs: number | undefined;
    let roundTripTimeMs: number | undefined;
    let availableOutgoingBitrate: number | undefined;
    let availableIncomingBitrate: number | undefined;
    let selectedLocalCandidateType: string | undefined;
    let selectedRemoteCandidateType: string | undefined;
    let localCandidateId = '';
    let remoteCandidateId = '';
    const candidates = new Map<string, any>();

    const visit = (stat: any) => {
      if (!stat || typeof stat !== 'object') return;
      if (stat.type === 'local-candidate' || stat.type === 'remote-candidate') candidates.set(stat.id, stat);
      if (stat.type === 'outbound-rtp' && !stat.isRemote) {
        bytesSent += Number(stat.bytesSent || 0);
        packetsSent += Number(stat.packetsSent || 0);
      }
      if (stat.type === 'inbound-rtp' && !stat.isRemote) {
        bytesReceived += Number(stat.bytesReceived || 0);
        packetsReceived += Number(stat.packetsReceived || 0);
        packetsLost += Number(stat.packetsLost || 0);
        if (Number.isFinite(Number(stat.jitter))) jitterMs = Math.round(Number(stat.jitter) * 1000);
      }
      if ((stat.type === 'candidate-pair' && (stat.selected || stat.nominated || stat.state === 'succeeded')) || stat.type === 'transport') {
        if (Number.isFinite(Number(stat.currentRoundTripTime))) roundTripTimeMs = Math.round(Number(stat.currentRoundTripTime) * 1000);
        if (Number.isFinite(Number(stat.availableOutgoingBitrate))) availableOutgoingBitrate = Math.round(Number(stat.availableOutgoingBitrate));
        if (Number.isFinite(Number(stat.availableIncomingBitrate))) availableIncomingBitrate = Math.round(Number(stat.availableIncomingBitrate));
        localCandidateId = stat.localCandidateId || localCandidateId;
        remoteCandidateId = stat.remoteCandidateId || remoteCandidateId;
      }
    };

    if (typeof report?.forEach === 'function') report.forEach(visit);
    else Object.values(report || {}).forEach(visit);

    const localCandidate = candidates.get(localCandidateId);
    const remoteCandidate = candidates.get(remoteCandidateId);
    selectedLocalCandidateType = localCandidate?.candidateType || localCandidate?.type;
    selectedRemoteCandidateType = remoteCandidate?.candidateType || remoteCandidate?.type;

    return {
      bytesSent,
      bytesReceived,
      packetsSent,
      packetsReceived,
      packetsLost,
      jitterMs,
      roundTripTimeMs,
      availableOutgoingBitrate,
      availableIncomingBitrate,
      selectedLocalCandidateType,
      selectedRemoteCandidateType,
    };
  }, []);

  const samplePeerStats = useCallback(async (targetUserId: string, pc: RTCPeerConnection) => {
    try {
      const report = await (pc as any).getStats?.();
      const current = readReportValues(report);
      const now = Date.now();
      const previous = previousStatsRef.current.get(targetUserId);
      previousStatsRef.current.set(targetUserId, {
        at: now,
        bytesSent: current.bytesSent,
        bytesReceived: current.bytesReceived,
      });
      const elapsedSeconds = previous ? Math.max(1, (now - previous.at) / 1000) : 0;
      trace('webrtc:stats', {
        callId: callInfoRef.current?.callId,
        targetUserId,
        packetsSent: current.packetsSent,
        packetsReceived: current.packetsReceived,
        packetsLost: current.packetsLost,
        jitterMs: current.jitterMs,
        roundTripTimeMs: current.roundTripTimeMs,
        bitrateSentKbps: previous ? Math.round(((current.bytesSent - previous.bytesSent) * 8) / elapsedSeconds / 1000) : undefined,
        bitrateReceivedKbps: previous ? Math.round(((current.bytesReceived - previous.bytesReceived) * 8) / elapsedSeconds / 1000) : undefined,
        availableOutgoingBitrate: current.availableOutgoingBitrate,
        availableIncomingBitrate: current.availableIncomingBitrate,
        selectedLocalCandidateType: current.selectedLocalCandidateType,
        selectedRemoteCandidateType: current.selectedRemoteCandidateType,
      });
    } catch (error) {
      trace('webrtc:stats:error', {
        targetUserId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [callInfoRef, readReportValues, trace]);

  const startPeerStats = useCallback((targetUserId: string, pc: RTCPeerConnection) => {
    if (statsTimersRef.current.has(targetUserId)) return;
    void samplePeerStats(targetUserId, pc);
    const timer = setInterval(() => {
      if (peersRef.current.get(targetUserId) !== pc || ['idle', 'ended'].includes(callStateRef.current)) {
        clearInterval(timer);
        statsTimersRef.current.delete(targetUserId);
        previousStatsRef.current.delete(targetUserId);
        return;
      }
      void samplePeerStats(targetUserId, pc);
    }, WEBRTC_STATS_INTERVAL_MS);
    statsTimersRef.current.set(targetUserId, timer);
  }, [callStateRef, samplePeerStats]);

  const createPeer = useCallback((targetUserId: string) => {
    const existing = peersRef.current.get(targetUserId);
    if (existing) {
      const senders = typeof (existing as any).getSenders === 'function' ? (existing as any).getSenders() : [];
      const sentTrackIds = new Set(senders.map((sender: any) => sender?.track?.id).filter(Boolean));
      localStreamRef.current?.getTracks().forEach(track => {
        if (!sentTrackIds.has(track.id)) {
          existing.addTrack(track, localStreamRef.current as MediaStream);
          trace('webrtc:track:added-existing-peer', { targetUserId, kind: track.kind });
        }
      });
      return existing;
    }
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current } as any);
    peersRef.current.set(targetUserId, pc);

    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current as MediaStream);
    });

	    (pc as any).onicecandidate = (event: any) => {
	      if (event.candidate) {
	        const callId = callInfoRef.current?.callId;
	        if (!callId) {
	          trace('webrtc:ice:emit-skipped', { targetUserId, reason: 'no-call-id' });
	          return;
	        }
	        emitSignaling('webrtc:ice', {
	          callId,
	          targetUserId,
	          candidate: event.candidate,
	        }, { callId, targetUserId });
	      }
	    };

    (pc as any).ontrack = (event: any) => {
      const stream = event.streams?.[0];
      if (stream) addRemoteTrack(targetUserId, stream);
      trace('webrtc:track', { targetUserId, kind: event.track?.kind, streams: event.streams?.length ?? 0 });
      trace('MEDIA_CONNECTED', {
        callId: callInfoRef.current?.callId,
        remoteIdentity: targetUserId,
        kind: event.track?.kind,
        provider: 'webrtc',
      });
    };

    (pc as any).onconnectionstatechange = () => {
      const state = pc.connectionState;
      trace('webrtc:connection-state', { targetUserId, state });
      if (callStateRef.current === 'idle' || callStateRef.current === 'ended') return;
      if (state === 'connected') {
        setStateSafe('connected');
        startPeerStats(targetUserId, pc);
        trace('ICE_CONNECTED', {
          callId: callInfoRef.current?.callId,
          targetUserId,
          provider: 'webrtc',
        });
      }
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

    (pc as any).onicegatheringstatechange = () => {
      trace('webrtc:ice-gathering-state', { targetUserId, state: pc.iceGatheringState });
    };

    (pc as any).onsignalingstatechange = () => {
      trace('webrtc:signaling-state', { targetUserId, state: pc.signalingState });
    };

    return pc;
	  }, [addRemoteTrack, callInfoRef, callStateRef, emitSignaling, localStreamRef, setCallNotice, setStateSafe, startPeerStats, trace]);

	  const flushIce = useCallback(async (fromUserId: string, pc: RTCPeerConnection) => {
	    const pending = pendingIceRef.current.get(fromUserId) ?? [];
	    pendingIceRef.current.delete(fromUserId);
	    for (const candidate of pending) {
	      await pc.addIceCandidate(new RTCIceCandidate(candidate));
	    }
	    if (pending.length) trace('webrtc:ice:flushed', { fromUserId, count: pending.length });
	  }, [trace]);

	  const applyRemoteAnswer = useCallback(async (data: WebRtcSessionEvent, pc: RTCPeerConnection) => {
	    const signalingState = String((pc as any).signalingState || '');
	    if (signalingState === 'stable' && pc.remoteDescription) {
	      trace('webrtc:answer:ignored-duplicate', { fromUserId: data.fromUserId, signalingState });
	      return;
	    }
	    if (signalingState && signalingState !== 'have-local-offer') {
	      trace('webrtc:answer:ignored-invalid-state', { fromUserId: data.fromUserId, signalingState });
	      return;
	    }
	    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
	    await flushIce(data.fromUserId, pc);
	    trace('webrtc:answer:received', { fromUserId: data.fromUserId });
	    trace('SDP_ANSWER_RECEIVED', { callId: data.callId, fromUserId: data.fromUserId, provider: 'webrtc' });
	  }, [flushIce, trace]);

  const sendOffer = useCallback(async (targetUserId: string) => {
    const info = callInfoRef.current;
    if (!info) return;
    await waitForLocalMedia('send-offer');
    const pc = createPeer(targetUserId);
    const existingLocalOffer = pc.localDescription?.type === 'offer' ? pc.localDescription : null;
    const signalingState = String((pc as any).signalingState || '');
    if (existingLocalOffer && signalingState === 'have-local-offer') {
      const sdp: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: existingLocalOffer.sdp || '',
      };
      emitSignaling('webrtc:offer', {
        callId: info.callId,
        targetUserId,
        sdp,
      }, { callId: info.callId, targetUserId, replay: true });
      trace('webrtc:offer:resent', { targetUserId, signalingState });
      return;
    }
    if (pc.remoteDescription && signalingState === 'stable' && info.type !== 'video') {
      trace('webrtc:offer:skipped-already-negotiated', { targetUserId, signalingState });
      return;
    }
    const offerStartedAt = Date.now();
    const offer = await pc.createOffer({ iceRestart: false } as any);
    trace('webrtc:offer:created', {
      callId: info.callId,
      targetUserId,
      durationMs: Date.now() - offerStartedAt,
      signalingState: (pc as any).signalingState,
    });
    const localDescriptionStartedAt = Date.now();
    await pc.setLocalDescription(offer);
    trace('webrtc:local-description:set', {
      callId: info.callId,
      targetUserId,
      type: offer.type,
      durationMs: Date.now() - localDescriptionStartedAt,
      signalingState: (pc as any).signalingState,
    });
	    emitSignaling('webrtc:offer', {
	      callId: info.callId,
	      targetUserId,
	      sdp: offer,
	    }, { callId: info.callId, targetUserId });
	    trace('webrtc:offer:sent', { targetUserId });
	    trace('SDP_OFFER_SENT', { callId: info.callId, targetUserId, provider: 'webrtc' });
	    const pendingAnswer = pendingAnswerRef.current.get(targetUserId);
	    if (pendingAnswer?.callId === info.callId) {
	      pendingAnswerRef.current.delete(targetUserId);
	      trace('webrtc:answer:apply-buffered', { fromUserId: targetUserId });
	      await applyRemoteAnswer(pendingAnswer, pc);
	    }
	  }, [applyRemoteAnswer, callInfoRef, createPeer, emitSignaling, trace, waitForLocalMedia]);

  const handleOffer = useCallback(async (data: WebRtcSessionEvent) => {
    const info = callInfoRef.current;
    if (!info || data.callId !== info.callId) return;
    try {
      await waitForLocalMedia('handle-offer');
      const pc = createPeer(data.fromUserId);
      const remoteDescriptionStartedAt = Date.now();
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
      trace('webrtc:remote-description:set', {
        callId: data.callId,
        fromUserId: data.fromUserId,
        type: data.sdp?.type,
        durationMs: Date.now() - remoteDescriptionStartedAt,
        signalingState: (pc as any).signalingState,
      });
      await flushIce(data.fromUserId, pc);
      const answerStartedAt = Date.now();
      const answer = await pc.createAnswer();
      trace('webrtc:answer:created', {
        callId: data.callId,
        targetUserId: data.fromUserId,
        durationMs: Date.now() - answerStartedAt,
        signalingState: (pc as any).signalingState,
      });
      const localDescriptionStartedAt = Date.now();
      await pc.setLocalDescription(answer);
      trace('webrtc:local-description:set', {
        callId: data.callId,
        targetUserId: data.fromUserId,
        type: answer.type,
        durationMs: Date.now() - localDescriptionStartedAt,
        signalingState: (pc as any).signalingState,
      });
	      emitSignaling('webrtc:answer', { callId: data.callId, targetUserId: data.fromUserId, sdp: answer }, {
	        callId: data.callId,
	        targetUserId: data.fromUserId,
	      });
	      trace('webrtc:answer:sent', { targetUserId: data.fromUserId });
	      trace('SDP_ANSWER_SENT', { callId: data.callId, targetUserId: data.fromUserId, provider: 'webrtc' });
	    } catch (error) {
	      trace('webrtc:offer:error', { message: error instanceof Error ? error.message : String(error) });
	    }
	  }, [callInfoRef, createPeer, emitSignaling, flushIce, trace, waitForLocalMedia]);

  const handleAnswer = useCallback(async (data: WebRtcSessionEvent) => {
	    const info = callInfoRef.current;
	    if (!info || data.callId !== info.callId) return;
	    const pc = peersRef.current.get(data.fromUserId);
	    if (!pc) {
	      pendingAnswerRef.current.set(data.fromUserId, data);
	      trace('webrtc:answer:buffered-no-peer', { fromUserId: data.fromUserId, callId: data.callId });
	      return;
	    }
	    await applyRemoteAnswer(data, pc);
	  }, [applyRemoteAnswer, callInfoRef, trace]);

  const handleIce = useCallback(async (data: WebRtcIceEvent) => {
    const info = callInfoRef.current;
    if (!info || data.callId !== info.callId) return;
    const pc = peersRef.current.get(data.fromUserId);
	    if (!pc?.remoteDescription) {
	      const list = pendingIceRef.current.get(data.fromUserId) ?? [];
	      list.push(data.candidate);
	      pendingIceRef.current.set(data.fromUserId, list);
	      trace('webrtc:ice:buffered', { fromUserId: data.fromUserId, count: list.length });
	      return;
	    }
	    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
	    trace('webrtc:ice:added', { fromUserId: data.fromUserId });
	  }, [callInfoRef, trace]);

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
