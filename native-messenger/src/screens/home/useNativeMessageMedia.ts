import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Video as VideoCompressor } from 'react-native-compressor';
import { socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { commitPreservedOutgoingMedia, preserveOutgoingMediaSource } from '@/services/localMedia';
import {
  enqueueNativeMediaMessage,
  markNativeMediaMessageAttempt,
  readNativeMediaOutbox,
  removeNativeMediaMessageFromOutbox,
} from '@/services/nativeMediaOutbox';
import { nativeDebugLog } from '@/services/nativeLogger';
import { checkNativeStorageForWrite } from '@/services/nativeStorageHealth';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation, Message } from '@/types/messenger';
import {
  fallbackMediaName,
  NATIVE_MEDIA_SELECTION_LIMIT,
  NATIVE_MEDIA_UPLOAD_CONCURRENCY,
  normalizePickedNativeDocuments,
  normalizePickedNativeMediaAssets,
  runLimitedNativeMediaQueue,
  type NativeMessageMediaInput,
  type NativeMessageMediaKind,
} from './nativeMessageMediaPipeline';

export type { NativeMessageMediaInput, NativeMessageMediaKind } from './nativeMessageMediaPipeline';

const VIDEO_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const MAX_DATA_URL_FALLBACK_BYTES = 24 * 1024 * 1024;
const MEDIA_UPLOAD_RETRY_DELAYS_MS = [0, 900, 2200];
const VIDEO_COMPRESSION_PROFILES = [
  { compressionMethod: 'auto' as const, maxSize: 1280, minimumFileSizeForCompress: 80 },
  { compressionMethod: 'manual' as const, maxSize: 960, bitrate: 1_800_000, minimumFileSizeForCompress: 0 },
  { compressionMethod: 'manual' as const, maxSize: 720, bitrate: 1_100_000, minimumFileSizeForCompress: 0 },
];

type UploadedNativeMedia = {
  url: string;
  path: string;
  mime: string;
  size: number;
  checksum: string;
  name: string;
  kind: string;
};

type UseNativeMessageMediaParams = {
  selected: Conversation | null;
  token?: string;
  currentUserId?: string;
  refreshConversations: () => Promise<void>;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  upsertMessage: (message: Message) => void;
  setNotice: (message: string) => void;
};

async function fileToDataUrl(uri: string, mime = 'application/octet-stream') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

