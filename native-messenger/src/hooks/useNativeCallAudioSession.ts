import { useCallback } from 'react';
import { Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { OracleCallService, type NativeCallInfo } from '@/hooks/nativeCallUtils';

type RefValue<T> = { current: T };
type NativeCallTrace = (event: string, details?: Record<string, unknown>) => void;

type UseNativeCallAudioSessionParams = {
  callInfoRef: RefValue<NativeCallInfo | null>;
  setSpeakerOn: (enabled: boolean) => void;
  trace: NativeCallTrace;
};

export function useNativeCallAudioSession({
  callInfoRef,
  setSpeakerOn,
  trace,
}: UseNativeCallAudioSessionParams) {
  const applyAudioRoute = useCallback((enabled: boolean) => {
    try {
      // Important: false forces earpiece on Android instead of using the media default speaker.
      InCallManager.setForceSpeakerphoneOn(enabled);
      InCallManager.setSpeakerphoneOn(enabled);
      setSpeakerOn(enabled);
      trace('audio:route', { speakerOn: enabled, route: enabled ? 'speaker' : 'earpiece' });
    } catch (error) {
      trace('audio:route:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [setSpeakerOn, trace]);

  const startAudioSession = useCallback((type: 'audio' | 'video') => {
    try {
      InCallManager.start({ media: type, auto: false });
      InCallManager.requestAudioFocus?.().catch?.(() => null);
      InCallManager.setKeepScreenOn(type === 'video');
      InCallManager.setMicrophoneMute(false);
      // Audio calls must start on the phone earpiece. Video calls may use speaker by user choice later.
      applyAudioRoute(type === 'video');
      if (Platform.OS === 'android') {
        OracleCallService?.startCall?.(type, callInfoRef.current?.callerName || 'Oracle Messenger')
          .catch(error => trace('android:foreground-service:start:error', { message: error instanceof Error ? error.message : String(error) }));
      }
      trace('audio:session:start', { type, defaultSpeaker: type === 'video' });
    } catch (error) {
      trace('audio:session:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [applyAudioRoute, callInfoRef, trace]);

  const stopAudioSession = useCallback(() => {
    try {
      InCallManager.stopRingback?.();
      InCallManager.stopRingtone?.();
      InCallManager.setMicrophoneMute(false);
      InCallManager.setKeepScreenOn(false);
      InCallManager.setForceSpeakerphoneOn(false);
      InCallManager.setSpeakerphoneOn(false);
      InCallManager.abandonAudioFocus?.().catch?.(() => null);
      InCallManager.stop();
      if (Platform.OS === 'android') {
        OracleCallService?.stopCall?.()
          .catch(error => trace('android:foreground-service:stop:error', { message: error instanceof Error ? error.message : String(error) }));
      }
      setSpeakerOn(false);
      trace('audio:session:stop');
    } catch (error) {
      trace('audio:session:stop:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [setSpeakerOn, trace]);

  return {
    applyAudioRoute,
    startAudioSession,
    stopAudioSession,
  };
}
