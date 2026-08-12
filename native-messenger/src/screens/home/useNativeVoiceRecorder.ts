import { useCallback, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
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
  size?: number;
  duration?: number;
  waveform?: number[];
};

export type VoicePreview = VoiceMediaInput & {
  name: string;
  mime: string;
  size: number;
  duration: number;
  durationMs: number;
};

type UseNativeVoiceRecorderParams = {
  enabled: boolean;
  sendMedia: (input: VoiceMediaInput) => Promise<boolean>;
  setNotice: (message: string) => void;
};

const OracleVoiceRecorder = NativeModules.OracleVoiceRecorder as {
  start?: () => Promise<{ uri: string; startedAt: number }>;
  stop?: () => Promise<VoiceRecordingResult>;
  cancel?: () => Promise<boolean>;
} | undefined;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function simpleWaveform(seedSource: string, bars = 36) {
  let hash = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    hash = (hash * 31 + seedSource.charCodeAt(index)) >>> 0;
  }
  return Array.from({ length: bars }, (_, index) => {
    hash = (hash * 1664525 + 1013904223 + index) >>> 0;
    return 18 + (hash % 78);
  });
}

async function deleteLocalVoiceFile(uri?: string | null) {
  if (!uri || !/^file:\/\//i.test(uri)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export function useNativeVoiceRecorder({ enabled, sendMedia, setNotice }: UseNativeVoiceRecorderParams) {
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceStartedAt, setVoiceStartedAt] = useState<number | null>(null);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const [voiceSending, setVoiceSending] = useState(false);
  const voiceRecordingRef = useRef(false);
  const voiceStartedAtRef = useRef<number | null>(null);
  const voiceSendingRef = useRef(false);

  const startVoiceRecording = useCallback(async () => {
    if (!enabled) return;
    if (voiceSendingRef.current) {
      setNotice('Envoi vocal en cours.');
      return;
    }
    if (!OracleVoiceRecorder?.start || !OracleVoiceRecorder?.stop) {
      setNotice('Enregistrement vocal natif indisponible sur cette build.');
      return;
    }
    if (voiceRecordingRef.current) return;
    const permitted = await ensureRecordAudioPermission();
    if (!permitted) {
      setNotice('Permission microphone refusee. Message vocal impossible.');
      return;
    }
    try {
      setVoicePreview(null);
      setVoiceLocked(false);
      const started = await OracleVoiceRecorder.start();
      const startedAt = started.startedAt || Date.now();
      voiceRecordingRef.current = true;
      voiceStartedAtRef.current = startedAt;
      setVoiceRecording(true);
      setVoiceStartedAt(startedAt);
      setNotice('Enregistrement vocal en cours.');
    } catch (error) {
      voiceRecordingRef.current = false;
      voiceStartedAtRef.current = null;
      setVoiceRecording(false);
      setVoiceStartedAt(null);
      setVoiceLocked(false);
      setNotice(error instanceof Error ? error.message : 'Demarrage vocal impossible.');
    }
  }, [enabled, setNotice]);

  const stopVoiceRecording = useCallback(async () => {
    if (!voiceRecordingRef.current || !OracleVoiceRecorder?.stop) return null;
    try {
      const elapsedMs = Date.now() - (voiceStartedAtRef.current || Date.now());
      if (elapsedMs < 650) await sleep(650 - elapsedMs);
      const recording = await OracleVoiceRecorder.stop();
      voiceRecordingRef.current = false;
      voiceStartedAtRef.current = null;
      setVoiceRecording(false);
      setVoiceStartedAt(null);
      setVoiceLocked(false);
      if (!recording.uri || !recording.size) {
        setVoicePreview(null);
        setNotice('Message vocal vide.');
        return null;
      }
      const preview: VoicePreview = {
        uri: recording.uri,
        name: recording.name || `voice-${Date.now()}.m4a`,
        mime: recording.mime || 'audio/mp4',
        kind: 'voice',
        size: recording.size,
        duration: Math.max(1, Math.round((recording.durationMs || 0) / 1000)),
        durationMs: Math.max(0, recording.durationMs || 0),
        waveform: simpleWaveform(`${recording.name || recording.uri}:${recording.size}:${recording.durationMs}`),
      };
      setVoicePreview(preview);
      setNotice('Message vocal prêt. Écoutez puis envoyez.');
      return preview;
    } catch (error) {
      voiceRecordingRef.current = false;
      voiceStartedAtRef.current = null;
      setVoiceRecording(false);
      setVoiceStartedAt(null);
      setVoiceLocked(false);
      setVoicePreview(null);
      setNotice(error instanceof Error ? error.message : 'Finalisation vocale impossible.');
      return null;
    }
  }, [setNotice]);

  const lockVoiceRecording = useCallback(() => {
    if (!voiceRecordingRef.current) return;
    setVoiceLocked(true);
    setNotice('Enregistrement vocal verrouillé. Appuyez sur stop pour écouter.');
  }, [setNotice]);

  const sendVoicePreview = useCallback(async () => {
    if (!voicePreview) return;
    if (voiceSendingRef.current) return;
    const pendingPreview = voicePreview;
    voiceSendingRef.current = true;
    setVoiceSending(true);
    setNotice('Envoi du message vocal en cours.');
    try {
      const sent = await sendMedia(pendingPreview);
      if (sent) {
        setVoicePreview(current => current?.uri === pendingPreview.uri ? null : current);
        setNotice('Message vocal envoye.');
      } else {
        setVoicePreview(current => current ?? pendingPreview);
        setNotice('Envoi vocal non confirmé. Vous pouvez réessayer.');
      }
    } catch (error) {
      setVoicePreview(current => current ?? pendingPreview);
      setNotice(error instanceof Error ? error.message : 'Envoi vocal impossible.');
    } finally {
      voiceSendingRef.current = false;
      setVoiceSending(false);
    }
  }, [sendMedia, setNotice, voicePreview]);

  const toggleVoiceRecording = useCallback(async () => {
    if (voiceRecording) {
      await stopVoiceRecording();
      return;
    }
    await startVoiceRecording();
  }, [startVoiceRecording, stopVoiceRecording, voiceRecording]);

  const cancelVoiceRecording = useCallback(async (notify = true) => {
    if (voiceSendingRef.current) {
      if (notify) setNotice('Envoi vocal en cours.');
      return;
    }
    const previewToDelete = voicePreview;
    await OracleVoiceRecorder?.cancel?.().catch(() => null);
    voiceRecordingRef.current = false;
    voiceStartedAtRef.current = null;
    setVoiceRecording(false);
    setVoiceStartedAt(null);
    setVoiceLocked(false);
    setVoicePreview(null);
    await deleteLocalVoiceFile(previewToDelete?.uri);
    if (notify) setNotice('Enregistrement vocal annule.');
  }, [setNotice, voicePreview]);

  return {
    voiceRecording,
    voiceStartedAt,
    voiceLocked,
    voicePreview,
    voiceSending,
    startVoiceRecording,
    stopVoiceRecording,
    lockVoiceRecording,
    sendVoicePreview,
    toggleVoiceRecording,
    cancelVoiceRecording,
  };
}
