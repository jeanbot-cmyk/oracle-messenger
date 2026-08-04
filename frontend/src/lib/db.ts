// IndexedDB — stockage local des messages et conversations
import { openDB, type IDBPDatabase } from 'idb';
import type { Message, Conversation } from '../types';

const DB_NAME    = 'oracle-messenger';
const DB_VERSION = 1;
const DATA_URL_FALLBACK_MAX_BYTES = 256 * 1024;

let db: IDBPDatabase | null = null;
const objectUrls = new Map<string, string>();

export function isMediaMessage(type?: string | null) {
  return ['image', 'video', 'audio', 'voice', 'file', 'document'].includes(String(type ?? '').toLowerCase());
}

function hasLocalPayload(content?: string | null) {
  return typeof content === 'string' && content.trim().length > 0;
}

function inferMediaMime(type?: string | null, src?: string | null) {
  const value = String(src ?? '').trim().toLowerCase();
  if (value.startsWith('data:')) return value.slice(5, value.indexOf(';') > 5 ? value.indexOf(';') : undefined) || 'application/octet-stream';
  const mediaType = String(type ?? '').toLowerCase();
  if (mediaType === 'image') return 'image/jpeg';
  if (mediaType === 'video') return 'video/mp4';
  if (mediaType === 'audio' || mediaType === 'voice') return 'audio/webm';
  return 'application/octet-stream';
}

function bytesToHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function makeObjectUrl(id: string, blob: Blob) {
  const previous = objectUrls.get(id);
  if (previous) URL.revokeObjectURL(previous);
  const next = URL.createObjectURL(blob);
  objectUrls.set(id, next);
  return next;
}

function extractAttachment(content?: string | null, type?: string | null) {
  const raw = String(content ?? '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
      return {
        src: parsed.url.trim(),
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        mime: typeof parsed.mime === 'string' ? parsed.mime : inferMediaMime(type, parsed.url),
        size: typeof parsed.size === 'number' ? parsed.size : undefined,
        original: parsed,
      };
    }
  } catch {}
  const src = raw.startsWith('data:') || raw.startsWith('http') || raw.startsWith('blob:')
    ? raw
    : raw.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(raw)
      ? `data:${inferMediaMime(type, raw)};base64,${raw}`
      : raw;
  return { src, mime: inferMediaMime(type, src), original: null as any };
}

async function sourceToBlob(src: string, mime: string) {
  const response = await fetch(src, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Media download failed: ${response.status}`);
  const blob = await response.blob();
  return blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: mime });
}

async function writeToOpfs(messageId: string, checksum: string, blob: Blob) {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage as any;
  if (!storage?.getDirectory) return null;
  try {
    const root = await storage.getDirectory();
    const dir = await root.getDirectoryHandle('oracle-message-media', { create: true });
    const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeId}-${checksum}`;
    const file = await dir.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    const savedFile = await file.getFile();
    if (savedFile.size !== blob.size) throw new Error('OPFS size mismatch');
    return `opfs:/oracle-message-media/${fileName}`;
  } catch {
    return null;
  }
}

async function readFromOpfs(path?: string | null) {
  if (!path?.startsWith('opfs:/') || typeof navigator === 'undefined') return null;
  const storage = navigator.storage as any;
  if (!storage?.getDirectory) return null;
  try {
    const fileName = path.split('/').pop();
    if (!fileName) return null;
    const root = await storage.getDirectory();
    const dir = await root.getDirectoryHandle('oracle-message-media', { create: false });
    const file = await dir.getFileHandle(fileName, { create: false });
    return file.getFile();
  } catch {
    return null;
  }
}

async function deleteFromOpfs(path?: string | null) {
  if (!path?.startsWith('opfs:/') || typeof navigator === 'undefined') return;
  const storage = navigator.storage as any;
  if (!storage?.getDirectory) return;
  try {
    const fileName = path.split('/').pop();
    if (!fileName) return;
    const root = await storage.getDirectory();
    const dir = await root.getDirectoryHandle('oracle-message-media', { create: false });
    await dir.removeEntry(fileName).catch(() => {});
  } catch {}
}

function buildLocalContent(originalContent: string, localUrl: string, meta: any) {
  try {
    const parsed = JSON.parse(originalContent);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
      return JSON.stringify({ ...parsed, url: localUrl, local: true, checksum: meta.checksum });
    }
  } catch {}
  return localUrl;
}

async function renderStoredMediaContent(media: any, message: Message) {
  const blob = await readFromOpfs(media?.opfsPath)
    || (media?.blob instanceof Blob ? media.blob : null);
  if (blob) {
    const localUrl = makeObjectUrl(message.id, blob);
    return buildLocalContent(
      media.originalContent || message.content || media.content || localUrl,
      localUrl,
      { checksum: media.checksum },
    );
  }
  return typeof media?.content === 'string' && media.content.trim() ? media.content : message.content;
}

