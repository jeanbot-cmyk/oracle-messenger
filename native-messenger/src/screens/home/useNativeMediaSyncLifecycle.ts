import { useEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';
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
    InteractionManager.runAfterInteractions(() => {
      refreshLocalMediaIndex().catch(() => null);
    });
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    let startupTask: { cancel: () => void } | null = null;
    const startupTimer = setTimeout(() => {
      startupTask = InteractionManager.runAfterInteractions(() => {
        if (AppState.currentState === 'active') {
          void runMediaSync(session.token, session.user.id).catch(() => null);
        }
      });
    }, 2500);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            void runMediaSync(session.token, session.user.id).catch(() => null);
          });
        }, 1200);
      }
    });
    return () => {
      clearTimeout(startupTimer);
      startupTask?.cancel();
      if (resumeTimer) clearTimeout(resumeTimer);
      subscription.remove();
    };
  }, [refreshLocalMediaIndex, runMediaSync, session?.token, session?.user.id]);

  useEffect(() => () => {
    clearMediaRefreshTimers();
  }, [clearMediaRefreshTimers]);
}
