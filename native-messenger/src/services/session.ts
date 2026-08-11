import * as SecureStore from 'expo-secure-store';
import type { AuthSession } from '@/types/messenger';

const SESSION_KEY = 'oracle_native_session_v1';

export async function saveSession(session: AuthSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.token && parsed?.user?.id) return parsed as AuthSession;
  } catch {}
  return null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
