import { NativeModules, Platform } from 'react-native';
import { BACKEND_URL } from '@/config/env';
import { extractPayload, isMediaMessage, MEDIA_ROOT } from '@/services/localMedia';
import type { Message } from '@/types/messenger';

type OracleMediaDownloadModule = {
  enqueueMedia(
    messageId: string,
    url: string,
    token: string,
    backendUrl: string,
    checksum: string,
    size: number,
    type: string,
    mime: string,
    name: string,
    mediaRootUri: string,
  ): Promise<boolean>;
};

const nativeModule = NativeModules.OracleMediaDownload as OracleMediaDownloadModule | undefined;

export async function enqueueNativeMediaDownload(message: Message, token: string, currentUserId?: string) {
  if (Platform.OS !== 'android') return false;
  if (!nativeModule?.enqueueMedia) return false;
  if (!isMediaMessage(message)) return false;
  if (currentUserId && message.senderId === currentUserId) return false;

  const payload = extractPayload(message.content);
  if (!payload?.url) return false;

  return nativeModule.enqueueMedia(
    message.id,
    payload.url,
    token,
    BACKEND_URL,
    payload.checksum ?? '',
    payload.size ?? 0,
    String(message.type || ''),
    payload.mime ?? '',
    payload.name ?? '',
    MEDIA_ROOT,
  );
}
