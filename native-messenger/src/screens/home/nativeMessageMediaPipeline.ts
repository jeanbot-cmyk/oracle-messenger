export type NativeMessageMediaKind = 'image' | 'file' | 'video' | 'audio' | 'voice' | 'gif' | 'sticker';

export type NativeMessageMediaInput = {
  uri: string;
  name?: string;
  mime?: string;
  kind: NativeMessageMediaKind;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  albumId?: string;
  albumIndex?: number;
  albumCount?: number;
  thumbnail?: string;
  waveform?: number[];
};

export type NativePickedMediaAsset = {
  uri?: string | null;
  type?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
};

export type NativePickedDocumentAsset = {
  uri?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type NativePickedMediaRejected = {
  index: number;
  reason: string;
  name?: string;
};

export type NativePickedMediaResult = {
  accepted: NativeMessageMediaInput[];
  rejected: NativePickedMediaRejected[];
};

export type NativeQueueResult<T, R> = {
  index: number;
  item: T;
  ok: boolean;
  value?: R;
  error?: unknown;
  startedAt: number;
  finishedAt: number;
};

export const NATIVE_MEDIA_SELECTION_LIMIT = 0;
export const NATIVE_MEDIA_UPLOAD_CONCURRENCY = 2;

export function extensionFromMime(mime?: string | null) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('quicktime')) return 'mov';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  return 'bin';
}

export function fallbackMediaName(prefix: string, mime?: string | null, index = 0) {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${extensionFromMime(mime)}`;
}

export function normalizeDurationSeconds(value?: number | null) {
  if (!value || !Number.isFinite(value)) return undefined;
  const seconds = value > 1000 ? value / 1000 : value;
  return Math.max(1, Math.round(seconds));
}

export function simpleNativeWaveform(seedSource: string, bars = 36) {
  let hash = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    hash = (hash * 31 + seedSource.charCodeAt(index)) >>> 0;
  }
  return Array.from({ length: bars }, (_, index) => {
    hash = (hash * 1664525 + 1013904223 + index) >>> 0;
    return 18 + (hash % 78);
  });
}

export function normalizePickedNativeMediaAssets(
  assets: readonly NativePickedMediaAsset[] | null | undefined,
  options: { maxSelection?: number } = {},
): NativePickedMediaResult {
  const configuredMaxSelection = options.maxSelection ?? NATIVE_MEDIA_SELECTION_LIMIT;
  const maxSelection = configuredMaxSelection > 0 ? Math.max(1, configuredMaxSelection) : Number.POSITIVE_INFINITY;
  const accepted: NativeMessageMediaInput[] = [];
  const rejected: NativePickedMediaRejected[] = [];

  for (const [index, asset] of (assets || []).entries()) {
    const name = asset.fileName || undefined;
    if (Number.isFinite(maxSelection) && accepted.length >= maxSelection) {
      rejected.push({ index, name, reason: `Limite actuelle : ${maxSelection} médias par envoi.` });
      continue;
    }

    const uri = String(asset.uri || '').trim();
    if (!uri) {
      rejected.push({ index, name, reason: 'URI Android absente pour ce média.' });
      continue;
    }

    const rawType = String(asset.type || '').toLowerCase();
    const mime = normalizePickerMime(asset);
    const kind = mediaKindFromPickerAsset(rawType, mime, name);
    if (!kind) {
      rejected.push({ index, name, reason: `Type non supporté : ${asset.type || mime || 'inconnu'}.` });
      continue;
    }

    accepted.push({
      uri,
      name: name || fallbackMediaName(kind === 'video' ? 'video' : 'image', mime, index),
      mime: mime || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind,
      size: positiveNumber(asset.fileSize),
      width: positiveNumber(asset.width),
      height: positiveNumber(asset.height),
      duration: normalizeDurationSeconds(asset.duration),
    });
  }

  return { accepted, rejected };
}

export function normalizePickedNativeDocuments(
  assets: readonly NativePickedDocumentAsset[] | null | undefined,
  options: { maxSelection?: number } = {},
): NativePickedMediaResult {
  const configuredMaxSelection = options.maxSelection ?? NATIVE_MEDIA_SELECTION_LIMIT;
  const maxSelection = configuredMaxSelection > 0 ? Math.max(1, configuredMaxSelection) : Number.POSITIVE_INFINITY;
  const accepted: NativeMessageMediaInput[] = [];
  const rejected: NativePickedMediaRejected[] = [];

  for (const [index, asset] of (assets || []).entries()) {
    const name = asset.name || undefined;
    if (Number.isFinite(maxSelection) && accepted.length >= maxSelection) {
      rejected.push({ index, name, reason: `Limite actuelle : ${maxSelection} fichiers par envoi.` });
      continue;
    }

    const uri = String(asset.uri || '').trim();
    if (!uri) {
      rejected.push({ index, name, reason: 'URI Android absente pour ce fichier.' });
      continue;
    }

    const mime = String(asset.mimeType || 'application/octet-stream').trim().toLowerCase() || 'application/octet-stream';
    const displayName = name || fallbackMediaName('fichier', mime, index);
    const isAudio = mime.startsWith('audio/');
    accepted.push({
      uri,
      name: displayName,
      mime,
      kind: isAudio ? 'audio' : 'file',
      size: positiveNumber(asset.size),
      waveform: isAudio ? simpleNativeWaveform(`${displayName}:${asset.size || 0}`) : undefined,
    });
  }

  return { accepted, rejected };
}

export async function runLimitedNativeMediaQueue<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<NativeQueueResult<T, R>[]> {
  const results = new Array<NativeQueueResult<T, R>>(items.length);
  let cursor = 0;
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      const item = items[index];
      const startedAt = Date.now();
      try {
        const value = await worker(item, index);
        results[index] = { index, item, ok: true, value, startedAt, finishedAt: Date.now() };
      } catch (error) {
        results[index] = { index, item, ok: false, error, startedAt, finishedAt: Date.now() };
      }
    }
  }));

  return results;
}

function normalizePickerMime(asset: NativePickedMediaAsset) {
  const explicit = String(asset.mimeType || '').trim().toLowerCase();
  if (explicit) return explicit;
  const type = String(asset.type || '').toLowerCase();
  const name = String(asset.fileName || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.mp4') || type === 'video') return 'video/mp4';
  if (type === 'image' || type === 'livephoto') return 'image/jpeg';
  return '';
}

function mediaKindFromPickerAsset(type: string, mime: string, name?: string) {
  if (type === 'video' || mime.startsWith('video/')) return 'video';
  if (type === 'image' || type === 'livephoto' || mime.startsWith('image/')) return 'image';
  const lowerName = String(name || '').toLowerCase();
  if (/\.(png|jpe?g|webp|gif|heic|heif)$/.test(lowerName)) return 'image';
  if (/\.(mp4|mov|m4v|webm)$/.test(lowerName)) return 'video';
  return null;
}

function positiveNumber(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}
