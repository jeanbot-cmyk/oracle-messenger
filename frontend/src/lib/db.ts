// IndexedDB — stockage local des messages et conversations
import { openDB, type IDBPDatabase } from 'idb';
import type { Message, Conversation } from '../types';

const DB_NAME    = 'oracle-messenger';
const DB_VERSION = 1;

let db: IDBPDatabase | null = null;

async function getDB() {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Messages
      if (!database.objectStoreNames.contains('messages')) {
        const msgStore = database.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId');
        msgStore.createIndex('createdAt', 'createdAt');
      }
      // Conversations
      if (!database.objectStoreNames.contains('conversations')) {
        database.createObjectStore('conversations', { keyPath: 'id' });
      }
      // Media metadata (pas le contenu — P2P WebRTC)
      if (!database.objectStoreNames.contains('media')) {
        const mediaStore = database.createObjectStore('media', { keyPath: 'id' });
        mediaStore.createIndex('conversationId', 'conversationId');
      }
    },
  });
  return db;
}

// ── Messages ─────────────────────────────────────────────────────────────────
export async function saveMessage(msg: Message) {
  const database = await getDB();
  await database.put('messages', msg);
}

export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const database = await getDB();
  const all = await database.getAllFromIndex('messages', 'conversationId', conversationId);
  return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(-limit);
}

export async function deleteMessage(id: string) {
  const database = await getDB();
  await database.delete('messages', id);
}

// ── Conversations ─────────────────────────────────────────────────────────────
export async function saveConversation(conv: Conversation) {
  const database = await getDB();
  await database.put('conversations', conv);
}

export async function getConversations(): Promise<Conversation[]> {
  const database = await getDB();
  const all = await database.getAll('conversations');
  return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function clearOldMessages(daysOld = 30) {
  const database = await getDB();
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  const all = await database.getAll('messages');
  const old = all.filter(m => m.createdAt < cutoff);
  const tx = database.transaction('messages', 'readwrite');
  await Promise.all(old.map(m => tx.store.delete(m.id)));
  await tx.done;
}
