export const GALLERY_KEY = 'oracle-gallery';

export interface MediaItem {
  src: string;
  type: 'image' | 'video';
  savedAt: number;
  name?: string;
}

export function saveToGallery(src: string, type: 'image' | 'video' = 'image', name?: string) {
  if (typeof window === 'undefined') return;
  try {
    const items: MediaItem[] = JSON.parse(localStorage.getItem(GALLERY_KEY) ?? '[]');
    if (items.some(i => i.src === src)) return;
    items.unshift({ src, type, savedAt: Date.now(), name });
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items.slice(0, 500)));
  } catch {}
}
