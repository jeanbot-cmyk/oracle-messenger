import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, MediaStream, type MediaStreamTrack } from '@livekit/react-native-webrtc';

type CameraFacing = 'user' | 'environment';
type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;

type UseNativeCallMediaControlsParams = {
  localStreamRef: RefValue<MediaStream | null>;
  cameraFacing: CameraFacing;
  setLocalStream: Dispatch<SetStateAction<MediaStream | null>>;
  setMuted: Dispatch<SetStateAction<boolean>>;
  setCameraOff: Dispatch<SetStateAction<boolean>>;
  setCameraFacing: Dispatch<SetStateAction<CameraFacing>>;
  setCallNotice: (message: string) => void;
  trace: NativeCallTrace;
};

export function useNativeCallMediaControls({
  localStreamRef,
  cameraFacing,
  setLocalStream,
  setMuted,
  setCameraOff,
  setCameraFacing,
  setCallNotice,
  trace,
}: UseNativeCallMediaControlsParams) {
  const ensureMediaPermissions = useCallback(async (type: 'audio' | 'video') => {
    if (Platform.OS !== 'android') return;
    const permissions = [
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ...(type === 'video' ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
    ];
    const permissionsToRequest: (typeof permissions)[number][] = [];
    for (const permission of permissions) {
      const granted = await PermissionsAndroid.check(permission);
      if (!granted) permissionsToRequest.push(permission);
    }
    const result: Record<string, string> = permissionsToRequest.length
      ? await PermissionsAndroid.requestMultiple(permissionsToRequest) as Record<string, string>
      : {};
    const missing = permissionsToRequest.filter(permission => result[permission] !== PermissionsAndroid.RESULTS.GRANTED);
    const blocked = permissionsToRequest.filter(permission => result[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    trace('media:permissions', {
      type,
      granted: missing.length === 0,
      missing,
      blocked,
      alreadyGranted: permissions.length - permissionsToRequest.length,
      requested: permissionsToRequest.length,
    });
    if (blocked.length) {
      const target = blocked.includes(PermissionsAndroid.PERMISSIONS.CAMERA) ? 'caméra' : 'microphone';
      Linking.openSettings().catch(() => undefined);
      throw new Error(`Permission ${target} bloquée. Ouvrez les réglages Android puis autorisez Oracle Messenger.`);
    }
    if (missing.includes(PermissionsAndroid.PERMISSIONS.CAMERA)) {
      throw new Error('Permission caméra refusée.');
    }
    if (missing.includes(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) {
      throw new Error('Permission microphone refusée.');
    }
  }, [trace]);

  const getLocalStream = useCallback(async (type: 'audio' | 'video', facing: CameraFacing) => {
    await ensureMediaPermissions(type);
    const audio = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };
    const attempts = type === 'video'
      ? [
          { facingMode: facing, width: 1280, height: 720, frameRate: 24 },
          { facingMode: facing, width: 960, height: 540, frameRate: 24 },
          { facingMode: facing, width: 640, height: 480, frameRate: 20 },
          { facingMode: facing },
          true,
        ]
      : [false];
    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const video of attempts) {
      try {
        stream = await mediaDevices.getUserMedia({ audio, video } as any);
        trace('media:get-user-media:ok', {
          type,
          facing,
          videoConstraint: typeof video === 'object' ? video : video ? 'default' : 'disabled',
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
        });
        break;
      } catch (error) {
        lastError = error;
        trace('media:get-user-media:error', {
          type,
          facing,
          videoConstraint: typeof video === 'object' ? video : video ? 'default' : 'disabled',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!stream) {
      throw new Error(lastError instanceof Error ? lastError.message : 'Capture audio/vidéo impossible.');
    }
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('Microphone indisponible.');
    }
    if (type === 'video' && !stream.getVideoTracks().length) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('Caméra indisponible.');
    }
    audioTracks.forEach(track => { track.enabled = true; });
    stream.getVideoTracks().forEach(track => { track.enabled = true; });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMuted(false);
    setCameraOff(type !== 'video' ? true : false);
    trace('media:local-ready', {
      type,
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      facing,
    });
    return stream;
  }, [ensureMediaPermissions, localStreamRef, setCameraOff, setLocalStream, setMuted, trace]);

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const nextMuted = tracks.some(track => track.enabled);
    tracks.forEach(track => { track.enabled = !nextMuted; });
    try { InCallManager.setMicrophoneMute(nextMuted); } catch {}
    setMuted(nextMuted);
    trace('audio:mute', { muted: nextMuted, tracks: tracks.length });
  }, [localStreamRef, setMuted, trace]);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const nextOff = tracks.some(track => track.enabled);
    tracks.forEach(track => { track.enabled = !nextOff; });
    setCameraOff(nextOff);
    trace('camera:toggle', { off: nextOff, tracks: tracks.length });
  }, [localStreamRef, setCameraOff, trace]);

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
  }, [cameraFacing, localStreamRef, setCallNotice, setCameraFacing, setCameraOff, trace]);

  return {
    ensureMediaPermissions,
    getLocalStream,
    toggleMute,
    toggleCamera,
    switchCamera,
  };
}
