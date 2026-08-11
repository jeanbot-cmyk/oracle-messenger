import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { AuthSession, Message } from '@/types/messenger';

type UseNativeMediaSyncLifecycleParams = {
  session: AuthSession | null;
  refreshLocalMediaIndex: () => Promise<void>;
  clearMediaRefreshTimers: () => void;
  runMediaSync: (activeToken: string, currentUserId?: string, knownMessages?: Message[]) => Promise<unknown>;
};

export function useNativeMediaSyncLifecycle({
  session,
  refreshLocalMediaIndex,
  clearMediaRefreshTimers,
  runMediaSync,
}: UseNativeMediaSyncLifecycleParams) {
  useEffect(() => {
    if (!session?.token) return;
    refreshLocalMediaIndex().catch(() => null);
    runMediaSync(session.token, session.user.id);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runMediaSync(session.token, session.user.id);
      }
    });
    return () => subscription.remove();
  }, [refreshLocalMediaIndex, runMediaSync, session?.token, session?.user.id]);

  useEffect(() => () => {
    clearMediaRefreshTimers();
  }, [clearMediaRefreshTimers]);
}
