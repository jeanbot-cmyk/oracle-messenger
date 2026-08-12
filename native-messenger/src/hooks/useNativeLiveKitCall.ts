import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AudioSession } from '@livekit/react-native';
import { MediaStream } from '@livekit/react-native-webrtc';
import {
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  type AudioCaptureOptions,
  type VideoCaptureOptions,
} from 'livekit-client';
import InCallManager from 'react-native-incall-manager';
import { type NativeCallInfo, type NativeCallState } from '@/hooks/nativeCallUtils';
import { api } from '@/services/api';
import type { AuthSession } from '@/types/messenger';

type CameraFacing = 'user' | 'environment';
type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;

type UseNativeLiveKitCallParams = {
  session: AuthSession | null;
  localStreamRef: RefValue<MediaStream | null>;
  callInfoRef: RefValue<NativeCallInfo | null>;
  callStateRef: RefValue<NativeCallState>;
  cameraFacing: CameraFacing;
  setLocalStream: Dispatch<SetStateAction<MediaStream | null>>;
  setRemoteStreams: Dispatch<SetStateAction<Map<string, MediaStream>>>;
  setMuted: Dispatch<SetStateAction<boolean>>;
  setCameraOff: Dispatch<SetStateAction<boolean>>;
  setCameraFacing: Dispatch<SetStateAction<CameraFacing>>;
  setStateSafe: (next: NativeCallState) => void;
  setCallNotice: (message: string) => void;
  getSpeakerOn: () => boolean;
  applyAudioRoute: (enabled: boolean) => void;
  trace: NativeCallTrace;
};

const AUDIO_OPTIONS: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

function videoOptions(facing: CameraFacing): VideoCaptureOptions {
  return {
    facingMode: facing,
    resolution: { width: 1280, height: 720, frameRate: 24 },
    frameRate: 24,
  };
}

function getPublicationStream(publication?: { track?: { mediaStream?: unknown } } | null) {
  return (publication?.track?.mediaStream ?? null) as MediaStream | null;
}

