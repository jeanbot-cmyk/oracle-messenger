import * as FileSystem from 'expo-file-system/legacy';
import type { Message } from '@/types/messenger';
import { checkNativeStorageForWrite } from './nativeStorageHealth';

export const MEDIA_ROOT = `${FileSystem.documentDirectory ?? ''}oracle-media/`;
const GALLERY_INDEX = `${MEDIA_ROOT}gallery-index.json`;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type MediaPayload = {
  url: string;
  size?: number;
  checksum?: string;
  mime?: string;
  name?: string;
};

export type LocalGalleryItem = {
  id: string;
  messageId: string;
  uri: string;
  type: 'image' | 'video' | 'audio' | 'file';
  savedAt: number;
  name?: string;
  mime?: string;
  size?: number;
  checksum?: string;
  source: 'conversation';
};

export function isMediaMessage(message: Message) {
  return ['image', 'video', 'audio', 'voice', 'file', 'document', 'gif', 'sticker'].includes(String(message.type || '').toLowerCase());
}

export function extractPayload(content: string): MediaPayload | null {
  const raw = String(content || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const url = [
      parsed?.url,
      parsed?.mediaUrl,
      parsed?.fileUrl,
      parsed?.downloadUrl,
      parsed?.localUri,
      parsed?.path,
      parsed?.uri,
    ].find(value => typeof value === 'string' && value.trim()) as string | undefined;
    if (url) {
      return {
        url,
        size: Number.isFinite(Number(parsed.size)) && Number(parsed.size) > 0 ? Math.floor(Number(parsed.size)) : undefined,
        checksum: typeof parsed.checksum === 'string' && /^[a-f0-9]{64}$/i.test(parsed.checksum)
          ? parsed.checksum.toLowerCase()
          : undefined,
        mime: typeof parsed.mime === 'string' ? parsed.mime : undefined,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
      };
    }
  } catch {}
  return /^(https?:\/\/|file:\/\/|content:\/\/|\/uploads\/)/i.test(raw) ? { url: raw } : null;
}

function extensionFromPayload(payload: MediaPayload, type: string) {
  const name = payload.name || payload.url;
  const mime = payload.mime || '';
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return type === 'audio' || type === 'voice' ? '.m4a' : '.mp4';
  if (mime.includes('quicktime')) return '.mov';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('pdf')) return '.pdf';
  const clean = name.split('?')[0] || '';
  const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.')).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8) : '';
  if (ext) return ext;
  if (type === 'image') return '.jpg';
  if (type === 'video') return '.mp4';
  if (type === 'audio' || type === 'voice') return '.webm';
  return '.bin';
}

function galleryType(type: string): LocalGalleryItem['type'] {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'image' || normalized === 'gif' || normalized === 'sticker') return 'image';
  if (normalized === 'video') return 'video';
  if (normalized === 'audio' || normalized === 'voice') return 'audio';
  return 'file';
}

async function readGalleryIndex() {
  await FileSystem.makeDirectoryAsync(MEDIA_ROOT, { intermediates: true }).catch(() => {});
  try {
    const raw = await FileSystem.readAsStringAsync(GALLERY_INDEX);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) as LocalGalleryItem[] : [];
  } catch {
    return [];
  }
}

async function writeGalleryIndex(items: LocalGalleryItem[]) {
  await FileSystem.makeDirectoryAsync(MEDIA_ROOT, { intermediates: true }).catch(() => {});
  const deduped = new Map<string, LocalGalleryItem>();
  for (const item of items) {
    if (!item?.messageId || !item.uri) continue;
    deduped.set(item.messageId, item);
  }
  const next = [...deduped.values()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 500);
  await FileSystem.writeAsStringAsync(GALLERY_INDEX, JSON.stringify(next));
}

async function addToGalleryIndex(message: Message, fileUri: string, payload: MediaPayload, saved: { size: number; checksum: string }) {
  const current = await readGalleryIndex();
  await writeGalleryIndex([
    {
      id: message.id,
      messageId: message.id,
      uri: fileUri,
      type: galleryType(message.type),
      savedAt: Date.now(),
      name: payload.name,
      mime: payload.mime,
      size: saved.size,
      checksum: saved.checksum,
      source: 'conversation',
    },
    ...current,
  ]);
}

