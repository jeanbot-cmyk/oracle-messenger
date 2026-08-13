import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from '@/types/messenger';

const HIDDEN_MESSAGE_KEY_PREFIX = 'oracle-native-hidden-messages:';

function safeKey(value?: string | null) {
  return encodeURIComponent(String(value || 'local'));
}

function storageKey(conversationId: string, ownerId?: string | null) {
  if (ownerId) return `${HIDDEN_MESSAGE_KEY_PREFIX}${safeKey(ownerId)}:${safeKey(conversationId)}`;
  return `${HIDDEN_MESSAGE_KEY_PREFIX}${conversationId}`;
}

export async function readHiddenMessageIds(conversationId: string, ownerId?: string | null) {
  try {
    const keys = ownerId ? [storageKey(conversationId, ownerId), storageKey(conversationId)] : [storageKey(conversationId)];
    const values = await AsyncStorage.multiGet(keys);
    const ids = new Set<string>();
    for (const [, raw] of values) {
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) {
        parsed.filter((id): id is string => typeof id === 'string').forEach(id => ids.add(id));
      }
    }
    return ids;
  } catch {
    return new Set<string>();
  }
}

export async function hideMessagesForMe(conversationId: string, messageIds: string[], ownerId?: string | null) {
  const validIds = messageIds.filter(Boolean);
  if (!conversationId || !validIds.length) return;
  const hidden = await readHiddenMessageIds(conversationId, ownerId);
  validIds.forEach(id => hidden.add(id));
  await AsyncStorage.setItem(storageKey(conversationId, ownerId), JSON.stringify([...hidden]));
}

export async function filterHiddenMessages(conversationId: string, messages: Message[], ownerId?: string | null) {
  const hidden = await readHiddenMessageIds(conversationId, ownerId);
  if (!hidden.size) return messages;
  return messages.filter(message => !hidden.has(message.id));
}