export function preserveLocalMediaContent(incoming: Message, existing?: Message | null): Message {
  if (
    existing &&
    isMediaMessage(incoming.type) &&
    !hasLocalPayload(incoming.content) &&
    hasLocalPayload(existing.content)
  ) {
    return { ...incoming, content: existing.content };
  }
  return incoming;
}

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
  const existing = await database.get('messages', msg.id);
  const media = isMediaMessage(msg.type) ? await database.get('media', msg.id) : null;
  const next = preserveLocalMediaContent(msg, existing);
  const content = media
    ? await renderStoredMediaContent(media, next)
    : (!hasLocalPayload(next.content) && existing?.content ? existing.content : next.content);
  await database.put('messages', {
    ...next,
    content,
  });
}

export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const database = await getDB();
  const all = await database.getAllFromIndex('messages', 'conversationId', conversationId);
  const messages = all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(-limit);
  const hydrated = await Promise.all(messages.map(async message => {
    if (!isMediaMessage(message.type)) return message;
    const media = await database.get('media', message.id);
    return media ? { ...message, content: await renderStoredMediaContent(media, message) } : message;
  }));
  return hydrated;
}

export async function deleteMessage(id: string) {
  const database = await getDB();
  const media = await database.get('media', id);
  const tx = database.transaction(['messages', 'media'], 'readwrite');
  await tx.objectStore('messages').delete(id);
  await tx.objectStore('media').delete(id);
  await tx.done;
  await deleteFromOpfs(media?.opfsPath);
}

export async function persistMessageMedia(msg: Message) {
  if (!isMediaMessage(msg.type) || !hasLocalPayload(msg.content)) return null;
  const attachment = extractAttachment(msg.content, msg.type);
  if (!attachment?.src) return null;

  const database = await getDB();
  const existing = await database.get('media', msg.id);
  if (existing?.checksum && (existing?.blob || existing?.opfsPath || existing?.content)) {
    const content = await renderStoredMediaContent(existing, msg);
    await saveMessage({ ...msg, content });
    return {
      checksum: existing.checksum as string,
      size: existing.size as number | undefined,
      opfsPath: existing.opfsPath as string | undefined,
      content,
    };
  }

  const blob = await sourceToBlob(attachment.src, attachment.mime);
  const buffer = await blob.arrayBuffer();
  const checksum = bytesToHex(await crypto.subtle.digest('SHA-256', buffer));
  const verifiedBlob = new Blob([buffer], { type: blob.type || attachment.mime });
  const localUrl = makeObjectUrl(msg.id, verifiedBlob);
  const opfsPath = await writeToOpfs(msg.id, checksum, verifiedBlob);
  const content = buildLocalContent(msg.content, localUrl, { checksum });
  const dataUrl = verifiedBlob.size <= DATA_URL_FALLBACK_MAX_BYTES
    ? await blobToDataUrl(verifiedBlob).catch(() => undefined)
    : undefined;

  await database.put('media', {
    id: msg.id,
    conversationId: msg.conversationId,
    type: msg.type,
    mime: verifiedBlob.type || attachment.mime,
    size: verifiedBlob.size,
    checksum,
    content,
    blob: verifiedBlob,
    dataUrl,
    opfsPath,
    originalContent: msg.content,
    name: attachment.name,
    savedAt: Date.now(),
  });
  await database.put('messages', { ...msg, content });

  return { checksum, size: verifiedBlob.size, opfsPath, content };
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

export async function deleteConversation(conversationId: string) {
  const database = await getDB();
  const tx = database.transaction(['conversations', 'messages', 'media'], 'readwrite');
  await tx.objectStore('conversations').delete(conversationId);
  const messages = await tx.objectStore('messages').index('conversationId').getAll(conversationId);
  const mediaItems = await tx.objectStore('media').index('conversationId').getAll(conversationId);
  await Promise.all(messages.map(message => tx.objectStore('messages').delete(message.id)));
  await Promise.all(mediaItems.map(media => tx.objectStore('media').delete(media.id)));
  await tx.done;
  await Promise.all(mediaItems.map(media => deleteFromOpfs(media.opfsPath)));
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

export async function clearOldTextMessages(daysOld = 5) {
  const database = await getDB();
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  const all = await database.getAll('messages');
  const oldText = all.filter(m => m.type === 'text' && m.createdAt < cutoff);
  const tx = database.transaction('messages', 'readwrite');
  await Promise.all(oldText.map(m => tx.store.delete(m.id)));
  await tx.done;
}
