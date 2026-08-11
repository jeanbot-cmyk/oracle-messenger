import { useCallback, useState } from 'react';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

type VoiceRecordingResult = {
  uri: string;
  name: string;
  mime: string;
  size: number;
  durationMs: number;
};

type VoiceMediaInput = {
  uri: string;
  name?: string;
  mime?: string;
  kind: 'voice';
};

type UseNativeVoiceRecorderParams = {
  enabled: boolean;
  sendMedia: (input: VoiceMediaInput) => Promise<boolean>;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
};

const OracleVoiceRecorder = NativeModules.OracleVoiceRecorder as {
  start?: () => Promise<{ uri: string; startedAt: number }>;
  stop?: () => Promise<VoiceRecordingResult>;
  cancel?: () => Promise<boolean>;
} | undefined;

async function ensureRecordAudioPermission() {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (granted) return true;
  const response = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone',
    message: 'Oracle Messenger utilise le microphone pour enregistrer les messages vocaux.',
    buttonPositive: 'Autoriser',
    buttonNegative: 'Refuser',
  });
  return response === PermissionsAndroid.RESULTS.GRANTED;
}

export function useNativeVoiceRecorder({ enabled, sendMedia, setBusy, setNotice }: UseNativeVoiceRecorderParams) {
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceStartedAt, setVoiceStartedAt] = useState<number | null>(null);

  const toggleVoiceRecording = useCallback(async () => {
    if (!enabled) return;
    if (!OracleVoiceRecorder?.start || !OracleVoiceRecorder?.stop) {
      setNotice('Enregistrement vocal natif indisponible sur cette build.');
      return;
    }
    if (!voiceRecording) {
      const permitted = await ensureRecordAudioPermission();
      if (!permitted) {
        setNotice('Permission microphone refusee. Message vocal impossible.');
        return;
      }
      try {
        const started = await OracleVoiceRecorder.start();
        setVoiceRecording(true);
        setVoiceStartedAt(started.startedAt || Date.now());
        setNotice('Enregistrement vocal en cours.');
      } catch (error) {
        setVoiceRecording(false);
        setVoiceStartedAt(null);
        setNotice(error instanceof Error ? error.message : 'Demarrage vocal impossible.');
      }
      return;
    }

    setBusy(true);
    try {
      const recording = await OracleVoiceRecorder.stop();
      setVoiceRecording(false);
      setVoiceStartedAt(null);
      if (!recording.uri || !recording.size) {
        setNotice('Message vocal vide.');
        return;
      }
      const sent = await sendMedia({
        uri: recording.uri,
        name: recording.name || `voice-${Date.now()}.m4a`,
        mime: recording.mime || 'audio/mp4',
        kind: 'voice',
      });
      if (sent) setNotice('Message vocal envoye.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Envoi vocal impossible.');
    } finally {
      setBusy(false);
    }
  }, [enabled, sendMedia, setBusy, setNotice, voiceRecording]);

  const cancelVoiceRecording = useCallback(async (notify = true) => {
    await OracleVoiceRecorder?.cancel?.().catch(() => null);
    setVoiceRecording(false);
    setVoiceStartedAt(null);
    if (notify) setNotice('Enregistrement vocal annule.');
  }, [setNotice]);

  return {
    voiceRecording,
    voiceStartedAt,
    toggleVoiceRecording,
    cancelVoiceRecording,
  };
}
