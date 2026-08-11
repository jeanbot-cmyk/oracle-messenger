import { useCallback, useRef, useState } from 'react';
import { readLocalGalleryItems, type LocalGalleryItem } from '@/services/localMedia';
import { syncPendingMedia, type MediaSyncResult } from '@/services/mediaSync';
import type { Message } from '@/types/messenger';

export function useNativeMediaSync() {
  const [localMediaByMessageId, setLocalMediaByMessageId] = useState<Record<string, LocalGalleryItem>>({});
  const mediaRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refreshLocalMediaIndex = useCallback(async () => {
    try {
      const items = await readLocalGalleryItems();
      setLocalMediaByMessageId(Object.fromEntries(items.map(item => [item.messageId, item])));
    } catch {
      setLocalMediaByMessageId({});
    }
  }, []);

  const clearMediaRefreshTimers = useCallback(() => {
    for (const timer of mediaRefreshTimersRef.current) clearTimeout(timer);
    mediaRefreshTimersRef.current = [];
  }, []);

  const scheduleMediaIndexRefreshes = useCallback((result?: MediaSyncResult | null) => {
    if (!result?.queuedNativeMessageIds.length) return;
    clearMediaRefreshTimers();
    mediaRefreshTimersRef.current = [1500, 5000, 12000, 30000].map(delay => (
      setTimeout(() => {
        refreshLocalMediaIndex().catch(() => null);
      }, delay)
    ));
  }, [clearMediaRefreshTimers, refreshLocalMediaIndex]);

  const runMediaSync = useCallback((activeToken: string, currentUserId?: string, knownMessages: Message[] = []) => (
    syncPendingMedia(activeToken, currentUserId, knownMessages)
      .then(result => {
        scheduleMediaIndexRefreshes(result);
        return result;
      })
      .finally(() => refreshLocalMediaIndex().catch(() => null))
      .catch(() => null)
  ), [refreshLocalMediaIndex, scheduleMediaIndexRefreshes]);

  return {
    localMediaByMessageId,
    refreshLocalMediaIndex,
    clearMediaRefreshTimers,
    runMediaSync,
  };
}