async function localFileSize(uri: string, fallback?: number) {
  if (fallback && Number.isFinite(fallback)) return fallback;
  let info: FileSystem.FileInfo;
  try {
    info = await FileSystem.getInfoAsync(uri);
  } catch (error) {
    if (/^content:\/\//i.test(uri)) return undefined;
    throw error;
  }
  if (!info.exists) {
    if (/^content:\/\//i.test(uri)) return undefined;
    throw new Error('Fichier introuvable sur le téléphone.');
  }
  return (info as { size?: number }).size;
}

function mediaLabel(kind: NativeMessageMediaKind) {
  if (kind === 'image') return 'image';
  if (kind === 'gif') return 'GIF';
  if (kind === 'sticker') return 'sticker';
  if (kind === 'video') return 'vidéo';
  if (kind === 'audio' || kind === 'voice') return 'audio';
  return 'fichier';
}

function isVideoMedia(input: Pick<NativeMessageMediaInput, 'kind' | 'mime' | 'name'>) {
  const mime = String(input.mime || '').toLowerCase();
  const name = String(input.name || '').toLowerCase();
  return input.kind === 'video' || mime.startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(name);
}

function formatMegabytes(bytes: number) {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} Mo`;
}

function normalizeLocalUploadUri(uri: string) {
  if (/^(file|content|https?):\/\//i.test(uri)) return uri;
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

function shouldTryLegacyUpload(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('404') ||
    message.includes('cannot post') ||
    message.includes('not found') ||
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('connexion trop lente') ||
    message.includes('timeout') ||
    message.includes('abort')
  );
}

function shouldRetryUpload(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('connexion trop lente') ||
    message.includes('timeout') ||
    message.includes('abort') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
}

function mediaErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Envoi média impossible.');
}

function isRetryableMediaError(error: unknown) {
  const message = mediaErrorMessage(error).toLowerCase();
  if (/http 4\d\d/.test(message)) return false;
  if (message.includes('trop lourde') || message.includes('trop lourd') || message.includes('type de fichier')) return false;
  if (message.includes('vide') || message.includes('introuvable') || message.includes('vérifié')) return false;
  return true;
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureMediaLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return requested.granted;
}

async function ensureCameraPermission() {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const requested = await ImagePicker.requestCameraPermissionsAsync();
  return requested.granted;
}

function friendlyUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  if (lower.includes('vidéo trop lourde') || lower.includes('video too large')) {
    return message;
  }
  if (lower.includes('trop lourd') || lower.includes('payload too large') || lower.includes('request entity too large')) {
    return 'Fichier trop lourd côté serveur. Réessayez ou envoyez un fichier plus léger.';
  }
  if (lower.includes('type de fichier') || lower.includes('unsupported media type')) {
    return 'Type de fichier non autorisé pour cet envoi.';
  }
  if (lower.includes('network request failed') || lower.includes('connexion trop lente') || lower.includes('failed to fetch')) {
    return 'Envoi impossible : connexion serveur lente ou indisponible.';
  }
  return message || 'Envoi média impossible.';
}

async function uploadMedia(token: string, input: NativeMessageMediaInput, mime: string, size?: number) {
  let lastError: unknown;
  for (const [attempt, delayMs] of MEDIA_UPLOAD_RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) await wait(delayMs);
    try {
      const uploaded = await api.mediaUploadFile(token, {
        uri: input.uri,
        name: input.name,
        mime,
        kind: input.kind,
      });
      return assertUploadedMedia(uploaded);
    } catch (error) {
      lastError = error;
      if (!shouldRetryUpload(error) || attempt === MEDIA_UPLOAD_RETRY_DELAYS_MS.length - 1) break;
    }
  }

  const uploadError = lastError || new Error('Envoi média impossible.');
  try {
    throw uploadError;
  } catch (error) {
    if (!shouldTryLegacyUpload(error)) throw error;
    if (size && size > MAX_DATA_URL_FALLBACK_BYTES) {
      throw new Error('Le serveur média doit être mis à jour pour envoyer ce fichier sans conversion base64.');
    }
    const uploaded = await api.mediaUpload(token, {
      dataUrl: await fileToDataUrl(input.uri, mime),
      name: input.name,
      mime,
      kind: input.kind,
    });
    return assertUploadedMedia(uploaded);
  }
}

function assertUploadedMedia(uploaded: UploadedNativeMedia) {
  if (!uploaded?.url) throw new Error('Upload refusé : URL média absente.');
  if (!Number.isFinite(Number(uploaded.size)) || Number(uploaded.size) <= 0) {
    throw new Error('Upload refusé : fichier vide.');
  }
  return uploaded;
}

async function compressVideoBelowLimit(
  input: NativeMessageMediaInput,
  initialSize: number,
  onProgress?: (progress: number) => void,
) {
  if (!isVideoMedia(input) || initialSize <= VIDEO_UPLOAD_MAX_BYTES) {
    return { input, size: initialSize, compressed: false };
  }

  let lastError: unknown;
  for (const [index, profile] of VIDEO_COMPRESSION_PROFILES.entries()) {
    try {
      const compressedUri = await VideoCompressor.compress(
        normalizeLocalUploadUri(input.uri),
        profile,
        progress => {
          const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
          onProgress?.((index + normalized) / VIDEO_COMPRESSION_PROFILES.length);
        },
      );
      const normalizedUri = normalizeLocalUploadUri(compressedUri);
      const compressedSize = await localFileSize(normalizedUri);
      if (!compressedSize || compressedSize <= 0) {
        throw new Error('Compression vidéo terminée, mais taille finale illisible.');
      }
      if (compressedSize <= VIDEO_UPLOAD_MAX_BYTES) {
        return {
          input: {
            ...input,
            uri: normalizedUri,
            name: input.name?.replace(/\.(mov|m4v|webm|3gp|mkv)$/i, '.mp4') || fallbackMediaName('video', 'video/mp4'),
            mime: 'video/mp4',
            size: compressedSize,
          },
          size: compressedSize,
          compressed: true,
        };
      }
      lastError = new Error(`Vidéo encore trop lourde après compression : ${formatMegabytes(compressedSize)}.`);
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : 'Compression vidéo impossible.';
  throw new Error(`Vidéo trop lourde. Limite vidéo : 100 Mo. Recompression impossible : ${reason}`);
}

async function sendMediaMessage(
  token: string,
  conversationId: string,
  content: string,
  type: NativeMessageMediaKind,
  clientMessageId?: string,
) {
  const socket = ensureNativeSocket(token);
  const startedAt = Date.now();
  try {
    const message = await socketAck<Message>(socket, 'message:send', {
      conversationId,
      content,
      type,
      clientMessageId,
      clientSentAt: new Date().toISOString(),
    });
    nativeDebugLog('[NativeMediaAnnounceLatency]', {
      conversationId,
      messageId: message.id,
      clientMessageId,
      type,
      transport: 'socket',
      ackMs: Date.now() - startedAt,
      socketConnected: socket.connected,
    });
    return message;
  } catch (error) {
    if (socket.connected) throw error;
    const message = await api.sendMessage(conversationId, token, content, type, undefined, clientMessageId);
    nativeDebugLog('[NativeMediaAnnounceLatency]', {
      conversationId,
      messageId: message.id,
      clientMessageId,
      type,
      transport: 'http-fallback',
      ackMs: Date.now() - startedAt,
      socketConnected: socket.connected,
    });
    return message;
  }
}

function buildUploadedMediaPayload(
  input: NativeMessageMediaInput,
  uploaded: UploadedNativeMedia,
  size?: number,
  localSourceUri?: string,
) {
  const payload: Record<string, unknown> = {
    url: uploaded.url,
    size: size ?? uploaded.size,
    checksum: uploaded.checksum,
    mime: input.mime || uploaded.mime,
    name: input.name || uploaded.name,
    width: input.width,
    height: input.height,
    duration: input.duration,
    albumId: input.albumId,
    albumIndex: input.albumIndex,
    albumCount: input.albumCount,
    thumbnail: input.thumbnail && input.thumbnail.length < 12_000 ? input.thumbnail : undefined,
    waveform: input.waveform,
  };
  if (localSourceUri) payload.localUri = localSourceUri;
  return payload;
}

type NativeUploadedMediaJob = {
  input: NativeMessageMediaInput;
  mime: string;
  size?: number;
  optimisticMessage: Message;
  optimisticPayload: Record<string, unknown>;
  conversationId: string;
  localMessageId: string;
  localSourceUri: string;
  uploaded: UploadedNativeMedia;
};

export function useNativeMessageMedia({
  selected,
  token,
  currentUserId,
  refreshConversations,
  patchMessage,
  upsertMessage,
  setNotice,
}: UseNativeMessageMediaParams) {
  const storageNoticeRef = useRef('');
  const flushingMediaOutboxRef = useRef(false);

  const prepareAndUploadMedia = useCallback(async (input: NativeMessageMediaInput, options: { quiet?: boolean } = {}) => {
    if (!selected || !token) {
      throw new Error('Ouvrez une conversation avant d’envoyer un média.');
    }

    if (!options.quiet) setNotice('');
    let optimisticMessage: Message | null = null;
    let outboxInput: NativeMessageMediaInput | null = null;
    let localMessageId = '';
    let conversationId = selected.id;
    try {
      let mediaInput = input;
      let mime = mediaInput.mime || 'application/octet-stream';
      let size = await localFileSize(mediaInput.uri, mediaInput.size);
      if (isVideoMedia(mediaInput)) {
        if (size && size > VIDEO_UPLOAD_MAX_BYTES) {
          if (!options.quiet) setNotice(`Compression vidéo en cours (${formatMegabytes(size)} → moins de 100 Mo)...`);
          const compressed = await compressVideoBelowLimit(mediaInput, size, progress => {
            if (!options.quiet) setNotice(`Compression vidéo ${Math.round(progress * 100)}%...`);
          });
          mediaInput = compressed.input;
          mime = mediaInput.mime || 'video/mp4';
          size = compressed.size;
          if (!options.quiet && compressed.compressed) setNotice('Vidéo compressée, envoi en cours...');
        }
        if (size && size > VIDEO_UPLOAD_MAX_BYTES) {
          throw new Error(`Vidéo trop lourde. Limite vidéo : 100 Mo. Taille actuelle : ${formatMegabytes(size)}.`);
        }
      }
      const storageHealth = await checkNativeStorageForWrite(size || 0);
      if (storageHealth.level === 'insufficient') {
        throw new Error(storageHealth.message || 'Espace insuffisant pour préparer ce fichier.');
      }
      if (!options.quiet && (storageHealth.level === 'low' || storageHealth.level === 'critical')) {
        const message = storageHealth.message || 'Message système - stockage faible.';
        storageNoticeRef.current = message;
        setNotice(message);
      }
      const optimisticId = `local-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localMessageId = optimisticId;
      conversationId = selected.id;
      const preserved = await preserveOutgoingMediaSource(optimisticId, {
        uri: mediaInput.uri,
        type: mediaInput.kind,
        name: mediaInput.name,
        mime,
        size,
      });
      const localSourceUri = preserved.fileUri;
      const optimisticPayload = {
        url: localSourceUri,
        localUri: localSourceUri,
        size: preserved.size || size,
        mime,
        name: mediaInput.name || `${mediaLabel(mediaInput.kind)}-${Date.now()}`,
        width: mediaInput.width,
        height: mediaInput.height,
        duration: mediaInput.duration,
        albumId: mediaInput.albumId,
        albumIndex: mediaInput.albumIndex,
        albumCount: mediaInput.albumCount,
        thumbnail: mediaInput.thumbnail && mediaInput.thumbnail.length < 12_000 ? mediaInput.thumbnail : undefined,
        waveform: mediaInput.waveform,
        uploadState: 'uploading',
        uploadProgress: 12,
      };
      optimisticMessage = {
        id: optimisticId,
        clientMessageId: optimisticId,
        conversationId: selected.id,
        senderId: currentUserId || 'local-user',
        content: JSON.stringify(optimisticPayload),
        type: mediaInput.kind,
        status: 'uploading',
        createdAt: new Date().toISOString(),
      };
      upsertMessage(optimisticMessage);
      if (!options.quiet) setNotice(`Envoi ${mediaLabel(mediaInput.kind)} en cours...`);
      const uploadStartedAt = Date.now();
      const uploadInput = { ...mediaInput, uri: localSourceUri, size: preserved.size || size };
      outboxInput = uploadInput;
      const uploaded = await uploadMedia(token, uploadInput, mime, preserved.size || size);
      nativeDebugLog('[NativeMediaUploadLatency]', {
        conversationId: selected.id,
        messageId: optimisticId,
        clientMessageId: optimisticId,
        type: mediaInput.kind,
        bytes: preserved.size || size,
        uploadMs: Date.now() - uploadStartedAt,
      });
      patchMessage(optimisticId, {
        content: JSON.stringify({ ...optimisticPayload, uploadProgress: 82 }),
      });
      return {
        input: mediaInput,
        mime,
        size: preserved.size || size,
        optimisticMessage,
        optimisticPayload,
        conversationId,
        localMessageId: optimisticId,
        localSourceUri,
        uploaded,
      };
    } catch (error) {
      const friendly = friendlyUploadError(error);
      if (optimisticMessage) {
        const payload = parseOptimisticPayload(optimisticMessage.content);
        if (outboxInput && isRetryableMediaError(error)) {
          await enqueueNativeMediaMessage({
            localMessageId,
            conversationId,
            input: outboxInput,
            lastError: friendly,
          }).catch(() => null);
        }
        upsertMessage({
          ...optimisticMessage,
          content: JSON.stringify({
            ...payload,
            uploadState: outboxInput && isRetryableMediaError(error) ? 'uploading' : 'failed',
            uploadProgress: 0,
            uploadError: friendly,
          }),
          status: outboxInput && isRetryableMediaError(error) ? 'queued' : 'failed',
        });
      }
      throw new Error(friendly);
    }
  }, [currentUserId, patchMessage, selected, setNotice, token, upsertMessage]);

  const finalizeUploadedMedia = useCallback(async (job: NativeUploadedMediaJob) => {
    if (!token) {
      throw new Error('Conversation indisponible pour finaliser ce média.');
    }

    const { input, size, optimisticMessage, optimisticPayload, conversationId, localMessageId, localSourceUri, uploaded } = job;
    try {
      const payloadObject = buildUploadedMediaPayload(input, uploaded, size);
      const localPayloadObject = buildUploadedMediaPayload(input, uploaded, size, localSourceUri);
      const payload = JSON.stringify(payloadObject);
      const localPayload = JSON.stringify(localPayloadObject);
      const message = await sendMediaMessage(token, conversationId, payload, input.kind, localMessageId);
      const saved = await commitPreservedOutgoingMedia({ ...message, content: payload }, localSourceUri)
        .catch(error => {
          const warning = error instanceof Error ? error.message : 'Message système - média envoyé, mais conservation locale à vérifier.';
          storageNoticeRef.current = warning;
          setNotice(warning);
          return null;
        });
      const finalLocalPayload = saved?.fileUri
        ? JSON.stringify({ ...JSON.parse(localPayload), localUri: saved.fileUri })
        : localPayload;
      patchMessage(optimisticMessage.id, { ...message, content: finalLocalPayload, status: message.status || 'sent' });
      if (saved) void api.ackMediaSaved(message.id, token, saved.checksum, saved.size).catch(() => null);
      return message;
    } catch (error) {
      const friendly = friendlyUploadError(error);
      if (isRetryableMediaError(error)) {
        await enqueueNativeMediaMessage({
          localMessageId,
          conversationId,
          input: { ...input, uri: localSourceUri, size },
          lastError: friendly,
        }).catch(() => null);
      }
      upsertMessage({
        ...optimisticMessage,
        content: JSON.stringify({
          ...optimisticPayload,
          uploadState: isRetryableMediaError(error) ? 'uploading' : 'failed',
          uploadProgress: 0,
          uploadError: friendly,
        }),
        status: isRetryableMediaError(error) ? 'queued' : 'failed',
      });
      throw new Error(friendly);
    }
  }, [patchMessage, setNotice, token, upsertMessage]);

  const flushMediaOutbox = useCallback(async () => {
    if (!token || flushingMediaOutboxRef.current) return;
    flushingMediaOutboxRef.current = true;
    try {
      const pending = await readNativeMediaOutbox();
      if (!pending.length) return;
      let sentCount = 0;

      for (const item of pending) {
        const mime = item.input.mime || 'application/octet-stream';
        try {
          const size = await localFileSize(item.input.uri, item.input.size);
          const optimisticPayload = {
            url: item.input.uri,
            localUri: item.input.uri,
            size,
            mime,
            name: item.input.name || `${mediaLabel(item.input.kind)}-${Date.now()}`,
            width: item.input.width,
            height: item.input.height,
            duration: item.input.duration,
            albumId: item.input.albumId,
            albumIndex: item.input.albumIndex,
            albumCount: item.input.albumCount,
            thumbnail: item.input.thumbnail && item.input.thumbnail.length < 12_000 ? item.input.thumbnail : undefined,
            waveform: item.input.waveform,
            uploadState: 'uploading',
            uploadProgress: 20,
            uploadError: item.lastError,
          };
          if (selected?.id === item.conversationId) {
            upsertMessage({
              id: item.localMessageId,
              clientMessageId: item.localMessageId,
              conversationId: item.conversationId,
              senderId: currentUserId || 'local-user',
              content: JSON.stringify(optimisticPayload),
              type: item.input.kind,
              status: 'uploading',
              createdAt: item.createdAt,
            });
          }

          const uploadInput = { ...item.input, size };
          const uploaded = await uploadMedia(token, uploadInput, mime, size);
          const payloadObject = buildUploadedMediaPayload(uploadInput, uploaded, size);
          const localPayloadObject = buildUploadedMediaPayload(uploadInput, uploaded, size, item.input.uri);
          const payload = JSON.stringify(payloadObject);
          const localPayload = JSON.stringify(localPayloadObject);
          const message = await sendMediaMessage(token, item.conversationId, payload, item.input.kind, item.localMessageId);
          const saved = await commitPreservedOutgoingMedia({ ...message, content: payload }, item.input.uri).catch(() => null);
          const finalLocalPayload = saved?.fileUri
            ? JSON.stringify({ ...JSON.parse(localPayload), localUri: saved.fileUri })
            : localPayload;
          await removeNativeMediaMessageFromOutbox(item.id);
          sentCount += 1;
          if (selected?.id === item.conversationId) {
            patchMessage(item.localMessageId, { ...message, content: finalLocalPayload, status: message.status || 'sent' });
          }
          if (saved) void api.ackMediaSaved(message.id, token, saved.checksum, saved.size).catch(() => null);
        } catch (error) {
          const friendly = friendlyUploadError(error);
          await markNativeMediaMessageAttempt(item.id, friendly);
          if (selected?.id === item.conversationId) {
            patchMessage(item.localMessageId, {
              status: isRetryableMediaError(error) ? 'queued' : 'failed',
              updatedAt: new Date().toISOString(),
              content: JSON.stringify({
                url: item.input.uri,
                localUri: item.input.uri,
                size: item.input.size,
                mime,
                name: item.input.name,
                uploadState: isRetryableMediaError(error) ? 'uploading' : 'failed',
                uploadProgress: 0,
                uploadError: friendly,
              }),
            });
          }
          if (!isRetryableMediaError(error)) await removeNativeMediaMessageFromOutbox(item.id);
          break;
        }
      }

      if (sentCount) {
        await refreshConversations();
        setNotice(sentCount === 1 ? 'Média hors connexion envoyé.' : `${sentCount} médias hors connexion envoyés.`);
      }
    } finally {
      flushingMediaOutboxRef.current = false;
    }
  }, [currentUserId, patchMessage, refreshConversations, selected?.id, setNotice, token, upsertMessage]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = ensureNativeSocket(token);
    void flushMediaOutbox();
    socket.on('connect', flushMediaOutbox);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void flushMediaOutbox();
    });
    return () => {
      socket.off('connect', flushMediaOutbox);
      subscription.remove();
    };
  }, [flushMediaOutbox, token]);

  const sendMedia = useCallback(async (input: NativeMessageMediaInput) => {
    try {
      const job = await prepareAndUploadMedia(input);
      await finalizeUploadedMedia(job);
      if (storageNoticeRef.current) {
        setNotice(storageNoticeRef.current);
        storageNoticeRef.current = '';
      } else {
        setNotice('');
      }
      void refreshConversations().catch(() => undefined);
      return true;
    } catch (error) {
      setNotice(friendlyUploadError(error));
      return false;
    }
  }, [finalizeUploadedMedia, prepareAndUploadMedia, refreshConversations, setNotice]);

  const sendMediaBatch = useCallback(async (
    inputs: NativeMessageMediaInput[],
    rejected: { reason: string; name?: string }[] = [],
  ) => {
    if (!selected || !token) {
      setNotice('Ouvrez une conversation avant d’envoyer un média.');
      return { sent: 0, failed: inputs.length + rejected.length, elapsedMs: 0 };
    }

    if (!inputs.length) {
      const firstReason = rejected[0]?.reason || 'Aucun média compatible dans la sélection.';
      setNotice(firstReason);
      return { sent: 0, failed: rejected.length, elapsedMs: 0 };
    }

    const startedAt = Date.now();
    const errors = rejected.map(item => item.name ? `${item.name}: ${item.reason}` : item.reason);
    const albumId = inputs.length > 1 ? `album-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : undefined;
    setNotice(`Préparation de ${inputs.length} média${inputs.length > 1 ? 's' : ''}...`);

    const sendResults = await runLimitedNativeMediaQueue(
      inputs,
      NATIVE_MEDIA_UPLOAD_CONCURRENCY,
      async (input, index) => {
        const mediaInput = albumId ? { ...input, albumId, albumIndex: index, albumCount: inputs.length } : input;
        const job = await prepareAndUploadMedia(mediaInput, { quiet: true });
        return finalizeUploadedMedia(job);
      },
    );

    let sent = 0;
    for (const result of sendResults) {
      if (!result.ok) {
        errors.push(friendlyUploadError(result.error));
        continue;
      }
      sent += 1;
    }

    const elapsedMs = Date.now() - startedAt;
    if (sent > 0) void refreshConversations().catch(() => undefined);
    const storageNotice = storageNoticeRef.current;
    storageNoticeRef.current = '';
    setNotice(storageNotice && !errors.length ? storageNotice : formatBatchNotice(sent, errors.length, elapsedMs, errors[0]));
    return { sent, failed: errors.length, elapsedMs };
  }, [finalizeUploadedMedia, prepareAndUploadMedia, refreshConversations, selected, setNotice, token]);

  const attachImage = useCallback(async () => {
    const granted = await ensureMediaLibraryPermission();
    if (!granted) {
      setNotice('Permission galerie requise. Activez-la dans les paramètres Android pour envoyer une image ou vidéo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: NATIVE_MEDIA_SELECTION_LIMIT,
      orderedSelection: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const { accepted, rejected } = normalizePickedNativeMediaAssets(result.assets, {
      maxSelection: NATIVE_MEDIA_SELECTION_LIMIT,
    });
    await sendMediaBatch(accepted, rejected);
  }, [sendMediaBatch, setNotice]);

  const attachCamera = useCallback(async () => {
    const granted = await ensureCameraPermission();
    if (!granted) {
      setNotice('Permission caméra requise. Activez-la dans les paramètres Android pour prendre une photo ou vidéo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const { accepted, rejected } = normalizePickedNativeMediaAssets([{
      uri: asset.uri,
      type: asset.type,
      mimeType: asset.mimeType,
      fileName: asset.fileName || fallbackMediaName('camera', asset.mimeType),
      fileSize: (asset as any).fileSize,
      width: asset.width,
      height: asset.height,
      duration: (asset as any).duration,
    }], { maxSelection: 1 });
    if (!accepted[0]) {
      setNotice(rejected[0]?.reason || 'Photo ou vidéo caméra invalide.');
      return;
    }
    await sendMedia(accepted[0]);
  }, [sendMedia, setNotice]);

  const attachDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });
    if (result.canceled || !result.assets?.[0]) return;
    const { accepted, rejected } = normalizePickedNativeDocuments(result.assets, {
      maxSelection: NATIVE_MEDIA_SELECTION_LIMIT,
    });
    await sendMediaBatch(accepted, rejected);
  }, [sendMediaBatch]);

  return {
    sendMedia,
    attachCamera,
    attachImage,
    attachDocument,
  };
}

function parseOptimisticPayload(content: string) {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function formatBatchNotice(sent: number, failed: number, elapsedMs: number, firstError?: string) {
  const elapsedSeconds = Math.max(0.1, elapsedMs / 1000).toFixed(1);
  const sentLabel = `${sent} média${sent > 1 ? 's' : ''} envoyé${sent > 1 ? 's' : ''}`;
  if (failed > 0) {
    const failureLabel = `${failed} échec${failed > 1 ? 's' : ''}`;
    const suffix = firstError ? ` Premier problème : ${firstError}` : '';
    return `${sentLabel} - ${failureLabel} en ${elapsedSeconds}s.${suffix}`;
  }
  return `${sentLabel} en ${elapsedSeconds}s.`;
}