export function useNativeLiveKitCall({
  session,
  localStreamRef,
  callInfoRef,
  callStateRef,
  cameraFacing,
  setLocalStream,
  setRemoteStreams,
  setMuted,
  setCameraOff,
  setCameraFacing,
  setStateSafe,
  setCallNotice,
  getSpeakerOn,
  applyAudioRoute,
  trace,
}: UseNativeLiveKitCallParams) {
  const roomRef = useRef<Room | null>(null);
  const liveKitActiveRef = useRef(false);
  const disconnectingRef = useRef(false);
  const disconnectSequenceRef = useRef(0);
  const disconnectResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (disconnectResetTimerRef.current) clearTimeout(disconnectResetTimerRef.current);
  }, []);

  const setLocalPreviewFromRoom = useCallback((room: Room) => {
    const publication = room.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
    const stream = getPublicationStream(publication);
    if (stream) {
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
  }, [localStreamRef, setLocalStream]);

  const setRemoteParticipantStream = useCallback((participant: RemoteParticipant) => {
    const videoPublication = Array.from(participant.videoTrackPublications.values())
      .find(publication => getPublicationStream(publication));
    const stream = getPublicationStream(videoPublication);
    setRemoteStreams(current => {
      const next = new Map(current);
      if (stream) next.set(participant.identity, stream);
      else next.delete(participant.identity);
      return next;
    });
  }, [setRemoteStreams]);

  const removeRemoteParticipantStream = useCallback((identity: string) => {
    setRemoteStreams(current => {
      const next = new Map(current);
      next.delete(identity);
      return next;
    });
  }, [setRemoteStreams]);

  const disconnectLiveKit = useCallback((stopTracks = true) => {
    const room = roomRef.current;
    const wasActive = liveKitActiveRef.current || !!room;
    const disconnectSequence = disconnectSequenceRef.current + 1;
    disconnectSequenceRef.current = disconnectSequence;
    if (disconnectResetTimerRef.current) {
      clearTimeout(disconnectResetTimerRef.current);
      disconnectResetTimerRef.current = null;
    }
    disconnectingRef.current = true;
    liveKitActiveRef.current = false;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      room.disconnect(stopTracks).catch(error => {
        trace('livekit:disconnect:error', { message: error instanceof Error ? error.message : String(error) });
      });
    }
    AudioSession.stopAudioSession().catch(() => null);
    setRemoteStreams(new Map());
    setLocalStream(null);
    localStreamRef.current = null;
    trace('livekit:disconnect', { stopTracks, wasActive });
    disconnectResetTimerRef.current = setTimeout(() => {
      if (disconnectSequenceRef.current === disconnectSequence) {
        disconnectingRef.current = false;
        disconnectResetTimerRef.current = null;
      }
    }, 1200);
    return wasActive;
  }, [localStreamRef, setLocalStream, setRemoteStreams, trace]);

  const connectLiveKit = useCallback(async (
    info: NativeCallInfo,
    type: 'audio' | 'video',
    facing: CameraFacing,
  ) => {
    if (!session?.token || !session.user?.id) return false;
    let tokenResponse: Awaited<ReturnType<typeof api.sfuToken>>;
    try {
      tokenResponse = await api.sfuToken(session.token, info.callId, session.user.name);
    } catch (error) {
      trace('livekit:token:error', { message: error instanceof Error ? error.message : String(error) });
      return false;
    }
    if (!tokenResponse.enabled || !tokenResponse.url || !tokenResponse.token) {
      trace('livekit:disabled', { reason: tokenResponse.reason || 'missing-token-or-url' });
      return false;
    }

    disconnectLiveKit(true);
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;
    const shouldIgnoreRoomEvent = () => (
      roomRef.current !== room ||
      callStateRef.current === 'idle' ||
      callStateRef.current === 'ended'
    );

    room.on(RoomEvent.Connected, () => {
      if (shouldIgnoreRoomEvent()) return;
      trace('livekit:connected', { room: tokenResponse.room || info.callId });
      if (callStateRef.current === 'connecting') setStateSafe('connected');
    });
    room.on(RoomEvent.Reconnecting, () => {
      if (shouldIgnoreRoomEvent()) return;
      setStateSafe('reconnecting');
      trace('livekit:reconnecting');
    });
    room.on(RoomEvent.SignalReconnecting, () => {
      if (shouldIgnoreRoomEvent()) return;
      setStateSafe('reconnecting');
      trace('livekit:signal-reconnecting');
    });
    room.on(RoomEvent.Reconnected, () => {
      if (shouldIgnoreRoomEvent()) return;
      setStateSafe('connected');
      applyAudioRoute(getSpeakerOn());
      trace('livekit:reconnected');
    });
    room.on(RoomEvent.Disconnected, reason => {
      if (shouldIgnoreRoomEvent()) return;
      trace('livekit:disconnected', { reason });
      const isStaleIntentionalDisconnect = disconnectingRef.current && roomRef.current !== room;
      if (!isStaleIntentionalDisconnect && callStateRef.current !== 'idle') {
        setStateSafe('reconnecting');
        setCallNotice('Connexion média interrompue.');
      }
    });
    room.on(RoomEvent.ParticipantConnected, participant => {
      if (shouldIgnoreRoomEvent()) return;
      setStateSafe('connected');
      setRemoteParticipantStream(participant);
      trace('livekit:participant-connected', { identity: participant.identity });
    });
    room.on(RoomEvent.ParticipantDisconnected, participant => {
      if (shouldIgnoreRoomEvent()) return;
      removeRemoteParticipantStream(participant.identity);
      trace('livekit:participant-disconnected', { identity: participant.identity });
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (shouldIgnoreRoomEvent()) return;
      if (track.kind === Track.Kind.Video) setRemoteParticipantStream(participant);
      if (track.kind === Track.Kind.Audio) room.startAudio().catch(() => null);
      setStateSafe('connected');
      trace('livekit:track-subscribed', {
        identity: participant.identity,
        kind: track.kind,
        source: publication.source,
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => {
      if (shouldIgnoreRoomEvent()) return;
      setRemoteParticipantStream(participant);
      trace('livekit:track-unsubscribed', { identity: participant.identity });
    });
    room.on(RoomEvent.LocalTrackPublished, publication => {
      if (shouldIgnoreRoomEvent()) return;
      if (publication.source === Track.Source.Camera) setLocalPreviewFromRoom(room);
      trace('livekit:local-track-published', { source: publication.source, kind: publication.kind });
    });
    room.on(RoomEvent.LocalTrackUnpublished, publication => {
      if (shouldIgnoreRoomEvent()) return;
      if (publication.source === Track.Source.Camera) {
        setCameraOff(true);
      }
      trace('livekit:local-track-unpublished', { source: publication.source, kind: publication.kind });
    });

    try {
      await AudioSession.startAudioSession();
      applyAudioRoute(getSpeakerOn());
      await room.connect(tokenResponse.url, tokenResponse.token, { autoSubscribe: true });
      liveKitActiveRef.current = true;
      await room.startAudio().catch(() => null);
      await room.localParticipant.setMicrophoneEnabled(true, AUDIO_OPTIONS, {
        source: Track.Source.Microphone,
        stream: info.callId,
        stopMicTrackOnMute: false,
      });
      setMuted(false);
      if (type === 'video') {
        await room.localParticipant.setCameraEnabled(true, videoOptions(facing), {
          source: Track.Source.Camera,
          stream: info.callId,
          simulcast: true,
        });
        setLocalPreviewFromRoom(room);
        setCameraOff(false);
      } else {
        setCameraOff(true);
      }
      room.remoteParticipants.forEach(setRemoteParticipantStream);
      applyAudioRoute(getSpeakerOn());
      trace('livekit:media-ready', {
        type,
        room: tokenResponse.room || info.callId,
        participants: room.remoteParticipants.size,
      });
      return true;
    } catch (error) {
      trace('livekit:connect:error', { message: error instanceof Error ? error.message : String(error) });
      disconnectLiveKit(true);
      return false;
    }
  }, [
    applyAudioRoute,
    callStateRef,
    disconnectLiveKit,
    getSpeakerOn,
    removeRemoteParticipantStream,
    session?.token,
    session?.user.id,
    session?.user.name,
    setCallNotice,
    setCameraOff,
    setLocalPreviewFromRoom,
    setMuted,
    setRemoteParticipantStream,
    setStateSafe,
    trace,
  ]);

  const toggleLiveKitMute = useCallback(async () => {
    const room = roomRef.current;
    if (!liveKitActiveRef.current || !room) return false;
    const nextMuted = room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted, AUDIO_OPTIONS, {
        source: Track.Source.Microphone,
        stream: callInfoRef.current?.callId,
        stopMicTrackOnMute: false,
      });
      try { InCallManager.setMicrophoneMute(nextMuted); } catch {}
      setMuted(nextMuted);
      trace('livekit:audio:mute', { muted: nextMuted });
      return true;
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Microphone indisponible.');
      trace('livekit:audio:mute:error', { message: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }, [callInfoRef, setCallNotice, setMuted, trace]);

  const toggleLiveKitCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!liveKitActiveRef.current || !room) return false;
    const nextOff = room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(!nextOff, videoOptions(cameraFacing), {
        source: Track.Source.Camera,
        stream: callInfoRef.current?.callId,
        simulcast: true,
      });
      if (!nextOff) setLocalPreviewFromRoom(room);
      setCameraOff(nextOff);
      trace('livekit:camera:toggle', { off: nextOff });
      return true;
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Caméra indisponible.');
      trace('livekit:camera:toggle:error', { message: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }, [callInfoRef, cameraFacing, setCallNotice, setCameraOff, setLocalPreviewFromRoom, trace]);

  const switchLiveKitCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!liveKitActiveRef.current || !room) return false;
    const next = cameraFacing === 'user' ? 'environment' : 'user';
    try {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
      if (publication?.videoTrack) {
        await publication.videoTrack.restartTrack(videoOptions(next));
      } else {
        await room.localParticipant.setCameraEnabled(true, videoOptions(next), {
          source: Track.Source.Camera,
          stream: callInfoRef.current?.callId,
          simulcast: true,
        });
      }
      setCameraFacing(next);
      setCameraOff(false);
      setLocalPreviewFromRoom(room);
      trace('livekit:camera:switch', { facing: next });
      return true;
    } catch (error) {
      setCallNotice(error instanceof Error ? error.message : 'Changement caméra impossible.');
      trace('livekit:camera:switch:error', { message: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }, [callInfoRef, cameraFacing, setCallNotice, setCameraFacing, setCameraOff, setLocalPreviewFromRoom, trace]);

  const isLiveKitActive = useCallback(() => liveKitActiveRef.current, []);

  return {
    liveKitActiveRef,
    isLiveKitActive,
    connectLiveKit,
    disconnectLiveKit,
    toggleLiveKitMute,
    toggleLiveKitCamera,
    switchLiveKitCamera,
  };
}
