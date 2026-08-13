import { api } from '@/services/api';
import { ensureMediaStoredLocally, isMediaMessage } from '@/services/localMedia';
import { enqueueNativeMediaDownload } from '@/services/nativeMediaWorker';
import type { Message } from '@/types/messenger';

let activeSync: Promise<MediaSyncResult> | null = null;
let rerunAfterActiveSync = false;
const queuedKnownMessages = new Map<string, Message>();

export type MediaSyncResult = {
  queuedNativeMessageIds: string[];
  savedMessageIds: string[];
  failedMessageIds: string[];
};

async function storeAndAck(message: Message, token: string, currentUserId?: string) {
  if (!isMediaMessage(message)) return;

  const saved = await ensureMediaStoredLocally(message);
  if (!saved) return;

  if (currentUserId && message.senderId === currentUserId) return;

  const ack = await api.ackMediaSaved(message.id, token, saved.checksum, saved.size);
  if (ack?.ackConfirmed === false) {
    throw new Error(`Confirmation média rejetée par le serveur pour ${message.id}`);
  }
}

function mergeResults(left: MediaSyncResult, right: MediaSyncResult): MediaSyncResult {
  return {
    queuedNativeMessageIds: [...new Set([...left.queuedNativeMessageIds, ...right.queuedNativeMessageIds])],
    savedMessageIds: [...new Set([...left.savedMessageIds, ...right.savedMessageIds])],
    failedMessageIds: [...new Set([...left.failedMessageIds, ...right.failedMessageIds])],
  };
}

export function syncPendingMedia(token: string, currentUserId?: string, knownMessages: Message[] = []): Promise<MediaSyncResult> {
  for (const message of knownMessages) {
    if (isMediaMessage(message)) queuedKnownMessages.set(message.id, message);
  }
  if (activeSync) {
    rerunAfterActiveSync = true;
    return activeSync;
  }

  activeSync = (async () => {
    const result: MediaSyncResult = {
      queuedNativeMessageIds: [],
      savedMessageIds: [],
      failedMessageIds: [],
    };
    const byId = new Map<string, Message>(queuedKnownMessages);
    queuedKnownMessages.clear();

    try {
      const pending = await api.pendingMedia(token);
      for (const message of pending) byId.set(message.id, message);
    } catch (error) {
      console.info('[MediaSync]', {
        event: 'pending-media-fetch-failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    for (const message of byId.values()) {
      try {
        const queuedNatively = await enqueueNativeMediaDownload(message, token, currentUserId);
        if (queuedNatively) {
          result.queuedNativeMessageIds.push(message.id);
          continue;
        }
        await storeAndAck(message, token, currentUserId);
        result.savedMessageIds.push(message.id);
      } catch (error) {
        result.failedMessageIds.push(message.id);
        console.info('[MediaSync]', {
          event: 'media-save-retry-needed',
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  })().finally(() => {
    activeSync = null;
  });

  return activeSync.then(async result => {
    if (!rerunAfterActiveSync && !queuedKnownMessages.size) return result;
    rerunAfterActiveSync = false;
    return mergeResults(result, await syncPendingMedia(token, currentUserId));
  });
}
