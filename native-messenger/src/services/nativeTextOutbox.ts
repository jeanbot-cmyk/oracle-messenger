import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'oracle.messenger.native.textOutbox.v1';
const MAX_PENDING_MESSAGES = 100;

export type PendingNativeTextMessage = {
  id: string;
  localMessageId?: string;
  conversationId: string;
  content: string;
  replyToId?: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

function normalizePendingMessages(value: unknown): PendingNativeTextMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PendingNativeTextMessage => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<PendingNativeTextMessage>;
      return Boolean(candidate.id && candidate.conversationId && candidate.content && candidate.createdAt);
    })
    .map(item => ({
      ...item,
      content: String(item.content),
      attempts: Number.isFinite(Number(item.attempts)) ? Math.max(0, Number(item.attempts)) : 0,
      localMessageId: item.localMessageId || undefined,
      replyToId: item.replyToId || undefined,
      lastError: item.lastError || undefined,
    }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, MAX_PENDING_MESSAGES);
}

export async function readNativeTextOutbox() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalizePendingMessages(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

async function writeNativeTextOutbox(items: PendingNativeTextMessage[]) {
  const normalized = normalizePendingMessages(items);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function enqueueNativeTextMessage(data: {
  localMessageId?: string;
  conversationId: string;
  content: string;
  replyToId?: string;
  lastError?: string;
}) {
  const pending: PendingNativeTextMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    localMessageId: data.localMessageId,
    conversationId: data.conversationId,
    content: data.content,
    replyToId: data.replyToId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: data.lastError,
  };
  const current = await readNativeTextOutbox();
  await writeNativeTextOutbox([...current, pending].slice(-MAX_PENDING_MESSAGES));
  return pending;
}

export async function removeNativeTextMessageFromOutbox(id: string) {
  const current = await readNativeTextOutbox();
  await writeNativeTextOutbox(current.filter(item => item.id !== id));
}

export async function markNativeTextMessageAttempt(id: string, error: string) {
  const current = await readNativeTextOutbox();
  await writeNativeTextOutbox(current.map(item => (
    item.id === id
      ? { ...item, attempts: item.attempts + 1, lastError: error }
      : item
  )));
}
