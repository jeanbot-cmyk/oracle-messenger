import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { socketAck } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation, Message } from '@/types/messenger';

export type NativeMessageMediaKind = 'image' | 'file' | 'video' | 'audio' | 'voice';

export type NativeMessageMediaInput = {
  uri: string;
  name?: string;
  mime?: string;
  kind: NativeMessageMediaKind;
};

type UseNativeMessageMediaParams = {
  selected: Conversation | null;
  token?: string;
  refreshConversations: () => Promise<void>;
  upsertMessage: (message: Message) => void;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
};

async function fileToDataUrl(uri: string, mime = 'application/octet-stream') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

export function useNativeMessageMedia({
  selected,
  token,
  refreshConversations,
  upsertMessage,
  setBusy,
  setNotice,
}: UseNativeMessageMediaParams) {
  const sendMedia = useCallback(async (input: NativeMessageMediaInput) => {
    if (!selected || !token) return false;
    setBusy(true);
    setNotice('');
    try {
      const mime = input.mime || 'application/octet-stream';
      const uploaded = await api.mediaUpload(token, {
        dataUrl: await fileToDataUrl(input.uri, mime),
        name: input.name,
        mime,
        kind: input.kind,
      });
      const payload = JSON.stringify({
        url: uploaded.url,
        size: uploaded.size,
        checksum: uploaded.checksum,
        mime: uploaded.mime,
        name: uploaded.name,
      });
      const socket = ensureNativeSocket(token);
      const message = await socketAck<Message>(socket, 'message:send', {
        conversationId: selected.id,
        content: payload,
        type: input.kind,
      }).catch(() => api.sendMessage(selected.id, token, payload, input.kind));
      upsertMessage({ ...message, status: message.status || 'sent' });
      await refreshConversations();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Envoi média impossible.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshConversations, selected, setBusy, setNotice, token, upsertMessage]);

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
    });
  }, [sendMedia]);

  return {
    sendMedia,
    attachCamera,
    attachImage,
    attachDocument,
  };
}
