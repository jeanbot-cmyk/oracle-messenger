export const GALLERY_KEY = 'oracle-gallery';

export interface MediaItem {
  src: string;
  type: 'image' | 'video' | 'audio' | 'file';
  savedAt: number;
  name?: string;
  mime?: string;
  size?: number;
  source?: 'conversation' | 'edit' | 'manual' | 'ai_flyer';
}

function scopedGalleryKey(ownerId?: string) {
  const normalized = typeof ownerId === 'string' ? ownerId.trim() : '';
  return normalized ? `${GALLERY_KEY}:${normalized}` : GALLERY_KEY;
}

function inferType(src: string, fallback: MediaItem['type'] = 'image'): MediaItem['type'] {
  const lower = src.toLowerCase();
  if (lower.startsWith('data:image')) return 'image';
  if (lower.startsWith('data:video')) return 'video';
  if (lower.startsWith('data:audio')) return 'audio';
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/.test(lower)) return 'video';
  if (/\.(mp3|m4a|aac|ogg|wav|webm)(\?|#|$)/.test(lower)) return 'audio';
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt)(\?|#|$)/.test(lower)) return 'file';
  return fallback;
}

export function normalizeGalleryItems(raw: unknown): MediaItem[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item, index): MediaItem | null => {
      if (typeof item === 'string') {
        return {
          src: item,
          type: inferType(item),
          savedAt: Date.now() - index,
          name: `media-${Date.now() - index}`,
          source: 'manual',
        };
      }
      if (!item || typeof item !== 'object') return null;
      const value = item as Partial<MediaItem>;
      if (typeof value.src !== 'string' || !value.src.trim()) return null;
      const type = value.type === 'video' || value.type === 'audio' || value.type === 'file' || value.type === 'image'
        ? value.type
        : inferType(value.src, value.mime?.startsWith('video/') ? 'video' : value.mime?.startsWith('audio/') ? 'audio' : value.mime ? 'file' : 'image');
      const savedAt = typeof value.savedAt === 'number' && Number.isFinite(value.savedAt)
        ? value.savedAt
        : Date.now() - index;
      return {
        src: value.src,
        type,
        savedAt,
        name: value.name,
        mime: value.mime,
        size: value.size,
        source: value.source,
      };
    })
    .filter((item): item is MediaItem => Boolean(item));
}

export function readGalleryItems(ownerId?: string): MediaItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeGalleryItems(JSON.parse(localStorage.getItem(scopedGalleryKey(ownerId)) ?? '[]'));
  } catch {
    return [];
  }
}

export function writeGalleryItems(items: MediaItem[], ownerId?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(scopedGalleryKey(ownerId), JSON.stringify(items.slice(0, 500)));
}

export function saveToGallery(src: string, type: MediaItem['type'] = 'image', name?: string, meta?: Partial<MediaItem>, ownerId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const items = readGalleryItems(ownerId);
    if (items.some(i => i.src === src)) return;
    items.unshift({ src, type, savedAt: Date.now(), name, ...meta });
    writeGalleryItems(items, ownerId);
  } catch {}
}
