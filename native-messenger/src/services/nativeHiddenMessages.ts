import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from '@/types/messenger';

const HIDDEN_MESSAGE_KEY_PREFIX = 'oracle-native-hidden-messages:';

function storageKey(conversationId: string) {
  return `${HIDDEN_MESSAGE_KEY_PREFIX}${conversationId}`;
}

export async function readHiddenMessageIds(conversationId: string) {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(storageKey(conversationId)) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

export async function hideMessagesForMe(conversationId: string, messageIds: string[]) {
  const validIds = messageIds.filter(Boolean);
  if (!conversationId || !validIds.length) return;
  const hidden = await readHiddenMessageIds(conversationId);
  validIds.forEach(id => hidden.add(id));
  await AsyncStorage.setItem(storageKey(conversationId), JSON.stringify([...hidden]));
}

export async function filterHiddenMessages(conversationId: string, messages: Message[]) {
  const hidden = await readHiddenMessageIds(conversationId);
  if (!hidden.size) return messages;
  return messages.filter(message => !hidden.has(message.id));
}
