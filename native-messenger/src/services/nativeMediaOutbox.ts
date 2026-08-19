import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeMessageMediaInput } from '@/screens/home/nativeMessageMediaPipeline';

const STORAGE_KEY = 'oracle.messenger.native.mediaOutbox.v1';
const MAX_PENDING_MEDIA = 50;

export type PendingNativeMediaMessage = {
  id: string;
  localMessageId: string;
  conversationId: string;
  input: NativeMessageMediaInput;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

function normalizePendingMedia(value: unknown): PendingNativeMediaMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PendingNativeMediaMessage => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<PendingNativeMediaMessage>;
      return Boolean(
        candidate.id &&
        candidate.localMessageId &&
        candidate.conversationId &&
        candidate.createdAt &&
        candidate.input &&
        typeof candidate.input === 'object' &&
        candidate.input.uri &&
        candidate.input.kind,
      );
    })
    .map(item => ({
      ...item,
      attempts: Number.isFinite(Number(item.attempts)) ? Math.max(0, Number(item.attempts)) : 0,
      lastError: item.lastError || undefined,
      input: {
        ...item.input,
        name: item.input.name || undefined,
        mime: item.input.mime || undefined,
        size: Number.isFinite(Number(item.input.size)) && Number(item.input.size) > 0 ? Number(item.input.size) : undefined,
      },
    }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, MAX_PENDING_MEDIA);
}

export async function readNativeMediaOutbox() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalizePendingMedia(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

async function writeNativeMediaOutbox(items: PendingNativeMediaMessage[]) {
  const normalized = normalizePendingMedia(items);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function enqueueNativeMediaMessage(data: {
  localMessageId: string;
  conversationId: string;
  input: NativeMessageMediaInput;
  lastError?: string;
}) {
  const current = await readNativeMediaOutbox();
  const existing = current.find(item => item.localMessageId === data.localMessageId);
  if (existing) {
    await writeNativeMediaOutbox(current.map(item => (
      item.localMessageId === data.localMessageId
        ? { ...item, input: data.input, lastError: data.lastError || item.lastError }
        : item
    )));
    return existing;
  }
  const pending: PendingNativeMediaMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    localMessageId: data.localMessageId,
    conversationId: data.conversationId,
    input: data.input,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: data.lastError,
  };
  await writeNativeMediaOutbox([...current, pending].slice(-MAX_PENDING_MEDIA));
  return pending;
}

export async function removeNativeMediaMessageFromOutbox(id: string) {
  const current = await readNativeMediaOutbox();
  await writeNativeMediaOutbox(current.filter(item => item.id !== id));
}

export async function markNativeMediaMessageAttempt(id: string, error: string) {
  const current = await readNativeMediaOutbox();
  await writeNativeMediaOutbox(current.map(item => (
    item.id === id
      ? { ...item, attempts: item.attempts + 1, lastError: error }
      : item
  )));
}
