import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Conversation, Message } from '@/types/messenger';

const CONVERSATIONS_KEY_PREFIX = 'oracle-native-conversations-cache:';
const MESSAGES_KEY_PREFIX = 'oracle-native-messages-cache:';
const MAX_CACHED_CONVERSATIONS = 250;
const MAX_CACHED_MESSAGES = 500;

function safeKey(value?: string | null) {
  return encodeURIComponent(String(value || 'local'));
}

function conversationsKey(ownerId?: string | null) {
  return `${CONVERSATIONS_KEY_PREFIX}${safeKey(ownerId)}`;
}

function messagesKey(ownerId?: string | null, conversationId?: string | null) {
  return `${MESSAGES_KEY_PREFIX}${safeKey(ownerId)}:${safeKey(conversationId)}`;
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function conversationTime(conversation: Conversation) {
  return Date.parse(conversation.updatedAt || conversation.lastMessage?.createdAt || '') || 0;
}

function messageTime(message: Message) {
  return Date.parse(message.createdAt || '') || 0;
}

function normalizeConversations(items: Conversation[]) {
  const byId = new Map<string, Conversation>();
  for (const item of items) {
    if (item?.id) byId.set(item.id, item);
  }
  return [...byId.values()]
    .sort((a, b) => conversationTime(b) - conversationTime(a))
    .slice(0, MAX_CACHED_CONVERSATIONS);
}

function normalizeMessages(items: Message[]) {
  const byId = new Map<string, Message>();
  for (const item of items) {
    if (item?.id) byId.set(item.id, item);
  }
  return [...byId.values()]
    .sort((a, b) => messageTime(a) - messageTime(b))
    .slice(-MAX_CACHED_MESSAGES);
}

export async function readCachedConversations(ownerId?: string | null) {
  const raw = await AsyncStorage.getItem(conversationsKey(ownerId)).catch(() => null);
  return normalizeConversations(parseArray<Conversation>(raw));
}

export async function writeCachedConversations(ownerId: string | null | undefined, conversations: Conversation[]) {
  if (!ownerId) return;
  await AsyncStorage.setItem(conversationsKey(ownerId), JSON.stringify(normalizeConversations(conversations))).catch(() => undefined);
}

export async function readCachedMessages(ownerId: string | null | undefined, conversationId: string) {
  const raw = await AsyncStorage.getItem(messagesKey(ownerId, conversationId)).catch(() => null);
  return normalizeMessages(parseArray<Message>(raw));
}

export async function writeCachedMessages(ownerId: string | null | undefined, conversationId: string, messages: Message[]) {
  if (!ownerId || !conversationId) return;
  await AsyncStorage.setItem(messagesKey(ownerId, conversationId), JSON.stringify(normalizeMessages(messages))).catch(() => undefined);
}

export async function clearCachedConversation(ownerId: string | null | undefined, conversationId: string) {
  if (!ownerId || !conversationId) return;
  const conversations = await readCachedConversations(ownerId);
  await AsyncStorage.multiSet([
    [conversationsKey(ownerId), JSON.stringify(normalizeConversations(conversations.filter(item => item.id !== conversationId)))],
    [messagesKey(ownerId, conversationId), JSON.stringify([])],
  ]).catch(() => undefined);
}
