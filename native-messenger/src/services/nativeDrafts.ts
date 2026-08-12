import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY_PREFIX = 'oracle.messenger.native.draft:';
const MAX_DRAFT_LENGTH = 20_000;

function safeKey(value?: string | null) {
  return encodeURIComponent(String(value || 'local'));
}

function draftKey(ownerId?: string | null, conversationId?: string | null) {
  return `${DRAFT_KEY_PREFIX}${safeKey(ownerId)}:${safeKey(conversationId)}`;
}

function normalizeDraft(value: unknown) {
  return String(value ?? '').slice(0, MAX_DRAFT_LENGTH);
}

export async function readNativeDraft(ownerId: string | null | undefined, conversationId: string) {
  if (!conversationId) return '';
  const raw = await AsyncStorage.getItem(draftKey(ownerId, conversationId)).catch(() => null);
  return normalizeDraft(raw);
}

export async function writeNativeDraft(ownerId: string | null | undefined, conversationId: string, value: string) {
  if (!conversationId) return;
  const draft = normalizeDraft(value);
  if (!draft.trim()) {
    await AsyncStorage.removeItem(draftKey(ownerId, conversationId)).catch(() => undefined);
    return;
  }
  await AsyncStorage.setItem(draftKey(ownerId, conversationId), draft).catch(() => undefined);
}

export async function deleteNativeDraft(ownerId: string | null | undefined, conversationId: string) {
  if (!conversationId) return;
  await AsyncStorage.removeItem(draftKey(ownerId, conversationId)).catch(() => undefined);
}
