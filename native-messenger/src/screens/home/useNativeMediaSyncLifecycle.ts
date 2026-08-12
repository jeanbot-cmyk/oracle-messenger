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
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const startupTimer = setTimeout(() => {
      runMediaSync(session.token, session.user.id);
    }, 900);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
          runMediaSync(session.token, session.user.id);
        }, 450);
      }
    });
    return () => {
      clearTimeout(startupTimer);
      if (resumeTimer) clearTimeout(resumeTimer);
      subscription.remove();
    };
  }, [refreshLocalMediaIndex, runMediaSync, session?.token, session?.user.id]);

  useEffect(() => () => {
    clearMediaRefreshTimers();
  }, [clearMediaRefreshTimers]);
}
