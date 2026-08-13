import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { CALL_RING_TIMEOUT_SECONDS, OracleCallAlert, OracleCallService, type NativeCallInfo } from '@/hooks/nativeCallUtils';

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
  const routeRequestIdRef = useRef(0);
  const routeRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearRouteRetryTimers = useCallback(() => {
    routeRetryTimersRef.current.forEach(timer => clearTimeout(timer));
    routeRetryTimersRef.current = [];
  }, []);

  const applyAudioRoute = useCallback((enabled: boolean) => {
    const requestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = requestId;
    clearRouteRetryTimers();
    setSpeakerOn(enabled);

    const route = enabled ? 'SPEAKER_PHONE' : 'EARPIECE';

    const applyNativeRoute = (stage: string) => {
      if (routeRequestIdRef.current !== requestId) return;
      try {
        if (Platform.OS === 'android') {
          InCallManager.setForceSpeakerphoneOn(enabled);
          InCallManager.setSpeakerphoneOn(enabled);
          if (typeof InCallManager.chooseAudioRoute === 'function') {
            InCallManager.chooseAudioRoute(route)
              .then(status => {
                trace('audio:route', { speakerOn: enabled, route, stage, status });
              })
              .catch(error => {
                trace('audio:route:choose-error', { message: error instanceof Error ? error.message : String(error), route, stage });
              });
          } else {
            trace('audio:route', { speakerOn: enabled, route, stage, fallback: 'force-speakerphone' });
          }
          return;
        }

        InCallManager.setForceSpeakerphoneOn(enabled);
        trace('audio:route', { speakerOn: enabled, route, stage, fallback: 'force-speakerphone' });
      } catch (error) {
        setSpeakerOn(!enabled);
        trace('audio:route:error', { message: error instanceof Error ? error.message : String(error), route, stage });
      }
    };

    applyNativeRoute('immediate');
    routeRetryTimersRef.current = [120, 420, 1200, 2200].map(delay => setTimeout(() => applyNativeRoute(`retry-${delay}`), delay));
  }, [clearRouteRetryTimers, setSpeakerOn, trace]);

  const startAudioSession = useCallback((type: 'audio' | 'video') => {
    try {
      InCallManager.stopRingback?.();
      InCallManager.stopRingtone?.();
      const stopAlert = OracleCallAlert?.stop?.();
      stopAlert?.catch?.(() => null);
      (InCallManager as any).stopVibrate?.();
      InCallManager.start({ media: type, auto: false });
      InCallManager.requestAudioFocus?.().catch?.(() => null);
      InCallManager.setKeepScreenOn(type === 'video');
      InCallManager.setMicrophoneMute(false);
      InCallManager.setForceSpeakerphoneOn(false);
      InCallManager.setSpeakerphoneOn(false);
      // Start every call on the phone earpiece. The speaker button is the only
      // place that should move audio to the loudspeaker.
      applyAudioRoute(false);
      trace('audio:session:start', { type, defaultSpeaker: false });
    } catch (error) {
      trace('audio:session:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [applyAudioRoute, trace]);

  const startOutgoingRingback = useCallback(() => {
    try {
      InCallManager.stopRingtone?.();
      InCallManager.stopRingback?.();
      if (Platform.OS === 'android' && OracleCallAlert?.start) {
        OracleCallAlert.start('outgoing', CALL_RING_TIMEOUT_SECONDS).catch(error => {
          trace('audio:ringback:oracle-error', { message: error instanceof Error ? error.message : String(error) });
          InCallManager.startRingback?.('_DTMF_');
        });
        trace('audio:ringback:start', { tone: 'oracle_call.wav' });
        return;
      }
      InCallManager.startRingback?.('_DTMF_');
      trace('audio:ringback:start', { tone: '_DTMF_' });
    } catch (error) {
      trace('audio:ringback:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [trace]);

  const startIncomingRingtone = useCallback((type: 'audio' | 'video') => {
    try {
      InCallManager.stopRingback?.();
      InCallManager.stopRingtone?.();
      if (Platform.OS === 'android' && OracleCallAlert?.start) {
        OracleCallAlert.start('incoming', CALL_RING_TIMEOUT_SECONDS).catch(error => {
          trace('audio:ringtone:oracle-error', { message: error instanceof Error ? error.message : String(error), type });
          InCallManager.startRingtone?.('_DEFAULT_', [0, 650, 250, 650, 250, 1100], 'default', CALL_RING_TIMEOUT_SECONDS);
        });
        trace('audio:ringtone:start', { type, tone: 'oracle_call.wav' });
        return;
      }
      InCallManager.startRingtone?.('_DEFAULT_', [0, 650, 250, 650, 250, 1100], 'default', CALL_RING_TIMEOUT_SECONDS);
      trace('audio:ringtone:start', { type, tone: '_DEFAULT_' });
    } catch (error) {
      trace('audio:ringtone:error', { message: error instanceof Error ? error.message : String(error), type });
    }
  }, [trace]);

  const stopIncomingRingtone = useCallback(() => {
    try {
      InCallManager.stopRingback?.();
      InCallManager.stopRingtone?.();
      const stopAlert = OracleCallAlert?.stop?.();
      stopAlert?.catch?.(() => null);
      (InCallManager as any).stopVibrate?.();
      trace('audio:call-alert:stop');
    } catch (error) {
      trace('audio:call-alert:stop:error', { message: error instanceof Error ? error.message : String(error) });
    }
  }, [trace]);

  const startForegroundCallService = useCallback((type: 'audio' | 'video') => {
    if (Platform.OS !== 'android') return;
    OracleCallService?.startCall?.(type, callInfoRef.current?.callerName || 'Oracle Messenger')
      .then(() => trace('android:foreground-service:start', { type }))
      .catch(error => trace('android:foreground-service:start:error', { message: error instanceof Error ? error.message : String(error), type }));
  }, [callInfoRef, trace]);

  const stopAudioSession = useCallback(() => {
    try {
      InCallManager.stopRingback?.();
      InCallManager.stopRingtone?.();
      const stopAlert = OracleCallAlert?.stop?.();
      stopAlert?.catch?.(() => null);
      (InCallManager as any).stopVibrate?.();
      clearRouteRetryTimers();
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
  }, [clearRouteRetryTimers, setSpeakerOn, trace]);

  return {
    applyAudioRoute,
    startAudioSession,
    startOutgoingRingback,
    startIncomingRingtone,
    stopIncomingRingtone,
    startForegroundCallService,
    stopAudioSession,
  };
}
