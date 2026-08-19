import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readAppSettings } from '@/services/language';

const STORAGE_PREFIX = 'oracle.messenger.native.autoTranslate.v1';

export type NativeAutoTranslateMode = 'unknown' | 'enabled' | 'disabled';

export type NativeAutoTranslateSettings = {
  mode: NativeAutoTranslateMode;
  targetLanguage: string;
};

function storageKey(ownerId?: string | null) {
  return `${STORAGE_PREFIX}:${ownerId || 'local'}`;
}

function normalizeLanguage(value?: string | null) {
  const clean = String(value || '').trim().replace(/_/g, '-');
  return /^[a-z]{2,8}(-[a-z0-9]{2,8}){0,2}$/i.test(clean) ? clean : 'fr';
}

function normalizeSettings(value: unknown): NativeAutoTranslateSettings {
  if (!value || typeof value !== 'object') {
    return { mode: 'unknown', targetLanguage: 'fr' };
  }
  const candidate = value as Partial<NativeAutoTranslateSettings>;
  const mode: NativeAutoTranslateMode = candidate.mode === 'enabled' || candidate.mode === 'disabled'
    ? candidate.mode
    : 'unknown';
  return {
    mode,
    targetLanguage: normalizeLanguage(candidate.targetLanguage),
  };
}

export async function readNativeAutoTranslateSettings(ownerId?: string | null): Promise<NativeAutoTranslateSettings> {
  const appSettings = await readAppSettings().catch((): { language?: string } => ({}));
  const fallbackLanguage = normalizeLanguage(appSettings.language);
  try {
    const raw = await AsyncStorage.getItem(storageKey(ownerId));
    const parsed = normalizeSettings(raw ? JSON.parse(raw) : null);
    return {
      ...parsed,
      targetLanguage: parsed.targetLanguage || fallbackLanguage,
    };
  } catch {
    return { mode: 'unknown', targetLanguage: fallbackLanguage };
  }
}

export async function saveNativeAutoTranslateSettings(
  ownerId: string | null | undefined,
  next: Partial<NativeAutoTranslateSettings>,
) {
  const current = await readNativeAutoTranslateSettings(ownerId);
  const value = normalizeSettings({
    ...current,
    ...next,
    targetLanguage: normalizeLanguage(next.targetLanguage || current.targetLanguage),
  });
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(value)).catch(() => undefined);
  return value;
}

export function useNativeAutoTranslateSettings(ownerId?: string | null) {
  const [settings, setSettings] = useState<NativeAutoTranslateSettings>({ mode: 'unknown', targetLanguage: 'fr' });

  useEffect(() => {
    let alive = true;
    readNativeAutoTranslateSettings(ownerId)
      .then(value => {
        if (alive) setSettings(value);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [ownerId]);

  const save = useCallback(async (next: Partial<NativeAutoTranslateSettings>) => {
    const value = await saveNativeAutoTranslateSettings(ownerId, next);
    setSettings(value);
    return value;
  }, [ownerId]);

  return {
    settings,
    setMode: (mode: NativeAutoTranslateMode) => save({ mode }),
    setTargetLanguage: (targetLanguage: string) => save({ targetLanguage }),
    save,
  };
}
