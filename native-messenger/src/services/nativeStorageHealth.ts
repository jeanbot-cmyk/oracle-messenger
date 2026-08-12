import * as FileSystem from 'expo-file-system/legacy';

export const STORAGE_LOW_BYTES = 500 * 1024 * 1024;
export const STORAGE_CRITICAL_BYTES = 150 * 1024 * 1024;
export const STORAGE_OPERATION_BUFFER_BYTES = 32 * 1024 * 1024;

export type NativeStorageHealth = {
  availableBytes?: number;
  level: 'unknown' | 'sufficient' | 'low' | 'critical' | 'insufficient';
  message?: string;
};

async function availableDiskBytes() {
  const getFreeDiskStorageAsync = (FileSystem as unknown as {
    getFreeDiskStorageAsync?: () => Promise<number>;
  }).getFreeDiskStorageAsync;
  if (!getFreeDiskStorageAsync) return undefined;
  const value = await getFreeDiskStorageAsync().catch(() => undefined);
  return Number.isFinite(value) ? value : undefined;
}

export async function checkNativeStorageForWrite(expectedBytes = 0): Promise<NativeStorageHealth> {
  const availableBytes = await availableDiskBytes();
  if (typeof availableBytes !== 'number') return { level: 'unknown' };

  const requiredBytes = Math.max(0, expectedBytes) + STORAGE_OPERATION_BUFFER_BYTES;
  if (availableBytes < requiredBytes) {
    return {
      availableBytes,
      level: 'insufficient',
      message: 'Message système - espace insuffisant : libérez de l’espace pour enregistrer ou recevoir ce fichier.',
    };
  }
  if (availableBytes < STORAGE_CRITICAL_BYTES) {
    return {
      availableBytes,
      level: 'critical',
      message: 'Message système - stockage critique : libérez de l’espace pour éviter l’échec des messages et médias.',
    };
  }
  if (availableBytes < STORAGE_LOW_BYTES) {
    return {
      availableBytes,
      level: 'low',
      message: 'Message système - stockage faible : libérez de l’espace pour continuer à recevoir et enregistrer correctement vos fichiers.',
    };
  }
  return { availableBytes, level: 'sufficient' };
}
