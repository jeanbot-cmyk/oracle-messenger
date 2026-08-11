import { useCallback, type Dispatch, type SetStateAction } from 'react';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, MediaStream, type MediaStreamTrack } from 'react-native-webrtc';

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
  const getLocalStream = useCallback(async (type: 'audio' | 'video', facing: CameraFacing) => {
    const stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: type === 'video'
        ? {
            facingMode: facing,
            width: 1280,
            height: 720,
            frameRate: 24,
          }
        : false,
    } as any);
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('Microphone indisponible.');
    }
    audioTracks.forEach(track => { track.enabled = true; });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMuted(false);
    setCameraOff(false);
    trace('media:local-ready', {
      type,
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      facing,
    });
    return stream;
  }, [localStreamRef, setCameraOff, setLocalStream, setMuted, trace]);

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
    getLocalStream,
    toggleMute,
    toggleCamera,
    switchCamera,
  };
}
