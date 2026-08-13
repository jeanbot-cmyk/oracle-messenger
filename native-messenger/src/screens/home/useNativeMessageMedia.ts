import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { storeMediaFromLocalSource } from '@/services/localMedia';
import { checkNativeStorageForWrite } from '@/services/nativeStorageHealth';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation, Message } from '@/types/messenger';

export type NativeMessageMediaKind = 'image' | 'file' | 'video' | 'audio' | 'voice';
const MAX_NATIVE_UPLOAD_BYTES = 18 * 1024 * 1024;
const MAX_DATA_URL_FALLBACK_BYTES = 12 * 1024 * 1024;

export type NativeMessageMediaInput = {
  uri: string;
  name?: string;
  mime?: string;
  kind: NativeMessageMediaKind;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
  waveform?: number[];
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
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('Fichier introuvable sur le téléphone.');
  return (info as { size?: number }).size;
}

function mediaLabel(kind: NativeMessageMediaKind) {
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'vidéo';
  if (kind === 'audio' || kind === 'voice') return 'audio';
  return 'fichier';
}

function shouldTryLegacyUpload(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return message.includes('404') || message.includes('cannot post') || message.includes('not found');
}

function friendlyUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  if (lower.includes('trop lourd') || lower.includes('payload too large') || lower.includes('request entity too large')) {
    return 'Fichier trop lourd. Limite actuelle : 18 Mo par envoi.';
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
  try {
    return await api.mediaUploadFile(token, {
      uri: input.uri,
      name: input.name,
      mime,
      kind: input.kind,
    });
  } catch (error) {
    if (!shouldTryLegacyUpload(error)) throw error;
    if (size && size > MAX_DATA_URL_FALLBACK_BYTES) {
      throw new Error('Le serveur média doit être mis à jour pour envoyer ce fichier sans conversion base64.');
    }
    return api.mediaUpload(token, {
      dataUrl: await fileToDataUrl(input.uri, mime),
      name: input.name,
      mime,
      kind: input.kind,
    });
  }
}

async function sendMediaMessage(
  token: string,
  conversationId: string,
  content: string,
  type: NativeMessageMediaKind,
) {
  const socket = ensureNativeSocket(token);
  try {
    return await socketAck<Message>(socket, 'message:send', {
      conversationId,
      content,
      type,
    });
  } catch (error) {
    if (socket.connected) throw error;
    return api.sendMessage(conversationId, token, content, type);
  }
}

function normalizeDurationSeconds(value?: number | null) {
  if (!value || !Number.isFinite(value)) return undefined;
  const seconds = value > 1000 ? value / 1000 : value;
  return Math.max(1, Math.round(seconds));
}

function simpleWaveform(seedSource: string, bars = 36) {
  let hash = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    hash = (hash * 31 + seedSource.charCodeAt(index)) >>> 0;
  }
  return Array.from({ length: bars }, (_, index) => {
    hash = (hash * 1664525 + 1013904223 + index) >>> 0;
    return 18 + (hash % 78);
  });
}