export async function readLocalGalleryItems() {
  const items = await readGalleryIndex();
  const existing: LocalGalleryItem[] = [];
  for (const item of items) {
    const info = await FileSystem.getInfoAsync(item.uri).catch(() => null);
    if (info?.exists) existing.push(item);
  }
  if (existing.length !== items.length) await writeGalleryIndex(existing).catch(() => {});
  return existing;
}

export async function removeLocalGalleryItem(messageId: string) {
  const items = await readGalleryIndex();
  const item = items.find(entry => entry.messageId === messageId);
  if (item?.uri) await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {});
  await writeGalleryIndex(items.filter(entry => entry.messageId !== messageId));
}

export async function renameLocalGalleryItem(messageId: string, name: string) {
  const cleanName = name.trim().slice(0, 120);
  if (!cleanName) return;
  const items = await readGalleryIndex();
  await writeGalleryIndex(items.map(item => (
    item.messageId === messageId ? { ...item, name: cleanName } : item
  )));
}

function rightRotate(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function base64ToBytes(base64: string) {
  const clean = base64.replace(/^data:[^;,]+;base64,/, '').replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outputLength = Math.floor((clean.length * 3) / 4) - padding;
  const bytes = new Uint8Array(Math.max(0, outputLength));
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of clean) {
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8 && index < bytes.length) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
      index += 1;
    }
  }
  return bytes;
}

function sha256Bytes(bytes: Uint8Array) {
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  return h.map(value => value.toString(16).padStart(8, '0')).join('');
}

async function fileChecksum(fileUri: string) {
  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  return sha256Bytes(base64ToBytes(base64));
}

async function validateLocalFile(fileUri: string, payload: MediaPayload) {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || !info.size) return null;
  if (payload.size && info.size !== payload.size) return null;
  const checksum = await fileChecksum(fileUri);
  if (payload.checksum && checksum !== payload.checksum) return null;
  return { fileUri, size: info.size, checksum };
}

export async function ensureMediaStoredLocally(message: Message) {
  if (!isMediaMessage(message)) return null;
  const payload = extractPayload(message.content);
  if (!payload?.url) return null;

  await FileSystem.makeDirectoryAsync(MEDIA_ROOT, { intermediates: true }).catch(() => {});
  const fileUri = `${MEDIA_ROOT}${message.id}${extensionFromPayload(payload, message.type)}`;
  const existing = await validateLocalFile(fileUri, payload);
  if (existing) {
    await addToGalleryIndex(message, fileUri, payload, existing).catch(() => {});
    return existing;
  }

  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  const tempUri = `${fileUri}.download`;
  await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  const storageHealth = await checkNativeStorageForWrite(payload.size || 0);
  if (storageHealth.level === 'insufficient') {
    throw new Error(storageHealth.message || 'Espace insuffisant pour télécharger ce média.');
  }

  const downloaded = await FileSystem.downloadAsync(payload.url, tempUri);
  if (downloaded.status < 200 || downloaded.status >= 300) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    throw new Error(`Téléchargement média échoué: ${downloaded.status}`);
  }

  const verified = await validateLocalFile(tempUri, payload);
  if (!verified) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    throw new Error('Média téléchargé mais validation locale échouée.');
  }

  await FileSystem.moveAsync({ from: tempUri, to: fileUri });
  await addToGalleryIndex(message, fileUri, payload, verified).catch(() => {});
  return { ...verified, fileUri };
}

export async function storeMediaFromLocalSource(message: Message, sourceUri: string) {
  if (!isMediaMessage(message)) return null;
  const payload = extractPayload(message.content);
  if (!payload?.url || !sourceUri) return null;

  await FileSystem.makeDirectoryAsync(MEDIA_ROOT, { intermediates: true }).catch(() => {});
  const fileUri = `${MEDIA_ROOT}${message.id}${extensionFromPayload(payload, message.type)}`;
  const existing = await validateLocalFile(fileUri, payload);
  if (existing) {
    await addToGalleryIndex(message, fileUri, payload, existing).catch(() => {});
    return existing;
  }

  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  const storageHealth = await checkNativeStorageForWrite(payload.size || 0);
  if (storageHealth.level === 'insufficient') {
    throw new Error(storageHealth.message || 'Espace insuffisant pour enregistrer ce média.');
  }
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: fileUri });
  } catch {
    return ensureMediaStoredLocally(message);
  }

  const verified = await validateLocalFile(fileUri, payload);
  if (!verified) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    return ensureMediaStoredLocally(message);
  }

  await addToGalleryIndex(message, fileUri, payload, verified).catch(() => {});
  return verified;
}
