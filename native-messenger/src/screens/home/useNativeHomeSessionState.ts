import { useState } from 'react';
import type { AuthSession } from '@/types/messenger';

export function useNativeHomeSessionState() {
  const [session, setSession] = useState<AuthSession | null>(null);

  return {
    session,
    setSession,
  };
}