export function useNativeMessageMedia({
  selected,
  token,
  currentUserId,
  refreshConversations,
  patchMessage,
  upsertMessage,
  setNotice,
}: UseNativeMessageMediaParams) {
  const sendMedia = useCallback(async (input: NativeMessageMediaInput) => {
    if (!selected || !token) {
      setNotice('Ouvrez une conversation avant d’envoyer un média.');
      return false;
    }
    setNotice('');
    let optimisticMessage: Message | null = null;
    try {
      const mime = input.mime || 'application/octet-stream';
      const size = await localFileSize(input.uri, input.size);
      if (size && size > MAX_NATIVE_UPLOAD_BYTES) {
        setNotice('Fichier trop lourd. Limite actuelle : 18 Mo par envoi.');
        return false;
      }
      const storageHealth = await checkNativeStorageForWrite(size || 0);
      if (storageHealth.level === 'insufficient') {
        setNotice(storageHealth.message || 'Espace insuffisant pour préparer ce fichier.');
        return false;
      }
      if (storageHealth.level === 'low' || storageHealth.level === 'critical') {
        setNotice(storageHealth.message || 'Message système - stockage faible.');
      }
      const optimisticId = `local-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimisticPayload = {
        url: input.uri,
        size,
        mime,
        name: input.name || `${mediaLabel(input.kind)}-${Date.now()}`,
        width: input.width,
        height: input.height,
        duration: input.duration,
        thumbnail: input.thumbnail && input.thumbnail.length < 12_000 ? input.thumbnail : undefined,
        waveform: input.waveform,
        uploadState: 'uploading',
        uploadProgress: 12,
      };
      optimisticMessage = {
        id: optimisticId,
        conversationId: selected.id,
        senderId: currentUserId || 'local-user',
        content: JSON.stringify(optimisticPayload),
        type: input.kind,
        status: 'uploading',
        createdAt: new Date().toISOString(),
      };
      upsertMessage(optimisticMessage);
      setNotice(`Envoi ${mediaLabel(input.kind)} en cours...`);
      upsertMessage({
        ...optimisticMessage,
        content: JSON.stringify({ ...optimisticPayload, uploadProgress: 38 }),
      });
      const uploaded = await uploadMedia(token, input, mime, size);
      upsertMessage({
        ...optimisticMessage,
        content: JSON.stringify({ ...optimisticPayload, uploadProgress: 82 }),
      });
      const payload = JSON.stringify({
        url: uploaded.url,
        size: size ?? uploaded.size,
        checksum: uploaded.checksum,
        mime: input.mime || uploaded.mime,
        name: input.name || uploaded.name,
        width: input.width,
        height: input.height,
        duration: input.duration,
        thumbnail: input.thumbnail && input.thumbnail.length < 12_000 ? input.thumbnail : undefined,
        waveform: input.waveform,
      });
      const localPayload = JSON.stringify({
        url: uploaded.url,
        localUri: input.uri,
        size: size ?? uploaded.size,
        checksum: uploaded.checksum,
        mime: input.mime || uploaded.mime,
        name: input.name || uploaded.name,
        width: input.width,
        height: input.height,
        duration: input.duration,
        thumbnail: input.thumbnail && input.thumbnail.length < 12_000 ? input.thumbnail : undefined,
        waveform: input.waveform,
      });
      const message = await sendMediaMessage(token, selected.id, payload, input.kind);
      patchMessage(optimisticMessage.id, { ...message, content: localPayload, status: message.status || 'sent' });
      storeMediaFromLocalSource(message, input.uri)
        .then(saved => {
          if (!saved) return null;
          patchMessage(message.id, {
            content: JSON.stringify({ ...JSON.parse(localPayload), localUri: saved.fileUri }),
          });
          return api.ackMediaSaved(message.id, token, saved.checksum, saved.size).catch(() => null);
        })
        .catch(() => null);
      setNotice('');
      void refreshConversations().catch(() => undefined);
      return true;
    } catch (error) {
      if (optimisticMessage) {
        const payload = parseOptimisticPayload(optimisticMessage.content);
        upsertMessage({
          ...optimisticMessage,
          content: JSON.stringify({
            ...payload,
            uploadState: 'failed',
            uploadProgress: 0,
            uploadError: friendlyUploadError(error),
          }),
          status: 'failed',
        });
      }
      setNotice(friendlyUploadError(error));
      return false;
    }
  }, [currentUserId, patchMessage, refreshConversations, selected, setNotice, token, upsertMessage]);

  const attachImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour envoyer une image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.86,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      name: asset.fileName || `media-${Date.now()}`,
      mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: asset.type === 'video' ? 'video' : 'image',
      size: (asset as any).fileSize,
      width: asset.width,
      height: asset.height,
      duration: normalizeDurationSeconds((asset as any).duration),
    });
  }, [sendMedia, setNotice]);

  const attachCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission caméra requise pour prendre une photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.86,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      name: asset.fileName || `camera-${Date.now()}`,
      mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: asset.type === 'video' ? 'video' : 'image',
      size: (asset as any).fileSize,
      width: asset.width,
      height: asset.height,
      duration: normalizeDurationSeconds((asset as any).duration),
    });
  }, [sendMedia, setNotice]);

  const attachDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType || 'application/octet-stream',
      kind: asset.mimeType?.startsWith('audio/') ? 'audio' : 'file',
      size: asset.size,
      waveform: asset.mimeType?.startsWith('audio/') ? simpleWaveform(`${asset.name}:${asset.size || 0}`) : undefined,
    });
  }, [sendMedia]);

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
