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

function messageStatusRank(status?: string | null) {
  switch (String(status || 'sent').toLowerCase()) {
    case 'read':
    case 'seen':
      return 4;
    case 'delivered':
    case 'received':
      return 3;
    case 'sent':
      return 2;
    case 'sending':
    case 'pending':
    case 'queued':
    case 'uploading':
      return 1;
    case 'failed':
    case 'error':
      return 0;
    default:
      return 2;
  }
}

function strongestMessageStatus(current?: string | null, incoming?: string | null) {
  return messageStatusRank(incoming) >= messageStatusRank(current)
    ? String(incoming || 'sent').toLowerCase()
    : String(current || 'sent').toLowerCase();
}

function sameClientMessage(current: Message, incoming: Message) {
  if (current.conversationId !== incoming.conversationId || current.senderId !== incoming.senderId) return false;
  const currentClientId = current.clientMessageId || (current.id?.startsWith('local-') ? current.id : '');
  const incomingClientId = incoming.clientMessageId || (incoming.id?.startsWith('local-') ? incoming.id : '');
  if (currentClientId && incomingClientId && currentClientId === incomingClientId) return true;
  if (incoming.clientMessageId && current.id === incoming.clientMessageId) return true;
  if (current.clientMessageId && incoming.id === current.clientMessageId) return true;
  return false;
}

function mergeCachedMessage(current: Message, incoming: Message): Message {
  return {
    ...current,
    ...incoming,
    status: strongestMessageStatus(current.status, incoming.status) as Message['status'],
  };
}

export async function readCachedConversations(ownerId?: string | null) {
  const raw = await AsyncStorage.getItem(conversationsKey(ownerId)).catch(() => null);
  return normalizeConversations(parseArray<Conversation>(raw));
}

export async function readCachedConversationsAny(ownerIds: (string | null | undefined)[]) {
  const seen = new Set<string>();
  for (const ownerId of ownerIds) {
    const key = safeKey(ownerId);
    if (seen.has(key)) continue;
    seen.add(key);
    const conversations = await readCachedConversations(ownerId);
    if (conversations.length) return conversations;
  }
  return [];
}

export async function writeCachedConversations(ownerId: string | null | undefined, conversations: Conversation[]) {
  if (!ownerId) return;
  await AsyncStorage.setItem(conversationsKey(ownerId), JSON.stringify(normalizeConversations(conversations))).catch(() => undefined);
}

export async function readCachedMessages(ownerId: string | null | undefined, conversationId: string) {
  const raw = await AsyncStorage.getItem(messagesKey(ownerId, conversationId)).catch(() => null);
  return normalizeMessages(parseArray<Message>(raw));
}

export async function readCachedMessagesAny(ownerIds: (string | null | undefined)[], conversationId: string) {
  const seen = new Set<string>();
  for (const ownerId of ownerIds) {
    const key = safeKey(ownerId);
    if (seen.has(key)) continue;
    seen.add(key);
    const messages = await readCachedMessages(ownerId, conversationId);
    if (messages.length) return messages;
  }
  return [];
}

export async function writeCachedMessages(ownerId: string | null | undefined, conversationId: string, messages: Message[]) {
  if (!ownerId || !conversationId) return;
  await AsyncStorage.setItem(messagesKey(ownerId, conversationId), JSON.stringify(normalizeMessages(messages))).catch(() => undefined);
}

export async function upsertCachedMessage(ownerId: string | null | undefined, conversationId: string, message: Message) {
  if (!ownerId || !conversationId || !message?.id) return [];
  const current = await readCachedMessages(ownerId, conversationId);
  const exists = current.some(item => item.id === message.id || sameClientMessage(item, message));
  const next = normalizeMessages(exists
    ? current.map(item => item.id === message.id || sameClientMessage(item, message) ? mergeCachedMessage(item, message) : item)
    : [...current, message]);
  await AsyncStorage.setItem(messagesKey(ownerId, conversationId), JSON.stringify(next));
  return next;
}

export async function clearCachedConversation(ownerId: string | null | undefined, conversationId: string) {
  if (!ownerId || !conversationId) return;
  const conversations = await readCachedConversations(ownerId);
  await AsyncStorage.multiSet([
    [conversationsKey(ownerId), JSON.stringify(normalizeConversations(conversations.filter(item => item.id !== conversationId)))],
    [messagesKey(ownerId, conversationId), JSON.stringify([])],
  ]).catch(() => undefined);
}
